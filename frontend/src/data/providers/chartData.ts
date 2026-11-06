/**
 * Chart data is fetched through the same-origin SchCatWeb Worker. The original
 * CRIP4 desktop app used Node's got() for Yahoo Finance; browser fetches cannot
 * reproduce that flow because Yahoo does not grant the deployed site CORS
 * access. The Worker performs the provider request and returns the JSON.
 *
 * The old Node stockUrlmaker contains "else if (key = 1000)", an assignment
 * that routes most requests to daily candles. This module implements the
 * timeframe labels used by chartengine.py explicitly instead of reproducing
 * that accidental daily-only behaviour.
 */

export type ChartTimeframe = "1W" | "1D" | "1H" | "5m" | "15m" | "4H";

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GoldCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StockGoldCandle extends ChartCandle {
  goldo: number;
  goldh: number;
  goldl: number;
  gold: number;
  sgopen?: number;
  sghigh?: number;
  sglow?: number;
  sgclose?: number;
}

export interface ChartRequestOptions {
  timeoutMs?: number;
}

export type ChartDataErrorKind =
  | "network"
  | "timeout"
  | "http"
  | "invalid-response";

export class ChartDataError extends Error {
  readonly kind: ChartDataErrorKind;
  readonly status?: number;

  constructor(
    kind: ChartDataErrorKind,
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "ChartDataError";
    this.kind = kind;
    this.status = status;
  }
}

const TIMEFRAME_CONFIG: Record<
  Exclude<ChartTimeframe, "15m" | "4H">,
  { interval: string; range: string }
> = {
  "1W": { interval: "1wk", range: "5y" },
  "1D": { interval: "1d", range: "2y" },
  "1H": { interval: "1h", range: "6mo" },
  "5m": { interval: "5m", range: "1mo" }
};

function normalizeYahooSymbol(symbol: string): string {
  const value = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&._-]+$/.test(value)) {
    throw new TypeError("Stock symbol contains unsupported characters");
  }
  if (!value) throw new TypeError("Stock symbol is required");
  return /\.(NS|BO)$/.test(value) ? value : `${value}.NS`;
}

/**
 * Build Yahoo Finance's public chart URL for direct browser requests.
 */
export function buildYahooChartUrl(
  symbol: string,
  timeframe: Exclude<ChartTimeframe, "15m" | "4H">,
  options: { range?: string } = {}
): string {
  const safeSymbol = normalizeYahooSymbol(symbol);
  const config = TIMEFRAME_CONFIG[timeframe];
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(safeSymbol)}`
  );
  url.searchParams.set("range", options.range ?? config.range);
  url.searchParams.set("interval", config.interval);
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");
  return url.toString();
}

/** Same-origin endpoint handled by worker/index.js. */
export function buildYahooProxyUrl(
  symbol: string,
  timeframe: Exclude<ChartTimeframe, "15m" | "4H">,
  options: { range?: string } = {}
): string {
  const safeSymbol = normalizeYahooSymbol(symbol);
  const config = TIMEFRAME_CONFIG[timeframe];
  const params = new URLSearchParams({
    symbol: safeSymbol,
    interval: config.interval,
    range: options.range ?? config.range
  });
  return `/api/yahoo/chart?${params.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Convert the Yahoo chart response into the same ascending OHLCV candle shape
 * emitted by CRIP4. Empty-volume and malformed candles are excluded.
 */
export function parseYahooChartPayload(payload: unknown): ChartCandle[] {
  const root = asRecord(payload);
  const chart = asRecord(root?.chart);
  const error = chart?.error;
  if (error !== null && error !== undefined) {
    const details = asRecord(error);
    const description = details?.description;
    throw new ChartDataError(
      "invalid-response",
      typeof description === "string"
        ? `Yahoo Finance error: ${description}`
        : "Yahoo Finance returned an error payload."
    );
  }

  const results = chart?.result;
  if (!Array.isArray(results) || results.length === 0) return [];

  const result = asRecord(results[0]);
  const timestamps = result?.timestamp;
  const indicators = asRecord(result?.indicators);
  const quoteList = indicators?.quote;
  const quote = Array.isArray(quoteList) ? asRecord(quoteList[0]) : null;

  if (!Array.isArray(timestamps) || !quote) {
    throw new ChartDataError(
      "invalid-response",
      "Yahoo Finance response is missing timestamps or OHLCV quote data."
    );
  }

  const opens = Array.isArray(quote.open) ? quote.open : [];
  const highs = Array.isArray(quote.high) ? quote.high : [];
  const lows = Array.isArray(quote.low) ? quote.low : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];

  const candles: ChartCandle[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const time = numericValue(timestamps[index]);
    const open = numericValue(opens[index]);
    const high = numericValue(highs[index]);
    const low = numericValue(lows[index]);
    const close = numericValue(closes[index]);
    const volume = numericValue(volumes[index]);

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null ||
      volume === 0
    ) {
      continue;
    }

    candles.push({ time, open, high, low, close, volume });
  }

  return candles.sort((left, right) => left.time - right.time);
}

