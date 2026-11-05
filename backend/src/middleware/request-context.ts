import type { MiddlewareHandler } from "hono";
import type { EnvBindings } from "../config";
import { createLogger } from "../logger";

export type AppBindings = {
  Bindings: EnvBindings;
  Variables: { requestId: string };
};

export const requestContext: MiddlewareHandler<AppBindings> = async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  const startedAt = Date.now();
  c.set("requestId", requestId);

  await next();

  c.header("x-request-id", requestId);
  const configLogLevel = c.env.LOG_LEVEL === "debug" ? "debug" : "info";
  const logger = createLogger(configLogLevel);
  logger.info("http_request", {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt
  });
};
