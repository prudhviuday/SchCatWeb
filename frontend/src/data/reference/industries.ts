export interface IndustryList {
  schemaVersion: 1;
  industryCount: number;
  industries: string[];
}

export const INDUSTRIES_URL = "/data/industries.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseIndustryList(input: unknown): IndustryList {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    throw new TypeError("Industry list must be a schemaVersion 1 object");
  }
  if (!Array.isArray(input.industries)) {
    throw new TypeError("Industry list industries must be an array");
  }
  if (
    !Number.isSafeInteger(input.industryCount) ||
    input.industryCount !== input.industries.length
  ) {
    throw new RangeError("Industry list count does not match its entries");
  }

  const industries = input.industries.map((value, index) => {
    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value !== value.trim()
    ) {
      throw new TypeError(`Industry at index ${index} is invalid`);
    }
    return value;
  });

  if (new Set(industries).size !== industries.length) {
    throw new RangeError("Industry list contains duplicate labels");
  }

  return { schemaVersion: 1, industryCount: industries.length, industries };
}

export async function loadIndustryList(
  fetcher: typeof fetch = fetch,
  url = INDUSTRIES_URL
): Promise<IndustryList> {
  const response = await fetcher(url, {
    method: "GET",
    mode: "same-origin",
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Unable to load industry list (HTTP ${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError("Industry list response is not valid JSON");
  }
  return parseIndustryList(payload);
}
