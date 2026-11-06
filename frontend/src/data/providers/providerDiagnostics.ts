import { buildYahooChartUrl } from "./chartData.js";

export type ProviderProbeStatus =
  | "success"
  | "http-error"
  | "auth-or-policy"
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
}

interface FetchBody {
  response: Response;
  body: string;
  elapsedMs: number;
}

type FetchAttempt =
  | { ok: true; value: FetchBody }
  | { ok: false; result: ProviderProbeResult };

const REQUEST_TIMEOUT_MS = 12_000;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

async function requestText(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  url: string,
  init: RequestInit = {},
  fetchOptions: Pick<RequestInit, "mode" | "credentials"> = {}
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
      mode: fetchOptions.mode ?? "same-origin",
      credentials: fetchOptions.credentials ?? init.credentials ?? "same-origin",
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
          ? "The provider did not respond within 12 seconds."
          : fetchOptions.mode === "cors"
            ? "The browser could not read the provider response. The provider may not allow cross-origin browser access (CORS), or the network may have blocked it."
            : "The SchCatWeb API request failed before returning a response. Check the Worker deployment and API diagnostics.",
        elapsedMs
      }
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function httpFailure(
  id: string,
  provider: ProviderProbeResult["provider"],
  title: string,
  response: Response,
  elapsedMs: number
): ProviderProbeResult {
  const status = response.status === 401 || response.status === 403
    ? "auth-or-policy"
    : "http-error";

  return {
    id,
    provider,
    title,
    status,
    httpStatus: response.status,
    message: response.status === 401
      ? "Provider returned 401. Authentication is required or the session was not accepted."
      : response.status === 403
        ? "Provider returned 403. Access may be restricted by authentication, anti-bot policy, or origin policy."
        : "Provider returned an HTTP error. The request reached the provider, but the response was not successful.",
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
    return httpFailure(id, provider, title, response, elapsedMs);
  }

  try {
    const data: unknown = JSON.parse(body);
    return {
      id,
      provider,
      title,
      status: "success",
      httpStatus: response.status,
      message: summary(data),
      elapsedMs
    };
  } catch {
    return {
      id,
      provider,
      title,
      status: "invalid-response",
      httpStatus: response.status,
      message: "The browser could read the response, but it was not valid JSON.",
      elapsedMs
    };
  }
}

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
    `https://msi-gcloud-prod.appspot.com/gateway/simple-api/ms-india/instr/0/${safeId}/symboldetails.json`
  );
  // Preserve the legacy request's historical window and consolidation flag.
  url.searchParams.set("s", "20190810");
  url.searchParams.set("e", "20250810");
  url.searchParams.set("text", safeSymbol);
  url.searchParams.set("lang", "en");
  url.searchParams.set("isConsolidated", "0");
  // Deliberately do not copy the legacy hard-coded ms-auth query values into
  // public frontend code. They are session-like values, not public API keys.
  return url.toString();
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

function recentNseWindow(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 10);
  return {
    from: formatNseDate(from),
    to: formatNseDate(today)
  };
}

async function probeMarketSmith(
  stockId: string,
  symbol: string,
  endpoint: "finance" | "symbol"
): Promise<ProviderProbeResult> {
  const id = endpoint === "finance" ? "marketsmith-finance" : "marketsmith-symbol";
  const title = endpoint === "finance"
    ? "MarketSmith financeDetails endpoint"
    : "MarketSmith symboldetails endpoint";
  let url: string;
  try {
    url = endpoint === "finance"
      ? buildMarketSmithFinanceDetailsUrl(stockId)
      : buildMarketSmithSymbolDetailsUrl(stockId, symbol);
  } catch (error) {
    return {
      id,
      provider: "MarketSmith",
      title,
      status: "invalid-response",
      message: error instanceof Error ? error.message : "Invalid test input.",
      elapsedMs: 0
    };
  }

  const attempt = await requestText(
    id,
    "MarketSmith",
    title,
    url,
    { headers: { Accept: "application/json" } },
    { mode: "cors", credentials: "include" }
  );

  return jsonResult(id, "MarketSmith", title, attempt, (data) => {
    if (!data || typeof data !== "object") {
      return "JSON response received, but the payload is not an object.";
    }
    const keys = Object.keys(data);
    return `JSON response readable. Top-level fields: ${keys.slice(0, 8).join(", ") || "(none)"}.`;
  });
}

