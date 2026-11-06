import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateIndustrySeries,
  buildIndustryReferenceSummaries,
  filterIndustrySummaries,
  padAndSumSeries,
  parseLegacyIndustryResults,
  serializeLegacyIndustryResults,
  zeroPadAndSumSeries
} from "../../.test-dist/features/industry/industryAnalysis.js";

const row = (symbol, industry, marketCap) => ({
  symbol,
  instrumentId: 1,
  marketCap,
  sector: "sector",
  industry,
  pb: null,
  roce: null,
  nikScore: null
});

test("legacy pad_and_sum prefixes shorter series with their first value", () => {
  assert.deepEqual(
    padAndSumSeries([[10, 20, 30], [2, 4]]),
    [12, 22, 34]
  );
  assert.deepEqual(padAndSumSeries([[], [3, 5]]), [3, 5]);
  assert.deepEqual(padAndSumSeries([]), []);
});

test("legacy Delivery_process zero-pads shorter series before summing", () => {
  assert.deepEqual(
    zeroPadAndSumSeries([[10, 20, 30], [2, 4]]),
    [10, 22, 34]
  );
  assert.deepEqual(zeroPadAndSumSeries([[], [3, 5]]), [3, 5]);
  assert.deepEqual(zeroPadAndSumSeries([]), []);
});

test("industry aggregation preserves legacy series alignment and formulas", () => {
  const result = aggregateIndustrySeries({
    institutionalValue: [[10, 20, 30], [2, 4]],
    closeVolume: [[100, 200], [10, 20, 30]],
    deliveryValue: [[5, 10, 15], [2, 4]],
    tradedValue: [[10, 20, 30], [4, 8]],
    marketCapWeightedRelativeStrength: [[100, 200, 300], [50, 60]],
    marketCaps: [100, 200]
  });

  assert.deepEqual(result.institutionalValueBillions, [12, 22, 34]);
  assert.deepEqual(result.closeVolumeBillions, [110, 120, 230]);
  assert.deepEqual(result.deliveryPercent, [50, 50, 50]);
  assert.deepEqual(result.industryRelativeStrength, [0.5, 0.83, 1.2]);
  assert.equal(result.marketCapDenominator, 301);
});

test("industry market-cap denominator preserves the legacy initial and missing +1", () => {
  const result = aggregateIndustrySeries({
    institutionalValue: [],
    closeVolume: [],
    deliveryValue: [],
    tradedValue: [],
    marketCapWeightedRelativeStrength: [[10]],
    marketCaps: [100, null, 20]
  });
  assert.equal(result.marketCapDenominator, 122);
  assert.deepEqual(result.industryRelativeStrength, [0.08]);
});

test("zero aggregated traded value is rejected rather than producing Infinity", () => {
  assert.throws(
    () => aggregateIndustrySeries({
      institutionalValue: [],
      closeVolume: [],
      deliveryValue: [[1]],
      tradedValue: [[0]],
      marketCapWeightedRelativeStrength: [],
      marketCaps: []
    }),
    RangeError
  );
});

test("industry universe is sorted, unique and excludes BSE-prefixed industries", () => {
  const result = buildIndustryReferenceSummaries([
    row("TCS", "IT services", 200),
    row("INFY", "IT services", 100),
    row("RELIANCE", "refineries", 500),
    row("BSETEST", "BSE indices", 10),
    row("NOIND", null, 1)
  ]);
  assert.deepEqual(result.map((item) => item.industry), ["IT services", "refineries"]);
  assert.equal(result[0].stockCount, 2);
  assert.equal(result[0].marketCapTotal, 300);
  assert.equal(result[0].missingMarketCapCount, 0);
  assert.deepEqual(result[0].stocks.map((stock) => stock.symbol), ["INFY", "TCS"]);
});

test("industry filter is partial and case insensitive", () => {
  const industries = buildIndustryReferenceSummaries([
    row("A", "IT services", 10),
    row("B", "Refineries", 20)
  ]);
  assert.deepEqual(filterIndustrySummaries(industries, "it").map((item) => item.industry), ["IT services"]);
  assert.equal(filterIndustrySummaries(industries, "  ").length, 2);
});

test("legacy five-array result file parses and serializes without changing values", () => {
  const raw = [
    ["IT services", [10, 12], [100, 120], [45.5, 48], [0.7, 0.8]],
    ["Refineries", [], [300], [], [0.9]]
  ];
  const parsed = parseLegacyIndustryResults(raw);
  assert.deepEqual(parsed[0], {
    industry: "IT services",
    institutionalValueBillions: [10, 12],
    closeVolumeBillions: [100, 120],
    deliveryPercent: [45.5, 48],
    industryRelativeStrength: [0.7, 0.8]
  });
  assert.deepEqual(serializeLegacyIndustryResults(parsed), raw);
});

test("legacy result parser rejects malformed, non-finite and duplicate data", () => {
  assert.throws(() => parseLegacyIndustryResults({}), TypeError);
  assert.throws(() => parseLegacyIndustryResults([["IT", [], []]]), TypeError);
  assert.throws(
    () => parseLegacyIndustryResults([["IT", [Infinity], [], [], []]]),
    /finite/
  );
  assert.throws(
    () => parseLegacyIndustryResults([
      ["IT", [], [], [], []],
      ["IT", [], [], [], []]
    ]),
    /Duplicate/
  );
});
