import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const root = process.argv[2];
const output = process.argv[3];
if (!root || !output) {
  throw new Error("Usage: node audit-source-workbooks.mjs <source-repo> <output-json>");
}

const targets = [
  "data/marketsmithidsall4.xlsx",
  "data/Industrydata.xlsx",
  "data/Industrydata-2.xlsx"
];

function cellType(value) {
  if (value === null || value === undefined || value === "") return "blank";
  if (value instanceof Date) return "date";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

const reports = [];
for (const relativePath of targets) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    reports.push({ path: relativePath, status: "missing" });
    continue;
  }

  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });
    const populated = rows.filter((row) =>
      row.some((value) => value !== null && value !== "")
    );
    const firstRows = populated.slice(0, 5);
    const width = Math.max(0, ...populated.map((row) => row.length));
    const columns = Array.from({ length: width }, (_, columnIndex) => {
      const samples = populated
        .slice(0, Math.min(populated.length, 100))
        .map((row) => row[columnIndex] ?? null);
      const types = [...new Set(samples.map(cellType))].filter((type) => type !== "blank");
      return {
        index: columnIndex,
        header: populated[0]?.[columnIndex] ?? null,
        inferredTypes: types,
        nonBlankSampleCount: samples.filter((value) => value !== null && value !== "").length
      };
    });
    return {
      name: sheetName,
      populatedRows: populated.length,
      columnCount: width,
      columns,
      firstRows
    };
  });

  reports.push({
    path: relativePath,
    status: "read",
    fileBytes: fs.statSync(filePath).size,
    sheets
  });
}

fs.writeFileSync(output, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceRepository: "prudhviuday/SchCat",
  sourceRef: "main",
  workbooks: reports
}, null, 2) + "\n");
