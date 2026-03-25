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
}

export default function ProjectList({
  projects,
  selectedProjectId,
  onSelect,
  onAddProject,
  onDeleteProject,
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
                <button
                  type="button"
                  disabled={deletingProjectId === project.id}
                  onClick={async () => {
                    const ok = window.confirm(
                      `Delete project "${project.name}"? This will also delete all its tasks.`,
                    );
                    if (!ok) return;
                    setDeleteError(null);
                    setDeletingProjectId(project.id);
                    try {
                      await onDeleteProject(project.id);
                    } catch (e: unknown) {
                      const msg =
                        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "";
                      setDeleteError(msg || "Could not delete project.");
                      console.error(e);
                    } finally {
                      setDeletingProjectId(null);
                    }
                  }}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {deleteError && <p className="mt-3 text-xs text-red-600">{deleteError}</p>}
    </aside>
  );
}
