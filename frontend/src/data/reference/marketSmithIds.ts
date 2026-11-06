export type MarketSmithIdMap = Readonly<Record<string, number>>;

export const MARKET_SMITH_IDS_URL = "/data/marketSmithIds.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

/**
 * Validate the public static MarketSmith symbol-to-ID reference dataset.
 *
 * The source map is consumed by CRIP4's chart adapter. This intentionally
 * does not normalize punctuation or aliases: legacy symbols such as
 * "BAJAJ - AUTO" must remain distinct from "BAJAJ-AUTO".
 */
export function parseMarketSmithIds(input: unknown): MarketSmithIdMap {
  if (!isRecord(input)) {
    throw new TypeError("MarketSmith ID data must be a JSON object");
  }

  const validated: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;

  for (const [symbol, id] of Object.entries(input)) {
    if (
      symbol.length === 0 ||
      symbol !== symbol.trim() ||
      symbol !== symbol.toUpperCase()
    ) {
      throw new TypeError(
        `MarketSmith symbol key is empty or not uppercase: "${symbol}"`
      );
    }

    if (!Number.isSafeInteger(id) || (id as number) <= 0) {
      throw new TypeError(
        `MarketSmith ID for "${symbol}" must be a positive safe integer`
      );
    }

    validated[symbol] = id as number;
  }

  if (Object.keys(validated).length === 0) {
    throw new RangeError("MarketSmith ID data cannot be empty");
  }

  return Object.freeze(validated);
}

/**
 * Return the MarketSmith instrument ID for an exact legacy symbol.
 * Only surrounding whitespace and case are normalized; punctuation is kept.
 */
export function getMarketSmithId(
  marketSmithIds: MarketSmithIdMap,
  symbol: string
): number | null {
  const key = symbol.trim().toUpperCase();
  return marketSmithIds[key] ?? null;
}

/** Fetch the public JSON asset from the static website. */
export async function loadMarketSmithIds(
  fetcher: typeof fetch = fetch,
  url = MARKET_SMITH_IDS_URL
): Promise<MarketSmithIdMap> {
  const response = await fetcher(url, {
    method: "GET",
    mode: "same-origin",
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(
      `Unable to load MarketSmith reference data (HTTP ${response.status})`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError("MarketSmith reference data is not valid JSON");
  }

  return parseMarketSmithIds(payload);
}
