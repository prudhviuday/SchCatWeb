/**
 * Pure, provider-independent SchCat calculations ported from the legacy util.py.
 *
 * Compatibility policy:
 * - Keep the source formulas and ordering unchanged.
 * - Use Math.trunc where Python's int(...) truncates toward zero.
 * - Reject empty/constant normalization inputs instead of fabricating data.
 */

export type NumericInput = number | string;

export interface EarningsSalesQuarter {
  epsPct?: number | null;
  salesPct?: number | null;
}

function toFiniteNumber(value: NumericInput, label: string): number {
  if (typeof value === "string" && value.trim() === "") {
    throw new TypeError(label + " must be numeric");
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(label + " must be a finite number");
  }
  return numeric;
}

/**
 * Legacy util.normalize(data):
 * int(100 * ((value - min(data)) / (max(data) - min(data))))
 *
 * The result is not rounded; Python int() truncates toward zero.
 */
export function normalizeSeries(values: readonly NumericInput[]): number[] {
  if (values.length === 0) {
    throw new RangeError("Cannot normalize an empty series");
  }

  const numericValues = values.map((value, index) =>
    toFiniteNumber(value, "values[" + index + "]")
  );
  const minimum = Math.min(...numericValues);
  const maximum = Math.max(...numericValues);
  const range = maximum - minimum;

  if (range === 0) {
    throw new RangeError("Cannot normalize a constant series");
  }

  return numericValues.map((value) =>
    Math.trunc(100 * ((value - minimum) / range))
  );
}

/**
 * Exact port of util.getepssalesrating (the screener's FScore).
 *
 * Only the first three quarterly observations are used. A missing or null
 * EPS/sales percentage contributes zero. Threshold comparisons are strict
 * (> 70), as in the Python implementation.
 */
export function calculateEarningsSalesScore(
  quarters: readonly EarningsSalesQuarter[]
): number {
  if (quarters.length < 3) return 0;

  const firstThree = quarters.slice(0, 3);
  const eps = firstThree.map((quarter) => quarter.epsPct ?? 0);
  const sales = firstThree.map((quarter) => quarter.salesPct ?? 0);

  const epsThresholdPoints =
    (eps[0] > 70 ? 5 : 0) +
    (eps[1] > 70 ? 3 : 0) +
    (eps[2] > 70 ? 2 : 0);

  const salesThresholdPoints =
    (sales[0] > 70 ? 5 : 0) +
    (sales[1] > 70 ? 3 : 0) +
    (sales[2] > 70 ? 2 : 0);

  const epsTrendPoints =
    (eps[0] > eps[2] ? 3 : 0) +
    (eps[0] > eps[1] && eps[1] > eps[2] ? 2 : 0);

  const salesTrendPoints =
    (sales[0] > sales[2] ? 3 : 0) +
    (sales[0] > sales[1] && sales[1] > sales[2] ? 2 : 0);

  return (
    epsThresholdPoints +
    salesThresholdPoints +
    epsTrendPoints +
    salesTrendPoints
  );
}

/**
 * Exact clamp/truncation used by fetch_EPS_acc_from_MS and
 * fetch_Sales_acc_from_MS: int(value or 0), bounded to [-200, 200].
 */
export function clampQuarterlyGrowth(value: number | null | undefined): number {
  if (value == null || value === 0) return 0;
  if (!Number.isFinite(value)) {
    throw new TypeError("Quarterly growth must be a finite number");
  }
  return Math.max(-200, Math.min(200, Math.trunc(value)));
}

/**
 * Exact numeric transform in getExpansionFromMs:
 * int((float(c25) / float(c32)) * 100).
 */
export function calculateExpansionPercentage(
  c25: NumericInput,
  c32: NumericInput
): number {
  const numerator = toFiniteNumber(c25, "c25");
  const denominator = toFiniteNumber(c32, "c32");
  if (denominator === 0) {
    throw new RangeError("c32 must not be zero");
  }
  return Math.trunc((numerator / denominator) * 100);
}

/**
 * Exact scaling in getInstitutionCostFromMs:
 * int(totSharesHeldByFunds * currentPrice / 1,000,000,000).
 * The legacy function maps a null share count to zero.
 */
export function calculateInstitutionalCostBillions(
  sharesHeldByFunds: number | null | undefined,
  currentPrice: number
): number {
  if (sharesHeldByFunds == null) return 0;
  if (!Number.isFinite(sharesHeldByFunds) || !Number.isFinite(currentPrice)) {
    throw new TypeError("Shares and current price must be finite numbers");
  }
  return Math.trunc((sharesHeldByFunds * currentPrice) / 1_000_000_000);
}

/**
 * Exact transform in fetch_RS_graph_from_MS:
 * 1. Compute int(mean(non-null RS values)).
 * 2. Replace null AND zero observations with that average (the Python
 *    conditional expression also replaces zero).
 * 3. Multiply by market cap (or 1 when market-cap weighting is disabled).
 * 4. Reverse the series.
 */
export function calculateMarketCapWeightedRelativeStrength(
  rawValues: readonly (number | null)[],
  marketCap = 1
): number[] {
  if (!Number.isFinite(marketCap)) {
    throw new TypeError("Market cap must be a finite number");
  }

  const nonNullValues = rawValues.filter(
    (value): value is number => value !== null
  );
  if (nonNullValues.some((value) => !Number.isFinite(value))) {
    throw new TypeError("Relative-strength values must be finite or null");
  }

  const total = nonNullValues.reduce((sum, value) => sum + value, 0);
  const average = Math.trunc(total / (nonNullValues.length || 1));

  return rawValues
    .map((value) => (value ? value : average) * marketCap)
    .reverse();
}
