import test from "node:test";
import assert from "node:assert/strict";
import { filterAnalysisStocks, getAnalysisIndustries, nextAnalysisIndustry } from "../../.test-dist/features/analysis/multiStockAnalysis.js";

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
