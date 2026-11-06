import type { MarketSmithLiveMetrics } from "../../data/providers/marketSmithStockData.js";
import type { MarketUniverseRecord } from "../../data/reference/marketUniverse.js";

export interface ScreenerRow extends MarketUniverseRecord, Partial<Omit<MarketSmithLiveMetrics, "quarterlyGrowth">> {}

export type ScreenerNumericField =
  | "marketCap" | "pb" | "roce" | "nikScore"
  | "groupRank" | "rs" | "epsRank" | "masterScore" | "pe" | "peg" | "fScore" | "accDis";
export type ScreenerSortField = keyof ScreenerRow;

export interface NumericRange {
  min?: number;
  max?: number;
}

export interface ScreenerFilters {
  search?: string;
  sector?: string;
  industry?: string;
  ranges?: Partial<Record<ScreenerNumericField, NumericRange>>;
}

export const SCREENER_COLUMNS: ReadonlyArray<{
  key: ScreenerSortField;
  label: string;
  numeric: boolean;
}> = [
  { key: "symbol", label: "Stock", numeric: false },
  { key: "industry", label: "Industry", numeric: false },
  { key: "groupRank", label: "Group Rank", numeric: true },
  { key: "rs", label: "RS", numeric: true },
  { key: "epsRank", label: "EPS Rank", numeric: true },
  { key: "masterScore", label: "MasterScore", numeric: true },
  { key: "accDis", label: "Acc/Dis", numeric: false },
  { key: "pe", label: "PE", numeric: true },
  { key: "peg", label: "PEG", numeric: true },
  { key: "fScore", label: "FScore", numeric: true },
  { key: "marketCap", label: "Market Cap*", numeric: true },
  { key: "pb", label: "P/B*", numeric: true },
  { key: "roce", label: "ROCE*", numeric: true },
  { key: "nikScore", label: "NikScore*", numeric: true }
];

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

/**
 * Apply the desktop screener's AND behaviour to already-resolved query results.
 * Missing query names are ignored, matching the legacy helper's invalid-key
 * handling. A valid query that returns no symbols remains an empty match set.
 */
export function intersectSelectedQueries(
  records: readonly ScreenerRow[],
  selectedQueryNames: readonly string[],
  queryMatches: ReadonlyMap<string, readonly string[]>
): ScreenerRow[] {
  const matchSets = selectedQueryNames
    .filter((name) => queryMatches.has(name))
    .map((name) => new Set(queryMatches.get(name)!.map((symbol) => symbol.trim().toUpperCase())));

  if (matchSets.length === 0) return [...records];

  const intersection = new Set(matchSets[0]);
  for (const matches of matchSets.slice(1)) {
    for (const symbol of intersection) {
      if (!matches.has(symbol)) intersection.delete(symbol);
    }
  }

  return records.filter((record) => intersection.has(record.symbol));
}

export function applyScreenerFilters(
  records: readonly ScreenerRow[],
  filters: ScreenerFilters = {},
  selectedQueryNames: readonly string[] = [],
  queryMatches: ReadonlyMap<string, readonly string[]> = new Map()
): ScreenerRow[] {
  const queryFiltered = intersectSelectedQueries(records, selectedQueryNames, queryMatches);
  const search = normalized(filters.search);
  const sector = normalized(filters.sector);
  const industry = normalized(filters.industry);
  const ranges = filters.ranges ?? {};

  return queryFiltered.filter((record) => {
    if (search) {
      const haystack = [record.symbol, record.industry, record.sector]
        .map(normalized)
        .join(" ");
      if (!haystack.includes(search)) return false;
    }

    if (sector && normalized(record.sector) !== sector) return false;
    if (industry && normalized(record.industry) !== industry) return false;

    for (const field of [
      "marketCap", "pb", "roce", "nikScore",
      "groupRank", "rs", "epsRank", "masterScore", "pe", "peg", "fScore", "accDis"
    ] as const) {
      const range = ranges[field];
      if (!range || (range.min === undefined && range.max === undefined)) continue;

      const rawValue = record[field];
      // Legacy pandas.to_numeric(errors="coerce") accepted numeric Acc/Dis
      // values and excluded alphabetic ratings while an Acc/Dis range was active.
      const value = typeof rawValue === "number"
        ? rawValue
        : field === "accDis" && typeof rawValue === "string" && rawValue.trim() !== ""
          ? Number(rawValue)
          : null;
      if (value === null || !Number.isFinite(value)) return false;
      if (range.min !== undefined && value < range.min) return false;
      if (range.max !== undefined && value > range.max) return false;
    }

    return true;
  });
}

/**
 * Stable sort with missing values last in both directions, matching the
 * desktop table's numeric coercion / na_position="last" behaviour.
 */
export function sortScreenerRecords(
  records: readonly ScreenerRow[],
  field: ScreenerSortField,
  ascending = true
): ScreenerRow[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const a = left.record[field];
      const b = right.record[field];

      if (a == null || b == null) {
        if (a == null && b == null) return left.index - right.index;
        return a == null ? 1 : -1;
      }

      let comparison: number;
      if (typeof a === "number" && typeof b === "number") {
        comparison = a - b;
      } else {
        comparison = String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      }

      return (ascending ? comparison : -comparison) || left.index - right.index;
    })
    .map(({ record }) => record);
}

export function parseSymbolList(input: string): string[] {
  return [...new Set(
    input
      .split(/[\s,;]+/)
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
  )];
}


export interface IndustryDrilldownState {
  previousIndustry: string;
  activeIndustry: string;
}

/** Mirrors the desktop Industry-column double-click toggle and restores the prior filter. */
export function toggleIndustryDrilldown(
  currentIndustry: string,
  clickedIndustry: string,
  state: IndustryDrilldownState | null
): { industry: string; state: IndustryDrilldownState | null } {
  if (state) return { industry: state.previousIndustry, state: null };
  const nextIndustry = clickedIndustry.trim();
  if (!nextIndustry) return { industry: currentIndustry, state: null };
  return {
    industry: nextIndustry,
    state: { previousIndustry: currentIndustry, activeIndustry: nextIndustry }
  };
}

/** Desktop shortcuts: Right Arrow uses the selected watchlist; 1–9 use list order. */
export function resolveWatchlistShortcut(
  key: string,
  selectedWatchlist: string,
  watchlistNames: readonly string[]
): string | null | undefined {
  if (key === "ArrowRight") return selectedWatchlist.trim() || null;
  if (/^[1-9]$/.test(key)) return watchlistNames[Number(key) - 1] ?? null;
  return undefined;
}
