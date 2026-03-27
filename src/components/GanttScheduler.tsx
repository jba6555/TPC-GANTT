"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssignedOption, AssignedTo, Project, ProjectInput, ProjectTask } from "@/types/scheduler";
import { ASSIGNED_OPTIONS } from "@/types/scheduler";

interface GanttSchedulerProps {
  projects: Project[];
  tasks: ProjectTask[];
  assignedOptions?: AssignedOption[];
  onAddProject: (input: ProjectInput) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onUpdateTaskDates: (taskId: string, startDate?: string, dueDate?: string) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    fields: Partial<Pick<ProjectTask, "title" | "startDate" | "dueDate" | "notes" | "assignedTo" | "status">>,
  ) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onAddTask?: (projectId: string, input: {
    title: string;
    startDate?: string;
    dueDate?: string;
    notes?: string;
    assignedTo?: string;
  }) => Promise<void>;
}

type DragMode = "move" | "resizeStart" | "resizeEnd";

const DRAG_THRESHOLD_PX = 8;

type ZoomLevel = "week" | "month" | "6month" | "year";

const ZOOM_LEVELS: { key: ZoomLevel; label: string; pxPerDay: number }[] = [
  { key: "week", label: "Week", pxPerDay: 100 },
  { key: "month", label: "Month", pxPerDay: 28 },
  { key: "6month", label: "6 Months", pxPerDay: 4.5 },
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

export default function GanttScheduler({ projects, tasks, assignedOptions, onAddProject, onDeleteProject, onUpdateTaskDates, onUpdateTask, onDeleteTask, onAddTask }: GanttSchedulerProps) {
  const options = assignedOptions ?? ASSIGNED_OPTIONS;
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notesTask, setNotesTask] = useState<ProjectTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState<AssignedTo>("");
  const [editStatus, setEditStatus] = useState<ProjectTask["status"]>("not_started");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** True after pointer moved enough to count as a drag (move/resize). Used so click can open notes after a tap. */
  const dragOccurredRef = useRef(false);
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [taskModalProjectId, setTaskModalProjectId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<AssignedTo>("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const hasScrolledToToday = useRef(false);
  const scrollFractionRef = useRef<number | null>(null);
  const scrollToTodayRef = useRef(false);

  const openTaskEditor = useCallback((task: ProjectTask) => {
    setNotesTask(task);
    setEditTitle(task.title);
    setEditStartDate(task.startDate || task.dueDate);
    setEditDueDate(task.dueDate);
    setEditNotes(task.notes || "");
    setEditAssignedTo(task.assignedTo || "");
    setEditStatus(task.status);
    setEditError(null);
  }, []);

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
      case "6month":
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
        const weekLabel = zoom === "6month" ? d.format("D") : "";
        cols.push({
          key: d.format("YYYY-[W]ww"),
          label: weekLabel,
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

    const glp = zoom === "week" || zoom === "month" ? ppd : 7 * ppd;

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
        openTaskEditor(task);
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

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  /** Fixed label column: keeps project controls aligned with timeline rows. */
  const LABEL_WIDTH = 220;
  /** Cumulative ~49% of base (two −30% steps: 0.7 × 0.7). */
  const ROW_SCALE = 0.7 * 0.7;
  const HEADER_ROW_H = Math.round(28 * ROW_SCALE);
  const PROJECT_ROW_H = Math.round(44 * ROW_SCALE);
  const TASK_ROW_H = Math.round(48 * ROW_SCALE);
  /** Bar height = 75% of task row height. */
  const TASK_BAR_H = Math.max(8, Math.round(TASK_ROW_H * 0.75));
  const barLabelFontPx = Math.min(11, Math.max(9, Math.round(TASK_BAR_H * 0.72)));
  const timelineWidth = columns.reduce((sum, c) => sum + c.widthPx, 0);
  const MIN_BAR_WIDTH = 6;
  const todayPx = dayjs().diff(chartStart, "day") * pxPerDay;

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setProjectSaveError(null);
            setNewProjectName("");
            setProjectModalOpen(true);
          }}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          + Project
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {(["week", "month", "6month", "year"] as ZoomLevel[]).map((level) => {
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

      <div className="flex min-w-0">
        <div
          className="shrink-0 border-r border-zinc-200 bg-white"
          style={{ width: LABEL_WIDTH }}
        >
          <div className="border-b border-zinc-200 bg-zinc-100" style={{ height: HEADER_ROW_H }} />
          <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: HEADER_ROW_H }} />
          <div className="border-b border-zinc-200 bg-white" style={{ height: HEADER_ROW_H }} />
          {projects.map((project) => {
            const projectTasks = tasksByProject.get(project.id) ?? [];
            const isCollapsed = collapsedProjects.has(project.id);
            return (
              <div key={project.id}>
                <div
                  className="flex items-center gap-1 overflow-hidden border-b border-zinc-200 bg-zinc-50 px-2"
                  style={{ height: PROJECT_ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => toggleProjectCollapse(project.id)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sm leading-none text-[#d4a017] transition-colors hover:bg-zinc-200/80 hover:text-[#b8860b]"
                    title={isCollapsed ? "Show tasks" : "Hide tasks"}
                  >
                    {isCollapsed ? "\u25B6" : "\u25BC"}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{project.name}</span>
                  <div className="ml-0.5 flex shrink-0 items-center gap-0.5">
                    {onAddTask && (
                      <button
                        type="button"
                        onClick={() => {
                          setTaskModalProjectId(project.id);
                          setTaskError(null);
                          setTaskSaving(false);
                          setTaskTitle("");
                          setTaskStartDate("");
                          setTaskDueDate("");
                          setTaskNotes("");
                          setTaskAssignedTo("");
                        }}
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-600/25 bg-emerald-600/[0.08] text-[10px] font-semibold leading-none text-emerald-800 transition-colors hover:border-emerald-600/40 hover:bg-emerald-600/[0.14] active:bg-emerald-600/[0.2]"
                        title="Add task"
                      >
                        +
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(
                          `Delete project "${project.name}" and all of its tasks? This cannot be undone.`,
                        );
                        if (!ok) return;
                        void onDeleteProject(project.id).catch((err: unknown) => {
                          console.error(err);
                          window.alert(
                            err && typeof err === "object" && "message" in err
                              ? String((err as { message?: string }).message)
                              : "Could not delete project.",
                          );
                        });
                      }}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-rose-500/25 bg-rose-500/[0.07] text-[10px] font-semibold leading-none text-rose-800 transition-colors hover:border-rose-500/40 hover:bg-rose-500/[0.13] active:bg-rose-500/[0.18]"
                      title="Delete project"
                    >
                      −
                    </button>
                  </div>
                </div>
                {!isCollapsed &&
                  projectTasks.map((task) => {
                    return (
                      <button
                        key={task.id}
                        type="button"
                        title={task.title}
                        onClick={() => openTaskEditor(task)}
                        className="flex w-full cursor-pointer items-center justify-end overflow-hidden border-b border-zinc-100 bg-white px-2 text-right transition-colors hover:bg-zinc-50"
                        style={{ height: TASK_ROW_H }}
                      >
                        <div className="min-w-0 w-full text-right">
                          <p className="truncate text-[10px] font-medium leading-tight text-zinc-900">{task.title}</p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>

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
              const isCollapsed = collapsedProjects.has(project.id);
              return (
                <div key={project.id}>
                  <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: PROJECT_ROW_H }} />
                  {!isCollapsed && projectTasks.map((task) => {
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
                        {(() => {
                          const barOpt = task.assignedTo ? options.find((o) => o.value === task.assignedTo) : null;
                          const barColor = barOpt?.color || "#3b82f6";
                          const barTextColor = barOpt?.textColor || "#ffffff";
                          const dateRangeText = start.isSame(due, "day")
                            ? start.format("MM/DD/YY")
                            : `${start.format("MM/DD/YY")} - ${due.format("MM/DD/YY")}`;
                          return (
                            <>
                              <div
                                data-task-id={task.id}
                                className={`absolute flex items-center rounded ${pending === task.id ? "opacity-60" : ""}`}
                                style={{
                                  left,
                                  width: barWidth,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  height: TASK_BAR_H,
                                  cursor: "grab",
                                  backgroundColor: barColor,
                                  color: barTextColor,
                                }}
                                onClick={() => {
                                  if (!dragOccurredRef.current) {
                                    openTaskEditor(task);
                                  }
                                }}
                              >
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, task, "resizeStart")}
                                  className="h-full w-2 shrink-0 cursor-ew-resize rounded-l"
                                  style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
                                />
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, task, "move")}
                                  className="relative h-full min-w-0 flex-1 cursor-grab overflow-hidden"
                                >
                                  <span
                                    className="block truncate px-1.5 text-left"
                                    title={dateRangeText}
                                    style={{ fontSize: barLabelFontPx, lineHeight: `${TASK_BAR_H}px` }}
                                  >
                                    {dateRangeText}
                                  </span>
                                </div>
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, task, "resizeEnd")}
                                  className="h-full w-2 shrink-0 cursor-ew-resize rounded-r"
                                  style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
                                />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {projectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setProjectModalOpen(false);
              setProjectSaveError(null);
              setNewProjectName("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-zinc-900">New project</h3>
              <button
                type="button"
                onClick={() => {
                  setProjectModalOpen(false);
                  setProjectSaveError(null);
                  setNewProjectName("");
                }}
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newProjectName.trim();
                if (!trimmed) return;
                setProjectSaveError(null);
                setProjectSaving(true);
                void onAddProject({ name: trimmed, address: "" })
                  .then(() => {
                    setProjectModalOpen(false);
                    setNewProjectName("");
                    setProjectSaveError(null);
                  })
                  .catch((err: unknown) => {
                    const code =
                      err && typeof err === "object" && "code" in err
                        ? String((err as { code?: string }).code)
                        : "";
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setProjectSaveError(
                      code === "permission-denied"
                        ? "Firestore blocked the save. Check Firestore rules and that you are signed in."
                        : message || "Could not save project.",
                    );
                    console.error(err);
                  })
                  .finally(() => setProjectSaving(false));
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Project name</label>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  placeholder="Name"
                />
              </div>
              {projectSaveError && <p className="text-xs text-red-600">{projectSaveError}</p>}
              <button
                type="submit"
                disabled={projectSaving}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {projectSaving ? "Saving…" : "Create project"}
              </button>
            </form>
          </div>
        </div>
      )}

      {taskModalProjectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setTaskModalProjectId(null);
              setTaskError(null);
              setTaskNotes("");
              setTaskAssignedTo("");
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
                  setTaskNotes("");
                  setTaskAssignedTo("");
                }}
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim() || !onAddTask) return;
                setTaskError(null);
                setTaskSaving(true);
                void onAddTask(taskModalProjectId, {
                  title: taskTitle.trim(),
                  startDate: taskStartDate || undefined,
                  dueDate: taskDueDate || undefined,
                  notes: taskNotes.trim() || undefined,
                  assignedTo: taskAssignedTo || undefined,
                })
                  .then(() => {
                    setTaskModalProjectId(null);
                    setTaskTitle("");
                    setTaskStartDate("");
                    setTaskDueDate("");
                    setTaskNotes("");
                    setTaskAssignedTo("");
                    setTaskError(null);
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setTaskError(message || "Could not add task.");
                    console.error(err);
                  })
                  .finally(() => setTaskSaving(false));
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
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Complete Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Assigned To</label>
                <select
                  value={taskAssignedTo}
                  onChange={(e) => setTaskAssignedTo(e.target.value as AssignedTo)}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label || "(none)"}
                    </option>
                  ))}
                </select>
                {taskAssignedTo && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: options.find((o) => o.value === taskAssignedTo)?.color }}
                    />
                    <span className="text-xs text-zinc-500">Bar color preview</span>
                  </div>
                )}
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
                    setTaskNotes("");
                    setTaskAssignedTo("");
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
                <p className="text-sm text-zinc-600">
                  {projects.find((p) => p.id === notesTask.projectId)?.name ?? "Project"}
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!notesTask) return;
                if (!editTitle.trim()) {
                  setEditError("Title is required.");
                  return;
                }
                if (!editStartDate || !editDueDate) {
                  setEditError("Start and due dates are required.");
                  return;
                }
                if (editStartDate > editDueDate) {
                  setEditError("Start date must be on or before due date.");
                  return;
                }
                setEditError(null);
                setEditSaving(true);
                void onUpdateTask(notesTask.id, {
                  title: editTitle.trim(),
                  startDate: editStartDate,
                  dueDate: editDueDate,
                  notes: editNotes,
                  assignedTo: editAssignedTo,
                  status: editStatus,
                })
                  .then(() => {
                    setNotesTask((prev) => {
                      if (!prev || prev.id !== notesTask.id) return prev;
                      return {
                        ...prev,
                        title: editTitle.trim(),
                        startDate: editStartDate,
                        dueDate: editDueDate,
                        notes: editNotes,
                        assignedTo: editAssignedTo,
                        status: editStatus,
                      };
                    });
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setEditError(message || "Could not update task.");
                    console.error(err);
                  })
                  .finally(() => setEditSaving(false));
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Start</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Due</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Assigned To</label>
                  <select
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value as AssignedTo)}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  >
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label || "(none)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ProjectTask["status"])}
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                  placeholder="Optional notes"
                />
              </div>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <button
                type="submit"
                disabled={editSaving}
                className="w-full rounded bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setNotesTask(null)}
              className="mt-2 w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Close
            </button>
            <button
              type="button"
              disabled={editSaving}
              onClick={() => {
                if (!notesTask) return;
                if (!onDeleteTask) {
                  setEditError("Delete is not available right now.");
                  return;
                }
                const confirmed = window.confirm("Are you sure you want to delete this task?");
                if (!confirmed) return;
                setEditError(null);
                setEditSaving(true);
                void onDeleteTask(notesTask.id)
                  .then(() => {
                    setNotesTask(null);
                  })
                  .catch((err: unknown) => {
                    const message =
                      err && typeof err === "object" && "message" in err
                        ? String((err as { message?: string }).message)
                        : "";
                    setEditError(message || "Could not delete task.");
                    console.error(err);
                  })
                  .finally(() => setEditSaving(false));
              }}
              className="mt-2 w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {editSaving ? "Working..." : "Delete Task"}
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
