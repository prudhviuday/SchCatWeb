import assert from "node:assert/strict";
import test from "node:test";

import {
  formatChartTime,
  prepareChartView
} from "../../.test-dist/features/charts/chartPresentation.js";

const candles = (count) => Array.from({ length: count }, (_, index) => ({
  time: 1_700_000_000 + index * 86_400,
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  volume: 1_000 + index * 100
}));

test("chart presentation sorts candles and exposes the latest close/previous close", () => {
  const input = candles(3).reverse();
  const view = prepareChartView(input, "1D");
  assert.deepEqual(view.points.map((point) => point.close), [101, 102, 103]);
  assert.equal(view.latestClose, 103);
  assert.equal(view.previousClose, 102);
});

test("EMA overlays align to their source candle rather than the visible window start", () => {
  const view = prepareChartView(candles(60), "1W", 15);
  assert.equal(view.points.length, 15);
  assert.equal(view.points[0].ema20, 146.5);
  assert.equal(view.points[0].ema50, 131.5);
  assert.equal(view.points.at(-1).ema20, 149.5);
  assert.equal(view.points.at(-1).ema50, 149.5);
});

test("RSI-21 is calculated on the complete price history", () => {
  const view = prepareChartView(candles(30), "1D", 5);
  assert.equal(view.points.length, 5);
  assert.equal(view.latestRsi21, 99.01);
});

test("insufficient history keeps unavailable indicator values empty", () => {
  const view = prepareChartView(candles(10), "1D");
  assert.ok(view.points.every((point) => point.ema20 === null && point.ema50 === null));
  assert.equal(view.latestRsi21, null);
});

test("visible point limit must be positive", () => {
  assert.throws(() => prepareChartView(candles(10), "1D", 0), RangeError);
});

test("intraday labels use Asia/Kolkata market time formatting", () => {
  const value = formatChartTime(Date.UTC(2026, 0, 1, 3, 45) / 1000, "1H");
  assert.match(value, /01 Jan/);
  assert.match(value, /09:15/);
});
