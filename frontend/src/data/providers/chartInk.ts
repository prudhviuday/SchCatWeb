export interface ChartInkScanResult {
  symbols: string[];
  rawRows: number;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/** Run a saved ChartInk clause through the same-origin Cloudflare Worker. */
export async function fetchChartInkScan(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<ChartInkScanResult> {
  const clause = query.trim();
  if (!clause) throw new Error("This saved query has no ChartInk query clause.");

  let response: Response;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 45000);
  try {
    response = await fetcher("/api/chartink/scan", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ mode: "scan", query: clause }),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new Error(timedOut
      ? "ChartInk scan timed out while waiting for the SchCatWeb Worker."
      : error instanceof Error ? "Could not reach the SchCatWeb Worker: " + error.message : "Could not reach the SchCatWeb Worker.");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ChartInk Worker returned a non-JSON response (HTTP " + response.status + ").");
  }
  const body = asRecord(payload);
  if (!response.ok) {
    const reason = typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string" ? body.error : "HTTP " + response.status;
    throw new Error("ChartInk scan failed: " + reason);
  }
  if (!body || !Array.isArray(body.data)) {
    throw new Error("ChartInk response is missing the expected data array.");
  }

  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const raw of body.data) {
    const row = asRecord(raw);
    const rawSymbol = row?.nsecode ?? row?.symbol;
    if (typeof rawSymbol !== "string") continue;
    const symbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9&._-]+$/.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
  }
  if (body.data.length > 0 && symbols.length === 0) {
    throw new Error("ChartInk returned rows, but none contained a valid NSE symbol.");
  }
  return { symbols, rawRows: body.data.length };
}
