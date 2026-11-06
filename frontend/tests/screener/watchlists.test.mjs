import test from "node:test";
import assert from "node:assert/strict";
import {
  addSymbolToWatchlist, EMPTY_SCREENER_LIBRARY, mergeScreenerLibraries,
  parseScreenerLibraryJson, parseSavedQueriesCsv, parseWatchlistsCsv, removeSavedQuery,
  saveScreenerLibrary, serializeScreenerLibrary, serializeSavedQueriesCsv, serializeWatchlistsCsv,
  upsertSavedQuery, validateScreenerLibrary
} from "../../.test-dist/features/screener/watchlists.js";

test("watchlist symbols normalize, deduplicate and add to an existing list", () => {
  const one = addSymbolToWatchlist(EMPTY_SCREENER_LIBRARY, "Leaders", "reliance");
  const two = addSymbolToWatchlist(one, "leaders", "RELIANCE");
  assert.deepEqual(two.watchlists, [{ name: "Leaders", symbols: ["RELIANCE"] }]);
});

test("saved queries retain ChartInk code and symbol sets", () => {
  const saved = upsertSavedQuery(EMPTY_SCREENER_LIBRARY, { name: "VCP", queryCode: "close > ema(close,50)", symbols: ["tcs", "INFY"] });
  assert.deepEqual(saved.queries[0], { name: "VCP", queryCode: "close > ema(close,50)", symbols: ["TCS", "INFY"] });
  assert.equal(removeSavedQuery(saved, "VCP").queries.length, 0);
});

test("library JSON round trips and rejects unsupported or duplicate names", () => {
  const library = { version: 1, watchlists: [{ name: "Core", symbols: ["ABC"] }], queries: [{ name: "Trend", queryCode: "close>ema", symbols: ["ABC"] }] };
  assert.deepEqual(parseScreenerLibraryJson(serializeScreenerLibrary(library)), library);
  assert.throws(() => validateScreenerLibrary({ ...library, watchlists: [{ name: "Core", symbols: [] }, { name: "core", symbols: [] }] }), /Duplicate watchlist/);
  assert.throws(() => parseScreenerLibraryJson("{bad"), /valid JSON/);
});

test("merge updates matching names while retaining unrelated local entries", () => {
  const a = { version: 1, watchlists: [{ name: "Core", symbols: ["ABC"] }], queries: [] };
  const b = { version: 1, watchlists: [{ name: "Core", symbols: ["XYZ"] }, { name: "Swing", symbols: ["TCS"] }], queries: [] };
  assert.deepEqual(mergeScreenerLibraries(a, b).watchlists, [{ name: "Core", symbols: ["XYZ"] }, { name: "Swing", symbols: ["TCS"] }]);
});

test("watchlist CSV import/export preserves quoted names and symbols", () => {
  const imported = parseWatchlistsCsv('Watchlist,Symbol\r\n"Long, term","ABC"\r\n"Long, term","TCS"');
  assert.deepEqual(imported, [{ name: "Long, term", symbols: ["ABC", "TCS"] }]);
  assert.deepEqual(parseWatchlistsCsv(serializeWatchlistsCsv(imported)), imported);
});

test("browser storage save/load uses versioned private key", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  const library = { version: 1, watchlists: [{ name: "Test", symbols: ["ABC"] }], queries: [] };
  saveScreenerLibrary(library, storage);
  assert.deepEqual(JSON.parse(values.get("schcatweb.screener-library.v1")), library);
});

test("ChartInk query CSV import and export preserve query clauses", () => {
  const imported = parseSavedQueriesCsv('QueryName,QueryCode\r\n"Trend setup","close > ema(close,50)"');
  assert.deepEqual(imported, [{ name: "Trend setup", queryCode: "close > ema(close,50)", symbols: [] }]);
  assert.deepEqual(parseSavedQueriesCsv(serializeSavedQueriesCsv(imported)), imported);
});

test("legacy desktop wide-column Watchlist CSV imports each column as a list", () => {
  const imported = parseWatchlistsCsv('Core,Leaders\r\nABC,TCS\r\nINFY,');
  assert.deepEqual(imported, [{ name: "Core", symbols: ["ABC", "INFY"] }, { name: "Leaders", symbols: ["TCS"] }]);
});
