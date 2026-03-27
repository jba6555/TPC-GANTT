"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssignedOption, Project, ProjectTask, AssignedTo } from "@/types/scheduler";
import { ASSIGNED_OPTIONS } from "@/types/scheduler";

interface ProjectListProps {
  projects: Project[];
  tasks: ProjectTask[];
  selectedProjectId?: string;
  assignedOptions?: AssignedOption[];
  onSelect: (projectId: string) => void;
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
  onUpdateTask: (
    taskId: string,
    fields: Partial<Pick<ProjectTask, "title" | "startDate" | "dueDate" | "notes" | "assignedTo" | "status">>,
  ) => Promise<void>;
}

export default function ProjectList({
  projects,
  tasks,
  selectedProjectId,
  assignedOptions,
  onSelect,
  onDeleteProject,
  onUpdateProject,
  onAddTask,
  onUpdateTaskDates,
  onUpdateTask,
}: ProjectListProps) {
  const options = assignedOptions ?? ASSIGNED_OPTIONS;
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
  const [notesEditTitle, setNotesEditTitle] = useState("");
  const [notesEditNotes, setNotesEditNotes] = useState("");
  const [notesEditAssignedTo, setNotesEditAssignedTo] = useState<AssignedTo>("");
  const [notesEditStatus, setNotesEditStatus] = useState<ProjectTask["status"]>("not_started");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  return (
    <aside className="w-full min-w-0 max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Projects</h2>

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
                          setNotesEditTitle(t.title);
                          setNotesEditNotes(t.notes || "");
                          setNotesEditAssignedTo(t.assignedTo || "");
                          setNotesEditStatus(t.status);
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
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label || "(none)"}
                    </option>
                  ))}
                </select>
                {taskAssignedTo && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: options.find((o) => o.value === taskAssignedTo)?.color }}
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!notesTask) return;
                if (!notesEditTitle.trim()) {
                  setNotesError("Title is required.");
                  return;
                }
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
                void onUpdateTask(notesTask.id, {
                  title: notesEditTitle.trim(),
                  startDate: notesStartDate,
                  dueDate: notesDueDate,
                  notes: notesEditNotes,
                  assignedTo: notesEditAssignedTo,
                  status: notesEditStatus,
                })
                  .then(() => {
                    setNotesTask((prev) => {
                      if (!prev || prev.id !== notesTask.id) return prev;
                      return {
                        ...prev,
                        title: notesEditTitle.trim(),
                        startDate: notesStartDate,
                        dueDate: notesDueDate,
                        notes: notesEditNotes,
                        assignedTo: notesEditAssignedTo,
                        status: notesEditStatus,
                      };
                    });
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setNotesError(message || "Could not update task.");
                    console.error(err);
                  })
                  .finally(() => setNotesSaving(false));
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Title</label>
                <input
                  type="text"
                  value={notesEditTitle}
                  onChange={(e) => setNotesEditTitle(e.target.value)}
                  required
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Assigned To</label>
                  <select
                    value={notesEditAssignedTo}
                    onChange={(e) => setNotesEditAssignedTo(e.target.value as AssignedTo)}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  >
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label || "(none)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Status</label>
                  <select
                    value={notesEditStatus}
                    onChange={(e) => setNotesEditStatus(e.target.value as ProjectTask["status"])}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Notes</label>
                <textarea
                  value={notesEditNotes}
                  onChange={(e) => setNotesEditNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                  placeholder="Optional notes"
                />
              </div>
              {notesError && <p className="text-xs text-red-600">{notesError}</p>}
              <button
                type="submit"
                disabled={notesSaving}
                className="w-full rounded bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {notesSaving ? "Saving..." : "Save Changes"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setNotesTask(null)}
              className="mt-2 w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
