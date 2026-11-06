import { useState } from "react";
import ProviderDiagnostics from "./features/diagnostics/ProviderDiagnostics";
import StockScreener from "./features/screener/StockScreener";

type Page = "overview" | "screener";

function App() {
  const [activePage, setActivePage] = useState<Page>("overview");

  if (new URLSearchParams(window.location.search).get("diagnostics") === "providers") {
    return <ProviderDiagnostics />;
  }

  return (
    <main className="terminal-shell">
      <aside className="sidebar">
        <div className="brand-mark">SC</div>
        <div className="brand-copy">
          <span className="brand-name">SchCat</span>
          <span className="brand-caption">MARKET TERMINAL</span>
        </div>
        <div className="sidebar-rule" />
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button type="button" className={"nav-item " + (activePage === "overview" ? "active" : "")} onClick={() => setActivePage("overview")}>
            <span className="nav-icon">▦</span> Overview
          </button>
          <button type="button" className={"nav-item " + (activePage === "screener" ? "active" : "")} onClick={() => setActivePage("screener")}>
            <span className="nav-icon">⌕</span> Stock Screener
          </button>
          <div className="nav-item nav-coming-soon"><span className="nav-icon">◫</span> Charts</div>
          <div className="nav-item nav-coming-soon"><span className="nav-icon">▤</span> Industry Analysis</div>
          <div className="nav-item nav-coming-soon"><span className="nav-icon">⌁</span> Research</div>
          <div className="nav-item nav-coming-soon"><span className="nav-icon">◷</span> Market Pulse</div>
          <div className="nav-item nav-coming-soon"><span className="nav-icon">▣</span> Portfolio</div>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {activePage === "screener" ? "SCREENER ONLINE" : "MIGRATION IN PROGRESS"}
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">SCHCAT <span>/</span> {activePage === "screener" ? "STOCK SCREENER" : "OVERVIEW"}</div>
          <div className="topbar-right"><span className="market-status"><i /> LOCAL WORKSPACE</span><div className="avatar">U</div></div>
        </header>

        {activePage === "screener" ? (
          <StockScreener />
        ) : (
          <div className="content">
            <div className="eyebrow">PERSONAL MARKET WORKSPACE</div>
            <h1>Good evening.</h1>
            <p className="intro">Your research terminal is being prepared.</p>

            <div className="notice-card">
              <div className="notice-icon">✳</div>
              <div>
                <div className="notice-title">SchCatWeb foundation is live</div>
                <p>The static terminal is now connected to the imported stock universe. Screener functionality is available; provider-dependent metrics and other modules are being migrated in stages.</p>
              </div>
              <span className="step-tag">STEP 12</span>
            </div>

            <div className="section-heading">
              <div><div className="eyebrow">WORKSPACE MODULES</div><h2>Coming online in stages</h2></div>
              <span className="muted-label">MIGRATION IN PROGRESS</span>
            </div>
            <div className="module-grid">
              <button type="button" className="module-card module-card-button" onClick={() => setActivePage("screener")}>
                <span className="module-number">01</span>
                <div><h3>Stock Screener</h3><p>Universe, filters and query intersections</p></div>
                <span className="module-arrow">↗</span>
              </button>
              {[
                ["02", "Charts & Workspace", "Price action and technical studies"],
                ["03", "Industry Analysis", "Industry strength and participation"],
                ["04", "Research", "Historical query performance"],
                ["05", "Market Pulse", "Market breadth and signal dashboard"],
                ["06", "Portfolio", "Holdings and P&L analytics"]
              ].map(([number, title, description]) => (
                <article className="module-card" key={number}>
                  <span className="module-number">{number}</span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                  <span className="module-arrow">↗</span>
                </article>
              ))}
            </div>
            <footer className="page-footer">SCHCATWEB <span>·</span> PERSONAL BUILD <span>·</span> FOUNDATION</footer>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
