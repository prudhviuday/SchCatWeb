import assert from "node:assert/strict";
import test from "node:test";

import {
  applyScreenerFilters,
  intersectSelectedQueries,
  parseSymbolList,
  sortScreenerRecords,
  toggleIndustryDrilldown,
  resolveWatchlistShortcut
} from "../../.test-dist/features/screener/screener.js";

const rows = [
  { symbol: "RELIANCE", instrumentId: 1, marketCap: 500, sector: "energy", industry: "refineries", pb: 2, roce: 10, nikScore: 60 },
  { symbol: "TCS", instrumentId: 2, marketCap: 900, sector: "technology", industry: "IT services", pb: 12, roce: 45, nikScore: 80 },
  { symbol: "ONGC", instrumentId: 3, marketCap: 300, sector: "energy", industry: "oil exploration", pb: 1, roce: 8, nikScore: 40 },
  { symbol: "INFY", instrumentId: 4, marketCap: null, sector: "technology", industry: "IT services", pb: null, roce: 20, nikScore: 70 }
];

test("search, sector and industry filters combine with AND", () => {
  const result = applyScreenerFilters(rows, {
    search: "it",
    sector: "TECHNOLOGY",
    industry: "IT SERVICES"
  });
  assert.deepEqual(result.map((row) => row.symbol), ["TCS", "INFY"]);
});

test("numeric ranges use inclusive bounds and exclude missing values", () => {
  const result = applyScreenerFilters(rows, {
    ranges: {
      marketCap: { min: 300, max: 500 },
      roce: { min: 8, max: 10 }
    }
  });
  assert.deepEqual(result.map((row) => row.symbol), ["RELIANCE", "ONGC"]);
});

test("multiple selected query results intersect using AND logic", () => {
  const queryMatches = new Map([
    ["High ROCE", ["RELIANCE", "TCS", "INFY"]],
    ["Energy names", ["RELIANCE", "ONGC"]],
    ["Unavailable", []]
  ]);

  assert.deepEqual(
    intersectSelectedQueries(rows, ["High ROCE", "Energy names"], queryMatches)
      .map((row) => row.symbol),
    ["RELIANCE"]
  );
  assert.deepEqual(
    intersectSelectedQueries(rows, ["High ROCE", "not found"], queryMatches)
      .map((row) => row.symbol),
    ["RELIANCE", "TCS", "INFY"]
  );
  assert.deepEqual(
    intersectSelectedQueries(rows, ["High ROCE", "Unavailable"], queryMatches),
    []
  );
});

test("query intersection is case-insensitive and removes duplicate symbols", () => {
  const matches = new Map([
    ["A", [" reliance ", "TCS", "tcs"]],
    ["B", ["TCS", "INFY"]]
  ]);
  assert.deepEqual(
    intersectSelectedQueries(rows, ["A", "B"], matches).map((row) => row.symbol),
    ["TCS"]
  );
});

test("numeric sorting keeps null values last for ascending and descending", () => {
  assert.deepEqual(
    sortScreenerRecords(rows, "marketCap", true).map((row) => row.symbol),
    ["ONGC", "RELIANCE", "TCS", "INFY"]
  );
  assert.deepEqual(
    sortScreenerRecords(rows, "marketCap", false).map((row) => row.symbol),
    ["TCS", "RELIANCE", "ONGC", "INFY"]
  );
});

test("text sorting is case-insensitive and stable for equal values", () => {
  assert.deepEqual(
    sortScreenerRecords(rows, "sector", true).map((row) => row.symbol),
    ["RELIANCE", "ONGC", "TCS", "INFY"]
  );
});

test("symbol list parser accepts commas, semicolons and whitespace", () => {
  assert.deepEqual(parseSymbolList(" reliance, TCS;infy\nONGC TCS "), [
    "RELIANCE", "TCS", "INFY", "ONGC"
  ]);
});

test("live MarketSmith fields support numeric filtering and stable sorting", () => {
  const liveRows = [
    { ...rows[0], rs: 92, epsRank: 84, masterScore: 90, pe: 21, peg: 0.8, fScore: 25 },
    { ...rows[1], rs: 78, epsRank: 70, masterScore: 68, pe: 31, peg: 1.4, fScore: 16 },
    { ...rows[2], rs: null, epsRank: null, masterScore: null, pe: 0, peg: null, fScore: 0 }
  ];

  assert.deepEqual(
    applyScreenerFilters(liveRows, { ranges: { rs: { min: 80 }, fScore: { min: 20 } } })
      .map(row => row.symbol),
    ["RELIANCE"]
  );
  assert.deepEqual(
    sortScreenerRecords(liveRows, "rs", false).map(row => row.symbol),
    ["RELIANCE", "TCS", "ONGC"]
  );
});


test("all legacy advanced numeric fields are applied, including numeric Acc/Dis values", () => {
  const liveRows = [
    { ...rows[0], groupRank: 8, rs: 94, epsRank: 91, masterScore: 97, accDis: "3", pe: 22, peg: 0.8, fScore: 27 },
    { ...rows[1], groupRank: 15, rs: 82, epsRank: 76, masterScore: 73, accDis: "A", pe: 32, peg: 1.4, fScore: 18 }
  ];

  const result = applyScreenerFilters(liveRows, {
    ranges: {
      groupRank: { min: 5, max: 10 },
      rs: { min: 90 },
      epsRank: { min: 85 },
      masterScore: { min: 90 },
      accDis: { min: 2, max: 4 },
      pe: { max: 25 },
      peg: { max: 1 },
      fScore: { min: 25 }
    }
  });
  assert.deepEqual(result.map((row) => row.symbol), ["RELIANCE"]);
});

test("industry double-click toggles back to the previous industry filter", () => {
  const drilled = toggleIndustryDrilldown("IT services", "Refineries", null);
  assert.equal(drilled.industry, "Refineries");
  assert.deepEqual(drilled.state, {
    previousIndustry: "IT services",
    activeIndustry: "Refineries"
  });

  const restored = toggleIndustryDrilldown(drilled.industry, "Oil exploration", drilled.state);
  assert.equal(restored.industry, "IT services");
  assert.equal(restored.state, null);
});

test("desktop watchlist shortcuts map Right Arrow and 1–9 in watchlist order", () => {
  const names = ["Core", "Breakouts", "Watch"];
  assert.equal(resolveWatchlistShortcut("ArrowRight", "Core", names), "Core");
  assert.equal(resolveWatchlistShortcut("ArrowRight", "", names), null);
  assert.equal(resolveWatchlistShortcut("2", "Core", names), "Breakouts");
  assert.equal(resolveWatchlistShortcut("9", "Core", names), null);
  assert.equal(resolveWatchlistShortcut("a", "Core", names), undefined);
});
