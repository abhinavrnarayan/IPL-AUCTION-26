"use client";

import { useRef, useState } from "react";

interface ImportButtonProps {
  /** Accepts: CSV, XLSX, or both. Defaults to both. */
  accept?: string;
  /** Called with the selected File. Caller handles parsing + upload. */
  onFile: (file: File) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}

export function ImportButton({
  accept = ".csv,.xlsx",
  onFile,
  label,
  disabled,
}: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      await onFile(file);
    } finally {
      setLoading(false);
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <button
        className="btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        title="Import data from CSV or Excel"
        style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
      >
        {/* Upload icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 10V2M5 5l3-3 3 3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {loading ? "Importing…" : (label ?? "Import")}
      </button>
    </>
  );
}
