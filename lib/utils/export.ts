/**
 * Client-side export helpers for Excel (XLSX) and CSV.
 *
 * Usage:
 *   exportToExcel(rows, columns, "player-stats");
 *   exportToCSV(rows, columns, "player-stats");
 *
 * Each function creates a file in-browser and triggers a download.
 */

export interface ExportColumn {
  key: string;
  header: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Download rows as a CSV file. */
export function exportToCSV(rows: Row[], columns: ExportColumn[], filename: string): void {
  const header = columns.map((c) => toCsvValue(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => toCsvValue(row[c.key])).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

/** Download rows as an Excel XLSX file. */
export async function exportToExcel(
  rows: Row[],
  columns: ExportColumn[],
  filename: string,
): Promise<void> {
  // Dynamic import so xlsx isn't bundled server-side
  const XLSX = (await import("xlsx")).default;

  const wsData = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => row[c.key] ?? "")),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Multi-sheet Excel export. Each entry becomes one worksheet. */
export async function exportToExcelMultiSheet(
  sheets: Array<{ name: string; rows: Row[]; columns: ExportColumn[] }>,
  filename: string,
): Promise<void> {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const wsData = [
      sheet.columns.map((c) => c.header),
      ...sheet.rows.map((row) => sheet.columns.map((c) => row[c.key] ?? "")),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)); // Excel sheet name limit
  }

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
