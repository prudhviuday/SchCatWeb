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
  // Like QTabWidget, visited pages remain mounted so their filters and UI state survive tab changes.
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(() => new Set(["screener"]));
  const [selectedStock, setSelectedStock] = useState<MarketUniverseRecord | null>(null);
  const [industryNavigation, setIndustryNavigation] = useState<{ name: string; request: number } | null>(null);

  const switchToPage = (page: Page) => {
    setVisitedPages((current) => {
      if (current.has(page)) return current;
      const next = new Set(current);
      next.add(page);
      return next;
    });
    setActivePage(page);
  };

  if (new URLSearchParams(window.location.search).get("diagnostics") === "providers") {
    return <ProviderDiagnostics />;
  }

  const openStock = (record: MarketUniverseRecord) => {
    setSelectedStock(record);
    switchToPage("workspace");
  };

  const openIndustry = (industry: string) => {
    const name = industry.trim();
    if (!name) return;
    setIndustryNavigation((current) => ({ name, request: (current?.request ?? 0) + 1 }));
    switchToPage("analysis");
  };

  return (
    <main className="terminal-shell desktop-shell">
      <header className="desktop-workspace-header">
        <button
          type="button"
          className="desktop-brand"
          onClick={() => switchToPage("screener")}
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
              onClick={() => switchToPage(tab.page)}
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
        <div className="desktop-module-page" hidden={activePage !== "screener"}>
          {visitedPages.has("screener") && <StockScreener onOpenStock={openStock} onOpenIndustry={openIndustry} />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "workspace"}>
          {visitedPages.has("workspace") && <StockWorkspace initialRecord={selectedStock} onBack={() => switchToPage("screener")} />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "analysis"}>
          {visitedPages.has("analysis") && <MultiStockAnalysis initialIndustry={industryNavigation} onOpenStock={openStock} />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "industry"}>
          {visitedPages.has("industry") && <IndustryAnalysis onOpenStock={openStock} />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "research"}>
          {visitedPages.has("research") && <Research />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "pulse"}>
          {visitedPages.has("pulse") && <MarketPulse />}
        </div>
        <div className="desktop-module-page" hidden={activePage !== "portfolio"}>
          {visitedPages.has("portfolio") && <Portfolio />}
        </div>
      </section>
    </main>
  );
}

export default App;
