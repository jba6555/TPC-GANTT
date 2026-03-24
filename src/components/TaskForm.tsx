"use client";

import { useEffect, useState } from "react";
import type { ProjectTask } from "@/types/scheduler";
import type { TaskInput, TaskType } from "@/types/scheduler";

interface TaskFormProps {
  onAddTask: (input: TaskInput) => Promise<void>;
  /** Used to clear stuck "Adding..." when the listener updates before addDoc resolves. */
  tasks?: ProjectTask[];
}

export default function TaskForm({ onAddTask, tasks = [] }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("milestone");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitting) return;
    const t = title.trim();
    const d = dueDate;
    if (!t || !d) return;
    const found = tasks.some((x) => x.title === t && x.dueDate === d);
    if (found) {
      setSubmitting(false);
      setTitle("");
      setType("milestone");
      setStartDate("");
      setDueDate("");
      setNotes("");
      setSaveError(null);
    }
  }, [tasks, submitting, title, dueDate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    if (startDate && startDate > dueDate) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      await onAddTask({
        title: title.trim(),
        type,
        startDate: startDate || undefined,
        dueDate,
        notes: notes.trim() || undefined,
      });
      setTitle("");
      setType("milestone");
      setStartDate("");
      setDueDate("");
      setNotes("");
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "";
      setSaveError(message || "Could not add task.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="font-semibold text-zinc-900">+ Task</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Task title"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="milestone">Milestone</option>
          <option value="task">Task</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
          className="rounded border px-2 py-1 text-sm"
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Adding..." : "Add Task"}
      </button>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
    </form>
  );
}
