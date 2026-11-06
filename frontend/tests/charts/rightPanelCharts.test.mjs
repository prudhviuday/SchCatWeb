import test from "node:test";
import assert from "node:assert/strict";
import { getRoceBand, prepareInstitutionBars, prepareRevenueEpsComparison } from "../../.test-dist/features/charts/rightPanelCharts.js";

test("ROCE chart preserves legacy green, amber and red thresholds", () => {
  assert.equal(getRoceBand(15), "strong");
  assert.equal(getRoceBand(10), "moderate");
  assert.equal(getRoceBand(9.99), "weak");
  assert.equal(getRoceBand(Number.NaN), "weak");
});

test("institution bars keep chronological order, filter invalid rows and cap history", () => {
  const result = prepareInstitutionBars([
    { label: "Q1", value: 10 }, { label: "bad", value: Number.NaN },
    { label: "Q2", value: 20 }, { label: "Q3", value: 5 }
  ], 2);
  assert.deepEqual(result.map(point => point.label), ["Q2", "Q3"]);
  assert.deepEqual(result.map(point => point.heightPct), [100, 25]);
  assert.deepEqual(prepareInstitutionBars([{ label: "Q", value: 0 }]), [{ label: "Q", value: 0, heightPct: 0 }]);
  assert.deepEqual(prepareInstitutionBars([{ label: "Q", value: 1 }], 0), []);
});

test("revenue and EPS normalized histories align on fiscal year without inventing missing values", () => {
  assert.deepEqual(prepareRevenueEpsComparison(
    [{ year: 2022, normalized: 30 }, { year: 2024, normalized: 90 }],
    [{ year: 2023, normalized: 60 }, { year: 2024, normalized: null }]
  ), [
    { year: 2022, revenueIndex: 30, epsIndex: null },
    { year: 2023, revenueIndex: null, epsIndex: 60 },
    { year: 2024, revenueIndex: 90, epsIndex: null }
  ]);
});
