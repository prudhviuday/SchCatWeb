import type { MarketUniverseRecord } from "../../data/reference/marketUniverse.js";

export interface IndustryReferenceSummary {
  industry: string;
  stockCount: number;
  marketCapTotal: number;
  missingMarketCapCount: number;
  stocks: MarketUniverseRecord[];
}

export interface LegacyIndustryResult {
  industry: string;
  institutionalValueBillions: number[];
  closeVolumeBillions: number[];
  deliveryPercent: number[];
  industryRelativeStrength: number[];
}

export interface IndustrySeriesInputs {
  institutionalValue: readonly (readonly number[])[];
  closeVolume: readonly (readonly number[])[];
  deliveryValue: readonly (readonly number[])[];
  tradedValue: readonly (readonly number[])[];
  marketCapWeightedRelativeStrength: readonly (readonly number[])[];
  marketCaps: readonly (number | null)[];
}

export interface AggregatedIndustrySeries {
  institutionalValueBillions: number[];
  closeVolumeBillions: number[];
  deliveryPercent: number[];
  industryRelativeStrength: number[];
  marketCapDenominator: number;
}

/**
 * Exact legacy pad_and_sum behaviour:
 * shorter series are prefixed with copies of their own first value.
 * Empty series are ignored, as the desktop worker only appended non-empty data.
 */
export function padAndSumSeries(
  seriesList: readonly (readonly number[])[]
): number[] {
  const nonEmpty = seriesList.filter((series) => series.length > 0);
  if (nonEmpty.length === 0) return [];
  const maxLength = Math.max(...nonEmpty.map((series) => series.length));

  return Array.from({ length: maxLength }, (_, index) =>
    nonEmpty.reduce((sum, series) => {
      const offset = maxLength - series.length;
      const value = index < offset ? series[0] : series[index - offset];
      return sum + value;
    }, 0)
  );
}

/**
 * Exact legacy Delivery_process behaviour:
 * shorter delivery/traded series are prefixed with zeroes, then summed.
 */
export function zeroPadAndSumSeries(
  seriesList: readonly (readonly number[])[]
): number[] {
  const nonEmpty = seriesList.filter((series) => series.length > 0);
  if (nonEmpty.length === 0) return [];
  const maxLength = Math.max(...nonEmpty.map((series) => series.length));

  return Array.from({ length: maxLength }, (_, index) =>
    nonEmpty.reduce((sum, series) => {
      const offset = maxLength - series.length;
      return sum + (index < offset ? 0 : series[index - offset]);
    }, 0)
  );
}

/**
 * Port of the final IndustryWorker aggregation formulas.
 *
 * The market-cap denominator preserves getTotalIndCap's initial +1 and its
 * missing-symbol fallback of +1. Market caps are an undated workbook snapshot.
 * The caller supplies per-stock RS series already weighted by stock market cap,
 * as fetch_RS_graph_from_MS(stock_info, True) does in the desktop version.
 */
export function aggregateIndustrySeries(
  inputs: IndustrySeriesInputs
): AggregatedIndustrySeries {
  const institutionalValueBillions = padAndSumSeries(inputs.institutionalValue);
  const closeVolumeBillions = padAndSumSeries(inputs.closeVolume);
  const totalDeliveryValue = zeroPadAndSumSeries(inputs.deliveryValue);
  const totalTradedValue = zeroPadAndSumSeries(inputs.tradedValue);
  const relativeStrengthTotals = padAndSumSeries(
    inputs.marketCapWeightedRelativeStrength
  );

  const marketCapDenominator = 1 + inputs.marketCaps.reduce<number>(
    (sum, marketCap) => sum + (marketCap ?? 1),
    0
  );

  const deliveryPercent = totalDeliveryValue.map((value, index) => {
    const tradedValue = totalTradedValue[index];
    if (tradedValue === undefined || tradedValue === 0) {
      throw new RangeError("Industry traded value must be non-zero for delivery percentage");
    }
    return Math.round((value * 100 / tradedValue) * 100) / 100;
  });

  const industryRelativeStrength = relativeStrengthTotals.map(
    (value) => Math.round((value / marketCapDenominator) * 100) / 100
  );

  return {
    institutionalValueBillions,
    closeVolumeBillions,
    deliveryPercent,
    industryRelativeStrength,
    marketCapDenominator
  };
}

/**
 * Match the desktop worker's industry universe: sorted unique non-null
 * industries, excluding labels beginning with the literal "BSE".
 */
export function buildIndustryReferenceSummaries(
  records: readonly MarketUniverseRecord[]
): IndustryReferenceSummary[] {
  const groups = new Map<string, MarketUniverseRecord[]>();
  for (const record of records) {
    const industry = record.industry;
    if (!industry || industry.startsWith("BSE")) continue;
    const group = groups.get(industry) ?? [];
    group.push(record);
    groups.set(industry, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map(([industry, stocks]) => ({
      industry,
      stockCount: stocks.length,
      marketCapTotal: stocks.reduce((sum, stock) => sum + (stock.marketCap ?? 0), 0),
      missingMarketCapCount: stocks.filter((stock) => stock.marketCap === null).length,
      stocks: [...stocks].sort((left, right) => left.symbol.localeCompare(right.symbol))
    }));
}

function parseNumericSeries(value: unknown, field: string, industry: string): number[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Industry result ${industry} ${field} must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new TypeError(`Industry result ${industry} ${field}[${index}] must be finite`);
    }
    return item;
  });
}

/**
 * Load the five-element array format written by the original desktop app:
 * [industry, institutional, close×volume, delivery %, industry RS].
 * Values have no dates in that format; callers must show positional indexes,
 * not invent calendar labels.
 */
export function parseLegacyIndustryResults(input: unknown): LegacyIndustryResult[] {
  if (!Array.isArray(input)) {
    throw new TypeError("Saved industry results must be a JSON array");
  }

  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!Array.isArray(raw) || raw.length < 5) {
      throw new TypeError(`Industry result row ${index} must have five elements`);
    }

    const industry = raw[0];
    if (typeof industry !== "string" || industry.trim() === "") {
      throw new TypeError(`Industry result row ${index} has an invalid industry name`);
    }
    if (seen.has(industry)) {
      throw new RangeError(`Duplicate saved industry result: ${industry}`);
    }
    seen.add(industry);

    return {
      industry,
      institutionalValueBillions: parseNumericSeries(raw[1], "institutionalValue", industry),
      closeVolumeBillions: parseNumericSeries(raw[2], "closeVolume", industry),
      deliveryPercent: parseNumericSeries(raw[3], "deliveryPercent", industry),
      industryRelativeStrength: parseNumericSeries(raw[4], "relativeStrength", industry)
    };
  });
}

export function serializeLegacyIndustryResults(
  results: readonly LegacyIndustryResult[]
): unknown[][] {
  return results.map((result) => [
    result.industry,
    [...result.institutionalValueBillions],
    [...result.closeVolumeBillions],
    [...result.deliveryPercent],
    [...result.industryRelativeStrength]
  ]);
}

export function filterIndustrySummaries(
  industries: readonly IndustryReferenceSummary[],
  search: string
): IndustryReferenceSummary[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [...industries];
  return industries.filter((item) =>
    item.industry.toLocaleLowerCase().includes(query)
  );
}
