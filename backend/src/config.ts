export type AppEnvironment = "development" | "staging" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface EnvBindings {
  APP_ENV?: string;
  LOG_LEVEL?: string;
  ALLOWED_ORIGINS?: string;
}

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  logLevel: LogLevel;
  allowedOrigins: string[];
}

const environments: AppEnvironment[] = ["development", "staging", "production"];
const logLevels: LogLevel[] = ["debug", "info", "warn", "error"];

export function getRuntimeConfig(env: EnvBindings): RuntimeConfig {
  const appEnv = (env.APP_ENV || "development").trim() as AppEnvironment;
  const logLevel = (env.LOG_LEVEL || "info").trim() as LogLevel;

  if (!environments.includes(appEnv)) {
    throw new Error("APP_ENV must be development, staging, or production.");
  }
  if (!logLevels.includes(logLevel)) {
    throw new Error("LOG_LEVEL must be debug, info, warn, or error.");
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("ALLOWED_ORIGINS entries must use HTTP or HTTPS.");
      }
      return url.origin;
    });

  return { appEnv, logLevel, allowedOrigins };
}
