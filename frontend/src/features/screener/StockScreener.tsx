import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  loadMarketUniverse,
  type MarketUniverseRecord
} from "../../data/reference/marketUniverse";
import { loadIndustryList } from "../../data/reference/industries";
import {
  applyScreenerFilters,
  parseSymbolList,
  SCREENER_COLUMNS,
  sortScreenerRecords,
  type ScreenerNumericField,
  type ScreenerSortField
} from "./screener";

interface LocalSymbolQuery {
  name: string;
  symbols: string[];
}

type RangeInput = { min: string; max: string };
type RangeInputs = Record<ScreenerNumericField, RangeInput>;

const EMPTY_RANGES: RangeInputs = {
  marketCap: { min: "", max: "" },
  pb: { min: "", max: "" },
  roce: { min: "", max: "" },
  nikScore: { min: "", max: "" }
};

const RANGE_LABELS: Record<ScreenerNumericField, string> = {
  marketCap: "Market Cap*",
  pb: "P/B*",
  roce: "ROCE*",
  nikScore: "NikScore*"
};

function numberValue(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function compactNumber(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  return '"' + raw.replaceAll('"', '""') + '"';
}

function downloadCsv(records: readonly MarketUniverseRecord[]) {
  const columns = [
    ["Symbol", "symbol"],
    ["Instrument ID", "instrumentId"],
    ["Sector", "sector"],
    ["Industry", "industry"],
    ["Market Cap (undated source)", "marketCap"],
    ["P/B (undated source)", "pb"],
    ["ROCE (undated source)", "roce"],
    ["NikScore (undated source)", "nikScore"]
  ] as const;
  const lines = [
    columns.map(([label]) => csvCell(label)).join(","),
    ...records.map((record) =>
      columns.map(([, key]) => csvCell(record[key])).join(",")
    )
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "schcat-screener-reference.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function StockScreener({ onOpenStock }: { onOpenStock: (record: MarketUniverseRecord) => void }) {
  const [records, setRecords] = useState<MarketUniverseRecord[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [ranges, setRanges] = useState<RangeInputs>(EMPTY_RANGES);
  const [sortField, setSortField] = useState<ScreenerSortField>("symbol");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [queries, setQueries] = useState<LocalSymbolQuery[]>([]);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [queryName, setQueryName] = useState("");
  const [querySymbols, setQuerySymbols] = useState("");
  const [queryError, setQueryError] = useState("");
  const [selectedStock, setSelectedStock] = useState<MarketUniverseRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMarketUniverse(), loadIndustryList()])
      .then(([universe, industryList]) => {
        if (cancelled) return;
        setRecords(universe.records);
        setIndustries(industryList.industries);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load reference data");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const queryMatches = useMemo(
    () => new Map(queries.map((query) => [query.name, query.symbols])),
    [queries]
  );

  const filters = useMemo(() => ({
    search,
    sector,
    industry,
    ranges: {
      marketCap: {
        min: toNumber(ranges.marketCap.min),
        max: toNumber(ranges.marketCap.max)
      },
      pb: { min: toNumber(ranges.pb.min), max: toNumber(ranges.pb.max) },
      roce: { min: toNumber(ranges.roce.min), max: toNumber(ranges.roce.max) },
      nikScore: {
        min: toNumber(ranges.nikScore.min),
        max: toNumber(ranges.nikScore.max)
      }
    }
  }), [search, sector, industry, ranges]);

  const filteredRecords = useMemo(() => {
    const filtered = applyScreenerFilters(records, filters, selectedQueries, queryMatches);
    return sortScreenerRecords(filtered, sortField, ascending);
  }, [records, filters, selectedQueries, queryMatches, sortField, ascending]);

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pageRecords = filteredRecords.slice(page * pageSize, (page + 1) * pageSize);

  function updateRange(field: ScreenerNumericField, side: "min" | "max", value: string) {
    setRanges((current) => ({
      ...current,
      [field]: { ...current[field], [side]: value }
    }));
    setPage(0);
  }

  function resetFilters() {
    setSearch("");
    setSector("");
    setIndustry("");
    setRanges(EMPTY_RANGES);
    setSelectedQueries([]);
    setPage(0);
  }

  function toggleSort(field: ScreenerSortField) {
    if (sortField === field) setAscending((current) => !current);
    else {
      setSortField(field);
      setAscending(true);
    }
    setPage(0);
  }

  function createQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = queryName.trim();
    const symbols = parseSymbolList(querySymbols);
    if (!name || symbols.length === 0) {
      setQueryError("Enter a query name and at least one symbol.");
      return;
    }
    if (queries.some((query) => query.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setQueryError("A query with that name already exists.");
      return;
    }
    const knownSymbols = new Set(records.map((record) => record.symbol));
    const matchedSymbols = symbols.filter((symbol) => knownSymbols.has(symbol));
    if (matchedSymbols.length === 0) {
      setQueryError("None of those symbols are in the loaded reference universe.");
      return;
    }
    setQueries((current) => [...current, { name, symbols: matchedSymbols }]);
    setSelectedQueries((current) => [...current, name]);
    setQueryName("");
    setQuerySymbols("");
    setQueryError("");
    setPage(0);
  }

  function removeQuery(name: string) {
    setQueries((current) => current.filter((query) => query.name !== name));
    setSelectedQueries((current) => current.filter((item) => item !== name));
    setPage(0);
  }

  const sectors = useMemo(
    () => [...new Set(records.map((record) => record.sector).filter((value): value is string => Boolean(value)))].sort(),
    [records]
  );

  return (
    <div className="screener-content">
      <div className="eyebrow">SCHCAT / UNIVERSE SCREENER</div>
      <div className="screener-heading">
        <div>
          <h1>Stock Screener</h1>
          <p className="intro">Search and narrow the imported market universe.</p>
        </div>
        <div className="screener-heading-actions">
          <span className="screener-count">{loading ? "Loading universe…" : `${filteredRecords.length.toLocaleString("en-IN")} / ${records.length.toLocaleString("en-IN")} stocks`}</span>
          <button type="button" className="screener-button" onClick={() => downloadCsv(filteredRecords)} disabled={loading || filteredRecords.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <section className="screener-warning">
        <strong>Reference data only</strong>
        <span>
          Market Cap, P/B, ROCE and NikScore come from an undated workbook snapshot. They are not live market values.
          MarketSmith fields such as RS, EPS rank, PE, PEG and MasterScore are withheld until browser provider access is validated.
        </span>
      </section>

      {loadError && <div className="screener-error" role="alert">{loadError}</div>}

      <section className="screener-panel">
        <div className="screener-filter-grid">
          <label className="screener-field screener-search">
            <span>Search symbol / industry / sector</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="e.g. RELIANCE, banks…" />
          </label>
          <label className="screener-field">
            <span>Sector</span>
            <select value={sector} onChange={(event) => { setSector(event.target.value); setPage(0); }}>
              <option value="">All sectors</option>
              {sectors.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="screener-field">
            <span>Industry</span>
            <select value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(0); }}>
              <option value="">All industries</option>
              {industries.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button type="button" className="screener-button secondary" onClick={resetFilters}>Clear filters</button>
        </div>
        <div className="screener-range-heading">
          <div><span className="eyebrow">ADVANCED FILTERS</span><p>Inclusive minimum and maximum values</p></div>
          <span className="screener-muted">* Undated snapshot metrics</span>
        </div>
        <div className="screener-range-grid">
          {(Object.keys(RANGE_LABELS) as ScreenerNumericField[]).map((field) => (
            <div className="screener-range" key={field}>
              <span>{RANGE_LABELS[field]}</span>
              <div>
                <input aria-label={`${RANGE_LABELS[field]} minimum`} inputMode="decimal" placeholder="Min" value={ranges[field].min} onChange={(event) => updateRange(field, "min", event.target.value)} />
                <input aria-label={`${RANGE_LABELS[field]} maximum`} inputMode="decimal" placeholder="Max" value={ranges[field].max} onChange={(event) => updateRange(field, "max", event.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="screener-panel screener-query-panel">
        <div className="screener-section-title">
          <div><span className="eyebrow">QUERY INTERSECTION</span><h2>Combine symbol sets</h2></div>
          <span className="screener-muted">AND logic · current session only</span>
        </div>
        <p className="screener-help">
          Add named lists of symbols and select multiple lists to show only stocks present in every selected list.
          This ports the desktop intersection behaviour; it does not run saved ChartInk scans yet.
        </p>
        <form className="screener-query-form" onSubmit={createQuery}>
          <label className="screener-field">
            <span>Query name</span>
            <input value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="e.g. Strong sector names" />
          </label>
          <label className="screener-field screener-query-symbols">
            <span>Symbols (comma / space separated)</span>
            <input value={querySymbols} onChange={(event) => setQuerySymbols(event.target.value)} placeholder="RELIANCE, TCS, INFY" />
          </label>
          <button className="screener-button" type="submit">Add symbol set</button>
        </form>
        {queryError && <p className="screener-query-error" role="alert">{queryError}</p>}
        {queries.length > 0 ? (
          <div className="screener-query-list">
            {queries.map((query) => (
              <label className="screener-query-chip" key={query.name}>
                <input
                  type="checkbox"
                  checked={selectedQueries.includes(query.name)}
                  onChange={(event) => {
                    setSelectedQueries((current) => event.target.checked
                      ? [...current, query.name]
                      : current.filter((name) => name !== query.name));
                    setPage(0);
                  }}
                />
                <span>{query.name}</span>
                <small>{query.symbols.length}</small>
                <button type="button" aria-label={`Remove ${query.name}`} onClick={(event) => { event.preventDefault(); removeQuery(query.name); }}>×</button>
              </label>
            ))}
          </div>
        ) : (
          <p className="screener-muted">No symbol sets added. This temporary query area resets when the page is refreshed.</p>
        )}
      </section>

      <section className="screener-table-panel">
        <div className="screener-table-top">
          <div><span className="eyebrow">MATCHING STOCKS</span><h2>{loading ? "Loading…" : `${filteredRecords.length.toLocaleString("en-IN")} results`}</h2></div>
          <div className="screener-pagination">
            <span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
            <button type="button" className="screener-button secondary" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
            <button type="button" className="screener-button secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</button>
          </div>
        </div>
        {selectedStock && (
          <div className="screener-selected">
            <div><strong>{selectedStock.symbol}</strong><span>{selectedStock.industry ?? "Industry unavailable"} · {selectedStock.sector ?? "Sector unavailable"}</span></div>
            <span>MarketSmith ID: {selectedStock.instrumentId ?? "—"}</span>
            <button type="button" onClick={() => setSelectedStock(null)}>Close</button>
          </div>
        )}
        <div className="screener-table-wrap">
          <table className="screener-table">
            <thead>
              <tr>
                {SCREENER_COLUMNS.map((column) => (
                  <th key={column.key} aria-sort={sortField === column.key ? (ascending ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort(column.key)}>
                      {column.label}{sortField === column.key ? (ascending ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRecords.map((record) => (
                <tr key={record.symbol} className={selectedStock?.symbol === record.symbol ? "selected" : ""}>
                  <td><button type="button" className="screener-symbol" onClick={() => { setSelectedStock(record); onOpenStock(record); }}>{record.symbol}</button></td>
                  <td><button type="button" className="screener-industry" onDoubleClick={() => { setIndustry(record.industry ?? ""); setPage(0); }} title="Double-click to filter this industry">{record.industry ?? "—"}</button></td>
                  <td>{record.sector ?? "—"}</td>
                  <td className="numeric">{compactNumber(record.marketCap)}</td>
                  <td className="numeric">{numberValue(record.pb)}</td>
                  <td className="numeric">{numberValue(record.roce)}</td>
                  <td className="numeric">{numberValue(record.nikScore)}</td>
                </tr>
              ))}
              {!loading && pageRecords.length === 0 && (
                <tr><td colSpan={7} className="screener-empty">No stocks match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="screener-table-footer">
          <span>Showing {filteredRecords.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredRecords.length)} of {filteredRecords.length}</span>
          <span>Click a symbol for its reference ID. Double-click an industry to filter.</span>
        </div>
      </section>

      <footer className="page-footer">SCHCATWEB <span>·</span> STOCK SCREENER <span>·</span> STEP 12</footer>
    </div>
  );
}

export default StockScreener;
