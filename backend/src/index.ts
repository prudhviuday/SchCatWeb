import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { getRuntimeConfig } from "./config";
import { createLogger } from "./logger";
import { requestContext, type AppBindings } from "./middleware/request-context";
import health from "./routes/health";
import data from "./routes/data";

const app = new Hono<AppBindings>();

app.use("*", requestContext);
app.use("/api/*", async (c, next) => {
  const config = getRuntimeConfig(c.env);
  const corsMiddleware = cors({
    origin: (origin) => config.allowedOrigins.includes(origin) ? origin : "",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID"],
    credentials: true,
    maxAge: 600
  });
  return corsMiddleware(c, next);
});

app.route("/api/health", health);
app.route("/api/data", data);

app.notFound((c) => {
  const requestId = c.get("requestId");
  return c.json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
      requestId
    }
  }, 404);
});

app.onError((error, c) => {
  const requestId = c.get("requestId") || "unknown";
  let logLevel: "debug" | "info" | "warn" | "error" = "info";
  try {
    logLevel = getRuntimeConfig(c.env).logLevel;
  } catch {
    // Keep error handling available even when environment configuration is invalid.
  }

  const logger = createLogger(logLevel);
  const status = error instanceof HTTPException ? error.status : 500;
  const code = error instanceof HTTPException ? "HTTP_ERROR" : "INTERNAL_SERVER_ERROR";
  const message = status < 500 ? error.message : "An unexpected server error occurred.";

  logger.error("api_request_failed", {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status,
    error: error.message
  });

  return c.json({
    error: { code, message, requestId }
  }, status as 400 | 401 | 403 | 404 | 405 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 501 | 502 | 503 | 504);
});

export { app };
export default app;
