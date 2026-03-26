"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectTask } from "@/types/scheduler";

interface GanttSchedulerProps {
  projects: Project[];
  tasks: ProjectTask[];
  onUpdateTaskDates: (taskId: string, startDate?: string, dueDate?: string) => Promise<void>;
}

type DragMode = "move" | "resizeStart" | "resizeEnd";

const DRAG_THRESHOLD_PX = 8;

type ZoomLevel = "day" | "week" | "month" | "year" | "3year";

const ZOOM_LEVELS: { key: ZoomLevel; label: string; pxPerDay: number }[] = [
  { key: "day", label: "Day", pxPerDay: 28 },
  { key: "week", label: "Week", pxPerDay: 5 },
  { key: "month", label: "Month", pxPerDay: 1.5 },
  { key: "year", label: "Year", pxPerDay: 0.6 },
  { key: "3year", label: "3 Years", pxPerDay: 0.2 },
];

interface TimelineColumn {
  key: string;
  label: string;
  widthPx: number;
  groupKey: string;
  groupLabel: string;
}

interface GroupHeader {
  key: string;
  label: string;
  widthPx: number;
}

const ZOOM_KEYS: ZoomLevel[] = ZOOM_LEVELS.map((z) => z.key);

export default function GanttScheduler({ projects, tasks, onUpdateTaskDates }: GanttSchedulerProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notesTask, setNotesTask] = useState<ProjectTask | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** True after pointer moved enough to count as a drag (move/resize). Used so click can open notes after a tap. */
  const dragOccurredRef = useRef(false);
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const hasScrolledToToday = useRef(false);

  const todayMarkerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || hasScrolledToToday.current) return;
    hasScrolledToToday.current = true;
    setTimeout(() => {
      const scrollContainer = viewportRef.current;
      if (!scrollContainer) return;
      node.scrollIntoView({ inline: "start", block: "nearest" });
    }, 50);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prev) => {
      const idx = ZOOM_KEYS.indexOf(prev);
      if (e.deltaY > 0 && idx < ZOOM_KEYS.length - 1) return ZOOM_KEYS[idx + 1];
      if (e.deltaY < 0 && idx > 0) return ZOOM_KEYS[idx - 1];
      return prev;
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const { chartStart, chartEnd, pxPerDay, columns, groupHeaders, gridLinePx } = useMemo(() => {
    const config = ZOOM_LEVELS.find((z) => z.key === zoom)!;
    const ppd = config.pxPerDay;

    const taskDates = tasks.flatMap((task) => [task.startDate || task.dueDate, task.dueDate]);
    const projectDates = projects.flatMap((p) =>
      [p.contractStart, p.contractEnd].filter((d): d is string => !!d),
    );
    const allDates = [...taskDates, ...projectDates].filter(Boolean).sort();
    const minDate = allDates.length ? dayjs(allDates[0]) : dayjs().subtract(7, "day");
    const maxDate = allDates.length ? dayjs(allDates[allDates.length - 1]) : dayjs().add(45, "day");

    let cs = minDate.startOf("week").subtract(3, "day");
    let ce = maxDate.endOf("week").add(14, "day");

    switch (zoom) {
      case "day":
        break;
      case "week":
        cs = minDate.subtract(1, "week").startOf("week");
        ce = maxDate.add(2, "week").endOf("week");
        break;
      case "month":
        cs = minDate.subtract(1, "month").startOf("month");
        ce = maxDate.add(1, "month").endOf("month");
        break;
      case "year": {
        const padStart = minDate.subtract(3, "month");
        const qm = Math.floor(padStart.month() / 3) * 3;
        cs = padStart.startOf("year").add(qm, "month");
        const padEnd = maxDate.add(3, "month");
        const qme = Math.floor(padEnd.month() / 3) * 3 + 2;
        ce = padEnd.startOf("year").add(qme, "month").endOf("month");
        break;
      }
      case "3year":
        cs = minDate.subtract(1, "year").startOf("year");
        ce = maxDate.add(1, "year").endOf("year");
        break;
    }

    const cols: TimelineColumn[] = [];
    switch (zoom) {
      case "day": {
        let d = cs;
        while (!d.isAfter(ce)) {
          cols.push({
            key: d.format("YYYY-MM-DD"),
            label: d.format("D"),
            widthPx: ppd,
            groupKey: d.format("YYYY-MM"),
            groupLabel: d.format("MMMM YYYY"),
          });
          d = d.add(1, "day");
        }
        break;
      }
      case "week": {
        let d = cs;
        while (d.isBefore(ce)) {
          const weekEnd = d.add(6, "day");
          const eff = weekEnd.isAfter(ce) ? ce : weekEnd;
          const n = eff.diff(d, "day") + 1;
          cols.push({
            key: d.format("YYYY-[W]ww"),
            label: d.format("MMM D"),
            widthPx: n * ppd,
            groupKey: d.format("YYYY-MM"),
            groupLabel: d.format("MMMM YYYY"),
          });
          d = d.add(1, "week");
        }
        break;
      }
      case "month": {
        let d = cs;
        while (d.isBefore(ce) || d.isSame(ce, "day")) {
          const mEnd = d.endOf("month");
          const eff = mEnd.isAfter(ce) ? ce : mEnd;
          const n = eff.diff(d, "day") + 1;
          cols.push({
            key: d.format("YYYY-MM"),
            label: d.format("MMM"),
            widthPx: n * ppd,
            groupKey: d.format("YYYY"),
            groupLabel: d.format("YYYY"),
          });
          d = eff.add(1, "day");
          if (d.isAfter(ce)) break;
        }
        break;
      }
      case "year": {
        let d = cs;
        while (d.isBefore(ce) || d.isSame(ce, "day")) {
          const qMonth = Math.floor(d.month() / 3) * 3;
          const qEnd = d.startOf("year").add(qMonth + 2, "month").endOf("month");
          const eff = qEnd.isAfter(ce) ? ce : qEnd;
          const n = eff.diff(d, "day") + 1;
          const qNum = Math.floor(qMonth / 3) + 1;
          cols.push({
            key: `${d.year()}-Q${qNum}`,
            label: `Q${qNum}`,
            widthPx: n * ppd,
            groupKey: String(d.year()),
            groupLabel: String(d.year()),
          });
          d = eff.add(1, "day");
          if (d.isAfter(ce)) break;
        }
        break;
      }
      case "3year": {
        let d = cs;
        while (d.isBefore(ce) || d.isSame(ce, "day")) {
          const yEnd = d.endOf("year");
          const eff = yEnd.isAfter(ce) ? ce : yEnd;
          const n = eff.diff(d, "day") + 1;
          cols.push({
            key: d.format("YYYY"),
            label: d.format("YYYY"),
            widthPx: n * ppd,
            groupKey: "",
            groupLabel: "",
          });
          d = eff.add(1, "day");
          if (d.isAfter(ce)) break;
        }
        break;
      }
    }

    const groups: GroupHeader[] = [];
    let currentGroupKey = "";
    for (const col of cols) {
      if (!col.groupKey) continue;
      if (col.groupKey === currentGroupKey) {
        groups[groups.length - 1].widthPx += col.widthPx;
      } else {
        currentGroupKey = col.groupKey;
        groups.push({ key: col.groupKey, label: col.groupLabel, widthPx: col.widthPx });
      }
    }

    let glp = 0;
    if (zoom === "day") glp = ppd;
    else if (zoom === "week") glp = 7 * ppd;

    return { chartStart: cs, chartEnd: ce, pxPerDay: ppd, columns: cols, groupHeaders: groups, gridLinePx: glp };
  }, [tasks, projects, zoom]);


  async function handlePointerDown(
    event: React.PointerEvent<HTMLElement>,
    task: ProjectTask,
    mode: DragMode,
  ) {
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
      const dayDelta = Math.round(deltaX / pxPerDay);
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

      row.style.left = `${nextStart.diff(chartStart, "day") * pxPerDay}px`;
      row.style.width = `${Math.max(nextDue.diff(nextStart, "day") + 1, 1) * pxPerDay}px`;
    };

    const onUp = (upEvent: PointerEvent) => {
      const deltaX = upEvent.clientX - startX;
      const dayDelta = Math.round(deltaX / pxPerDay);
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
  const timelineWidth = columns.reduce((sum, c) => sum + c.widthPx, 0);
  const totalWidth = LABEL_WIDTH + timelineWidth;
  const MIN_BAR_WIDTH = 6;
  const hasGroupHeaders = groupHeaders.length > 0;
  const todayPx = dayjs().diff(chartStart, "day") * pxPerDay;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900">Gantt Timeline</h3>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
          {ZOOM_LEVELS.find((z) => z.key === zoom)!.label} view · Ctrl+Scroll to zoom
        </span>
      </div>

      <div className="flex">
        {/* Fixed label column */}
        <div className="shrink-0 border-r border-zinc-200" style={{ width: LABEL_WIDTH }}>
          {hasGroupHeaders && (
            <div className="border-b border-zinc-200 bg-zinc-100 px-2 py-1 text-[11px]">&nbsp;</div>
          )}
          <div className="border-b border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600">
            Task
          </div>
          {projects.map((project) => {
            const projectTasks = tasksByProject.get(project.id) ?? [];
            return (
              <div key={project.id}>
                <div className="border-b border-zinc-200 bg-zinc-50 p-2">
                  <p className="text-base font-semibold text-zinc-900">{project.name}</p>
                  {project.address ? (
                    <p className="text-xs text-zinc-500">{project.address}</p>
                  ) : (
                    <p className="text-xs text-zinc-400">No address</p>
                  )}
                </div>
                {projectTasks.map((task) => {
                  const start = dayjs(task.startDate || task.dueDate);
                  const due = dayjs(task.dueDate);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      title="View notes"
                      onClick={() => setNotesTask(task)}
                      className="block w-full cursor-pointer border-b border-zinc-100 bg-white p-2 text-right transition-colors hover:bg-zinc-50"
                      style={{ fontSize: 13, height: 48 }}
                    >
                      <p className="font-medium text-zinc-900">{task.title}</p>
                      <p className="text-xs text-zinc-500">
                        {start.format("MMM D")} - {due.format("MMM D, YYYY")}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className="min-w-0 flex-1 overflow-x-auto" ref={viewportRef}>
          <div className="relative" style={{ width: timelineWidth }}>
            {hasGroupHeaders && (
              <div className="flex border-b border-zinc-200 bg-zinc-100">
                {groupHeaders.map((g) => (
                  <div
                    key={g.key}
                    className="shrink-0 border-r border-zinc-200 px-1.5 py-1 text-center text-[11px] font-semibold text-zinc-700"
                    style={{ width: g.widthPx }}
                  >
                    {g.widthPx >= 30 ? g.label : ""}
                  </div>
                ))}
              </div>
            )}
            <div className="flex border-b border-zinc-200">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="shrink-0 border-r border-zinc-100 py-1 text-center text-[10px] text-zinc-500"
                  style={{ width: col.widthPx }}
                >
                  {col.widthPx >= 16 ? col.label : ""}
                </div>
              ))}
            </div>

            <div
              ref={todayMarkerRef}
              className="pointer-events-none absolute z-10"
              style={{ left: todayPx, top: 0, bottom: 0, width: 2, backgroundColor: "#ef4444" }}
            />

            {projects.map((project) => {
              const projectTasks = tasksByProject.get(project.id) ?? [];
              return (
                <div key={project.id}>
                  <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: 40 }}>
                    <div className="p-2">&nbsp;</div>
                  </div>
                  {projectTasks.map((task) => {
                    const start = dayjs(task.startDate || task.dueDate);
                    const due = dayjs(task.dueDate);
                    const left = start.diff(chartStart, "day") * pxPerDay;
                    const barWidth = Math.max(
                      Math.max(due.diff(start, "day") + 1, 1) * pxPerDay,
                      MIN_BAR_WIDTH,
                    );

                    return (
                      <div
                        key={task.id}
                        className="relative border-b border-zinc-100"
                        style={{
                          height: 48,
                          ...(gridLinePx
                            ? {
                                backgroundImage: "linear-gradient(to right, #f4f4f5 1px, transparent 1px)",
                                backgroundSize: `${gridLinePx}px 100%`,
                              }
                            : {}),
                        }}
                      >
                        <div
                          data-task-id={task.id}
                          className={`absolute top-2 flex h-8 items-center rounded ${
                            dragTaskId === task.id ? "bg-blue-700" : "bg-blue-600"
                          } text-white ${pending === task.id ? "opacity-60" : ""}`}
                          style={{ left, width: barWidth, cursor: "grab" }}
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
                    );
                  })}
                </div>
              );
            })}
          </div>
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
