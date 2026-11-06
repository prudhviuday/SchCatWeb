import assert from "node:assert/strict";
import test from "node:test";

import {
  ChartDataError,
  aggregateFiveMinuteToFifteenMinute,
  aggregateHourlyToFourHour,
  buildCloseVolumeHistory,
  buildYahooChartUrl,
  buildYahooProxyUrl,
  fetchChartData,
  makeStockGoldSeries,
  mergeStockWithGold,
  parseYahooChartPayload
} from "../../.test-dist/data/providers/chartData.js";

const candle = (time, open, high, low, close, volume) => ({
  time, open, high, low, close, volume
});

test("Yahoo chart URLs map the legacy chart timeframe labels to explicit intervals", () => {
  const weekly = new URL(buildYahooChartUrl("tcs", "1W"));
  assert.equal(weekly.hostname, "query1.finance.yahoo.com");
  assert.equal(weekly.pathname, "/v8/finance/chart/TCS.NS");
  assert.equal(weekly.searchParams.get("interval"), "1wk");
  assert.equal(weekly.searchParams.get("range"), "5y");

  const daily = new URL(buildYahooChartUrl("RELIANCE.NS", "1D"));
  assert.equal(daily.pathname, "/v8/finance/chart/RELIANCE.NS");
  assert.equal(daily.searchParams.get("interval"), "1d");
  assert.equal(daily.searchParams.get("range"), "2y");

  const hourly = new URL(buildYahooChartUrl("INFY", "1H"));
  assert.equal(hourly.searchParams.get("interval"), "1h");
  assert.equal(hourly.searchParams.get("range"), "6mo");

  const fiveMinute = new URL(buildYahooChartUrl("M&M", "5m"));
  assert.equal(fiveMinute.pathname, "/v8/finance/chart/M%26M.NS");
  assert.equal(fiveMinute.searchParams.get("interval"), "5m");
  assert.equal(fiveMinute.searchParams.get("range"), "1mo");
});

test("Yahoo chart URL supports a diagnostic range override and rejects unsafe symbols", () => {
  const url = new URL(buildYahooChartUrl("SBIN", "1D", { range: "5d" }));
  assert.equal(url.searchParams.get("range"), "5d");
  assert.throws(() => buildYahooChartUrl("../bad", "1D"), TypeError);
  assert.throws(() => buildYahooChartUrl("", "1D"), TypeError);
});


test("Yahoo chart runtime URL is a same-origin Worker route", () => {
  const url = new URL(buildYahooProxyUrl("reliance", "1D"), "https://schcatweb.test");
  assert.equal(url.origin, "https://schcatweb.test");
  assert.equal(url.pathname, "/api/yahoo/chart");
  assert.equal(url.searchParams.get("symbol"), "RELIANCE.NS");
  assert.equal(url.searchParams.get("interval"), "1d");
  assert.equal(url.searchParams.get("range"), "2y");
});

test("chart fetches use the same-origin Worker rather than calling Yahoo from the browser", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      chart: {
        result: [{
          timestamp: [100],
          indicators: { quote: [{ open: [10], high: [12], low: [9], close: [11], volume: [100] }] }
        }],
        error: null
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const rows = await fetchChartData("RELIANCE", "1D");
    assert.equal(rows.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.startsWith("/api/yahoo/chart?"), true);
    assert.equal(calls[0].init.mode, "same-origin");
    assert.equal(calls[0].init.credentials, "same-origin");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Yahoo chart payload is converted to ascending OHLCV and zero-volume candles are omitted", () => {
  const payload = {
    chart: {
      result: [{
        timestamp: [300, 100, 200, 400],
        indicators: {
          quote: [{
            open: [13, 10, 11, null],
            high: [14, 12, 13, 15],
            low: [12, 9, 10, 14],
            close: [13.5, 11, 12, 14.5],
            volume: [100, 200, 0, 100]
          }]
        }
      }],
      error: null
    }
  };

  assert.deepEqual(
    parseYahooChartPayload(payload),
    [
      candle(100, 10, 12, 9, 11, 200),
      candle(300, 13, 14, 12, 13.5, 100)
    ]
  );
});

