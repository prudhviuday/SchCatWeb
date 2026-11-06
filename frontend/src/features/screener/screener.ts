import type { MarketUniverseRecord } from "../../data/reference/marketUniverse";

export type ScreenerNumericField = "marketCap" | "pb" | "roce" | "nikScore";
export type ScreenerSortField = keyof MarketUniverseRecord;

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
  { key: "sector", label: "Sector", numeric: false },
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
  records: readonly MarketUniverseRecord[],
  selectedQueryNames: readonly string[],
  queryMatches: ReadonlyMap<string, readonly string[]>
): MarketUniverseRecord[] {
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
  records: readonly MarketUniverseRecord[],
  filters: ScreenerFilters = {},
  selectedQueryNames: readonly string[] = [],
  queryMatches: ReadonlyMap<string, readonly string[]> = new Map()
): MarketUniverseRecord[] {
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

    for (const field of ["marketCap", "pb", "roce", "nikScore"] as const) {
      const range = ranges[field];
      if (!range || (range.min === undefined && range.max === undefined)) continue;

      const value = record[field];
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
  records: readonly MarketUniverseRecord[],
  field: ScreenerSortField,
  ascending = true
): MarketUniverseRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const a = left.record[field];
      const b = right.record[field];

      if (a === null || b === null) {
        if (a === null && b === null) return left.index - right.index;
        return a === null ? 1 : -1;
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
