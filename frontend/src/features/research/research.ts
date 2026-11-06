export interface ResearchQuery {
  name: string;
  code: string;
}

export interface ResearchMatchSet {
  queryName: string;
  symbols: string[];
}

export interface ResearchResult {
  query: string;
  matches: number;
  total: number;
  queryStocks: number;
  matchPercent: number;
  status: "ready" | "empty-query" | "missing-history";
}

export interface ResearchInputs {
  performanceSymbols: readonly string[];
  queries: readonly ResearchQuery[];
  historyByQuery: ReadonlyMap<string, readonly string[]>;
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

function canonicalHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase();
}

export function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const symbol = String(value).trim().toUpperCase();
  return symbol.length > 0 ? symbol : null;
}

export function uniqueSymbols(values: readonly unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const symbol = normalizeSymbol(value);
    if (symbol) result.add(symbol);
  }
  return [...result];
}

/**
 * Small RFC-4180-style CSV parser suitable for user-provided research sheets.
 * It supports quoted commas, escaped quotes, CRLF, LF, and BOM-prefixed headers.
 */
export function parseCsvTable(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += char;
    }
  }

  if (quoted) throw new TypeError("CSV contains an unterminated quoted field");

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) throw new TypeError("CSV file is empty");

  const headers = rows[0].map((value) => value.trim());
  if (headers.some((header) => header.length === 0)) {
    throw new TypeError("CSV header row contains an empty column name");
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const header of headers) {
    const key = canonicalHeader(header);
    if (seen.has(key)) duplicates.add(header);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    throw new RangeError("CSV contains duplicate column names");
  }

  const dataRows = rows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length) {
      throw new RangeError(`CSV row ${rowIndex + 2} has more values than the header`);
    }
    return [...values, ...Array(Math.max(0, headers.length - values.length)).fill("")];
  });

  return { headers, rows: dataRows };
}

function columnIndices(headers: readonly string[], candidates: readonly string[]): number[] {
  const byName = new Map(headers.map((header, index) => [canonicalHeader(header), index]));
  return candidates
    .map((candidate) => byName.get(candidate.toLocaleLowerCase()))
    .filter((index): index is number => index !== undefined);
}

function firstNonEmptyCell(row: readonly string[], indices: readonly number[]): string {
  for (const index of indices) {
    const value = row[index]?.trim() ?? "";
    if (value) return value;
  }
  return "";
}

export function parsePerformanceCsv(input: string): string[] {
  const table = parseCsvTable(input);
  const symbolColumns = columnIndices(table.headers, ["symbol", "stock"]);
  if (symbolColumns.length === 0) {
    throw new TypeError("Performance CSV must contain a 'symbol' or 'Stock' column");
  }

  const symbolColumn = symbolColumns[0];
  const symbols = uniqueSymbols(table.rows.map((row) => row[symbolColumn]));
  if (symbols.length === 0) {
    throw new RangeError("Performance CSV contains no usable stock symbols");
  }
  return symbols;
}

export function parseQueriesCsv(input: string): ResearchQuery[] {
  const table = parseCsvTable(input);
  const nameColumns = columnIndices(table.headers, ["queryname", "name"]);
  const codeColumns = columnIndices(table.headers, ["querycode", "query"]);
  if (nameColumns.length === 0 || codeColumns.length === 0) {
    throw new TypeError("Queries CSV must contain QueryName/Name and QueryCode/Query columns");
  }

  const queries = table.rows.map((row) => ({
    name: firstNonEmptyCell(row, nameColumns) || "Unnamed",
    code: firstNonEmptyCell(row, codeColumns)
  })).filter((query) => query.code.length > 0);

  if (queries.length === 0) {
    throw new RangeError("Queries CSV contains no rows with a query code");
  }

  const names = new Set<string>();
  for (const query of queries) {
    const key = query.name.toLocaleLowerCase();
    if (names.has(key)) {
      throw new RangeError(`Duplicate query name: ${query.name}`);
    }
    names.add(key);
  }

  return queries;
}

