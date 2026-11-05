import assert from "node:assert/strict";
import test from "node:test";

import {
  atpInc,
  calculateEma,
  calculateRsi,
  calculateSma,
  emaInc,
  rsiInc,
  smaInc,
  ultmInc
} from "../../.test-dist/domain/analysis/technicalIndicators.js";

function approx(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test("SMA matches fast-technical-indicators 1.1.4 rolling arithmetic means", () => {
  assert.deepEqual(calculateSma([1, 2, 3, 4, 5, 6], 3), [2, 3, 4, 5]);
  assert.deepEqual(calculateSma([10, 20, 30, 40], 1), [10, 20, 30, 40]);
  assert.deepEqual(calculateSma([1, 2], 3), []);
  assert.deepEqual(calculateSma([1, 2], 0), []);
  assert.deepEqual(calculateSma([], 5), []);
  assert.throws(() => calculateSma([1, 2, 3], 1.5), TypeError);
});

test("EMA uses the first SMA as its seed and alpha 2/(period+1)", () => {
  assert.deepEqual(calculateEma([1, 2, 3, 4, 5, 6], 3), [2, 3, 4, 5]);
  const values = calculateEma([10, 20, 10, 20, 30], 2);
  approx(values[0], 15);
  approx(values[1], 11.666666666666666);
  approx(values[2], 17.22222222222222);
  approx(values[3], 25.74074074074074);
  assert.deepEqual(calculateEma([1, 2], 3), []);
  assert.deepEqual(calculateEma([1, 2], 0), []);
});

test("RSI uses Wilder smoothing and v1.1.4 two-decimal rounding", () => {
  const result = calculateRsi([1, 2, 3, 2, 4, 3, 5, 4], 3);
  assert.deepEqual(result, [66.67, 83.33, 60.61, 78.33, 58.57]);
  assert.deepEqual(calculateRsi([1, 2, 3], 3), []);
  assert.deepEqual(calculateRsi([1, 2, 3], 0), []);
});

test("RSI preserves the package's special average-loss-zero behaviour", () => {
  assert.deepEqual(calculateRsi([1, 2, 3, 4, 5], 2), [99.01, 99.01, 99.01]);
  assert.deepEqual(calculateRsi([5, 5, 5, 5, 5], 2), [99.01, 99.01, 99.01]);
  assert.deepEqual(calculateRsi([5, 4, 3, 2, 1], 2), [0, 0, 0]);
});

test("SMA wrapper pads leading periods with empty strings and writes the requested key", () => {
  const rows = [1, 2, 3, 4, 5].map((close, index) => ({ time: index, close }));
  assert.deepEqual(
    smaInc(rows, 3, "sma").map((row) => row.sma),
    ["", "", 2, 3, 4]
  );
  assert.deepEqual(
    smaInc(rows, 10, "longSma").map((row) => row.longSma),
    ["", "", "", "", ""]
  );
});

test("EMA wrapper pads leading periods and supports the legacy stcokgold selector", () => {
  const rows = [1, 2, 3, 4, 5].map((close, index) => ({
    time: index,
    close,
    sgclose: close * 10
  }));

  assert.deepEqual(
    emaInc(rows, 3, "ema50").map((row) => row.ema50),
    ["", "", 2, 3, 4]
  );
  assert.deepEqual(
    emaInc(rows, 3, "sgema50", "stcokgold").map((row) => row.sgema50),
    ["", "", 20, 30, 40]
  );
});

test("RSI wrapper uses the legacy fixed period of 21 and left-pads the result", () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({
    time: index,
    close: 100 + index
  }));
  const result = rsiInc(rows).map((row) => row.rsi);
  assert.equal(result.length, 23);
  assert.deepEqual(result.slice(0, 21), Array(21).fill(""));
  assert.deepEqual(result.slice(21), [99.01, 99.01]);
});

test("ULTM preserves CRIP4 raw EMA indexing and first-value replacement", () => {
  const rows = [1, 2, 3, 4, 5].map((close, index) => ({ time: index, close }));
  const result = ultmInc(rows, 2, 3);

  approx(result[0].ultm, -7.38);
  approx(result[1].ultm, -7.38);
  approx(result[2].ultm, -9.84);
  assert.ok(Number.isNaN(result[3].ultm));
  assert.ok(Number.isNaN(result[4].ultm));
});

test("ATP attaches the stock and gold EMA ratios at raw index zero, without padding", () => {
  const rows = [1, 2, 3, 4, 5].map((close, index) => ({
    time: index,
    close,
    gold: close * 10
  }));
  const result = atpInc(rows, 2, 3);

  approx(result[0].ultmS, 75);
  approx(result[1].ultmS, 83.33333333333333);
  approx(result[2].ultmS, 87.5);
  assert.ok(Number.isNaN(result[3].ultmS));
  assert.equal(result[4].ultmS, undefined);

  approx(result[0].ultmG, 75);
  approx(result[1].ultmG, 83.33333333333333);
  approx(result[2].ultmG, 87.5);
  assert.equal(result[4].ultmG, undefined);
});
