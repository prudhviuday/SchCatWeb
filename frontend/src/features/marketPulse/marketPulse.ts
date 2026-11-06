export const MARKET_PULSE_COLUMNS = [
  "Date", "4% bull", "4% bear", "5-day ratio", "10-day ratio",
  "q25 bull", "q25 bear", "m25 bull", "m25 bear",
  "m50 bull", "m50 bear", "34/13 bull", "34/13 bear"
] as const;

export type MarketPulseColumn = typeof MARKET_PULSE_COLUMNS[number];
export type MarketPulseRow = Record<MarketPulseColumn, string | number>;

export const MARKET_PULSE_QUERY = "select groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) as '4% bull', groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) as '4% bear', ( ( groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 1 day ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) ) + groupcount( {cash} 1 where 2 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 3 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 4 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) ) / ( ( groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 1 day ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 2 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 3 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 4 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) ) ) as '5-day ratio', ( ( groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 1 day ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) ) + groupcount( {cash} 1 where 2 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 3 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 4 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 5 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 6 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 7 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 8 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) + groupcount( {cash} 1 where 9 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" > 4 ) ) / ( ( groupcount( {cash} 1 where daily \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 1 day ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 2 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 3 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 4 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 5 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 6 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 7 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 8 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) + groupcount( {cash} 1 where 9 days ago \"close - 1 candle ago close / 1 candle ago close * 100\" < -4 ) ) ) as '10-day ratio', groupcount( {cash} 1 where 100 * ( daily close - daily min( 65 , daily close ) / daily min( 65 , daily close ) ) >= 25 ) as 'Q25 bull', groupcount( {cash} 1 where 100 * ( daily close - daily max( 65 , daily close ) / daily max( 65 , daily close ) ) <= -25 ) as 'Q25 bear', groupcount( {cash} 1 where 100 * ( daily close - 20 days ago close ) / 20 days ago close >= 25 ) as 'M25 bull', groupcount( {cash} 1 where 100 * ( daily close - 20 days ago close ) / 20 days ago close <= -25 ) as 'M25 bear', groupcount( {cash} 1 where 100 * ( daily close - 20 days ago close ) / 20 days ago close >= 50 ) as 'M50 bull', groupcount( {cash} 1 where 100 * ( daily close - 20 days ago close ) / 20 days ago close <= -50 ) as 'M50 bear', groupcount( {cash} 1 where 100 * ( daily close - daily min( 34 , daily close ) ) / daily min( 34 , daily close ) >= 13 ) as '34/13 bull', groupcount( {cash} 1 where 100 * ( daily close - daily max( 34 , daily close ) ) / daily max( 34 , daily close ) <= -13 ) as '34/13 bear' WHERE( {cash} ( daily close >= 20 and daily close <= 20000 and weekly sma( weekly buyer initiated trades , 10 ) > 200 ) ) ORDER BY 1 desc";

export function parseMarketPulseResponse(payload: unknown): MarketPulseRow[] {
  if (!payload || typeof payload !== "object") throw new TypeError("Invalid ChartInk dashboard response.");
  const root = payload as Record<string, unknown>;
  const meta = Array.isArray(root.metaData) ? root.metaData[0] as Record<string, unknown> : null;
  const group = Array.isArray(root.groupData) ? root.groupData[0] as Record<string, unknown> : null;
  const dates = meta && Array.isArray(meta.tradeTimes) ? meta.tradeTimes : null;
  const groups = group && Array.isArray(group.results) ? group.results : null;
  if (!dates || !groups || groups.length < 12) throw new TypeError("ChartInk response is missing dashboard dates or metric groups.");

  const columns = MARKET_PULSE_COLUMNS.slice(1);
  const series = columns.map((column, index) => {
    const item = groups[index] as Record<string, unknown> | null;
    const values = item && item[column];
    if (!Array.isArray(values)) throw new TypeError("ChartInk response is missing " + column + ".");
    const numbers = values.map((value) => {
      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) throw new TypeError("ChartInk returned a missing value for " + column + ".");
      return Number(value);
    });
    if (numbers.some((value) => !Number.isFinite(value))) throw new TypeError("ChartInk returned invalid values for " + column + ".");
    return numbers.map((value) => column === "5-day ratio" || column === "10-day ratio" ? Math.round(value * 10) / 10 : value);
  });
  if (!dates.length || series.some((values) => values.length !== dates.length)) throw new TypeError("ChartInk metric series have inconsistent history lengths.");

  return dates.map((timestamp, index) => {
    if (timestamp === null || timestamp === undefined || timestamp === "") throw new TypeError("ChartInk returned an invalid timestamp.");
    const dateValue = Number(timestamp);
    if (!Number.isFinite(dateValue)) throw new TypeError("ChartInk returned an invalid timestamp.");
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) throw new TypeError("ChartInk returned an invalid timestamp.");
    const row = { Date: String(date.getUTCDate()).padStart(2, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + date.getUTCFullYear() } as MarketPulseRow;
    series.forEach((values, seriesIndex) => { row[columns[seriesIndex]] = values[index]; });
    return row;
  }).reverse();
}

type Rule = [number, number, string];
const RULES: Partial<Record<MarketPulseColumn, Rule[]>> = {
  "4% bull": [[170,1000000,"#339966"],[75,170,"#00FF00"],[30,60,"#F4CCCC"],[0,30,"#E06666"]],
  "4% bear": [[0,12,"#339966"],[12,35,"#00FF00"],[35,150,"#F4CCCC"],[150,100000,"#E06666"]],
  "5-day ratio": [[4,10000,"#339966"],[1.5,4,"#00FF00"],[1,1.5,"#F4CCCC"],[0,1.5,"#E06666"]],
  "10-day ratio": [[4,10000,"#339966"],[1.5,4,"#00FF00"],[1,1.5,"#F4CCCC"],[0,1.5,"#E06666"]],
  "q25 bull": [[450,100000,"#00FF00"],[300,450,"#F4CCCC"],[0,300,"#E06666"]],
  "q25 bear": [[0,150,"#00FF00"],[150,450,"#F4CCCC"],[450,100000,"#E06666"]],
  "m25 bull": [[55,100000,"#00FF00"],[40,55,"#F4CCCC"],[0,40,"#E06666"]],
  "m25 bear": [[0,10,"#00FF00"],[10,45,"#F4CCCC"],[45,100000,"#E06666"]],
  "m50 bull": [[9,100000,"#00FF00"],[4,9,"#F4CCCC"],[0,4,"#E06666"]],
  "m50 bear": [[0,1,"#00FF00"],[1,4,"#F4CCCC"],[4,100000,"#E06666"]],
  "34/13 bull": [[310,100000,"#00FF00"],[250,310,"#F4CCCC"],[0,250,"#E06666"]],
  "34/13 bear": [[0,270,"#00FF00"],[270,350,"#F4CCCC"],[350,100000,"#E06666"]]
};

export function getMarketPulseCellColor(column: MarketPulseColumn, value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "#FFFFFF";
  for (const [min, max, color] of RULES[column] ?? []) if (min <= numeric && numeric <= max) return color;
  return "#FFFFFF";
}

export function getMarketPulseTextColor(hex: string): "#000000" | "#FFFFFF" {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return "#000000";
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16), g = parseInt(value.slice(2, 4), 16), b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 186 ? "#000000" : "#FFFFFF";
}

export async function fetchMarketPulse(signal?: AbortSignal): Promise<{ rows: MarketPulseRow[]; fetchedAt: string }> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    const response = await fetch("/api/chartink/scan", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "widget",
        query: MARKET_PULSE_QUERY,
        use_live: true,
        limit: 6,
        size: 375
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = "";
      try {
        const error = await response.json() as { error?: string; message?: string; upstreamStatus?: number };
        detail = error.message || error.error || (error.upstreamStatus ? "upstream HTTP " + error.upstreamStatus : "");
      } catch {
        // Keep a useful HTTP status even if the Worker returned a non-JSON error.
      }
      throw new Error("ChartInk dashboard request failed through SchCatWeb API (HTTP " + response.status + (detail ? ": " + detail : "") + ").");
    }
    return {
      rows: parseMarketPulseResponse(await response.json()),
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    if (signal?.aborted) throw new Error("Market Pulse refresh was cancelled.");
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("SchCatWeb API did not respond within 15 seconds.");
    if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
      throw new Error("SchCatWeb API could not be reached. Check that the Cloudflare Worker deployment includes the server-side API.");
    }
    throw error instanceof Error ? error : new Error("Market Pulse could not be loaded.");
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}
