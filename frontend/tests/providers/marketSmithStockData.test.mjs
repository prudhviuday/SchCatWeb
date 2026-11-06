import assert from "node:assert/strict";
import test from "node:test";

import { fetchNseDeliveryHistory, parseNseDeliveryHistory } from "../../.test-dist/data/providers/nseDelivery.js";

import {
  fetchMarketSmithFinanceData,
  fetchMarketSmithRelativeStrength,
  fetchMarketSmithStockMetrics,
  fetchMarketSmithUniverse,
  parseMarketSmithFinanceData,
  parseMarketSmithRelativeStrength,
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
        { prdYear: "2026", prdQuarter: "Q2", epsPct: "120", salesPct: "100", sales: "1250.5" },
        { prdYear: "2026", prdQuarter: "Q1", epsPct: "90", salesPct: "80", sales: "1100" },
        { prdYear: "2025", prdQuarter: "Q4", epsPct: "70", salesPct: "75", sales: "900" }
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
    currentPrice: 125.5,
    institutionalOwnership: [
      { period: "01-2025", value: 0, normalized: null },
      { period: "01-2026", value: 0, normalized: null },
      { period: "01-2026", value: 0, normalized: null }
    ],
    institutionalCost: [
      { period: "01-2025", value: 0, normalized: null },
      { period: "01-2026", value: 0, normalized: null },
      { period: "01-2026", value: 0, normalized: null }
    ],
    quarterlyGrowth: [
      { period: "2025 Q4", epsPct: 70, salesPct: 75, salesValue: 900 },
      { period: "2026 Q1", epsPct: 90, salesPct: 80, salesValue: 1100 },
      { period: "2026 Q2", epsPct: 120, salesPct: 100, salesValue: 1250.5 }
    ]
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
  assert.deepEqual(result.institutionalOwnership, []);
});

test("MarketSmith parser rejects a response without the legacy response object", () => {
  assert.throws(
    () => parseMarketSmithStockMetrics({ error: "not authorized" }),
    /missing the response object/
  );
});


test("MarketSmith institutional ownership and cost histories match desktop formulas", () => {
  const payload = {
    response: {
      detailsGeneralInformationHeader: { currentPrice: "125" },
      quarterlySalesAndEarningsInternational: {
        quarterlySalesAndEarningsOrigin: [
          { prdYear: "2026 Q2", totSharesHeldByFunds: 3000000000 },
          { prdYear: "2026 Q1", totSharesHeldByFunds: 2000000000 },
          { prdYear: "2025 Q4", totSharesHeldByFunds: 1000000000 }
        ]
      }
    }
  };
  const result = parseMarketSmithStockMetrics(payload);
  assert.deepEqual(result.institutionalOwnership, [
    { period: "01-2025 Q4", value: 1000000000, normalized: 0 },
    { period: "01-2026 Q1", value: 2000000000, normalized: 50 },
    { period: "01-2026 Q2", value: 3000000000, normalized: 100 }
  ]);
  assert.deepEqual(result.institutionalCost, [
    { period: "01-2025 Q4", value: 125, normalized: null },
    { period: "01-2026 Q1", value: 250, normalized: null },
    { period: "01-2026 Q2", value: 375, normalized: null }
  ]);
});

test("MarketSmith institutional ownership leaves normalized index blank for a constant series", () => {
  const result = parseMarketSmithStockMetrics({ response: {
    detailsGeneralInformationHeader: { currentPrice: "100" },
    quarterlySalesAndEarningsInternational: { quarterlySalesAndEarningsOrigin: [
      { prdYear: "2025", totSharesHeldByFunds: 5 },
      { prdYear: "2024", totSharesHeldByFunds: 5 }
    ] }
  }});
  assert.deepEqual(result.institutionalOwnership.map(point => point.normalized), [null, null]);
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

test("MarketSmith annual EPS history reverses provider order and normalizes like desktop", () => {
  const result = parseMarketSmithFinanceData({
    ratiosAnnualData: [
      { c0: "2025", c20: "30" },
      { c0: "2024", c20: "20" },
      { c0: "2023", c20: "10" }
    ]
  });
  assert.deepEqual(result.annualEps, [
    { year: 2023, eps: 10, normalized: 0 },
    { year: 2024, eps: 20, normalized: 50 },
    { year: 2025, eps: 30, normalized: 100 }
  ]);
});

test("MarketSmith finance parser adds chronological annual ROCE and revenue histories", () => {
  const result = parseMarketSmithFinanceData({
    ratiosAnnualData: [
      { c0: "2025", c20: "30", c4: "18" },
      { c0: "2024", c20: "20", c4: "15" },
      { c0: "2023", c20: "10", c4: "12" }
    ],
    incAnnualData: [
      { c0: "03-25", c3: "300" },
      { c0: "03-24", c3: "200" },
      { c0: "03-23", c3: "100" }
    ]
  });
  assert.deepEqual(result.annualRoce, [
    { year: 2023, value: 12, normalized: 0 },
    { year: 2024, value: 15, normalized: 50 },
    { year: 2025, value: 18, normalized: 100 }
  ]);
  assert.deepEqual(result.annualRevenue, [
    { year: 2023, value: 100, normalized: 0 },
    { year: 2024, value: 200, normalized: 50 },
    { year: 2025, value: 300, normalized: 100 }
  ]);
});


test("MarketSmith quarterly expansion history matches desktop c25/c32 formula and chronology", () => {
  const result = parseMarketSmithFinanceData({
    incQuarterData: [
      { c0: "2026 Q2", c25: "35", c32: "100" },
      { c0: "2026 Q1", c25: "10", c32: "40" },
      { c0: "2025 Q4", c25: "25", c32: "100" },
      { c0: "2025 Q3", c25: "10", c32: "0" },
      { c0: "2025 Q2", c25: null, c32: "100" }
    ]
  });
  assert.deepEqual(result.quarterlyExpansion, [
    { period: "01-2025 Q4", value: 25 },
    { period: "01-2026 Q1", value: 25 },
    { period: "01-2026 Q2", value: 35 }
  ]);
});

test("MarketSmith annual EPS handles a constant series without fabricating normalized values", () => {
  const result = parseMarketSmithFinanceData({
    ratiosAnnualData: [
      { c0: "2025", c20: "10" },
      { c0: "2024", c20: "10" }
    ]
  });
  assert.deepEqual(result.annualEps.map(point => point.normalized), [null, null]);
});

test("MarketSmith finance request uses same-origin Worker and browser-saved session", async () => {
  let requestUrl = "";
  let requestInit = {};
  const result = await fetchMarketSmithFinanceData(
    3159563,
    "test auth",
    async (input, init = {}) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        ratiosAnnualData: [
          { c0: "2025", c20: "30" },
          { c0: "2024", c20: "20" }
        ]
      }), { status: 200 });
    }
  );
  const parsed = new URL(requestUrl, "https://schcatweb.test");
  assert.equal(parsed.pathname, "/api/marketsmith/finance");
  assert.equal(parsed.searchParams.get("stockId"), "3159563");
  assert.equal(requestInit.headers["x-marketsmith-auth"], "test auth");
  assert.equal(result.annualEps[0].year, 2024);
});


