import { useState } from "react";
import ProviderDiagnostics from "./features/diagnostics/ProviderDiagnostics";
import StockScreener from "./features/screener/StockScreener";
import StockWorkspace from "./features/charts/StockWorkspace";
import IndustryAnalysis from "./features/industry/IndustryAnalysis";
import Research from "./features/research/Research";
import MarketPulse from "./features/marketPulse/MarketPulse";
import Portfolio from "./features/portfolio/Portfolio";
import MultiStockAnalysis from "./features/analysis/MultiStockAnalysis";
import type { MarketUniverseRecord } from "./data/reference/marketUniverse";

type Page = "overview" | "screener" | "workspace" | "industry" | "research" | "pulse" | "portfolio" | "analysis";

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
          <button type="button" className={"nav-item " + (activePage === "analysis" ? "active" : "")} onClick={() => setActivePage("analysis")}><span className="nav-icon">▥</span> Multi-Stock Analysis</button>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {activePage === "screener" ? "SCREENER ONLINE" : activePage === "workspace" ? "WORKSPACE ONLINE" : activePage === "pulse" ? "MARKET PULSE ONLINE" : activePage === "portfolio" ? "PORTFOLIO ONLINE" : activePage === "analysis" ? "ANALYSIS ONLINE" : activePage === "industry" ? "INDUSTRY ONLINE" : activePage === "research" ? "RESEARCH ONLINE" : "LOCAL WORKSPACE ONLINE"}
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">SCHCAT <span>/</span> {activePage === "screener" ? "STOCK SCREENER" : activePage === "workspace" ? "CHARTS & WORKSPACE" : activePage === "industry" ? "INDUSTRY ANALYSIS" : activePage === "research" ? "RESEARCH" : activePage === "pulse" ? "MARKET PULSE" : activePage === "portfolio" ? "PORTFOLIO" : activePage === "analysis" ? "MULTI-STOCK ANALYSIS" : "OVERVIEW"}</div>
          <div className="topbar-right"><span className="market-status"><i /> LOCAL WORKSPACE</span><div className="avatar">U</div></div>
        </header>

        {activePage === "analysis" ? (
          <MultiStockAnalysis />
        ) : activePage === "portfolio" ? (
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
            <h1>Market workspace.</h1>
            <p className="intro">Your research, screening, charts and portfolio tools are ready in one browser-based terminal.</p>

            <div className="notice-card">
              <div className="notice-icon">✳</div>
              <div>
                <div className="notice-title">SchCatWeb foundation is live</div>
                <p>Seven workspace modules are integrated. Market data is requested through the SchCatWeb Worker; personal watchlists and portfolio data stay in this browser.</p>
              </div>
              <span className="step-tag">STEP 39</span>
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
                ["03", "Industry Analysis", "Industry strength and participation", "industry"],
                ["04", "Research", "Historical query performance", "research"],
                ["05", "Market Pulse", "Market breadth and signal dashboard", "pulse"],
                ["06", "Portfolio", "Holdings and P&L analytics", "portfolio"],
                ["07", "Multi-Stock Analysis", "Compare weekly and daily charts across an industry", "analysis"]
              ].map(([number, title, description, page]) => (
                <button type="button" className="module-card module-card-button" key={number} onClick={() => setActivePage(page as Page)}>
                  <span className="module-number">{number}</span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                  <span className="module-arrow">↗</span>
                </button>
              ))}
            </div>
            <footer className="page-footer">SCHCATWEB <span>·</span> PERSONAL BUILD <span>·</span> STEP 39 INTEGRATION</footer>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
