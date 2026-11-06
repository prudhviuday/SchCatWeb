import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ChartDataError,
  fetchChartData,
  type ChartCandle,
  type ChartTimeframe
} from "../../data/providers/chartData";
import type { MarketUniverseRecord } from "../../data/reference/marketUniverse";
import {
  prepareChartView,
  type ChartDisplayPoint
} from "./chartPresentation";

const TIMEFRAMES: ReadonlyArray<{ key: ChartTimeframe; label: string }> = [
  { key: "1W", label: "Weekly" },
  { key: "1D", label: "Daily" },
  { key: "1H", label: "Hourly" },
  { key: "5m", label: "5-minute" }
];

type CandleState =
  | { status: "loading"; candles: ChartCandle[]; error: "" }
  | { status: "ready"; candles: ChartCandle[]; error: "" }
  | { status: "error"; candles: ChartCandle[]; error: string };

type ChartStates = Record<ChartTimeframe, CandleState>;

const initialStates = (): ChartStates => ({
  "1W": { status: "loading", candles: [], error: "" },
  "1D": { status: "loading", candles: [], error: "" },
  "1H": { status: "loading", candles: [], error: "" },
  "5m": { status: "loading", candles: [], error: "" },
  "15m": { status: "loading", candles: [], error: "" },
  "4H": { status: "loading", candles: [], error: "" }
});

function errorText(error: unknown): string {
  if (error instanceof ChartDataError) return error.message;
  return error instanceof Error ? error.message : "Unknown chart data error";
}

function formatPrice(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
      }).format(value);
}

function formatVolume(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function ChartGraphic({ points, title }: { points: ChartDisplayPoint[]; title: string }) {
  if (points.length === 0) {
    return <div className="workspace-chart-empty">No candles returned for this timeframe.</div>;
  }

  const width = 720;
  const height = 340;
  const left = 14;
  const right = 12;
  const top = 18;
  const priceBottom = 238;
  const volumeTop = 260;
  const volumeBottom = 314;
  const chartWidth = width - left - right;
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const emaValues = points.flatMap((point) => [point.ema20, point.ema50].filter((value): value is number => value !== null));
  const minimum = Math.min(...lows, ...emaValues);
  const maximum = Math.max(...highs, ...emaValues);
  const spread = maximum - minimum || Math.max(1, Math.abs(maximum) * 0.02);
  const yMin = minimum - spread * 0.08;
  const yMax = maximum + spread * 0.08;
  const yPrice = (value: number) => priceBottom - ((value - yMin) / (yMax - yMin)) * (priceBottom - top);
  const maxVolume = Math.max(1, ...points.map((point) => point.volume));
  const xAt = (index: number) => left + (points.length === 1 ? chartWidth / 2 : index * chartWidth / (points.length - 1));
  const candleWidth = Math.max(1.2, Math.min(7, chartWidth / points.length * 0.62));
  const emaPath = (field: "ema20" | "ema50") => points
    .map((point, index) => point[field] === null ? null : `${xAt(index).toFixed(2)},${yPrice(point[field] as number).toFixed(2)}`)
    .filter((point): point is string => point !== null);

  const last = points[points.length - 1];
  const middle = points[Math.floor((points.length - 1) / 2)];

  return (
    <div className="workspace-chart-graphic">
      <div className="workspace-chart-ohlc">
        <span>O {formatPrice(last.open)}</span>
        <span>H {formatPrice(last.high)}</span>
        <span>L {formatPrice(last.low)}</span>
        <strong>C {formatPrice(last.close)}</strong>
        <span>Vol {formatVolume(last.volume)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} candlestick and volume chart for ${points.length} candles`}>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = top + tick * (priceBottom - top) / 4;
          const value = yMax - tick * (yMax - yMin) / 4;
          return (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y} y2={y} className="chart-grid-line" />
              <text x={left + 2} y={y - 4} className="chart-axis-label">{value.toFixed(1)}</text>
            </g>
          );
        })}
        <line x1={left} x2={width - right} y1={volumeTop - 5} y2={volumeTop - 5} className="chart-divider-line" />
        {points.map((point, index) => {
          const x = xAt(index);
          const up = point.close >= point.open;
          const bodyTop = yPrice(Math.max(point.open, point.close));
          const bodyBottom = yPrice(Math.min(point.open, point.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const volumeHeight = point.volume / maxVolume * (volumeBottom - volumeTop);
          return (
            <g key={point.time}>
              <line x1={x} x2={x} y1={yPrice(point.high)} y2={yPrice(point.low)} className={up ? "chart-wick-bull" : "chart-wick-bear"} />
              <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} className={up ? "chart-candle-bull" : "chart-candle-bear"} />
              <rect x={x - candleWidth / 2} y={volumeBottom - volumeHeight} width={candleWidth} height={volumeHeight} className={up ? "chart-volume-bull" : "chart-volume-bear"} />
            </g>
          );
        })}
        {emaPath("ema20").length > 1 && <polyline points={emaPath("ema20").join(" ")} className="chart-ema20" />}
        {emaPath("ema50").length > 1 && <polyline points={emaPath("ema50").join(" ")} className="chart-ema50" />}
        <text x={left} y={height - 8} className="chart-axis-label">{points[0].label}</text>
        <text x={width / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">{middle.label}</text>
        <text x={width - right} y={height - 8} textAnchor="end" className="chart-axis-label">{last.label}</text>
        <text x={left} y={volumeTop - 10} className="chart-volume-label">VOLUME</text>
      </svg>
      <div className="workspace-chart-legend">
        <span><i className="legend-ema20" /> EMA 20</span>
        <span><i className="legend-ema50" /> EMA 50</span>
        <span><i className="legend-bull" /> Up</span>
        <span><i className="legend-bear" /> Down</span>
      </div>
    </div>
  );
}

function StockWorkspace({
  initialRecord,
  onBack
}: {
  initialRecord?: MarketUniverseRecord | null;
  onBack: () => void;
}) {
  const [symbol, setSymbol] = useState(initialRecord?.symbol ?? "");
  const [draftSymbol, setDraftSymbol] = useState(initialRecord?.symbol ?? "");
  const [record, setRecord] = useState<MarketUniverseRecord | null>(initialRecord ?? null);
  const [states, setStates] = useState<ChartStates>(initialStates);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [retry, setRetry] = useState(0);
  const [visiblePoints, setVisiblePoints] = useState(200);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setStates(initialStates());
    setLoading(true);
    setRequestError("");

    const requests = TIMEFRAMES.map(async (timeframe) => {
      try {
        const candles = await fetchChartData(symbol, timeframe.key);
        if (!active) return;
        setStates((current) => ({
          ...current,
          [timeframe.key]: candles.length > 0
            ? { status: "ready", candles, error: "" }
            : { status: "error", candles: [], error: "The provider returned no candles for this symbol and period." }
        }));
      } catch (error) {
        if (!active) return;
        setStates((current) => ({
          ...current,
          [timeframe.key]: { status: "error", candles: [], error: errorText(error) }
        }));
      }
    });
    void Promise.all(requests).then(() => {
      if (active) setLoading(false);
    });
