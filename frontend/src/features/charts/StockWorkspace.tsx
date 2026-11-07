import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ChartDataError,
  fetchChartData,
  type ChartCandle,
  type ChartTimeframe
} from "../../data/providers/chartData";
import type { MarketUniverseRecord } from "../../data/reference/marketUniverse";
import { fetchNseDeliveryHistory, type NseDeliveryPoint } from "../../data/providers/nseDelivery";
import { getMarketSmithId, loadMarketSmithIds } from "../../data/reference/marketSmithIds";
import { readStoredMarketSmithAuth } from "../../data/providers/providerDiagnostics";
import {
  fetchMarketSmithFinanceData,
  fetchMarketSmithRelativeStrength,
  fetchMarketSmithStockMetrics,
  type MarketSmithAnnualEpsPoint,
  type MarketSmithLiveMetrics,
  type MarketSmithQuarterlyExpansionPoint,
  type MarketSmithRelativeStrengthPoint
} from "../../data/providers/marketSmithStockData";
import {
  prepareChartView,
  prepareWeeklyCloseVolume,
  type ChartDisplayPoint
} from "./chartPresentation";
import { InstitutionalOwnershipChart, RevenueEpsHistoryChart, RoceHistoryChart } from "./RightPanelQuickCharts";

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
  const overlayValues = points.flatMap((point) =>
    [point.sma50, point.ema50, point.ema200].filter((value): value is number => value !== null)
  );
  const minimum = Math.min(...lows, ...overlayValues);
  const maximum = Math.max(...highs, ...overlayValues);
  const spread = maximum - minimum || Math.max(1, Math.abs(maximum) * 0.02);
  const yMin = minimum - spread * 0.08;
  const yMax = maximum + spread * 0.08;
  const yPrice = (value: number) =>
    priceBottom - ((value - yMin) / (yMax - yMin)) * (priceBottom - top);
  const maxVolume = Math.max(1, ...points.map((point) => point.volume));
  const xAt = (index: number) =>
    left + (points.length === 1 ? chartWidth / 2 : index * chartWidth / (points.length - 1));
  const candleWidth = Math.max(1.2, Math.min(7, chartWidth / points.length * 0.62));
  const indicatorPath = (field: "sma50" | "ema50" | "ema200") =>
    points
      .map((point, index) =>
        point[field] === null
          ? null
          : `${xAt(index).toFixed(2)},${yPrice(point[field] as number).toFixed(2)}`
      )
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
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title} candlestick and volume chart for ${points.length} candles`}
      >
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
              <line
                x1={x}
                x2={x}
                y1={yPrice(point.high)}
                y2={yPrice(point.low)}
                className={up ? "chart-wick-bull" : "chart-wick-bear"}
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                className={up ? "chart-candle-bull" : "chart-candle-bear"}
              />
              <rect
                x={x - candleWidth / 2}
                y={volumeBottom - volumeHeight}
                width={candleWidth}
                height={volumeHeight}
                className={up ? "chart-volume-bull" : "chart-volume-bear"}
              />
            </g>
          );
        })}
        {indicatorPath("sma50").length > 1 && <polyline points={indicatorPath("sma50").join(" ")} className="chart-sma50" />}
        {indicatorPath("ema50").length > 1 && <polyline points={indicatorPath("ema50").join(" ")} className="chart-ema50" />}
        {indicatorPath("ema200").length > 1 && <polyline points={indicatorPath("ema200").join(" ")} className="chart-ema200" />}
        <text x={left} y={height - 8} className="chart-axis-label">{points[0].label}</text>
        <text x={width / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">{middle.label}</text>
        <text x={width - right} y={height - 8} textAnchor="end" className="chart-axis-label">{last.label}</text>
        <text x={left} y={volumeTop - 10} className="chart-volume-label">VOLUME</text>
      </svg>
      <div className="workspace-chart-legend">
        <span><i className="legend-sma50" /> SMA 50</span>
        <span><i className="legend-ema50" /> EMA 50</span>
        <span><i className="legend-ema200" /> EMA 200</span>
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
  const [fundamentalStatus, setFundamentalStatus] = useState<"idle" | "loading" | "ready" | "partial" | "error">("idle");
  const [fundamentalMessage, setFundamentalMessage] = useState("");
  const [liveFundamentals, setLiveFundamentals] = useState<MarketSmithLiveMetrics | null>(null);
  const [annualEps, setAnnualEps] = useState<MarketSmithAnnualEpsPoint[]>([]);
  const [annualRoce, setAnnualRoce] = useState<Array<{ year: number; value: number; normalized: number | null }>>([]);
  const [annualRevenue, setAnnualRevenue] = useState<Array<{ year: number; value: number; normalized: number | null }>>([]);
  const [quarterlyExpansion, setQuarterlyExpansion] = useState<MarketSmithQuarterlyExpansionPoint[]>([]);
  const [fundamentalsUpdatedAt, setFundamentalsUpdatedAt] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryHistory, setDeliveryHistory] = useState<NseDeliveryPoint[]>([]);
  const [deliveryUpdatedAt, setDeliveryUpdatedAt] = useState<string | null>(null);
  const [rsStatus, setRsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [rsMessage, setRsMessage] = useState("");
  const [rsHistory, setRsHistory] = useState<MarketSmithRelativeStrengthPoint[]>([]);

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

    return () => { active = false; };
  }, [symbol, retry]);

  useEffect(() => {
    if (initialRecord) {
      setRecord(initialRecord);
      setDraftSymbol(initialRecord.symbol);
      setSymbol(initialRecord.symbol);
    }
  }, [initialRecord]);

  const views = useMemo(() => {
    const result: Partial<Record<ChartTimeframe, ReturnType<typeof prepareChartView>>> = {};
    for (const timeframe of TIMEFRAMES) {
      const state = states[timeframe.key];
      if (state.status === "ready") {
        result[timeframe.key] = prepareChartView(state.candles, timeframe.key, visiblePoints);
      }
    }
    return result;
  }, [states, visiblePoints]);

  const dailyView = views["1D"];
  const dailyChange =
    dailyView?.latestClose !== null &&
    dailyView?.latestClose !== undefined &&
    dailyView.previousClose !== null &&
    dailyView.previousClose !== undefined
      ? dailyView.latestClose - dailyView.previousClose
      : null;
  const dailyChangePct =
    dailyChange !== null && dailyView?.previousClose
      ? dailyChange / dailyView.previousClose * 100
      : null;

  async function fetchDeliveryHistory() {
    if (!symbol || deliveryStatus === "loading") return;
    setDeliveryStatus("loading");
    setDeliveryMessage("Loading approximately 300 calendar days from NSE…");
    setDeliveryHistory([]);
    try {
      const history = await fetchNseDeliveryHistory(symbol);
      if (history.length === 0) throw new Error("NSE returned no usable delivery observations after the five-session rolling window.");
      setDeliveryHistory(history);
      const updatedAt = new Date().toLocaleString("en-IN");
      setDeliveryUpdatedAt(updatedAt);
      setDeliveryStatus("ready");
      setDeliveryMessage("NSE delivery history updated at " + updatedAt + ".");
    } catch (error) { setDeliveryStatus("error"); setDeliveryMessage(errorText(error)); }
  }

  async function fetchRelativeStrengthHistory() {
    if (!symbol || rsStatus === "loading") return;
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setRsStatus("error");
      setRsMessage("Save your current MarketSmith session in Provider Diagnostics first.");
      return;
    }
    setRsStatus("loading");
    setRsMessage("Fetching MarketSmith relative-strength history…");
    setRsHistory([]);
    try {
      const ids = await loadMarketSmithIds();
      const stockId = record?.instrumentId ?? getMarketSmithId(ids, symbol);
      if (stockId === null || stockId === undefined) throw new Error(`No MarketSmith instrument ID is available for ${symbol}.`);
      const points = await fetchMarketSmithRelativeStrength(stockId, symbol, auth);
      setRsHistory(points);
      setRsStatus("ready");
      setRsMessage(`Loaded ${points.length} MarketSmith relative-strength observations.`);
    } catch (error) {
      setRsStatus("error");
      setRsMessage(errorText(error));
    }
  }

  async function fetchLiveFundamentals() {
    if (!symbol || fundamentalStatus === "loading") return;
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setFundamentalStatus("error");
      setFundamentalMessage("Save your current MarketSmith session in Provider Diagnostics first.");
      return;
    }

    setFundamentalStatus("loading");
    setFundamentalMessage("Loading MarketSmith company details and annual EPS history…");
    setLiveFundamentals(null);
    setAnnualEps([]);
    setAnnualRoce([]);
    setAnnualRevenue([]);
    setQuarterlyExpansion([]);

    try {
      const ids = await loadMarketSmithIds();
      const stockId = record?.instrumentId ?? getMarketSmithId(ids, symbol);
      if (stockId === null || stockId === undefined) {
        throw new Error(`No MarketSmith instrument ID is available for ${symbol}.`);
      }

      const [symbolResult, financeResult] = await Promise.allSettled([
        fetchMarketSmithStockMetrics(stockId, symbol, auth),
        fetchMarketSmithFinanceData(stockId, auth)
      ]);

      const symbolOk = symbolResult.status === "fulfilled";
      const financeOk = financeResult.status === "fulfilled";
      if (symbolOk) setLiveFundamentals(symbolResult.value);
      if (financeOk) {
        setAnnualEps(financeResult.value.annualEps);
        setAnnualRoce(financeResult.value.annualRoce);
        setAnnualRevenue(financeResult.value.annualRevenue);
        setQuarterlyExpansion(financeResult.value.quarterlyExpansion);
      }

      if (!symbolOk && !financeOk) {
        const symbolError = symbolResult.status === "rejected" ? errorText(symbolResult.reason) : "";
        const financeError = financeResult.status === "rejected" ? errorText(financeResult.reason) : "";
        throw new Error([symbolError, financeError].filter(Boolean).join(" · "));
      }

      const updatedAt = new Date().toLocaleString("en-IN");
      setFundamentalsUpdatedAt(updatedAt);
      const symbolError = symbolResult.status === "rejected" ? errorText(symbolResult.reason) : "";
      const financeError = financeResult.status === "rejected" ? errorText(financeResult.reason) : "";
      const errors = [symbolError, financeError].filter(Boolean);
      setFundamentalStatus(errors.length ? "partial" : "ready");
      setFundamentalMessage(errors.length
        ? `Partial data loaded. ${errors.join(" · ")}`
        : `MarketSmith data updated at ${updatedAt}. Instrument ID: ${stockId}.`);
    } catch (error) {
      setFundamentalStatus("error");
      setFundamentalMessage(errorText(error));
    }
  }

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draftSymbol.trim().toUpperCase();
    if (!next) {
      setRequestError("Enter a stock symbol.");
      return;
    }
    setRequestError("");
    setRecord(next === initialRecord?.symbol ? initialRecord : null);
    setLiveFundamentals(null);
    setAnnualEps([]);
    setAnnualRoce([]);
    setAnnualRevenue([]);
    setQuarterlyExpansion([]);
    setFundamentalStatus("idle");
    setFundamentalMessage("");
    setFundamentalsUpdatedAt(null);
    setDeliveryStatus("idle"); setDeliveryMessage(""); setDeliveryHistory([]); setDeliveryUpdatedAt(null);
    setRsStatus("idle"); setRsMessage(""); setRsHistory([]);
    setSymbol(next);
  }

  return (
    <div className="workspace-content">
      <div className="eyebrow">SCHCAT / CHARTS & STOCK WORKSPACE</div>
      <div className="workspace-heading">
        <div>
          <h1>Stock Workspace</h1>
          <p className="intro">Multi-timeframe price action, volume and reference fundamentals.</p>
        </div>
        <button type="button" className="screener-button secondary" onClick={onBack}>Back to Screener</button>
      </div>

      <form className="workspace-symbol-form" onSubmit={submitSymbol}>
        <label>
          <span>Stock symbol</span>
          <input
            value={draftSymbol}
            onChange={(event) => setDraftSymbol(event.target.value.toUpperCase())}
            placeholder="e.g. RELIANCE"
            aria-label="Stock symbol"
          />
        </label>
        <button type="submit" className="screener-button">Load charts</button>
        <button
          type="button"
          className="screener-button secondary"
          onClick={() => setRetry((value) => value + 1)}
          disabled={!symbol}
        >Retry data</button>
        <button
          type="button"
          className="screener-button"
          onClick={() => void fetchLiveFundamentals()}
          disabled={!symbol || fundamentalStatus === "loading"}
        >{fundamentalStatus === "loading" ? "Fetching fundamentals…" : "Fetch live fundamentals"}</button>
        <span className="workspace-load-status" aria-live="polite">
          {loading ? "Fetching chart data…" : symbol ? "Provider request finished" : "Choose a stock to begin"}
        </span>
      </form>

      {requestError && <div className="screener-error" role="alert">{requestError}</div>}

      {!symbol ? (
        <section className="workspace-empty">
          <div className="notice-icon">⌁</div>
          <h2>No stock selected</h2>
          <p>Search for a stock symbol above, or open a stock directly from the Stock Screener.</p>
        </section>
      ) : (
        <>
          <div className="workspace-summary-grid">
            <section className="workspace-summary-main">
              <div className="eyebrow">SELECTED STOCK</div>
              <h2>{symbol}</h2>
              <p>{record?.industry ?? "Industry not in reference file"} · {record?.sector ?? "Sector not in reference file"}</p>
              <div className="workspace-price">{formatPrice(dailyView?.latestClose ?? null)}</div>
              <div className={dailyChange === null ? "workspace-daily-change" : dailyChange >= 0 ? "workspace-daily-change positive" : "workspace-daily-change negative"}>
                {dailyChange === null || dailyChangePct === null
                  ? "Daily change unavailable"
                  : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)} (${dailyChangePct >= 0 ? "+" : ""}${dailyChangePct.toFixed(2)}%) vs previous daily candle`}
              </div>
              <div className="workspace-rsi" aria-label="Latest daily technical indicators">
                <span>RSI 21 <strong>{dailyView?.latestRsi21 == null ? "—" : dailyView.latestRsi21.toFixed(2)}</strong></span>
                <span>SMA 50 <strong>{dailyView?.latestSma50 == null ? "—" : formatPrice(dailyView.latestSma50)}</strong></span>
                <span>EMA 50 <strong>{dailyView?.latestEma50 == null ? "—" : formatPrice(dailyView.latestEma50)}</strong></span>
                <span>EMA 200 <strong>{dailyView?.latestEma200 == null ? "—" : formatPrice(dailyView.latestEma200)}</strong></span>
              </div>
            </section>

            <section className="workspace-reference">
              <div className="workspace-reference-title">
                <div>
                  <div className="eyebrow">REFERENCE FUNDAMENTALS</div>
                  <span>Undated workbook snapshot</span>
                </div>
                <span className="screener-muted">Not live data</span>
              </div>
              <div className="workspace-reference-grid">
                <div><span>Market Cap*</span><strong>{record?.marketCap === null || record?.marketCap === undefined ? "—" : formatVolume(record.marketCap)}</strong></div>
                <div><span>P/B*</span><strong>{record?.pb ?? "—"}</strong></div>
                <div><span>ROCE*</span><strong>{record?.roce === null || record?.roce === undefined ? "—" : `${record.roce}%`}</strong></div>
                <div><span>NikScore*</span><strong>{record?.nikScore ?? "—"}</strong></div>
                <div><span>MarketSmith ID</span><strong>{record?.instrumentId ?? "Reference lookup"}</strong></div>
                <div><span>RS</span><strong>{liveFundamentals?.rs ?? "—"}</strong></div>
                <div><span>EPS Rank</span><strong>{liveFundamentals?.epsRank ?? "—"}</strong></div>
                <div><span>Group Rank</span><strong>{liveFundamentals?.groupRank ?? "—"}</strong></div>
                <div><span>MasterScore</span><strong>{liveFundamentals?.masterScore ?? "—"}</strong></div>
                <div><span>Acc/Dis</span><strong>{liveFundamentals?.accDis ?? "—"}</strong></div>
                <div><span>ROE</span><strong>{liveFundamentals?.roe == null ? "—" : `${liveFundamentals.roe}%`}</strong></div>
                <div><span>PE / PEG</span><strong>{liveFundamentals ? `${liveFundamentals.pe} / ${liveFundamentals.peg ?? "—"}` : "—"}</strong></div>
                <div><span>FScore</span><strong>{liveFundamentals?.fScore ?? "—"}</strong></div>
                <div><span>EPS Growth</span><strong>{liveFundamentals?.epsGrowth == null ? "—" : `${liveFundamentals.epsGrowth}%`}</strong></div>
                <div><span>Earnings Stability</span><strong>{liveFundamentals?.stability ?? "—"}</strong></div>
                <div><span>Live P/B</span><strong>{liveFundamentals?.livePb ?? "—"}</strong></div>
                <div><span>Cash Flow</span><strong>{liveFundamentals?.cashFlow ?? "—"}</strong></div>
              </div>
            </section>
          </div>

          <section className="workspace-live-fundamentals" aria-live="polite">
            <div className="workspace-chart-section-heading">
              <div><div className="eyebrow">MARKETSMITH FUNDAMENTALS</div><h2>Quarterly growth & annual EPS</h2><p className="workspace-chart-note">Relative-strength history is fetched separately on demand.</p></div><button type="button" className="screener-button secondary" onClick={() => void fetchRelativeStrengthHistory()} disabled={!symbol || rsStatus === "loading"}>{rsStatus === "loading" ? "Fetching RS…" : rsStatus === "ready" ? "Refresh RS history" : "Fetch RS history"}</button>
              <span className={fundamentalStatus === "error" ? "workspace-chart-status error" : fundamentalStatus === "ready" ? "workspace-chart-status ready" : "workspace-chart-status"}>{fundamentalStatus === "idle" ? "Not loaded" : fundamentalStatus === "loading" ? "Loading" : fundamentalStatus === "partial" ? "Partial" : fundamentalStatus === "error" ? "Unavailable" : "Live"}</span>
            </div>
            <p className="workspace-chart-note">{fundamentalMessage || "Use Fetch live fundamentals to retrieve MarketSmith symbol details and finance history. The saved browser session is sent only with the request."}</p>
            <p className="workspace-chart-note" aria-live="polite">{rsMessage}</p>
            {rsHistory.length > 1 && (() => {
              const values = rsHistory.map((point) => point.value);
              const minimum = Math.min(...values);
              const maximum = Math.max(...values);
              const spread = maximum - minimum || 1;
              const coordinates = values.map((value, index) => {
                const px = 12 + index * 696 / (values.length - 1);
                const py = 126 - (value - minimum) / spread * 108;
                return `${px.toFixed(1)},${py.toFixed(1)}`;
              }).join(" ");
              return <div className="workspace-rs-history">
                <div className="eyebrow">MARKETSMITH RELATIVE STRENGTH · HISTORICAL SEQUENCE</div>
                <svg viewBox="0 0 720 150" role="img" aria-label={`${symbol} MarketSmith relative strength history, ${values.length} observations`}>
                  <line x1="12" x2="708" y1="126" y2="126" className="chart-grid-line" />
                  <polyline points={coordinates} className="workspace-rs-line" />
                  <text x="12" y="145" className="chart-axis-label">Oldest</text>
                  <text x="708" y="145" textAnchor="end" className="chart-axis-label">Latest</text>
                </svg>
                <p className="workspace-chart-note">Legacy desktop formula: provider rlst values, missing points replaced by the integer mean, then reversed to chronological order. MarketSmith response does not expose a stable date label in this legacy series, so the x-axis is sequence-only.</p>
              </div>;
            })()}

            {liveFundamentals && (
              <div className="workspace-quarter-grid">
                {liveFundamentals.quarterlyGrowth.map((quarter, index) => (
                  <article key={`${quarter.period}-${index}`}>
                    <strong>{quarter.period || `Quarter ${index + 1}`}</strong>
                    <span>EPS growth <b>{quarter.epsPct}%</b></span>
                    <span>Sales growth <b>{quarter.salesPct}%</b></span>\n                    <span>Reported sales <b>{quarter.salesValue === null ? "—" : quarter.salesValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b></span>
                  </article>
                ))}
              </div>
            )}
            {annualEps.length > 0 && (
              <div className="workspace-annual-eps">
                <div className="eyebrow">ANNUAL EPS · CHRONOLOGICAL</div>
                <div className="workspace-annual-eps-list">
                  {annualEps.map((point) => (
                    <div key={point.year}>
                      <span>{point.year}</span>
                      <strong>{point.eps.toFixed(2)}</strong>
                      <small>{point.normalized === null ? "—" : `Index ${point.normalized}`}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {quarterlyExpansion.length > 0 && (
              <div className="workspace-financial-history">
                <div className="eyebrow">QUARTERLY EXPANSION · LEGACY FORMULA</div>
                <div className="workspace-financial-history-list">
                  {quarterlyExpansion.map((point, index) => <div key={point.period + index}><span>{point.period}</span><strong>{point.value}%</strong><small>c25 ÷ c32 × 100</small></div>)}
                </div>
              </div>
            )}
            {(annualRoce.length > 0 || annualRevenue.length > 0) && (
              <div className="workspace-financial-history-grid">
                {annualRoce.length > 0 && <div className="workspace-financial-history">
                  <div className="eyebrow">ANNUAL ROCE · MARKETSMITH</div>
                  <RoceHistoryChart points={annualRoce} />
                </div>}
                {annualRevenue.length > 0 && <div className="workspace-financial-history">
                  <div className="eyebrow">ANNUAL REVENUE · MARKETSMITH</div>
                  <RevenueEpsHistoryChart revenue={annualRevenue} eps={annualEps.map(point => ({ year: point.year, normalized: point.normalized }))} />
                </div>}
              </div>
            )}
            {liveFundamentals && (liveFundamentals.institutionalOwnership.length > 0 || liveFundamentals.institutionalCost.length > 0) && (
              <div className="workspace-financial-history-grid">
                {liveFundamentals.institutionalOwnership.length > 0 && <div className="workspace-financial-history">
                  <div className="eyebrow">INSTITUTIONAL OWNERSHIP · FUNDS</div>
                  <InstitutionalOwnershipChart points={liveFundamentals.institutionalOwnership} />
                </div>}
                {liveFundamentals.institutionalCost.length > 0 && <div className="workspace-financial-history">
                  <div className="eyebrow">INSTITUTIONAL HOLDING VALUE · LEGACY FORMULA</div>
                  <div className="workspace-financial-history-list">{liveFundamentals.institutionalCost.map((point, index) => <div key={point.period + index}><span>{point.period}</span><strong>{formatVolume(point.value)}</strong><small>Shares × current price ÷ 1bn</small></div>)}</div>
                </div>}
              </div>
            )}
            {fundamentalsUpdatedAt && <span className="workspace-chart-note">Last refreshed: {fundamentalsUpdatedAt} · MarketSmith India</span>}
          </section>

          <section className="workspace-delivery-section" aria-live="polite">
            <div className="workspace-chart-section-heading">
              <div><div className="eyebrow">NSE DELIVERY ANALYSIS</div><h2>Delivery participation · 300-day history</h2></div>
              <button type="button" className="screener-button" onClick={() => void fetchDeliveryHistory()} disabled={!symbol || deliveryStatus === "loading"}>{deliveryStatus === "loading" ? "Fetching NSE data…" : deliveryStatus === "ready" ? "Refresh delivery data" : "Fetch NSE delivery history"}</button>
            </div>
            <p className="workspace-chart-note">{deliveryMessage || "Fetches NSE price-volume-delivery observations on demand. Delivery and traded values use the desktop's five-session rolling average; delivery percentage is the reported daily value."}</p>
            {deliveryHistory.length > 0 && (() => {
              const latest = deliveryHistory[deliveryHistory.length - 1];
              const previous = deliveryHistory.length > 1 ? deliveryHistory[deliveryHistory.length - 2] : null;
              return <>
                <div className="workspace-delivery-summary">
                  <div><span>Latest delivery %</span><strong>{latest.deliveryPct.toFixed(2)}%</strong><small>{latest.date}</small></div>
                  <div><span>5-session avg delivery value</span><strong>{latest.deliveryValueCr.toFixed(2)}</strong><small>Rolling mean</small></div>
                  <div><span>5-session avg traded value</span><strong>{latest.tradedValueCr.toFixed(2)}</strong><small>Rolling mean</small></div>
                  <div><span>Change vs prior session</span><strong>{previous ? (latest.deliveryPct - previous.deliveryPct >= 0 ? "+" : "") + (latest.deliveryPct - previous.deliveryPct).toFixed(2) + " pp" : "—"}</strong><small>Daily delivery percentage</small></div>
                </div>
                <div className="workspace-delivery-table-wrap"><table className="workspace-delivery-table">
                  <thead><tr><th>Date</th><th>Delivery %</th><th>Avg delivery value</th><th>Avg traded value</th></tr></thead>
                  <tbody>{deliveryHistory.slice(-12).reverse().map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.deliveryPct.toFixed(2)}%</td><td>{point.deliveryValueCr.toFixed(2)}</td><td>{point.tradedValueCr.toFixed(2)}</td></tr>)}</tbody>
                </table></div>
                {deliveryUpdatedAt && <span className="workspace-chart-note">Last refreshed: {deliveryUpdatedAt} · Source: NSE India</span>}
              </>;
            })()}
          </section>

          <section className="workspace-chart-section">
            <div className="workspace-chart-section-heading">
              <div><div className="eyebrow">PRICE & VOLUME</div><h2>Multi-timeframe charts</h2></div>
              <div className="workspace-zoom-control" aria-label="Chart visible candle count">
                {[100, 200, 500].map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={visiblePoints === count ? "active" : ""}
                    onClick={() => setVisiblePoints(count)}
                  >{count}</button>
                ))}
              </div>
            </div>
            <p className="workspace-chart-note">
              Yahoo Finance via same-origin Worker · Last {visiblePoints} candles where available · Time labels use IST · SMA 50, EMA 50/200, RSI 21 and volume
            </p>
            <div className="workspace-chart-grid">
              {TIMEFRAMES.map((timeframe) => {
                const state = states[timeframe.key];
                return (
                  <article className="workspace-chart-card" key={timeframe.key}>
                    <div className="workspace-chart-card-heading">
                      <div><h3>{timeframe.label}</h3><span>{timeframe.key}</span></div>
                      {state.status === "loading" && <span className="workspace-chart-status">Loading</span>}
                      {state.status === "ready" && <span className="workspace-chart-status ready">{state.candles.length.toLocaleString("en-IN")} candles</span>}
                      {state.status === "error" && <span className="workspace-chart-status error">Unavailable</span>}
                    </div>
                    {state.status === "loading" ? (
                      <div className="workspace-chart-empty">Fetching {timeframe.label.toLowerCase()} data…</div>
                    ) : state.status === "error" ? (
                      <div className="workspace-chart-failure">
                        <strong>Chart unavailable</strong>
                        <p>{state.error}</p>
                        <button type="button" className="screener-button secondary" onClick={() => setRetry((value) => value + 1)}>
                          Retry all charts
                        </button>
                      </div>
                    ) : (
                      <ChartGraphic points={views[timeframe.key]?.points ?? []} title={timeframe.label} />
                    )}
                  </article>
                );
              })}
            </div>
            {states["1W"].status === "ready" && (() => {
              const history = prepareWeeklyCloseVolume(states["1W"].candles);
              return history.length > 0 ? (
                <div className="workspace-financial-history">
                  <div className="eyebrow">WEEKLY CLOSE × VOLUME · DESKTOP LEGACY FORMULA</div>
                  <p className="workspace-chart-note">Close × weekly volume ÷ 1,000,000,000 · Latest {history.length} observations · Values are a relative turnover proxy, not a reported exchange turnover figure.</p>
                  <div className="workspace-financial-history-list">
                    {history.map((point) => (
                      <div key={point.time}>
                        <span>{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(point.time * 1000))}</span>
                        <strong>{point.value.toFixed(2)}</strong>
                        <small>Close × volume / 1bn</small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </section>

          <footer className="workspace-disclaimer">
            Provider access is browser-dependent. If Yahoo Finance blocks requests from this website, inspect the Provider Diagnostics page and browser Console. No proxy or secret credentials are used. The reference workbook metrics above have no as-of date.
          </footer>
        </>
      )}
      <footer className="page-footer">SCHCATWEB <span>·</span> STOCK WORKSPACE <span>·</span> STEP 22</footer>
    </div>
  );
}

export default StockWorkspace;
