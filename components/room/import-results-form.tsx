"use client";

import * as XLSX from "xlsx";
import { useRef, useState } from "react";

import { toErrorMessage } from "@/lib/utils";

interface PreviewData {
  teams: string[];
  soldTotal: number;
  unsoldTotal: number;
}

function previewWorkbook(file: File): Promise<PreviewData> {
  return file.arrayBuffer().then((buf) => {
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const unsoldSheetName =
      wb.SheetNames.find((n) =>
        ["Unsold Players", "XSell", "XSELL", "Unsold"].some(
          (candidate) => candidate.toLowerCase() === n.toLowerCase(),
        ),
      ) ?? null;
    const teamSheets = wb.SheetNames.filter((n) => n !== unsoldSheetName);

    let soldTotal = 0;
    for (const name of teamSheets) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
        header: 1,
        defval: "",
      });
      soldTotal += rows
        .slice(1)
        .filter((r) => typeof (r as unknown[])[0] === "number" && (r as unknown[])[1])
        .length;
    }

    const unsoldRows = unsoldSheetName && wb.Sheets[unsoldSheetName]
      ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[unsoldSheetName]!, {
          header: 1,
          defval: "",
        })
      : [];
    const unsoldTotal = unsoldRows
      .slice(1)
      .filter((r) => typeof (r as unknown[])[0] === "number" && (r as unknown[])[1]).length;

    return { teams: teamSheets, soldTotal, unsoldTotal };
  });
}

export function ImportResultsForm({ roomCode }: { roomCode: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;
    try {
      const data = await previewWorkbook(file);
      setPreview(data);
    } catch (err) {
      setError(`Could not read file: ${toErrorMessage(err)}`);
    }
  }

  async function handleImport() {
    if (!selectedFile || !preview) return;
    setPending(true);
    setResult(null);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", selectedFile);

      const res = await fetch(`/api/rooms/${roomCode}/import-results`, {
        method: "POST",
        body: form,
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        teams?: number;
        soldPlayers?: number;
        unsoldPlayers?: number;
        readyToContinue?: boolean;
        error?: string;
      };

      if (!res.ok) throw new Error(payload.error ?? "Import failed.");

      setResult(
        payload.readyToContinue
          ? `Imported ${payload.teams} teams, ${payload.soldPlayers} sold players, and ${payload.unsoldPlayers} remaining players. Room is ready to continue with the unsold pool.`
          : `Imported ${payload.teams} teams, ${payload.soldPlayers} sold players, ${payload.unsoldPlayers} unsold players. Auction marked as complete.`,
      );
      setSelectedFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="results-upload">Results XLSX</label>
        <input
          accept=".xlsx,.xls"
          className="input"
          disabled={pending}
          id="results-upload"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />
      </div>

      <div className="subtle">
        Upload a workbook where each sheet is a team (with columns{" "}
        <span className="mono">#, Player, Role, IPL Team, Price, Price (₹L)</span>
        ) and an <span className="mono">Unsold Players</span> or <span className="mono">XSell</span> sheet.
        Existing teams, players, and squads in this room will be replaced.
      </div>

      {preview && (
        <div
          className="notice"
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          <strong>Preview — ready to import</strong>
          <div>
            <span className="pill" style={{ marginRight: "0.4rem" }}>
              {preview.teams.length} teams
            </span>
            <span className="pill" style={{ marginRight: "0.4rem" }}>
              {preview.soldTotal} sold players
            </span>
            <span className="pill">{preview.unsoldTotal} unsold players</span>
          </div>
          <div className="subtle" style={{ fontSize: "0.8rem" }}>
            {preview.teams.join(" · ")}
          </div>
        </div>
      )}

      {result && <div className="notice success">{result}</div>}
      {error && <div className="notice warning">{error}</div>}

      <button
        className="button secondary"
        disabled={!selectedFile || !preview || pending}
        onClick={() => void handleImport()}
        type="button"
      >
        {pending ? "Importing…" : "Import results"}
      </button>
    </div>
  );
}
