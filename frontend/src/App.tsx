import { useState } from "react";
import ProviderDiagnostics from "./features/diagnostics/ProviderDiagnostics";
import StockScreener from "./features/screener/StockScreener";
import StockWorkspace from "./features/charts/StockWorkspace";
import IndustryAnalysis from "./features/industry/IndustryAnalysis";
import Research from "./features/research/Research";
import MarketPulse from "./features/marketPulse/MarketPulse";
import Portfolio from "./features/portfolio/Portfolio";
import type { MarketUniverseRecord } from "./data/reference/marketUniverse";

type Page = "overview" | "screener" | "workspace" | "industry" | "research" | "pulse" | "portfolio";

function App() {
  const [activePage, setActivePage] = useState<Page>("overview");
  const [selectedStock, setSelectedStock] = useState<MarketUniverseRecord | null>(null);

  if (new URLSearchParams(window.location.search).get("diagnostics") === "providers") {
    return <ProviderDiagnostics />;
  }

  const openStock = (record: MarketUniverseRecord) => {
    setSelectedStock(record);
    setActivePage("workspace");
  };

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
          <button type="button" className={"nav-item " + (activePage === "workspace" ? "active" : "")} onClick={() => setActivePage("workspace")}>
            <span className="nav-icon">◫</span> Charts & Workspace
          </button>
          <button type="button" className={"nav-item " + (activePage === "industry" ? "active" : "")} onClick={() => setActivePage("industry")}><span className="nav-icon">▤</span> Industry Analysis</button>
          <button type="button" className={"nav-item " + (activePage === "research" ? "active" : "")} onClick={() => setActivePage("research")}><span className="nav-icon">⌁</span> Research</button>
          <button type="button" className={"nav-item " + (activePage === "pulse" ? "active" : "")} onClick={() => setActivePage("pulse")}><span className="nav-icon">◷</span> Market Pulse</button>
          <button type="button" className={"nav-item " + (activePage === "portfolio" ? "active" : "")} onClick={() => setActivePage("portfolio")}><span className="nav-icon">▣</span> Portfolio</button>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {activePage === "screener" ? "SCREENER ONLINE" : activePage === "workspace" ? "WORKSPACE ONLINE" : activePage === "pulse" ? "MARKET PULSE ONLINE" : activePage === "portfolio" ? "PORTFOLIO ONLINE" : "MIGRATION IN PROGRESS"}
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">SCHCAT <span>/</span> {activePage === "screener" ? "STOCK SCREENER" : activePage === "workspace" ? "CHARTS & WORKSPACE" : activePage === "industry" ? "INDUSTRY ANALYSIS" : activePage === "research" ? "RESEARCH" : activePage === "pulse" ? "MARKET PULSE" : activePage === "portfolio" ? "PORTFOLIO" : "OVERVIEW"}</div>
          <div className="topbar-right"><span className="market-status"><i /> LOCAL WORKSPACE</span><div className="avatar">U</div></div>
        </header>

        {activePage === "portfolio" ? (
          <Portfolio />
        ) : activePage === "pulse" ? (
          <MarketPulse />
        ) : activePage === "research" ? (
          <Research />
        ) : activePage === "industry" ? (
          <IndustryAnalysis onOpenStock={openStock} />
        ) : activePage === "screener" ? (
          <StockScreener onOpenStock={openStock} />
        ) : activePage === "workspace" ? (
          <StockWorkspace initialRecord={selectedStock} onBack={() => setActivePage("screener")} />
        ) : (
          <div className="content">
            <div className="eyebrow">PERSONAL MARKET WORKSPACE</div>
            <h1>Good evening.</h1>
            <p className="intro">Your research terminal is being prepared.</p>

            <div className="notice-card">
              <div className="notice-icon">✳</div>
              <div>
                <div className="notice-title">SchCatWeb foundation is live</div>
                <p>The static terminal now includes a stock screener and a multi-timeframe chart workspace. Provider-dependent fundamentals and remaining modules are being migrated in stages.</p>
              </div>
              <span className="step-tag">STEP 17</span>
            </div>

            <div className="section-heading">
              <div><div className="eyebrow">WORKSPACE MODULES</div><h2>Available modules</h2></div>
              <span className="muted-label">MIGRATION IN PROGRESS</span>
            </div>
            <div className="module-grid">
              <button type="button" className="module-card module-card-button" onClick={() => setActivePage("screener")}>
                <span className="module-number">01</span>
                <div><h3>Stock Screener</h3><p>Universe, filters and query intersections</p></div>
                <span className="module-arrow">↗</span>
              </button>
              <button type="button" className="module-card module-card-button" onClick={() => setActivePage("workspace")}>
                <span className="module-number">02</span>
                <div><h3>Charts & Workspace</h3><p>Weekly, daily, hourly and 5-minute charts</p></div>
                <span className="module-arrow">↗</span>
              </button>
              {[
                ["03", "Industry Analysis", "Industry strength and participation"],
                ["04", "Research", "Historical query performance"],
                ["05", "Market Pulse", "Market breadth and signal dashboard"],
                ["06", "Portfolio", "Holdings and P&L analytics"]
              ].map(([number, title, description]) => (
                number === "06" ? (
                  <button type="button" className="module-card module-card-button" key={number} onClick={() => setActivePage("portfolio")}>
                    <span className="module-number">{number}</span>
                    <div><h3>{title}</h3><p>{description}</p></div>
                    <span className="module-arrow">↗</span>
                  </button>
                ) : (
                  <article className="module-card" key={number}>
                    <span className="module-number">{number}</span>
                    <div><h3>{title}</h3><p>{description}</p></div>
                    <span className="module-arrow">↗</span>
                  </article>
                )}
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
