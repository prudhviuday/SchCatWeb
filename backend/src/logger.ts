import type { LogLevel } from "./config";

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

type LogContext = Record<string, unknown>;

export function createLogger(minimumLevel: LogLevel) {
  function write(level: LogLevel, message: string, context: LogContext = {}) {
    if (priorities[level] < priorities[minimumLevel]) return;

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    });

    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else if (level === "debug") console.debug(entry);
    else console.info(entry);
  }

  return {
    debug: (message: string, context?: LogContext) => write("debug", message, context),
    info: (message: string, context?: LogContext) => write("info", message, context),
    warn: (message: string, context?: LogContext) => write("warn", message, context),
    error: (message: string, context?: LogContext) => write("error", message, context)
  };
}
