import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEarningsSalesScore,
  calculateExpansionPercentage,
  calculateInstitutionalCostBillions,
  calculateMarketCapWeightedRelativeStrength,
  clampQuarterlyGrowth,
  normalizeSeries
} from "../../.test-dist/domain/analysis/fundamentalMetrics.js";

test("normalizeSeries matches legacy 0-100 min/max scaling and truncation", () => {
  assert.deepEqual(normalizeSeries([10, 15, 20]), [0, 50, 100]);
  assert.deepEqual(normalizeSeries([0, 1, 2, 3]), [0, 33, 66, 100]);
  assert.deepEqual(normalizeSeries([-2, -1, 0]), [0, 50, 100]);
  assert.deepEqual(normalizeSeries(["0", "1", "3"]), [0, 33, 100]);
});

test("normalizeSeries rejects empty, constant and non-numeric inputs", () => {
  assert.throws(() => normalizeSeries([]), RangeError);
  assert.throws(() => normalizeSeries([7, 7, 7]), RangeError);
  assert.throws(() => normalizeSeries(["", "2"]), TypeError);
});

test("earnings-sales score returns zero until three quarters are available", () => {
  assert.equal(calculateEarningsSalesScore([]), 0);
  assert.equal(calculateEarningsSalesScore([{ epsPct: 100, salesPct: 100 }]), 0);
  assert.equal(
    calculateEarningsSalesScore([
      { epsPct: 100, salesPct: 100 },
      { epsPct: 90, salesPct: 90 }
    ]),
    0
  );
});

test("earnings-sales score reproduces weighted thresholds and trend points", () => {
  const quarters = [
    { epsPct: 100, salesPct: 90 },
    { epsPct: 80, salesPct: 95 },
    { epsPct: 60, salesPct: 60 },
    { epsPct: 999, salesPct: 999 }
  ];
  // EPS: 8 threshold + 5 trend = 13.
  // Sales: 8 threshold + 3 trend = 11. The fourth quarter is ignored.
  assert.equal(calculateEarningsSalesScore(quarters), 24);
});

test("earnings-sales score uses strict >70 thresholds and strict trend ordering", () => {
  assert.equal(
    calculateEarningsSalesScore([
      { epsPct: 70, salesPct: 70 },
      { epsPct: 70, salesPct: 70 },
      { epsPct: 70, salesPct: 70 }
    ]),
    0
  );

  assert.equal(
    calculateEarningsSalesScore([
      { epsPct: 100, salesPct: 100 },
      { epsPct: 100, salesPct: 100 },
      { epsPct: 80, salesPct: 80 }
    ]),
    26
  );
});

test("earnings-sales score maps missing and null percentages to zero", () => {
  assert.equal(
    calculateEarningsSalesScore([
      { epsPct: 90, salesPct: null },
      {},
      { epsPct: 40, salesPct: 75 }
    ]),
    10
  );
});

test("earnings-sales score reaches 30 when both series exceed 70 and descend strictly", () => {
  assert.equal(
    calculateEarningsSalesScore([
      { epsPct: 100, salesPct: 120 },
      { epsPct: 90, salesPct: 100 },
      { epsPct: 80, salesPct: 80 }
    ]),
    30
  );
});

test("quarterly growth truncates before clamping to the legacy bounds", () => {
  assert.equal(clampQuarterlyGrowth(201.9), 200);
  assert.equal(clampQuarterlyGrowth(-201.9), -200);
  assert.equal(clampQuarterlyGrowth(12.9), 12);
  assert.equal(clampQuarterlyGrowth(-12.9), -12);
  assert.equal(clampQuarterlyGrowth(70), 70);
  assert.equal(clampQuarterlyGrowth(70.1), 70);
  assert.equal(clampQuarterlyGrowth(null), 0);
  assert.equal(clampQuarterlyGrowth(undefined), 0);
});

test("expansion percentage uses truncation toward zero", () => {
  assert.equal(calculateExpansionPercentage("25", "80"), 31);
  assert.equal(calculateExpansionPercentage(25, 40), 62);
  assert.equal(calculateExpansionPercentage(-25, 40), -62);
  assert.throws(() => calculateExpansionPercentage(10, 0), RangeError);
});

test("institutional cost is scaled to billions and truncated", () => {
  assert.equal(calculateInstitutionalCostBillions(125_000_000, 80), 10);
  assert.equal(calculateInstitutionalCostBillions(12_345_678, 100), 1);
  assert.equal(calculateInstitutionalCostBillions(null, 100), 0);
});

test("relative strength fills null and zero with the truncated non-null mean, weights, and reverses", () => {
  assert.deepEqual(
    calculateMarketCapWeightedRelativeStrength([50, null, 0, 80]),
    [80, 43, 43, 50]
  );
  assert.deepEqual(
    calculateMarketCapWeightedRelativeStrength([50, null, 0, 80], 2),
    [160, 86, 86, 100]
  );
  assert.deepEqual(calculateMarketCapWeightedRelativeStrength([]), []);
  assert.deepEqual(calculateMarketCapWeightedRelativeStrength([null, null]), [0, 0]);
});
