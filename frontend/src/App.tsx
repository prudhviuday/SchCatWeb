function App() {
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
          <div className="nav-item active"><span className="nav-icon">▦</span> Overview</div>
          <div className="nav-item"><span className="nav-icon">⌕</span> Stock Screener</div>
          <div className="nav-item"><span className="nav-icon">◫</span> Charts</div>
          <div className="nav-item"><span className="nav-icon">▤</span> Industry Analysis</div>
          <div className="nav-item"><span className="nav-icon">⌁</span> Research</div>
          <div className="nav-item"><span className="nav-icon">◷</span> Market Pulse</div>
          <div className="nav-item"><span className="nav-icon">▣</span> Portfolio</div>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          FOUNDATION BUILD
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">SCHCAT <span>/</span> OVERVIEW</div>
          <div className="topbar-right"><span className="market-status"><i /> LOCAL WORKSPACE</span><div className="avatar">U</div></div>
        </header>

        <div className="content">
          <div className="eyebrow">PERSONAL MARKET WORKSPACE</div>
          <h1>Good evening.</h1>
          <p className="intro">Your research terminal is being prepared.</p>

          <div className="notice-card">
            <div className="notice-icon">✳</div>
            <div>
              <div className="notice-title">SchCatWeb foundation is live</div>
              <p>This is the clean web shell. Existing SchCat analysis, market data, charts and portfolio features will be connected in the upcoming migration steps.</p>
            </div>
            <span className="step-tag">STEP 03</span>
          </div>

          <div className="section-heading">
            <div><div className="eyebrow">WORKSPACE MODULES</div><h2>Coming online in stages</h2></div>
            <span className="muted-label">MIGRATION IN PROGRESS</span>
          </div>
          <div className="module-grid">
            {[
              ["01", "Stock Screener", "Universe, filters and query scans"],
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
      </section>
    </main>
  );
}

export default App;
