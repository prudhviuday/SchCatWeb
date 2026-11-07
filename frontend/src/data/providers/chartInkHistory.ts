export interface ChartInkHistoryResult {
  symbols: string[];
  dates: number;
  rawEntries: number;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/**
 * ChartInk's backtest response stores each stock as a three-field tuple in
 * aggregatedStockList. The legacy desktop extracted tuple positions 0, 3, 6…
 * across every trade date, then returned the unique symbol set.
 */
export function parseChartInkHistoryPayload(payload: unknown): ChartInkHistoryResult {
  const root = asRecord(payload);
  const metadata = Array.isArray(root?.metaData) ? root.metaData[0] : null;
  const meta = asRecord(metadata);
  const tradeTimes = meta?.tradeTimes;
  const aggregate = root?.aggregatedStockList;
  if (!Array.isArray(tradeTimes) || !Array.isArray(aggregate)) {
    throw new Error("ChartInk backtest response is missing metaData.tradeTimes or aggregatedStockList.");
  }
  if (tradeTimes.length !== aggregate.length) {
    throw new Error("ChartInk backtest returned mismatched dates and stock-history rows.");
  }

  const symbols = new Set<string>();
  let rawEntries = 0;
  for (const row of aggregate) {
    if (!Array.isArray(row)) throw new Error("ChartInk backtest contains an invalid historical stock row.");
    rawEntries += row.length;
    for (let index = 0; index < row.length; index += 3) {
      const rawSymbol = row[index];
      if (typeof rawSymbol !== "string") continue;
      const symbol = rawSymbol.trim().toUpperCase();
      if (/^[A-Z0-9&._-]{1,30}$/.test(symbol)) symbols.add(symbol);
    }
  }
  return { symbols: [...symbols], dates: tradeTimes.length, rawEntries };
}

/** Run ChartInk's historical backtest through the same-origin Cloudflare Worker. */
export async function fetchChartInkHistory(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<ChartInkHistoryResult> {
  const clause = query.trim();
  if (!clause) throw new Error("This research query has no ChartInk query clause.");
  let response: Response;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 45000);
  try {
    response = await fetcher("/api/chartink/scan", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ mode: "history", query: clause }),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new Error(timedOut
      ? "ChartInk historical backtest timed out while waiting for the SchCatWeb Worker."
      : error instanceof Error ? "Could not reach the SchCatWeb Worker: " + error.message : "Could not reach the SchCatWeb Worker.");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ChartInk backtest returned a non-JSON response (HTTP " + response.status + ").");
  }
  const body = asRecord(payload);
  if (!response.ok) {
    const reason = typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string" ? body.error : "HTTP " + response.status;
    throw new Error("ChartInk historical backtest failed: " + reason);
  }
  return parseChartInkHistoryPayload(payload);
}
