import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketUniverseRecord } from "../../data/reference/marketUniverse";
import { loadMarketUniverse } from "../../data/reference/marketUniverse";
import { readStoredMarketSmithAuth } from "../../data/providers/providerDiagnostics";
import { runLiveIndustryAnalysis } from "./industryLive";
import {
  buildIndustryReferenceSummaries,
  filterIndustrySummaries,
  parseLegacyIndustryResults,
  serializeLegacyIndustryResults,
  type IndustryReferenceSummary,
  type LegacyIndustryResult
} from "./industryAnalysis";

function numberText(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function compactText(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function SeriesChart({
  title,
  values,
  type,
  fixedMax
}: {
  title: string;
  values: number[];
  type: "bar" | "line";
  fixedMax?: number;
}) {
  if (values.length === 0) {
    return (
      <div className="industry-series-card">
        <h4>{title}</h4>
        <div className="industry-series-empty">No saved series available for this industry.</div>
      </div>
    );
  }

  const width = 540;
  const height = 172;
  const left = 13;
  const right = 12;
  const top = 12;
  const bottom = 135;
  const maximum = fixedMax ?? Math.max(1, ...values) * 1.1;
  const minimum = fixedMax !== undefined ? 0 : Math.min(0, ...values);
  const range = maximum - minimum || 1;
  const xAt = (index: number) =>
    left + (values.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (values.length - 1));
  const yAt = (value: number) => bottom - ((value - minimum) / range) * (bottom - top);
  const ticks = [0, 1, 2, 3].map((step) => maximum - (maximum - minimum) * step / 3);
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const barWidth = Math.max(1, Math.min(9, (width - left - right) / values.length * .68));
  const pointString = values.map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(" ");
  const latest = values[values.length - 1];
  const first = values[0];

  return (
    <div className="industry-series-card">
      <div className="industry-series-title"><h4>{title}</h4><strong>{numberText(latest)}</strong></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, ${values.length} saved observations`}>
        {ticks.map((tick, index) => {
          const y = yAt(tick);
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={y} y2={y} className="industry-chart-grid" />
              <text x={left + 2} y={y - 3} className="industry-chart-axis">{numberText(tick)}</text>
            </g>
          );
        })}
        {type === "bar" ? values.map((value, index) => {
          const y = yAt(value);
          const zeroY = yAt(Math.max(minimum, 0));
          return (
            <rect
              key={index}
              x={xAt(index) - barWidth / 2}
              y={Math.min(y, zeroY)}
              width={barWidth}
              height={Math.max(1, Math.abs(zeroY - y))}
              className="industry-chart-bar"
              opacity={.55 + .45 * Math.min(1, Math.abs(value) / maxAbs)}
            />
          );
        }) : (
          <polyline points={pointString} className="industry-chart-line" />
        )}
        <text x={left} y={height - 7} className="industry-chart-axis">1</text>
        <text x={width / 2} y={height - 7} textAnchor="middle" className="industry-chart-axis">{Math.ceil(values.length / 2)}</text>
        <text x={width - right} y={height - 7} textAnchor="end" className="industry-chart-axis">{values.length}</text>
      </svg>
      <div className="industry-series-foot">
        <span>{values.length} observations · positional index</span>
        <span>First {numberText(first)}</span>
      </div>
    </div>
  );
}

function IndustryAnalysis({
  onOpenStock
}: {
  onOpenStock: (record: MarketUniverseRecord) => void;
}) {
  const [summaries, setSummaries] = useState<IndustryReferenceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [savedResults, setSavedResults] = useState<LegacyIndustryResult[]>([]);
  const [importError, setImportError] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveProgress, setLiveProgress] = useState({ completed: 0, total: 0, symbol: "" });
  const [liveError, setLiveError] = useState("");
  const [liveFailures, setLiveFailures] = useState<Array<{ symbol: string; message: string }>>([]);
  const [liveResultIndustries, setLiveResultIndustries] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loadMarketUniverse()
      .then((universe) => {
        if (!active) return;
        const next = buildIndustryReferenceSummaries(universe.records);
        setSummaries(next);
        setSelectedIndustry(next[0]?.industry ?? "");
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load stock reference data");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visibleIndustries = useMemo(
    () => filterIndustrySummaries(summaries, search),
    [summaries, search]
  );
  const activeIndustry = summaries.find((item) => item.industry === selectedIndustry) ?? null;
  const savedByName = useMemo(
    () => new Map(savedResults.map((result) => [result.industry, result])),
    [savedResults]
  );
  const activeSavedResult = selectedIndustry ? savedByName.get(selectedIndustry) ?? null : null;
  const totalStocks = summaries.reduce((sum, item) => sum + item.stockCount, 0);
  const importedCount = savedResults.length;

  async function runSelectedIndustryLive() {
    if (!activeIndustry || liveRunning) return;
    setLiveError("");
    setLiveFailures([]);
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setLiveError("A MarketSmith session is required. Open Provider Diagnostics, save your current ms-auth value, then return here.");
      return;
    }
    setLiveRunning(true);
    setLiveProgress({ completed: 0, total: activeIndustry.stocks.length, symbol: "" });
    try {
      const live = await runLiveIndustryAnalysis(activeIndustry.industry, activeIndustry.stocks, auth, {
        concurrency: 3,
        onProgress: (progress) => setLiveProgress(progress)
      });
      setSavedResults((current) => [
        ...current.filter((item) => item.industry !== live.result.industry),
        live.result
      ].sort((left, right) => left.industry.localeCompare(right.industry)));
      setLiveResultIndustries((current) => [...new Set([...current, live.result.industry])]);
      setLiveFailures(live.failures);
      setImportLabel("Live run · " + new Date().toLocaleString("en-IN"));
      if (live.successfulStocks === 0) {
        setLiveError("No constituents completed all four provider requests. Check the failure list and Provider Diagnostics.");
      } else if (live.failures.length > 0) {
        setLiveError(`Completed with partial coverage: ${live.successfulStocks}/${live.total} stocks contributed.`);
      }
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Live industry analysis failed");
    } finally {
      setLiveRunning(false);
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setImportError("");
    try {
      const raw: unknown = JSON.parse(await file.text());
      const parsed = parseLegacyIndustryResults(raw);
      setSavedResults(parsed);
      setLiveResultIndustries([]);
      setLiveFailures([]);
      setLiveError("");
      setImportLabel(file.name);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to read industry results file");
    }
  }

  function exportResults() {
    if (savedResults.length === 0) return;
    const blob = new Blob(
      [JSON.stringify(serializeLegacyIndustryResults(savedResults), null, 2)],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schcat-industry-analysis.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="industry-content">
      <div className="eyebrow">SCHCAT / INDUSTRY ANALYSIS</div>
      <div className="industry-heading">
        <div>
          <h1>Industry Analysis</h1>
          <p className="intro">Explore industry composition and review previously saved desktop analysis results.</p>
        </div>
        <div className="industry-heading-actions">
          <span className="industry-count">{loading ? "Loading…" : `${summaries.length} industries · ${totalStocks.toLocaleString("en-IN")} stocks`}</span>
          <button type="button" className="screener-button secondary" onClick={() => fileInput.current?.click()}>Import saved JSON</button>
          <button type="button" className="screener-button" onClick={exportResults} disabled={savedResults.length === 0}>Export JSON</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="industry-file-input"
            onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }}
          />
        </div>
      </div>

      <section className="industry-provider-notice">
        <strong>Live analysis uses your saved MarketSmith session.</strong>
        <span>
          Run one selected industry at a time. Each constituent is included only when MarketSmith institutional value and RS, Yahoo weekly close×volume, and NSE delivery/traded data all return successfully. Failed stocks are listed separately; missing provider data is never replaced with zero.
        </span>
        <a href="/?diagnostics=providers">Manage provider session ↗</a>
      </section>

      <section className="industry-toolbar">
        <label className="screener-field">
          <span>Filter industries</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type part of an industry name…" />
        </label>
        <div className="industry-import-status">
          {importedCount > 0
            ? <><strong>{importedCount} industry results available</strong><span>{importLabel} · local to this browser session</span></>
            : <><strong>No analysis results yet</strong><span>Run a live analysis or import a five-series desktop JSON file.</span></>}
        </div>
      </section>

      {importError && <div className="screener-error" role="alert">{importError}</div>}
      {loadError && <div className="screener-error" role="alert">{loadError}</div>}
      {liveError && <div className="screener-error" role="status">{liveError}</div>}
      {liveFailures.length > 0 && (
        <details className="industry-live-failures">
          <summary>{liveFailures.length} constituent provider failure(s)</summary>
          <ul>{liveFailures.map((failure) => <li key={failure.symbol}><strong>{failure.symbol}</strong> — {failure.message}</li>)}</ul>
        </details>
      )}

      <div className="industry-layout">
        <aside className="industry-list-panel">
          <div className="industry-list-header">
            <strong>Industries</strong>
            <span>{visibleIndustries.length}</span>
          </div>
          {visibleIndustries.map((item) => (
            <button
              type="button"
              className={item.industry === selectedIndustry ? "industry-list-item active" : "industry-list-item"}
              key={item.industry}
              onClick={() => setSelectedIndustry(item.industry)}
            >
              <span>{item.industry}</span>
              <small>{item.stockCount} stocks</small>
            </button>
          ))}
          {!loading && visibleIndustries.length === 0 && <div className="industry-no-results">No matching industries.</div>}
        </aside>

        <main className="industry-detail-panel">
          {!activeIndustry ? (
            <div className="workspace-empty"><h2>Select an industry</h2><p>Choose an industry from the list to inspect its stock members.</p></div>
          ) : (
            <>
              <section className="industry-overview-card">
                <div>
                  <div className="eyebrow">SELECTED INDUSTRY</div>
                  <h2>{activeIndustry.industry}</h2>
                  <p>{activeIndustry.stockCount} stocks in the imported reference universe</p>
                  <button type="button" className="screener-button" onClick={() => void runSelectedIndustryLive()} disabled={liveRunning}>
                    {liveRunning ? `Analyzing ${liveProgress.completed}/${liveProgress.total}…` : "Run live analysis"}
                  </button>
                  {liveRunning && <small className="screener-muted">Latest completed: {liveProgress.symbol || "Preparing requests"}</small>}
                </div>
                <div className="industry-overview-metrics">
                  <div><span>Stocks</span><strong>{activeIndustry.stockCount}</strong></div>
                  <div><span>Source Market Cap sum*</span><strong>{compactText(activeIndustry.marketCapTotal)}</strong></div>
                  <div><span>Missing Market Cap</span><strong>{activeIndustry.missingMarketCapCount}</strong></div>
                </div>
              </section>

              <section className="industry-stock-panel">
                <div className="industry-panel-heading">
                  <div><div className="eyebrow">INDUSTRY CONSTITUENTS</div><h3>Stocks in this industry</h3></div>
                  <span className="screener-muted">Click a symbol to open its workspace</span>
                </div>
                <div className="industry-stock-grid">
                  {activeIndustry.stocks.map((stock) => (
                    <button type="button" key={stock.symbol} onClick={() => onOpenStock(stock)}>
                      <strong>{stock.symbol}</strong>
                      <span>MarketSmith ID {stock.instrumentId ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="industry-history-section">
                <div className="industry-panel-heading">
                  <div><div className="eyebrow">INDUSTRY SERIES</div><h3>{activeSavedResult ? (liveResultIndustries.includes(selectedIndustry) ? "Latest live analysis" : "Imported historical analysis") : "No result for this industry"}</h3></div>
                  {activeSavedResult && <span className="industry-saved-tag">{liveResultIndustries.includes(selectedIndustry) ? "Live run" : "Loaded JSON"}</span>}
                </div>
                <div className="industry-measure-notes">
                  <span>Institutional measure = institutional shares × stock price / 1bn (not ownership %).</span>
                  <span>“Close × volume” is a turnover proxy (not revenue).</span>
                  <span>Provider series are aggregated by legacy positional alignment; x-axes are observation indexes, not calendar dates.</span>
                </div>
                <div className="industry-series-grid">
                  <SeriesChart
                    title="Institutional value (₹bn)"
                    values={activeSavedResult?.institutionalValueBillions ?? []}
                    type="bar"
                  />
                  <SeriesChart
                    title="Delivery percentage"
                    values={activeSavedResult?.deliveryPercent ?? []}
                    type="line"
                  />
                  <SeriesChart
                    title="Turnover proxy: close × volume (₹bn)"
                    values={activeSavedResult?.closeVolumeBillions ?? []}
                    type="line"
                  />
                  <SeriesChart
                    title="Market-cap-weighted industry RS"
                    values={activeSavedResult?.industryRelativeStrength ?? []}
                    type="line"
                    fixedMax={100}
                  />
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <footer className="industry-disclaimer">
        * Market Cap values come from an undated source workbook and are reference-only. Saved series are imported from a local JSON file and are not sent to a server.
      </footer>
      <footer className="page-footer">SCHCATWEB <span>·</span> INDUSTRY ANALYSIS <span>·</span> STEP 33</footer>
    </div>
  );
}

export default IndustryAnalysis;
