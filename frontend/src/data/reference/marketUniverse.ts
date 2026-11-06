export interface MarketUniverseRecord {
  symbol: string;
  instrumentId: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  pb: number | null;
  roce: number | null;
  nikScore: number | null;
}

export interface MarketUniverse {
  schemaVersion: 1;
  recordCount: number;
  freshness: string;
  records: MarketUniverseRecord[];
}

export const MARKET_UNIVERSE_URL = "/data/marketUniverse.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nullableNumber(
  value: unknown,
  field: string,
  symbol: string
): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new TypeError(`Market universe ${field} for ${symbol} must be numeric or null`);
}

function nullableText(
  value: unknown,
  field: string,
  symbol: string
): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new TypeError(`Market universe ${field} for ${symbol} must be text or null`);
}

/**
 * Validate and parse the static workbook export. Duplicate instrument IDs are
 * intentionally allowed: the source workbook has two shared-ID pairs and
 * those warnings are preserved in the data manifest/conversion report.
 */
export function parseMarketUniverse(input: unknown): MarketUniverse {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    throw new TypeError("Market universe must be a schemaVersion 1 object");
  }
  if (!Array.isArray(input.records)) {
    throw new TypeError("Market universe records must be an array");
  }
  if (
    !Number.isSafeInteger(input.recordCount) ||
    input.recordCount !== input.records.length
  ) {
    throw new RangeError("Market universe recordCount does not match its records");
  }
  if (typeof input.freshness !== "string" || input.freshness.length === 0) {
    throw new TypeError("Market universe freshness warning is required");
  }

  const seenSymbols = new Set<string>();
  const records = input.records.map((raw, index): MarketUniverseRecord => {
    if (!isRecord(raw)) {
      throw new TypeError(`Market universe row ${index} must be an object`);
    }

    const symbol = raw.symbol;
    if (
      typeof symbol !== "string" ||
      symbol.length === 0 ||
      symbol !== symbol.trim() ||
      symbol !== symbol.toUpperCase()
    ) {
      throw new TypeError(`Market universe row ${index} has an invalid symbol`);
    }
    if (seenSymbols.has(symbol)) {
      throw new RangeError(`Duplicate market universe symbol: ${symbol}`);
    }
    seenSymbols.add(symbol);

    const instrumentId = raw.instrumentId;
    if (
      instrumentId !== null &&
      (!Number.isSafeInteger(instrumentId) || (instrumentId as number) <= 0)
    ) {
      throw new TypeError(`Market universe instrumentId for ${symbol} is invalid`);
    }

    return {
      symbol,
      instrumentId: instrumentId as number | null,
      marketCap: nullableNumber(raw.marketCap, "marketCap", symbol),
      sector: nullableText(raw.sector, "sector", symbol),
      industry: nullableText(raw.industry, "industry", symbol),
      pb: nullableNumber(raw.pb, "pb", symbol),
      roce: nullableNumber(raw.roce, "roce", symbol),
      nikScore: nullableNumber(raw.nikScore, "nikScore", symbol)
    };
  });

  return {
    schemaVersion: 1,
    recordCount: records.length,
    freshness: input.freshness,
    records
  };
}

export async function loadMarketUniverse(
  fetcher: typeof fetch = fetch,
  url = MARKET_UNIVERSE_URL
): Promise<MarketUniverse> {
  const response = await fetcher(url, {
    method: "GET",
    mode: "same-origin",
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Unable to load market universe (HTTP ${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError("Market universe response is not valid JSON");
  }
  return parseMarketUniverse(payload);
}
