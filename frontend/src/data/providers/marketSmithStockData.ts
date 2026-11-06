import { calculateEarningsSalesScore, clampQuarterlyGrowth, normalizeSeries } from "../../domain/analysis/fundamentalMetrics.js";
import {
  getMarketSmithId,
  type MarketSmithIdMap
} from "../reference/marketSmithIds.js";
import type { MarketUniverseRecord } from "../reference/marketUniverse.js";

export interface MarketSmithLiveMetrics {
  groupRank: number | null;
  rs: number | null;
  epsRank: number | null;
  masterScore: number | null;
  accDis: string | null;
  pe: number;
  peg: number | null;
  fScore: number;
  roe: number | null;
  epsGrowth: number | null;
  stability: number | null;
  livePb: number | null;
  cashFlow: number | null;
  currentPrice: number | null;
  quarterlyGrowth: MarketSmithQuarterlyGrowthPoint[];
  institutionalOwnership: MarketSmithInstitutionPoint[];
  institutionalCost: MarketSmithInstitutionPoint[];
}

export interface MarketSmithAnnualEpsPoint {
  year: number;
  eps: number;
  normalized: number | null;
}

export interface MarketSmithInstitutionPoint {
  period: string;
  value: number;
  normalized: number | null;
}

export interface MarketSmithQuarterlyGrowthPoint {
  period: string;
  epsPct: number;
  salesPct: number;
  salesValue: number | null;
}

export interface MarketSmithAnnualValuePoint {
  year: number;
  value: number;
  normalized: number | null;
}

export interface MarketSmithQuarterlyExpansionPoint {
  period: string;
  value: number;
}

export interface MarketSmithFinanceData {
  annualEps: MarketSmithAnnualEpsPoint[];
  annualRoce: MarketSmithAnnualValuePoint[];
  annualRevenue: MarketSmithAnnualValuePoint[];
  quarterlyExpansion: MarketSmithQuarterlyExpansionPoint[];
}

export interface MarketSmithFetchFailure {
  symbol: string;
  message: string;
}

export interface MarketSmithUniverseFetchResult {
  metrics: Map<string, MarketSmithLiveMetrics>;
  failures: MarketSmithFetchFailure[];
  skippedWithoutId: number;
  completed: number;
  total: number;
}

export interface MarketSmithUniverseFetchOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
  fetcher?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pythonCompatiblePeg(pe: number, growthValue: unknown): number | null {
  // util.fetch_stock_data_from_MS uses b.get("epsGrowthRate", "1") or 5.
  const denominator = growthValue === undefined
    ? 1
    : growthValue
      ? finiteNumber(growthValue)
      : 5;
  if (denominator === null || denominator === 0) return null;
  const rounded = Math.round((pe / denominator) * 100) / 100;
  return rounded || 5;
}

/**
 * Port of util.fetch_stock_data_from_MS using the fields returned by
 * symboldetails.json. Workbook-backed Industry/ROCE/NikScore remain separate.
 */
