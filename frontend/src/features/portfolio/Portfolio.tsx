import { useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { fetchChartData, type ChartTimeframe, type ChartCandle } from "../../data/providers/chartData";
import {
  PORTFOLIO_SCHEMA_VERSION,
  PORTFOLIO_STORAGE_KEY,
  PORTFOLIO_TIMEFRAMES,
  aggregatePortfolioCandles,
  calculateHoldingMetrics,
  calculatePortfolioSummary,
  createPortfolioHolding,
  exportPortfolioCsv,
  exportPortfolioJson,
  formatPortfolioCurrency,
  formatPortfolioPercent,
  mergePortfolioHoldings,
  parsePortfolioImport,
  validatePortfolioHoldings,
  type PortfolioCandle,
  type PortfolioHolding
} from "./portfolio";

const TIMEFRAME_LABELS: Record<ChartTimeframe, string> = {
  "1W": "Weekly", "1D": "Daily", "1H": "Hourly", "5m": "5-minute", "15m": "15-minute", "4H": "4-hour"
};

type PortfolioChartState = {
  rows: PortfolioCandle[];
  status: "idle" | "ready" | "empty";
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function PnlChart({ rows, title }: { rows: PortfolioCandle[]; title: string }) {
  if (!rows.length) return <div className="portfolio-chart-empty">No chart history available. Check provider access and holdings symbols.</div>;
  const width = 720;
  const height = 220;
  const left = 12;
  const right = 12;
  const top = 18;
  const bottom = 180;
  const values = rows.flatMap((row) => [row.high, row.low, row.close, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const yMin = min - spread * 0.08;
  const yMax = max + spread * 0.08;
  const xAt = (index: number) => left + (rows.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (rows.length - 1));
  const yAt = (value: number) => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
  const closePath = rows.map((row, index) => xAt(index).toFixed(2) + "," + yAt(row.close).toFixed(2)).join(" ");
  const candleWidth = Math.max(1, Math.min(7, (width - left - right) / rows.length * 0.62));
  const zeroY = yAt(0);
  return (
    <div className="portfolio-chart-graphic">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title + " aggregate unrealized P&L contribution chart"}>
        {[0, 1, 2, 3].map((tick) => {
          const y = top + tick * (bottom - top) / 3;
          const value = yMax - tick * (yMax - yMin) / 3;
          return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} className="portfolio-chart-gridline" /><text x={left + 3} y={y - 4} className="portfolio-chart-label">{Math.round(value).toLocaleString("en-IN")}</text></g>;
        })}
        <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="portfolio-chart-zero" />
        {rows.map((row, index) => <g key={row.time}><line x1={xAt(index)} x2={xAt(index)} y1={yAt(row.high)} y2={yAt(row.low)} className={row.close >= row.open ? "portfolio-chart-positive-wick" : "portfolio-chart-negative-wick"} /><rect x={xAt(index) - candleWidth / 2} y={yAt(Math.max(row.open, row.close))} width={candleWidth} height={Math.max(1, Math.abs(yAt(row.open) - yAt(row.close)))} className={row.close >= row.open ? "portfolio-chart-positive-body" : "portfolio-chart-negative-body"} /></g>)}
        <polyline points={closePath} className="portfolio-chart-close" />
        <text x={left} y={height - 9} className="portfolio-chart-label">{rows[0].date}</text>
        <text x={width - right} y={height - 9} textAnchor="end" className="portfolio-chart-label">{rows[rows.length - 1].date}</text>
      </svg>
      <div className="portfolio-chart-footer"><span>{rows.length} bars</span><strong className={rows[rows.length - 1].close >= 0 ? "positive-value" : "negative-value"}>{formatPortfolioCurrency(rows[rows.length - 1].close)}</strong><span>Latest aggregate unrealised P&amp;L</span></div>
    </div>
  );
}

function Portfolio() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [charts, setCharts] = useState<Record<string, PortfolioChartState>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [chartError, setChartError] = useState("");
  const [chartLoading, setChartLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
        if (root && root.version !== undefined && root.version !== PORTFOLIO_SCHEMA_VERSION) {
          throw new Error("Saved portfolio uses an unsupported version. Export it before replacing browser storage.");
        }
        setHoldings(validatePortfolioHoldings(Array.isArray(parsed) ? parsed : root?.holdings ?? []));
      }
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not read local portfolio storage.");
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady || storageError) return;
    try {
      window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify({
        version: PORTFOLIO_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        holdings
      }));
      setStorageError("");
    } catch {
      setStorageError("Browser storage is unavailable or full. Export your holdings to keep a backup.");
    }
  }, [holdings, storageReady]);

  const summary = useMemo(() => calculatePortfolioSummary(holdings, prices), [holdings, prices]);
  const hasAllPrices = holdings.length > 0 && holdings.every((holding) => prices[holding.symbol] !== undefined && prices[holding.symbol] !== null);

  function resetForm() {
    setEditingId(null);
    setSymbol("");
    setQuantity("");
    setBuyPrice("");
    setFormError("");
  }

  function submitHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormMessage("");
    try {
      const holding = createPortfolioHolding(symbol, quantity, buyPrice, editingId ?? undefined);
      if (editingId) {
        setHoldings((current) => current.map((item) => item.id === editingId ? holding : item));
        setFormMessage(holding.symbol + " holding updated.");
      } else {
        if (holdings.some((item) => item.symbol === holding.symbol)) {
          throw new TypeError("This symbol already exists. Edit its existing holding instead.");
        }
        setHoldings((current) => [...current, holding]);
        setFormMessage(holding.symbol + " added to your portfolio.");
      }
      setPrices((current) => { const next = { ...current }; delete next[holding.symbol]; return next; });
      setCharts({});
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this holding.");
    }
  }

  function startEdit(holding: PortfolioHolding) {
    setEditingId(holding.id);
    setSymbol(holding.symbol);
    setQuantity(String(holding.quantity));
    setBuyPrice(String(holding.buyPrice));
    setFormError("");
    setFormMessage("");
    document.getElementById("portfolio-holding-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function removeHolding(holding: PortfolioHolding) {
    if (!window.confirm("Remove " + holding.symbol + " from this browser's portfolio?")) return;
    setHoldings((current) => current.filter((item) => item.id !== holding.id));
    setPrices((current) => { const next = { ...current }; delete next[holding.symbol]; return next; });
    setCharts({});
    if (editingId === holding.id) resetForm();
    setFormMessage(holding.symbol + " removed.");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormError("");
    setFormMessage("");
    try {
      const imported = parsePortfolioImport(await file.text(), file.name);
      const next = importMode === "replace" ? imported.holdings : mergePortfolioHoldings(holdings, imported.holdings);
      setHoldings(next);
      setStorageError("");
      setPrices({});
      setCharts({});
      setFormMessage(imported.holdings.length + " holdings imported (" + (importMode === "replace" ? "replaced" : "merged by symbol") + ").");
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not import this file.");
    } finally {
      event.target.value = "";
    }
  }

  async function refreshPortfolioCharts() {
    if (!holdings.length || chartLoading) return;
    setChartLoading(true);
    setChartError("");
    setCharts({});
    const tasks = PORTFOLIO_TIMEFRAMES.flatMap((timeframe) => holdings.map((holding) => ({ timeframe, holding })));
    const result: Record<string, Record<string, readonly ChartCandle[]>> = Object.fromEntries(PORTFOLIO_TIMEFRAMES.map((timeframe) => [timeframe, {}]));
    const failures: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++];
        try {
          result[task.timeframe][task.holding.symbol] = await fetchChartData(task.holding.symbol, task.timeframe, { timeoutMs: 15_000 });
        } catch (error) {
          failures.push(task.holding.symbol + " " + TIMEFRAME_LABELS[task.timeframe] + ": " + (error instanceof Error ? error.message : "provider error"));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()));
    const nextCharts: Record<string, PortfolioChartState> = {};
    for (const timeframe of PORTFOLIO_TIMEFRAMES) {
      const rows = aggregatePortfolioCandles(holdings, result[timeframe]);
      nextCharts[timeframe] = { rows, status: rows.length ? "ready" : "empty" };
    }
    const dailyPrices: Record<string, number | null> = {};
    for (const holding of holdings) {
      const daily = result["1D"][holding.symbol] ?? [];
      dailyPrices[holding.symbol] = daily.length ? daily[daily.length - 1].close : null;
    }
    setPrices(dailyPrices);
    setCharts(nextCharts);
    if (failures.length) {
      const uniqueFailedSymbols = [...new Set(failures.map((item) => item.split(" ")[0]))];
      setChartError(failures.length + " timeframe request(s) failed across " + uniqueFailedSymbols.length + " holding(s). Available symbols are still included; check Yahoo Finance browser CORS/access. " + failures.slice(0, 3).join(" · "));
    } else {
      setChartError("");
    }
    setChartLoading(false);
  }

  const latestPriceCount = holdings.filter((holding) => prices[holding.symbol] !== undefined && prices[holding.symbol] !== null).length;

  return (
    <div className="portfolio-content">
      <div className="eyebrow">SCHCAT / PERSONAL HOLDINGS</div>
      <div className="portfolio-heading">
        <div><h1>Portfolio</h1><p>Track invested capital, unrealised P&amp;L and the synthetic portfolio chart. Your holdings stay in this browser.</p></div>
        <div className="portfolio-heading-actions">
          <button type="button" className="portfolio-secondary-button" onClick={() => downloadText("schcat-portfolio.json", exportPortfolioJson(holdings), "application/json")} disabled={!holdings.length}>Export JSON</button>
          <button type="button" className="portfolio-secondary-button" onClick={() => downloadText("schcat-portfolio.csv", exportPortfolioCsv(holdings), "text/csv;charset=utf-8")} disabled={!holdings.length}>Export CSV</button>
        </div>
      </div>

      <div className="portfolio-privacy-note"><strong>Private local data</strong><span>Holdings are saved in this browser's local storage only. They are not uploaded, published as static files or synced to another device. Keep an exported backup if you clear browser data.</span></div>
      {storageError && <div className="portfolio-alert" role="alert">{storageError}</div>}

      <div className="portfolio-summary-grid">
        <div className="portfolio-summary-card"><span>HOLDINGS</span><strong>{summary.holdingCount}</strong><small>Unique stock symbols</small></div>
        <div className="portfolio-summary-card"><span>INVESTED CAPITAL</span><strong>{formatPortfolioCurrency(summary.invested)}</strong><small>Quantity × average buy price</small></div>
        <div className="portfolio-summary-card"><span>CURRENT VALUE</span><strong>{formatPortfolioCurrency(summary.currentValue)}</strong><small>{hasAllPrices ? "Latest available daily close" : "Refresh charts to fetch prices"}</small></div>
        <div className="portfolio-summary-card"><span>UNREALISED P&amp;L</span><strong className={summary.unrealizedPnl === null ? "" : summary.unrealizedPnl >= 0 ? "positive-value" : "negative-value"}>{formatPortfolioCurrency(summary.unrealizedPnl)}</strong><small>{formatPortfolioPercent(summary.unrealizedPnlPct)} return on cost</small></div>
      </div>

      <section className="portfolio-panel">
        <div className="portfolio-panel-heading"><div><div className="eyebrow">HOLDINGS REGISTER</div><h2>Your holdings</h2><p>{holdings.length} position(s) · {latestPriceCount} with a latest daily price</p></div><button type="button" className="portfolio-primary-button" onClick={() => void refreshPortfolioCharts()} disabled={!holdings.length || chartLoading}>{chartLoading ? "Fetching prices…" : "↻ Refresh prices & charts"}</button></div>
        <div className="portfolio-table-scroll">
          <table className="portfolio-table">
            <thead><tr><th>Symbol</th><th>Quantity</th><th>Buy price</th><th>Invested</th><th>Latest price</th><th>Current value</th><th>Unrealised P&amp;L</th><th>Return</th><th>Actions</th></tr></thead>
            <tbody>
              {holdings.map((holding) => {
                const metrics = calculateHoldingMetrics(holding, prices[holding.symbol]);
                return <tr key={holding.id}>
                  <td><strong>{holding.symbol}</strong></td><td>{holding.quantity.toLocaleString("en-IN")}</td><td>{formatPortfolioCurrency(holding.buyPrice)}</td><td>{formatPortfolioCurrency(metrics.invested)}</td><td>{formatPortfolioCurrency(prices[holding.symbol])}</td><td>{formatPortfolioCurrency(metrics.currentValue)}</td>
                  <td className={metrics.unrealizedPnl === null ? "" : metrics.unrealizedPnl >= 0 ? "positive-value" : "negative-value"}>{formatPortfolioCurrency(metrics.unrealizedPnl)}</td>
                  <td className={metrics.unrealizedPnlPct === null ? "" : metrics.unrealizedPnlPct >= 0 ? "positive-value" : "negative-value"}>{formatPortfolioPercent(metrics.unrealizedPnlPct)}</td>
                  <td><div className="portfolio-row-actions"><button type="button" onClick={() => startEdit(holding)}>Edit</button><button type="button" className="portfolio-delete-action" onClick={() => removeHolding(holding)}>Remove</button></div></td>
                </tr>;
              })}
              {!holdings.length && <tr><td colSpan={9} className="portfolio-empty-cell">No holdings yet. Add your first position below or import a CSV/JSON backup.</td></tr>}
            </tbody>
          </table>
        </div>
        {chartError && <div className="portfolio-alert" role="status">{chartError}</div>}
      </section>

      <div className="portfolio-management-grid">
        <section className="portfolio-panel" id="portfolio-holding-form">
          <div className="eyebrow">{editingId ? "UPDATE POSITION" : "ADD POSITION"}</div><h2>{editingId ? "Edit holding" : "Add a holding"}</h2>
          <form className="portfolio-form" onSubmit={submitHolding}>
            <label>Stock symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="e.g. RVNL" autoComplete="off" required /></label>
            <div className="portfolio-form-row"><label>Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Shares" required /></label><label>Average buy price (₹)<input type="number" min="0.000001" step="any" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} placeholder="₹ per share" required /></label></div>
            {formError && <div className="portfolio-form-error" role="alert">{formError}</div>}
            {formMessage && <div className="portfolio-form-message" role="status">{formMessage}</div>}
            <div className="portfolio-form-actions"><button className="portfolio-primary-button" type="submit">{editingId ? "Save changes" : "Add holding"}</button>{editingId && <button type="button" className="portfolio-secondary-button" onClick={resetForm}>Cancel edit</button>}</div>
          </form>
        </section>

        <section className="portfolio-panel">
          <div className="eyebrow">BACKUP & RESTORE</div><h2>Import holdings</h2>
          <p className="portfolio-help">Import a CSV with Symbol, Quantity and Buy Price columns, or a SchCat JSON backup. Merge updates matching symbols; replace overwrites this browser's holdings.</p>
          <label className="portfolio-import-mode">Import behaviour<select value={importMode} onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}><option value="merge">Merge by symbol</option><option value="replace">Replace all holdings</option></select></label>
          <input ref={fileRef} className="portfolio-file-input" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void importFile(event)} />
          <button type="button" className="portfolio-secondary-button" onClick={() => fileRef.current?.click()}>Choose CSV or JSON file</button>
          <div className="portfolio-import-hint">Import runs entirely in your browser. No file is uploaded.</div>
        </section>
      </div>

      <section className="portfolio-panel portfolio-charts-panel">
        <div className="portfolio-panel-heading"><div><div className="eyebrow">SYNTHETIC PORTFOLIO PERFORMANCE</div><h2>Aggregate unrealised P&amp;L charts</h2><p>Legacy SchCat logic: quantity × (OHLC − buy price), aligned by timestamp and forward-filled per holding.</p></div><span className="portfolio-chart-status">{Object.values(charts).filter((item) => item.status === "ready").length}/4 timeframes ready</span></div>
        {!Object.keys(charts).length && <div className="portfolio-chart-prompt">{holdings.length ? "Refresh prices & charts to build the four portfolio timeframes." : "Add or import holdings before generating portfolio charts."}</div>}
        <div className="portfolio-chart-grid">
          {PORTFOLIO_TIMEFRAMES.map((timeframe) => {
            const state = charts[timeframe];
            return <article className="portfolio-chart-card" key={timeframe}><div className="portfolio-chart-title"><strong>{TIMEFRAME_LABELS[timeframe]}</strong><span>{timeframe}</span></div>{!state ? <div className="portfolio-chart-empty">Not loaded</div> : <PnlChart rows={state.rows} title={TIMEFRAME_LABELS[timeframe]} />}</article>;
          })}
        </div>
        <p className="portfolio-footnote">These charts show aggregate unrealised P&amp;L contribution, not portfolio market value or a time-weighted investment return. Holdings without provider data are excluded from that timeframe's synthetic chart. Latest price and P&amp;L cells remain blank until daily prices are fetched.</p>
      </section>
      <footer className="page-footer">SCHCATWEB <span>·</span> PORTFOLIO <span>·</span> BROWSER-LOCAL STORAGE</footer>
    </div>
  );
}

export default Portfolio;
