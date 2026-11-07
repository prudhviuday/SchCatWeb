import test from "node:test";
import assert from "node:assert/strict";
import { filterAnalysisStocks, filterAnalysisStocksByIndustry, getAnalysisIndustries, nextAnalysisIndustry } from "../../.test-dist/features/analysis/multiStockAnalysis.js";

const records = [
  { symbol: "ABB", instrumentId: 1, marketCap: null, sector: "Industrials", industry: "Electrical Equipment", pb: null, roce: null, nikScore: null },
  { symbol: "BHEL", instrumentId: 2, marketCap: null, sector: "Industrials", industry: "Electrical Equipment", pb: null, roce: null, nikScore: null },
  { symbol: "TCS", instrumentId: 3, marketCap: null, sector: "IT", industry: "IT Services", pb: null, roce: null, nikScore: null },
  { symbol: "ABC", instrumentId: 4, marketCap: null, sector: "Other", industry: null, pb: null, roce: null, nikScore: null }
];

test("industry or symbol substring matching is case-insensitive and preserves universe order", () => {
  assert.deepEqual(filterAnalysisStocks(records, "ELECTRICAL").map(row => row.symbol), ["ABB", "BHEL"]);
  assert.deepEqual(filterAnalysisStocks(records, "tc").map(row => row.symbol), ["TCS"]);
});

test("empty query returns no stocks and result count never exceeds twelve", () => {
  assert.deepEqual(filterAnalysisStocks(records, "   "), []);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...records[0], symbol: "S" + i }));
  assert.equal(filterAnalysisStocks(many, "electrical").length, 12);
  assert.equal(filterAnalysisStocks(many, "electrical", 3).length, 3);
});

test("industry suggestions are unique and alphabetically sorted", () => {
  assert.deepEqual(getAnalysisIndustries(records), ["Electrical Equipment", "IT Services"]);
});

test("industry cycling starts at the first match and wraps around", () => {
  const industries = getAnalysisIndustries(records);
  assert.equal(nextAnalysisIndustry(industries, ""), "Electrical Equipment");
  assert.equal(nextAnalysisIndustry(industries, "Electrical Equipment"), "IT Services");
  assert.equal(nextAnalysisIndustry(industries, "IT Services"), "Electrical Equipment");
});


test("industry navigation loads only exact constituents and caps charts at the legacy twelve", () => {
  const extended = [...records, { ...records[0], symbol: "ABB2", industry: "Electrical Equipment Plus" }];
  assert.deepEqual(filterAnalysisStocksByIndustry(extended, "Electrical Equipment").map(row => row.symbol), ["ABB", "BHEL"]);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...records[0], symbol: "E" + i }));
  assert.equal(filterAnalysisStocksByIndustry(many, "Electrical Equipment").length, 12);
  assert.deepEqual(filterAnalysisStocksByIndustry(records, "IT Services").map(row => row.symbol), ["TCS"]);
});


test("industry navigation also supports a sector label when no industry label is clicked", () => {
  const sectorOnly = [{ ...records[3], symbol: "SECTOR1", sector: "Industrials", industry: null }];
  assert.deepEqual(filterAnalysisStocksByIndustry(sectorOnly, "Industrials").map(row => row.symbol), ["SECTOR1"]);
});


test("daily and weekly chart gallery ranges are bounded to their provider history", async () => {
  const { getAnalysisChartRanges, getAnalysisRangeStart } = await import("../../.test-dist/features/analysis/multiStockAnalysis.js");
  assert.deepEqual(getAnalysisChartRanges("1D"), ["3M", "6M", "1Y", "2Y"]);
  assert.deepEqual(getAnalysisChartRanges("1W"), ["1Y", "2Y", "5Y"]);
  const now = Date.UTC(2026, 10, 7);
  assert.equal(getAnalysisRangeStart("3M", now), Math.floor(now / 1000) - 90 * 24 * 60 * 60);
  assert.equal(getAnalysisRangeStart("5Y", now), Math.floor(now / 1000) - 1825 * 24 * 60 * 60);
});