function aggregateCandles(candles: ChartCandle[]): ChartCandle {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    time: first.time,
    open: first.open,
    high: Math.max(...candles.map((candle) => candle.high)),
    low: Math.min(...candles.map((candle) => candle.low)),
    close: last.close,
    volume: candles.reduce((sum, candle) => sum + candle.volume, 0)
  };
}

/**
 * CRIP4 get15mStockData: group consecutive five-minute candles in batches of
 * three. The original implementation also keeps a final partial batch.
 */
export function aggregateFiveMinuteToFifteenMinute(
  candles: ChartCandle[]
): ChartCandle[] {
  const result: ChartCandle[] = [];
  for (let index = 0; index < candles.length; index += 3) {
    const group = candles.slice(index, index + 3);
    if (group.length > 0) result.push(aggregateCandles(group));
  }
  return result;
}

/**
 * CRIP4 stockOnetofour24: preserve the original India-session candle starts
 * (09:15 and 13:15 IST, represented as 03:45 and 07:45 UTC). Each start is
 * aggregated with the next three or two hourly candles respectively. Synthetic
 * flat candles at the final close are appended exactly as in the old service
 * so the last partial session bar can be completed without inventing volume.
 */
export function aggregateHourlyToFourHour(
  candles: ChartCandle[]
): ChartCandle[] {
  if (candles.length === 0) return [];

  const originalLength = candles.length;
  const last = candles[originalLength - 1];
  const extended = [...candles];

  for (let hour = 1; hour <= 4; hour += 1) {
    extended.push({
      time: last.time + hour * 3600,
      open: last.close,
      high: last.close,
      low: last.close,
      close: last.close,
      volume: 0
    });
  }

  const result: ChartCandle[] = [];
  for (let index = 0; index < originalLength; index += 1) {
    const sessionTime = extended[index].time % 86_400;
    if (sessionTime === 13_500) {
      result.push(aggregateCandles(extended.slice(index, index + 4)));
    } else if (sessionTime === 27_900) {
      result.push(aggregateCandles(extended.slice(index, index + 3)));
    }
  }

  return result;
}

/**
 * Fetch and shape chart candles through the same-origin Worker. The 15m/4H
 * views are built from Yahoo 5m/1h candles with the same grouping rules as CRIP4.
 */
export async function fetchChartData(
  symbol: string,
  timeframe: ChartTimeframe = "1D",
  options: ChartRequestOptions = {}
): Promise<ChartCandle[]> {
  if (timeframe === "15m") {
    const fiveMinute = await fetchYahooCandles(symbol, "5m", options);
    return aggregateFiveMinuteToFifteenMinute(fiveMinute);
  }
  if (timeframe === "4H") {
    const hourly = await fetchYahooCandles(symbol, "1H", options);
    return aggregateHourlyToFourHour(hourly);
  }
  return fetchYahooCandles(symbol, timeframe, options);
}

