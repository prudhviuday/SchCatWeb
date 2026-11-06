import { useCallback, useEffect, useState } from "react";
import {
  fetchMarketPulse,
  getMarketPulseCellColor,
  getMarketPulseTextColor,
  MARKET_PULSE_COLUMNS,
  type MarketPulseColumn,
  type MarketPulseRow
} from "./marketPulse.js";

function displayValue(value: string | number): string {
  return typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : value;
}

function MarketPulse() {
  const [rows, setRows] = useState<MarketPulseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketPulse();
      setRows(result.rows);
      setLastUpdated(result.fetchedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Market Pulse could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = globalThis.setInterval(() => { void refresh(); }, 60_000);
    return () => globalThis.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const latest = rows[0];
  const summaryColumns: MarketPulseColumn[] = ["4% bull", "4% bear", "5-day ratio", "10-day ratio", "q25 bull", "q25 bear"];

  return (
    <div className="pulse-content">
      <div className="eyebrow">MARKET CONDITION MONITOR</div>
      <div className="pulse-heading">
        <div>
          <h1>Market Pulse</h1>
          <p>Daily breadth, momentum extremes and multi-session participation across the ChartInk cash-market universe.</p>
        </div>
        <div className="pulse-actions">
          <label className="pulse-auto-toggle">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span>Auto-refresh · 60 sec</span>
          </label>
          <button className="pulse-refresh-button" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div className="pulse-source-note">
        <strong>Live provider data</strong>
        <span>Uses the original desktop ChartInk widget query and scoring thresholds. Data is fetched directly in this browser; no backend, proxy, cookies or session tokens are stored by SchCatWeb.</span>
      </div>

      {error && (
        <div className="pulse-error" role="alert">
          <strong>Market Pulse unavailable</strong>
          <span>{error}</span>
          <span>Provider access depends on ChartInk's current browser CORS, authentication and privacy policies. No sample values are substituted.</span>
        </div>
      )}

      <div className="pulse-summary-grid">
        {summaryColumns.map((column) => (
          <div className="pulse-summary-card" key={column}>
            <span>{column}</span>
            <strong>{latest ? displayValue(latest[column]) : "—"}</strong>
            <small>{latest ? "Latest returned session · " + latest.Date : "Waiting for provider data"}</small>
          </div>
        ))}
      </div>

      <section className="pulse-table-panel">
        <div className="pulse-table-heading">
          <div>
            <div className="eyebrow">HISTORICAL DASHBOARD</div>
            <h2>Market breadth history</h2>
            <p>{rows.length ? rows.length + " sessions · newest first" : "The desktop dashboard returns up to six sessions."}</p>
          </div>
          <div className="pulse-updated">{lastUpdated ? "Fetched " + new Date(lastUpdated).toLocaleTimeString() : "Not yet fetched"}</div>
        </div>
        <div className="pulse-legend">
          <span><i className="pulse-legend-strong" /> Very favourable</span>
          <span><i className="pulse-legend-good" /> Favourable</span>
          <span><i className="pulse-legend-soft" /> Below average</span>
          <span><i className="pulse-legend-weak" /> Weak</span>
        </div>
        <div className="pulse-table-scroll">
          <table className="pulse-table">
            <thead><tr>{MARKET_PULSE_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.Date + "-" + rowIndex}>
                  {MARKET_PULSE_COLUMNS.map((column) => {
                    const value = row[column];
                    const background = getMarketPulseCellColor(column, value);
                    return (
                      <td key={column} style={{ backgroundColor: background, color: getMarketPulseTextColor(background) }}>
                        {displayValue(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr><td className="pulse-empty-cell" colSpan={MARKET_PULSE_COLUMNS.length}>
                  {loading ? "Connecting to ChartInk and loading the dashboard…" : "No Market Pulse data loaded. Select Refresh to request the live dashboard."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="pulse-footnote">Cell colours and inclusive range boundaries are ported from Tabs/MarketPulseTab.py. Blank or out-of-range values remain neutral. The original 5-day and 10-day ratios are rounded to one decimal place.</p>
      </section>
      <footer className="page-footer">SCHCATWEB <span>·</span> MARKET PULSE <span>·</span> CHARTINK SOURCE</footer>
    </div>
  );
}

export default MarketPulse;
