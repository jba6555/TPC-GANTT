"use client";

import { useState } from "react";
import type { ChangelogEntry } from "@/types/scheduler";

interface HistoryLogProps {
  entries: ChangelogEntry[];
  onRevert: (entry: ChangelogEntry) => Promise<void>;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  create_project: { label: "Created Project", color: "text-green-700 bg-green-50 border-green-200", icon: "+" },
  update_project: { label: "Updated Project", color: "text-blue-700 bg-blue-50 border-blue-200", icon: "~" },
  delete_project: { label: "Deleted Project", color: "text-red-700 bg-red-50 border-red-200", icon: "−" },
  create_task: { label: "Created Task", color: "text-green-700 bg-green-50 border-green-200", icon: "+" },
  update_task: { label: "Updated Task", color: "text-blue-700 bg-blue-50 border-blue-200", icon: "~" },
  delete_tasks: { label: "Deleted Tasks", color: "text-red-700 bg-red-50 border-red-200", icon: "−" },
  bulk_import: { label: "Bulk Import", color: "text-purple-700 bg-purple-50 border-purple-200", icon: "↑" },
};

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFullTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DiffView({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null;

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const skip = new Set(["id", "createdBy", "createdAt", "updatedAt", "sortOrder", "status", "projectId", "project", "tasks"]);
  const changedKeys = [...allKeys].filter((k) => {
    if (skip.has(k)) return false;
    const bv = before?.[k];
    const av = after?.[k];
    return JSON.stringify(bv) !== JSON.stringify(av);
  });

  if (changedKeys.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 text-xs">
      {changedKeys.map((key) => {
        const bv = before?.[key];
        const av = after?.[key];
        return (
          <div key={key} className="flex items-start gap-1.5">
            <span className="shrink-0 font-medium text-zinc-500">{key}:</span>
            <div className="min-w-0">
              {bv !== undefined && bv !== null && (
                <span className="rounded bg-red-50 px-1 text-red-700 line-through">{String(bv)}</span>
              )}
              {bv !== undefined && av !== undefined && " "}
              {av !== undefined && av !== null && (
                <span className="rounded bg-green-50 px-1 text-green-700">{String(av)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HistoryLog({ entries, onRevert }: HistoryLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleRevert(entry: ChangelogEntry) {
    setRevertError(null);
    setRevertingId(entry.id);
    try {
      await onRevert(entry);
      setConfirmId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Revert failed";
      setRevertError(msg);
    } finally {
      setRevertingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mb-3 h-10 w-10 text-zinc-300">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <p className="text-sm text-zinc-500">No history yet</p>
        <p className="text-xs text-zinc-400">Changes will appear here as they happen</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, color: "text-zinc-700 bg-zinc-50 border-zinc-200", icon: "?" };
        const isExpanded = expandedId === entry.id;
        const isReverted = entry.description.startsWith("Reverted:");

        return (
          <div key={entry.id} className="rounded-lg border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${meta.color}`}>
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">
                    {isReverted ? entry.description : meta.label}
                  </span>
                  {entry.projectName && (
                    <span className="truncate text-xs text-zinc-400">{entry.projectName}</span>
                  )}
                </div>
                {!isReverted && (
                  <p className="truncate text-xs text-zinc-600">{entry.description}</p>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span title={formatFullTimestamp(entry.timestamp)}>{formatTimestamp(entry.timestamp)}</span>
                  <span>&middot;</span>
                  <span className="truncate">{entry.userEmail || "Unknown user"}</span>
                </div>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              >
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-zinc-100 px-3 py-2.5">
                <DiffView before={entry.before} after={entry.after} />

                {revertError && confirmId === entry.id && (
                  <p className="mt-2 text-xs text-red-600">{revertError}</p>
                )}

                <div className="mt-2 flex items-center gap-2">
                  {confirmId === entry.id ? (
                    <>
                      <span className="text-xs text-zinc-600">Are you sure?</span>
                      <button
                        type="button"
                        disabled={revertingId === entry.id}
                        onClick={() => handleRevert(entry)}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {revertingId === entry.id ? "Reverting..." : "Yes, Revert"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmId(null); setRevertError(null); }}
                        className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setConfirmId(entry.id); setRevertError(null); }}
                      className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                    >
                      Revert this change
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
