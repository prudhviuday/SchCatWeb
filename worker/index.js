const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const USER_AGENT = "Mozilla/5.0 (compatible; SchCatWeb/1.0; +https://schcatweb.prudhvi123143.workers.dev/)";

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

function withMarketSmithAuth(url, env) {
  if (env.MARKETSMITH_AUTH) {
    url.searchParams.set("ms-auth", env.MARKETSMITH_AUTH);
  }
  return url;
}

async function marketSmithFinance(url, env) {
  const stockId = url.searchParams.get("stockId") || "";
  if (!validStockId(stockId)) return json({ error: "invalid_stock_id" }, 400);
  const target = new URL(
    `https://marketsmithindia.com/gateway/simple-api/ms-india/instr/0/${stockId}/financeDetails.json`
  );
  target.searchParams.set("isConsolidated", "false");
  withMarketSmithAuth(target, env);
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({ "referer": "https://marketsmithindia.com/" })
  }, 180);
}

async function marketSmithSymbol(url, env) {
  const stockId = url.searchParams.get("stockId") || "";
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!validStockId(stockId) || !validSymbol(symbol)) {
    return json({ error: "invalid_stock_id_or_symbol" }, 400);
  }
  const target = new URL(
    `https://msi-gcloud-prod.appspot.com/gateway/simple-api/ms-india/instr/0/${stockId}/symboldetails.json`
  );
  target.searchParams.set("s", url.searchParams.get("s") || "20190810");
  target.searchParams.set("e", url.searchParams.get("e") || "20250810");
  target.searchParams.set("text", symbol);
  target.searchParams.set("lang", "en");
  target.searchParams.set("isConsolidated", "0");
  withMarketSmithAuth(target, env);
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({ "referer": "https://marketsmithindia.com/" })
  }, 180);
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
    headers: upstreamHeaders({ "accept": "application/json" })
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
  return forwardJson(target.toString(), {
    headers: upstreamHeaders({
      "accept": "application/json,text/plain,*/*",
      "referer": "https://www.nseindia.com/"
    })
  }, 120);
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
      providers: ["yahoo", "marketsmith", "chartink", "nse"]
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
