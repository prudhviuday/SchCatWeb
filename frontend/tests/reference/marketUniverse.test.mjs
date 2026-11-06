import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadMarketUniverse,
  parseMarketUniverse
} from "../../.test-dist/data/reference/marketUniverse.js";
import {
  loadIndustryList,
  parseIndustryList
} from "../../.test-dist/data/reference/industries.js";

const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8")
  );

const universeRaw = readJson("../../public/data/marketUniverse.json");
const industriesRaw = readJson("../../public/data/industries.json");
const report = readJson("../../public/data/conversion-report.json");
const manifest = readJson("../../public/data/manifest.json");

test("market universe has 2,256 validated rows and matching manifest metadata", () => {
  const universe = parseMarketUniverse(universeRaw);
  const manifestEntry = manifest.datasets.find(
    (dataset) => dataset.id === "marketUniverse"
  );

  assert.equal(universe.recordCount, 2256);
  assert.equal(universe.records.length, 2256);
  assert.equal(new Set(universe.records.map((row) => row.symbol)).size, 2256);
  assert.equal(manifestEntry.records, universe.recordCount);
  assert.equal(manifestEntry.sourceAsOfDate, null);
  assert.match(manifestEntry.freshnessWarning, /must not be presented as live metrics/i);
});

test("stock reference rows preserve all source fields and original order", () => {
  const universe = parseMarketUniverse(universeRaw);
  const reliance = universe.records[0];

  assert.deepEqual(reliance, {
    symbol: "RELIANCE",
    instrumentId: 3023127,
    marketCap: 1827560.43,
    sector: "energy",
    industry: "refineries",
    pb: 2.14,
    roce: 7.29,
    nikScore: 44.77
  });

  const mapfin = universe.records.find((row) => row.symbol === "M&MFIN");
  assert.ok(mapfin);
  assert.equal(mapfin.instrumentId, 3022514);

  const ilfs = universe.records.find((row) => row.symbol === "IL&FSTRANS");
  assert.ok(ilfs);
  assert.equal(ilfs.instrumentId, 3098076);
});

test("conversion diagnostics report the two shared IDs without losing rows", () => {
  const universe = parseMarketUniverse(universeRaw);

  assert.equal(report.recordCount, 2256);
  assert.equal(report.invalidInstrumentIdCount, 0);
  assert.equal(report.invalidNumericFieldCount, 0);
  assert.equal(report.duplicateInstrumentIdCount, 2);
  assert.deepEqual(
    report.duplicateInstrumentIdWarnings.map((item) => ({
      instrumentId: item.instrumentId,
      symbols: item.symbols
    })),
    [
      { instrumentId: 3022514, symbols: ["M&M", "M&MFIN"] },
      { instrumentId: 3098076, symbols: ["IL&FSENGG", "IL&FSTRANS"] }
    ]
  );
  assert.equal(
    manifest.datasets.find((dataset) => dataset.id === "marketUniverse")
      .duplicateInstrumentIdCount,
    2
  );
  assert.equal(universe.records.length, 2256);
});

test("industry static asset contains 107 unique categories covering the universe", () => {
  const industryList = parseIndustryList(industriesRaw);
  const universeIndustries = new Set(
    parseMarketUniverse(universeRaw).records.map((row) => row.industry).filter(Boolean)
  );
  const listValues = new Set(industryList.industries);

  assert.equal(industryList.industryCount, 107);
  assert.equal(industryList.industries.length, 107);
  assert.equal(listValues.size, 107);
  assert.deepEqual(
    report.industriesNotInWorkbookList,
    []
  );
  assert.deepEqual(
    report.workbookIndustriesNotInUniverse,
    []
  );
  assert.ok([...universeIndustries].every((industry) => listValues.has(industry)));
});

test("market-universe parser rejects bad metadata, duplicate symbols and invalid IDs", () => {
  assert.throws(() => parseMarketUniverse(null), TypeError);
  assert.throws(
    () => parseMarketUniverse({ schemaVersion: 2, recordCount: 0, records: [], freshness: "x" }),
    TypeError
  );
  assert.throws(
    () => parseMarketUniverse({ schemaVersion: 1, recordCount: 1, records: [], freshness: "x" }),
    RangeError
  );
  assert.throws(
    () => parseMarketUniverse({
      schemaVersion: 1,
      recordCount: 2,
      freshness: "x",
      records: [
        { symbol: "SAME", instrumentId: 1, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null },
        { symbol: "SAME", instrumentId: 2, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null }
      ]
    }),
    /Duplicate market universe symbol/
  );
  assert.throws(
    () => parseMarketUniverse({
      schemaVersion: 1,
      recordCount: 1,
      freshness: "x",
      records: [{ symbol: "BAD", instrumentId: -1, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null }]
    }),
    /instrumentId/
  );
});

test("industry parser rejects duplicate or invalid labels", () => {
  assert.throws(() => parseIndustryList(null), TypeError);
  assert.throws(
    () => parseIndustryList({ schemaVersion: 1, industryCount: 2, industries: ["banks"] }),
    RangeError
  );
  assert.throws(
    () => parseIndustryList({ schemaVersion: 1, industryCount: 2, industries: ["banks", "banks"] }),
    /duplicate labels/
  );
  assert.throws(
    () => parseIndustryList({ schemaVersion: 1, industryCount: 1, industries: [" "] }),
    /invalid/
  );
});

test("market-universe and industry loaders use same-origin static JSON", async () => {
  let requested = [];
  const fetcher = async (url, init) => {
    requested.push(url);
    assert.equal(init.mode, "same-origin");
    assert.equal(init.credentials, "same-origin");
    const body = url.includes("industries")
      ? industriesRaw
      : { schemaVersion: 1, recordCount: 1, freshness: "test", records: [
          { symbol: "RELIANCE", instrumentId: 3023127, marketCap: 1, sector: "energy", industry: "refineries", pb: 1, roce: 1, nikScore: 1 }
        ] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const universe = await loadMarketUniverse(fetcher, "/fixture/marketUniverse.json");
  const industries = await loadIndustryList(fetcher, "/fixture/industries.json");

  assert.equal(universe.records[0].symbol, "RELIANCE");
  assert.equal(industries.industryCount, 107);
  assert.deepEqual(requested, [
    "/fixture/marketUniverse.json",
    "/fixture/industries.json"
  ]);
});
