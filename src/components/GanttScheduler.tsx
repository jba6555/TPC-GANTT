"use client";

import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";
import type { Project, ProjectTask } from "@/types/scheduler";

interface GanttSchedulerProps {
  projects: Project[];
  tasks: ProjectTask[];
  onUpdateTaskDates: (taskId: string, startDate?: string, dueDate?: string) => Promise<void>;
}

type DragMode = "move" | "resizeStart" | "resizeEnd";

const DAY_WIDTH = 28;

const DRAG_THRESHOLD_PX = 8;

export default function GanttScheduler({ projects, tasks, onUpdateTaskDates }: GanttSchedulerProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notesTask, setNotesTask] = useState<ProjectTask | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** True after pointer moved enough to count as a drag (move/resize). Used so click can open notes after a tap. */
  const dragOccurredRef = useRef(false);

  const { chartStart, chartEnd, days } = useMemo(() => {
    const allDates = tasks.flatMap((task) => [task.startDate || task.dueDate, task.dueDate]);
    const minDate = allDates.length ? dayjs(allDates.sort()[0]) : dayjs().subtract(7, "day");
    const maxDate = allDates.length ? dayjs(allDates.sort()[allDates.length - 1]) : dayjs().add(45, "day");
    const chartStartValue = minDate.startOf("week").subtract(3, "day");
    const chartEndValue = maxDate.endOf("week").add(14, "day");
    const span = chartEndValue.diff(chartStartValue, "day");
    const dayItems = Array.from({ length: span + 1 }).map((_, idx) => chartStartValue.add(idx, "day"));
    return { chartStart: chartStartValue, chartEnd: chartEndValue, days: dayItems };
  }, [tasks]);

  async function handlePointerDown(
    event: React.PointerEvent<HTMLElement>,
    task: ProjectTask,
    mode: DragMode,
  ) {
    // preventDefault on pointerdown can suppress the follow-up click on some browsers/touch —
    // only needed for resize handles to reduce accidental text selection.
    if (mode !== "move") {
      event.preventDefault();
    }
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const originalStart = dayjs(task.startDate || task.dueDate);
    const originalDue = dayjs(task.dueDate);
    setDragTaskId(task.id);
    dragOccurredRef.current = false;

    let hasDragged = false;
    const onMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - startX) > DRAG_THRESHOLD_PX) {
        hasDragged = true;
        dragOccurredRef.current = true;
      }
      if (!viewportRef.current) return;
      const deltaX = moveEvent.clientX - startX;
      const dayDelta = Math.round(deltaX / DAY_WIDTH);
      const row = viewportRef.current.querySelector(`[data-task-id="${task.id}"]`) as HTMLDivElement | null;
      if (!row) return;

      let nextStart = originalStart;
      let nextDue = originalDue;
      if (mode === "move") {
        nextStart = originalStart.add(dayDelta, "day");
        nextDue = originalDue.add(dayDelta, "day");
      } else if (mode === "resizeStart") {
        nextStart = originalStart.add(dayDelta, "day");
        if (nextStart.isAfter(nextDue)) nextStart = nextDue;
      } else {
        nextDue = originalDue.add(dayDelta, "day");
        if (nextDue.isBefore(nextStart)) nextDue = nextStart;
      }

      row.style.left = `${nextStart.diff(chartStart, "day") * DAY_WIDTH}px`;
      row.style.width = `${Math.max(nextDue.diff(nextStart, "day") + 1, 1) * DAY_WIDTH}px`;
    };

    const onUp = (upEvent: PointerEvent) => {
      const deltaX = upEvent.clientX - startX;
      const dayDelta = Math.round(deltaX / DAY_WIDTH);
      let nextStart = originalStart;
      let nextDue = originalDue;
      if (mode === "move") {
        nextStart = originalStart.add(dayDelta, "day");
        nextDue = originalDue.add(dayDelta, "day");
      } else if (mode === "resizeStart") {
        nextStart = originalStart.add(dayDelta, "day");
        if (nextStart.isAfter(nextDue)) nextStart = nextDue;
      } else {
        nextDue = originalDue.add(dayDelta, "day");
        if (nextDue.isBefore(nextStart)) nextDue = nextStart;
      }

      setDragTaskId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);

      if (mode === "move" && !hasDragged) {
        setNotesTask(task);
        return;
      }

      const nextStartStr = nextStart.format("YYYY-MM-DD");
      const nextDueStr = nextDue.format("YYYY-MM-DD");
      setPending(task.id);
      void onUpdateTaskDates(task.id, nextStartStr, nextDueStr)
        .catch((e) => {
          console.error(e);
        })
        .finally(() => setPending(null));
    };

    const onCancel = () => {
      setDragTaskId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    // Capture pointer for resize so we keep receiving events even if the cursor leaves the handle.
    // Skip capture for "move" — capturing suppresses the native click event we need for opening notes.
    if (mode !== "move") {
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(pointerId);
      } catch {
        // Ignore if not supported.
      }
    }
  }

  const tasksByProject = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const task of tasks) {
      const arr = map.get(task.projectId) ?? [];
      arr.push(task);
      map.set(task.projectId, arr);
    }
    for (const [key, arr] of map.entries()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const LABEL_WIDTH = 280;
  const totalWidth = LABEL_WIDTH + days.length * DAY_WIDTH;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-base font-semibold text-zinc-900">Gantt Timeline (All Projects)</h3>
      <div className="overflow-auto" ref={viewportRef}>
        <div style={{ minWidth: totalWidth }}>
          <div className="sticky top-0 z-20 grid grid-cols-[280px_1fr] bg-white">
            <div className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-white p-2 text-xs font-semibold text-zinc-600" style={{ width: LABEL_WIDTH }}>Task</div>
            <div className="border-b border-zinc-200">
              <div className="flex">
                {days.map((day) => (
                  <div
                    key={day.format("YYYY-MM-DD")}
                    className="border-r border-zinc-100 py-1 text-center text-[10px] text-zinc-500"
                    style={{ width: DAY_WIDTH }}
                  >
                    {day.format("MMM D")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {projects.map((project) => {
            const projectTasks = tasksByProject.get(project.id) ?? [];
            return (
              <div key={project.id}>
                <div className="grid grid-cols-[280px_1fr] border-b border-zinc-200 bg-zinc-50">
                  <div className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 p-2" style={{ width: LABEL_WIDTH }}>
                    <p className="text-base font-semibold text-zinc-900">{project.name}</p>
                    {project.address ? (
                      <p className="text-xs text-zinc-500">{project.address}</p>
                    ) : (
                      <p className="text-xs text-zinc-400">No address</p>
                    )}
                  </div>
                  <div className="h-10" />
                </div>

                {projectTasks.map((task) => {
                  const start = dayjs(task.startDate || task.dueDate);
                  const due = dayjs(task.dueDate);
                  const left = start.diff(chartStart, "day") * DAY_WIDTH;
                  const width = Math.max(due.diff(start, "day") + 1, 1) * DAY_WIDTH;

                  return (
                    <div key={task.id} className="grid grid-cols-[280px_1fr] border-b border-zinc-100">
                      <button
                        type="button"
                        title="View notes"
                        onClick={() => setNotesTask(task)}
                        className="sticky left-0 z-10 w-full cursor-pointer border-r border-zinc-200 bg-white p-2 transition-colors hover:bg-zinc-50"
                        style={{ textAlign: "right", fontSize: 13, width: LABEL_WIDTH }}
                      >
                        <p className="font-medium text-zinc-900">{task.title}</p>
                        <p className="text-xs text-zinc-500">
                          {start.format("MMM D")} - {due.format("MMM D, YYYY")}
                        </p>
                      </button>
                      <div className="relative h-12 bg-[linear-gradient(to_right,#f4f4f5_1px,transparent_1px)] bg-[length:28px_100%]">
                        <div
                          data-task-id={task.id}
                          className={`absolute top-2 flex h-8 items-center rounded ${
                            dragTaskId === task.id ? "bg-blue-700" : "bg-blue-600"
                          } text-white ${pending === task.id ? "opacity-60" : ""}`}
                          style={{ left, width, cursor: "grab" }}
                          onClick={() => {
                            if (!dragOccurredRef.current) {
                              setNotesTask(task);
                            }
                          }}
                        >
                          <div
                            onPointerDown={(e) => handlePointerDown(e, task, "resizeStart")}
                            className="h-full w-2 cursor-ew-resize rounded-l bg-blue-800"
                          />
                          <div
                            onPointerDown={(e) => handlePointerDown(e, task, "move")}
                            className="h-full flex-1 overflow-hidden px-2 leading-8"
                            style={{ textAlign: "right", fontSize: 13 }}
                          >
                            {task.title}
                          </div>
                          <div
                            onPointerDown={(e) => handlePointerDown(e, task, "resizeEnd")}
                            className="h-full w-2 cursor-ew-resize rounded-r bg-blue-800"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {notesTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-notes-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNotesTask(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 id="task-notes-title" className="text-lg font-semibold text-zinc-900">
                  {notesTask.title}
                </h3>
                <p className="text-sm text-zinc-600">
                  {projects.find((p) => p.id === notesTask.projectId)?.name ?? "Project"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {dayjs(notesTask.startDate || notesTask.dueDate).format("MMM D, YYYY")} –{" "}
                  {dayjs(notesTask.dueDate).format("MMM D, YYYY")}
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

      <p className="mt-2 text-xs text-zinc-500">
        Click a task name or tap the bar (without dragging) to view notes. Drag the center to move, or drag either
        edge to change dates.
      </p>
      <p className="text-xs text-zinc-500">
        Timeline range: {chartStart.format("MMM D, YYYY")} - {chartEnd.format("MMM D, YYYY")}
      </p>
    </section>
  );
}
