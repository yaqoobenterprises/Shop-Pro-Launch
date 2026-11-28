import { buildReportsWorkbook, type ReportsWorkbookInput } from "../components/reports/buildReportsWorkbook";
import { buildPremiumXlsx } from "../lib/premiumXlsx";
self.onmessage = (event: MessageEvent<ReportsWorkbookInput>) => {
  try {
    const workbook = buildReportsWorkbook(event.data);
    const bytes = buildPremiumXlsx(workbook.sheets);
    const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
    self.postMessage({ bytes: buffer, fileName: workbook.fileName }, { transfer: [buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "The workbook could not be created." }); }
};
