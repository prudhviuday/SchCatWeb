import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMarketSmithStockMetrics,
  fetchMarketSmithUniverse,
  parseMarketSmithStockMetrics
} from "../../.test-dist/data/providers/marketSmithStockData.js";

const samplePayload = {
  response: {
    detailsGeneralInformationHeader: {
      currentPrice: "125.5",
      pe: "24.9",
      industryGroupRank: "12",
      rsNumericGrade: "97",
      epsRank: "88",
      masterScore: "95",
      accDisRating: "A",
      roe: "18.2"
    },
    detailsGeneralInformationHeaderBlock: {
      epsGrowthRate: "32",
      earningsStability: "83",
      bookVal: "45",
      cashFlow: "76"
    },
    quarterlySalesAndEarningsInternational: {
      quarterlySalesAndEarningsOrigin: [
        { epsPct: "120", salesPct: "100" },
        { epsPct: "90", salesPct: "80" },
        { epsPct: "70", salesPct: "75" }
      ]
    }
  }
};

test("MarketSmith parser preserves legacy stock fields and FScore calculation", () => {
  assert.deepEqual(parseMarketSmithStockMetrics(samplePayload), {
    groupRank: 12,
    rs: 97,
    epsRank: 88,
    masterScore: 95,
    accDis: "A",
    pe: 24,
    peg: 0.75,
    fScore: 28,
    roe: 18.2,
    epsGrowth: 32,
    stability: 83,
    livePb: 45,
    cashFlow: 76,
    currentPrice: 125.5
  });
});

test("MarketSmith parser handles absent optional sections without inventing values", () => {
  const result = parseMarketSmithStockMetrics({ response: {} });
  assert.equal(result.pe, 0);
  assert.equal(result.peg, 5);
  assert.equal(result.fScore, 0);
  assert.equal(result.rs, null);
  assert.equal(result.roe, null);
  assert.equal(result.livePb, null);
});

test("MarketSmith parser rejects a response without the legacy response object", () => {
  assert.throws(
    () => parseMarketSmithStockMetrics({ error: "not authorized" }),
    /missing the response object/
  );
});

test("single-stock request uses the same-origin Worker and browser-saved auth header", async () => {
  let requestUrl = "";
  let requestInit = {};
  const result = await fetchMarketSmithStockMetrics(
    3159563,
    "rvnl",
    "test auth value",
    async (input, init = {}) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify(samplePayload), { status: 200 });
    }
  );

  const parsed = new URL(requestUrl, "https://schcatweb.test");
  assert.equal(parsed.pathname, "/api/marketsmith/symbol");
  assert.equal(parsed.searchParams.get("stockId"), "3159563");
  assert.equal(parsed.searchParams.get("symbol"), "RVNL");
  assert.equal(requestInit.mode, "same-origin");
  assert.equal(requestInit.credentials, "same-origin");
  assert.equal(requestInit.headers["x-marketsmith-auth"], "test auth value");
  assert.equal(result.rs, 97);
});

test("MarketSmith request reports upstream status and message", async () => {
  await assert.rejects(
    () => fetchMarketSmithStockMetrics(
      123,
      "TEST",
      "auth",
      async () => new Response(JSON.stringify({ error: "denied" }), { status: 403 })
    ),
    /TEST: MarketSmith HTTP 403 — denied/
  );
});

test("whole-universe fetch uses bounded concurrency, ID fallback and progress", async () => {
  const records = [
    { symbol: "RVNL", instrumentId: 101, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null },
    { symbol: "TCS", instrumentId: null, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null },
    { symbol: "NOID", instrumentId: null, marketCap: null, sector: null, industry: null, pb: null, roce: null, nikScore: null }
  ];
  let active = 0;
  let maximumActive = 0;
  const progress = [];
  const result = await fetchMarketSmithUniverse(
    records,
    { TCS: 202 },
    "auth",
    {
      concurrency: 2,
      onProgress: (completed, total) => progress.push([completed, total]),
      fetcher: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 8));
        active -= 1;
        return new Response(JSON.stringify(samplePayload), { status: 200 });
      }
    }
  );

  assert.equal(maximumActive, 2);
  assert.equal(result.metrics.size, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(result.skippedWithoutId, 1);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.equal(result.metrics.get("RVNL").rs, 97);
  assert.equal(result.metrics.get("TCS").rs, 97);
});

test("whole-universe fetch rejects missing auth and invalid concurrency", async () => {
  const records = [];
  await assert.rejects(
    () => fetchMarketSmithUniverse(records, {}, ""),
    /Save a current MarketSmith session/
  );
  await assert.rejects(
    () => fetchMarketSmithUniverse(records, {}, "auth", { concurrency: 0 }),
    /concurrency must be between 1 and 16/
  );
});
