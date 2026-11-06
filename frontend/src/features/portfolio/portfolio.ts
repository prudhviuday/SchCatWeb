import type { ChartCandle, ChartTimeframe } from "../../data/providers/chartData.js";

export const PORTFOLIO_STORAGE_KEY = "schcat.portfolio.v1";
export const PORTFOLIO_SCHEMA_VERSION = 1;
export const PORTFOLIO_TIMEFRAMES: readonly ChartTimeframe[] = ["1W", "1D", "1H", "5m"];

export interface PortfolioHolding {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
}

export interface PortfolioHoldingMetrics {
  invested: number;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
}

export interface PortfolioSummary {
  holdingCount: number;
  invested: number;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
}

export interface PortfolioCandle {
  time: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PortfolioImportResult {
  holdings: PortfolioHolding[];
  format: "json" | "csv";
}

function finitePositive(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(field + " must be a finite number greater than zero.");
  }
  return number;
}

export function normalizePortfolioSymbol(value: unknown): string {
  const symbol = String(value ?? "").trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9&._-]{1,40}$/.test(symbol)) {
    throw new TypeError("Enter a valid stock symbol (letters, numbers, . _ & or -).");
  }
  return symbol;
}

export function createPortfolioHolding(
  symbol: unknown,
  quantity: unknown,
  buyPrice: unknown,
  id = "holding-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
): PortfolioHolding {
  return {
    id,
    symbol: normalizePortfolioSymbol(symbol),
    quantity: finitePositive(quantity, "Quantity"),
    buyPrice: finitePositive(buyPrice, "Buy price")
  };
}

export function validatePortfolioHoldings(value: unknown): PortfolioHolding[] {
  if (!Array.isArray(value)) throw new TypeError("Portfolio data must be an array of holdings.");
  const seen = new Set<string>();
  const symbols = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new TypeError("Holding " + (index + 1) + " is invalid.");
    const row = (Array.isArray(item)
      ? { symbol: item[0], quantity: item[1], buyPrice: item[2] }
      : item) as Record<string, unknown>;
    const symbol = normalizePortfolioSymbol(row.symbol ?? row.stock ?? row.Stock);
    const quantity = finitePositive(row.quantity ?? row.qty ?? row.Qty, "Quantity for " + symbol);
    const buyPrice = finitePositive(row.buyPrice ?? row.buy_price ?? row["Buy price"], "Buy price for " + symbol);
    if (symbols.has(symbol)) throw new TypeError("Duplicate portfolio symbol: " + symbol);
    symbols.add(symbol);
    const idValue = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "holding-" + (index + 1) + "-" + symbol;
    if (seen.has(idValue)) throw new TypeError("Duplicate holding ID: " + idValue);
    seen.add(idValue);
    return { id: idValue, symbol, quantity, buyPrice };
  });
}

export function calculateHoldingMetrics(
  holding: Pick<PortfolioHolding, "quantity" | "buyPrice">,
  currentPrice: number | null | undefined
): PortfolioHoldingMetrics {
  const invested = holding.quantity * holding.buyPrice;
  if (currentPrice === null || currentPrice === undefined || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { invested, currentValue: null, unrealizedPnl: null, unrealizedPnlPct: null };
  }
  const currentValue = holding.quantity * currentPrice;
  const unrealizedPnl = currentValue - invested;
  return { invested, currentValue, unrealizedPnl, unrealizedPnlPct: invested > 0 ? unrealizedPnl / invested * 100 : null };
}

export function calculatePortfolioSummary(
  holdings: PortfolioHolding[],
  prices: Readonly<Record<string, number | null | undefined>> = {}
): PortfolioSummary {
  const invested = holdings.reduce((sum, holding) => sum + holding.quantity * holding.buyPrice, 0);
  const hasAllPrices = holdings.length > 0 && holdings.every((holding) => {
    const price = prices[holding.symbol];
    return typeof price === "number" && Number.isFinite(price) && price > 0;
  });
  if (!hasAllPrices) {
    return { holdingCount: holdings.length, invested, currentValue: null, unrealizedPnl: null, unrealizedPnlPct: null };
  }
  const currentValue = holdings.reduce((sum, holding) => sum + holding.quantity * (prices[holding.symbol] as number), 0);
  const unrealizedPnl = currentValue - invested;
  return {
    holdingCount: holdings.length,
    invested,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPct: invested > 0 ? unrealizedPnl / invested * 100 : null
  };
}

function parseCsvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new TypeError("CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parsePortfolioImport(source: string, filename = "portfolio.json"): PortfolioImportResult {
  const trimmed = source.replace(/^\\uFEFF/, "").trim();
  if (!trimmed) throw new TypeError("The selected file is empty.");
  const isJson = filename.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{");
  if (isJson) {
    let parsed: unknown;
    try { parsed = JSON.parse(trimmed); }
    catch { throw new TypeError("The selected JSON file is not valid JSON."); }
    const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    if (root && root.version !== undefined && root.version !== PORTFOLIO_SCHEMA_VERSION) {
      throw new TypeError("Unsupported portfolio JSON version: " + String(root.version));
    }
    const list = Array.isArray(parsed) ? parsed : root?.holdings;
    return { holdings: validatePortfolioHoldings(list), format: "json" };
  }

  const rows = parseCsvRows(trimmed);
  if (rows.length < 2) throw new TypeError("CSV must contain a header and at least one holding.");
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const symbolIndex = find(["symbol", "stock", "ticker"]);
  const quantityIndex = find(["quantity", "qty", "shares"]);
  const buyIndex = find(["buyprice", "purchaseprice", "averagebuyprice", "costprice"]);
  if ([symbolIndex, quantityIndex, buyIndex].some((index) => index < 0)) {
    throw new TypeError("CSV needs Symbol/Stock, Quantity/Qty and Buy Price columns.");
  }
  const holdings = rows.slice(1).map((row, index) => createPortfolioHolding(
    row[symbolIndex], row[quantityIndex], row[buyIndex], "import-" + (index + 1) + "-" + normalizePortfolioSymbol(row[symbolIndex])
  ));
  if (!holdings.length) throw new TypeError("CSV contains no holdings.");
  return { holdings, format: "csv" };
}

export function exportPortfolioJson(holdings: PortfolioHolding[]): string {
  return JSON.stringify({ version: PORTFOLIO_SCHEMA_VERSION, exportedAt: new Date().toISOString(), holdings }, null, 2);
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\\n\\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function exportPortfolioCsv(holdings: PortfolioHolding[]): string {
  const rows = [["Symbol", "Quantity", "Buy Price"], ...holdings.map((holding) => [
    holding.symbol, String(holding.quantity), String(holding.buyPrice)
  ])];
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/**
 * Reproduces Tabs/portfolioTab.py's synthetic portfolio OHLC:
 * qty * (stock OHLC - buy price), union of timestamps, forward-fill each
 * holding independently, fill its leading gaps with zero, then sum.
 * Volume is summed as in the desktop implementation.
 */
export function aggregatePortfolioCandles(
  holdings: PortfolioHolding[],
  seriesBySymbol: Readonly<Record<string, readonly ChartCandle[]>>,
  maxPoints = 800
): PortfolioCandle[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 1) throw new TypeError("maxPoints must be a positive integer.");
  const series = holdings.map((holding) => {
    const candles = [...(seriesBySymbol[holding.symbol] ?? [])]
      .filter((candle) => Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
      .sort((left, right) => left.time - right.time);
    return { holding, candles };
  }).filter((item) => item.candles.length > 0);
  const timestamps = [...new Set(series.flatMap((item) => item.candles.map((candle) => candle.time)))].sort((a, b) => a - b);
  if (!timestamps.length) return [];
  const totals: PortfolioCandle[] = timestamps.map((time) => ({
    time, date: new Date(time * 1000).toISOString().slice(0, 10),
    open: 0, high: 0, low: 0, close: 0, volume: 0
  }));
  for (const { holding, candles } of series) {
    let cursor = 0;
    let last: ChartCandle | null = null;
    for (const total of totals) {
      while (cursor < candles.length && candles[cursor].time <= total.time) {
        last = candles[cursor];
        cursor += 1;
      }
      if (!last) continue;
      total.open += holding.quantity * (last.open - holding.buyPrice);
      total.high += holding.quantity * (last.high - holding.buyPrice);
      total.low += holding.quantity * (last.low - holding.buyPrice);
      total.close += holding.quantity * (last.close - holding.buyPrice);
      total.volume += last.volume;
    }
  }
  return totals.slice(-maxPoints);
}

export function mergePortfolioHoldings(
  current: PortfolioHolding[],
  incoming: PortfolioHolding[]
): PortfolioHolding[] {
  const bySymbol = new Map(current.map((holding) => [holding.symbol, holding]));
  for (const holding of incoming) bySymbol.set(holding.symbol, holding);
  return [...bySymbol.values()];
}

export function formatPortfolioCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

export function formatPortfolioPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}