export function parseMarketSmithStockMetrics(payload: unknown): MarketSmithLiveMetrics {
  const root = asRecord(payload);
  const response = asRecord(root?.response);
  if (!response) {
    throw new TypeError("MarketSmith symbol response is missing the response object");
  }

  const header = asRecord(response.detailsGeneralInformationHeader) ?? {};
  const headerBlock = asRecord(response.detailsGeneralInformationHeaderBlock) ?? {};
  const quarterlyBlock = asRecord(response.quarterlySalesAndEarningsInternational);
  const quarters = Array.isArray(quarterlyBlock?.quarterlySalesAndEarningsOrigin)
    ? quarterlyBlock.quarterlySalesAndEarningsOrigin
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => item !== null)
    : [];

  const pe = Math.trunc(finiteNumber(header.pe) ?? 0);
  const growthRaw = headerBlock.epsGrowthRate;
  const quarterlyGrowth = quarters.slice().reverse().map((quarter) => {
    const year = textValue(quarter.prdYear) ?? "";
    const quarterName = textValue(quarter.prdQuarter) ?? "";
    return {
      period: [year, quarterName].filter(Boolean).join(" "),
      epsPct: clampQuarterlyGrowth(finiteNumber(quarter.epsPct)),
      salesPct: clampQuarterlyGrowth(finiteNumber(quarter.salesPct)),
      salesValue: finiteNumber(quarter.sales)
    };
  });
  const institutionBlock = asRecord(response.quarterlySalesAndEarningsInternational);
  const institutionRows = Array.isArray(institutionBlock?.quarterlySalesAndEarningsOrigin)
    ? institutionBlock.quarterlySalesAndEarningsOrigin.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const currentPrice = Math.trunc(finiteNumber(header.currentPrice) ?? 0);
  const institutionChronological = institutionRows.slice().reverse().map((item) => ({
    period: "01-" + (textValue(item.prdYear) ?? ""),
    shares: finiteNumber(item.totSharesHeldByFunds) ?? 0
  }));
  const ownershipValues = institutionChronological.map((item) => item.shares);
  let ownershipIndices: number[] = [];
  if (ownershipValues.length > 1) {
    try { ownershipIndices = normalizeSeries(ownershipValues); } catch { ownershipIndices = []; }
  }
  const institutionalOwnership = institutionChronological.map((item, index) => ({
    period: item.period, value: item.shares, normalized: ownershipIndices[index] ?? null
  }));
  const institutionalCost = institutionChronological.map((item) => ({
    period: item.period,
    value: Math.trunc(item.shares * currentPrice / 1_000_000_000),
    normalized: null
  }));

  const score = calculateEarningsSalesScore(quarters.slice(0, 3).map((quarter) => ({
    epsPct: finiteNumber(quarter.epsPct),
    salesPct: finiteNumber(quarter.salesPct)
  })));

  return {
    groupRank: finiteNumber(header.industryGroupRank),
    rs: finiteNumber(header.rsNumericGrade),
    epsRank: finiteNumber(header.epsRank),
    masterScore: finiteNumber(header.masterScore),
    accDis: textValue(header.accDisRating),
    pe,
    peg: pythonCompatiblePeg(pe, growthRaw),
    fScore: score,
    roe: finiteNumber(header.roe),
    epsGrowth: finiteNumber(growthRaw),
    stability: finiteNumber(headerBlock.earningsStability),
    livePb: finiteNumber(headerBlock.bookVal),
    cashFlow: finiteNumber(headerBlock.cashFlow),
    currentPrice: finiteNumber(header.currentPrice),
    institutionalOwnership,
    institutionalCost,
    quarterlyGrowth
  };
}

