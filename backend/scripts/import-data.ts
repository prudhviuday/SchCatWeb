import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx";

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

const sourceRootArg = process.argv[2];
if (!sourceRootArg) {
  throw new Error('Usage: npm run data:import -- "C:\\path\\to\\SchCat"');
}

const sourceRoot = path.resolve(sourceRootArg);
const outputRoot = path.resolve("data-export");
const writtenKeys: string[] = [];

async function firstExisting(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    const fullPath = path.join(sourceRoot, candidate);
    try {
      await stat(fullPath);
      return fullPath;
    } catch {
      // Try the next historical path/casing.
    }
  }
  throw new Error(`Required source file not found. Tried: ${candidates.join(", ")}`);
}

async function readWorkbookRows(filePath: string, sheetName?: string): Promise<Row[]> {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const selectedName = sheetName
    ? workbook.SheetNames.find((name) => name.toLowerCase() === sheetName.toLowerCase())
    : workbook.SheetNames[0];
  if (!selectedName) {
    throw new Error(`Workbook ${path.basename(filePath)} does not contain sheet ${sheetName ?? "(first sheet)"}.`);
  }
  const sheet = workbook.Sheets[selectedName];
  return XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: null, raw: true });
}

function cleanHeader(value: Cell, index: number): string {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
}

function rowsAsObjects(rows: Row[]): { columns: string[]; rows: Record<string, Cell>[] } {
  const header = rows[0] ?? [];
  const columns = header.map(cleanHeader);
  const uniqueColumns = columns.map((name, index) =>
    columns.indexOf(name) === index ? name : `${name}_${index + 1}`
  );
  const records = rows.slice(1).filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""));
  return {
    columns: uniqueColumns,
    rows: records.map((row) => Object.fromEntries(uniqueColumns.map((column, index) => [column, row[index] ?? null])))
  };
}

async function writeJson(key: string, value: unknown): Promise<{ key: string; bytes: number }> {
  const fullPath = path.join(outputRoot, ...key.split("/"));
  await mkdir(path.dirname(fullPath), { recursive: true });
  const content = JSON.stringify(value, null, 2) + "\n";
  await writeFile(fullPath, content, "utf8");
  writtenKeys.push(key);
  return { key, bytes: Buffer.byteLength(content, "utf8") };
}

function nonEmptyRows(rows: Row[]): Row[] {
  return rows.filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""));
}

