const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function validSymbol(value) {
  return typeof value === "string" && /^[A-Z0-9&._-]{1,30}$/.test(value);
}

function validStockId(value) {
  return typeof value === "string" && /^\d{1,12}$/.test(value);
}

function validDate(value) {
  return typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value);
}

function upstreamHeaders(extra = {}) {
  return {
    "accept": "application/json,text/plain,*/*",
    "user-agent": USER_AGENT,
    ...extra
  };
}

async function upstreamFetch(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, {
      ...init,
      redirect: init.redirect || "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function forwardJson(url, init = {}, cacheSeconds = 0) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(url, { method: "GET" });
  if (cache && cacheSeconds > 0) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {
      // Cache failures must never prevent a live provider request.
    }
  }

  let response;
  try {
    response = await upstreamFetch(url, init);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({
      error: timedOut ? "upstream_timeout" : "upstream_network_error",
      message: timedOut
        ? "The provider did not respond within 12 seconds."
        : "The Worker could not connect to the provider.",
      providerMessage: error instanceof Error ? error.message : "Unknown network error"
    }, 502);
  }

  const body = await response.text();
  const headers = new Headers({
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": cacheSeconds > 0 && response.ok
      ? `public, max-age=${cacheSeconds}`
      : "no-store",
    "x-schcat-upstream-status": String(response.status)
  });
  const output = new Response(body, { status: response.status, headers });
  if (cache && cacheSeconds > 0 && response.ok) {
    try {
      await cache.put(cacheKey, output.clone());
    } catch {
      // A cache write failure does not change the provider response.
    }
  }
  return output;
}

function compactUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function defaultMarketSmithDateRange(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  return {
    start: compactUtcDate(start),
    end: compactUtcDate(end)
  };
}

function validMarketSmithDate(value) {
  return typeof value === "string" && /^\\d{8}$/.test(value);
}

function withMarketSmithAuth(url, env, endpoint) {
  const configured = endpoint === "finance"
    ? (env.MARKETSMITH_FINANCE_AUTH || env.MARKETSMITH_AUTH)
    : (env.MARKETSMITH_SYMBOL_AUTH || env.MARKETSMITH_AUTH);
  if (typeof configured !== "string" || !configured.trim()) return false;

  // A raw URL copied from DevTools may display spaces as '+'. Store the decoded
  // ms-auth value as a Worker secret; never place it in browser JavaScript.
  const authValue = configured.trim().replace(/\+/g, " ");
  url.searchParams.set("ms-auth", authValue);
  return true;
}

async function marketSmithFinance(url, env) {
  const stockId = url.searchParams.get("stockId") || "";
  if (!validStockId(stockId)) return json({ error: "invalid_stock_id" }, 400);
  const target = new URL(
    `https://marketsmithindia.com/gateway/simple-api/ms-india/instr/0/${stockId}/financeDetails.json`
  );
  target.searchParams.set("isConsolidated", "false");
  if (!withMarketSmithAuth(target, env, "finance")) {
    return json({
      error: "marketsmith_auth_not_configured",
      message: "Set the Cloudflare Worker secret MARKETSMITH_FINANCE_AUTH (or MARKETSMITH_AUTH) to a currently valid MarketSmith ms-auth value."
    }, 503);
  }
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({
      "accept": "application/json,text/plain,*/*",
      "referer": "https://marketsmithindia.com/"
    })
  }, 0);
}

async function marketSmithSymbol(url, env) {
  const stockId = url.searchParams.get("stockId") || "";
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!validStockId(stockId) || !validSymbol(symbol)) {
    return json({ error: "invalid_stock_id_or_symbol" }, 400);
  }
  // Match the currently working MarketSmith India URL supplied for RVNL:
  // marketsmithindia.com/.../symboldetails.json?s=YYYYMMDD&e=YYYYMMDD
  // The default window rolls forward and always covers five years.
  const dateRange = defaultMarketSmithDateRange();
  const startDate = url.searchParams.get("s") || dateRange.start;
  const endDate = url.searchParams.get("e") || dateRange.end;
  if (!validMarketSmithDate(startDate) || !validMarketSmithDate(endDate) || startDate > endDate) {
    return json({ error: "invalid_marketsmith_date_range" }, 400);
  }

  const target = new URL(
    `https://marketsmithindia.com/gateway/simple-api/ms-india/instr/0/${stockId}/symboldetails.json`
  );
  target.searchParams.set("s", startDate);
  target.searchParams.set("e", endDate);
  target.searchParams.set("text", symbol);
  target.searchParams.set("lang", "en");
  target.searchParams.set("isConsolidated", "1");
  if (!withMarketSmithAuth(target, env, "symbol")) {
    return json({
      error: "marketsmith_auth_not_configured",
      message: "Set the Cloudflare Worker secret MARKETSMITH_SYMBOL_AUTH (or MARKETSMITH_AUTH) to a currently valid MarketSmith ms-auth value."
    }, 503);
  }
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({
      "accept": "application/json,text/plain,*/*",
      "referer": "https://marketsmithindia.com/"
    })
  }, 0);
}