export async function fetchMarketSmithStockMetrics(
  stockId: number | string,
  symbol: string,
  authValue: string,
  fetcher: typeof fetch = fetch
): Promise<MarketSmithLiveMetrics> {
  const id = String(stockId).trim();
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^\d{1,12}$/.test(id)) {
    throw new TypeError("MarketSmith instrument ID must contain digits only");
  }
  if (!/^[A-Z0-9&._-]{1,30}$/.test(safeSymbol)) {
    throw new TypeError("MarketSmith symbol contains unsupported characters");
  }
  if (!authValue.trim()) {
    throw new Error("MarketSmith session is not configured in this browser");
  }

  const params = new URLSearchParams({ stockId: id, symbol: safeSymbol });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`/api/marketsmith/symbol?${params.toString()}`, {
      method: "GET",
      mode: "same-origin",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "x-marketsmith-auth": authValue.trim()
      },
      signal: controller.signal
    });

    const body = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw new TypeError(`MarketSmith returned invalid JSON for ${safeSymbol}`);
    }

    if (!response.ok) {
      const data = asRecord(payload);
      const message = typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : "Provider request failed";
      throw new Error(`${safeSymbol}: MarketSmith HTTP ${response.status} — ${message}`);
    }

    return parseMarketSmithStockMetrics(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${safeSymbol}: MarketSmith request timed out`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/**
 * Parse the legacy financeDetails ratiosAnnualData series. The desktop reverses
 * MarketSmith's newest-first rows, then applies util.normalize to annual EPS.
 */
export function parseMarketSmithFinanceData(payload: unknown): MarketSmithFinanceData {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.ratiosAnnualData)
    ? root.ratiosAnnualData.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const chronological = rows.slice().reverse().map((row) => ({
    year: finiteNumber(row.c0),
    eps: finiteNumber(row.c20)
  })).filter((row): row is { year: number; eps: number } => row.year !== null && row.eps !== null);

  let normalized: number[] = [];
  if (chronological.length > 1) {
    try {
      normalized = normalizeSeries(chronological.map((row) => row.eps));
    } catch {
      normalized = [];
    }
  }

  const annualValues = (source: unknown, yearField: string, valueField: string, revenueYear = false): MarketSmithAnnualValuePoint[] => {
    const values = Array.isArray(source) ? source.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => {
        const rawYear = textValue(row[yearField]);
        let year = finiteNumber(rawYear);
        if (revenueYear && rawYear?.includes("-")) {
          const suffix = rawYear.split("-").at(-1) ?? "";
          const shortYear = finiteNumber(suffix);
          year = shortYear === null ? null : (shortYear < 100 ? 2000 + shortYear : shortYear);
        }
        return { year, value: finiteNumber(row[valueField]) };
      }).filter((row): row is { year: number; value: number } => row.year !== null && row.value !== null)
      .reverse() : [];
    let indices: number[] = [];
    if (values.length > 1) {
      try { indices = normalizeSeries(values.map((row) => row.value)); } catch { indices = []; }
    }
    return values.map((row, index) => ({ year: row.year, value: row.value, normalized: indices[index] ?? null }));
  };

  return {
    annualEps: chronological.map((row, index) => ({
      year: row.year,
      eps: row.eps,
      normalized: normalized[index] ?? null
    })),
    annualRoce: annualValues(root?.ratiosAnnualData, "c0", "c4"),
    annualRevenue: annualValues(root?.incAnnualData, "c0", "c3", true),
    quarterlyExpansion: (Array.isArray(root?.incQuarterData) ? root.incQuarterData : [])
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => row !== null)
      .map((row) => {
        const numerator = finiteNumber(row.c25);
        const denominator = finiteNumber(row.c32);
        return {
          period: "01-" + (textValue(row.c0) ?? ""),
          value: numerator === null || denominator === null || denominator === 0
            ? null
            : Math.trunc(numerator / denominator * 100)
        };
      })
      .filter((point): point is { period: string; value: number } => point.value !== null && point.period !== "")
      .reverse()
  };
}

export async function fetchMarketSmithFinanceData(
  stockId: number | string,
  authValue: string,
  fetcher: typeof fetch = fetch
): Promise<MarketSmithFinanceData> {
  const id = String(stockId).trim();
  if (!/^\d{1,12}$/.test(id)) throw new TypeError("MarketSmith instrument ID must contain digits only");
  if (!authValue.trim()) throw new Error("MarketSmith session is not configured in this browser");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`/api/marketsmith/finance?stockId=${encodeURIComponent(id)}`, {
      method: "GET",
      mode: "same-origin",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "x-marketsmith-auth": authValue.trim()
      },
      signal: controller.signal
    });
    const body = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw new TypeError("MarketSmith returned invalid finance JSON");
    }
    if (!response.ok) {
      const data = asRecord(payload);
      const message = typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : "Provider request failed";
      throw new Error(`MarketSmith finance HTTP ${response.status} — ${message}`);
    }
    return parseMarketSmithFinanceData(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("MarketSmith finance request timed out");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/**
 * Fetch the whole reference universe using the same eight-worker concurrency
 * used by helper.py. No requests start automatically; the screener calls this
 * only after the user presses its live-refresh button.
 */
export async function fetchMarketSmithUniverse(
  records: readonly MarketUniverseRecord[],
  idMap: MarketSmithIdMap,
  authValue: string,
  options: MarketSmithUniverseFetchOptions = {}
): Promise<MarketSmithUniverseFetchResult> {
  if (!authValue.trim()) throw new Error("Save a current MarketSmith session in Provider Diagnostics first.");

  const concurrency = options.concurrency ?? 8;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new RangeError("MarketSmith concurrency must be between 1 and 16");
  }

  const jobs = records.flatMap((record) => {
    const id = record.instrumentId ?? getMarketSmithId(idMap, record.symbol);
    return id === null ? [] : [{ record, id }];
  });
  const skippedWithoutId = records.length - jobs.length;
  const metrics = new Map<string, MarketSmithLiveMetrics>();
  const failures: MarketSmithFetchFailure[] = [];
  let cursor = 0;
  let completed = skippedWithoutId;

  options.onProgress?.(completed, records.length);

  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      const job = jobs[index];
      try {
        const value = await fetchMarketSmithStockMetrics(
          job.id,
          job.record.symbol,
          authValue,
          options.fetcher ?? fetch
        );
        metrics.set(job.record.symbol, value);
      } catch (error) {
        failures.push({
          symbol: job.record.symbol,
          message: error instanceof Error ? error.message : "Unknown MarketSmith error"
        });
      } finally {
        completed += 1;
        options.onProgress?.(completed, records.length);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker())
  );

  return {
    metrics,
    failures,
    skippedWithoutId,
    completed,
    total: records.length
  };
}


export interface MarketSmithRelativeStrengthPoint {
  index: number;
  value: number;
}

/**
 * Port of util.fetch_RS_graph_from_MS (marketcapNorm=false): take chart.prices
 * rlst values, replace missing observations with the integer mean of available
 * values, then reverse the provider's newest-first sequence.
 */
export function parseMarketSmithRelativeStrength(payload: unknown): MarketSmithRelativeStrengthPoint[] {
  const root = asRecord(payload);
  const chart = asRecord(root?.chart);
  const prices = Array.isArray(chart?.prices)
    ? chart.prices.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
    : [];
  const raw = prices.map((row) => finiteNumber(row.rlst));
  const available = raw.filter((value): value is number => value !== null);
  if (available.length === 0) return [];
  const average = Math.trunc(available.reduce((sum, value) => sum + value, 0) / available.length);
  return raw.reverse().map((value, index) => ({
    index: index + 1,
    value: value ?? average
  }));
}

export async function fetchMarketSmithRelativeStrength(
  stockId: number | string,
  symbol: string,
  authValue: string,
  fetcher: typeof fetch = fetch
): Promise<MarketSmithRelativeStrengthPoint[]> {
  const id = String(stockId).trim();
  const safeSymbol = symbol.trim().toUpperCase();
  if (!/^\d{1,12}$/.test(id)) throw new TypeError("MarketSmith instrument ID must contain digits only");
  if (!/^[A-Z0-9&._-]{1,30}$/.test(safeSymbol)) throw new TypeError("MarketSmith symbol contains unsupported characters");
  if (!authValue.trim()) throw new Error("MarketSmith session is not configured in this browser");
  const params = new URLSearchParams({ stockId: id, symbol: safeSymbol });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`/api/marketsmith/relative-strength?${params.toString()}`, {
      method: "GET",
      mode: "same-origin",
      credentials: "same-origin",
      headers: { Accept: "application/json", "x-marketsmith-auth": authValue.trim() },
      signal: controller.signal
    });
    const body = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(body) as unknown; }
    catch { throw new TypeError(`MarketSmith returned invalid relative-strength JSON for ${safeSymbol}`); }
    if (!response.ok) {
      const data = asRecord(payload);
      const message = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : "Provider request failed";
      throw new Error(`${safeSymbol}: MarketSmith RS HTTP ${response.status} — ${message}`);
    }
    const points = parseMarketSmithRelativeStrength(payload);
    if (points.length === 0) throw new Error(`${safeSymbol}: MarketSmith returned no relative-strength observations`);
    return points;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`${safeSymbol}: MarketSmith RS request timed out`);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