async function fetchYahooCandles(
  symbol: string,
  timeframe: Exclude<ChartTimeframe, "15m" | "4H">,
  options: ChartRequestOptions
): Promise<ChartCandle[]> {
  const url = buildYahooProxyUrl(symbol, timeframe);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        mode: "same-origin",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "AbortError";
      throw new ChartDataError(
        timedOut ? "timeout" : "network",
        timedOut
          ? `SchCatWeb's data Worker did not respond within ${timeoutMs} ms.`
          : "Could not reach the SchCatWeb data Worker. Check the site/API deployment and network."
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.clone().json() as { message?: unknown; error?: unknown };
        if (typeof body.message === "string") detail = body.message;
        else if (typeof body.error === "string") detail = body.error;
      } catch {
        // Keep the HTTP status as the primary diagnostic.
      }
      throw new ChartDataError(
        "http",
        detail
          ? `Yahoo Finance via SchCatWeb returned HTTP ${response.status}: ${detail}`
          : `Yahoo Finance via SchCatWeb returned HTTP ${response.status}.`,
        response.status
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ChartDataError(
        "invalid-response",
        "The SchCatWeb Worker returned a response that was not valid Yahoo Finance JSON."
      );
    }
    return parseYahooChartPayload(payload);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Port of chartengine.fetch_closexvol_for_stock. Values are close × volume /
 * 1 billion, rounded to two decimal places, with the latest 30 weekly rows.
 */
export function buildCloseVolumeHistory(
  weeklyCandles: ChartCandle[],
  limit = 30
): Array<[date: string, value: number]> {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("History limit must be a non-negative integer");
  }

  const sorted = [...weeklyCandles].sort((left, right) => left.time - right.time);
  return sorted.slice(-limit).map((candle) => [
    new Date(candle.time * 1000).toISOString().slice(0, 10),
    Math.round((candle.close * candle.volume / 1_000_000_000) * 100) / 100
  ]);
}

/**
 * Port of globe.stockGoldMerger2: exact-timestamp matches first, then carry the
 * preceding gold candle forward. For the first stock candle without a match,
 * the legacy service uses the first gold candle.
 */
export function mergeStockWithGold(
  stockCandles: ChartCandle[],
  goldCandles: GoldCandle[]
): StockGoldCandle[] {
  if (goldCandles.length === 0) {
    throw new RangeError("At least one gold candle is required");
  }

  const byTime = new Map(goldCandles.map((candle) => [candle.time, candle]));
  let previous = goldCandles[0];

  return stockCandles.map((stock) => {
    const matched = byTime.get(stock.time);
    if (matched) previous = matched;
    return {
      ...stock,
      goldo: previous.open,
      goldh: previous.high,
      goldl: previous.low,
      gold: previous.close
    };
  });
}

/**
 * Port of fixer.makeSTockGold: compare a fixed ₹50 notional stock position
 * with a fixed ₹50 notional gold position, both anchored at the final candle.
 */
export function makeStockGoldSeries(
  candles: StockGoldCandle[]
): StockGoldCandle[] {
  if (candles.length === 0) return [];
  const last = candles[candles.length - 1];
  if (last.open === 0 || last.goldo === 0) {
    throw new RangeError("Final stock/gold open price cannot be zero");
  }

  const stockUnits = 50 / last.open;
  const goldUnits = 50 / last.goldo;

  return candles.map((candle) => ({
    ...candle,
    sgclose:
      stockUnits * (candle.close - last.open) -
      goldUnits * (candle.gold - last.goldo),
    sgopen:
      stockUnits * (candle.open - last.open) -
      goldUnits * (candle.goldo - last.goldo),
    sghigh:
      stockUnits * (candle.high - last.open) -
      goldUnits * (candle.goldh - last.goldo),
    sglow:
      stockUnits * (candle.low - last.open) -
      goldUnits * (candle.goldl - last.goldo)
  }));
}
