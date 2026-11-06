import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_PULSE_COLUMNS,
  MARKET_PULSE_QUERY,
  getMarketPulseCellColor,
  getMarketPulseTextColor,
  parseMarketPulseResponse
} from "../../.test-dist/features/marketPulse/marketPulse.js";

function fixture() {
  const timestamps = [Date.UTC(2026, 10, 4), Date.UTC(2026, 10, 5)];
  const keys = MARKET_PULSE_COLUMNS.slice(1);
  return {
    metaData: [{ tradeTimes: timestamps }],
    groupData: [{
      results: keys.map((key, index) => ({
        [key]: index === 2 ? [1.26, 4.04] : [index + 10, index + 20]
      }))
    }]
  };
}

test("Market Pulse query is the original ChartInk dashboard query", () => {
  assert.match(MARKET_PULSE_QUERY, /as '4% bull'/);
  assert.match(MARKET_PULSE_QUERY, /as '34\/13 bear'/);
  assert.match(MARKET_PULSE_QUERY, /weekly buyer initiated trades/);
});

test("response parser maps all 12 metric groups and reverses dates newest first", () => {
  const rows = parseMarketPulseResponse(fixture());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Date, "05-11-2026");
  assert.equal(rows[1].Date, "04-11-2026");
  assert.equal(rows[0]["4% bull"], 20);
  assert.equal(rows[0]["5-day ratio"], 4);
  assert.equal(rows[1]["5-day ratio"], 1.3);
  assert.equal(Object.keys(rows[0]).length, 13);
});

test("response parser rejects missing metric groups and inconsistent arrays", () => {
  assert.throws(() => parseMarketPulseResponse({ metaData: [{ tradeTimes: [1] }], groupData: [{ results: [] }] }), /missing dashboard/);
  const bad = fixture();
  bad.groupData[0].results[0]["4% bull"] = [1];
  assert.throws(() => parseMarketPulseResponse(bad), /inconsistent/);
  const missing = fixture();
  missing.groupData[0].results[0]["4% bull"][0] = null;
  assert.throws(() => parseMarketPulseResponse(missing), /missing value/);
});

test("cell colours preserve desktop inclusive rule ordering and neutral gaps", () => {
  assert.equal(getMarketPulseCellColor("4% bull", 170), "#339966");
  assert.equal(getMarketPulseCellColor("4% bull", 50), "#F4CCCC");
  assert.equal(getMarketPulseCellColor("4% bull", 68), "#FFFFFF");
  assert.equal(getMarketPulseCellColor("5-day ratio", 1.2), "#F4CCCC");
  assert.equal(getMarketPulseCellColor("q25 bear", 500), "#E06666");
  assert.equal(getMarketPulseCellColor("Date", "05-11-2026"), "#FFFFFF");
});

test("cell text contrast follows the desktop luminance threshold", () => {
  assert.equal(getMarketPulseTextColor("#FFFFFF"), "#000000");
  assert.equal(getMarketPulseTextColor("#339966"), "#FFFFFF");
  assert.equal(getMarketPulseTextColor("invalid"), "#000000");
});
