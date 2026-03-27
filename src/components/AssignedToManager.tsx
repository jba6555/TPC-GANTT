"use client";

import { useState } from "react";
import type { AssignedOption } from "@/types/scheduler";

interface AssignedToManagerProps {
  options: AssignedOption[];
  onSave: (options: AssignedOption[]) => Promise<void>;
}

export default function AssignedToManager({ options, onSave }: AssignedToManagerProps) {
  const [draft, setDraft] = useState<AssignedOption[]>(() =>
    options.map((o) => ({ ...o })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [newTextColor, setNewTextColor] = useState("#ffffff");

  function updateOption(index: number, field: keyof AssignedOption, value: string) {
    setDraft((prev) => {
      const next = prev.map((o) => ({ ...o }));
      next[index] = { ...next[index], [field]: value };
      if (field === "label") {
        next[index].value = value;
      }
      return next;
    });
    setSuccess(null);
  }

  function removeOption(index: number) {
    if (index === 0) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setSuccess(null);
  }

  function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    if (draft.some((o) => o.value === label)) {
      setError(`"${label}" already exists.`);
      return;
    }
    setDraft((prev) => [
      ...prev,
      { value: label, label, color: newColor, textColor: newTextColor },
    ]);
    setNewLabel("");
    setNewColor("#3b82f6");
    setNewTextColor("#ffffff");
    setError(null);
    setSuccess(null);
  }

  function moveOption(index: number, direction: -1 | 1) {
    if (index === 0) return;
    const target = index + direction;
    if (target < 1 || target >= draft.length) return;
    setDraft((prev) => {
      const next = prev.map((o) => ({ ...o }));
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSuccess(null);
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    const savePromise = onSave(draft);
    try {
      const result = await Promise.race([
        savePromise.then(() => "saved" as const),
        new Promise<"timeout">((resolve) => {
          window.setTimeout(() => resolve("timeout"), 2500);
        }),
      ]);

      if (result === "saved") {
        setSuccess("Saved successfully.");
      } else {
        // Firestore can take a long time to ack writes on poor connections.
        // Stop blocking the UI and continue syncing in the background.
        setSuccess("Saved locally. Syncing to Firestore in the background...");
        void savePromise.catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "Could not sync options to Firestore.";
          setError(msg);
          setSuccess(null);
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save options.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {draft.map((opt, i) => {
          const isNone = i === 0;
          return (
            <div
              key={`${opt.value}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              {!isNone && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveOption(i, -1)}
                    disabled={i <= 1}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M8 3.5a.75.75 0 0 1 .53.22l3.25 3.25a.75.75 0 1 1-1.06 1.06L8 5.31 5.28 8.03a.75.75 0 0 1-1.06-1.06l3.25-3.25A.75.75 0 0 1 8 3.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOption(i, 1)}
                    disabled={i >= draft.length - 1}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M8 12.5a.75.75 0 0 1-.53-.22l-3.25-3.25a.75.75 0 1 1 1.06-1.06L8 10.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-.53.22Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="min-w-0 flex-1">
                {isNone ? (
                  <span className="text-sm text-zinc-400 italic">(none / default)</span>
                ) : (
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(i, "label", e.target.value)}
                    className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
                  />
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <div className="space-y-0.5 text-center">
                  <label className="block text-[10px] text-zinc-500">Bar</label>
                  <input
                    type="color"
                    value={opt.color}
                    onChange={(e) => updateOption(i, "color", e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded border border-zinc-200"
                    title="Bar color"
                  />
                </div>
                <div className="space-y-0.5 text-center">
                  <label className="block text-[10px] text-zinc-500">Text</label>
                  <input
                    type="color"
                    value={opt.textColor}
                    onChange={(e) => updateOption(i, "textColor", e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded border border-zinc-200"
                    title="Text color"
                  />
                </div>
              </div>

              <div
                className="flex h-7 items-center rounded px-2 text-xs font-medium"
                style={{ backgroundColor: opt.color, color: opt.textColor }}
              >
                {opt.label || "Default"}
              </div>

              {!isNone && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-zinc-700">Add New Option</p>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-[10px] text-zinc-500">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Marketing"
              className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
          </div>
          <div className="space-y-1 text-center">
            <label className="block text-[10px] text-zinc-500">Bar</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-zinc-200"
            />
          </div>
          <div className="space-y-1 text-center">
            <label className="block text-[10px] text-zinc-500">Text</label>
            <input
              type="color"
              value={newTextColor}
              onChange={(e) => setNewTextColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-zinc-200"
            />
          </div>
          <button
            type="button"
            onClick={addOption}
            disabled={!newLabel.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">{success}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Options"}
      </button>
    </div>
  );
}