async function yahooChart(url) {
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = url.searchParams.get("interval") || "1d";
  const range = url.searchParams.get("range") || "2y";
  const intervals = new Set(["1wk", "1d", "1h", "5m"]);
  const ranges = new Set(["5d", "1mo", "6mo", "2y", "5y"]);
  if (!validSymbol(symbol) || !intervals.has(interval) || !ranges.has(range)) {
    return json({ error: "invalid_chart_request" }, 400);
  }
  const yahooSymbol = /\.(NS|BO)$/.test(symbol) ? symbol : `${symbol}.NS`;
  const target = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`
  );
  target.searchParams.set("range", range);
  target.searchParams.set("interval", interval);
  target.searchParams.set("events", "div,splits");
  target.searchParams.set("includeAdjustedClose", "true");
  const ttl = interval === "5m" ? 20 : 90;
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({
      "accept": "application/json",
      "referer": "https://finance.yahoo.com/"
    })
  }, ttl);
}

async function nseDelivery(url) {
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!validSymbol(symbol) || !validDate(from) || !validDate(to)) {
    return json({ error: "invalid_nse_request" }, 400);
  }
  const target = new URL(
    "https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData"
  );
  target.searchParams.set("from", from);
  target.searchParams.set("to", to);
  target.searchParams.set("symbol", symbol);
  target.searchParams.set("type", "priceVolumeDeliverable");
  target.searchParams.set("series", "ALL");
  const headers = upstreamHeaders({
    "accept": "application/json,text/plain,*/*",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://www.nseindia.com/"
  });

  // NSE commonly establishes an anonymous browser session on its home page
  // before serving JSON. Keep that cookie exchange inside the Worker.
  try {
    const bootstrap = await upstreamFetch("https://www.nseindia.com/", {
      headers
    });
    const cookies = extractCookies(bootstrap.headers);
    if (cookies) headers.cookie = cookies;
    await bootstrap.arrayBuffer();
  } catch {
    // Match the legacy requests.get behaviour as a fallback when NSE's
    // homepage/bootstrap is unavailable from the Worker network.
  }

  return forwardJson(target.toString(), { headers }, 120);
}

function extractCsrf(html) {
  const tag = html.match(/<meta\b[^>]*\bname\s*=\s*["']csrf-token["'][^>]*>/i)?.[0];
  return tag?.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] || null;
}

function extractCookies(headers) {
  const setCookie = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") || ""];
  return setCookie
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function chartInkScan(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json_body" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return json({ error: "invalid_chartink_request" }, 400);
  }
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const mode = input.mode || "scan";
  if (!query || query.length > 20000 || !["scan", "history", "widget"].includes(mode)) {
    return json({ error: "invalid_chartink_request" }, 400);
  }

  const bootstrapUrl = "https://chartink.com/screener/process";
  let bootstrap;
  try {
    bootstrap = await upstreamFetch(bootstrapUrl, {
      headers: upstreamHeaders({
        "accept": "text/html,application/xhtml+xml",
        "referer": "https://chartink.com/screener/"
      })
    });
  } catch (error) {
    return json({
      error: "chartink_bootstrap_failed",
      message: error instanceof Error ? error.message : "Network error"
    }, 502);
  }
  if (!bootstrap.ok) {
    return json({ error: "chartink_bootstrap_http_error", upstreamStatus: bootstrap.status }, 502);
  }

  const html = await bootstrap.text();
  const csrf = extractCsrf(html);
  if (!csrf) return json({ error: "chartink_csrf_token_missing" }, 502);

  const endpoint = mode === "history"
    ? "https://chartink.com/backtest/process"
    : mode === "widget"
      ? "https://chartink.com/widget/process"
      : "https://chartink.com/screener/process";

  const form = mode === "widget"
    ? new URLSearchParams({
        query,
        use_live: input.use_live === false ? "0" : "1",
        limit: String(Math.min(Math.max(Number(input.limit) || 6, 1), 20)),
        size: String(Math.min(Math.max(Number(input.size) || 375, 100), 1000))
      })
    : new URLSearchParams({ scan_clause: query });

  let result;
  try {
    result = await upstreamFetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: upstreamHeaders({
        "accept": "application/json,text/plain,*/*",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-csrf-token": csrf,
        "origin": "https://chartink.com",
        "referer": "https://chartink.com/screener/",
        "cookie": extractCookies(bootstrap.headers)
      }),
      body: form.toString()
    });
  } catch (error) {
    return json({
      error: "chartink_scan_failed",
      message: error instanceof Error ? error.message : "Network error"
    }, 502);
  }

  const body = await result.text();
  return new Response(body, {
    status: result.status,
    headers: {
      "content-type": result.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-schcat-upstream-status": String(result.status)
    }
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "schcatweb-api",
      version: "1",
      providers: ["yahoo", "marketsmith", "chartink", "nse"],
      marketSmithAuthConfigured: Boolean(
        env.MARKETSMITH_AUTH ||
        env.MARKETSMITH_FINANCE_AUTH ||
        env.MARKETSMITH_SYMBOL_AUTH
      )
    });
  }

  if (request.method === "GET" && url.pathname === "/api/yahoo/chart") {
    return yahooChart(url);
  }
  if (request.method === "GET" && url.pathname === "/api/marketsmith/finance") {
    return marketSmithFinance(url, env);
  }
  if (request.method === "GET" && url.pathname === "/api/marketsmith/symbol") {
    return marketSmithSymbol(url, env);
  }
  if (request.method === "GET" && url.pathname === "/api/nse/delivery") {
    return nseDelivery(url);
  }
  if (request.method === "POST" && url.pathname === "/api/chartink/scan") {
    return chartInkScan(request);
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/")) {
    return json({ error: "api_route_not_found" }, 404);
  }
  if (request.method !== "GET" && url.pathname.startsWith("/api/")) {
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const response = await handleApi(request, env);
      return response || json({ error: "api_route_not_found" }, 404);
    }
    return env.ASSETS.fetch(request);
  }
};
