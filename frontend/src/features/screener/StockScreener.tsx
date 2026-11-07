import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  loadMarketUniverse,
  type MarketUniverseRecord
} from "../../data/reference/marketUniverse";
import { loadIndustryList } from "../../data/reference/industries";
import { loadMarketSmithIds } from "../../data/reference/marketSmithIds";
import { readStoredMarketSmithAuth } from "../../data/providers/providerDiagnostics";
import { fetchChartInkScan } from "../../data/providers/chartInk";
import { fetchMarketSmithFinanceData, fetchMarketSmithStockMetrics, type MarketSmithFinanceData } from "../../data/providers/marketSmithStockData";
import { getMarketSmithId } from "../../data/reference/marketSmithIds";
import { calculateNikScoreFromMarketSmith } from "./nikScore";
import SelectedStockGraphs from "./SelectedStockGraphs";
import {
  fetchMarketSmithUniverse,
  type MarketSmithLiveMetrics
} from "../../data/providers/marketSmithStockData";
import { addSymbolToWatchlist, loadScreenerLibrary, mergeScreenerLibraries, parseScreenerLibraryJson, parseSavedQueriesCsv, parseWatchlistsCsv, removeSavedQuery, removeSymbolFromWatchlist, saveScreenerLibrary, serializeScreenerLibrary, serializeSavedQueriesCsv, serializeWatchlistsCsv, upsertSavedQuery, type ScreenerLibrary } from "./watchlists";
import {
  applyScreenerFilters,
  parseSymbolList,
  SCREENER_COLUMNS,
  sortScreenerRecords,
  resolveWatchlistShortcut,
  type ScreenerNumericField,
  type ScreenerSortField,
  type ScreenerRow
} from "./screener";

type RangeInput = { min: string; max: string };
type RangeInputs = Record<ScreenerNumericField, RangeInput>;

const EMPTY_RANGES: RangeInputs = {
  marketCap: { min: "", max: "" },
  pb: { min: "", max: "" },
  roce: { min: "", max: "" },
  nikScore: { min: "", max: "" },
  groupRank: { min: "", max: "" },
  rs: { min: "", max: "" },
  epsRank: { min: "", max: "" },
  masterScore: { min: "", max: "" },
  pe: { min: "", max: "" },
  peg: { min: "", max: "" },
  fScore: { min: "", max: "" },
  accDis: { min: "", max: "" }
};

const RANGE_LABELS: Record<ScreenerNumericField, string> = {
  marketCap: "Market Cap*",
  pb: "P/B*",
  roce: "ROCE*",
  nikScore: "NikScore*",
  groupRank: "Group Rank",
  rs: "RS",
  epsRank: "EPS Rank",
  masterScore: "MasterScore",
  pe: "PE",
  peg: "PEG",
  fScore: "FScore",
  accDis: "Acc/Dis"
};

const SCREENER_HEADER_LINES: Partial<Record<ScreenerSortField, readonly string[]>> = {
  groupRank: ["Group", "Rank"],
  epsRank: ["EPS", "Rank"],
  masterScore: ["Master", "Score"],
  accDis: ["Acc/", "Dis"],
  marketCap: ["Market", "Cap*"],
  nikScore: ["Nik", "Score*"]
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

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  return '"' + raw.replaceAll('"', '""') + '"';
}

