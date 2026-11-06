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
  provider: "MarketSmith" | "ChartInk" | "NSE" | "Yahoo Finance";
  title: string;
  status: ProviderProbeStatus;
  message: string;
  httpStatus?: number;
  elapsedMs: number;
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

  return {
    id,
    provider,
    title,
    status,
    httpStatus: response.status,
    message,
    elapsedMs
  };
}

function jsonResult(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  attempt: FetchAttempt,
  summary: (data: unknown) => string
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

  return {
    id,
    provider,
    title,
    status: "success",
    httpStatus: response.status,
    message: summary(data),
    elapsedMs
  };
}

function probeMarketSmith(
  stockId: string,
  symbol: string,
  endpoint: "finance" | "symbol",
  authValue: string
): Promise<ProviderProbeResult> {
  const id = endpoint === "finance" ? "marketsmith-finance" : "marketsmith-symbol";
  const title = endpoint === "finance"
    ? "MarketSmith financeDetails via SchCatWeb Worker"
    : "MarketSmith symboldetails via SchCatWeb Worker";

  let url: string;
  try {
    url = endpoint === "finance"
      ? buildMarketSmithFinanceProxyUrl(stockId)
      : buildMarketSmithSymbolProxyUrl(stockId, symbol);
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
      if (!data || typeof data !== "object") {
        return "JSON response received, but the payload is not an object.";
      }
      const keys = Object.keys(data);
      return `Worker successfully read MarketSmith JSON. Top-level fields: ${keys.slice(0, 8).join(", ") || "(none)"}.`;
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
      if (!data || typeof data !== "object") {
        return "Worker received a response, but the payload is not an object.";
      }
      const rows = (data as { data?: unknown }).data;
      return Array.isArray(rows)
        ? `Server-side ChartInk session and scan succeeded (${rows.length} rows).`
        : "ChartInk returned JSON, but the expected data array is missing.";
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
    if (!data || typeof data !== "object") {
      return "Worker received JSON, but the payload is not an object.";
    }
    const rows = (data as { data?: unknown }).data;
    return Array.isArray(rows)
      ? `Worker successfully read ${rows.length} historical rows for RELIANCE (${from} to ${to}).`
      : "NSE returned JSON, but the expected data array is missing.";
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
      return typeof error === "string"
        ? `Worker reached Yahoo Finance, but Yahoo returned: ${error}`
        : "Worker received JSON, but the chart result array is empty.";
    }
    const first = asRecord(results[0]);
    const timestamps = first?.timestamp;
    return Array.isArray(timestamps)
      ? `Server-side Yahoo Finance request succeeded (${timestamps.length} timestamp slots).`
      : "Yahoo returned JSON, but timestamp data is missing.";
  });
}

export async function runProviderDiagnostics(
  options: ProviderAuditOptions
): Promise<ProviderProbeResult[]> {
  const [finance, symbol, chartInk, nse, yahoo] = await Promise.all([
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "finance", options.marketSmithAuth || ""),
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "symbol", options.marketSmithAuth || ""),
    probeChartInk(),
    probeNse(),
    probeYahooFinance()
  ]);
  return [finance, symbol, chartInk, nse, yahoo];
}
