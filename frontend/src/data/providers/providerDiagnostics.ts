import { buildYahooProxyUrl } from "./chartData.js";

export type ProviderProbeStatus =
  | "success"
  | "http-error"
  | "auth-or-policy"
  | "configuration-required"
  | "browser-blocked"
  | "timeout"
  | "invalid-response";

export interface ProviderProbeResult {
  id: string;
  provider: "SchCatWeb API" | "MarketSmith" | "ChartInk" | "NSE" | "Yahoo Finance";
  title: string;
  status: ProviderProbeStatus;
  message: string;
  httpStatus?: number;
  upstreamStatus?: number;
  elapsedMs: number;
}

interface ProbeSummary {
  status: "success" | "invalid-response";
  message: string;
}

function validSummary(message: string): ProbeSummary {
  return { status: "success", message };
}

function invalidSummary(message: string): ProbeSummary {
  return { status: "invalid-response", message };
}

export interface ProviderAuditOptions {
  marketSmithStockId: string;
  marketSmithSymbol: string;
  marketSmithAuth?: string;
}

interface FetchBody {
  response: Response;
  body: string;
  elapsedMs: number;
}

type FetchAttempt =
  | { ok: true; value: FetchBody }
  | { ok: false; result: ProviderProbeResult };

const REQUEST_TIMEOUT_MS = 15_000;
export const MARKETSMITH_AUTH_STORAGE_KEY = "schcatweb.marketsmith.auth.v1";

export function normalizeMarketSmithAuthInput(value: string): string {
  const input = value.trim();
  if (!input) return "";
  const marker = input.indexOf("ms-auth=");
  if (marker >= 0) {
    const raw = input.slice(marker + "ms-auth=".length).split(/[&#]/, 1)[0];
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch {
      return raw.replace(/\+/g, " ");
    }
  }
  return input;
}

export function readStoredMarketSmithAuth(): string {
  try {
    return typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(MARKETSMITH_AUTH_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveStoredMarketSmithAuth(value: string): string {
  const normalized = normalizeMarketSmithAuthInput(value);
  if (!normalized) throw new Error("Enter a MarketSmith ms-auth value or paste its working URL.");
  if (typeof window === "undefined") throw new Error("Browser storage is unavailable.");
  window.localStorage.setItem(MARKETSMITH_AUTH_STORAGE_KEY, normalized);
  return normalized;
}

export function clearStoredMarketSmithAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MARKETSMITH_AUTH_STORAGE_KEY);
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function apiUrl(path: string): string {
  return path;
}

/**
 * These request builders preserve the source API paths for reference/tests.
 * Live diagnostics intentionally call the same-origin Worker routes below.
 */
export function buildMarketSmithFinanceDetailsUrl(stockId: string): string {
  const safeId = stockId.trim();
  if (!/^\d+$/.test(safeId)) {
    throw new TypeError("MarketSmith stock ID must contain digits only");
  }

  const url = new URL(
    `https://marketsmithindia.com/gateway/simple-api/ms-india/instr/0/${safeId}/financeDetails.json`
  );
  url.searchParams.set("isConsolidated", "false");
  return url.toString();
}

export function buildMarketSmithSymbolDetailsUrl(
  stockId: string,
  symbol: string
): string {
  const safeId = stockId.trim();
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^\d+$/.test(safeId)) {
    throw new TypeError("MarketSmith stock ID must contain digits only");
  }
  if (!/^[A-Z0-9._-]+$/.test(safeSymbol)) {
    throw new TypeError("MarketSmith symbol contains unsupported characters");
  }

  const url = new URL(
    `https://marketsmithindia.com/gateway/simple-api/ms-india/instr/0/${safeId}/symboldetails.json`
  );
  // Example window from the current working MarketSmith request shared by
  // the user. Production requests use the Worker-generated rolling 5-year range.
  url.searchParams.set("s", "20211106");
  url.searchParams.set("e", "20261106");
  url.searchParams.set("text", safeSymbol);
  url.searchParams.set("lang", "en");
  url.searchParams.set("isConsolidated", "1");
  return url.toString();
}

export function buildMarketSmithFinanceProxyUrl(stockId: string): string {
  const safeId = stockId.trim();
  if (!/^\d+$/.test(safeId)) {
    throw new TypeError("MarketSmith stock ID must contain digits only");
  }
  return apiUrl(`/api/marketsmith/finance?stockId=${encodeURIComponent(safeId)}`);
}

export function buildMarketSmithRelativeStrengthProxyUrl(
  stockId: string,
  symbol: string
): string {
  const safeId = stockId.trim();
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^\d+$/.test(safeId)) throw new TypeError("MarketSmith stock ID must contain digits only");
  if (!/^[A-Z0-9&._-]+$/.test(safeSymbol)) throw new TypeError("MarketSmith symbol contains unsupported characters");
  const params = new URLSearchParams({ stockId: safeId, symbol: safeSymbol });
  return apiUrl(`/api/marketsmith/relative-strength?${params.toString()}`);
}

export function buildMarketSmithSymbolProxyUrl(
  stockId: string,
  symbol: string
): string {
  const safeId = stockId.trim();
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^\d+$/.test(safeId)) {
    throw new TypeError("MarketSmith stock ID must contain digits only");
  }
  if (!/^[A-Z0-9._-]+$/.test(safeSymbol)) {
    throw new TypeError("MarketSmith symbol contains unsupported characters");
  }
  const params = new URLSearchParams({ stockId: safeId, symbol: safeSymbol });
  return apiUrl(`/api/marketsmith/symbol?${params.toString()}`);
}

export function buildNseDeliveryUrl(
  symbol: string,
  fromDate: string,
  toDate: string
): string {
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&._-]+$/.test(safeSymbol)) {
    throw new TypeError("NSE symbol contains unsupported characters");
  }

  const url = new URL(
    "https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData"
  );
  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);
  url.searchParams.set("symbol", safeSymbol);
  url.searchParams.set("type", "priceVolumeDeliverable");
  url.searchParams.set("series", "ALL");
  return url.toString();
}

