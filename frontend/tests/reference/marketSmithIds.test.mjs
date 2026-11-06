import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getMarketSmithId,
  loadMarketSmithIds,
  parseMarketSmithIds
} from "../../.test-dist/data/reference/marketSmithIds.js";

const idsUrl = new URL("../../public/data/marketSmithIds.json", import.meta.url);
const manifestUrl = new URL("../../public/data/manifest.json", import.meta.url);
const sourceData = JSON.parse(readFileSync(idsUrl, "utf8"));
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));

test("static MarketSmith ID asset matches its provenance manifest", () => {
  const validated = parseMarketSmithIds(sourceData);
  const entry = manifest.datasets.find((item) => item.id === "marketSmithIds");

  assert.ok(entry);
  assert.equal(entry.path, "/data/marketSmithIds.json");
  assert.equal(entry.records, Object.keys(validated).length);
  assert.equal(Object.keys(validated).length, 1256);
  assert.equal(entry.sourceRepository, "prudhviuday/SchCat");
  assert.equal(
    entry.sourcePath,
    "CRIP4/public/Tools/marketsmithids.json"
  );
  assert.equal(typeof entry.sourceBlobSha, "string");
  assert.equal(entry.sourceBlobSha.length, 40);
});

test("source dataset has positive integer IDs and no duplicate instrument IDs", () => {
  const validated = parseMarketSmithIds(sourceData);
  const symbols = Object.keys(validated);
  const ids = Object.values(validated);

  assert.equal(symbols.length, 1256);
  assert.ok(symbols.every((symbol) => symbol === symbol.toUpperCase()));
  assert.ok(ids.every((id) => Number.isSafeInteger(id) && id > 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("legacy symbols and IDs are preserved exactly", () => {
  const validated = parseMarketSmithIds(sourceData);

  assert.equal(getMarketSmithId(validated, "RELIANCE"), 3023127);
  assert.equal(getMarketSmithId(validated, "RVNL"), 3159563);
  assert.equal(getMarketSmithId(validated, " reliance "), 3023127);
  assert.equal(getMarketSmithId(validated, "BAJAJ - AUTO"), 3102893);
  assert.equal(getMarketSmithId(validated, "BAJAJ-AUTO"), null);
  assert.equal(getMarketSmithId(validated, "NOT-A-REAL-SYMBOL"), null);
});

test("parser rejects malformed objects, non-uppercase symbols and invalid IDs", () => {
  assert.throws(() => parseMarketSmithIds(null), TypeError);
  assert.throws(() => parseMarketSmithIds([]), TypeError);
  assert.throws(() => parseMarketSmithIds({}), RangeError);
  assert.throws(() => parseMarketSmithIds({ reliance: 123 }), TypeError);
  assert.throws(() => parseMarketSmithIds({ "RELIANCE ": 123 }), TypeError);
  assert.throws(() => parseMarketSmithIds({ RELIANCE: "123" }), TypeError);
  assert.throws(() => parseMarketSmithIds({ RELIANCE: 0 }), TypeError);
  assert.throws(() => parseMarketSmithIds({ RELIANCE: 1.5 }), TypeError);
});

test("loader fetches a same-origin JSON asset and validates the result", async () => {
  let requestedUrl;
  const fetcher = async (url, init) => {
    requestedUrl = url;
    assert.equal(init.mode, "same-origin");
    assert.equal(init.credentials, "same-origin");
    return new Response(JSON.stringify({ RELIANCE: 3023127 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const result = await loadMarketSmithIds(fetcher, "/fixture/ids.json");
  assert.equal(requestedUrl, "/fixture/ids.json");
  assert.equal(getMarketSmithId(result, "RELIANCE"), 3023127);
});

test("loader reports HTTP and JSON errors instead of returning empty data", async () => {
  await assert.rejects(
    () => loadMarketSmithIds(async () => new Response("denied", { status: 403 })),
    /HTTP 403/
  );

  await assert.rejects(
    () => loadMarketSmithIds(async () => new Response("{invalid", { status: 200 })),
    /not valid JSON/
  );

  await assert.rejects(
    () => loadMarketSmithIds(async () => new Response("{}", { status: 200 })),
    /cannot be empty/
  );
});