async function probeChartInk(): Promise<ProviderProbeResult[]> {
  const provider = "ChartInk" as const;
  const title = "ChartInk server-side CSRF session + scan POST";
  const attempt = await requestText(
    "chartink-scan-post",
    provider,
    title,
    "/api/chartink/scan",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "scan",
        query: "( {cash} ( latest close > 0 ) )"
      })
    }
  );

  if (!attempt.ok) return [attempt.result];
  const { response, body, elapsedMs } = attempt.value;
  if (!response.ok) {
    return [httpFailure("chartink-scan-post", provider, title, response, elapsedMs)];
  }
  try {
    const data: unknown = JSON.parse(body);
    const rows =
      data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)
        ? (data as { data: unknown[] }).data.length
        : null;
    return [{
      id: "chartink-scan-post",
      provider,
      title,
      status: rows === null ? "invalid-response" : "success",
      httpStatus: response.status,
      message: rows === null
        ? "Worker reached ChartInk, but the scan response did not contain the expected data array."
        : `Worker completed the ChartInk CSRF + scan flow (${rows} rows).`,
      elapsedMs
    }];
  } catch {
    return [{
      id: "chartink-scan-post",
      provider,
      title,
      status: "invalid-response",
      httpStatus: response.status,
      message: "Worker returned a response that was not valid JSON.",
      elapsedMs
    }];
  }
}

async function probeNse(): Promise<ProviderProbeResult> {
  const title = "NSE historical delivery API (direct browser request)";
  const { from, to } = recentNseWindow();
  buildNseDeliveryUrl("RELIANCE", from, to);
  const url = buildNseDeliveryUrl("RELIANCE", from, to);
  const attempt = await requestText(
    "nse-delivery",
    "NSE",
    title,
    url,
    { headers: { Accept: "application/json" } },
    { mode: "cors", credentials: "include" }
  );

  return jsonResult("nse-delivery", "NSE", title, attempt, (data) => {
    if (!data || typeof data !== "object") {
      return "JSON response received, but the payload is not an object.";
    }
    const rows = (data as { data?: unknown }).data;
    return Array.isArray(rows)
      ? `JSON response readable. ${rows.length} historical rows returned for RELIANCE (${from} to ${to}).`
      : "JSON response readable, but the expected data array is missing.";
  });
}


function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

async function probeYahooFinance(): Promise<ProviderProbeResult> {
  const title = "Yahoo Finance chart endpoint (direct browser request; RELIANCE, 5-day daily sample)";
  const url = buildYahooChartUrl("RELIANCE", "1D", { range: "5d" });
  const attempt = await requestText(
    "yahoo-chart",
    "Yahoo Finance",
    title,
    url,
    {
      headers: { Accept: "application/json" }
    },
    { mode: "cors", credentials: "omit" }
  );

  return jsonResult(
    "yahoo-chart",
    "Yahoo Finance",
    title,
    attempt,
    (data) => {
      const chart = asRecord(asRecord(data)?.chart);
      const results = chart?.result;
      if (!Array.isArray(results) || results.length === 0) {
        return "JSON response readable, but the chart result array is empty.";
      }
      const first = asRecord(results[0]);
      const timestamps = first?.timestamp;
      return Array.isArray(timestamps)
        ? `Direct browser request read Yahoo chart JSON (${timestamps.length} timestamp slots).`
        : "JSON response readable, but timestamp data is missing.";
    }
  );
}

export async function runProviderDiagnostics(
  options: ProviderAuditOptions
): Promise<ProviderProbeResult[]> {
  const [finance, symbol, chartInk, nse, yahoo] = await Promise.all([
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "finance"),
    probeMarketSmith(options.marketSmithStockId, options.marketSmithSymbol, "symbol"),
    probeChartInk(),
    probeNse(),
    probeYahooFinance()
  ]);

  return [finance, symbol, ...chartInk, nse, yahoo];
}
