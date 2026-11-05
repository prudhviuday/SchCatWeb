import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketSmithFinanceDetailsUrl,
  buildMarketSmithSymbolDetailsUrl,
  buildNseDeliveryUrl,
  extractCsrfToken
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
  assert.equal(url.origin, "https://msi-gcloud-prod.appspot.com");
  assert.equal(
    url.pathname,
    "/gateway/simple-api/ms-india/instr/0/3159563/symboldetails.json"
  );
  assert.equal(url.searchParams.get("s"), "20190810");
  assert.equal(url.searchParams.get("e"), "20250810");
  assert.equal(url.searchParams.get("text"), "RVNL");
  assert.equal(url.searchParams.get("lang"), "en");
  assert.equal(url.searchParams.get("isConsolidated"), "0");
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
