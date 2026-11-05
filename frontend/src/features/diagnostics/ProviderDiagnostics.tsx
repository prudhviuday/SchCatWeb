import { useState } from "react";
import {
  runProviderDiagnostics,
  type ProviderProbeResult
} from "../../data/providers/providerDiagnostics";

const STATUS_LABELS: Record<ProviderProbeResult["status"], string> = {
  success: "Readable",
  "http-error": "HTTP error",
  "auth-or-policy": "Auth / access policy",
  "browser-blocked": "Browser blocked",
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
          <div className="eyebrow">SCHCATWEB / STEP 08</div>
          <h1>Provider connectivity diagnostics</h1>
          <p className="diagnostics-intro">
            These checks run in this browser from the live SchCatWeb origin. They do not use a server proxy.
          </p>
        </div>
        <a className="diagnostics-back" href="/">Back to SchCat</a>
      </header>

      <section className="diagnostics-explainer">
        <h2>What this test checks</h2>
        <p>
          MarketSmith finance and symbol endpoints, the ChartInk CSRF + scan flow, and NSE historical delivery data.
          Browser cookies are only offered to the matching provider through normal fetch credentials. This page never reads,
          saves, or displays cookies.
        </p>
        <p>
          The legacy desktop code contains hard-coded <code>ms-auth</code> query values. They are deliberately not copied
          into public JavaScript. An authentication failure therefore means the provider requires a supported sign-in/session
          flow or a protected credential that must not be embedded in the website.
        </p>
        <p>
          Browser errors can be caused by CORS, network filtering, or third-party-cookie policy. JavaScript cannot reliably
          tell those apart; the DevTools Console provides the provider's specific browser error.
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
          {running ? "Testing providers…" : "Run browser diagnostics"}
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
              <p>Press “Run browser diagnostics” to send the provider requests from this page.</p>
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
        No provider results, credentials, cookies, or session tokens are stored by this diagnostic page.
      </footer>
    </main>
  );
}

export default ProviderDiagnostics;
