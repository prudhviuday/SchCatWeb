import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePortfolioCandles,
  calculateHoldingMetrics,
  calculatePortfolioSummary,
  createPortfolioHolding,
  exportPortfolioCsv,
  exportPortfolioJson,
  mergePortfolioHoldings,
  parsePortfolioImport,
  validatePortfolioHoldings
} from "../../.test-dist/features/portfolio/portfolio.js";

const candle = (time, open, high, low, close, volume = 100) => ({ time, open, high, low, close, volume });

test("holding validation normalizes symbols and rejects invalid quantities/prices", () => {
  assert.deepEqual(createPortfolioHolding(" rvnl ", "12", "320", "x"), { id: "x", symbol: "RVNL", quantity: 12, buyPrice: 320 });
  assert.throws(() => createPortfolioHolding("RVNL", 0, 320), /Quantity/);
  assert.throws(() => createPortfolioHolding("RVNL", 12, -1), /Buy price/);
  assert.throws(() => createPortfolioHolding("bad symbol", 1, 2), /valid stock symbol/);
});

test("holding and portfolio metrics calculate invested capital and unrealized P&L", () => {
  const holding = createPortfolioHolding("RVNL", 10, 100, "1");
  assert.deepEqual(calculateHoldingMetrics(holding, 125), { invested: 1000, currentValue: 1250, unrealizedPnl: 250, unrealizedPnlPct: 25 });
  assert.equal(calculateHoldingMetrics(holding, null).currentValue, null);
  const summary = calculatePortfolioSummary([holding, createPortfolioHolding("IRFC", 5, 200, "2")], { RVNL: 125, IRFC: 180 });
  assert.equal(summary.invested, 2000);
  assert.equal(summary.currentValue, 2150);
  assert.equal(summary.unrealizedPnl, 150);
  assert.equal(summary.unrealizedPnlPct, 7.5);
  assert.equal(calculatePortfolioSummary([holding], {}).unrealizedPnl, null);
});

test("synthetic portfolio OHLC matches desktop contribution and forward-fill rules", () => {
  const holdings = [createPortfolioHolding("AAA", 2, 100, "a"), createPortfolioHolding("BBB", 3, 50, "b")];
  const series = {
    AAA: [candle(100, 100, 110, 90, 105), candle(200, 105, 120, 100, 115)],
    BBB: [candle(150, 50, 55, 45, 52), candle(200, 52, 60, 48, 58)]
  };
  const result = aggregatePortfolioCandles(holdings, series);
  assert.deepEqual(result.map((row) => row.time), [100, 150, 200]);
  assert.equal(result[0].close, 10);
  assert.equal(result[1].close, 16);
  assert.equal(result[2].open, 16);
  assert.equal(result[2].close, 2 * (115 - 100) + 3 * (58 - 50));
  assert.equal(result[1].volume, 200);
});

test("synthetic series keeps zero before a holding's first bar and limits history", () => {
  const holdings = [createPortfolioHolding("AAA", 1, 10, "a")];
  const rows = aggregatePortfolioCandles(holdings, { AAA: [candle(100, 10, 11, 9, 10), candle(200, 11, 12, 10, 12), candle(300, 12, 13, 11, 13)] }, 2);
  assert.deepEqual(rows.map((row) => row.time), [200, 300]);
  assert.equal(rows[0].close, 2);
  assert.deepEqual(aggregatePortfolioCandles(holdings, {}).length, 0);
});

test("CSV and JSON imports round-trip and reject malformed input", () => {
  const holdings = [createPortfolioHolding("RVNL", 12, 320, "1"), createPortfolioHolding("IRFC", 22, 57.5, "2")];
  const json = parsePortfolioImport(exportPortfolioJson(holdings), "backup.json");
  assert.equal(json.format, "json");
  assert.deepEqual(json.holdings, holdings);
  const csv = parsePortfolioImport(exportPortfolioCsv(holdings), "backup.csv");
  assert.equal(csv.format, "csv");
  assert.deepEqual(csv.holdings.map(({ symbol, quantity, buyPrice }) => ({ symbol, quantity, buyPrice })), holdings.map(({ symbol, quantity, buyPrice }) => ({ symbol, quantity, buyPrice })));
  assert.throws(() => parsePortfolioImport('{"version":99,"holdings":[]}', "bad.json"), /Unsupported/);
  assert.throws(() => parsePortfolioImport("Symbol,Qty\nRVNL,2", "bad.csv"), /needs/);
});

test("CSV parser handles quoted fields and merge replaces by symbol", () => {
  const parsed = parsePortfolioImport('Symbol,Quantity,Buy Price\n"ABC&CO",2,45', "quoted.csv");
  assert.equal(parsed.holdings[0].symbol, "ABC&CO");
  const merged = mergePortfolioHoldings(parsed.holdings, [createPortfolioHolding("ABC&CO", 4, 50, "new"), createPortfolioHolding("IRFC", 1, 20, "i")]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].quantity, 4);
});

test("stored portfolio validation accepts legacy three-column rows", () => {
  const result = validatePortfolioHoldings([["RVNL", 12, 320]]);
  assert.deepEqual(result.map(({ symbol, quantity, buyPrice }) => ({ symbol, quantity, buyPrice })), [{ symbol: "RVNL", quantity: 12, buyPrice: 320 }]);
});
