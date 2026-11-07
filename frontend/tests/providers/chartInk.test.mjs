import assert from "node:assert/strict";
import test from "node:test";
import { fetchChartInkScan } from "../../.test-dist/data/providers/chartInk.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("scan posts the exact saved clause to the same-origin Worker", async () => {
  let request;
  const result = await fetchChartInkScan("  ( {cash} ( latest close > 100 ) )  ", async (url, init) => {
    request = { url, init };
    return response({ data: [{ nsecode: "tcs" }, { nsecode: "INFY" }] });
  });
  assert.equal(request.url, "/api/chartink/scan");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "same-origin");
  assert.ok(request.init.signal instanceof AbortSignal, "scan request has a cancellation signal");
  assert.deepEqual(JSON.parse(request.init.body), { mode: "scan", query: "( {cash} ( latest close > 100 ) )" });
  assert.deepEqual(result, { symbols: ["TCS", "INFY"], rawRows: 2 });
});

test("scan normalizes and deduplicates NSE symbols and supports symbol alias", async () => {
  const result = await fetchChartInkScan("close > 1", async () => response({
    data: [{ nsecode: " tcs " }, { nsecode: "TCS" }, { symbol: "reliance" }, { nsecode: "" }, {}]
  }));
  assert.deepEqual(result.symbols, ["TCS", "RELIANCE"]);
  assert.equal(result.rawRows, 5);
});

test("an empty valid result is distinct from a malformed payload", async () => {
  assert.deepEqual(await fetchChartInkScan("close > 1", async () => response({ data: [] })), { symbols: [], rawRows: 0 });
  await assert.rejects(fetchChartInkScan("close > 1", async () => response({ result: [] })), /missing the expected data array/);
});

test("HTTP errors preserve the Worker error code or message", async () => {
  await assert.rejects(fetchChartInkScan("close > 1", async () => response({ error: "chartink_bootstrap_failed" }, 502)), /chartink_bootstrap_failed/);
});

test("network errors and malformed symbols fail clearly", async () => {
  await assert.rejects(fetchChartInkScan("close > 1", async () => { throw new Error("offline"); }), /Could not reach the SchCatWeb Worker: offline/);
  await assert.rejects(fetchChartInkScan("close > 1", async () => response({ data: [{ nsecode: "!!!" }] })), /none contained a valid NSE symbol/);
  await assert.rejects(fetchChartInkScan("   ", async () => response({ data: [] })), /no ChartInk query clause/);
});

test("a cancelled scan reports a timeout instead of a generic network error", async () => {
  await assert.rejects(fetchChartInkScan("close > 1", async (_url, init) => {
    const error = new Error("aborted"); error.name = "AbortError";
    assert.ok(init.signal instanceof AbortSignal); throw error;
  }), /ChartInk scan timed out/);
});