test("NSE delivery parser matches desktop five-session rolling value calculations", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    mTIMESTAMP: "Day " + (7 - index),
    CH_TOT_TRADED_VAL: String((index + 1) * 10000000),
    COP_DELIV_PERC: String(40 + index)
  }));
  const result = parseNseDeliveryHistory({ data: rows });
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { date: "Day 6", deliveryValueCr: 174, tradedValueCr: 400, deliveryPct: 41 });
  assert.deepEqual(result[1], { date: "Day 7", deliveryValueCr: 128, tradedValueCr: 300, deliveryPct: 40 });
});

test("NSE delivery parser ignores rows without a reported delivery percentage", () => {
  assert.deepEqual(parseNseDeliveryHistory({ data: [
    { mTIMESTAMP: "D1", CH_TOT_TRADED_VAL: 10000000, COP_DELIV_PERC: 40 },
    { mTIMESTAMP: "D2", CH_TOT_TRADED_VAL: 10000000, COP_DELIV_PERC: null }
  ] }), []);
});

test("NSE delivery request uses the same-origin Worker and date-scoped query", async () => {
  let requestUrl = "";
  let requestInit = {};
  const history = Array.from({ length: 8 }, (_, index) => ({ mTIMESTAMP: "Day " + index, CH_TOT_TRADED_VAL: 10000000, COP_DELIV_PERC: 50 }));
  const result = await fetchNseDeliveryHistory("rvnl", 300, async (input, init = {}) => {
    requestUrl = String(input); requestInit = init;
    return new Response(JSON.stringify({ data: history }), { status: 200 });
  }, new Date(2026, 10, 6));
  const parsed = new URL(requestUrl, "https://schcatweb.test");
  assert.equal(parsed.pathname, "/api/nse/delivery");
  assert.equal(parsed.searchParams.get("symbol"), "RVNL");
  assert.match(parsed.searchParams.get("from"), /^\d{2}-\d{2}-\d{4}$/);
  assert.match(parsed.searchParams.get("to"), /^\d{2}-\d{2}-\d{4}$/);
  assert.equal(requestInit.mode, "same-origin");
  assert.equal(requestInit.credentials, "same-origin");
  assert.equal(result.length, 3);
});

test("NSE delivery request validates symbol and history window", async () => {
  await assert.rejects(() => fetchNseDeliveryHistory("bad symbol"), /unsupported characters/);
  await assert.rejects(() => fetchNseDeliveryHistory("TEST", 10), /between 30 and 730/);
});


test("MarketSmith RS history fills nulls with the legacy integer mean and reverses newest-first data", () => {
  assert.deepEqual(parseMarketSmithRelativeStrength({ chart: { prices: [
    { rlst: 80 }, { rlst: null }, { rlst: 100 }, { rlst: 90 }
  ] } }), [
    { index: 1, value: 90 },
    { index: 2, value: 100 },
    { index: 3, value: 90 },
    { index: 4, value: 80 }
  ]);
  assert.deepEqual(parseMarketSmithRelativeStrength({ chart: { prices: [{ rlst: null }] } }), []);
});

test("MarketSmith RS request uses same-origin Worker and browser-local auth", async () => {
  let requestUrl = "";
  let requestInit = {};
  const points = await fetchMarketSmithRelativeStrength(12345, "RELIANCE", "browser session", async (input, init = {}) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ chart: { prices: [{ rlst: 80 }, { rlst: 100 }] } }), { status: 200 });
  });
  const parsed = new URL(requestUrl, "https://schcatweb.test");
  assert.equal(parsed.pathname, "/api/marketsmith/relative-strength");
  assert.equal(parsed.searchParams.get("stockId"), "12345");
  assert.equal(parsed.searchParams.get("symbol"), "RELIANCE");
  assert.equal(requestInit.headers["x-marketsmith-auth"], "browser session");
  assert.deepEqual(points.map((point) => point.value), [100, 80]);
});
