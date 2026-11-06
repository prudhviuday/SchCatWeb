import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../../worker/index.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("health endpoint reports the server-side provider API", async () => {
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/health"),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.providers, ["yahoo", "marketsmith", "chartink", "nse"]);
});

test("Yahoo chart requests are validated and fetched server-side", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ chart: { result: [{ timestamp: [1] }] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/yahoo/chart?symbol=RELIANCE.NS&interval=1d&range=2y"),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  assert.match(requestedUrl, /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/RELIANCE\.NS/);
  const upstream = new URL(requestedUrl);
  assert.equal(upstream.searchParams.get("interval"), "1d");
  assert.equal(upstream.searchParams.get("range"), "2y");
  assert.equal((await response.json()).chart.result.length, 1);
});

test("Yahoo chart rejects unsafe symbols before making an upstream request", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/yahoo/chart?symbol=RELIANCE%2F..%2Fadmin&interval=1d&range=2y"),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("MarketSmith finance endpoint builds a fixed provider URL", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ ratiosAnnualData: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/marketsmith/finance?stockId=3159563", {
      headers: { "x-marketsmith-auth": "test auth token" }
    }),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  assert.match(requestedUrl, /^https:\/\/marketsmithindia\.com\/gateway\/simple-api/);
  assert.match(requestedUrl, /3159563\/financeDetails\.json/);
  assert.equal(new URL(requestedUrl).searchParams.get("ms-auth"), "test auth token");
});

test("ChartInk route performs CSRF bootstrap and posts a scan with the token", async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) {
      return new Response('<html><meta name="csrf-token" content="csrf-test"></html>', {
        status: 200,
        headers: { "set-cookie": "ci_session=session-test; Path=/; Secure" }
      });
    }
    return new Response(JSON.stringify({ data: [{ nsecode: "RELIANCE" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/chartink/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "scan", query: "( {cash} ( latest close > 0 ) )" })
    }),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers["x-csrf-token"], "csrf-test");
  assert.match(calls[1].init.headers.cookie, /ci_session=session-test/);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.redirect, "manual", "session cookies must not be forwarded across redirects");
  assert.deepEqual(await response.json(), { data: [{ nsecode: "RELIANCE" }] });
});

test("non-API requests are served by the static assets binding", async () => {
  let forwarded = false;
  const response = await worker.fetch(
    new Request("https://schcatweb.test/workspace/charts"),
    {
      ASSETS: {
        fetch: async (request) => {
          forwarded = true;
          assert.equal(new URL(request.url).pathname, "/workspace/charts");
          return new Response("spa asset", { status: 200 });
        }
      }
    }
  );
  assert.equal(forwarded, true);
  assert.equal(await response.text(), "spa asset");
});

test("unknown API routes return JSON 404 instead of the SPA shell", async () => {
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/not-a-route"),
    { ASSETS: { fetch: async () => new Response("spa asset") } }
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "api_route_not_found" });
});

test("ChartInk rejects a non-object body without making an upstream request", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/chartink/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null"
    }),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
});


test("MarketSmith endpoints fail clearly when no browser value or legacy fallback is supplied", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/marketsmith/finance?stockId=3159563"),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 503);
  assert.equal(called, false);
  assert.equal((await response.json()).error, "marketsmith_auth_not_configured");
});

test("NSE delivery route bootstraps an anonymous session before requesting history", async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) {
      return new Response("home", {
        status: 200,
        headers: { "set-cookie": "nse_session=sample; Path=/; Secure" }
      });
    }
    return new Response(JSON.stringify({ data: [{ mTIMESTAMP: "06-Nov-2026" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/nse/delivery?symbol=RELIANCE&from=01-11-2026&to=06-11-2026"),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://www.nseindia.com/");
  assert.match(calls[1].url, /generateSecurityWiseHistoricalData/);
  assert.match(calls[1].init.headers.cookie, /nse_session=sample/);
  assert.equal((await response.json()).data.length, 1);
});


test("MarketSmith symbol endpoint matches the current working MarketSmith India URL", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ response: { detailsGeneralInformationHeader: {} } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const response = await worker.fetch(
    new Request(
      "https://schcatweb.test/api/marketsmith/symbol?stockId=3159563&symbol=RVNL&s=20211106&e=20261106",
      { headers: { "x-marketsmith-auth": "sample-auth-token" } }
    ),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  const upstream = new URL(requestedUrl);
  assert.equal(upstream.origin, "https://marketsmithindia.com");
  assert.equal(
    upstream.pathname,
    "/gateway/simple-api/ms-india/instr/0/3159563/symboldetails.json"
  );
  assert.equal(upstream.searchParams.get("s"), "20211106");
  assert.equal(upstream.searchParams.get("e"), "20261106");
  assert.equal(upstream.searchParams.get("text"), "RVNL");
  assert.equal(upstream.searchParams.get("lang"), "en");
  assert.equal(upstream.searchParams.get("isConsolidated"), "1");
  assert.equal(upstream.searchParams.get("ms-auth"), "sample-auth-token");
});

test("MarketSmith symbol endpoint defaults to a rolling five-year date range", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ response: {} }), { status: 200 });
  };
  const response = await worker.fetch(
    new Request("https://schcatweb.test/api/marketsmith/symbol?stockId=3159563&symbol=RVNL", {
      headers: { "x-marketsmith-auth": "sample-auth-token" }
    }),
    { ASSETS: { fetch: async () => new Response("asset") } }
  );
  assert.equal(response.status, 200);
  const upstream = new URL(requestedUrl);
  const start = upstream.searchParams.get("s");
  const end = upstream.searchParams.get("e");
  assert.match(start, /^\d{8}$/);
  assert.match(end, /^\d{8}$/);
  const startDate = new Date(Date.UTC(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8)));
  const endDate = new Date(Date.UTC(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8)));
  assert.equal(endDate.getUTCFullYear() - startDate.getUTCFullYear(), 5);
});
