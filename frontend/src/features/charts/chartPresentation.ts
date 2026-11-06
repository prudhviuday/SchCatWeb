import type { ChartCandle, ChartTimeframe } from "../../data/providers/chartData.js";
import {
  calculateEma,
  calculateRsi,
  calculateSma
} from "../../domain/analysis/technicalIndicators.js";

export interface ChartDisplayPoint extends ChartCandle {
  label: string;
  sma50: number | null;
  ema50: number | null;
  ema200: number | null;
}

export interface ChartView {
  points: ChartDisplayPoint[];
  latestRsi21: number | null;
  latestSma50: number | null;
  latestEma50: number | null;
  latestEma200: number | null;
  latestClose: number | null;
  previousClose: number | null;
}

function alignIndicator(values: readonly number[], sourceLength: number, period: number): Array<number | null> {
  const aligned: Array<number | null> = Array.from({ length: sourceLength }, () => null);
  const offset = Math.max(0, period - 1);
  values.forEach((value, index) => {
    const targetIndex = offset + index;
    if (targetIndex < sourceLength && Number.isFinite(value)) {
      aligned[targetIndex] = value;
    }
  });
  return aligned;
}

export function formatChartTime(time: number, timeframe: ChartTimeframe): string {
  const date = new Date(time * 1000);
  const intraday = timeframe === "1H" || timeframe === "5m" || timeframe === "15m" || timeframe === "4H";
  return new Intl.DateTimeFormat("en-IN", intraday
    ? { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit" }
  ).format(date);
}

/**
 * Prepare the most recent N candles for the SVG chart while calculating the
 * legacy chart-route indicators (SMA50, EMA50, EMA200 and RSI-21) against the
 * complete history. Each moving average retains its source candle position
 * after visible-range slicing; unavailable early values remain null.
 */
export function prepareChartView(
  candles: readonly ChartCandle[],
  timeframe: ChartTimeframe,
  maxPoints = 200
): ChartView {
  if (!Number.isInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError("Chart point limit must be a positive integer");
  }

  const ordered = [...candles].sort((a, b) => a.time - b.time);
  if (ordered.length === 0) {
    return {
      points: [],
      latestRsi21: null,
      latestSma50: null,
      latestEma50: null,
      latestEma200: null,
      latestClose: null,
      previousClose: null
    };
  }

  const closes = ordered.map((candle) => candle.close);
  const sma50 = alignIndicator(calculateSma(closes, 50), ordered.length, 50);
  const ema50 = alignIndicator(calculateEma(closes, 50), ordered.length, 50);
  const ema200 = alignIndicator(calculateEma(closes, 200), ordered.length, 200);
  const rsi = calculateRsi(closes, 21);
  const startIndex = Math.max(0, ordered.length - maxPoints);

  const points = ordered.slice(startIndex).map((candle, visibleIndex) => {
    const originalIndex = startIndex + visibleIndex;
    return {
      ...candle,
      label: formatChartTime(candle.time, timeframe),
      sma50: sma50[originalIndex],
      ema50: ema50[originalIndex],
      ema200: ema200[originalIndex]
    };
  });

  return {
    points,
    latestRsi21: rsi.length > 0 ? rsi[rsi.length - 1] : null,
    latestSma50: sma50[ordered.length - 1],
    latestEma50: ema50[ordered.length - 1],
    latestEma200: ema200[ordered.length - 1],
    latestClose: ordered[ordered.length - 1].close,
    previousClose: ordered.length > 1 ? ordered[ordered.length - 2].close : null
  };
}


export interface WeeklyCloseVolumePoint {
  time: number;
  value: number;
}

/**
 * Desktop util.fetch_closexvol_for_stock: weekly close × volume / 1,000,000,000,
 * rounded to two decimals, retaining the latest 30 observations chronologically.
 */
export function prepareWeeklyCloseVolume(
  candles: readonly ChartCandle[],
  maxPoints = 30
): WeeklyCloseVolumePoint[] {
  if (!Number.isInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError("Weekly close-volume point limit must be a positive integer");
  }
  return [...candles]
    .sort((left, right) => left.time - right.time)
    .slice(-maxPoints)
    .map((candle) => ({
      time: candle.time,
      value: Math.round((candle.close * candle.volume / 1_000_000_000) * 100) / 100
    }));
}