async function main() {
  await mkdir(outputRoot, { recursive: true });

  // The desktop app reads these exact positional fields from marketsmithidsall4.xlsx:
  // [0] symbol, [1] MarketSmith ID, [2] market cap, [4] industry,
  // [5] PB, [6] ROCE, [7] NikScore. Preserve the source row as well.
  const marketFile = await firstExisting([
    "data/marketsmithidsall4.xlsx",
    "Data/marketsmithidsall4.xlsx",
    "Manuals/marketsmithidsall4.xlsx"
  ]);
  const marketRows = nonEmptyRows(await readWorkbookRows(marketFile));
  const marketDataRows = marketRows.slice(1);
  const symbolToId: Record<string, number> = {};
  const stockMetadata: Record<string, Record<string, Cell>> = {};

  for (const row of marketDataRows) {
    const symbol = String(row[0] ?? "").trim();
    const id = Number(row[1]);
    if (!symbol || !Number.isFinite(id)) continue;
    symbolToId[symbol] = id;
    stockMetadata[symbol] = {
      marketSmithId: id,
      marketCap: row[2] ?? null,
      industry: row[4] ?? null,
      pb: row[5] ?? null,
      roce: row[6] ?? null,
      nikScore: row[7] ?? null,
      sourceRow: row
    };
  }

  if (Object.keys(symbolToId).length === 0) {
    throw new Error("No valid stock symbol / MarketSmith ID rows were found in marketsmithidsall4.xlsx.");
  }

  // Preserve the legacy query mapping: column index 1 -> column index 2.
  const queriesFile = await firstExisting(["data/ChartInkQs.xlsx", "Data/ChartInkQs.xlsx"]);
  const queryRows = await readWorkbookRows(queriesFile, "QUERIES");
  const queryDataRows = nonEmptyRows(queryRows).slice(1);
  const queryMap: Record<string, Cell> = {};
  for (const row of queryDataRows) {
    const name = String(row[1] ?? "").trim();
    if (name) queryMap[name] = row[2] ?? null;
  }

  const watchlistRows = await readWorkbookRows(queriesFile, "Watchlist");
  const watchlistTable = rowsAsObjects(watchlistRows);
  const watchlists: Record<string, Cell[]> = {};
  for (const column of watchlistTable.columns) {
    watchlists[column] = watchlistTable.rows.map((row) => row[column] ?? null);
  }

  const portfolioRows = await readWorkbookRows(queriesFile, "Portfolio");
  const portfolioHeader = portfolioRows[0] ?? [];
  const portfolio = {
    columns: portfolioHeader.map(cleanHeader),
    rows: nonEmptyRows(portfolioRows).slice(1)
  };

  const industryFile = await firstExisting(["data/Industrydata.xlsx", "Data/Industrydata.xlsx"]);
  const industryRows = await readWorkbookRows(industryFile);
  const industryTable = rowsAsObjects(industryRows);
  const industryColumn = industryTable.columns.find((column) => column.toLowerCase() === "industry");
  const industries = industryColumn
    ? [...new Set(industryTable.rows.map((row) => String(row[industryColumn] ?? "").trim()).filter(Boolean))]
    : [];

  const industryDir = await firstExisting(["data/IndustryAnalysis", "Data/IndustryAnalysis"]);
  const industryFiles = (await readdir(industryDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^industry_.*\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const industryIndex: { fileName: string; key: string; bytes: number }[] = [];

  for (const fileName of industryFiles) {
    const sourcePath = path.join(industryDir, fileName);
    const raw = await readFile(sourcePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`Industry analysis file must contain a JSON array: ${fileName}`);
    }
    const result = await writeJson(`industry-analysis/files/${fileName}`, parsed);
    industryIndex.push({ fileName, key: `data/${result.key}`, bytes: result.bytes });
  }

  const marketIdsResult = await writeJson("market-ids.json", {
    count: Object.keys(symbolToId).length,
    symbolToId
  });
  const stockMetadataResult = await writeJson("stock-metadata.json", {
    count: Object.keys(stockMetadata).length,
    stocks: stockMetadata
  });
  const queriesResult = await writeJson("queries.json", {
    columns: (queryRows[0] ?? []).map(cleanHeader),
    rows: queryDataRows,
    queryMap
  });
  const watchlistsResult = await writeJson("watchlists.json", {
    columns: watchlistTable.columns,
    rows: watchlistTable.rows,
    watchlists
  });
  const portfolioResult = await writeJson("portfolio.json", portfolio);
  const industriesResult = await writeJson("industries.json", {
    count: industries.length,
    industries,
    columns: industryTable.columns,
    rows: industryTable.rows
  });
  const indexResult = await writeJson("industry-analysis/index.json", {
    count: industryIndex.length,
    files: industryIndex
  });

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "SchCat desktop repository",
    datasets: {
      marketIds: { key: "data/market-ids.json", count: Object.keys(symbolToId).length },
      stockMetadata: { key: "data/stock-metadata.json", count: Object.keys(stockMetadata).length },
      queries: { key: "data/queries.json", count: queryDataRows.length },
      watchlists: { key: "data/watchlists.json", count: watchlistTable.columns.length },
      portfolio: { key: "data/portfolio.json", count: portfolio.rows.length },
      industries: { key: "data/industries.json", count: industries.length },
      industryAnalysis: { key: "data/industry-analysis/index.json", count: industryIndex.length }
    },
    files: [
      marketIdsResult, stockMetadataResult, queriesResult, watchlistsResult,
      portfolioResult, industriesResult, indexResult,
      ...industryIndex.map((item) => ({ key: item.key.replace(/^data\//, ""), bytes: item.bytes }))
    ]
  };
  await writeJson("manifest.json", manifest);

  const uploadScript = [
    '$ErrorActionPreference = "Stop"',
    '$bucket = "schcat-data"',
    '$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
    'Get-ChildItem -Path $root -Recurse -File | Where-Object { $_.Name -ne "upload-to-r2.ps1" } | ForEach-Object {',
    '  $relative = $_.FullName.Substring($root.Length + 1).Replace("\\", "/")',
    '  $key = "data/" + $relative',
    '  Write-Host "Uploading $key"',
    '  & npx wrangler r2 object put "$bucket/$key" --file "$($_.FullName)" --remote',
    '  if ($LASTEXITCODE -ne 0) { throw "R2 upload failed for $key" }',
    '}',
    'Write-Host "All SchCat datasets uploaded to R2."'
  ].join("\r\n") + "\r\n";
  await writeFile(path.join(outputRoot, "upload-to-r2.ps1"), uploadScript, "utf8");

  console.log("SchCat data import completed.");
  console.log(`Source: ${sourceRoot}`);
  console.log(`Output: ${outputRoot}`);
  console.log(`Stocks: ${Object.keys(symbolToId).length}`);
  console.log(`Queries: ${queryDataRows.length}`);
  console.log(`Watchlists: ${watchlistTable.columns.length}`);
  console.log(`Portfolio rows: ${portfolio.rows.length}`);
  console.log(`Industries: ${industries.length}`);
  console.log(`Industry analysis JSON files: ${industryIndex.length}`);
  console.log("Next: create the R2 bucket, then run .\\data-export\\upload-to-r2.ps1 from the backend folder.");
}

await main();
