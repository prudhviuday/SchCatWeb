import assert from "node:assert/strict";
import test from "node:test";

import {
  formatChartTime,
  prepareChartView,
  prepareWeeklyCloseVolume
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

test("legacy SMA50 and EMA50 overlays align to their source candle before visible-window slicing", () => {
  const view = prepareChartView(candles(60), "1W", 15);
  assert.equal(view.points.length, 15);
  assert.equal(view.points[0].sma50, null);
  assert.equal(view.points[0].ema50, null);
  assert.equal(view.points[4].sma50, 125.5);
  assert.equal(view.points[4].ema50, 125.5);
  assert.equal(view.points.at(-1).sma50, 135.5);
  assert.equal(view.points.at(-1).ema50, 135.5);
  assert.equal(view.points.at(-1).ema200, null);
});

test("legacy EMA200 starts at candle 200 and remains aligned after slicing", () => {
  const view = prepareChartView(candles(240), "1D", 50);
  assert.equal(view.points.length, 50);
  assert.equal(view.points[0].ema200, null);
  assert.equal(view.points[9].ema200, 200.5);
  assert.equal(view.latestEma200, view.points.at(-1).ema200);
  assert.equal(view.latestSma50, view.points.at(-1).sma50);
  assert.equal(view.latestEma50, view.points.at(-1).ema50);
});

test("RSI-21 is calculated on the complete price history", () => {
  const view = prepareChartView(candles(30), "1D", 5);
  assert.equal(view.points.length, 5);
  assert.equal(view.latestRsi21, 99.01);
});

test("insufficient history keeps unavailable legacy indicators empty", () => {
  const view = prepareChartView(candles(10), "1D");
  assert.ok(view.points.every((point) =>
    point.sma50 === null && point.ema50 === null && point.ema200 === null
  ));
  assert.equal(view.latestSma50, null);
  assert.equal(view.latestEma50, null);
  assert.equal(view.latestEma200, null);
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


test("weekly close-volume history matches desktop formula and keeps latest 30 in chronological order", () => {
  const candles = Array.from({ length: 32 }, (_, index) => ({
    time: 1_700_000_000 + index * 604_800,
    open: 10,
    high: 12,
    low: 9,
    close: index + 1,
    volume: 1_000_000_000
  })).reverse();
  const result = prepareWeeklyCloseVolume(candles);
  assert.equal(result.length, 30);
  assert.equal(result[0].time, 1_700_000_000 + 2 * 604_800);
  assert.equal(result[0].value, 3);
  assert.equal(result[29].value, 32);
});

test("weekly close-volume history rounds to two decimals and rejects invalid limits", () => {
  const candles = [{ time: 1, open: 1, high: 1, low: 1, close: 12.345, volume: 1_000_000_000 }];
  assert.equal(prepareWeeklyCloseVolume(candles)[0].value, 12.35);
  assert.throws(() => prepareWeeklyCloseVolume(candles, 0), RangeError);
});
