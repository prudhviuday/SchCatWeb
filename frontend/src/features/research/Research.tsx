import { useMemo, useRef, useState } from "react";
import { fetchChartInkHistory } from "../../data/providers/chartInkHistory";
import {
  createHistoricalMatchesTemplate,
  evaluateResearch,
  parseHistoricalMatchesJson,
  parsePerformanceCsv,
  parseQueriesCsv,
  serializeResearchResultsCsv,
  type ResearchMatchSet,
  type ResearchQuery,
  type ResearchResult
} from "./research";

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MatchChart({ results }: { results: ResearchResult[] }) {
  const chartResults = results.filter((result) => result.status === "ready");
  if (chartResults.length === 0) {
    return <div className="research-chart-empty">Import historical query results to display match percentages.</div>;
  }

  const width = Math.max(620, chartResults.length * 105);
  const height = 260;
  const left = 48;
  const right = 20;
  const top = 18;
  const bottom = 190;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const slot = plotWidth / chartResults.length;
  const barWidth = Math.min(48, slot * .6);

  return (
    <div className="research-chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Query match percentage comparison chart">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = bottom - tick / 100 * plotHeight;
          return (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y} y2={y} className="research-chart-grid" />
              <text x={left - 9} y={y + 3} textAnchor="end" className="research-chart-label">{tick}%</text>
            </g>
          );
        })}
        {chartResults.map((result, index) => {
          const x = left + slot * index + (slot - barWidth) / 2;
          const barHeight = result.matchPercent / 100 * plotHeight;
          const center = x + barWidth / 2;
          const label = result.query.length > 16 ? result.query.slice(0, 14) + "…" : result.query;
          return (
            <g key={result.query}>
              <rect x={x} y={bottom - barHeight} width={barWidth} height={barHeight} rx="3" className="research-chart-bar" />
              <text x={center} y={bottom - barHeight - 7} textAnchor="middle" className="research-chart-value">{result.matchPercent.toFixed(1)}%</text>
              <text x={center} y={bottom + 17} textAnchor="middle" className="research-chart-label">{label}</text>
            </g>
          );
        })}
        <text x={left} y={height - 9} className="research-chart-label">Each bar uses the historical query's unique symbol count as denominator</text>
      </svg>
    </div>
  );
}

