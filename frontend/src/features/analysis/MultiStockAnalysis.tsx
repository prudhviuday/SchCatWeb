import { useEffect, useMemo, useState } from "react";
import { fetchChartData, type ChartCandle, type ChartTimeframe } from "../../data/providers/chartData";
import { loadMarketUniverse, type MarketUniverseRecord } from "../../data/reference/marketUniverse";
import { filterAnalysisStocks, getAnalysisIndustries, nextAnalysisIndustry, MAX_ANALYSIS_STOCKS } from "./multiStockAnalysis";

type PairState = { weekly: ChartCandle[]; daily: ChartCandle[]; weeklyError: string; dailyError: string; loading: boolean };

function MiniChart({ title, candles, error, loading }: { title: string; candles: ChartCandle[]; error: string; loading: boolean }) {
  if (loading) return <div className="analysis-mini-chart"><h3>{title}</h3><p>Loading candles…</p></div>;
  if (error) return <div className="analysis-mini-chart"><h3>{title}</h3><p role="alert">{error}</p></div>;
  if (!candles.length) return <div className="analysis-mini-chart"><h3>{title}</h3><p>No candles returned.</p></div>;
  const values = candles.map(candle => candle.close);
  const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length < 2 ? 50 : index * 100 / (values.length - 1);
    const y = 82 - (value - min) / spread * 70;
    return x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ");
  const last = values[values.length - 1];
  return <div className="analysis-mini-chart"><h3>{title}</h3><svg viewBox="0 0 100 90" role="img" aria-label={title + " close-price history"}><line x1="0" x2="100" y1="82" y2="82" stroke="#344256" strokeWidth=".7" /><polyline points={points} fill="none" stroke="#e5a45c" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg><p>Last close · {last.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · {candles.length} candles</p></div>;
}

function MultiStockAnalysis() {
  const [records, setRecords] = useState<MarketUniverseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("Loading stock universe…");
  const [stockStates, setStockStates] = useState<Record<string, PairState>>({});
  const [refresh, setRefresh] = useState(0);
  const industries = useMemo(() => getAnalysisIndustries(records), [records]);
  const matches = useMemo(() => filterAnalysisStocks(records, submittedQuery), [records, submittedQuery]);

  useEffect(() => {
    let active = true;
    void loadMarketUniverse().then(data => { if (active) { setRecords(data.records); setStatus(data.records.length + " stocks available · search by industry or symbol"); } })
      .catch(error => { if (active) setStatus(error instanceof Error ? error.message : "Unable to load stock universe."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!matches.length) { setStockStates({}); return () => { active = false; }; }
    setStockStates(Object.fromEntries(matches.map(record => [record.symbol, { weekly: [], daily: [], weeklyError: "", dailyError: "", loading: true }])));
    setStatus("Loading weekly and daily charts for " + matches.length + " stocks…");
    const timeframes: Array<[keyof Pick<PairState, "weekly" | "daily">, ChartTimeframe, "weeklyError" | "dailyError"]> = [["weekly", "1W", "weeklyError"], ["daily", "1D", "dailyError"]];
    void (async () => {
      for (let offset = 0; offset < matches.length; offset += 4) {
        const batch = matches.slice(offset, offset + 4);
        await Promise.all(batch.map(async record => {
          const result: PairState = { weekly: [], daily: [], weeklyError: "", dailyError: "", loading: false };
          await Promise.all(timeframes.map(async ([field, timeframe, errorField]) => {
            try { result[field] = await fetchChartData(record.symbol, timeframe); }
            catch (error) { result[errorField] = error instanceof Error ? error.message : "Chart request failed"; }
          }));
          if (active) setStockStates(current => ({ ...current, [record.symbol]: result }));
        }));
      }
      if (active) setStatus("Finished · " + matches.length + " stocks · maximum " + MAX_ANALYSIS_STOCKS + " per search");
    })();
    return () => { active = false; };
  }, [matches, refresh]);

  function runSearch(value = query) { setQuery(value); setSubmittedQuery(value.trim()); }
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === "ArrowRight" || event.key === ".") {
      event.preventDefault();
      const next = nextAnalysisIndustry(industries, submittedQuery);
      if (next) runSearch(next);
    }
  }

  return <div className="analysis-content" onKeyDown={handleKeyDown}>
    <div className="eyebrow">SCHCAT / MULTI-STOCK ANALYSIS</div>
    <div className="analysis-heading"><div><h1>Multi-Stock Analysis</h1><p className="intro">Scan an industry or symbol substring and compare weekly and daily price action across up to 12 stocks.</p></div><button className="screener-button secondary" type="button" onClick={() => setRefresh(value => value + 1)} disabled={!matches.length}>Refresh charts</button></div>
    <form className="analysis-search-panel" onSubmit={event => { event.preventDefault(); runSearch(); }}>
      <label>Industry / Stock (substring)<input list="analysis-industries" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Electrical Equipment or ABB" /><datalist id="analysis-industries">{industries.map(industry => <option key={industry} value={industry} />)}</datalist></label>
      <button className="screener-button" type="submit">Go</button>
      <div className="analysis-status" aria-live="polite">{status}<br />Right Arrow or “.” cycles industries when focus is outside the search field.</div>
    </form>
    {!submittedQuery ? <div className="analysis-empty">Enter an industry or stock substring to load charts.</div> : matches.length === 0 ? <div className="analysis-empty">No stocks found for “{submittedQuery}”. Try a broader industry name or symbol.</div> : <div className="analysis-grid">{matches.map(record => {
      const state = stockStates[record.symbol] ?? { weekly: [], daily: [], weeklyError: "", dailyError: "", loading: true };
      return <article className="analysis-stock-card" key={record.symbol}><div className="analysis-stock-title"><strong>{record.symbol}</strong><span>{record.industry ?? "Industry unavailable"}</span></div><div className="analysis-chart-pair"><MiniChart title="WEEKLY" candles={state.weekly} error={state.weeklyError} loading={state.loading} /><MiniChart title="DAILY" candles={state.daily} error={state.dailyError} loading={state.loading} /></div></article>;
    })}</div>}
    <footer className="page-footer">SCHCATWEB <span>·</span> MULTI-STOCK ANALYSIS <span>·</span> LEGACY ANALYSISTAB</footer>
  </div>;
}

export default MultiStockAnalysis;
