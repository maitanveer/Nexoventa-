"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";

type ExportKind = "all" | "selected";

const options: Array<{ kind: ExportKind; label: string }> = [
  { kind: "all", label: "All Applicants" },
  { kind: "selected", label: "Confirmed Students" },
];

export function ApplicationExport() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportKind | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function exportApplications(kind: ExportKind) {
    setOpen(false);
    setLoading(kind);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/applications/export?kind=${kind}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || "The Excel file could not be prepared.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] || "Nexoventa-Applicants.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ text: "Excel file downloaded successfully.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The Excel file could not be prepared.", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="application-export">
      <button
        className="admin-action application-export-trigger"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={loading !== null}
      >
        {loading ? <LoaderCircle className="export-spinner" size={14} /> : <Download size={14} />}
        {loading ? "Preparing Excel..." : "Export Students"}
        {!loading && <span aria-hidden="true">▾</span>}
      </button>
      {open && !loading && (
        <div className="application-export-menu" role="menu">
          {options.map((option) => (
            <button key={option.kind} type="button" role="menuitem" onClick={() => exportApplications(option.kind)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
      {message && <p className={`application-export-message ${message.type}`} role="status">{message.text}</p>}
    </div>
  );
}
