"use client";

import { useState } from "react";
import type { Project } from "@/types/scheduler";

interface ProjectListProps {
  projects: Project[];
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
    startDate: string;
    dueDate: string;
    notes?: string;
  }) => Promise<void>;
}

export default function ProjectList({
  projects,
  selectedProjectId,
  onSelect,
  onAddProject,
  onDeleteProject,
  onUpdateProject,
  onAddTask,
}: ProjectListProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

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
    <aside className="w-full max-w-xs rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Projects</h2>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Project
        </button>
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
        {projects.map((project) => (
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

              <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2">
                {editingProjectId !== project.id ? (
                <button
                  type="button"
                  disabled={deletingProjectId === project.id}
                  onClick={() => {
                    const ok = window.confirm(
                      `Delete project "${project.name}"? This will also delete all its tasks.`,
                    );
                    if (!ok) return;

                    const projectId = project.id;
                    setDeleteError(null);
                    setDeletingProjectId(projectId);

                    let didTimeout = false;
                    const safety = window.setTimeout(() => {
                      didTimeout = true;
                      setDeletingProjectId(null);
                      setDeleteError("Delete is taking longer than expected. It will disappear once Firestore finishes.");
                    }, 4000);

                    void onDeleteProject(projectId)
                      .then(() => {
                        if (didTimeout) return;
                        setDeleteError(null);
                      })
                      .catch((e: unknown) => {
                        if (didTimeout) return;
                        const msg =
                          e && typeof e === "object" && "message" in e
                            ? String((e as { message?: string }).message)
                            : "";
                        setDeleteError(msg || "Could not delete project.");
                        console.error(e);
                      })
                      .finally(() => {
                        if (didTimeout) return;
                        window.clearTimeout(safety);
                        setDeletingProjectId(null);
                      });
                  }}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                </button>
                ) : null}

                {editingProjectId !== project.id ? (
                  <button
                    type="button"
                    disabled={deletingProjectId === project.id}
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
                    disabled={deletingProjectId === project.id}
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
                if (!taskStartDate || !taskDueDate) return;
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
                }, 4000);

                void onAddTask(projectId, {
                  title: taskTitle.trim(),
                  startDate: taskStartDate,
                  dueDate: taskDueDate,
                  notes: taskNotes.trim() || undefined,
                })
                  .then(() => {
                    if (didTimeout) return;
                    window.clearTimeout(safety);
                    setTaskModalProjectId(null);
                    setTaskTitle("");
                    setTaskStartDate("");
                    setTaskDueDate("");
                    setTaskNotes("");
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
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Complete Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
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
    </aside>
  );
}
