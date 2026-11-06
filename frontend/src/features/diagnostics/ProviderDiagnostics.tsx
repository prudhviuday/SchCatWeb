import { useState } from "react";
import {
  runProviderDiagnostics,
  type ProviderProbeResult
} from "../../data/providers/providerDiagnostics";

const STATUS_LABELS: Record<ProviderProbeResult["status"], string> = {
  success: "Readable",
  "http-error": "HTTP error",
  "auth-or-policy": "Auth / access policy",
  "browser-blocked": "Site/API unreachable",
  timeout: "Timed out",
  "invalid-response": "Unexpected response"
};

function ProviderDiagnostics() {
  const [marketSmithStockId, setMarketSmithStockId] = useState("3159563");
  const [marketSmithSymbol, setMarketSmithSymbol] = useState("RVNL");
  const [results, setResults] = useState<ProviderProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const runAudit = async () => {
    if (running) return;
    setRunning(true);
    setResults([]);
    setStartedAt(new Date().toLocaleString());

    try {
      const nextResults = await runProviderDiagnostics({
        marketSmithStockId,
        marketSmithSymbol
      });
      setResults(nextResults);
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
          MarketSmith finance and symbol endpoints, the ChartInk CSRF + scan flow, NSE historical delivery data, and Yahoo chart data.
          The browser only talks to SchCatWeb; provider cookies and upstream requests stay inside the Worker.
        </p>
        <p>
          MarketSmith needs a current <code>ms-auth</code> value. Configure Cloudflare Worker secrets
          <code> MARKETSMITH_FINANCE_AUTH</code> and <code> MARKETSMITH_SYMBOL_AUTH</code>, or use the shared
          <code> MARKETSMITH_AUTH</code> secret. The old values in the desktop source may be expired.
          Never place these values in frontend code or paste them into chat.
        </p>
        <p>
          The results now include the upstream HTTP response returned by the Worker. This separates provider restrictions (401/403/520) from a failure to reach SchCatWeb itself.
        </p>
      </section>

      <section className="diagnostics-controls">
        <div className="diagnostics-input">
          <label htmlFor="ms-stock-id">MarketSmith stock ID</label>
          <input
            id="ms-stock-id"
            value={marketSmithStockId}
            onChange={(event) => setMarketSmithStockId(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
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
                {result.httpStatus !== undefined && <span>HTTP {result.httpStatus}</span>}
                <span>{result.elapsedMs} ms</span>
              </div>
            </article>
          ))
        )}
      </section>

      <footer className="diagnostics-footer">
        The diagnostic page does not read or store provider cookies or session tokens. MarketSmith credentials, when configured, are held as Cloudflare Worker secrets.
      </footer>
    </main>
  );
}

export default ProviderDiagnostics;
