import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppBindings } from "../middleware/request-context";

const data = new Hono<AppBindings>();

async function readJsonDataset(c: Context<AppBindings>, key: string) {
  const bucket = c.env.DATA_BUCKET;
  if (!bucket) {
    throw new HTTPException(503, { message: "The persistent data bucket is not configured." });
  }

  const object = await bucket.get(key);
  if (!object) {
    throw new HTTPException(404, { message: `Dataset is not uploaded: ${key}` });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await object.text());
  } catch {
    throw new HTTPException(500, { message: `Stored dataset contains invalid JSON: ${key}` });
  }

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  c.header("Content-Type", "application/json; charset=utf-8");
  if (object.httpEtag) c.header("ETag", object.httpEtag);

  return c.json({
    data: payload,
    meta: {
      source: "cloudflare-r2",
      key,
      uploadedAt: object.uploaded?.toISOString() ?? null
    }
  });
}

data.get("/manifest", (c) => readJsonDataset(c, "data/manifest.json"));
data.get("/market-ids", (c) => readJsonDataset(c, "data/market-ids.json"));
data.get("/stock-metadata", (c) => readJsonDataset(c, "data/stock-metadata.json"));
data.get("/queries", (c) => readJsonDataset(c, "data/queries.json"));
data.get("/watchlists", (c) => readJsonDataset(c, "data/watchlists.json"));
data.get("/portfolio", (c) => readJsonDataset(c, "data/portfolio.json"));
data.get("/industries", (c) => readJsonDataset(c, "data/industries.json"));
data.get("/industry-analysis", (c) => readJsonDataset(c, "data/industry-analysis/index.json"));

data.get("/industry-analysis/:filename", (c) => {
  const filename = c.req.param("filename");
  if (!/^industry_[A-Za-z0-9_-]+\.json$/.test(filename)) {
    throw new HTTPException(400, { message: "Invalid industry-analysis filename." });
  }
  return readJsonDataset(c, `data/industry-analysis/files/${filename}`);
});

export default data;
