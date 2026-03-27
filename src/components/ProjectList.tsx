"use client";

import { useEffect, useMemo, useState } from "react";
import type { BulkImportCsvRow, Project, ProjectTask, AssignedTo } from "@/types/scheduler";
import { ASSIGNED_OPTIONS } from "@/types/scheduler";

interface ProjectListProps {
  projects: Project[];
  tasks: ProjectTask[];
  selectedProjectId?: string;
  onSelect: (projectId: string) => void;
  onAddProject: (input: {
    name: string;
    address: string;
    contractStart?: string;
    contractEnd?: string;
  }) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onUpdateProject: (projectId: string, input: {
    name: string;
    address: string;
    contractStart?: string;
    contractEnd?: string;
  }) => Promise<void>;
  onAddTask: (projectId: string, input: {
    title: string;
    startDate?: string;
    dueDate?: string;
    notes?: string;
    assignedTo?: string;
  }) => Promise<void>;
  onUpdateTaskDates: (taskId: string, startDate?: string, dueDate?: string) => Promise<void>;
  onBulkUpload: (rows: BulkImportCsvRow[]) => Promise<{ createdProjects: number; createdTasks: number }>;
}

export default function ProjectList({
  projects,
  tasks,
  selectedProjectId,
  onSelect,
  onAddProject,
  onDeleteProject,
  onUpdateProject,
  onAddTask,
  onUpdateTaskDates,
  onBulkUpload,
}: ProjectListProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setPendingDeleteIds((prev) =>
      prev.filter((id) => projects.some((p) => p.id === id)),
    );
  }, [projects]);

  const visibleProjects = projects.filter((p) => !pendingDeleteIds.includes(p.id));

  const tasksByProjectId = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const t of tasks) {
      const arr = map.get(t.projectId) ?? [];
      arr.push(t);
      map.set(t.projectId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [tasks]);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editContractStart, setEditContractStart] = useState("");
  const [editContractEnd, setEditContractEnd] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [taskModalProjectId, setTaskModalProjectId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<AssignedTo>("");
  const [notesTask, setNotesTask] = useState<ProjectTask | null>(null);
  const [notesStartDate, setNotesStartDate] = useState("");
  const [notesDueDate, setNotesDueDate] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

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
    const taskStartIdx = getIndex("task_start", "task_start_date", "start_date");
    const taskDueIdx = getIndex("task_due", "task_due_date", "due_date");
    const notesIdx = getIndex("task_notes", "notes");

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
      const taskStartDate = taskStartIdx >= 0 ? cells[taskStartIdx]?.trim() || undefined : undefined;
      const taskDueDate = taskDueIdx >= 0 ? cells[taskDueIdx]?.trim() || undefined : undefined;
      if (taskTitle && !taskStartDate && !taskDueDate) {
        throw new Error(`Row ${i + 1}: task row needs task_start or task_due date.`);
      }

      rows.push({
        projectName,
        address: addressIdx >= 0 ? cells[addressIdx]?.trim() || undefined : undefined,
        contractStart: contractStartIdx >= 0 ? cells[contractStartIdx]?.trim() || undefined : undefined,
        contractEnd: contractEndIdx >= 0 ? cells[contractEndIdx]?.trim() || undefined : undefined,
        taskTitle,
        taskStartDate,
        taskDueDate,
        taskNotes: notesIdx >= 0 ? cells[notesIdx]?.trim() || undefined : undefined,
      });
    }
    return rows;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaveError(null);
    setSubmitting(true);
    const safety = window.setTimeout(() => setSubmitting(false), 5000);
    void onAddProject({
      name: name.trim(),
      address: address.trim(),
      contractStart: contractStart || undefined,
      contractEnd: contractEnd || undefined,
    })
      .then(() => {
        setName("");
        setAddress("");
        setContractStart("");
        setContractEnd("");
        setShowForm(false);
      })
      .catch((err: unknown) => {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
        const message =
          err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
        setSaveError(
          code === "permission-denied"
            ? "Firestore blocked the save. Check Firestore rules and that you are signed in."
            : message || "Could not save project. Check your network and Firebase console (Firestore enabled).",
        );
        console.error(err);
      })
      .finally(() => {
        window.clearTimeout(safety);
        setSubmitting(false);
      });
  }

  return (
    <aside className="w-full min-w-0 max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Projects</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadError(null);
              setUploadResult(null);
              setShowUploadModal(true);
            }}
            className="rounded-md bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Project
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-2 rounded-md border p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full rounded border px-2 py-1 text-sm"
            required
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
            className="w-full rounded border px-2 py-1 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={contractStart}
              onChange={(e) => setContractStart(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={contractEnd}
              onChange={(e) => setContractEnd(e.target.value)}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-zinc-800 py-1 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Project"}
          </button>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </form>
      )}

      <ul className="space-y-2">
        {visibleProjects.map((project) => (
          <li key={project.id}>
            <div className="rounded border border-zinc-200 bg-white">
              <button
                type="button"
                onClick={() => onSelect(project.id)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  selectedProjectId === project.id ? "bg-blue-50" : "hover:bg-zinc-50"
                }`}
              >
                <p className="font-medium text-zinc-900">{project.name}</p>
                {project.address && <p className="text-zinc-500">{project.address}</p>}
              </button>

              <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2.5">
                <p className="mb-2 text-xs font-semibold text-zinc-700">Tasks</p>
                <ul className="space-y-1.5">
                  {(tasksByProjectId.get(project.id) ?? []).map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        title="View task notes"
                        onClick={() => {
                          setNotesTask(t);
                          setNotesStartDate(t.startDate || t.dueDate);
                          setNotesDueDate(t.dueDate);
                          setNotesError(null);
                        }}
                        className="w-full break-words rounded px-1 py-0.5 text-left text-sm font-medium leading-snug text-zinc-900 hover:bg-zinc-100"
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
                {(tasksByProjectId.get(project.id) ?? []).length === 0 && (
                  <p className="text-sm text-zinc-500">No tasks yet</p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2">
                {editingProjectId !== project.id ? (
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      `Delete project "${project.name}"? This will also delete all its tasks.`,
                    );
                    if (!ok) return;

                    const projectId = project.id;
                    setDeleteError(null);

                    const others = projects.filter((p) => p.id !== projectId);
                    if (selectedProjectId === projectId) {
                      onSelect(others[0]?.id ?? "");
                    }
                    if (editingProjectId === projectId) {
                      setEditingProjectId(null);
                    }

                    setPendingDeleteIds((prev) =>
                      prev.includes(projectId) ? prev : [...prev, projectId],
                    );

                    void onDeleteProject(projectId)
                      .then(() => {
                        setDeleteError(null);
                      })
                      .catch((e: unknown) => {
                        setPendingDeleteIds((prev) => prev.filter((x) => x !== projectId));
                        const msg =
                          e && typeof e === "object" && "message" in e
                            ? String((e as { message?: string }).message)
                            : "";
                        setDeleteError(msg || "Could not delete project.");
                        console.error(e);
                      });
                  }}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white"
                >
                  Delete
                </button>
                ) : null}

                {editingProjectId !== project.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskError(null);
                      setTaskSaving(false);
                      setTaskModalProjectId(project.id);
                      setTaskTitle("");
                      setTaskStartDate("");
                      setTaskDueDate("");
                      setTaskNotes("");
                    }}
                    className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    + Task
                  </button>
                ) : null}

                {editingProjectId !== project.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditError(null);
                      setSavingEdit(false);
                      setEditingProjectId(project.id);
                      setEditName(project.name ?? "");
                      setEditAddress(project.address ?? "");
                      setEditContractStart(project.contractStart ?? "");
                      setEditContractEnd(project.contractEnd ?? "");
                    }}
                    className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </div>

            {editingProjectId === project.id && (
              <div className="mt-2 rounded border border-zinc-200 bg-white p-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditError(null);
                    setSavingEdit(true);
                    void onUpdateProject(project.id, {
                      name: editName.trim(),
                      address: editAddress.trim(),
                      contractStart: editContractStart || undefined,
                      contractEnd: editContractEnd || undefined,
                    })
                      .then(() => {
                        setEditingProjectId(null);
                        setEditError(null);
                      })
                      .catch((err: unknown) => {
                        const message =
                          err && typeof err === "object" && "message" in err
                            ? String((err as { message?: string }).message)
                            : "";
                        setEditError(message || "Could not save project changes.");
                        console.error(err);
                      })
                      .finally(() => setSavingEdit(false));
                  }}
                  className="space-y-2"
                >
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Project name"
                    className="w-full rounded border px-2 py-1 text-sm"
                    required
                  />
                  <input
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Address"
                    className="w-full rounded border px-2 py-1 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={editContractStart}
                      onChange={(e) => setEditContractStart(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-sm"
                    />
                    <input
                      type="date"
                      value={editContractEnd}
                      onChange={(e) => setEditContractEnd(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="flex-1 rounded bg-zinc-900 py-1 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingEdit ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(null);
                        setEditError(null);
                      }}
                      className="rounded bg-zinc-100 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                  {editError && <p className="text-xs text-red-600">{editError}</p>}
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>

      {deleteError && <p className="mt-3 text-xs text-red-600">{deleteError}</p>}

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
                  Required column: project_name
                </p>
                <p className="text-xs text-zinc-500">
                  Optional: address, contract_start, contract_end, task_title, task_start, task_due, task_notes
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

      {taskModalProjectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setTaskModalProjectId(null);
              setTaskError(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Add Task</h3>
                <p className="text-sm text-zinc-600">
                  {projects.find((p) => p.id === taskModalProjectId)?.name ?? "Project"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTaskModalProjectId(null);
                  setTaskError(null);
                }}
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                setTaskError(null);
                setTaskSaving(true);
                const projectId = taskModalProjectId;
                let didTimeout = false;
                const safety = window.setTimeout(() => {
                  didTimeout = true;
                  setTaskModalProjectId(null);
                  setTaskSaving(false);
                  setTaskError(null);
                  setTaskTitle("");
                  setTaskStartDate("");
                  setTaskDueDate("");
                  setTaskNotes("");
                  setTaskAssignedTo("");
                }, 4000);

                void onAddTask(projectId, {
                  title: taskTitle.trim(),
                  startDate: taskStartDate || undefined,
                  dueDate: taskDueDate || undefined,
                  notes: taskNotes.trim() || undefined,
                  assignedTo: taskAssignedTo || undefined,
                })
                  .then(() => {
                    if (didTimeout) return;
                    window.clearTimeout(safety);
                    setTaskModalProjectId(null);
                    setTaskTitle("");
                    setTaskStartDate("");
                    setTaskDueDate("");
                    setTaskNotes("");
                    setTaskAssignedTo("");
                    setTaskError(null);
                  })
                  .catch((err: unknown) => {
                    if (didTimeout) return;
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setTaskError(message || "Could not add task.");
                    console.error(err);
                  })
                  .finally(() => {
                    if (didTimeout) return;
                    window.clearTimeout(safety);
                    setTaskSaving(false);
                  });
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Task Title</label>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required
                  className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Start Date</label>
                  <input
                    type="date"
                    value={taskStartDate}
                    onChange={(e) => setTaskStartDate(e.target.value)}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Complete Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Assigned To</label>
                <select
                  value={taskAssignedTo}
                  onChange={(e) => setTaskAssignedTo(e.target.value as AssignedTo)}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  {ASSIGNED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label || "(none)"}
                    </option>
                  ))}
                </select>
                {taskAssignedTo && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: ASSIGNED_OPTIONS.find((o) => o.value === taskAssignedTo)?.color }}
                    />
                    <span className="text-xs text-zinc-500">Bar color preview</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Notes</label>
                <textarea
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  rows={3}
                />
              </div>

              {taskError && <p className="text-xs text-red-600">{taskError}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={taskSaving}
                  className="flex-1 rounded bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {taskSaving ? "Adding..." : "Add Task"}
                </button>
                <button
                  type="button"
                  disabled={taskSaving}
                  onClick={() => {
                    setTaskModalProjectId(null);
                    setTaskError(null);
                  }}
                  className="rounded bg-zinc-100 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notesTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sidebar-task-notes-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setNotesTask(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 id="sidebar-task-notes-title" className="text-lg font-semibold text-zinc-900">
                  {notesTask.title}
                </h3>
                <p className="text-sm text-zinc-600">
                  {projects.find((p) => p.id === notesTask.projectId)?.name ?? "Project"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotesTask(null)}
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>
            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                {notesTask.notes?.trim() ? notesTask.notes : "No notes for this task."}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!notesTask) return;
                if (!notesStartDate || !notesDueDate) {
                  setNotesError("Start and due dates are required.");
                  return;
                }
                if (notesStartDate > notesDueDate) {
                  setNotesError("Start date must be on or before due date.");
                  return;
                }
                setNotesError(null);
                setNotesSaving(true);
                void onUpdateTaskDates(notesTask.id, notesStartDate, notesDueDate)
                  .then(() => {
                    setNotesTask((prev) => {
                      if (!prev || prev.id !== notesTask.id) return prev;
                      return {
                        ...prev,
                        startDate: notesStartDate,
                        dueDate: notesDueDate,
                      };
                    });
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setNotesError(message || "Could not update task dates.");
                    console.error(err);
                  })
                  .finally(() => setNotesSaving(false));
              }}
              className="mt-3 space-y-2 rounded-md border border-zinc-200 p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Timeline</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Start</label>
                  <input
                    type="date"
                    value={notesStartDate}
                    onChange={(e) => setNotesStartDate(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Due</label>
                  <input
                    type="date"
                    value={notesDueDate}
                    onChange={(e) => setNotesDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
              </div>
              {notesError && <p className="text-xs text-red-600">{notesError}</p>}
              <button
                type="submit"
                disabled={notesSaving}
                className="w-full rounded bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {notesSaving ? "Saving..." : "Save Task Dates"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setNotesTask(null)}
              className="mt-4 w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