function Research() {
  const [performanceSymbols, setPerformanceSymbols] = useState<string[]>([]);
  const [queries, setQueries] = useState<ResearchQuery[]>([]);
  const [history, setHistory] = useState<ResearchMatchSet[]>([]);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [performanceFile, setPerformanceFile] = useState("");
  const [queryFile, setQueryFile] = useState("");
  const [historyFile, setHistoryFile] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runNotice, setRunNotice] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState({ completed: 0, total: 0, query: "" });
  const [backtestFailures, setBacktestFailures] = useState<Array<{ query: string; message: string }>>([]);
  const performanceInput = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const historyInput = useRef<HTMLInputElement>(null);

  const historyByQuery = useMemo(
    () => new Map(history.map((item) => [item.queryName, item.symbols])),
    [history]
  );

  async function loadPerformance(file?: File) {
    if (!file) return;
    try {
      const parsed = parsePerformanceCsv(await file.text());
      setPerformanceSymbols(parsed);
      setPerformanceFile(file.name);
      setErrors((current) => ({ ...current, performance: "" }));
      setResults([]);
      setHasRun(false);
      setRunNotice("");
    } catch (error) {
      setErrors((current) => ({
        ...current,
        performance: error instanceof Error ? error.message : "Unable to read performance CSV"
      }));
    }
  }

  async function loadQueries(file?: File) {
    if (!file) return;
    try {
      const parsed = parseQueriesCsv(await file.text());
      setQueries(parsed);
      setQueryFile(file.name);
      setErrors((current) => ({ ...current, queries: "" }));
      setResults([]);
      setHasRun(false);
      setRunNotice("");
    } catch (error) {
      setErrors((current) => ({
        ...current,
        queries: error instanceof Error ? error.message : "Unable to read query definitions CSV"
      }));
    }
  }

  async function loadHistory(file?: File) {
    if (!file) return;
    try {
      const parsed = parseHistoricalMatchesJson(JSON.parse(await file.text()));
      setHistory(parsed);
      setHistoryFile(file.name);
      setErrors((current) => ({ ...current, history: "" }));
      setResults([]);
      setHasRun(false);
      setRunNotice("");
    } catch (error) {
      setErrors((current) => ({
        ...current,
        history: error instanceof Error ? error.message : "Unable to read historical matches JSON"
      }));
    }
  }

  async function runChartInkBacktests() {
    if (queries.length === 0 || backtestRunning) return;
    setBacktestRunning(true);
    setBacktestFailures([]);
    setRunNotice("Running ChartInk historical backtests sequentially. This may take some time for a large query file.");
    setBacktestProgress({ completed: 0, total: queries.length, query: "" });
    const completedHistory: ResearchMatchSet[] = [];
    const failures: Array<{ query: string; message: string }> = [];
    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      setBacktestProgress({ completed: index, total: queries.length, query: query.name });
      try {
        const historyResult = await fetchChartInkHistory(query.code);
        completedHistory.push({ queryName: query.name, symbols: historyResult.symbols });
      } catch (error) {
        failures.push({
          query: query.name,
          message: error instanceof Error ? error.message : "Unknown ChartInk backtest error"
        });
      }
      setBacktestProgress({ completed: index + 1, total: queries.length, query: query.name });
    }
    setHistory(completedHistory);
    setHistoryFile("Live ChartInk history · " + new Date().toLocaleString("en-IN"));
    setBacktestFailures(failures);
    if (performanceSymbols.length > 0 && completedHistory.length > 0) {
      const next = evaluateResearch({
        performanceSymbols,
        queries,
        historyByQuery: new Map(completedHistory.map((item) => [item.queryName, item.symbols]))
      });
      setResults(next);
      setHasRun(true);
    } else {
      setResults([]);
      setHasRun(false);
    }
    setRunNotice(
      failures.length > 0
        ? `Historical backtests finished: ${completedHistory.length}/${queries.length} succeeded; ${failures.length} failed. Failed queries remain unavailable, not 0% matches.`
        : `Historical backtests completed for all ${queries.length} queries. ${completedHistory.reduce((sum, item) => sum + item.symbols.length, 0).toLocaleString("en-IN")} unique query-symbol memberships collected.`
    );
    setBacktestRunning(false);
  }

  function runResearch() {
    if (performanceSymbols.length === 0 || queries.length === 0 || history.length === 0) {
      setRunNotice("Import all three files before evaluating research.");
      return;
    }
    const next = evaluateResearch({ performanceSymbols, queries, historyByQuery });
    setResults(next);
    setHasRun(true);
    const missing = next.filter((item) => item.status === "missing-history").length;
    setRunNotice(missing > 0
      ? `Research calculated. ${missing} query result(s) have no matching historical data and are marked unavailable.`
      : "Research completed using the imported historical match sets.");
  }

  const readyCount = results.filter((item) => item.status === "ready").length;
  const averageMatch = readyCount > 0
    ? results.filter((item) => item.status === "ready").reduce((sum, item) => sum + item.matchPercent, 0) / readyCount
    : null;

  return (
    <div className="research-content">
      <div className="eyebrow">SCHCAT / RESEARCH</div>
      <div className="research-heading">
        <div>
          <h1>Research</h1>
          <p className="intro">Compare historical ChartInk query universes with your stock performance list.</p>
        </div>
        <div className="research-heading-actions">
          <span className="research-count">{performanceSymbols.length ? `${performanceSymbols.length.toLocaleString("en-IN")} performance stocks` : "No performance file loaded"}</span>
          <button type="button" className="screener-button secondary" onClick={() => queryInput.current?.click()}>Import query CSV</button>
        </div>
      </div>

      <section className="research-provider-notice">
        <strong>Historical ChartInk backtests are connected.</strong>
        <span>
          Run the saved query clauses through ChartInk's backtest endpoint using the Cloudflare Worker. The app collects unique symbols across all returned dates, matching the desktop workflow. Queries run sequentially to avoid flooding the provider; failed queries are shown separately.
        </span>
        <a href="/?diagnostics=providers">Provider diagnostics ↗</a>
      </section>

      <section className="research-import-grid">
        <article className="research-import-card">
          <div className="research-import-number">01</div>
          <div className="eyebrow">PERFORMANCE FILE</div>
          <h3>Successful stock list</h3>
          <p>CSV exported from Excel with a <code>symbol</code> or <code>Stock</code> column.</p>
          <div className="research-file-status">{performanceFile || "No file selected"}</div>
          <button type="button" className="screener-button" onClick={() => performanceInput.current?.click()}>Choose performance CSV</button>
          <input ref={performanceInput} type="file" accept=".csv,text/csv" className="research-file-input" onChange={(event) => { void loadPerformance(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {errors.performance && <p className="research-file-error" role="alert">{errors.performance}</p>}
          {performanceSymbols.length > 0 && <div className="research-file-meta">{performanceSymbols.length.toLocaleString("en-IN")} unique symbols</div>}
        </article>

        <article className="research-import-card">
          <div className="research-import-number">02</div>
          <div className="eyebrow">QUERY DEFINITIONS</div>
          <h3>ChartInk queries</h3>
          <p>CSV with <code>QueryName, QueryCode</code> or <code>Name, Query</code> columns.</p>
          <div className="research-file-status">{queryFile || "No file selected"}</div>
          <button type="button" className="screener-button" onClick={() => queryInput.current?.click()}>Choose query CSV</button>
          <input ref={queryInput} type="file" accept=".csv,text/csv" className="research-file-input" onChange={(event) => { void loadQueries(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {errors.queries && <p className="research-file-error" role="alert">{errors.queries}</p>}
          {queries.length > 0 && <div className="research-file-meta">{queries.length.toLocaleString("en-IN")} query definitions</div>}
        </article>

        <article className="research-import-card">
          <div className="research-import-number">03</div>
          <div className="eyebrow">HISTORICAL MATCHES</div>
          <h3>Query history JSON</h3>
          <p>JSON mapping each query name to its historical unique stock-symbol array.</p>
          <div className="research-file-status">{historyFile || "No file selected"}</div>
          <button type="button" className="screener-button" onClick={() => historyInput.current?.click()}>Choose history JSON</button>
          <input ref={historyInput} type="file" accept=".json,application/json" className="research-file-input" onChange={(event) => { void loadHistory(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {errors.history && <p className="research-file-error" role="alert">{errors.history}</p>}
          {history.length > 0 && <div className="research-file-meta">{history.length.toLocaleString("en-IN")} historical query sets</div>}
        </article>
      </section>

      <section className="research-workflow">
        <div>
          <div className="eyebrow">HISTORICAL BACKTEST & PERFORMANCE</div>
          <h2>Build history and evaluate results</h2>
          <p>ChartInk query clauses are sent to the same-origin Worker for historical backtesting. Your performance CSV and results remain in this browser.</p>
        </div>
        <div className="research-workflow-actions">
          <button type="button" className="screener-button secondary" disabled={queries.length === 0 || backtestRunning} onClick={() => void runChartInkBacktests()}>
            {backtestRunning ? `Backtesting ${backtestProgress.completed}/${backtestProgress.total}…` : "Run ChartInk history"}
          </button>
          <button
            type="button"
            className="screener-button secondary"
            disabled={queries.length === 0}
            onClick={() => downloadText("schcat-historical-matches-template.json", createHistoricalMatchesTemplate(queries), "application/json;charset=utf-8")}
          >Download JSON template</button>
          <button
            type="button"
            className="screener-button secondary"
            disabled={history.length === 0}
            onClick={() => downloadText("schcat-historical-matches.json", JSON.stringify(Object.fromEntries(history.map((item) => [item.queryName, item.symbols])), null, 2), "application/json;charset=utf-8")}
          >Export history JSON</button>
          <button type="button" className="screener-button" onClick={runResearch}>Evaluate research</button>
        </div>
      </section>
      {runNotice && <div className="research-run-notice" role="status">{runNotice}</div>}
      {backtestRunning && (
        <div className="research-backtest-progress" role="status">
          <div><strong>ChartInk backtest progress</strong><span>{backtestProgress.completed}/{backtestProgress.total} queries · {backtestProgress.query || "Preparing first query"}</span></div>
          <div className="research-backtest-track"><span style={{ width: `${backtestProgress.total ? backtestProgress.completed / backtestProgress.total * 100 : 0}%` }} /></div>
        </div>
      )}
      {backtestFailures.length > 0 && (
        <details className="research-backtest-failures">
          <summary>{backtestFailures.length} historical query failure(s)</summary>
          <ul>{backtestFailures.map((failure) => <li key={failure.query}><strong>{failure.query}</strong> — {failure.message}</li>)}</ul>
        </details>
      )}

      {hasRun && (
        <>
          <section className="research-summary-grid">
            <div><span>Queries evaluated</span><strong>{results.length}</strong></div>
            <div><span>Historical results available</span><strong>{readyCount}</strong></div>
            <div><span>Performance universe</span><strong>{performanceSymbols.length.toLocaleString("en-IN")}</strong></div>
            <div><span>Average match %</span><strong>{averageMatch === null ? "—" : `${averageMatch.toFixed(2)}%`}</strong></div>
          </section>

          <section className="research-results-panel">
            <div className="research-results-heading">
              <div><div className="eyebrow">QUERY PERFORMANCE</div><h2>Research results</h2></div>
              <button type="button" className="screener-button secondary" onClick={() => downloadText("schcat-research-results.csv", serializeResearchResultsCsv(results), "text/csv;charset=utf-8")}>Export results CSV</button>
            </div>
            <div className="research-table-wrap">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Matches</th>
                    <th>Performance total</th>
                    <th>Query stocks (denominator)</th>
                    <th>Match %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.query}>
                      <td>{result.query}</td>
                      <td className="numeric">{result.matches}</td>
                      <td className="numeric">{result.total}</td>
                      <td className="numeric">{result.status === "missing-history" ? "—" : result.queryStocks}</td>
                      <td className="numeric research-percent">{result.status === "missing-history" ? "—" : `${result.matchPercent.toFixed(2)}%`}</td>
                      <td><span className={result.status === "ready" ? "research-status ready" : "research-status unavailable"}>{result.status === "ready" ? "Ready" : result.status === "missing-history" ? "No history" : "Empty query"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="research-chart-panel">
            <div className="eyebrow">VISUAL COMPARISON</div>
            <h2>Query vs Match Percentage</h2>
            <p>The percentage uses unique historical query stocks as its denominator, matching the desktop formula.</p>
            <MatchChart results={results} />
          </section>
        </>
      )}

      <section className="research-format-note">
        <strong>Historical JSON format</strong>
        <p>After importing the query CSV, download the template. For each query, populate its array with the unique stock symbols found across its historical ChartInk backtest dates. Example:</p>
        <pre>{'{\n  "High Growth": ["TCS", "INFY", "RELIANCE"],\n  "VCP Setup": ["BEL", "HAL"]\n}'}</pre>
        <p>Excel files should be saved as CSV before import. The original workbook with personal Watchlist and Portfolio sheets is not uploaded or published by this feature.</p>
      </section>

      <footer className="page-footer">SCHCATWEB <span>·</span> RESEARCH <span>·</span> STEP 34</footer>
    </div>
  );
}

export default Research;