function downloadCsv(records: readonly ScreenerRow[]) {
  const columns: Array<[string, keyof ScreenerRow]> = [
    ["Symbol", "symbol"],
    ["Industry", "industry"],
    ["Group Rank (MarketSmith)", "groupRank"],
    ["RS (MarketSmith)", "rs"],
    ["EPS Rank (MarketSmith)", "epsRank"],
    ["MasterScore (MarketSmith)", "masterScore"],
    ["Acc/Dis (MarketSmith)", "accDis"],
    ["PE (MarketSmith)", "pe"],
    ["PEG (MarketSmith)", "peg"],
    ["FScore (MarketSmith)", "fScore"],
    ["Market Cap (undated source)", "marketCap"],
    ["P/B (undated source)", "pb"],
    ["ROCE (undated source)", "roce"],
    ["NikScore (undated source)", "nikScore"]
  ];
  const lines = [
    columns.map(([label]) => csvCell(label)).join(","),
    ...records.map((record) =>
      columns.map(([, key]) => { const value = record[key]; return csvCell(typeof value === "string" || typeof value === "number" ? value : null); }).join(",")
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

function displayScreenerValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return typeof value === "number" ? numberValue(value) : value;
}

function displayScreenerRecordValue(record: ScreenerRow, key: keyof ScreenerRow): string {
  const value = record[key];
  return displayScreenerValue(typeof value === "string" || typeof value === "number" ? value : null);
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type SelectedStockResearchState = {
  symbol: string;
  status: "idle" | "loading" | "ready" | "partial" | "auth-required" | "error";
  finance: MarketSmithFinanceData | null;
  metrics: MarketSmithLiveMetrics | null;
  message: string;
  updatedAt: string | null;
};

const emptySelectedStockResearch = (symbol = ""): SelectedStockResearchState => ({
  symbol,
  status: symbol ? "loading" : "idle",
  finance: null,
  metrics: null,
  message: "",
  updatedAt: null
});

function StockScreener({ onOpenStock, onOpenIndustry }: { onOpenStock: (record: MarketUniverseRecord) => void; onOpenIndustry: (industry: string) => void }) {
  const [records, setRecords] = useState<ScreenerRow[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, MarketSmithLiveMetrics>>({});
  const [marketSmithRefresh, setMarketSmithRefresh] = useState<{
    status: "idle" | "loading" | "complete" | "error";
    completed: number;
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    message: string;
  }>({
    status: "idle",
    completed: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    message: ""
  });
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [nikRefresh, setNikRefresh] = useState({ status: "idle" as "idle" | "loading" | "complete" | "error", completed: 0, total: 0, succeeded: 0, failed: 0, message: "" });
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
  const [library, setLibrary] = useState<ScreenerLibrary>(() => loadScreenerLibrary());
  const queries = library.queries;
  const [activeWatchlist, setActiveWatchlist] = useState("");
  const [watchlistTarget, setWatchlistTarget] = useState("");
  const [newWatchlist, setNewWatchlist] = useState("");
  const [watchlistNotice, setWatchlistNotice] = useState("");
  const [queryCode, setQueryCode] = useState("");
  const [libraryMode, setLibraryMode] = useState<"merge" | "replace">("merge");
  const libraryInput = useRef<HTMLInputElement>(null);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [queryName, setQueryName] = useState("");
  const [querySymbols, setQuerySymbols] = useState("");
  const [queryError, setQueryError] = useState("");
  const [queryRuns, setQueryRuns] = useState<Record<string, { status: "loading" | "success" | "error"; message: string }>>({});
  const [selectedStock, setSelectedStock] = useState<MarketUniverseRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"filters" | "queries" | "watchlists" | "data">("filters");
  const [queryMenuOpen, setQueryMenuOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState<string[]>([]);
  const [selectedStockResearch, setSelectedStockResearch] = useState<SelectedStockResearchState>(() => emptySelectedStockResearch());
  const selectedStockResearchCache = useRef(new Map<string, SelectedStockResearchState>());

  useEffect(() => { try { saveScreenerLibrary(library); } catch (error) { setWatchlistNotice(error instanceof Error ? error.message : "Unable to save local library."); } }, [library]);

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

  // Selecting a stock automatically loads its original desktop right-panel histories.
  // Results are cached for this browser session so revisiting a row does not refetch them.
  const selectedLiveMetrics = selectedStock ? liveMetrics[selectedStock.symbol] : undefined;
  useEffect(() => {
    if (!selectedStock) {
      setSelectedStockResearch(emptySelectedStockResearch());
      return;
    }

    const symbol = selectedStock.symbol;
    const cached = selectedStockResearchCache.current.get(symbol);
    if (cached) {
      const refreshed = cached.metrics || !selectedLiveMetrics
        ? cached
        : { ...cached, metrics: selectedLiveMetrics };
      if (refreshed !== cached) selectedStockResearchCache.current.set(symbol, refreshed);
      setSelectedStockResearch(refreshed);
      return;
    }

    let cancelled = false;
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setSelectedStockResearch({
        symbol,
        status: "auth-required",
        finance: null,
        metrics: selectedLiveMetrics ?? null,
        message: "Save your current MarketSmith session in Provider Diagnostics to load the live ROCE, institutional ownership and Revenue/EPS histories.",
        updatedAt: null
      });
      return () => { cancelled = true; };
    }

    setSelectedStockResearch({
      ...emptySelectedStockResearch(symbol),
      status: "loading",
      metrics: selectedLiveMetrics ?? null,
      message: "Loading annual ROCE, institutional ownership and Revenue/EPS history from MarketSmith…"
    });

    void (async () => {
      try {
        const ids = selectedStock.instrumentId ? null : await loadMarketSmithIds();
        const stockId = selectedStock.instrumentId ?? (ids ? getMarketSmithId(ids, symbol) : null);
        if (stockId === null) throw new Error("No MarketSmith instrument ID is available for " + symbol + ".");

        const [financeResult, metricsResult] = await Promise.allSettled([
          fetchMarketSmithFinanceData(stockId, auth),
          selectedLiveMetrics
            ? Promise.resolve(selectedLiveMetrics)
            : fetchMarketSmithStockMetrics(stockId, symbol, auth)
        ]);
        if (cancelled) return;

        const finance = financeResult.status === "fulfilled" ? financeResult.value : null;
        const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : selectedLiveMetrics ?? null;
        if (metrics) {
          setLiveMetrics((current) => current[symbol] ? current : { ...current, [symbol]: metrics });
        }

        const errors = [
          financeResult.status === "rejected"
            ? (financeResult.reason instanceof Error ? financeResult.reason.message : "MarketSmith finance history failed.")
            : "",
          metricsResult.status === "rejected"
            ? (metricsResult.reason instanceof Error ? metricsResult.reason.message : "MarketSmith company details failed.")
            : ""
        ].filter(Boolean);
        if (!finance && !metrics) throw new Error(errors.join(" · ") || "MarketSmith returned no usable stock history.");

        const result: SelectedStockResearchState = {
          symbol,
          status: errors.length ? "partial" : "ready",
          finance,
          metrics,
          message: errors.length
            ? "Some histories could not be loaded: " + errors.join(" · ")
            : "Live company histories loaded from MarketSmith.",
          updatedAt: new Date().toLocaleString("en-IN")
        };
        selectedStockResearchCache.current.set(symbol, result);
        setSelectedStockResearch(result);
      } catch (error) {
        if (cancelled) return;
        setSelectedStockResearch({
          symbol,
          status: "error",
          finance: null,
          metrics: selectedLiveMetrics ?? null,
          message: error instanceof Error ? error.message : "Unable to load selected-stock histories.",
          updatedAt: null
        });
      }
    })();

    return () => { cancelled = true; };
  }, [selectedStock?.symbol, selectedStock?.instrumentId, selectedLiveMetrics]);

  const queryMatches = useMemo(
    () => new Map(queries.map((query) => [query.name, query.symbols])),
    [queries]
  );

  const enrichedRecords = useMemo(
    () => records.map((record) => ({ ...record, ...(liveMetrics[record.symbol] ?? {}) })),
    [records, liveMetrics]
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
      },
      groupRank: { min: toNumber(ranges.groupRank.min), max: toNumber(ranges.groupRank.max) },
      rs: { min: toNumber(ranges.rs.min), max: toNumber(ranges.rs.max) },
      epsRank: { min: toNumber(ranges.epsRank.min), max: toNumber(ranges.epsRank.max) },
      masterScore: { min: toNumber(ranges.masterScore.min), max: toNumber(ranges.masterScore.max) },
      pe: { min: toNumber(ranges.pe.min), max: toNumber(ranges.pe.max) },
      peg: { min: toNumber(ranges.peg.min), max: toNumber(ranges.peg.max) },
      fScore: { min: toNumber(ranges.fScore.min), max: toNumber(ranges.fScore.max) },
      accDis: { min: toNumber(ranges.accDis.min), max: toNumber(ranges.accDis.max) }
    }
  }), [search, sector, industry, ranges]);

  const filteredRecords = useMemo(() => {
    let source = enrichedRecords;
    if (activeWatchlist) { const selected = library.watchlists.find(item => item.name === activeWatchlist); const symbols = new Set(selected?.symbols ?? []); source = source.filter(record => symbols.has(record.symbol)); }
    const filtered = applyScreenerFilters(source, filters, selectedQueries, queryMatches);
    return sortScreenerRecords(filtered, sortField, ascending);
  }, [enrichedRecords, filters, selectedQueries, queryMatches, sortField, ascending, activeWatchlist, library.watchlists]);

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pageRecords = filteredRecords.slice(page * pageSize, (page + 1) * pageSize);

  async function refreshMarketSmithData() {
    if (marketSmithRefresh.status === "loading" || records.length === 0) return;
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setMarketSmithRefresh({
        status: "error",
        completed: 0,
        total: records.length,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        message: "No MarketSmith session saved in this browser. Open Provider Diagnostics, paste your working ms-auth value and save it first."
      });
      return;
    }

    setMarketSmithRefresh({
      status: "loading",
      completed: 0,
      total: records.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      message: "Starting MarketSmith requests with eight concurrent workers (same as the desktop app)…"
    });

    try {
      const ids = await loadMarketSmithIds();
      const result = await fetchMarketSmithUniverse(records, ids, auth, {
        concurrency: 8,
        onProgress: (completed, total) => {
          if (completed % 5 !== 0 && completed !== total) return;
          setMarketSmithRefresh((current) => ({
            ...current,
            status: "loading",
            completed,
            total,
            message: `Fetched ${completed.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} stocks…`
          }));
        }
      });
      setLiveMetrics(Object.fromEntries(result.metrics.entries()));
      const updatedAt = new Date().toLocaleString("en-IN");
      setLiveUpdatedAt(updatedAt);
      const message = `${result.metrics.size.toLocaleString("en-IN")} stocks updated; ${result.failures.length.toLocaleString("en-IN")} requests failed; ${result.skippedWithoutId.toLocaleString("en-IN")} stocks had no MarketSmith ID.`;
      setMarketSmithRefresh({
        status: "complete",
        completed: result.completed,
        total: result.total,
        succeeded: result.metrics.size,
        failed: result.failures.length,
        skipped: result.skippedWithoutId,
        message: result.failures.length > 0
          ? message + ` First error: ${result.failures[0].message}`
          : message
      });
    } catch (error) {
      setMarketSmithRefresh((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "MarketSmith refresh failed."
      }));
    }
  }

  async function refreshNikScores() {
    if (nikRefresh.status === "loading" || records.length === 0) return;
    const auth = readStoredMarketSmithAuth();
    if (!auth) {
      setNikRefresh({ status: "error", completed: 0, total: records.length, succeeded: 0, failed: 0, message: "No MarketSmith session saved. Configure it in Provider Diagnostics first." });
      return;
    }
    setNikRefresh({ status: "loading", completed: 0, total: records.length, succeeded: 0, failed: 0, message: "Preparing NikScore refresh…" });
    try {
      const ids = await loadMarketSmithIds();
      const updated = [...records];
      let cursor = 0;
      let completed = 0;
      let succeeded = 0;
      let failed = 0;
      const workers = Array.from({ length: 6 }, async () => {
        while (cursor < records.length) {
          const index = cursor++;
          const record = records[index];
          const id = record.instrumentId ?? getMarketSmithId(ids, record.symbol);
          try {
            if (!id) throw new Error("No MarketSmith instrument ID");
            const [metrics, finance] = await Promise.all([
              fetchMarketSmithStockMetrics(id, record.symbol, auth),
              fetchMarketSmithFinanceData(id, auth)
            ]);
            const score = calculateNikScoreFromMarketSmith(metrics, finance);
            updated[index] = { ...record, pb: metrics.livePb, roce: finance.annualRoce.at(-1)!.value, nikScore: score.finalScore };
            succeeded++;
          } catch {
            // Legacy Listupdater writes PB=100, ROCE=0 and NikScore=0 for a failed stock.
            updated[index] = { ...record, pb: 100, roce: 0, nikScore: 0 };
            failed++;
          } finally {
            completed++;
            if (completed % 5 === 0 || completed === records.length) {
              setNikRefresh({ status: "loading", completed, total: records.length, succeeded, failed, message: `Updated ${completed.toLocaleString("en-IN")} of ${records.length.toLocaleString("en-IN")} stocks…` });
            }
          }
        }
      });
      await Promise.all(workers);
      setRecords(updated);
      setNikRefresh({
        status: "complete", completed, total: records.length, succeeded, failed,
        message: `NikScore updated for ${succeeded.toLocaleString("en-IN")} stocks; ${failed.toLocaleString("en-IN")} used the legacy failure fallback (P/B 100, ROCE 0, NikScore 0). Export CSV to save the refreshed values.`
      });
    } catch (error) {
      setNikRefresh(current => ({ ...current, status: "error", message: error instanceof Error ? error.message : "NikScore refresh failed." }));
    }
  }

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
    setActiveWatchlist("");
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

  async function runSavedQuery(name: string) {
    const saved = queries.find((item) => item.name === name);
    if (!saved || !saved.queryCode.trim() || queryRuns[name]?.status === "loading") return;
    setQueryRuns((current) => ({ ...current, [name]: { status: "loading", message: "Running ChartInk scan…" } }));
    try {
      const result = await fetchChartInkScan(saved.queryCode);
      setLibrary((current) => upsertSavedQuery(current, { ...saved, symbols: result.symbols }));
      setSelectedQueries((current) => current.includes(name) ? current : [...current, name]);
      setQueryDraft((current) => current.includes(name) ? current : [...current, name]);
      setPage(0);
      setQueryRuns((current) => ({
        ...current,
        [name]: {
          status: "success",
          message: result.symbols.length.toLocaleString("en-IN") + " unique symbols loaded from " + result.rawRows.toLocaleString("en-IN") + " ChartInk rows."
        }
      }));
    } catch (error) {
      setQueryRuns((current) => ({
        ...current,
        [name]: { status: "error", message: error instanceof Error ? error.message : "ChartInk scan failed." }
      }));
    }
  }

  function createQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = queryName.trim();
    const symbols = parseSymbolList(querySymbols);
    const clause = queryCode.trim();
    if (!name || (symbols.length === 0 && !clause)) {
      setQueryError("Enter a query name and either a symbol list or a ChartInk query clause.");
      return;
    }
    if (queries.some((query) => query.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setQueryError("A query with that name already exists.");
      return;
    }
    const knownSymbols = new Set(records.map((record) => record.symbol));
    const matchedSymbols = symbols.filter((symbol) => knownSymbols.has(symbol));
    if (symbols.length > 0 && matchedSymbols.length === 0) {
      setQueryError("None of those symbols are in the loaded reference universe.");
      return;
    }
    setLibrary(current => upsertSavedQuery(current, { name, queryCode: clause, symbols: matchedSymbols }));
    setSelectedQueries((current) => [...current, name]);
    setQueryDraft((current) => [...current, name]);
    setQueryName("");
    setQuerySymbols("");
    setQueryCode("");
    setQueryError("");
    setPage(0);
  }

  function removeQuery(name: string) {
    setLibrary(current => removeSavedQuery(current, name));
    setSelectedQueries((current) => current.filter((item) => item !== name));
    setQueryDraft((current) => current.filter((item) => item !== name));
    setPage(0);
  }

  function addSelectedToWatchlist(watchlistName: string | null) {
    if (!selectedStock) {
      setWatchlistNotice("Select a stock row first, then use the watchlist shortcut.");
      return;
    }
    if (!watchlistName) {
      setWatchlistNotice("Choose a target watchlist first (or use keys 1–9).");
      return;
    }
    if (!library.watchlists.some((item) => item.name === watchlistName)) {
      setWatchlistNotice("That watchlist is no longer available. Refresh the selection and try again.");
      return;
    }
    setLibrary((current) => addSymbolToWatchlist(current, watchlistName, selectedStock.symbol));
    setWatchlistNotice(selectedStock.symbol + " added to " + watchlistName + ".");
  }

  function handleTableKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const watchlistName = resolveWatchlistShortcut(
      event.key,
      watchlistTarget || activeWatchlist,
      library.watchlists.map((item) => item.name)
    );
    if (watchlistName === undefined) return;
    event.preventDefault();
    addSelectedToWatchlist(watchlistName);
  }

  const sectors = useMemo(
    () => [...new Set(records.map((record) => record.sector).filter((value): value is string => Boolean(value)))].sort(),
    [records]
  );

  const activeSelectedResearch = selectedStock && selectedStockResearch.symbol === selectedStock.symbol
    ? selectedStockResearch
    : selectedStock ? emptySelectedStockResearch(selectedStock.symbol) : emptySelectedStockResearch();
  const selectedMetrics = selectedStock
    ? activeSelectedResearch.metrics ?? liveMetrics[selectedStock.symbol]
    : undefined;
  const activeAdvancedFilterCount =
    (sector ? 1 : 0) +
    (industry ? 1 : 0) +
    Object.values(ranges).filter((range) => range.min.trim() !== "" || range.max.trim() !== "").length;

  return (
    <div className="screener-content screener-desktop-content">
      <div className="screener-commandbar">
        <div className="screener-commandbar-main">
          <button
            type="button"
            className="screener-button screener-command-button"
            onClick={() => void refreshMarketSmithData()}
            disabled={loading || marketSmithRefresh.status === "loading" || records.length === 0}
          >
            {marketSmithRefresh.status === "loading"
              ? "Fetching " + marketSmithRefresh.completed.toLocaleString("en-IN") + "/" + marketSmithRefresh.total.toLocaleString("en-IN")
              : "▶ Fetch Data"}
          </button>
          <span className="screener-command-count">
            {loading ? "Loading universe…" : filteredRecords.length.toLocaleString("en-IN") + " / " + records.length.toLocaleString("en-IN")}
          </span>
        </div>

        <label className="screener-command-search">
          <span>⌕</span>
          <input
            aria-label="Search stock"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Search Stock"
          />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
        </label>

        <button
          type="button"
          className={"screener-icon-button" + (activeAdvancedFilterCount ? " has-filters" : "")}
          aria-label="Open filter settings"
          title="Filter settings"
          onClick={() => { setSettingsSection("filters"); setSettingsOpen(true); }}
        >
          <span aria-hidden="true">⚙</span>
          {activeAdvancedFilterCount > 0 && <small>{activeAdvancedFilterCount}</small>}
        </button>

        <button
          type="button"
          className="screener-button secondary screener-command-button"
          onClick={() => downloadCsv(filteredRecords)}
          disabled={loading || filteredRecords.length === 0}
        >
          ↓ Download
        </button>

        <div className="screener-command-dropdown">
          <button
            type="button"
            className="screener-button secondary screener-command-button"
            aria-expanded={queryMenuOpen}
            onClick={() => {
              if (!queryMenuOpen) setQueryDraft(selectedQueries);
              setQueryMenuOpen((open) => !open);
            }}
          >
            Query{selectedQueries.length ? " (" + selectedQueries.length + ")" : ""} ▾
          </button>
          {queryMenuOpen && (
            <div className="screener-command-menu">
              <div className="screener-command-menu-heading">
                <strong>Select queries</strong>
                <button type="button" aria-label="Close query menu" onClick={() => setQueryMenuOpen(false)}>×</button>
              </div>
              {queries.length === 0 ? (
                <p className="screener-muted">No saved queries. Open Settings → Queries to create one.</p>
              ) : queries.map((query) => (
                <div className="screener-command-query" key={query.name}>
                  <label>
                    <input
                      type="checkbox"
                      checked={queryDraft.includes(query.name)}
                      onChange={(event) => setQueryDraft((current) => event.target.checked
                        ? [...current, query.name]
                        : current.filter((name) => name !== query.name))}
                    />
                    <span>{query.name}</span>
                    <small>{query.symbols.length}</small>
                  </label>
                  {query.queryCode && (
                    <button
                      type="button"
                      className="screener-query-run"
                      disabled={queryRuns[query.name]?.status === "loading"}
                      onClick={() => void runSavedQuery(query.name)}
                    >
                      {queryRuns[query.name]?.status === "loading" ? "Running…" : "Scan"}
                    </button>
                  )}
                  {queryRuns[query.name] && <small className={"screener-query-run-status " + queryRuns[query.name].status}>{queryRuns[query.name].message}</small>}
                </div>
              ))}
              <div className="screener-command-menu-footer">
                <button type="button" className="screener-text-button" onClick={() => { setSettingsSection("queries"); setSettingsOpen(true); setQueryMenuOpen(false); }}>Manage</button>
                <button type="button" className="screener-button" onClick={() => { setSelectedQueries(queryDraft); setPage(0); setQueryMenuOpen(false); }}>Go</button>
              </div>
            </div>
          )}
        </div>

        <div className="screener-watchlist-command">
          <select
            aria-label="Select watchlist"
            value={watchlistTarget}
            onChange={(event) => setWatchlistTarget(event.target.value)}
          >
            <option value="">Watchlist</option>
            {library.watchlists.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.symbols.length})</option>)}
          </select>
          <button
            type="button"
            className="screener-button secondary screener-command-button"
            onClick={() => { setActiveWatchlist(watchlistTarget); setPage(0); }}
          >
            Go
          </button>
        </div>

        <button
          type="button"
          className="screener-button secondary screener-command-button"
          onClick={() => { setSettingsSection("watchlists"); setSettingsOpen(true); }}
        >
          Library
        </button>
      </div>

      <div className="screener-status-strip" role="status" aria-live="polite">
        <span>
          {loading ? "Loading stock universe…" : activeWatchlist ? "Watchlist: " + activeWatchlist : "All stocks"}
          {selectedQueries.length ? " · " + selectedQueries.join(" ∩ ") : ""}
        </span>
        {marketSmithRefresh.status === "loading" ? (
          <span>MarketSmith {marketSmithRefresh.completed}/{marketSmithRefresh.total}</span>
        ) : marketSmithRefresh.status === "error" ? (
          <span className="screener-inline-error">{marketSmithRefresh.message}</span>
        ) : marketSmithRefresh.status === "complete" ? (
          <span>MarketSmith: {marketSmithRefresh.succeeded} updated · {marketSmithRefresh.failed} failed · {marketSmithRefresh.skipped} skipped</span>
        ) : null}
        {nikRefresh.status === "loading" ? <span>NikScore {nikRefresh.completed}/{nikRefresh.total}</span> : null}
        {nikRefresh.status === "error" ? <span className="screener-inline-error">{nikRefresh.message}</span> : null}
      </div>

      {loadError && <div className="screener-error" role="alert">{loadError}</div>}

      <div className="screener-main-workspace">
        <section className="screener-table-panel">
          <div className="screener-table-top">
            <div>
              <span className="eyebrow">MATCHING STOCKS</span>
              <h2>{loading ? "Loading…" : filteredRecords.length.toLocaleString("en-IN") + " results"}</h2>
            </div>
            <div className="screener-pagination">
              <span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
              <button type="button" className="screener-button secondary" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>
              <button type="button" className="screener-button secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button>
            </div>
          </div>

          <div
            className="screener-table-wrap"
            tabIndex={0}
            onKeyDown={handleTableKeyDown}
            aria-label="Stock results. Right Arrow adds the selected stock to the target watchlist; keys 1–9 add it to watchlists in list order."
          >
            <table className="screener-table">
              <thead>
                <tr>
                  {SCREENER_COLUMNS.map((column) => {
                    const headerLines = SCREENER_HEADER_LINES[column.key] ?? [column.label];
                    return (
                      <th data-column={column.key} key={column.key} aria-sort={sortField === column.key ? (ascending ? "ascending" : "descending") : "none"}>
                        <button type="button" onClick={() => toggleSort(column.key)}>
                          <span className="screener-header-label">
                            {headerLines.map((line, index) => <span className="screener-header-line" key={index}>{line}</span>)}
                          </span>
                          {sortField === column.key && <span className="screener-sort-indicator" aria-hidden="true">{ascending ? "↑" : "↓"}</span>}
                        </button>
                      </th>
                    );
                  })}
                  <th data-column="save" className="screener-save-heading">Save</th>
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((record) => (
                  <tr
                    key={record.symbol}
                    className={selectedStock?.symbol === record.symbol ? "selected" : ""}
                    aria-selected={selectedStock?.symbol === record.symbol}
                    onClick={() => setSelectedStock(record)}
                  >
                    {SCREENER_COLUMNS.map((column) => (
                      <td data-column={column.key} className={column.numeric ? "numeric" : undefined} key={column.key}>
                        {column.key === "symbol" ? (
                          <button type="button" className="screener-symbol" onClick={(event) => { event.stopPropagation(); setSelectedStock(record); onOpenStock(record); }}>{record.symbol}</button>
                        ) : column.key === "industry" ? (
                          <button
                            type="button"
                            className="screener-industry"
                            data-industry-cell
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenIndustry(record.industry ?? record.sector ?? "");
                            }}
                            title="Open Industry Stocks and load all charts for this industry"
                          >{record.industry ?? record.sector ?? "—"}</button>
                        ) : column.key === "marketCap" ? (
                          compactNumber(record.marketCap)
                        ) : (
                          displayScreenerRecordValue(record, column.key)
                        )}
                      </td>
                    ))}
                    <td data-column="save">
                      <button
                        type="button"
                        className="screener-industry"
                        disabled={!watchlistTarget}
                        title={watchlistTarget ? "Add to selected watchlist" : "Choose a watchlist in the toolbar"}
                        onClick={() => {
                          setLibrary((current) => addSymbolToWatchlist(current, watchlistTarget, record.symbol));
                          setWatchlistNotice(record.symbol + " added to " + watchlistTarget);
                        }}
                      >+ Save</button>
                    </td>
                  </tr>
                ))}
                {!loading && pageRecords.length === 0 && (
                  <tr><td colSpan={SCREENER_COLUMNS.length + 1} className="screener-empty">No stocks match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="screener-table-footer">
            <span>Showing {filteredRecords.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredRecords.length)} of {filteredRecords.length}</span>
            <span>Click a row for live fundamentals · Stock opens Chart · Industry opens its stock charts</span>
            <span>→ saves to selected watchlist · keys 1–9 use watchlist order</span>
          </div>
        </section>

        <aside className="screener-detail-panel" aria-label="Selected stock details">
          {selectedStock ? (
            <>
              <div className="screener-detail-heading">
                <div>
                  <span className="eyebrow">SELECTED STOCK</span>
                  <h2>{selectedStock.symbol}</h2>
                  <p>{selectedStock.industry ?? "Industry unavailable"} · {selectedStock.sector ?? "Sector unavailable"}</p>
                </div>
                <button type="button" className="screener-icon-button" aria-label="Open stock chart" title="Open charts" onClick={() => onOpenStock(selectedStock)}>↗</button>
              </div>
              <div className="screener-detail-primary">
                <div><span>Market Cap</span><strong>{compactNumber(selectedStock.marketCap)}</strong></div>
                <div><span>ROCE (live)</span><strong>{displayScreenerValue(activeSelectedResearch.finance?.annualRoce.at(-1)?.value ?? selectedStock.roce)}</strong></div>
                <div><span>NikScore</span><strong>{displayScreenerValue(selectedStock.nikScore)}</strong></div>
              </div>
              <div className="screener-detail-grid">
                {[
                  ["MasterScore", selectedMetrics?.masterScore],
                  ["RS", selectedMetrics?.rs],
                  ["EPS Rank", selectedMetrics?.epsRank],
                  ["Acc/Dis", selectedMetrics?.accDis],
                  ["PE", selectedMetrics?.pe],
                  ["PEG", selectedMetrics?.peg],
                  ["FScore", selectedMetrics?.fScore],
                  ["P/B", selectedStock.pb],
                  ["ROE", selectedMetrics?.roe],
                  ["EPS Growth", selectedMetrics?.epsGrowth],
                  ["Stability", selectedMetrics?.stability],
                  ["Cash Flow", selectedMetrics?.cashFlow]
                ].map(([label, value]) => (
                  <div className="screener-detail-metric" key={label as string}>
                    <span>{label}</span>
                    <strong>{displayScreenerValue(value as string | number | null | undefined)}</strong>
                  </div>
                ))}
              </div>
              <SelectedStockGraphs
                symbol={selectedStock.symbol}
                status={activeSelectedResearch.status}
                finance={activeSelectedResearch.finance}
                metrics={activeSelectedResearch.metrics}
                message={activeSelectedResearch.message}
                updatedAt={activeSelectedResearch.updatedAt}
              />

              <div className="screener-detail-actions">
                <select aria-label="Watchlist target" value={watchlistTarget} onChange={(event) => setWatchlistTarget(event.target.value)}>
                  <option value="">Choose watchlist</option>
                  {library.watchlists.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                </select>
                <button type="button" className="screener-button" disabled={!watchlistTarget} onClick={() => addSelectedToWatchlist(watchlistTarget)}>Add to watchlist</button>
              </div>
              <p className="screener-detail-note">
                {selectedMetrics ? "MarketSmith metrics reflect the latest successful live refresh." : "Live MarketSmith metrics are not loaded yet. Fetch Data to populate ranking and quality fields."}
              </p>
            </>
          ) : (
            <div className="screener-detail-empty">
              <span className="eyebrow">QUICK JUDGEMENT</span>
              <h2>Select a stock</h2>
              <p>Click any row to inspect its key scores and fundamentals. Double-click the stock to open its full chart workspace.</p>
              <div className="screener-detail-empty-count">
                <strong>{records.length.toLocaleString("en-IN")}</strong>
                <span>stocks in local universe</span>
              </div>
              <button type="button" className="screener-button secondary" onClick={() => { setSettingsSection("filters"); setSettingsOpen(true); }}>Filter universe</button>
            </div>
          )}
        </aside>
      </div>

      {settingsOpen && (
        <div
          className="screener-settings-overlay"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") setSettingsOpen(false); }}
        >
          <section className="screener-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="screener-settings-title">
            <header className="screener-settings-header">
              <div>
                <span className="eyebrow">SCHCAT / STOCKS</span>
                <h2 id="screener-settings-title">Settings & Library</h2>
              </div>
              <button type="button" className="screener-icon-button" aria-label="Close settings" autoFocus onClick={() => setSettingsOpen(false)}>×</button>
            </header>

            <nav className="screener-settings-tabs" aria-label="Settings sections">
              {([
                ["filters", "Filters"],
                ["queries", "Queries"],
                ["watchlists", "Watchlists"],
                ["data", "Data"]
              ] as const).map(([section, label]) => (
                <button
                  type="button"
                  key={section}
                  className={settingsSection === section ? "active" : ""}
                  aria-pressed={settingsSection === section}
                  onClick={() => setSettingsSection(section)}
                >{label}</button>
              ))}
            </nav>

            <div className="screener-settings-body">
              {settingsSection === "filters" && (
                <>
                  <div className="screener-settings-intro">
                    <strong>Universe filters</strong>
                    <span>Min/max limits are inclusive. Changes apply immediately to the stock table.</span>
                  </div>
                  <div className="screener-filter-grid screener-settings-basic-filters">
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
                  </div>
                  <div className="screener-range-heading">
                    <div><strong>Advanced filters</strong><p>Leave a field empty to ignore that limit.</p></div>
                    <span className="screener-muted">* Undated reference metrics</span>
                  </div>
                  <div className="screener-range-grid">
                    {(Object.keys(RANGE_LABELS) as ScreenerNumericField[]).map((field) => (
                      <div className="screener-range" key={field}>
                        <span>{RANGE_LABELS[field]}</span>
                        <div>
                          <input aria-label={RANGE_LABELS[field] + " minimum"} inputMode="decimal" placeholder="Min" value={ranges[field].min} onChange={(event) => updateRange(field, "min", event.target.value)} />
                          <input aria-label={RANGE_LABELS[field] + " maximum"} inputMode="decimal" placeholder="Max" value={ranges[field].max} onChange={(event) => updateRange(field, "max", event.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="screener-settings-footer">
                    <span>{activeAdvancedFilterCount} active filter groups</span>
                    <button type="button" className="screener-button secondary" onClick={resetFilters}>Clear all filters</button>
                    <button type="button" className="screener-button" onClick={() => setSettingsOpen(false)}>Done</button>
                  </div>
                </>
              )}

              {settingsSection === "queries" && (
                <>
                  <div className="screener-settings-intro">
                    <strong>Saved queries</strong>
                    <span>Choose several in the toolbar to apply their symbol sets with AND logic.</span>
                  </div>
                  <form className="screener-query-form" onSubmit={createQuery}>
                    <label className="screener-field">
                      <span>Query name</span>
                      <input value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="e.g. Strong sector names" />
                    </label>
                    <label className="screener-field screener-query-symbols">
                      <span>Symbols (optional when a ChartInk clause is supplied)</span>
                      <input value={querySymbols} onChange={(event) => setQuerySymbols(event.target.value)} placeholder="RELIANCE, TCS, INFY" />
                    </label>
                    <label className="screener-field screener-query-symbols">
                      <span>ChartInk query clause (optional)</span>
                      <input value={queryCode} onChange={(event) => setQueryCode(event.target.value)} placeholder="Paste ChartInk scan clause" />
                    </label>
                    <button className="screener-button" type="submit">Save query</button>
                  </form>
                  {queryError && <p className="screener-query-error" role="alert">{queryError}</p>}
                  <div className="screener-settings-list">
                    {queries.length > 0 ? queries.map((query) => (
                      <div className="screener-settings-list-row" key={query.name}>
                        <div><strong>{query.name}</strong><small>{query.symbols.length} symbols · {query.queryCode ? "ChartInk scan available" : "Manual symbol list"}</small></div>
                        <div className="screener-settings-row-actions">
                          {query.queryCode && <button type="button" className="screener-button secondary" disabled={queryRuns[query.name]?.status === "loading"} onClick={() => void runSavedQuery(query.name)}>{queryRuns[query.name]?.status === "loading" ? "Running…" : "Run scan"}</button>}
                          <button type="button" className="screener-icon-button" aria-label={"Delete " + query.name} disabled={queryRuns[query.name]?.status === "loading"} onClick={() => removeQuery(query.name)}>×</button>
                        </div>
                        {queryRuns[query.name] && <small className={"screener-query-run-status " + queryRuns[query.name].status}>{queryRuns[query.name].message}</small>}
                      </div>
                    )) : <p className="screener-muted">No saved queries yet.</p>}
                  </div>
                </>
              )}

              {settingsSection === "watchlists" && (
                <>
                  <div className="screener-settings-intro">
                    <strong>Watchlists and local backup</strong>
                    <span>Data stays in this browser. Use exports for a portable backup.</span>
                  </div>
                  <div className="screener-library-actions">
                    <button type="button" className="screener-button secondary" onClick={() => { const blob = new Blob([serializeScreenerLibrary(library)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "schcat-screener-backup.json"; a.click(); URL.revokeObjectURL(url); }}>Export JSON</button>
                    <button type="button" className="screener-button secondary" onClick={() => { const blob = new Blob([serializeWatchlistsCsv(library.watchlists)], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "schcat-watchlists.csv"; a.click(); URL.revokeObjectURL(url); }}>Export watchlists CSV</button>
                    <button type="button" className="screener-button secondary" onClick={() => { const blob = new Blob([serializeSavedQueriesCsv(library.queries)], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "schcat-queries.csv"; a.click(); URL.revokeObjectURL(url); }}>Export queries CSV</button>
                    <button type="button" className="screener-button secondary" onClick={() => libraryInput.current?.click()}>Import</button>
                    <input
                      ref={libraryInput}
                      type="file"
                      accept=".json,.csv,application/json,text/csv"
                      className="research-file-input"
                      onChange={async (event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        try {
                          if (file.name.toLowerCase().endsWith(".csv")) {
                            const csv = await file.text();
                            const header = csv.split(/\r?\n/, 1)[0].toLowerCase();
                            if ((header.includes("queryname") || header.includes("name")) && (header.includes("querycode") || header.includes("query"))) {
                              const imported = parseSavedQueriesCsv(csv);
                              setLibrary((current) => mergeScreenerLibraries(current, { version: 1, watchlists: [], queries: imported }));
                            } else {
                              const imported = parseWatchlistsCsv(csv);
                              setLibrary((current) => mergeScreenerLibraries(current, { version: 1, watchlists: imported, queries: [] }));
                            }
                          } else {
                            const imported = parseScreenerLibraryJson(await file.text());
                            setLibrary((current) => libraryMode === "replace" ? imported : mergeScreenerLibraries(current, imported));
                          }
                          setWatchlistNotice("Library imported successfully.");
                        } catch (error) {
                          setWatchlistNotice(error instanceof Error ? error.message : "Unable to import library.");
                        }
                      }}
                    />
                  </div>
                  <label className="screener-field screener-import-mode">
                    <span>JSON import mode</span>
                    <select value={libraryMode} onChange={(event) => setLibraryMode(event.target.value as "merge" | "replace")}>
                      <option value="merge">Merge / update matching names</option>
                      <option value="replace">Replace local library</option>
                    </select>
                  </label>
                  <form className="screener-watchlist-create" onSubmit={(event) => {
                    event.preventDefault();
                    const name = newWatchlist.trim();
                    if (!name) { setWatchlistNotice("Enter a watchlist name first."); return; }
                    if (library.watchlists.some((item) => item.name.toLowerCase() === name.toLowerCase())) { setWatchlistNotice("That watchlist already exists."); return; }
                    setLibrary((current) => ({ ...current, watchlists: [...current.watchlists, { name, symbols: [] }] }));
                    setNewWatchlist("");
                    setWatchlistNotice("Watchlist created.");
                  }}>
                    <label className="screener-field">
                      <span>New watchlist</span>
                      <input value={newWatchlist} onChange={(event) => setNewWatchlist(event.target.value)} placeholder="e.g. Breakout candidates" />
                    </label>
                    <button type="submit" className="screener-button">Create</button>
                  </form>
                  {watchlistNotice && <p className="screener-help" role="status">{watchlistNotice}</p>}
                  <div className="screener-settings-list">
                    {library.watchlists.length > 0 ? library.watchlists.map((item) => (
                      <div className="screener-settings-list-row" key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.symbols.length} stocks</small>
                          <div className="screener-watchlist-symbols">
                            {item.symbols.map((symbol) => (
                              <span className="screener-watchlist-symbol" key={symbol}>
                                {symbol}
                                <button type="button" aria-label={"Remove " + symbol + " from " + item.name} onClick={() => setLibrary((current) => removeSymbolFromWatchlist(current, item.name, symbol))}>×</button>
                              </span>
                            ))}
                          </div>
                        </div>
                        <button type="button" className="screener-button secondary" onClick={() => {
                          setLibrary((current) => ({ ...current, watchlists: current.watchlists.filter((watchlist) => watchlist.name !== item.name) }));
                          if (activeWatchlist === item.name) setActiveWatchlist("");
                          if (watchlistTarget === item.name) setWatchlistTarget("");
                        }}>Delete</button>
                      </div>
                    )) : <p className="screener-muted">No watchlists yet. Create one above.</p>}
                  </div>
                </>
              )}

              {settingsSection === "data" && (
                <>
                  <div className="screener-settings-intro">
                    <strong>Data refresh</strong>
                    <span>Refresh live MarketSmith ranking fields and recalculate the legacy NikScore. These actions do not change the static source workbook.</span>
                  </div>
                  <div className="screener-data-actions">
                    <button type="button" className="screener-button" onClick={() => void refreshMarketSmithData()} disabled={loading || marketSmithRefresh.status === "loading" || records.length === 0}>
                      {marketSmithRefresh.status === "loading" ? "Fetching " + marketSmithRefresh.completed + "/" + marketSmithRefresh.total : "Fetch live MarketSmith"}
                    </button>
                    <button type="button" className="screener-button secondary" onClick={() => void refreshNikScores()} disabled={loading || nikRefresh.status === "loading" || records.length === 0}>
                      {nikRefresh.status === "loading" ? "NikScore " + nikRefresh.completed + "/" + nikRefresh.total : "Update NikScore"}
                    </button>
                    <a href="/?diagnostics=providers">Provider Diagnostics ↗</a>
                  </div>
                  <div className="screener-data-status">
                    <strong>MarketSmith</strong>
                    <span>{marketSmithRefresh.status === "idle" ? "Not fetched in this session." : marketSmithRefresh.message}{liveUpdatedAt ? " · Updated " + liveUpdatedAt : ""}</span>
                    {marketSmithRefresh.status === "loading" && <progress value={marketSmithRefresh.completed} max={Math.max(1, marketSmithRefresh.total)} />}
                  </div>
                  <div className="screener-data-status">
                    <strong>NikScore</strong>
                    <span>{nikRefresh.status === "idle" ? "Ready to calculate from the original quarterly growth, ROCE and P/B score." : nikRefresh.message}</span>
                    {nikRefresh.status === "loading" && <progress value={nikRefresh.completed} max={Math.max(1, nikRefresh.total)} />}
                  </div>
                  <p className="screener-settings-note">Market Cap, P/B, ROCE and NikScore reference fields may be from an undated workbook snapshot. Refreshed MarketSmith values remain in page memory until you export the filtered CSV.</p>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default StockScreener;
