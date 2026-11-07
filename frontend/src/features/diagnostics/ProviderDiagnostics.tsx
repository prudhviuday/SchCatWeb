import { useEffect, useState } from "react";
import {
  getMarketSmithId,
  loadMarketSmithIds,
  type MarketSmithIdMap
} from "../../data/reference/marketSmithIds";
import {
  clearStoredMarketSmithAuth,
  readStoredMarketSmithAuth,
  runProviderDiagnostics,
  saveStoredMarketSmithAuth,
  type ProviderProbeResult
} from "../../data/providers/providerDiagnostics";

const STATUS_LABELS: Record<ProviderProbeResult["status"], string> = {
  success: "Readable",
  "http-error": "HTTP error",
  "auth-or-policy": "Auth / access policy",
  "configuration-required": "Configuration required",
  "browser-blocked": "Site/API unreachable",
  timeout: "Timed out",
  "invalid-response": "Unexpected response"
};

function ProviderDiagnostics() {
  const [marketSmithIds, setMarketSmithIds] = useState<MarketSmithIdMap | null>(null);
  const [marketSmithIdsError, setMarketSmithIdsError] = useState("");
  const [marketSmithSymbol, setMarketSmithSymbol] = useState("RVNL");
  const [marketSmithAuth, setMarketSmithAuth] = useState("");
  const [marketSmithAuthMessage, setMarketSmithAuthMessage] = useState("Loading saved browser setting…");
  const [marketSmithAuthSaved, setMarketSmithAuthSaved] = useState(false);
  const marketSmithStockId = marketSmithIds
    ? String(getMarketSmithId(marketSmithIds, marketSmithSymbol) ?? "")
    : "";

  useEffect(() => {
    const savedAuth = readStoredMarketSmithAuth();
    setMarketSmithAuth(savedAuth);
    setMarketSmithAuthSaved(Boolean(savedAuth));
    setMarketSmithAuthMessage(savedAuth
      ? "MarketSmith value loaded from this browser."
      : "No MarketSmith value saved in this browser yet.");

    let active = true;
    loadMarketSmithIds()
      .then((ids) => {
        if (active) setMarketSmithIds(ids);
      })
      .catch((error: unknown) => {
        if (active) {
          setMarketSmithIdsError(
            error instanceof Error ? error.message : "Could not load MarketSmith instrument IDs."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const [results, setResults] = useState<ProviderProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [runError, setRunError] = useState("");

  const saveMarketSmithAuth = () => {
    try {
      const saved = saveStoredMarketSmithAuth(marketSmithAuth);
      setMarketSmithAuth(saved);
      setMarketSmithAuthSaved(true);
      setMarketSmithAuthMessage("Saved locally in this browser.");
    } catch (error) {
      setMarketSmithAuthSaved(false);
      setMarketSmithAuthMessage(error instanceof Error ? error.message : "Could not save the value in this browser.");
    }
  };

  const clearMarketSmithAuth = () => {
    try {
      clearStoredMarketSmithAuth();
      setMarketSmithAuth("");
      setMarketSmithAuthSaved(false);
      setMarketSmithAuthMessage("Removed from this browser.");
    } catch {
      setMarketSmithAuthMessage("Could not clear the saved browser value.");
    }
  };

  const runAudit = async () => {
    if (running) return;
    const savedAuth = readStoredMarketSmithAuth();
    if (marketSmithAuth !== savedAuth) {
      setMarketSmithAuthMessage("Save your MarketSmith value in this browser before running diagnostics.");
      return;
    }
    setRunning(true);
    setResults([]);
    setRunError("");
    setStartedAt(new Date().toLocaleString());

    try {
      const nextResults = await runProviderDiagnostics({
        marketSmithStockId,
        marketSmithSymbol,
        marketSmithAuth: savedAuth
      });
      setResults(nextResults);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Diagnostics could not complete. Check the site connection and retry.");
    } finally {
      setRunning(false);
    }
  };

  const successCount = results.filter((result) => result.status === "success").length;

  return (
    <main className="diagnostics-shell">
      <header className="diagnostics-header">
        <div>
          <div className="eyebrow">SCHCATWEB / PROVIDER CHECK</div>
          <h1>Provider connectivity diagnostics</h1>
          <p className="diagnostics-intro">
            The page calls SchCatWeb's same-origin Worker API. The Worker contacts Yahoo, MarketSmith, ChartInk and NSE server-side, like the original desktop Node/Python app.
          </p>
        </div>
        <a className="diagnostics-back" href="/">Back to SchCat</a>
      </header>

      <section className="diagnostics-explainer">
        <h2>What this test checks</h2>
        <p>
          Worker health and route inventory, MarketSmith finance/symbol/relative-strength endpoints, the ChartInk CSRF + scan flow, NSE historical delivery data, and Yahoo chart data.
          The browser only talks to SchCatWeb; provider cookies and upstream requests stay inside the Worker.
        </p>
        <p>
          MarketSmith needs a current <code>ms-auth</code> value. Enter it in the browser-local field below.
          It is saved only in this browser and supplied to the SchCatWeb Worker for each MarketSmith request.
        </p>
        <p>
          Results distinguish the Worker HTTP status from the upstream provider status. A green check now requires the expected JSON fields, not merely HTTP 200.
        </p>
      </section>

      <section className="diagnostics-auth-panel">
        <div className="diagnostics-auth-heading">
          <div>
            <h2>MarketSmith session</h2>
            <p>Paste the value after <code>ms-auth=</code> from your working MarketSmith URL, or paste the full URL.</p>
          </div>
          <span className={marketSmithAuthSaved ? "diagnostics-auth-saved" : "diagnostics-auth-unsaved"}>
            {marketSmithAuthSaved ? "Saved in this browser" : "Not saved"}
          </span>
        </div>
        <div className="diagnostics-auth-row">
          <input
            id="ms-auth"
            type="password"
            value={marketSmithAuth}
            onChange={(event) => {
              setMarketSmithAuth(event.target.value);
              setMarketSmithAuthSaved(false);
              setMarketSmithAuthMessage("Unsaved changes. Save before running the MarketSmith checks.");
            }}
            placeholder="Paste MarketSmith ms-auth value or working URL"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={saveMarketSmithAuth}>Save in this browser</button>
          <button type="button" className="secondary" onClick={clearMarketSmithAuth}>Clear</button>
        </div>
        <p className="diagnostics-auth-message" aria-live="polite">{marketSmithAuthMessage}</p>
      </section>

      <section className="diagnostics-controls">
        <div className="diagnostics-input">
          <label htmlFor="ms-stock-id">MarketSmith instrument ID (from reference JSON)</label>
          <input
            id="ms-stock-id"
            value={marketSmithIdsError
              ? "Reference ID file unavailable"
              : marketSmithStockId || (marketSmithIds ? "No ID found for this symbol" : "Loading IDs…")}
            readOnly
            aria-live="polite"
          />
        </div>
        <div className="diagnostics-input">
          <label htmlFor="ms-symbol">MarketSmith symbol</label>
          <input
            id="ms-symbol"
            value={marketSmithSymbol}
            onChange={(event) => setMarketSmithSymbol(event.target.value.toUpperCase())}
            autoComplete="off"
          />
        </div>
        <button type="button" onClick={runAudit} disabled={running}>
          {running ? "Testing provider routes…" : "Run server-side diagnostics"}
        </button>
      </section>

      {startedAt && (
        <div className="diagnostics-run-meta" aria-live="polite">
          Last test started: {startedAt}
          {results.length > 0 && (
            <span>{successCount} of {results.length} checks returned readable responses</span>
          )}
        </div>
      )}

      {runError && <div className="diagnostics-run-error" role="alert">{runError}</div>}

      <section className="diagnostics-results" aria-live="polite">
        {results.length === 0 && !running ? (
          <div className="diagnostics-empty">
            <div className="notice-icon">⌁</div>
            <div>
              <h2>No tests run yet</h2>
              <p>Press “Run server-side diagnostics” to test the Worker-backed provider routes.</p>
            </div>
          </div>
        ) : (
          results.map((result) => (
            <article className="diagnostic-result" key={result.id}>
              <div className="diagnostic-result-top">
                <div>
                  <div className="diagnostic-provider">{result.provider}</div>
                  <h3>{result.title}</h3>
                </div>
                <span className={"diagnostic-status status-" + result.status}>
                  {STATUS_LABELS[result.status]}
                </span>
              </div>
              <p>{result.message}</p>
              <div className="diagnostic-meta">
                {result.httpStatus !== undefined && <span>Worker HTTP {result.httpStatus}</span>}
                {result.upstreamStatus !== undefined && <span>Upstream HTTP {result.upstreamStatus}</span>}
                <span>{result.elapsedMs} ms</span>
              </div>
            </article>
          ))
        )}
      </section>

      <footer className="diagnostics-footer">
        The MarketSmith value is kept in this browser's local storage, not in the static site files or Cloudflare settings. It is sent over HTTPS to the SchCatWeb Worker only when MarketSmith is requested. Clearing browser data or using another browser removes the saved setting.
      </footer>
    </main>
  );
}

export default ProviderDiagnostics;
