export type WorkbookValue = string | number | null | undefined;
export type WorkbookCellKind = "text" | "money" | "number" | "percent" | "date";

export interface WorkbookColumn {
  header: string;
  width?: number;
  kind?: WorkbookCellKind;
}

export interface WorkbookRow {
  values: WorkbookValue[];
  kind?: "data" | "total" | "section";
}

export interface WorkbookSheet {
  name: string;
  title: string;
  subtitle?: string;
  metadata?: string;
  columns: WorkbookColumn[];
  rows: WorkbookRow[];
  autoFilter?: boolean;
  freezeRows?: number;
}

const encoder = new TextEncoder();
export const xml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const columnName = (column: number): string => {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

export const safeSheetName = (name: string): string => {
  const cleaned = name.split(String.fromCharCode(92)).join(" ").split("/").join(" ").split("*").join(" ").split("?").join(" ").split(":").join(" ").split("[").join(" ").split("]").join(" ").trim().replace(/^'+|'+$/g, "");
  return (cleaned || "Report").slice(0, 31);
};

export const cellStyle = (
  rowKind: WorkbookRow["kind"] | "title" | "subtitle" | "metadata" | "header" | "blank",
  columnKind: WorkbookCellKind = "text",
  alternate = false,
): number => {
  if (rowKind === "title") return 1;
  if (rowKind === "subtitle" || rowKind === "metadata") return 2;
  if (rowKind === "header") return 3;
  if (rowKind === "section") return 13;
  if (rowKind === "total") {
    if (columnKind === "money") return 8;
    if (columnKind === "number") return 9;
    if (columnKind === "percent") return 10;
    return 7;
  }
  if (columnKind === "date") return 6;
  if (columnKind === "money") return alternate ? 12 : 5;
  if (columnKind === "number") return 9;
  if (columnKind === "percent") return 10;
  return alternate ? 11 : 4;
};

export const buildCell = (
  reference: string,
  value: WorkbookValue,
  style: number,
): string => {
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}" s="${style}"/>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
};

export const buildWorksheet = (sheet: WorkbookSheet): string => {
  const colCount = Math.max(1, sheet.columns.length);
  const lastCol = columnName(colCount - 1);
  const rows: Array<{
    values: WorkbookValue[];
    kind: "title" | "subtitle" | "metadata" | "blank" | "header" | "data" | "total" | "section";
  }> = [
    { values: [sheet.title], kind: "title" },
    { values: [sheet.subtitle || ""], kind: "subtitle" },
    { values: [sheet.metadata || ""], kind: "metadata" },
    { values: [], kind: "blank" },
    { values: sheet.columns.map((column) => column.header), kind: "header" },
    ...sheet.rows.map((row) => ({ values: row.values, kind: row.kind || "data" })),
  ];

  const sheetRows = rows.map((row, index) => {
    const rowNumber = index + 1;
    const height = row.kind === "title" ? 32 : row.kind === "header" ? 26 : row.kind === "blank" ? 8 : 22;
    const cells = row.values.map((value, colIndex) => {
      const columnKind = sheet.columns[colIndex]?.kind || "text";
      const cellValue = columnKind === "date" && typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value)
        ? excelDateSerial(value)
        : value;
      const alternate = row.kind === "data" && rowNumber % 2 === 0;
      return buildCell(
        `${columnName(colIndex)}${rowNumber}`,
        cellValue,
        cellStyle(row.kind, columnKind, alternate),
      );
    }).join("");
    return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");

  const columns = sheet.columns.map((column, index) => {
    const width = Math.min(60, Math.max(9, column.width || 18));
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");

  const lastRow = Math.max(5, rows.length);
  const freezeRows = Math.max(0, Math.min(20, sheet.freezeRows ?? 5));
  const views = freezeRows > 0
    ? `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>`;
  const filter = sheet.autoFilter && rows.length > 5
    ? `<autoFilter ref="A5:${lastCol}${lastRow}"/>`
    : "";
  const merges = [
    `<mergeCell ref="A1:${lastCol}1"/>`,
    `<mergeCell ref="A2:${lastCol}2"/>`,
    `<mergeCell ref="A3:${lastCol}3"/>`,
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
${views}
<sheetFormatPr defaultRowHeight="22"/>
<cols>${columns}</cols>
<sheetData>${sheetRows}</sheetData>
${filter}
<mergeCells count="3">${merges}</mergeCells>
<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
};
