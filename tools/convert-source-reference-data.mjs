import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const sourceRoot = process.argv[2];
const targetRoot = process.argv[3] ?? process.cwd();
if (!sourceRoot) {
  throw new Error(
    "Usage: node tools/convert-source-reference-data.mjs <source-repo> [target-repo]"
  );
}

const sourceFiles = {
  marketUniverse: {
    path: "data/marketsmithidsall4.xlsx",
    blobSha: "162c0728380c98cee43bafaece8d06af78bab9bd"
  },
  industryList: {
    path: "data/Industrydata.xlsx",
    blobSha: "55d8fe19cd83105e8cc632c97de3e5bc345288b5"
  }
};

const expectedHeaders = [
  "StockSymbol",
  "InstrumentId",
  "MarketCap",
  "sector",
  "industry",
  "P/B",
  "ROCE",
  "Nik-Score"
];

function readRows(relativePath) {
  const fullPath = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Required source workbook is missing: ${relativePath}`);
  }
  const workbook = xlsx.readFile(fullPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheet found in ${relativePath}`);
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });
  return rows.filter((row) =>
    row.some((value) => value !== null && value !== "")
  );
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const valueText = String(value).trim();
  return valueText.length ? valueText : null;
}

function numberOrNull(value, field, symbol, diagnostics) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim().replaceAll(",", "");
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  diagnostics.invalidNumericFields.push({ symbol, field, value: String(value) });
  return null;
}

function instrumentIdOrNull(value, symbol, diagnostics) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  diagnostics.invalidInstrumentIds.push({ symbol, value: String(value) });
  return null;
}

function uniqueSorted(values) {
  const seen = new Set();
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" })
  );
}

const universeRows = readRows(sourceFiles.marketUniverse.path);
const headers = universeRows[0].map((value) => String(value ?? "").trim());
if (
  headers.length !== expectedHeaders.length ||
  headers.some((header, index) => header !== expectedHeaders[index])
) {
  throw new Error(
    `Unexpected market-universe schema: ${JSON.stringify(headers)}`
  );
}

const diagnostics = {
  invalidInstrumentIds: [],
  invalidNumericFields: [],
  duplicateSymbols: [],
  duplicateInstrumentIds: []
};

const seenSymbols = new Set();
const seenIds = new Map();
const records = [];

for (const row of universeRows.slice(1)) {
  const symbol = textOrNull(row[0])?.toUpperCase() ?? null;
  if (!symbol) continue;

  if (seenSymbols.has(symbol)) {
    diagnostics.duplicateSymbols.push(symbol);
  }
  seenSymbols.add(symbol);

  const instrumentId = instrumentIdOrNull(row[1], symbol, diagnostics);
  if (instrumentId !== null) {
    const previous = seenIds.get(instrumentId);
    if (previous) {
      diagnostics.duplicateInstrumentIds.push({
        instrumentId,
        symbols: [previous, symbol]
      });
    } else {
      seenIds.set(instrumentId, symbol);
    }
  }

  records.push({
    symbol,
    instrumentId,
    marketCap: numberOrNull(row[2], "marketCap", symbol, diagnostics),
    sector: textOrNull(row[3]),
    industry: textOrNull(row[4]),
    pb: numberOrNull(row[5], "pb", symbol, diagnostics),
    roce: numberOrNull(row[6], "roce", symbol, diagnostics),
    nikScore: numberOrNull(row[7], "nikScore", symbol, diagnostics)
  });
}

if (diagnostics.duplicateSymbols.length) {
  throw new Error(
    `Duplicate stock symbols found: ${diagnostics.duplicateSymbols.slice(0, 20).join(", ")}`
  );
}

