import { describe, expect, it } from "vitest";
import { app } from "./index";
import type { EnvBindings } from "./config";

const env: EnvBindings = {
  APP_ENV: "test" as EnvBindings["APP_ENV"],
  LOG_LEVEL: "error",
  ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173"
};

describe("SchCatWeb API foundation", () => {
  it("returns a successful health response", async () => {
    const response = await app.request("/api/health", {}, {
      ...env,
      APP_ENV: "development"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      service: "schcatweb-api",
      version: "0.2.0",
      environment: "development"
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("preserves a caller-provided request id", async () => {
    const response = await app.request("/api/health", {
      headers: { "x-request-id": "schcat-test-123" }
    }, { ...env, APP_ENV: "development" });

    expect(response.headers.get("x-request-id")).toBe("schcat-test-123");
  });

  it("returns a consistent 404 response for unknown routes", async () => {
    const response = await app.request("/api/not-a-route", {}, {
      ...env,
      APP_ENV: "development"
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "The requested API route was not found." }
    });
  });

  it("allows configured frontend origins", async () => {
    const response = await app.request("/api/health", {
      headers: { Origin: "http://localhost:5173" }
    }, { ...env, APP_ENV: "development" });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
});
