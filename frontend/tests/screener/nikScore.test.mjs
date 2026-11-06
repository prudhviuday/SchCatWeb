import assert from "node:assert/strict";
import test from "node:test";
import { calculateNikScore, calculateNikScoreFromMarketSmith, prepareNikScoreSalesGrowth } from "../../.test-dist/features/screener/nikScore.js";

test("four-quarter sales are newest first and short history is zero-padded like Listupdater", () => {
  assert.deepEqual(prepareNikScoreSalesGrowth([
    { period: "2025 Q1", epsPct: 0, salesPct: 10, salesValue: null },
    { period: "2025 Q2", epsPct: 0, salesPct: 20, salesValue: null },
    { period: "2025 Q3", epsPct: 0, salesPct: 30, salesValue: null },
    { period: "2025 Q4", epsPct: 0, salesPct: 40, salesValue: null },
    { period: "2026 Q1", epsPct: 0, salesPct: 50, salesValue: null }
  ]), [50, 40, 30, 20]);
  assert.deepEqual(prepareNikScoreSalesGrowth([
    { period: "2026 Q1", epsPct: 0, salesPct: 50, salesValue: null },
    { period: "2026 Q2", epsPct: 0, salesPct: 40, salesValue: null }
  ]), [40, 50, 0, 0]);
});

test("NikScore preserves exact legacy weighted-growth and ROCE/PB bands", () => {
  const result = calculateNikScore([110, 39, 5, 29], 27, 3);
  assert.deepEqual(result, {
    growthScore: 100,
    roceScore: 90,
    pbScore: 75,
    finalScore: 91.5,
    salesGrowthUsed: [110, 39, 5, 29]
  });
  assert.equal(calculateNikScore([0, 0, 0, 0], 9.99, 8).finalScore, 33.5);
  assert.equal(calculateNikScore([0, 0, 0, 0], 10, 7.99).pbScore, 35);
});

test("MarketSmith NikScore uses latest annual ROCE and workbook P/B", () => {
  const metrics = {
    livePb: 1.5,
    quarterlyGrowth: [
      { period: "2025 Q1", epsPct: 0, salesPct: 10, salesValue: null },
      { period: "2025 Q2", epsPct: 0, salesPct: 20, salesValue: null },
      { period: "2025 Q3", epsPct: 0, salesPct: 30, salesValue: null },
      { period: "2025 Q4", epsPct: 0, salesPct: 40, salesValue: null }
    ]
  };
  const finance = { annualRoce: [{ year: 2024, value: 15, normalized: 0 }, { year: 2025, value: 25, normalized: 100 }] };
  const result = calculateNikScoreFromMarketSmith(metrics, finance);
  assert.equal(result.roceScore, 90);
  assert.equal(result.pbScore, 90);
  assert.equal(result.finalScore, 94.5);
});
