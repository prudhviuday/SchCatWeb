import { useEffect, useMemo, useState } from "react";
import { fetchChartData, type ChartCandle } from "../../data/providers/chartData";
import { loadMarketUniverse, type MarketUniverseRecord } from "../../data/reference/marketUniverse";
import { prepareChartView, type ChartDisplayPoint } from "../charts/chartPresentation";
import {
  filterAnalysisStocks,
  filterAnalysisStocksByIndustry,
  getAnalysisChartRanges,
  getAnalysisIndustries,
  getAnalysisRangeStart,
  nextAnalysisIndustry,
  MAX_ANALYSIS_STOCKS,
  type AnalysisChartRange,
  type AnalysisChartTimeframe
} from "./multiStockAnalysis";

type PairState = {
  weekly: ChartCandle[];
  daily: ChartCandle[];
  weeklyError: string;
  dailyError: string;
  loading: boolean;
};

type ChartStyle = "candles" | "line";

const EMPTY_PAIR_STATE: PairState = {
  weekly: [],
  daily: [],
  weeklyError: "",
  dailyError: "",
  loading: true
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatVolume(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function StockGalleryChart({
  points,
  height,
  chartStyle,
  showSma50,
  showEma50,
  showEma200,
  title
}: {
  points: ChartDisplayPoint[];
  height: number;
  chartStyle: ChartStyle;
  showSma50: boolean;
  showEma50: boolean;
  showEma200: boolean;
  title: string;
}) {
  if (points.length === 0) {
    return <div className="analysis-chart-empty">No candles available for this range.</div>;
  }

  const width = 640;
  const left = 48;
  const right = 10;
  const top = 13;
  const priceBottom = height - 62;
  const volumeTop = priceBottom + 12;
  const volumeBottom = height - 21;
  const plotWidth = width - left - right;
  const enabledIndicators = [
    ...(showSma50 ? points.map(point => point.sma50).filter((value): value is number => value !== null) : []),
    ...(showEma50 ? points.map(point => point.ema50).filter((value): value is number => value !== null) : []),
    ...(showEma200 ? points.map(point => point.ema200).filter((value): value is number => value !== null) : [])
  ];
  const minimum = Math.min(...points.map(point => point.low), ...enabledIndicators);
  const maximum = Math.max(...points.map(point => point.high), ...enabledIndicators);
  const spread = maximum - minimum || Math.max(1, Math.abs(maximum) * 0.02);
  const yMin = minimum - spread * 0.07;
  const yMax = maximum + spread * 0.07;
  const yPrice = (value: number) => priceBottom - ((value - yMin) / (yMax - yMin)) * (priceBottom - top);
  const maxVolume = Math.max(1, ...points.map(point => point.volume));
  const xAt = (index: number) => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const candleWidth = Math.max(1.4, Math.min(7, plotWidth / points.length * 0.68));

  const indicatorPoints = (field: "sma50" | "ema50" | "ema200") => points
    .map((point, index) => point[field] === null ? null : `${xAt(index).toFixed(2)},${yPrice(point[field] as number).toFixed(2)}`)
    .filter((value): value is string => value !== null);

  const first = points[0];
  const middle = points[Math.floor((points.length - 1) / 2)];
  const last = points[points.length - 1];

  return (
    <svg
      className="analysis-chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={{ height }}
      role="img"
      aria-label={`${title} ${chartStyle} price and volume chart with ${points.length} bars`}
    >
      {[0, 1, 2, 3, 4].map(tick => {
        const y = top + tick * (priceBottom - top) / 4;
        const value = yMax - tick * (yMax - yMin) / 4;
        return <g key={tick}>
          <line x1={left} x2={width - right} y1={y} y2={y} className="analysis-chart-grid-line" />
          <text x={left - 5} y={y + 3} textAnchor="end" className="analysis-chart-axis-label">{formatPrice(value)}</text>
        </g>;
      })}
      <line x1={left} x2={width - right} y1={volumeTop - 5} y2={volumeTop - 5} className="analysis-chart-divider" />
      {chartStyle === "candles" ? points.map((point, index) => {
        const x = xAt(index);
        const up = point.close >= point.open;
        const bodyTop = yPrice(Math.max(point.open, point.close));
        const bodyBottom = yPrice(Math.min(point.open, point.close));
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        const volumeHeight = point.volume / maxVolume * (volumeBottom - volumeTop);
        return <g key={point.time}>
          <line
            x1={x}
            x2={x}
            y1={yPrice(point.high)}
            y2={yPrice(point.low)}
            className={up ? "analysis-candle-wick-up" : "analysis-candle-wick-down"}
          />
          <rect
            x={x - candleWidth / 2}
            y={bodyTop}
            width={candleWidth}
            height={bodyHeight}
            className={up ? "analysis-candle-body-up" : "analysis-candle-body-down"}
          />
          <rect
            x={x - candleWidth / 2}
            y={volumeBottom - volumeHeight}
            width={candleWidth}
            height={volumeHeight}
            className={up ? "analysis-volume-up" : "analysis-volume-down"}
          />
        </g>;
      }) : <>
        <polyline
          points={points.map((point, index) => `${xAt(index).toFixed(2)},${yPrice(point.close).toFixed(2)}`).join(" ")}
          className="analysis-chart-close-line"
        />
        {points.map((point, index) => {
          const volumeHeight = point.volume / maxVolume * (volumeBottom - volumeTop);
          return <rect
            key={point.time}
            x={xAt(index) - candleWidth / 2}
            y={volumeBottom - volumeHeight}
            width={candleWidth}
            height={volumeHeight}
            className={point.close >= point.open ? "analysis-volume-up" : "analysis-volume-down"}
          />;
        })}
      </>}
      {showSma50 && indicatorPoints("sma50").length > 1 && <polyline points={indicatorPoints("sma50").join(" ")} className="analysis-indicator-sma" />}
      {showEma50 && indicatorPoints("ema50").length > 1 && <polyline points={indicatorPoints("ema50").join(" ")} className="analysis-indicator-ema50" />}
      {showEma200 && indicatorPoints("ema200").length > 1 && <polyline points={indicatorPoints("ema200").join(" ")} className="analysis-indicator-ema200" />}
      <text x={left} y={height - 5} className="analysis-chart-axis-label">{first.label}</text>
      <text x={width / 2} y={height - 5} textAnchor="middle" className="analysis-chart-axis-label">{middle.label}</text>
      <text x={width - right} y={height - 5} textAnchor="end" className="analysis-chart-axis-label">{last.label}</text>
      <text x={left} y={volumeTop - 10} className="analysis-chart-volume-label">VOLUME</text>
    </svg>
  );
}

function StockChartCard({
  record,
  state,
  timeframe,
  rangeStart,
  visibleBars,
  chartHeight,
  chartStyle,
  showSma50,
  showEma50,
  showEma200,
  onOpenStock
}: {
  record: MarketUniverseRecord;
  state: PairState;
  timeframe: AnalysisChartTimeframe;
  rangeStart: number;
  visibleBars: number;
  chartHeight: number;
  chartStyle: ChartStyle;
  showSma50: boolean;
  showEma50: boolean;
  showEma200: boolean;
  onOpenStock?: (record: MarketUniverseRecord) => void;
}) {
  const candles = timeframe === "1D" ? state.daily : state.weekly;
  const error = timeframe === "1D" ? state.dailyError : state.weeklyError;
  const points = useMemo(() => {
    if (!candles.length) return [];
    // Indicators are calculated against the full loaded history before the visible
    // date range and bar-count controls are applied, avoiding shortened MA warm-up.
    const complete = prepareChartView(candles, timeframe, candles.length).points;
    return complete.filter(point => point.time >= rangeStart).slice(-visibleBars);
  }, [candles, timeframe, rangeStart, visibleBars]);

  const last = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const changePct = last && previous && previous.close !== 0
    ? (last.close - previous.close) / previous.close * 100
    : null;
  const title = record.symbol + " · " + (timeframe === "1D" ? "Daily" : "Weekly");

  return (
    <article className="analysis-stock-card">
      <header className="analysis-stock-title">
        <div className="analysis-stock-identity">
          <button
            className="analysis-ticker-button"
            type="button"
            onClick={() => onOpenStock?.(record)}
            disabled={!onOpenStock}
            title={onOpenStock ? `Open ${record.symbol} in the full Chart tab` : undefined}
          >{record.symbol}</button>
          <span>{record.industry ?? record.sector ?? "Industry unavailable"}</span>
        </div>
        <div className="analysis-stock-quote">
          {last ? <strong>₹{formatPrice(last.close)}</strong> : <strong>—</strong>}
          {changePct !== null && <span className={changePct >= 0 ? "positive" : "negative"}>{changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%</span>}
        </div>
      </header>

      <div className="analysis-card-chart">
        {state.loading ? (
          <div className="analysis-chart-placeholder">Loading {timeframe === "1D" ? "daily" : "weekly"} OHLCV candles…</div>
        ) : error ? (
          <div className="analysis-chart-failure" role="alert">{error}</div>
        ) : points.length ? (
          <StockGalleryChart
            points={points}
            height={chartHeight}
            chartStyle={chartStyle}
            showSma50={showSma50}
            showEma50={showEma50}
            showEma200={showEma200}
            title={title}
          />
        ) : (
          <div className="analysis-chart-placeholder">No candles returned for this ticker and range.</div>
        )}
      </div>

      <footer className="analysis-stock-footer">
        {last ? <>
          <span>O {formatPrice(last.open)}</span>
          <span>H {formatPrice(last.high)}</span>
          <span>L {formatPrice(last.low)}</span>
          <strong>C {formatPrice(last.close)}</strong>
          <span>Vol {formatVolume(last.volume)}</span>
          <span>{last.label}</span>
        </> : <span>{state.loading ? "Waiting for market data…" : "OHLCV values unavailable"}</span>}
      </footer>
    </article>
  );
}

function MultiStockAnalysis({
  initialIndustry,
  onOpenStock
}: {
  initialIndustry?: { name: string; request: number } | null;
  onOpenStock?: (record: MarketUniverseRecord) => void;
}) {
  const [records, setRecords] = useState<MarketUniverseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [exactIndustry, setExactIndustry] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading stock universe…");
  const [stockStates, setStockStates] = useState<Record<string, PairState>>({});
  const [refresh, setRefresh] = useState(0);
  const [timeframe, setTimeframe] = useState<AnalysisChartTimeframe>("1D");
  const [range, setRange] = useState<AnalysisChartRange>("6M");
  const [columns, setColumns] = useState<2 | 3 | 4>(3);
  const [chartHeight, setChartHeight] = useState<190 | 245 | 300>(245);
  const [visibleBars, setVisibleBars] = useState(120);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("candles");
  const [showSma50, setShowSma50] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(true);

  const industries = useMemo(() => getAnalysisIndustries(records), [records]);
  const matches = useMemo(() => exactIndustry
    ? filterAnalysisStocksByIndustry(records, exactIndustry)
    : filterAnalysisStocks(records, submittedQuery), [records, submittedQuery, exactIndustry]);
  const rangeStart = useMemo(() => getAnalysisRangeStart(range), [range]);

  useEffect(() => {
    if (!initialIndustry?.name) return;
    setExactIndustry(initialIndustry.name);
    setQuery(initialIndustry.name);
    setSubmittedQuery(initialIndustry.name);
  }, [initialIndustry?.request]);

  useEffect(() => {
    let active = true;
    void loadMarketUniverse()
      .then(data => {
        if (active) {
          setRecords(data.records);
          setStatus(data.records.length.toLocaleString("en-IN") + " stocks available · select an industry or search");
        }
      })
      .catch(error => {
        if (active) setStatus(error instanceof Error ? error.message : "Unable to load stock universe.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!matches.length) {
      setStockStates({});
      setStatus(submittedQuery ? "No matching stocks." : "Select an industry or search for a stock.");
      return () => { active = false; };
    }

    setStockStates(Object.fromEntries(matches.map(record => [record.symbol, { ...EMPTY_PAIR_STATE }])));
    setStatus("Loading daily and weekly OHLCV candles for " + matches.length + " stocks…");

    const timeframes: Array<[keyof Pick<PairState, "weekly" | "daily">, AnalysisChartTimeframe, "weeklyError" | "dailyError"]> = [
      ["weekly", "1W", "weeklyError"],
      ["daily", "1D", "dailyError"]
    ];

    void (async () => {
      let completed = 0;
      let failed = 0;
      for (let offset = 0; offset < matches.length; offset += 4) {
        const batch = matches.slice(offset, offset + 4);
        await Promise.all(batch.map(async record => {
          const result: PairState = { weekly: [], daily: [], weeklyError: "", dailyError: "", loading: false };
          await Promise.all(timeframes.map(async ([field, requestTimeframe, errorField]) => {
            try {
              result[field] = await fetchChartData(record.symbol, requestTimeframe);
            } catch (error) {
              result[errorField] = error instanceof Error ? error.message : "Chart request failed";
            }
          }));
          if (result.weeklyError || result.dailyError || (!result.weekly.length && !result.daily.length)) failed += 1;
          completed += 1;
          if (active) {
            setStockStates(current => ({ ...current, [record.symbol]: result }));
            setStatus("Loaded " + completed + " of " + matches.length + " stock chart pairs" + (failed ? " · " + failed + " with provider errors" : ""));
          }
        }));
      }
      if (active) {
        setStatus("Ready · " + matches.length + " stocks · scroll the chart gallery to review every chart");
      }
    })();

    return () => { active = false; };
  }, [matches, refresh, submittedQuery]);

  function runSearch(value = query) {
    setExactIndustry(null);
    setQuery(value);
    setSubmittedQuery(value.trim());
  }

  function changeTimeframe(next: AnalysisChartTimeframe) {
    setTimeframe(next);
    setRange(next === "1D" ? "6M" : "2Y");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "ArrowRight" || event.key === ".") {
      event.preventDefault();
      const next = nextAnalysisIndustry(industries, submittedQuery);
      if (next) runSearch(next);
    }
  }

  const rangeOptions = getAnalysisChartRanges(timeframe);

  return (
    <div className="analysis-content" onKeyDown={handleKeyDown}>
      <div className="eyebrow">SCHCAT / INDUSTRY STOCK GRAPHS</div>
      <div className="analysis-heading">
        <div>
          <h1>{exactIndustry ?? "Multi-Stock Analysis"}</h1>
          <p className="intro">
            Candlestick chart gallery for up to {MAX_ANALYSIS_STOCKS} constituents. Scroll the grid, compare price and volume, then open any ticker in the full Chart tab.
          </p>
        </div>
        <button className="screener-button secondary" type="button" onClick={() => setRefresh(value => value + 1)} disabled={!matches.length}>
          Refresh charts
        </button>
      </div>

      <form className="analysis-search-panel" onSubmit={event => { event.preventDefault(); runSearch(); }}>
        <label>
          Industry / Stock (substring)
          <input list="analysis-industries" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Electrical Equipment or ABB" />
          <datalist id="analysis-industries">{industries.map(industry => <option key={industry} value={industry} />)}</datalist>
        </label>
        <button className="screener-button" type="submit">Go</button>
        <div className="analysis-status" aria-live="polite">
          {status}<br />Right Arrow or “.” cycles industries when focus is outside the controls.
        </div>
      </form>

      <section className="analysis-chart-controls" aria-label="Chart gallery settings">
        <div className="analysis-control-group">
          <span className="analysis-control-label">INTERVAL</span>
          <div className="analysis-control-buttons">
            {([{ key: "1D", label: "Daily" }, { key: "1W", label: "Weekly" }] as const).map(option => (
              <button key={option.key} type="button" className={timeframe === option.key ? "active" : ""} aria-pressed={timeframe === option.key} onClick={() => changeTimeframe(option.key)}>{option.label}</button>
            ))}
          </div>
        </div>

        <div className="analysis-control-group">
          <span className="analysis-control-label">RANGE</span>
          <div className="analysis-control-buttons">
            {rangeOptions.map(option => (
              <button key={option} type="button" className={range === option ? "active" : ""} aria-pressed={range === option} onClick={() => setRange(option)}>{option}</button>
            ))}
          </div>
        </div>

        <div className="analysis-control-group">
          <span className="analysis-control-label">CHART STYLE</span>
          <div className="analysis-control-buttons">
            <button type="button" className={chartStyle === "candles" ? "active" : ""} aria-pressed={chartStyle === "candles"} onClick={() => setChartStyle("candles")}>Candles</button>
            <button type="button" className={chartStyle === "line" ? "active" : ""} aria-pressed={chartStyle === "line"} onClick={() => setChartStyle("line")}>Line</button>
          </div>
        </div>

        <div className="analysis-control-group">
          <span className="analysis-control-label">GRID</span>
          <div className="analysis-control-buttons">
            {([2, 3, 4] as const).map(value => (
              <button key={value} type="button" className={columns === value ? "active" : ""} aria-pressed={columns === value} onClick={() => setColumns(value)}>{value} cols</button>
            ))}
          </div>
        </div>

        <label className="analysis-range-control">
          <span className="analysis-control-label">BARS <strong>{visibleBars}</strong></span>
          <input type="range" min="30" max="250" step="10" value={visibleBars} onChange={event => setVisibleBars(Number(event.target.value))} />
        </label>

        <div className="analysis-control-group">
          <span className="analysis-control-label">CHART HEIGHT</span>
          <div className="analysis-control-buttons">
            {([{ value: 190, label: "Compact" }, { value: 245, label: "Normal" }, { value: 300, label: "Large" }] as const).map(option => (
              <button key={option.value} type="button" className={chartHeight === option.value ? "active" : ""} aria-pressed={chartHeight === option.value} onClick={() => setChartHeight(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>

        <div className="analysis-control-group analysis-indicator-group">
          <span className="analysis-control-label">INDICATORS</span>
          <div className="analysis-indicator-toggles">
            <label><input type="checkbox" checked={showSma50} onChange={event => setShowSma50(event.target.checked)} /> SMA 50</label>
            <label><input type="checkbox" checked={showEma50} onChange={event => setShowEma50(event.target.checked)} /> EMA 50</label>
            <label><input type="checkbox" checked={showEma200} onChange={event => setShowEma200(event.target.checked)} /> EMA 200</label>
          </div>
        </div>
      </section>

      {!submittedQuery ? (
        <div className="analysis-empty">Select an industry in the Stocks table or enter an industry / stock substring to load its charts.</div>
      ) : matches.length === 0 ? (
        <div className="analysis-empty">No stocks found for “{submittedQuery}”. Try a broader industry name or symbol.</div>
      ) : (
        <div className="analysis-gallery-scroll" aria-label="Scrollable stock chart gallery" tabIndex={0}>
          <div className="analysis-grid" data-columns={columns}>
            {matches.map(record => (
              <StockChartCard
                key={record.symbol}
                record={record}
                state={stockStates[record.symbol] ?? EMPTY_PAIR_STATE}
                timeframe={timeframe}
                rangeStart={rangeStart}
                visibleBars={visibleBars}
                chartHeight={chartHeight}
                chartStyle={chartStyle}
                showSma50={showSma50}
                showEma50={showEma50}
                showEma200={showEma200}
                onOpenStock={onOpenStock}
              />
            ))}
          </div>
        </div>
      )}

      <footer className="page-footer">SCHCATWEB <span>·</span> INDUSTRY STOCK CHART GALLERY <span>·</span> UP TO {MAX_ANALYSIS_STOCKS} CONSTITUENTS</footer>
    </div>
  );
}

export default MultiStockAnalysis;