test("Yahoo chart payload errors and missing quote data are surfaced", () => {
  assert.throws(
    () => parseYahooChartPayload({ chart: { result: null, error: { description: "Bad symbol" } } }),
    (error) => error instanceof ChartDataError && error.message.includes("Bad symbol")
  );
  assert.throws(
    () => parseYahooChartPayload({ chart: { result: [{ timestamp: [1] }], error: null } }),
    (error) => error instanceof ChartDataError && error.kind === "invalid-response"
  );
  assert.deepEqual(parseYahooChartPayload({ chart: { result: [], error: null } }), []);
});

test("five-minute candles are grouped in threes and the final partial group is retained", () => {
  const input = [
    candle(0, 10, 12, 9, 11, 100),
    candle(300, 11, 13, 10, 12, 200),
    candle(600, 12, 14, 11, 13, 300),
    candle(900, 13, 15, 12, 14, 400)
  ];
  assert.deepEqual(aggregateFiveMinuteToFifteenMinute(input), [
    candle(0, 10, 14, 9, 13, 600),
    candle(900, 13, 15, 12, 14, 400)
  ]);
});

test("hourly candles retain CRIP4's 09:15 and 13:15 IST session aggregation", () => {
  const input = [
    candle(13_500, 100, 105, 98, 103, 10),
    candle(17_100, 103, 108, 101, 106, 20),
    candle(20_700, 106, 110, 104, 109, 30),
    candle(24_300, 109, 112, 107, 111, 40),
    candle(27_900, 111, 114, 110, 113, 50),
    candle(31_500, 113, 116, 112, 115, 60),
    candle(35_100, 115, 118, 114, 117, 70)
  ];

  assert.deepEqual(aggregateHourlyToFourHour(input), [
    candle(13_500, 100, 112, 98, 111, 100),
    candle(27_900, 111, 118, 110, 117, 180)
  ]);
});

test("close-volume history uses the latest 30 weekly rows in ascending date order", () => {
  const input = Array.from({ length: 32 }, (_, index) =>
    candle(index * 86_400, 1, 1, 1, 10, 100_000_000)
  );
  const result = buildCloseVolumeHistory(input);
  assert.equal(result.length, 30);
  assert.deepEqual(result[0], [
    new Date(2 * 86_400 * 1000).toISOString().slice(0, 10),
    1
  ]);
  assert.deepEqual(result.at(-1), [
    new Date(31 * 86_400 * 1000).toISOString().slice(0, 10),
    1
  ]);
  assert.throws(() => buildCloseVolumeHistory(input, -1), RangeError);
});

test("stock-to-gold merge exact-matches timestamps and forward-fills missing gold candles", () => {
  const stock = [
    candle(1, 100, 120, 90, 110, 10),
    candle(2, 110, 130, 100, 120, 20),
    candle(3, 120, 140, 110, 130, 30)
  ];
  const gold = [
    { time: 1, open: 80, high: 90, low: 70, close: 85 },
    { time: 3, open: 100, high: 110, low: 95, close: 105 }
  ];

  assert.deepEqual(
    mergeStockWithGold(stock, gold).map(({ goldo, goldh, goldl, gold }) => ({
      goldo, goldh, goldl, gold
    })),
    [
      { goldo: 80, goldh: 90, goldl: 70, gold: 85 },
      { goldo: 80, goldh: 90, goldl: 70, gold: 85 },
      { goldo: 100, goldh: 110, goldl: 95, gold: 105 }
    ]
  );
  assert.throws(() => mergeStockWithGold(stock, []), RangeError);
});

test("synthetic stock-versus-gold series is anchored to the final candle with ₹50 notionals", () => {
  const merged = [
    {
      ...candle(1, 100, 120, 90, 110, 10),
      goldo: 80, goldh: 90, goldl: 70, gold: 85
    },
    {
      ...candle(2, 200, 220, 190, 210, 20),
      goldo: 100, goldh: 110, goldl: 95, gold: 105
    }
  ];

  const result = makeStockGoldSeries(merged);
  assert.equal(result[0].sgclose, -15);
  assert.equal(result[0].sgopen, -15);
  assert.equal(result[0].sghigh, -15);
  assert.equal(result[0].sglow, -12.5);
  assert.equal(result[1].sgclose, 0);
  assert.equal(result[1].sgopen, 0);
  assert.throws(
    () => makeStockGoldSeries([{ ...merged[0], open: 0 }]),
    RangeError
  );
});
