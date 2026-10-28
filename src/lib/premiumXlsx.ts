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
const xml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const columnName = (column: number): string => {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const safeSheetName = (name: string): string => {
  const cleaned = name.split("\\\\").join(" ").replace(/[\\/:*?\\[\\]]/g, " ").trim().replace(/^'+|'+$/g, "");
  return (cleaned || "Report").slice(0, 31);
};

const cellStyle = (
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
  if (alternate && columnKind === "money") return 12;
  if (alternate) return 11;
  if (columnKind === "money") return 5;
  if (columnKind === "date") return 6;
  if (columnKind === "number") return 9;
  if (columnKind === "percent") return 10;
  return 4;
};

const buildCell = (
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

const buildWorksheet = (sheet: WorkbookSheet): string => {
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
      const alternate = row.kind === "data" && rowNumber % 2 === 0;
      return buildCell(
        `${columnName(colIndex)}${rowNumber}`,
        value,
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

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="&quot;Rs &quot;#,##0.00;[Red](&quot;Rs &quot;#,##0.00)"/>
<numFmt numFmtId="165" formatCode="#,##0.00;[Red](#,##0.00)"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><color rgb="FF25352E"/><name val="Aptos"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF66766E"/><name val="Aptos"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF14533D"/><name val="Aptos"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF14533D"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7F3EC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F7F5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFDCE5DF"/></left><right style="thin"><color rgb="FFDCE5DF"/></right><top style="thin"><color rgb="FFDCE5DF"/></top><bottom style="thin"><color rgb="FFDCE5DF"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE0E7E2"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zipStore = (files: Array<{ name: string; content: string }>): Uint8Array => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralDirectory = concatenate(centralParts);
  const localDirectory = concatenate(localParts);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralDirectory.length, true);
  view.setUint32(16, localDirectory.length, true);
  return concatenate([localDirectory, centralDirectory, end]);
};

const concatenate = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

export const buildPremiumXlsx = (sheets: WorkbookSheet[]): Uint8Array => {
  if (sheets.length === 0) throw new Error("Add at least one worksheet to export.");
  const used = new Set<string>();
  const cleanSheets = sheets.map((sheet) => {
    let name = safeSheetName(sheet.name);
    const base = name;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base.slice(0, 27)} ${suffix++}`;
    }
    used.add(name);
    return { ...sheet, name };
  });
  const sheetFiles = cleanSheets.map((sheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    content: buildWorksheet(sheet),
  }));
  const workbookSheets = cleanSheets.map((sheet, index) =>
    `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join("");
  const workbookRels = [
    ...cleanSheets.map((_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${cleanSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join("");
  const overrides = [
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    ...cleanSheets.map((_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`,
  ].join("");
  const now = new Date().toISOString();
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    { name: "xl/styles.xml", content: stylesXml },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(cleanSheets[0].title)}</dc:title><dc:creator>Shop Pro</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Shop Pro Reports</Application><TitlesOfParts><vt:vector size="${cleanSheets.length}" baseType="lpstr">${cleanSheets.map((sheet) => `<vt:lpstr>${xml(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`,
    },
    ...sheetFiles,
  ];
  return zipStore(files);
};

export const downloadPremiumXlsx = (sheets: WorkbookSheet[], fileName: string): void => {
  const bytes = buildPremiumXlsx(sheets);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.xlsx?$/i, "");
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName || "shop-pro-report"}.xlsx`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
