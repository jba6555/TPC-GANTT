"use client";

import { useState } from "react";
import type { TaskInput, TaskType } from "@/types/scheduler";

interface TaskFormProps {
  onAddTask: (input: TaskInput) => Promise<void>;
}

export default function TaskForm({ onAddTask }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("milestone");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    if (startDate && startDate > dueDate) return;
    setSubmitting(true);
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
    setSubmitting(false);
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
    </form>
  );
}
