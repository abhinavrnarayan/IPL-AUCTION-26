"use client";

import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";

import { toErrorMessage } from "@/lib/utils";

async function readTabularRows(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const text = await file.text();
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          resolve(results.data);
        },
        error(err: Error) {
          reject(err);
        },
      });
    });
  }

  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
  }

  throw new Error("Only CSV and Excel files are supported.");
}

function normalizeTeams(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.trim(), value]),
      );

      return {
        name: String(normalizedRow.name ?? "").trim(),
        shortCode: normalizedRow.shortCode
          ? String(normalizedRow.shortCode).trim()
          : normalizedRow.short_code
            ? String(normalizedRow.short_code).trim()
            : null,
      };
    })
    .filter((team) => team.name);
}

function parseTextTeams(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Support "Team Name, SHORT" or just "Team Name"
      const commaIdx = line.lastIndexOf(",");
      if (commaIdx !== -1) {
        const name = line.slice(0, commaIdx).trim();
        const shortCode = line.slice(commaIdx + 1).trim().toUpperCase().slice(0, 6) || null;
        return { name, shortCode };
      }
      return { name: line, shortCode: null };
    })
    .filter((t) => t.name);
}

export function UploadTeamsForm({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [defaultPending, setDefaultPending] = useState(false);
  const [textPending, setTextPending] = useState(false);
  const [teamText, setTeamText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const rows = await readTabularRows(file);
      const teams = normalizeTeams(rows);

      const response = await fetch(`/api/rooms/${roomCode}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teams }),
      });

      const payload = (await response.json()) as {
        error?: string;
        imported?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Team upload failed.");
      }

      setMessage(`Imported ${payload.imported ?? teams.length} teams.`);
      router.refresh();
    } catch (uploadError) {
      setError(toErrorMessage(uploadError));
    } finally {
      setPending(false);
      event.target.value = "";
    }
  }

  async function handleLoadDefaults() {
    setDefaultPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/teams/default`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        imported?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load default teams.");
      }

      setMessage(`Loaded ${payload.imported ?? 10} default IPL teams.`);
      router.refresh();
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setDefaultPending(false);
    }
  }

  const anyPending = pending || defaultPending || textPending;

  async function handleTextSubmit() {
    const teams = parseTextTeams(teamText);

    if (teams.length === 0) {
      setError("Enter at least one team name.");
      return;
    }

    setTextPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams }),
      });

      const payload = (await response.json()) as {
        error?: string;
        imported?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Team creation failed.");
      }

      setMessage(`Created ${payload.imported ?? teams.length} teams.`);
      setTeamText("");
      router.refresh();
    } catch (textError) {
      setError(toErrorMessage(textError));
    } finally {
      setTextPending(false);
    }
  }

  return (
    <div className="form-grid">
      <button
        className="button secondary"
        disabled={anyPending}
        onClick={handleLoadDefaults}
        type="button"
      >
        {defaultPending ? "Loading..." : "Load default IPL teams (10)"}
      </button>

      <div className="subtle" style={{ textAlign: "center" }}>— or type team names —</div>

      <div className="field">
        <label htmlFor="teams-text">One team per line (optional: <span className="mono">Name, CODE</span>)</label>
        <textarea
          className="input"
          disabled={anyPending}
          id="teams-text"
          placeholder={"Alpha Kings, AK\nBeta Warriors\nGamma XI, GAM"}
          rows={5}
          style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.9rem" }}
          value={teamText}
          onChange={(e) => setTeamText(e.target.value)}
        />
      </div>
      <button
        className="button"
        disabled={anyPending || !teamText.trim()}
        onClick={handleTextSubmit}
        type="button"
      >
        {textPending ? "Creating..." : "Create teams from text"}
      </button>

      <div className="subtle" style={{ textAlign: "center" }}>— or upload a file —</div>

      <div className="field">
        <label htmlFor="teams-upload">Teams CSV/XLSX</label>
        <input
          className="input"
          disabled={anyPending}
          id="teams-upload"
          onChange={handleFile}
          type="file"
        />
      </div>
      <div className="subtle">
        Expected columns: <span className="mono">name</span> and optional{" "}
        <span className="mono">shortCode</span>.
      </div>
      {message ? <div className="notice">{message}</div> : null}
      {error ? <div className="notice warning">{error}</div> : null}
    </div>
  );
}
