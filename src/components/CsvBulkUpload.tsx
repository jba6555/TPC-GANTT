"use client";

import { useState } from "react";
import type { BulkImportCsvRow, MilestoneImportance, TaskType } from "@/types/scheduler";

function parseTaskTypeCell(raw: string | undefined): TaskType | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim().toLowerCase();
  if (t === "milestone" || t === "m") return "milestone";
  if (t === "task" || t === "t") return "task";
  throw new Error(`Invalid task_type "${raw.trim()}". Use milestone or task.`);
}

interface CsvBulkUploadProps {
  onBulkUpload: (rows: BulkImportCsvRow[]) => Promise<{ createdProjects: number; createdTasks: number }>;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizeHeader(text: string) {
  return text.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseCsvRows(csvText: string) {
  const lines = csvText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const getIndex = (...aliases: string[]) =>
    headerCells.findIndex((header) => aliases.includes(header));

  const projectNameIdx = getIndex("project_name", "project", "name");
  const addressIdx = getIndex("address");
  const contractStartIdx = getIndex("contract_start", "start_contract");
  const contractEndIdx = getIndex("contract_end", "end_contract");
  const taskTitleIdx = getIndex("task_title", "task", "title");
  const taskTypeIdx = getIndex("task_type", "type");
  const taskStartIdx = getIndex("task_start", "task_start_date", "start_date");
  const taskDueIdx = getIndex("task_due", "task_due_date", "due_date");
  const notesIdx = getIndex("task_notes", "notes");
  const assignedIdx = getIndex("assigned_to", "assigned");
  const milestoneImportanceIdx = getIndex("milestone_importance", "milestone_type");

  if (projectNameIdx < 0) {
    throw new Error("CSV is missing required column: project_name");
  }

  const rows: BulkImportCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const projectName = cells[projectNameIdx]?.trim() ?? "";
    if (!projectName) {
      throw new Error(`Row ${i + 1}: project_name is required.`);
    }

    const taskTitle = taskTitleIdx >= 0 ? cells[taskTitleIdx]?.trim() || undefined : undefined;
    const taskType =
      taskTypeIdx >= 0 ? parseTaskTypeCell(cells[taskTypeIdx]) : undefined;
    const taskStartDate = taskStartIdx >= 0 ? cells[taskStartIdx]?.trim() || undefined : undefined;
    const taskDueDate = taskDueIdx >= 0 ? cells[taskDueIdx]?.trim() || undefined : undefined;
    if (taskTitle && !taskStartDate && !taskDueDate) {
      throw new Error(`Row ${i + 1}: task row needs task_start and/or task_due date.`);
    }
    if (taskStartDate && taskDueDate && taskStartDate > taskDueDate) {
      throw new Error(`Row ${i + 1}: task_start must be on or before task_due.`);
    }

    let milestoneImportance: MilestoneImportance | undefined;
    const rawImportance =
      milestoneImportanceIdx >= 0 ? cells[milestoneImportanceIdx]?.trim().toLowerCase() || undefined : undefined;
    if (rawImportance) {
      if (rawImportance === "major" || rawImportance === "minor") {
        milestoneImportance = rawImportance;
      } else {
        throw new Error(`Row ${i + 1}: milestone_importance must be "major" or "minor" when provided.`);
      }
    }

    rows.push({
      projectName,
      address: addressIdx >= 0 ? cells[addressIdx]?.trim() || undefined : undefined,
      contractStart: contractStartIdx >= 0 ? cells[contractStartIdx]?.trim() || undefined : undefined,
      contractEnd: contractEndIdx >= 0 ? cells[contractEndIdx]?.trim() || undefined : undefined,
      taskTitle,
      taskType,
      taskStartDate,
      taskDueDate,
      taskNotes: notesIdx >= 0 ? cells[notesIdx]?.trim() || undefined : undefined,
      assignedTo: assignedIdx >= 0 && cells[assignedIdx]?.trim()
        ? cells[assignedIdx].trim().split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      milestoneImportance,
    });
  }
  return rows;
}

export default function CsvBulkUpload({ onBulkUpload }: CsvBulkUploadProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUploadError(null);
          setUploadResult(null);
          setShowUploadModal(true);
        }}
        className="flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        Upload CSV
      </button>

      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="csv-upload-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowUploadModal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 id="csv-upload-title" className="text-lg font-semibold text-zinc-900">
                  Bulk Upload CSV
                </h3>
                <p className="text-sm text-zinc-600">
                  Required column: project_name (one row per project or per task line).
                </p>
                <p className="text-xs text-zinc-500">
                  Project: address, contract_start, contract_end. Task (when task_title is set): task_type
                  (milestone or task; defaults to task), task_start, task_due (milestones can use task_due
                  only), task_notes, assigned_to (matches Assign labels in the app).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            <input
              type="file"
              accept=".csv,text/csv"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadError(null);
                setUploadResult(null);
                setUploading(true);
                void file
                  .text()
                  .then((text) => parseCsvRows(text))
                  .then((rows) => onBulkUpload(rows))
                  .then((result) => {
                    setUploadResult(
                      `Imported ${result.createdProjects} project(s) and ${result.createdTasks} task(s).`,
                    );
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setUploadError(message || "Could not import CSV.");
                    console.error(err);
                  })
                  .finally(() => {
                    setUploading(false);
                    e.currentTarget.value = "";
                  });
              }}
              className="w-full rounded border border-zinc-200 p-2 text-sm"
            />

            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
            {uploadResult && <p className="mt-2 text-xs text-green-700">{uploadResult}</p>}
          </div>
        </div>
      )}
    </>
  );
}
