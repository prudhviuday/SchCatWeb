import { describe, expect, it } from "vitest";
import { app } from "../index";
import type { EnvBindings, R2BucketLike } from "../config";

function makeEnv(objects: Record<string, string> = {}): EnvBindings {
  const bucket: R2BucketLike = {
    get: async (key) => {
      const content = objects[key];
      return content === undefined
        ? null
        : { text: async () => content, httpEtag: '"test-etag"' };
    }
  };
  return {
    APP_ENV: "development",
    LOG_LEVEL: "error",
    ALLOWED_ORIGINS: "http://localhost:5173",
    DATA_BUCKET: bucket
  };
}

describe("SchCatWeb data API", () => {
  it("serves the imported data manifest from R2", async () => {
    const env = makeEnv({
      "data/manifest.json": JSON.stringify({ schemaVersion: 1, datasets: { marketIds: { count: 2 } } })
    });
    const response = await app.request("/api/data/manifest", {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"test-etag"');
    expect(await response.json()).toMatchObject({
      data: { schemaVersion: 1, datasets: { marketIds: { count: 2 } } },
      meta: { source: "cloudflare-r2", key: "data/manifest.json" }
    });
  });

  it("serves MarketSmith symbol IDs without exposing a filesystem path", async () => {
    const env = makeEnv({
      "data/market-ids.json": JSON.stringify({ count: 1, symbolToId: { RELIANCE: 3023127 } })
    });
    const response = await app.request("/api/data/market-ids", {}, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { count: 1, symbolToId: { RELIANCE: 3023127 } }
    });
  });

  it("returns 404 when a dataset has not been uploaded", async () => {
    const response = await app.request("/api/data/portfolio", {}, makeEnv());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "HTTP_ERROR", message: "Dataset is not uploaded: data/portfolio.json" }
    });
  });

  it("returns 503 when the R2 binding is missing", async () => {
    const response = await app.request("/api/data/manifest", {}, {
      APP_ENV: "development",
      LOG_LEVEL: "error",
      ALLOWED_ORIGINS: "http://localhost:5173"
    });

    expect(response.status).toBe(503);
  });

  it("rejects unsafe industry-analysis filenames", async () => {
    const response = await app.request("/api/data/industry-analysis/%2E%2E%2Fsecrets.json", {}, makeEnv());
    expect(response.status).toBe(400);
  });
});
