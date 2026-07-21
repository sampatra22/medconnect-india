"use client";

import { useRef, useState } from "react";
import {
  detectColumns,
  findHeaderRow,
  htmlTableToGrid,
  looksLikeHtml,
  normName,
} from "@/lib/import-parse";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import UI. The MR drops in the Excel/CSV their company portal exports;
// the file is parsed HERE in the browser (SheetJS, loaded on demand so the
// dashboard bundle stays lean) — it never travels to our server. What travels
// is clean JSON rows, after the MR has seen exactly what will be created.
//
// Column mapping is auto-detected from the header row against the names
// portals actually use ("Doctor Name", "Speciality", "Mobile No"…). Rows are
// pre-classified: New / Already listed / Missing name. No AI — the parking-lot
// spec is right that structured files need none.
// ─────────────────────────────────────────────────────────────────────────────

type ExistingDoctor = { name: string; hospital?: string };

type ParsedRow = {
  idx: number;
  data: Record<string, string>;
  status: "new" | "duplicate" | "invalid";
};

export function DoctorBulkImport({
  existing,
  onDone,
  onClose,
}: {
  existing: ExistingDoctor[];
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<{ created: number; duplicates: number; invalid: number } | null>(null);

  async function handleFile(file: File) {
    setParseError("");
    setSummary(null);
    setRows([]);
    setFileName(file.name);
    try {
      // Many portal ".xls" files are actually saved HTML pages. Sniff the
      // text first: if it's HTML we parse the real <table> ourselves; only
      // genuine spreadsheets pay for the SheetJS load (~200KB, on demand).
      let grid: string[][];
      const text = await file.text();
      if (looksLikeHtml(text)) {
        grid = htmlTableToGrid(text);
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer());
        const sheet = wb.Sheets[wb.SheetNames[0]];
        grid = (
          XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][]
        ).map((row) => row.map((c) => String(c ?? "")));
      }
      if (!grid.length) throw new Error("The file looks empty.");

      // The header is rarely row one — portals put report titles above it.
      const found = findHeaderRow(grid);
      if (!found) {
        throw new Error(
          "Couldn't find a doctor-name column anywhere in the first rows. The sheet should have a header row with columns like 'Doctor Name', 'Specialty', 'Address', 'Phone'."
        );
      }
      const { row: headerRow, colMap } = found;
      const headers = grid[headerRow];
      setDetected(
        Object.entries(colMap).map(([i, f]) => `${headers[Number(i)] || "?"} → ${f.replace(/_/g, " ")}`)
      );

      const known = new Set(
        existing.map((d) => `${normName(d.name)}|${(d.hospital ?? "").toLowerCase().trim()}`)
      );
      const inFile = new Set<string>();
      const parsed: ParsedRow[] = [];

      for (let r = headerRow + 1; r < Math.min(grid.length, headerRow + 501); r++) {
        const line = grid[r] as unknown[];
        if (!line || line.every((c) => !String(c ?? "").trim())) continue;
        const data: Record<string, string> = {};
        for (const [i, field] of Object.entries(colMap)) {
          data[field] = String(line[Number(i)] ?? "").trim();
        }
        // "City" columns fold into the address the way our data expects
        // ("Salt Lake, Kolkata") instead of being silently dropped.
        if (data.city) {
          data.chamber_address = [data.chamber_address, data.city].filter(Boolean).join(", ");
          delete data.city;
        }
        const idx = parsed.length;
        if (!data.name || !normName(data.name)) {
          parsed.push({ idx, data, status: "invalid" });
          continue;
        }
        const key = `${normName(data.name)}|${(data.hospital ?? "").toLowerCase().trim()}`;
        if (known.has(key) || inFile.has(key)) {
          parsed.push({ idx, data, status: "duplicate" });
        } else {
          inFile.add(key);
          parsed.push({ idx, data, status: "new" });
        }
      }
      if (!parsed.length) throw new Error("No data rows found under the header row.");
      setRows(parsed);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not read this file.");
    }
  }

  async function runImport() {
    const toSend = rows.filter((r) => r.status === "new").map((r) => r.data);
    if (!toSend.length) return;
    setImporting(true);
    let created = 0, duplicates = 0, invalid = 0;
    try {
      // 100-row batches keep each request inside the serverless time budget.
      for (let i = 0; i < toSend.length; i += 100) {
        setProgress(`Importing ${Math.min(i + 100, toSend.length)} of ${toSend.length}…`);
        const res = await fetch("/api/doctors/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: toSend.slice(i, i + 100) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setParseError(data.error || "Import failed part-way — already-imported rows are safe.");
          break;
        }
        created += data.created ?? 0;
        duplicates += data.duplicates ?? 0;
        invalid += data.invalid ?? 0;
      }
      setSummary({ created, duplicates, invalid });
      await onDone();
    } finally {
      setImporting(false);
      setProgress("");
    }
  }

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  const CHIP: Record<ParsedRow["status"], string> = {
    new: "bg-emerald-100 text-emerald-700",
    duplicate: "bg-gray-100 text-gray-500",
    invalid: "bg-red-100 text-red-600",
  };
  const CHIP_LABEL: Record<ParsedRow["status"], string> = {
    new: "New",
    duplicate: "Already listed",
    invalid: "No name",
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-5 shadow-xl">
        <div className="text-lg font-bold">Import doctor list</div>
        <p className="mt-1 text-sm text-slate-500">
          Upload the CSV or Excel your company portal exports. Nothing goes
          public from here — imported doctors wait for consent and admin
          approval, exactly like ones you add by hand.
        </p>

        {summary ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-bold text-emerald-800">
              ✅ {summary.created} doctor{summary.created === 1 ? "" : "s"} imported
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              {summary.duplicates > 0 ? `${summary.duplicates} skipped as already listed. ` : ""}
              {summary.invalid > 0 ? `${summary.invalid} skipped without a name. ` : ""}
              They&apos;re on your list now — collect each doctor&apos;s consent on your
              visits, then an admin approves them for the public directory.
            </p>
            <button
              onClick={onClose}
              className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-6 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                {fileName ? `📄 ${fileName} — choose a different file` : "📄 Choose CSV / Excel file"}
              </button>
              {parseError ? (
                <p className="mt-2 text-sm font-medium text-red-600">{parseError}</p>
              ) : null}
              {detected.length > 0 && !parseError ? (
                <p className="mt-2 text-[11px] text-slate-400">
                  Detected columns: {detected.join(" · ")}
                </p>
              ) : null}
            </div>

            {rows.length > 0 ? (
              <>
                <div className="mt-3 flex gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{counts.new} new</span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-500">{counts.duplicate} already listed</span>
                  {counts.invalid > 0 ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-600">{counts.invalid} without name</span>
                  ) : null}
                </div>
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
                  {rows.slice(0, 200).map((r) => (
                    <div
                      key={r.idx}
                      className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0"
                    >
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP[r.status]}`}>
                        {CHIP_LABEL[r.status]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {r.data.name || "—"}
                          {r.data.specialty ? (
                            <span className="font-normal text-slate-400"> · {r.data.specialty}</span>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {[r.data.hospital, r.data.chamber_address, r.data.phone].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                  {rows.length > 200 ? (
                    <p className="px-3 py-2 text-[11px] text-slate-400">…and {rows.length - 200} more rows</p>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                disabled={importing}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void runImport()}
                disabled={importing || counts.new === 0}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {importing ? progress || "Importing…" : `Import ${counts.new} new doctor${counts.new === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
