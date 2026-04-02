"use client";

import { useState } from "react";
import type { AssignedOption, CalendarEvent, Project, TaskType } from "@/types/scheduler";

interface CalendarEventInboxProps {
  events: CalendarEvent[];
  projects: Project[];
  assignedOptions?: AssignedOption[];
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onDismiss: (eventId: string) => Promise<void>;
  onAddTask: (
    projectId: string,
    input: {
      title: string;
      type: TaskType;
      startDate?: string;
      dueDate: string;
      notes?: string;
      assignedTo?: string[];
      googleCalendarEventId: string;
    },
  ) => Promise<void>;
}

interface EventFormState {
  projectId: string;
  title: string;
  type: TaskType;
  startDate: string;
  dueDate: string;
  notes: string;
  assignedTo: string[];
  submitting: boolean;
  error: string | null;
}

function buildInitialForm(event: CalendarEvent, firstProjectId: string): EventFormState {
  return {
    projectId: firstProjectId,
    title: event.summary,
    type: "task",
    startDate: event.startDate ?? "",
    dueDate: event.endDate ?? event.startDate ?? "",
    notes: event.description ?? "",
    assignedTo: [],
    submitting: false,
    error: null,
  };
}

export default function CalendarEventInbox({
  events,
  projects,
  assignedOptions = [],
  isLoading,
  isOpen,
  onClose,
  onDismiss,
  onAddTask,
}: CalendarEventInboxProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, EventFormState>>({});

  if (!isOpen) return null;

  const firstProjectId = projects[0]?.id ?? "";

  function getForm(event: CalendarEvent): EventFormState {
    return forms[event.id] ?? buildInitialForm(event, firstProjectId);
  }

  function setForm(eventId: string, patch: Partial<EventFormState>) {
    setForms((prev) => ({
      ...prev,
      [eventId]: { ...(prev[eventId] ?? buildInitialForm({ id: eventId, summary: "" }, firstProjectId)), ...patch },
    }));
  }

  function toggleExpand(eventId: string) {
    setExpandedEventId((prev) => {
      if (prev === eventId) return null;
      // Initialise form for this event if needed
      const event = events.find((e) => e.id === eventId);
      if (event && !forms[eventId]) {
        setForms((f) => ({ ...f, [eventId]: buildInitialForm(event, firstProjectId) }));
      }
      return eventId;
    });
  }

  async function handleSubmit(event: CalendarEvent) {
    const form = getForm(event);
    if (!form.title.trim() || !form.dueDate || !form.projectId) {
      setForm(event.id, { error: "Project, title, and due date are required." });
      return;
    }
    setForm(event.id, { submitting: true, error: null });
    try {
      await onAddTask(form.projectId, {
        title: form.title.trim(),
        type: form.type,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate,
        notes: form.notes.trim() || undefined,
        assignedTo: form.assignedTo.length > 0 ? form.assignedTo : undefined,
        googleCalendarEventId: event.id,
      });
      await onDismiss(event.id);
      setExpandedEventId(null);
    } catch {
      setForm(event.id, { submitting: false, error: "Failed to add task. Please try again." });
    }
  }

  function handleAssignedToggle(eventId: string, value: string, current: string[]) {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setForm(eventId, { assignedTo: next });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mt-14 flex h-[calc(100vh-5rem)] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Calendar Inbox</h2>
              <p className="text-xs text-zinc-500">
                {isLoading
                  ? "Loading…"
                  : events.length === 0
                    ? "No new events"
                    : `${events.length} unassigned event${events.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
              Loading calendar events…
            </div>
          )}

          {!isLoading && events.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-zinc-400">
              <span className="text-3xl">✓</span>
              <p>All calendar events have been assigned or dismissed.</p>
            </div>
          )}

          {!isLoading && events.map((event) => {
            const form = getForm(event);
            const isExpanded = expandedEventId === event.id;

            return (
              <div key={event.id} className="border-b border-zinc-100 last:border-0">
                {/* Event summary row */}
                <div className="flex items-start gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{event.summary}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {event.startDate && event.endDate && event.startDate !== event.endDate
                        ? `${event.startDate} → ${event.endDate}`
                        : (event.startDate ?? event.endDate ?? "No date")}
                    </p>
                    {event.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{event.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(event.id)}
                      className="rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {isExpanded ? "Cancel" : "Add to Project"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDismiss(event.id)}
                      className="rounded border border-zinc-200 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded assignment form */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50 px-4 pb-4 pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Assign as Task</p>
                    <div className="space-y-2">
                      {/* Project picker */}
                      <div>
                        <label className="mb-0.5 block text-xs text-zinc-500">Project *</label>
                        <select
                          value={form.projectId}
                          onChange={(e) => setForm(event.id, { projectId: e.target.value })}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                        >
                          {projects.length === 0 && (
                            <option value="">No projects yet</option>
                          )}
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="mb-0.5 block text-xs text-zinc-500">Title *</label>
                        <input
                          value={form.title}
                          onChange={(e) => setForm(event.id, { title: e.target.value })}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          placeholder="Task title"
                        />
                      </div>

                      {/* Type */}
                      <div>
                        <label className="mb-0.5 block text-xs text-zinc-500">Type</label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm(event.id, { type: e.target.value as TaskType })}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                        >
                          <option value="task">Task</option>
                          <option value="milestone">Milestone</option>
                        </select>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-0.5 block text-xs text-zinc-500">Start Date</label>
                          <input
                            type="date"
                            value={form.startDate}
                            onChange={(e) => setForm(event.id, { startDate: e.target.value })}
                            className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs text-zinc-500">Due Date *</label>
                          <input
                            type="date"
                            value={form.dueDate}
                            onChange={(e) => setForm(event.id, { dueDate: e.target.value })}
                            className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          />
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="mb-0.5 block text-xs text-zinc-500">Notes</label>
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm(event.id, { notes: e.target.value })}
                          rows={2}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          placeholder="Optional notes"
                        />
                      </div>

                      {/* Assignees */}
                      {assignedOptions.length > 0 && (
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">Assigned To</label>
                          <div className="flex flex-wrap gap-1.5">
                            {assignedOptions.filter((o) => o.value).map((opt) => {
                              const selected = form.assignedTo.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => handleAssignedToggle(event.id, opt.value, form.assignedTo)}
                                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity"
                                  style={{
                                    backgroundColor: selected ? opt.color : "transparent",
                                    borderColor: opt.color,
                                    color: selected ? opt.textColor : opt.color,
                                    opacity: selected ? 1 : 0.7,
                                  }}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {form.error && <p className="text-xs text-red-600">{form.error}</p>}

                      <button
                        type="button"
                        disabled={form.submitting || projects.length === 0}
                        onClick={() => void handleSubmit(event)}
                        className="w-full rounded bg-zinc-900 py-1.5 text-sm font-medium text-white disabled:opacity-60 hover:bg-zinc-700"
                      >
                        {form.submitting ? "Saving…" : "Save Task"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
