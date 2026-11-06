import assert from "node:assert/strict";
import test from "node:test";

import {
  createHistoricalMatchesTemplate,
  evaluateResearch,
  parseCsvTable,
  parseHistoricalMatchesJson,
  parsePerformanceCsv,
  parseQueriesCsv,
  serializeResearchResultsCsv,
  uniqueSymbols
} from "../../.test-dist/features/research/research.js";

test("CSV parser handles BOM, CRLF, quoted commas and escaped quotes", () => {
  const parsed = parseCsvTable('\uFEFFName,Query\r\n"Breakout, quality","close > 100 and name = ""A"""\r\n');
  assert.deepEqual(parsed.headers, ["Name", "Query"]);
  assert.deepEqual(parsed.rows, [["Breakout, quality", 'close > 100 and name = "A"']]);
});

test("CSV parser rejects malformed quoted fields and duplicate headers", () => {
  assert.throws(() => parseCsvTable('Name,Query\n"Open,close > 1'), /unterminated/);
  assert.throws(() => parseCsvTable("Name,name\nA,B"), /duplicate/);
});

test("performance symbols support symbol or Stock headers and are normalized/deduplicated", () => {
  assert.deepEqual(
    parsePerformanceCsv("Stock,Return\n tcs ,10\nINFY,20\nTCS,30\n,40\n"),
    ["TCS", "INFY"]
  );
  assert.deepEqual(parsePerformanceCsv("symbol\nreliance\nNSE:TCS\n"), ["RELIANCE", "NSE:TCS"]);
  assert.throws(() => parsePerformanceCsv("Code,Return\nTCS,2"), /symbol/);
  assert.throws(() => parsePerformanceCsv("symbol\n\n"), /no usable/);
});

test("query definition CSV supports QueryName/QueryCode and Name/Query aliases", () => {
  assert.deepEqual(
    parseQueriesCsv('QueryName,QueryCode\n"High Growth","close > 100"\nEmpty,\n'),
    [{ name: "High Growth", code: "close > 100" }]
  );
  assert.deepEqual(
    parseQueriesCsv("Name,Query\nTrend,close > ema(20)\n"),
    [{ name: "Trend", code: "close > ema(20)" }]
  );
  assert.throws(() => parseQueriesCsv("Title,Text\nX,Y"), /QueryName/);
});

test("historical match JSON supports object maps and row arrays", () => {
  assert.deepEqual(
    parseHistoricalMatchesJson({ "High Growth": ["TCS", "tcs", "INFY"] }),
    [{ queryName: "High Growth", symbols: ["TCS", "INFY"] }]
  );
  assert.deepEqual(
    parseHistoricalMatchesJson([{ queryName: "Trend", symbols: ["RELIANCE"] }]),
    [{ queryName: "Trend", symbols: ["RELIANCE"] }]
  );
  assert.throws(() => parseHistoricalMatchesJson({ Trend: "TCS" }), /array/);
  assert.throws(() => parseHistoricalMatchesJson([{ queryName: "A", symbols: [] }, { queryName: "a", symbols: [] }]), /Duplicate/);
});

test("research calculation preserves legacy display total and percentage denominator", () => {
  const performanceSymbols = ["TCS", "INFY", "RELIANCE", "HDFCBANK"];
  const queries = [
    { name: "Query A", code: "query a" },
    { name: "Query B", code: "query b" },
    { name: "Query C", code: "query c" }
  ];
  const historyByQuery = new Map([
    ["query a", ["TCS", "INFY", "SBIN", "HDFCBANK"]],
    ["QUERY B", ["RELIANCE", "RELIANCE", "ICICIBANK"]],
    ["Unrelated", ["TCS"]]
  ]);

  const result = evaluateResearch({ performanceSymbols, queries, historyByQuery });
  assert.deepEqual(result[0], {
    query: "Query A",
    matches: 3,
    total: 4,
    queryStocks: 4,
    matchPercent: 75,
    status: "ready"
  });
  assert.deepEqual(result[1], {
    query: "Query B",
    matches: 1,
    total: 4,
    queryStocks: 2,
    matchPercent: 50,
    status: "ready"
  });
  assert.equal(result[2].status, "missing-history");
  assert.equal(result[2].matchPercent, 0);
});

test("zero-sized historical query returns zero percent and preserves the performance total", () => {
  const result = evaluateResearch({
    performanceSymbols: ["TCS", "INFY"],
    queries: [{ name: "Empty result", code: "close > 999999" }],
    historyByQuery: new Map([["Empty result", []]])
  });
  assert.deepEqual(result[0], {
    query: "Empty result",
    matches: 0,
    total: 2,
    queryStocks: 0,
    matchPercent: 0,
    status: "ready"
  });
});

test("symbol normalizer strips blanks and deduplicates case-insensitively", () => {
  assert.deepEqual(uniqueSymbols([" tcs ", "TCS", "", null, "infy"]), ["TCS", "INFY"]);
});

test("result CSV safely quotes query names and documents both denominators", () => {
  const csv = serializeResearchResultsCsv([{
    query: 'Growth, "A"',
    matches: 2,
    total: 5,
    queryStocks: 4,
    matchPercent: 50,
    status: "ready"
  }]);
  assert.match(csv, /"Query Stocks"/);
  assert.match(csv, /"Growth, ""A"""/);
  assert.match(csv, /"50.00"/);
});

test("historical match JSON template is generated from imported query definitions", () => {
  assert.deepEqual(
    JSON.parse(createHistoricalMatchesTemplate([
      { name: "Query A", code: "close > 1" },
      { name: "Query B", code: "close < 2" }
    ])),
    { "Query A": [], "Query B": [] }
  );
});


test("match percentage preserves Python round-to-even on exact half-cent values", () => {
  const symbols = Array.from({ length: 32 }, (_, index) => index === 0 ? "MATCH" : `STOCK${index}`);
  const result = evaluateResearch({
    performanceSymbols: ["MATCH"],
    queries: [{ name: "Half-cent", code: "sample query" }],
    historyByQuery: new Map([["Half-cent", symbols]])
  });
  assert.equal(result[0].matchPercent, 3.12);
});

test("query rows fall back from blank QueryName/QueryCode cells to Name/Query aliases", () => {
  assert.deepEqual(
    parseQueriesCsv("QueryName,Name,QueryCode,Query\n,High Growth,,close > 100\n"),
    [{ name: "High Growth", code: "close > 100" }]
  );
});
