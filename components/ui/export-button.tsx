"use client";

import { useEffect, useRef, useState } from "react";

import { exportToCSV, exportToExcel, type ExportColumn } from "@/lib/utils/export";

interface ExportButtonProps {
  getData: () => Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
  columns: ExportColumn[];
  filename: string;
  label?: string;
}

export function ExportButton({ getData, columns, filename, label }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleExport(format: "csv" | "excel") {
    setLoading(true);
    setOpen(false);
    try {
      const rows = await getData();
      if (format === "csv") {
        exportToCSV(rows, columns, filename);
      } else {
        await exportToExcel(rows, columns, filename);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={ref} className="export-button-wrap">
      <button
        className="results-export-trigger"
        disabled={loading}
        onClick={() => setOpen((value) => !value)}
        title="Export data"
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 2v8M5 7l3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {loading ? "Exporting..." : label ?? "Export"}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="results-export-caret">
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </button>

      {open ? (
        <div className="results-export-menu">
          <button className="export-menu-item" onClick={() => handleExport("csv")} style={menuItemStyle}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <path d="M5 7h6M5 10h4" strokeLinecap="round" />
            </svg>
            Export to CSV
          </button>
          <button className="export-menu-item" onClick={() => handleExport("excel")} style={menuItemStyle}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ flexShrink: 0 }}>
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <path d="M5 5.5l6 5M11 5.5l-6 5" strokeLinecap="round" />
            </svg>
            Export to Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  padding: "0.55rem 1rem",
  background: "none",
  border: "none",
  color: "var(--text, #e8e8f0)",
  fontSize: "0.82rem",
  cursor: "pointer",
  textAlign: "left",
  transition: "background 0.15s",
};
