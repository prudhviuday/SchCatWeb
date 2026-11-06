export interface HistoryValuePoint { label: string; value: number }
export interface IndexedAnnualPoint { year: number; revenueIndex: number | null; epsIndex: number | null }

/** Original RightPanel ROCE thresholds: green >=15, amber >=10, red below 10. */
export function getRoceBand(value: number): "strong" | "moderate" | "weak" {
  if (!Number.isFinite(value)) return "weak";
  return value >= 15 ? "strong" : value >= 10 ? "moderate" : "weak";
}

/** Keep chronological order and retain only the most recent requested observations. */
export function prepareInstitutionBars(
  points: readonly HistoryValuePoint[],
  limit = 20
): Array<HistoryValuePoint & { heightPct: number }> {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 20;
  const valid = safeLimit === 0 ? [] : points.filter(point => point.label.trim() !== "" && Number.isFinite(point.value)).slice(-safeLimit);
  const maximum = Math.max(0, ...valid.map(point => point.value));
  return valid.map(point => ({ ...point, heightPct: maximum > 0 ? Math.max(0, point.value) / maximum * 100 : 0 }));
}

/** Align revenue and EPS on fiscal year using their already-computed legacy normalized indices. */
export function prepareRevenueEpsComparison(
  revenue: readonly { year: number; normalized: number | null }[],
  eps: readonly { year: number; normalized: number | null }[]
): IndexedAnnualPoint[] {
  const revenueByYear = new Map(revenue.map(point => [point.year, point.normalized]));
  const epsByYear = new Map(eps.map(point => [point.year, point.normalized]));
  return [...new Set([...revenueByYear.keys(), ...epsByYear.keys()])].sort((a, b) => a - b).map(year => ({
    year,
    revenueIndex: revenueByYear.get(year) ?? null,
    epsIndex: epsByYear.get(year) ?? null
  }));
}