function parseMatchSet(value: unknown, queryName: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Historical matches for "${queryName}" must be an array of symbols`);
  }
  return uniqueSymbols(value);
}

/**
 * Accept either a simple JSON map:
 *   { "Query A": ["TCS", "INFY"] }
 * or an array:
 *   [{ "queryName": "Query A", "symbols": ["TCS", "INFY"] }]
 */
export function parseHistoricalMatchesJson(input: unknown): ResearchMatchSet[] {
  const entries: Array<[string, unknown]> = [];

  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    for (const [name, symbols] of Object.entries(input as Record<string, unknown>)) {
      entries.push([name, symbols]);
    }
  } else if (Array.isArray(input)) {
    for (const [index, item] of input.entries()) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        throw new TypeError(`Historical result row ${index + 1} must be an object`);
      }
      const record = item as Record<string, unknown>;
      const name = record.queryName ?? record.QueryName ?? record.name ?? record.Name;
      const symbols = record.symbols ?? record.stocks ?? record.Stock;
      if (typeof name !== "string" || name.trim() === "") {
        throw new TypeError(`Historical result row ${index + 1} has no queryName`);
      }
      entries.push([name, symbols]);
    }
  } else {
    throw new TypeError("Historical matches JSON must be an object or an array");
  }

  if (entries.length === 0) throw new RangeError("Historical matches JSON contains no query results");

  const seen = new Set<string>();
  return entries.map(([name, symbols]) => {
    const queryName = name.trim();
    const key = queryName.toLocaleLowerCase();
    if (!queryName) throw new TypeError("Historical result query name cannot be empty");
    if (seen.has(key)) throw new RangeError(`Duplicate historical query result: ${queryName}`);
    seen.add(key);
    return { queryName, symbols: parseMatchSet(symbols, queryName) };
  });
}

/**
 * Preserve the desktop ResearchTab's calculation:
 * Matches = |performance symbols ∩ historical query symbols|
 * Total = number of unique performance symbols (displayed column)
 * Match % = Matches / number of unique historical query symbols × 100
 *
 * The desktop's percentage denominator and displayed Total are intentionally
 * different. A failed/missing query history is reported as unavailable rather
 * than being misrepresented as a genuine 0% result.
 */
function roundLikePython(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const lower = Math.floor(scaled);
  const fraction = scaled - lower;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;
  const rounded = Math.abs(fraction - 0.5) <= tolerance
    ? (lower % 2 === 0 ? lower : lower + 1)
    : Math.round(scaled);
  return rounded / factor;
}

export function evaluateResearch(inputs: ResearchInputs): ResearchResult[] {
  const performanceSymbols = new Set(uniqueSymbols(inputs.performanceSymbols));
  const total = performanceSymbols.size;

  return inputs.queries.map((query) => {
    const nameKey = query.name.toLocaleLowerCase();
    const historyEntry = [...inputs.historyByQuery.entries()]
      .find(([name]) => name.trim().toLocaleLowerCase() === nameKey);

    if (!query.code.trim()) {
      return {
        query: query.name,
        matches: 0,
        total,
        queryStocks: 0,
        matchPercent: 0,
        status: "empty-query"
      };
    }

    if (!historyEntry) {
      return {
        query: query.name,
        matches: 0,
        total,
        queryStocks: 0,
        matchPercent: 0,
        status: "missing-history"
      };
    }

    const historySymbols = new Set(uniqueSymbols(historyEntry[1]));
    let matches = 0;
    for (const symbol of historySymbols) {
      if (performanceSymbols.has(symbol)) matches += 1;
    }

    const matchPercent = historySymbols.size > 0
      ? roundLikePython((matches / historySymbols.size) * 100, 2)
      : 0;

    return {
      query: query.name,
      matches,
      total,
      queryStocks: historySymbols.size,
      matchPercent,
      status: "ready"
    };
  });
}

export function serializeResearchResultsCsv(results: readonly ResearchResult[]): string {
  const headers = ["Query", "Matches", "Total", "Query Stocks", "Match %", "Status"];
  const escape = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  return [
    headers.map(escape).join(","),
    ...results.map((result) => [
      result.query,
      result.matches,
      result.total,
      result.queryStocks,
      result.matchPercent.toFixed(2),
      result.status
    ].map(escape).join(","))
  ].join("\r\n");
}

export function createHistoricalMatchesTemplate(queries: readonly ResearchQuery[]): string {
  const template = Object.fromEntries(
    queries.map((query) => [query.name, [] as string[]])
  );
  return JSON.stringify(template, null, 2);
}
