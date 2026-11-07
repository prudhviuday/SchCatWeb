import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

const origin = "http://127.0.0.1:4179";
let preview;

before(async () => {
  preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], { stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (preview.exitCode !== null) throw new Error("Vite preview exited before it became ready.");
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) {
    preview.kill();
    throw new Error("Vite preview did not become ready within 10 seconds.");
  }
});

after(async () => {
  if (preview && preview.exitCode === null) {
    preview.kill();
    await Promise.race([once(preview, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
  }
});

test("production homepage and deep links serve the SPA shell", async () => {
  for (const path of ["/", "/workspace/charts", "/portfolio", "/research"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path + " should fall back to index.html");
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /\/assets\//);
  }
});

test("built application bundle contains the desktop-style tabs and integrated workspace modules", async () => {
  const html = await (await fetch(origin)).text();
  const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(scriptPath, "production entry script should be present");
  const response = await fetch(new URL(scriptPath, origin));
  assert.equal(response.status, 200);
  const bundle = await response.text();
  for (const label of ["Stocks", "Chart", "Industry Stocks", "Industry Analysis", "Querys", "Market", "Portfolio", "Settings & Library", "Annual ROCE", "Institutional ownership", "Revenue / EPS", "INSTITUTIONAL OWNERSHIP", "INDUSTRY STOCK GRAPHS", "Open Industry Stocks and load all charts for this industry", "Candlestick chart gallery", "Scrollable stock chart gallery", "analysis-chart-controls", "analysis-chart-svg", "analysis-candle-body-up", "analysis-candle-body-down", "analysis-indicator-sma", "analysis-indicator-ema200", "analysis-ticker-button", "screener-header-label", "screener-header-line", "screener-sort-indicator", "data-column"]) {
    assert.ok(bundle.includes(label), "production bundle should include " + label);
  }
  assert.ok(bundle.includes("Provider connectivity diagnostics"), "provider diagnostics view should be bundled");
});

test("all published reference datasets load and agree with their manifest", async () => {
  const load = async path => {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path + " should be published");
    return response.json();
  };
  const [manifest, universe, industries, marketSmithIds] = await Promise.all([
    load("/data/manifest.json"),
    load("/data/marketUniverse.json"),
    load("/data/industries.json"),
    load("/data/marketSmithIds.json")
  ]);
  assert.equal(universe.records.length, manifest.datasets.find(item => item.id === "marketUniverse").records);
  assert.equal(industries.industries.length, manifest.datasets.find(item => item.id === "industries").records);
  assert.equal(Object.keys(marketSmithIds).length, manifest.datasets.find(item => item.id === "marketSmithIds").records);
  assert.ok(universe.records.some(record => record.symbol === "RELIANCE"));
  assert.ok(industries.industries.length > 0);
  assert.ok(marketSmithIds.RELIANCE);
  assert.match(universe.freshness, /Static snapshot/);
});

test("Cloudflare deploys the provider API Worker with the SPA static asset binding", async () => {
  const config = await readFile(new URL("../../../wrangler.toml", import.meta.url), "utf8");
  const worker = await readFile(new URL("../../../worker/index.js", import.meta.url), "utf8");
  assert.match(config, /^main\s*=\s*["']worker\/index\.js["']/m);
  assert.match(config, /directory\s*=\s*["']\.\/frontend\/dist["']/);
  assert.match(config, /binding\s*=\s*["']ASSETS["']/);
  assert.match(config, /not_found_handling\s*=\s*["']single-page-application["']/);
  assert.match(config, /run_worker_first\s*=\s*\[["']\/api\/\*["']\]/);
  assert.match(worker, /\/api\/yahoo\/chart/);
  assert.match(worker, /\/api\/marketsmith\/finance/);
  assert.match(worker, /\/api\/chartink\/scan/);
  assert.match(worker, /backtest\/process/);
  assert.match(worker, /\/api\/nse\/delivery/);
  assert.doesNotMatch(config, /^\s*\[\[?r2_buckets\]?\]/m);
});
