import assert from "node:assert/strict";
import test from "node:test";
import { fetchChartInkHistory, parseChartInkHistoryPayload } from "../../.test-dist/data/providers/chartInkHistory.js";

const payload = {
  metaData: [{ tradeTimes: [1000, 2000, 3000] }],
  aggregatedStockList: [
    ["TCS", 10, 20, "INFY", 11, 21, "TCS", 12, 22],
    ["RELIANCE", 30, 40, "INFY", 31, 41],
    []
  ]
};

test("parses historical tuple positions and deduplicates symbols across all backtest dates", () => {
  assert.deepEqual(parseChartInkHistoryPayload(payload), {
    symbols: ["TCS", "INFY", "RELIANCE"],
    dates: 3,
    rawEntries: 15
  });
});

test("empty backtest history returns a valid empty symbol universe", () => {
  assert.deepEqual(parseChartInkHistoryPayload({
    metaData: [{ tradeTimes: [] }],
    aggregatedStockList: []
  }), { symbols: [], dates: 0, rawEntries: 0 });
});

test("rejects malformed historical payloads and mismatched date rows", () => {
  assert.throws(() => parseChartInkHistoryPayload({}), /missing/);
  assert.throws(() => parseChartInkHistoryPayload({
    metaData: [{ tradeTimes: [1, 2] }], aggregatedStockList: [[]]
  }), /mismatched/);
  assert.throws(() => parseChartInkHistoryPayload({
    metaData: [{ tradeTimes: [1] }], aggregatedStockList: ["not-an-array"]
  }), /invalid historical stock row/);
});

test("history request uses same-origin Worker and explicit history mode", async () => {
  let request;
  const result = await fetchChartInkHistory("close > ema(20)", async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  assert.equal(request.url, "/api/chartink/scan");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "same-origin");
  assert.ok(request.init.signal instanceof AbortSignal, "history request has a cancellation signal");
  assert.deepEqual(JSON.parse(request.init.body), { mode: "history", query: "close > ema(20)" });
  assert.deepEqual(result.symbols, ["TCS", "INFY", "RELIANCE"]);
});

test("reports HTTP, malformed JSON and network failures clearly", async () => {
  await assert.rejects(
    fetchChartInkHistory("close > 1", async () => new Response(JSON.stringify({ message: "blocked" }), { status: 502 })),
    /blocked/
  );
  await assert.rejects(
    fetchChartInkHistory("close > 1", async () => new Response("not json", { status: 200 })),
    /non-JSON/
  );
  await assert.rejects(
    fetchChartInkHistory("close > 1", async () => { throw new Error("offline"); }),
    /Could not reach/
  );
  await assert.rejects(fetchChartInkHistory("  "), /no ChartInk query clause/);
});

test("a cancelled history request reports a timeout clearly", async () => {
  await assert.rejects(fetchChartInkHistory("close > 1", async (_url, init) => {
    const error = new Error("aborted"); error.name = "AbortError";
    assert.ok(init.signal instanceof AbortSignal); throw error;
  }), /historical backtest timed out/);
});
