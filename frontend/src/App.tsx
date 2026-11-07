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

type Page = "screener" | "workspace" | "industry" | "research" | "pulse" | "portfolio" | "analysis";

const WORKSPACE_TABS: ReadonlyArray<{ page: Page; label: string }> = [
  { page: "screener", label: "Stocks" },
  { page: "workspace", label: "Chart" },
  { page: "analysis", label: "Industry Stocks" },
  { page: "industry", label: "Industry Analysis" },
  { page: "research", label: "Querys" },
  { page: "pulse", label: "Market" },
  { page: "portfolio", label: "Portfolio" }
];

function App() {
  // The first tab mirrors the original QTabWidget: open directly on Stocks.
  const [activePage, setActivePage] = useState<Page>("screener");
  const [selectedStock, setSelectedStock] = useState<MarketUniverseRecord | null>(null);

  if (new URLSearchParams(window.location.search).get("diagnostics") === "providers") {
    return <ProviderDiagnostics />;
  }

  const openStock = (record: MarketUniverseRecord) => {
    setSelectedStock(record);
    setActivePage("workspace");
  };

  return (
    <main className="terminal-shell desktop-shell">
      <header className="desktop-workspace-header">
        <button
          type="button"
          className="desktop-brand"
          onClick={() => setActivePage("screener")}
          aria-label="SchCat home — Stocks tab"
        >
          <span className="brand-mark">SC</span>
          <span className="desktop-brand-copy">
            <strong>SchCat</strong>
            <small>MARKET ANALYZER</small>
          </span>
        </button>

        <nav className="desktop-tabs" aria-label="Main workspace tabs">
          {WORKSPACE_TABS.map((tab) => (
            <button
              type="button"
              key={tab.page}
              className={"desktop-tab" + (activePage === tab.page ? " active" : "")}
              aria-current={activePage === tab.page ? "page" : undefined}
              onClick={() => setActivePage(tab.page)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="desktop-header-meta">
          <span className="desktop-status-dot" />
          <span>WORKSPACE</span>
        </div>
      </header>

      <section className="main-panel desktop-tab-panel">
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
        ) : activePage === "workspace" ? (
          <StockWorkspace initialRecord={selectedStock} onBack={() => setActivePage("screener")} />
        ) : (
          <StockScreener onOpenStock={openStock} />
        )}
      </section>
    </main>
  );
}

export default App;
