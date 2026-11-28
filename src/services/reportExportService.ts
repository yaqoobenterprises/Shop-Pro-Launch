import type { ReportsWorkbookInput } from "../components/reports/buildReportsWorkbook";
interface ExportResult { bytes: ArrayBuffer; fileName: string; error?: string }
function download({ bytes, fileName }: ExportResult) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Heavy workbook assembly and ZIP encoding leave the UI thread. */
export async function exportReportsWorkbook(input: ReportsWorkbookInput): Promise<void> {
  let worker: Worker;
  try {
    if (typeof Worker === "undefined") throw new Error("Worker unavailable");
    worker = new Worker(new URL("../workers/reportExport.worker.ts", import.meta.url), { type: "module" });
  } catch {
    const [{ buildReportsWorkbook }, { downloadPremiumXlsx }] = await Promise.all([import("../components/reports/buildReportsWorkbook"), import("../lib/premiumXlsx")]);
    const workbook = buildReportsWorkbook(input); downloadPremiumXlsx(workbook.sheets, workbook.fileName); return;
  }
  const result = await new Promise<ExportResult>((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("Workbook preparation timed out. Try a smaller date range.")); }, 90000);
    worker.onmessage = (event: MessageEvent<ExportResult>) => { clearTimeout(timer); worker.terminate(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error("The workbook could not be prepared. Please retry.")); };
    try { worker.postMessage(input); } catch (error) { clearTimeout(timer); worker.terminate(); reject(error); }
  });
  download(result);
}
