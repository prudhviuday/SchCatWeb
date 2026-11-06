import assert from "node:assert/strict";
import test from "node:test";
import { runLiveIndustryAnalysis } from "../../.test-dist/features/industry/industryLive.js";

const stock = (symbol, marketCap, instrumentId = 123) => ({
  symbol, instrumentId, marketCap, sector: "Sector", industry: "Test Industry",
  pb: null, roce: null, nikScore: null
});

test("live industry analysis combines provider series using legacy weighting and alignment", async () => {
  const progress = [];
  const result = await runLiveIndustryAnalysis("Test Industry", [stock("AAA", 100), stock("BBB", 200)], "session", {
    concurrency: 2,
    onProgress: (value) => progress.push(value),
    dependencies: {
      fetchInstitutionalValue: async (item) => item.symbol === "AAA" ? [10, 20] : [2],
      fetchCloseVolume: async (item) => item.symbol === "AAA" ? [100, 200] : [10, 20, 30],
      fetchDelivery: async (item) => item.symbol === "AAA"
        ? { deliveryValue: [5, 10], tradedValue: [10, 20] }
        : { deliveryValue: [2, 4], tradedValue: [4, 8] },
      fetchRelativeStrength: async (item) => item.symbol === "AAA" ? [100, 200] : [600, 800]
    }
  });
  assert.deepEqual(result.result.institutionalValueBillions, [12, 22]);
  assert.deepEqual(result.result.closeVolumeBillions, [110, 120, 230]);
  assert.deepEqual(result.result.deliveryPercent, [50, 50]);
  assert.deepEqual(result.result.industryRelativeStrength, [2.33, 3.32]);
  assert.equal(result.successfulStocks, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(result.completed, 2);
  assert.equal(progress.length, 2);
});

test("a constituent provider failure excludes its series but remains in legacy market-cap denominator", async () => {
  const result = await runLiveIndustryAnalysis("Test Industry", [stock("AAA", 100), stock("BBB", 200)], "session", {
    dependencies: {
      fetchInstitutionalValue: async (item) => {
        if (item.symbol === "BBB") throw new Error("MarketSmith unavailable");
        return [10, 20];
      },
      fetchCloseVolume: async () => [100, 200],
      fetchDelivery: async () => ({ deliveryValue: [5, 10], tradedValue: [10, 20] }),
      fetchRelativeStrength: async () => [10, 20]
    }
  });
  assert.equal(result.successfulStocks, 1);
  assert.deepEqual(result.failures, [{ symbol: "BBB", message: "MarketSmith unavailable" }]);
  assert.deepEqual(result.result.industryRelativeStrength, [0.03, 0.07]);
  assert.deepEqual(result.result.institutionalValueBillions, [10, 20]);
});

test("live analysis requires a MarketSmith session and bounded concurrency", async () => {
  await assert.rejects(runLiveIndustryAnalysis("Test Industry", [stock("AAA", 1)], ""), /MarketSmith session/);
  await assert.rejects(runLiveIndustryAnalysis("Test Industry", [stock("AAA", 1)], "session", { concurrency: 9 }), /concurrency/);
});

test("stocks without a MarketSmith ID are reported and never requested", async () => {
  const result = await runLiveIndustryAnalysis("Test Industry", [stock("NOID", 10, null)], "session");
  assert.equal(result.successfulStocks, 0);
  assert.deepEqual(result.failures, [{ symbol: "NOID", message: "Missing MarketSmith instrument ID" }]);
});
