export interface NseDeliveryPoint { date: string; deliveryValueCr: number; tradedValueCr: number; deliveryPct: number; }

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function formatNseDate(date: Date): string {
  return String(date.getDate()).padStart(2, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + date.getFullYear();
}

/** Desktop parity: reverse provider rows, compute crore values, apply a five-session rolling mean, then drop the first five rows. */
export function parseNseDeliveryHistory(payload: unknown): NseDeliveryPoint[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("NSE delivery response is not an object");
  const rows = (payload as { data?: unknown }).data;
  if (!Array.isArray(rows)) throw new TypeError("NSE delivery response is missing its data array");
  const daily = rows.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const tradedValue = numberValue(row.CH_TOT_TRADED_VAL);
    const deliveryPct = numberValue(row.COP_DELIV_PERC);
    const date = typeof row.mTIMESTAMP === "string" ? row.mTIMESTAMP : "";
    if (!date || tradedValue === null || deliveryPct === null) return null;
    return { date, deliveryValueCr: Math.trunc(tradedValue * deliveryPct / 10_000_000), tradedValueCr: Math.trunc(tradedValue / 100_000), deliveryPct };
  }).filter((point): point is { date: string; deliveryValueCr: number; tradedValueCr: number; deliveryPct: number } => point !== null).reverse();
  const output: NseDeliveryPoint[] = [];
  for (let index = 5; index < daily.length; index += 1) {
    const window = daily.slice(index - 4, index + 1);
    output.push({
      date: daily[index].date,
      deliveryValueCr: window.reduce((sum, point) => sum + point.deliveryValueCr, 0) / 5,
      tradedValueCr: window.reduce((sum, point) => sum + point.tradedValueCr, 0) / 5,
      deliveryPct: daily[index].deliveryPct
    });
  }
  return output;
}

export async function fetchNseDeliveryHistory(symbol: string, days = 300, fetcher: typeof fetch = fetch, now = new Date()): Promise<NseDeliveryPoint[]> {
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&._-]{1,30}$/.test(safeSymbol)) throw new TypeError("NSE symbol contains unsupported characters");
  if (!Number.isInteger(days) || days < 30 || days > 730) throw new RangeError("NSE delivery history days must be between 30 and 730");
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const params = new URLSearchParams({ symbol: safeSymbol, from: formatNseDate(start), to: formatNseDate(end) });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher("/api/nse/delivery?" + params.toString(), {
      method: "GET", mode: "same-origin", credentials: "same-origin",
      headers: { Accept: "application/json" }, signal: controller.signal
    });
    const body = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(body) as unknown; } catch { throw new TypeError("NSE returned invalid delivery JSON"); }
    if (!response.ok) {
      const detail = payload && typeof payload === "object" ? (payload as Record<string, unknown>).message ?? (payload as Record<string, unknown>).error : null;
      throw new Error("NSE delivery HTTP " + response.status + (detail ? " — " + String(detail) : ""));
    }
    return parseNseDeliveryHistory(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("NSE delivery request timed out");
    throw error;
  } finally { globalThis.clearTimeout(timeout); }
}
