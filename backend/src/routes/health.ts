import { Hono } from "hono";
import type { AppBindings } from "../middleware/request-context";
import { getRuntimeConfig } from "../config";

const health = new Hono<AppBindings>();

health.get("/", (c) => {
  const config = getRuntimeConfig(c.env);
  return c.json({
    status: "ok",
    service: "schcatweb-api",
    version: "0.2.0",
    environment: config.appEnv
  });
});

export default health;