export function buildNseDeliveryProxyUrl(
  symbol: string,
  fromDate: string,
  toDate: string
): string {
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&._-]+$/.test(safeSymbol)) {
    throw new TypeError("NSE symbol contains unsupported characters");
  }
  const params = new URLSearchParams({
    symbol: safeSymbol,
    from: fromDate,
    to: toDate
  });
  return apiUrl(`/api/nse/delivery?${params.toString()}`);
}

export function extractCsrfToken(html: string): string | null {
  const meta = html.match(
    /<meta\b[^>]*\bname\s*=\s*["']csrf-token["'][^>]*>/i
  )?.[0];
  if (!meta) return null;
  return meta.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
}

function formatNseDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

/** Match the legacy Python utility's 300-calendar-day NSE delivery request. */
function recentNseWindow(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 300);
  return {
    from: formatNseDate(from),
    to: formatNseDate(today)
  };
}

async function requestText(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  url: string,
  init: RequestInit = {}
): Promise<FetchAttempt> {
  const startedAt = now();
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...init,
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "follow",
      signal: controller.signal
    });
    const body = await response.text();
    return {
      ok: true,
      value: {
        response,
        body,
        elapsedMs: Math.round(now() - startedAt)
      }
    };
  } catch (error) {
    const elapsedMs = Math.round(now() - startedAt);
    const isTimeout =
      error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      result: {
        id,
        provider,
        title,
        status: isTimeout ? "timeout" : "browser-blocked",
        message: isTimeout
          ? "The SchCatWeb Worker API did not respond within 15 seconds."
          : "The browser could not reach SchCatWeb's same-origin Worker API. Check the site deployment, /api routes, and network.",
        elapsedMs
      }
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function parseBody(body: string): unknown | null {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function providerErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    const error = typeof record.error === "string" ? record.error : "";
    const upstream = typeof record.upstreamStatus === "number"
      ? ` (upstream HTTP ${record.upstreamStatus})`
      : "";
    if (message) return `${message}${upstream}`;
    if (error) return `${error}${upstream}`;
  }
  return fallback;
}

function httpFailure(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  response: Response,
  body: string,
  elapsedMs: number
): ProviderProbeResult {
  const data = parseBody(body);
  const dataError = data && typeof data === "object"
    ? (data as Record<string, unknown>).error
    : undefined;
  const status = dataError === "marketsmith_auth_not_configured"
    ? "configuration-required"
    : response.status === 401 || response.status === 403
      ? "auth-or-policy"
      : "http-error";

  const fallback = response.status === 401
    ? "The upstream provider requires authentication or rejected the configured session."
    : response.status === 403
      ? "The upstream provider denied access. Check the provider session, entitlement, and request policy."
      : `The SchCatWeb Worker returned HTTP ${response.status} while contacting the provider.`;

  const message = dataError === "marketsmith_auth_not_configured"
    ? "No MarketSmith ms-auth value reached the Worker. Enter it in the diagnostics page and save it in this browser."
    : providerErrorMessage(data, fallback);

  const rawUpstreamStatus = Number(response.headers.get("x-schcat-upstream-status"));
  return {
    id,
    provider,
    title,
    status,
    httpStatus: response.status,
    ...(Number.isInteger(rawUpstreamStatus) && rawUpstreamStatus >= 100 && rawUpstreamStatus <= 599
      ? { upstreamStatus: rawUpstreamStatus }
      : {}),
    message,
    elapsedMs
  };
}