const industryRows = readRows(sourceFiles.industryList.path);
const industryHeader = String(industryRows[0]?.[0] ?? "").trim();
if (industryHeader !== "Industry") {
  throw new Error(`Unexpected industry-list header: ${industryHeader}`);
}
const industriesFromWorkbook = uniqueSorted(
  industryRows.slice(1).map((row) => row[0])
);
const industriesFromUniverse = uniqueSorted(records.map((row) => row.industry));
const sectors = uniqueSorted(records.map((row) => row.sector));

const dataDir = path.join(targetRoot, "frontend", "public", "data");
fs.mkdirSync(dataDir, { recursive: true });

const universeAsset = {
  schemaVersion: 1,
  source: {
    repository: "prudhviuday/SchCat",
    path: sourceFiles.marketUniverse.path,
    blobSha: sourceFiles.marketUniverse.blobSha,
    snapshotDate: null
  },
  recordCount: records.length,
  freshness: "Static snapshot; source as-of date is not recorded.",
  records
};

const industriesAsset = {
  schemaVersion: 1,
  source: {
    repository: "prudhviuday/SchCat",
    path: sourceFiles.industryList.path,
    blobSha: sourceFiles.industryList.blobSha
  },
  industryCount: industriesFromWorkbook.length,
  industries: industriesFromWorkbook
};

fs.writeFileSync(
  path.join(dataDir, "marketUniverse.json"),
  JSON.stringify(universeAsset, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(dataDir, "industries.json"),
  JSON.stringify(industriesAsset, null, 2) + "\n"
);

const manifestPath = path.join(dataDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.datasets = [
  ...manifest.datasets.filter(
    (dataset) => !["marketUniverse", "industries"].includes(dataset.id)
  ),
  {
    id: "marketUniverse",
    path: "/data/marketUniverse.json",
    format: "array of stock reference records",
    records: records.length,
    sourceRepository: "prudhviuday/SchCat",
    sourcePath: sourceFiles.marketUniverse.path,
    sourceBlobSha: sourceFiles.marketUniverse.blobSha,
    sourceAsOfDate: null,
    fields: [
      "symbol",
      "instrumentId",
      "marketCap",
      "sector",
      "industry",
      "pb",
      "roce",
      "nikScore"
    ],
    freshnessWarning:
      "This is a static snapshot with no recorded as-of date. MarketCap, P/B, ROCE and NikScore may be stale and must not be presented as live metrics.",
    duplicateInstrumentIdCount: diagnostics.duplicateInstrumentIds.length,
    duplicateInstrumentIdWarnings: diagnostics.duplicateInstrumentIds
  },
  {
    id: "industries",
    path: "/data/industries.json",
    format: "unique industry-name list",
    records: industriesFromWorkbook.length,
    sourceRepository: "prudhviuday/SchCat",
    sourcePath: sourceFiles.industryList.path,
    sourceBlobSha: sourceFiles.industryList.blobSha,
    freshnessWarning:
      "Reference classification only; labels may be stale or differ from provider labels."
  }
];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const report = {
  recordCount: records.length,
  industryCount: industriesFromWorkbook.length,
  sectorCount: sectors.length,
  industriesNotInWorkbookList: industriesFromUniverse.filter(
    (industry) => !industriesFromWorkbook.includes(industry)
  ),
  workbookIndustriesNotInUniverse: industriesFromWorkbook.filter(
    (industry) => !industriesFromUniverse.includes(industry)
  ),
  invalidInstrumentIdCount: diagnostics.invalidInstrumentIds.length,
  invalidNumericFieldCount: diagnostics.invalidNumericFields.length,
  duplicateInstrumentIdCount: diagnostics.duplicateInstrumentIds.length,
  duplicateInstrumentIdWarnings: diagnostics.duplicateInstrumentIds,
  invalidInstrumentIdExamples: diagnostics.invalidInstrumentIds.slice(0, 20),
  invalidNumericExamples: diagnostics.invalidNumericFields.slice(0, 20)
};

fs.writeFileSync(
  path.join(dataDir, "conversion-report.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report, null, 2));
