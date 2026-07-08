"use client";

import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import type { ColumnMapping, CrmRecord, SkippedRecord, StreamEvent } from "@/lib/types";
import { CRM_FIELDS } from "@/lib/types";

type Stage = "upload" | "preview" | "processing" | "done";

export default function Home() {
  const [dark, setDark] = useState(false);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [phaseMessage, setPhaseMessage] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [formatGuess, setFormatGuess] = useState("");
  const [mappingCached, setMappingCached] = useState(false);
  const [progress, setProgress] = useState({ batchesDone: 0, batchesTotal: 0, rowsDone: 0, rowsTotal: 0 });
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [skipped, setSkipped] = useState<SkippedRecord[]>([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setCsvText(text);
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const rows = (parsed.data || []).filter((r) => Object.values(r).some((v) => (v ?? "").toString().trim() !== ""));
      setPreviewHeaders(parsed.meta.fields ?? []);
      setPreviewRows(rows.slice(0, 100));
      setTotalRows(rows.length);
      setStage("preview");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const startImport = async () => {
    setStage("processing");
    setRecords([]);
    setSkipped([]);
    setMapping([]);
    setError("");
    setProgress({ batchesDone: 0, batchesTotal: 0, rowsDone: 0, rowsTotal: 0 });

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });

      if (!res.body) throw new Error("No response stream from server.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event: StreamEvent = JSON.parse(line);
          applyEvent(event);
        }
      }
      setStage("done");
    } catch (err: any) {
      setError(err?.message || "Something went wrong while importing.");
      setStage("done");
    }
  };

  const applyEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "phase":
        setPhaseMessage(event.message);
        break;
      case "mapping":
        setMapping(event.mapping);
        setFormatGuess(event.formatGuess);
        setMappingCached(event.cached);
        break;
      case "progress":
        setProgress({
          batchesDone: event.batchesDone,
          batchesTotal: event.batchesTotal,
          rowsDone: event.rowsDone,
          rowsTotal: event.rowsTotal,
        });
        break;
      case "batch_result":
        setRecords((prev) => [...prev, ...event.records]);
        setSkipped((prev) => [...prev, ...event.skipped]);
        break;
      case "batch_retry":
        setPhaseMessage(`Retrying batch ${event.batchIndex + 1} (attempt ${event.attempt + 1})...`);
        break;
      case "complete":
        setPhaseMessage("Import complete.");
        break;
      case "error":
        setError(event.message);
        break;
    }
  };

  const reset = () => {
    setStage("upload");
    setCsvText("");
    setFileName("");
    setPreviewRows([]);
    setPreviewHeaders([]);
    setRecords([]);
    setSkipped([]);
    setMapping([]);
    setError("");
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    triggerDownload(blob, "groweasy_crm_leads.json");
  };

  const downloadCSV = () => {
    const csv = Papa.unparse(records.map(({ _rowIndex, _confidence, ...rest }) => rest));
    const blob = new Blob([csv], { type: "text/csv" });
    triggerDownload(blob, "groweasy_crm_leads.csv");
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={dark ? "dark" : ""}>
      <main className="min-h-screen bg-mist dark:bg-ink text-ink dark:text-mist transition-colors">
        <div className="max-w-5xl mx-auto px-5 py-8">
          <Header dark={dark} setDark={setDark} />
          <Pipeline stage={stage} />

          {error && (
            <div className="mt-6 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          {stage === "upload" && (
            <Uploader
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDrop={onDrop}
              fileInputRef={fileInputRef}
              onPick={(f) => f && handleFile(f)}
            />
          )}

          {stage === "preview" && (
            <PreviewStep
              fileName={fileName}
              headers={previewHeaders}
              rows={previewRows}
              totalRows={totalRows}
              onConfirm={startImport}
              onCancel={reset}
            />
          )}

          {stage === "processing" && (
            <ProcessingStep
              phaseMessage={phaseMessage}
              mapping={mapping}
              formatGuess={formatGuess}
              mappingCached={mappingCached}
              progress={progress}
            />
          )}

          {stage === "done" && (
            <ResultsStep
              records={records}
              skipped={skipped}
              totalRows={totalRows}
              onDownloadJSON={downloadJSON}
              onDownloadCSV={downloadCSV}
              onReset={reset}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Header({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-signal pulse-dot" />
          <span className="font-mono text-xs uppercase tracking-widest text-wire dark:text-mist/60">
            GrowEasy · Lead Intelligence
          </span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">AI CSV Importer</h1>
        <p className="text-sm text-wire dark:text-mist/60 mt-0.5">
          Any export format in. Clean CRM records out.
        </p>
      </div>
      <button
        onClick={() => setDark(!dark)}
        className="text-xs font-mono px-3 py-1.5 rounded-full border border-wire/30 dark:border-mist/20 hover:bg-black/5 dark:hover:bg-white/5"
      >
        {dark ? "☀ Light" : "● Dark"}
      </button>
    </header>
  );
}

function Pipeline({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Preview" },
    { key: "processing", label: "AI Mapping" },
    { key: "done", label: "Result" },
  ];
  const order: Stage[] = ["upload", "preview", "processing", "done"];
  const idx = order.indexOf(stage);

  return (
    <div className="mt-8 flex items-center">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-3 w-3 rounded-full border-2 ${
                i <= idx ? "bg-signal border-signal" : "border-wire/30 dark:border-mist/20"
              }`}
            />
            <span
              className={`text-[11px] font-mono uppercase tracking-wide ${
                i <= idx ? "text-signal" : "text-wire/50 dark:text-mist/30"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-[2px] flex-1 mx-2 mb-4 ${i < idx ? "bg-signal" : "bg-wire/20 dark:bg-mist/10"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Uploader({
  dragOver,
  setDragOver,
  onDrop,
  fileInputRef,
  onPick,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File | null) => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`mt-8 cursor-pointer rounded-2xl border-2 border-dashed p-16 text-center transition-colors ${
        dragOver ? "border-signal bg-signal/5" : "border-wire/30 dark:border-mist/20"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <div className="mx-auto h-12 w-12 rounded-full bg-signal/10 flex items-center justify-center text-signal text-xl">↑</div>
      <p className="mt-4 font-medium">Drop your CSV file here</p>
      <p className="text-sm text-wire dark:text-mist/50">or click to browse — any column layout works</p>
    </div>
  );
}

function PreviewStep({
  fileName,
  headers,
  rows,
  totalRows,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-mono text-sm">{fileName}</p>
          <p className="text-xs text-wire dark:text-mist/50">
            {totalRows} row(s) detected · showing first {Math.min(100, rows.length)} · no AI processing yet
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-wire/30 dark:border-mist/20">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm bg-signal text-white font-medium">
            Confirm &amp; Import
          </button>
        </div>
      </div>

      <div className="data-table-wrap mt-4 border border-wire/20 dark:border-mist/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-wire/5 dark:bg-mist/5">
              {headers.map((h) => (
                <th key={h} className="text-left px-3 py-2 font-mono text-xs whitespace-nowrap border-b border-wire/20 dark:border-mist/10">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-black/[0.015] dark:odd:bg-white/[0.02]">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-1.5 whitespace-nowrap border-b border-wire/10 dark:border-mist/5">
                    {r[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcessingStep({
  phaseMessage,
  mapping,
  formatGuess,
  mappingCached,
  progress,
}: {
  phaseMessage: string;
  mapping: ColumnMapping[];
  formatGuess: string;
  mappingCached: boolean;
  progress: { batchesDone: number; batchesTotal: number; rowsDone: number; rowsTotal: number };
}) {
  const pct = progress.rowsTotal ? Math.round((progress.rowsDone / progress.rowsTotal) * 100) : 0;

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-amber pulse-dot" />
        <p className="font-mono text-sm">{phaseMessage || "Starting..."}</p>
      </div>

      {formatGuess && (
        <div className="rounded-xl border border-wire/20 dark:border-mist/10 p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-wire dark:text-mist/50">
            Detected format {mappingCached && "· cached fingerprint, AI mapping call skipped"}
          </p>
          <p className="text-lg font-medium mt-0.5">{formatGuess}</p>

          <div className="mt-4 space-y-2">
            {mapping
              .filter((m) => m.targetField !== "unmapped")
              .map((m) => (
                <div key={m.sourceColumn} className="flex items-center gap-3 text-sm">
                  <span className="font-mono w-40 truncate text-wire dark:text-mist/60">{m.sourceColumn}</span>
                  <span>→</span>
                  <span className="font-mono w-52 truncate">{m.targetField}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-wire/10 dark:bg-mist/10 overflow-hidden">
                    <div
                      className="h-full bg-signal rounded-full"
                      style={{ width: `${Math.round(m.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs w-10 text-right">{Math.round(m.confidence * 100)}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {progress.rowsTotal > 0 && (
        <div>
          <div className="flex justify-between text-xs font-mono text-wire dark:text-mist/50 mb-1">
            <span>
              Batch {progress.batchesDone}/{progress.batchesTotal}
            </span>
            <span>
              {progress.rowsDone}/{progress.rowsTotal} rows
            </span>
          </div>
          <div className="h-2 rounded-full bg-wire/10 dark:bg-mist/10 overflow-hidden">
            <div className="h-full bg-amber transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsStep({
  records,
  skipped,
  totalRows,
  onDownloadJSON,
  onDownloadCSV,
  onReset,
}: {
  records: CrmRecord[];
  skipped: SkippedRecord[];
  totalRows: number;
  onDownloadJSON: () => void;
  onDownloadCSV: () => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<"imported" | "skipped">("imported");

  return (
    <div className="mt-8 space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total Rows" value={totalRows} />
        <Stat label="Imported" value={records.length} accent="signal" />
        <Stat label="Skipped" value={skipped.length} accent="amber" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <TabButton active={tab === "imported"} onClick={() => setTab("imported")}>
            Imported ({records.length})
          </TabButton>
          <TabButton active={tab === "skipped"} onClick={() => setTab("skipped")}>
            Skipped ({skipped.length})
          </TabButton>
        </div>
        <div className="flex gap-2">
          <button onClick={onDownloadCSV} className="text-xs px-3 py-1.5 rounded-lg border border-wire/30 dark:border-mist/20">
            Download CSV
          </button>
          <button onClick={onDownloadJSON} className="text-xs px-3 py-1.5 rounded-lg border border-wire/30 dark:border-mist/20">
            Download JSON
          </button>
          <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg bg-signal text-white">
            Import another file
          </button>
        </div>
      </div>

      {tab === "imported" ? (
        <div className="data-table-wrap border border-wire/20 dark:border-mist/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-wire/5 dark:bg-mist/5">
                {CRM_FIELDS.map((f) => (
                  <th key={f} className="text-left px-3 py-2 font-mono text-xs whitespace-nowrap border-b border-wire/20 dark:border-mist/10">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._rowIndex} className="odd:bg-black/[0.015] dark:odd:bg-white/[0.02]">
                  {CRM_FIELDS.map((f) => (
                    <td key={f} className="px-3 py-1.5 whitespace-nowrap border-b border-wire/10 dark:border-mist/5">
                      {r[f]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="data-table-wrap border border-wire/20 dark:border-mist/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-wire/5 dark:bg-mist/5">
                <th className="text-left px-3 py-2 font-mono text-xs border-b border-wire/20 dark:border-mist/10">Row</th>
                <th className="text-left px-3 py-2 font-mono text-xs border-b border-wire/20 dark:border-mist/10">Reason</th>
                <th className="text-left px-3 py-2 font-mono text-xs border-b border-wire/20 dark:border-mist/10">Raw data</th>
              </tr>
            </thead>
            <tbody>
              {skipped.map((s) => (
                <tr key={s._rowIndex} className="odd:bg-black/[0.015] dark:odd:bg-white/[0.02]">
                  <td className="px-3 py-1.5 border-b border-wire/10 dark:border-mist/5">{s._rowIndex + 1}</td>
                  <td className="px-3 py-1.5 border-b border-wire/10 dark:border-mist/5">{s.reason}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-wire dark:text-mist/50 border-b border-wire/10 dark:border-mist/5 max-w-xs truncate">
                    {JSON.stringify(s.raw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "signal" | "amber" }) {
  return (
    <div className="rounded-xl border border-wire/20 dark:border-mist/10 p-4">
      <p className="text-xs font-mono uppercase tracking-wide text-wire dark:text-mist/50">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent === "signal" ? "text-signal" : accent === "amber" ? "text-amber" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-lg ${
        active ? "bg-ink text-mist dark:bg-mist dark:text-ink" : "border border-wire/30 dark:border-mist/20"
      }`}
    >
      {children}
    </button>
  );
}