function jsonResult(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  attempt: FetchAttempt,
  summary: (data: unknown) => ProbeSummary
): ProviderProbeResult {
  if (!attempt.ok) return attempt.result;
  const { response, body, elapsedMs } = attempt.value;
  if (!response.ok) {
    return httpFailure(id, provider, title, response, body, elapsedMs);
  }

  const data = parseBody(body);
  if (data === null) {
    return {
      id,
      provider,
      title,
      status: "invalid-response",
      httpStatus: response.status,
      message: "The Worker returned a response that was not valid JSON.",
      elapsedMs
    };
  }

  const result = summary(data);
  return {
    id,
    provider,
    title,
    status: result.status,
    httpStatus: response.status,
    message: result.message,
    elapsedMs
  };
}

function probeMarketSmith(
  stockId: string,
  symbol: string,
  endpoint: "finance" | "symbol" | "relative-strength",
  authValue: string
): Promise<ProviderProbeResult> {
  const id = endpoint === "finance" ? "marketsmith-finance" : endpoint === "symbol" ? "marketsmith-symbol" : "marketsmith-relative-strength";
  const title = endpoint === "finance"
    ? "MarketSmith financeDetails via SchCatWeb Worker"
    : endpoint === "symbol"
      ? "MarketSmith symboldetails via SchCatWeb Worker"
      : "MarketSmith relative-strength history via SchCatWeb Worker";

  let url: string;
  try {
    url = endpoint === "finance"
      ? buildMarketSmithFinanceProxyUrl(stockId)
      : endpoint === "symbol"
        ? buildMarketSmithSymbolProxyUrl(stockId, symbol)
        : buildMarketSmithRelativeStrengthProxyUrl(stockId, symbol);
  } catch (error) {
    return Promise.resolve({
      id,
      provider: "MarketSmith",
      title,
      status: "invalid-response",
      message: error instanceof Error ? error.message : "Invalid test input.",
      elapsedMs: 0
    });
  }

  if (!authValue.trim()) {
    return Promise.resolve({
      id,
      provider: "MarketSmith",
      title,
      status: "configuration-required",
      message: "Enter the current MarketSmith ms-auth value above and save it in this browser.",
      elapsedMs: 0
    });
  }

  return requestText(id, "MarketSmith", title, url, {
    headers: { "x-marketsmith-auth": authValue }
  }).then((attempt) =>
    jsonResult(id, "MarketSmith", title, attempt, (data) => {
      const root = asRecord(data);
      if (endpoint === "finance") {
        if (!Array.isArray(root?.ratiosAnnualData)) return invalidSummary("MarketSmith finance JSON is missing the ratiosAnnualData array.");
        return validSummary(`Finance endpoint returned a valid ratiosAnnualData array (${root.ratiosAnnualData.length} annual rows).`);
      }
      if (endpoint === "symbol") {
        if (!asRecord(root?.response)) return invalidSummary("MarketSmith symbol JSON is missing the response object.");
        return validSummary("MarketSmith symbol-details response object received.");
      }
      const prices = asRecord(root?.chart)?.prices;
      if (!Array.isArray(prices)) return invalidSummary("MarketSmith RS JSON is missing chart.prices.");
      const usable = prices.filter((raw) => {
        const value = asRecord(raw)?.rlst;
        return (typeof value === "number" && Number.isFinite(value))
          || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
      }).length;
      return usable > 0
        ? validSummary(`MarketSmith RS history returned ${usable} usable observations.`)
        : invalidSummary("MarketSmith returned no usable relative-strength observations.");
    })
  );
}

async function probeChartInk(): Promise<ProviderProbeResult> {
  const title = "ChartInk CSRF session + scan via SchCatWeb Worker";
  const attempt = await requestText(
    "chartink-worker-scan",
    "ChartInk",
    title,
    "/api/chartink/scan",
    {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        mode: "scan",
        query: "( {cash} ( latest close > 0 ) )"
      })
    }
  );

  return jsonResult(
    "chartink-worker-scan",
    "ChartInk",
    title,
    attempt,
    (data) => {
      const rows = asRecord(data)?.data;
      return Array.isArray(rows)
        ? validSummary(`Server-side ChartInk session and scan succeeded (${rows.length} rows).`)
        : invalidSummary("ChartInk returned JSON, but the expected data array is missing.");
    }
  );
}

