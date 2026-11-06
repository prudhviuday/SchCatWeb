import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketSmithFinanceDetailsUrl,
  buildMarketSmithSymbolDetailsUrl,
  buildNseDeliveryUrl,
  buildMarketSmithFinanceProxyUrl,
  buildMarketSmithSymbolProxyUrl,
  buildNseDeliveryProxyUrl,
  extractCsrfToken,
  runProviderDiagnostics
} from "../../.test-dist/data/providers/providerDiagnostics.js";

test("MarketSmith finance URL preserves the legacy endpoint and consolidation flag", () => {
  const url = new URL(buildMarketSmithFinanceDetailsUrl("3159563"));
  assert.equal(url.origin, "https://marketsmithindia.com");
  assert.equal(
    url.pathname,
    "/gateway/simple-api/ms-india/instr/0/3159563/financeDetails.json"
  );
  assert.equal(url.searchParams.get("isConsolidated"), "false");
  assert.equal(url.searchParams.has("ms-auth"), false);
});

test("MarketSmith symbol URL preserves source parameters without publishing ms-auth", () => {
  const url = new URL(buildMarketSmithSymbolDetailsUrl("3159563", "RVNL"));
  assert.equal(url.origin, "https://marketsmithindia.com");
  assert.equal(
    url.pathname,
    "/gateway/simple-api/ms-india/instr/0/3159563/symboldetails.json"
  );
  assert.equal(url.searchParams.get("s"), "20211106");
  assert.equal(url.searchParams.get("e"), "20261106");
  assert.equal(url.searchParams.get("text"), "RVNL");
  assert.equal(url.searchParams.get("lang"), "en");
  assert.equal(url.searchParams.get("isConsolidated"), "1");
  assert.equal(url.searchParams.has("ms-auth"), false);
});

test("MarketSmith request builders reject malformed stock identifiers and symbols", () => {
  assert.throws(() => buildMarketSmithFinanceDetailsUrl("3159/563"), TypeError);
  assert.throws(() => buildMarketSmithSymbolDetailsUrl("3159563", "RVNL&x=y"), TypeError);
});

test("NSE delivery URL preserves the historical endpoint and ALL series", () => {
  const url = new URL(
    buildNseDeliveryUrl("reliance", "01-11-2026", "05-11-2026")
  );
  assert.equal(url.origin, "https://www.nseindia.com");
  assert.equal(
    url.pathname,
    "/api/historicalOR/generateSecurityWiseHistoricalData"
  );
  assert.equal(url.searchParams.get("from"), "01-11-2026");
  assert.equal(url.searchParams.get("to"), "05-11-2026");
  assert.equal(url.searchParams.get("symbol"), "RELIANCE");
  assert.equal(url.searchParams.get("type"), "priceVolumeDeliverable");
  assert.equal(url.searchParams.get("series"), "ALL");
});

test("NSE delivery URL rejects unsafe symbols", () => {
  assert.throws(
    () => buildNseDeliveryUrl("RELIANCE&other=1", "01-11-2026", "05-11-2026"),
    TypeError
  );
});

test("CSRF token parser extracts a standard meta tag", () => {
  assert.equal(
    extractCsrfToken('<html><head><meta name="csrf-token" content="token-abc"></head></html>'),
    "token-abc"
  );
});

test("CSRF token parser supports reordered attributes and single quotes", () => {
  assert.equal(
    extractCsrfToken("<meta content='token-xyz' class='csrf' name='csrf-token'>"),
    "token-xyz"
  );
});

test("CSRF token parser returns null when the meta tag is missing", () => {
  assert.equal(extractCsrfToken("<html><head></head></html>"), null);
});


test("provider diagnostics call only same-origin Worker APIs", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("/api/marketsmith/finance")) {
      return new Response(JSON.stringify({ ratiosAnnualData: [] }), { status: 200 });
    }
    if (url.startsWith("/api/marketsmith/symbol")) {
      return new Response(JSON.stringify({ response: {} }), { status: 200 });
    }
    if (url === "/api/chartink/scan") {
      return new Response(JSON.stringify({ data: [{ nsecode: "RELIANCE" }] }), { status: 200 });
    }
    if (url.startsWith("/api/nse/delivery")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.startsWith("/api/yahoo/chart")) {
      return new Response(JSON.stringify({
        chart: { result: [{ timestamp: [1] }], error: null }
      }), { status: 200 });
    }
    throw new Error("Unexpected URL: " + url);
  };

  try {
    const results = await runProviderDiagnostics({
      marketSmithStockId: "3159563",
      marketSmithSymbol: "RVNL"
    });
    assert.equal(results.length, 5);
    assert.equal(results.every((item) => item.status === "success"), true);
    assert.equal(calls.every((call) => call.url.startsWith("/api/")), true);
    assert.equal(calls.some((call) => call.url.startsWith("https://")), false);
    const chartink = calls.find((call) => call.url === "/api/chartink/scan");
    assert.equal(chartink.init.method, "POST");
    assert.equal(chartink.init.mode, "same-origin");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MarketSmith Worker URL builders validate inputs and never include auth values", () => {
  const finance = new URL(
    buildMarketSmithFinanceProxyUrl("3159563"),
    "https://schcatweb.test"
  );
  assert.equal(finance.pathname, "/api/marketsmith/finance");
  assert.equal(finance.searchParams.get("stockId"), "3159563");
  const symbol = new URL(
    buildMarketSmithSymbolProxyUrl("3159563", "rvnl"),
    "https://schcatweb.test"
  );
  assert.equal(symbol.pathname, "/api/marketsmith/symbol");
  assert.equal(symbol.searchParams.get("symbol"), "RVNL");
  assert.equal(symbol.searchParams.has("ms-auth"), false);
  assert.throws(() => buildMarketSmithFinanceProxyUrl("1&x=2"), TypeError);
});

test("NSE Worker URL builder uses its same-origin route", () => {
  const url = new URL(
    buildNseDeliveryProxyUrl("reliance", "01-11-2026", "06-11-2026"),
    "https://schcatweb.test"
  );
  assert.equal(url.pathname, "/api/nse/delivery");
  assert.equal(url.searchParams.get("symbol"), "RELIANCE");
  assert.equal(url.searchParams.get("from"), "01-11-2026");
  assert.equal(url.searchParams.get("to"), "06-11-2026");
});


test("missing MarketSmith Worker secrets are reported as configuration, not provider rejection", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/marketsmith/")) {
      return new Response(JSON.stringify({
        error: "marketsmith_auth_not_configured",
        message: "Set the Cloudflare Worker secret."
      }), { status: 503, headers: { "content-type": "application/json" } });
    }
    if (url === "/api/chartink/scan") {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.startsWith("/api/nse/delivery")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.startsWith("/api/yahoo/chart")) {
      return new Response(JSON.stringify({
        chart: { result: [{ timestamp: [1] }], error: null }
      }), { status: 200 });
    }
    throw new Error("Unexpected URL: " + url);
  };

  try {
    const results = await runProviderDiagnostics({
      marketSmithStockId: "3159563",
      marketSmithSymbol: "RVNL"
    });
    const marketSmith = results.filter((item) => item.provider === "MarketSmith");
    assert.equal(marketSmith.length, 2);
    assert.equal(marketSmith.every((item) => item.status === "configuration-required"), true);
    assert.equal(marketSmith.every((item) => item.httpStatus === 503), true);
    assert.equal(
      marketSmith.every((item) => item.message.includes("No request has been sent to MarketSmith yet")),
      true
    );
    assert.equal(
      results.filter((item) => item.provider !== "MarketSmith")
        .every((item) => item.status === "success"),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
