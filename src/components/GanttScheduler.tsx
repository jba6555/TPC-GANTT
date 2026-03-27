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

type ZoomLevel = "week" | "month" | "year";

const ZOOM_LEVELS: { key: ZoomLevel; label: string; pxPerDay: number }[] = [
  { key: "week", label: "Week", pxPerDay: 100 },
  { key: "month", label: "Month", pxPerDay: 28 },
  { key: "year", label: "Year", pxPerDay: 2 },
];

interface TimelineColumn {
  key: string;
  label: string;
  widthPx: number;
  monthKey: string;
  monthLabel: string;
  yearKey: string;
  yearLabel: string;
}

interface SpanHeader {
  key: string;
  label: string;
  span: number;
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
  const scrollFractionRef = useRef<number | null>(null);
  const scrollToTodayRef = useRef(false);

  const todayMarkerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || hasScrolledToToday.current) return;
    hasScrolledToToday.current = true;
    setTimeout(() => {
      const scrollContainer = viewportRef.current;
      if (!scrollContainer) return;
      node.scrollIntoView({ inline: "start", block: "nearest" });
    }, 50);
  }, []);

  const zoomDeltaRef = useRef(0);
  const ZOOM_THRESHOLD = 150;

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    zoomDeltaRef.current += e.deltaY;
    if (Math.abs(zoomDeltaRef.current) < ZOOM_THRESHOLD) return;
    const direction = zoomDeltaRef.current > 0 ? 1 : -1;
    zoomDeltaRef.current = 0;
    const el = viewportRef.current;
    if (el && el.scrollWidth > el.clientWidth) {
      scrollFractionRef.current = el.scrollLeft / (el.scrollWidth - el.clientWidth);
    }
    setZoom((prev) => {
      const idx = ZOOM_KEYS.indexOf(prev);
      if (direction > 0 && idx < ZOOM_KEYS.length - 1) return ZOOM_KEYS[idx + 1];
      if (direction < 0 && idx > 0) return ZOOM_KEYS[idx - 1];
      return prev;
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (scrollToTodayRef.current) {
      scrollToTodayRef.current = false;
      scrollFractionRef.current = null;
      requestAnimationFrame(() => {
        const marker = el.querySelector("[data-today-marker]") as HTMLElement | null;
        if (marker) {
          el.scrollLeft = marker.offsetLeft;
        }
      });
      return;
    }
    if (scrollFractionRef.current === null) return;
    requestAnimationFrame(() => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll > 0) {
        el.scrollLeft = scrollFractionRef.current! * maxScroll;
      }
      scrollFractionRef.current = null;
    });
  }, [zoom]);

  const { chartStart, chartEnd, pxPerDay, columns, yearHeaders, monthHeaders, gridLinePx } = useMemo(() => {
    const config = ZOOM_LEVELS.find((z) => z.key === zoom)!;
    const ppd = config.pxPerDay;

    const taskDates = tasks.flatMap((task) => [task.startDate || task.dueDate, task.dueDate]);
    const projectDates = projects.flatMap((p) =>
      [p.contractStart, p.contractEnd].filter((d): d is string => !!d),
    );
    const allDates = [...taskDates, ...projectDates].filter(Boolean).sort();
    const minDate = allDates.length ? dayjs(allDates[0]) : dayjs().subtract(7, "day");
    const maxDate = allDates.length ? dayjs(allDates[allDates.length - 1]) : dayjs().add(45, "day");

    let cs: dayjs.Dayjs;
    let ce: dayjs.Dayjs;
    switch (zoom) {
      case "week":
        cs = minDate.subtract(1, "week").startOf("week");
        ce = maxDate.add(2, "week").endOf("week");
        break;
      case "month":
        cs = minDate.subtract(1, "month").startOf("month");
        ce = maxDate.add(1, "month").endOf("month");
        break;
      case "year":
        cs = minDate.subtract(1, "month").startOf("month");
        ce = maxDate.add(1, "month").endOf("month");
        break;
    }

    const cols: TimelineColumn[] = [];
    if (zoom === "week" || zoom === "month") {
      let d = cs;
      while (!d.isAfter(ce)) {
        cols.push({
          key: d.format("YYYY-MM-DD"),
          label: d.format("D"),
          widthPx: ppd,
          monthKey: d.format("YYYY-MM"),
          monthLabel: d.format("MMM"),
          yearKey: d.format("YYYY"),
          yearLabel: d.format("YYYY"),
        });
        d = d.add(1, "day");
      }
    } else {
      let d = cs.startOf("week");
      while (d.isBefore(ce) || d.isSame(ce, "day")) {
        const weekEnd = d.add(6, "day");
        const eff = weekEnd.isAfter(ce) ? ce : weekEnd;
        const n = eff.diff(d, "day") + 1;
        cols.push({
          key: d.format("YYYY-[W]ww"),
          label: d.format("D"),
          widthPx: n * ppd,
          monthKey: d.format("YYYY-MM"),
          monthLabel: d.format("MMM"),
          yearKey: d.format("YYYY"),
          yearLabel: d.format("YYYY"),
        });
        d = d.add(1, "week");
      }
    }

    const years: SpanHeader[] = [];
    const months: SpanHeader[] = [];
    let curYear = "";
    let curMonth = "";
    for (const col of cols) {
      if (col.yearKey === curYear) {
        years[years.length - 1].span += 1;
        years[years.length - 1].widthPx += col.widthPx;
      } else {
        curYear = col.yearKey;
        years.push({ key: col.yearKey, label: col.yearLabel, span: 1, widthPx: col.widthPx });
      }
      if (col.monthKey === curMonth) {
        months[months.length - 1].span += 1;
        months[months.length - 1].widthPx += col.widthPx;
      } else {
        curMonth = col.monthKey;
        months.push({ key: col.monthKey, label: col.monthLabel, span: 1, widthPx: col.widthPx });
      }
    }

    const glp = zoom === "week" ? ppd : zoom === "month" ? ppd : 7 * ppd;

    return { chartStart: cs, chartEnd: ce, pxPerDay: ppd, columns: cols, yearHeaders: years, monthHeaders: months, gridLinePx: glp };
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
  const HEADER_ROW_H = 24;
  const PROJECT_ROW_H = 44;
  const TASK_ROW_H = 48;
  const timelineWidth = columns.reduce((sum, c) => sum + c.widthPx, 0);
  const MIN_BAR_WIDTH = 6;
  const todayPx = dayjs().diff(chartStart, "day") * pxPerDay;

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900">Gantt Timeline</h3>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {(["week", "month", "year"] as ZoomLevel[]).map((level) => {
            const label = ZOOM_LEVELS.find((z) => z.key === level)!.label;
            return (
              <button
                key={level}
                type="button"
                onClick={() => { scrollToTodayRef.current = true; setZoom(level); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  zoom === level
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {label}
              </button>
            );
          })}
          <div className="mx-0.5 h-4 w-px bg-zinc-300" />
          <button
            type="button"
            onClick={() => {
              const el = viewportRef.current;
              if (!el) return;
              const targetScroll = todayPx;
              el.scrollTo({ left: targetScroll, behavior: "smooth" });
            }}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
          >
            Today
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Fixed label column */}
        <div className="shrink-0 border-r border-zinc-200" style={{ width: LABEL_WIDTH }}>
          <div className="flex items-center border-b border-zinc-200 bg-zinc-100 px-2 text-[11px]" style={{ height: HEADER_ROW_H }}>&nbsp;</div>
          <div className="flex items-center border-b border-zinc-200 bg-zinc-50 px-2 text-[11px]" style={{ height: HEADER_ROW_H }}>&nbsp;</div>
          <div className="border-b border-zinc-200 bg-white" style={{ height: HEADER_ROW_H }} />
          {projects.map((project) => {
            const projectTasks = tasksByProject.get(project.id) ?? [];
            return (
              <div key={project.id}>
                <div className="flex items-center overflow-hidden border-b border-zinc-200 bg-zinc-50 px-2" style={{ height: PROJECT_ROW_H }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">{project.name}</p>
                    {project.address ? (
                      <p className="truncate text-xs text-zinc-500">{project.address}</p>
                    ) : (
                      <p className="truncate text-xs text-zinc-400">No address</p>
                    )}
                  </div>
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
                      className="flex w-full cursor-pointer items-center overflow-hidden border-b border-zinc-100 bg-white px-2 transition-colors hover:bg-zinc-50"
                      style={{ height: TASK_ROW_H }}
                    >
                      <div className="ml-auto min-w-0 text-right">
                        <p className="truncate text-[13px] font-medium text-zinc-900">{task.title}</p>
                        <p className="text-[10px] text-zinc-400">
                          {start.isSame(due, "day")
                            ? start.format("MM/DD/YY")
                            : `${start.format("MM/DD/YY")} - ${due.format("MM/DD/YY")}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className="min-w-0 flex-1 overflow-x-scroll" ref={viewportRef}>
          <div className="relative" style={{ width: timelineWidth }}>
            {(() => {
              const gridTemplate = columns.map((c) => `${c.widthPx}px`).join(" ");
              return (
                <>
                  <div
                    className="grid border-b border-zinc-200 bg-zinc-100"
                    style={{ gridTemplateColumns: gridTemplate, height: HEADER_ROW_H }}
                  >
                    {yearHeaders.map((y) => (
                      <div
                        key={y.key}
                        className="relative flex items-center overflow-visible border-r border-zinc-300"
                        style={{ gridColumn: `span ${y.span}` }}
                      >
                        <div className="sticky left-0 w-fit px-2 text-[11px] font-semibold text-zinc-700">
                          {y.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid border-b border-zinc-200 bg-zinc-50"
                    style={{ gridTemplateColumns: gridTemplate, height: HEADER_ROW_H }}
                  >
                    {monthHeaders.map((m) => (
                      <div
                        key={m.key}
                        className="relative flex items-center overflow-visible border-r border-zinc-200"
                        style={{ gridColumn: `span ${m.span}` }}
                      >
                        <div className="sticky left-0 w-fit px-2 text-[10px] font-medium text-zinc-600">
                          {m.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid border-b border-zinc-200"
                    style={{ gridTemplateColumns: gridTemplate, height: HEADER_ROW_H }}
                  >
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        className="flex items-center justify-center overflow-hidden border-r border-zinc-100 text-[10px] text-zinc-500"
                        style={{ minWidth: 0 }}
                      >
                        {col.widthPx >= 14 ? col.label : ""}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            <div
              ref={todayMarkerRef}
              data-today-marker
              className="pointer-events-none absolute z-10"
              style={{ left: todayPx, top: 0, bottom: 0, width: 2, backgroundColor: "#ef4444" }}
            />

            {projects.map((project) => {
              const projectTasks = tasksByProject.get(project.id) ?? [];
              return (
                <div key={project.id}>
                  <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: PROJECT_ROW_H }} />
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
                          height: TASK_ROW_H,
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