async function probeNse(): Promise<ProviderProbeResult> {
  const title = "NSE historical delivery via SchCatWeb Worker";
  const { from, to } = recentNseWindow();
  let url: string;
  try {
    url = buildNseDeliveryProxyUrl("RELIANCE", from, to);
  } catch (error) {
    return {
      id: "nse-delivery",
      provider: "NSE",
      title,
      status: "invalid-response",
      message: error instanceof Error ? error.message : "Invalid NSE test input.",
      elapsedMs: 0
    };
  }
  const attempt = await requestText(
    "nse-delivery",
    "NSE",
    title,
    url,
    { headers: { Accept: "application/json" } }
  );
  return jsonResult("nse-delivery", "NSE", title, attempt, (data) => {
    const rows = asRecord(data)?.data;
    if (!Array.isArray(rows)) return invalidSummary("NSE returned JSON, but the expected data array is missing.");
    return validSummary(rows.length > 0
      ? `Worker read ${rows.length} historical rows for RELIANCE (${from} to ${to}).`
      : `NSE endpoint returned a valid empty data array for RELIANCE (${from} to ${to}); the requested window may have no usable observations.`);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

async function probeYahooFinance(): Promise<ProviderProbeResult> {
  const title = "Yahoo Finance chart via SchCatWeb Worker (RELIANCE, 5-day sample)";
  const url = buildYahooProxyUrl("RELIANCE", "1D", { range: "5d" });
  const attempt = await requestText(
    "yahoo-chart",
    "Yahoo Finance",
    title,
    url,
    { headers: { Accept: "application/json" } }
  );

  return jsonResult("yahoo-chart", "Yahoo Finance", title, attempt, (data) => {
    const chart = asRecord(asRecord(data)?.chart);
    const results = chart?.result;
    if (!Array.isArray(results) || results.length === 0) {
      const error = asRecord(chart?.error)?.description;
      return invalidSummary(typeof error === "string" ? `Yahoo Finance returned: ${error}` : "Yahoo response is missing its chart result array.");
    }
    const first = asRecord(results[0]);
    const timestamps = first?.timestamp;
    const quotes = asRecord(first?.indicators)?.quote;
    const quote = Array.isArray(quotes) ? asRecord(quotes[0]) : null;
    const fields = ["open", "high", "low", "close", "volume"];
    if (!Array.isArray(timestamps) || timestamps.length === 0 || !quote || fields.some((field) => !Array.isArray(quote[field]))) {
      return invalidSummary("Yahoo response is missing timestamps or one or more OHLCV arrays.");
    }
    const usable = timestamps.filter((time, index) =>
      typeof time === "number" && Number.isFinite(time)
      && ["open", "high", "low", "close"].every((field) => {
        const values = quote[field] as unknown[];
        return typeof values[index] === "number" && Number.isFinite(values[index]);
      })
    ).length;
    return usable > 0
      ? validSummary(`Yahoo Finance returned ${usable} usable OHLCV candles.`)
      : invalidSummary("Yahoo returned OHLCV arrays but no usable candle could be assembled.");
  });
}

async function probeWorkerHealth(): Promise<ProviderProbeResult> {
  const id = "schcatweb-api-health";
  const title = "SchCatWeb Worker health and route inventory";
  const attempt = await requestText(id, "SchCatWeb API", title, "/api/health", { headers: { Accept: "application/json" } });
  return jsonResult(id, "SchCatWeb API", title, attempt, (data) => {
    const health = asRecord(data);
    const routes = Array.isArray(health?.routes) ? health.routes.filter((route): route is string => typeof route === "string") : [];
    const required = [
      "GET /api/yahoo/chart", "GET /api/marketsmith/finance", "GET /api/marketsmith/symbol",
      "GET /api/marketsmith/relative-strength", "POST /api/chartink/scan", "GET /api/nse/delivery"
    ];
    const missing = required.filter((route) => !routes.includes(route));
    if (health?.ok !== true || health?.service !== "schcatweb-api") return invalidSummary("Health response is missing the expected SchCatWeb API service identity.");
    if (missing.length) return invalidSummary(`Worker is online, but its route inventory is missing: ${missing.join(", ")}.`);
    const version = typeof health.version === "string" ? health.version : "unknown";
    return validSummary(`Worker API v${version} is online and lists all ${required.length} required provider routes. MarketSmith Worker secret: ${health.marketSmithAuthConfigured === true ? "configured" : "not configured (browser-local session remains supported)"}.`);
  });
}

export async function runProviderDiagnostics(
  options: ProviderAuditOptions
): Promise<ProviderProbeResult[]> {
  const [health, finance, symbol, relativeStrength, chartInk, nse, yahoo] = await Promise.all([
    probeWorkerHealth(),
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "finance", options.marketSmithAuth || ""),
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "symbol", options.marketSmithAuth || ""),
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "relative-strength", options.marketSmithAuth || ""),
    probeChartInk(),
    probeNse(),
    probeYahooFinance()
  ]);
  return [health, finance, symbol, relativeStrength, chartInk, nse, yahoo];
}
