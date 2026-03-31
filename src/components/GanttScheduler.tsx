"use client";

import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssignedOption,
  AssignedTo,
  MilestoneImportance,
  Project,
  ProjectInput,
  ProjectTask,
  TaskDependency,
  TaskDependencyType,
} from "@/types/scheduler";
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
    fields: Partial<
      Pick<ProjectTask, "title" | "startDate" | "dueDate" | "notes" | "assignedTo" | "status" | "milestoneImportance">
    >,
  ) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onAddTask?: (
    projectId: string,
    input: {
      title: string;
      startDate?: string;
      dueDate?: string;
      notes?: string;
      assignedTo?: string;
      dependency?: import("@/types/scheduler").TaskDependency;
    },
  ) => Promise<void>;
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

/** Rough label width for proportional UI text; used to place date labels beside the bar when the bar is too narrow. */
function approximateLabelWidthPx(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * 0.52;
}

function DependentTaskArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v6a3 3 0 0 0 3 3h11" />
      <path d="m14 11 4 4-4 4" />
    </svg>
  );
}

export default function GanttScheduler({ projects, tasks, assignedOptions, onAddProject, onDeleteProject, onUpdateTaskDates, onUpdateTask, onDeleteTask, onAddTask }: GanttSchedulerProps) {
  const options = assignedOptions ?? ASSIGNED_OPTIONS;
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [timelineSaveError, setTimelineSaveError] = useState<string | null>(null);
  const [notesTask, setNotesTask] = useState<ProjectTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState<AssignedTo>("");
  const [editStatus, setEditStatus] = useState<ProjectTask["status"]>("not_started");
  const [editDependency, setEditDependency] = useState<TaskDependency | undefined>(undefined);
  const [editMilestoneImportance, setEditMilestoneImportance] = useState<MilestoneImportance>("major");
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
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskIsDependent, setTaskIsDependent] = useState(false);
  const [taskDependencyParentId, setTaskDependencyParentId] = useState<string>("");
  const [taskDependencyType, setTaskDependencyType] = useState<TaskDependencyType>("FS");
  const [taskDependencyOffsetDays, setTaskDependencyOffsetDays] = useState<number>(0);
  const [taskEndMode, setTaskEndMode] = useState<"duration" | "fixed">("duration");
  const [taskDurationDays, setTaskDurationDays] = useState<number | "">("");
  const [taskFixedEndDate, setTaskFixedEndDate] = useState("");
  const [taskMilestoneImportance, setTaskMilestoneImportance] = useState<MilestoneImportance>("major");
  const [showMajorOnlyGlobal, setShowMajorOnlyGlobal] = useState(false);
  const [majorOnlyProjects, setMajorOnlyProjects] = useState<Set<string>>(new Set());
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const hasScrolledToToday = useRef(false);
  const scrollFractionRef = useRef<number | null>(null);
  const scrollToTodayRef = useRef(false);

  const openTaskEditor = useCallback((task: ProjectTask) => {
    setEditSaving(false);
    setNotesTask(task);
    setEditTitle(task.title);
    setEditStartDate(task.startDate || task.dueDate);
    setEditDueDate(task.dueDate);
    setEditNotes(task.notes || "");
    setEditAssignedTo(task.assignedTo || "");
    setEditStatus(task.status);
    setEditDependency(task.dependency);
    const inferredImportance: MilestoneImportance =
      task.milestoneImportance ?? (task.type === "milestone" ? "major" : "minor");
    setEditMilestoneImportance(inferredImportance);
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

  // Restore last-used zoom level from localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("scheduler-zoom");
      if (!stored) return;
      if (ZOOM_KEYS.includes(stored as ZoomLevel)) {
        setZoom(stored as ZoomLevel);
      }
    } catch {
      // Ignore storage errors and fall back to default.
    }
  }, []);

  // Persist zoom level when it changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("scheduler-zoom", zoom);
    } catch {
      // Ignore storage errors.
    }
  }, [zoom]);

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
      setTimelineSaveError(null);
      void onUpdateTaskDates(task.id, nextStartStr, nextDueStr)
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setTimelineSaveError(msg);
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
      arr.sort((a, b) => {
        // Nearest → farthest by scheduled date.
        // Prefer startDate when present; otherwise fall back to dueDate.
        const aStart = a.startDate || a.dueDate;
        const bStart = b.startDate || b.dueDate;
        if (aStart !== bStart) return aStart < bStart ? -1 : 1;

        // Tie-break by due date (milestones/tasks with same start).
        if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;

        // Keep a stable-ish ordering within the same date bucket.
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.title !== b.title) return a.title.localeCompare(b.title);
        return a.id.localeCompare(b.id);
      });
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  function isMajorMilestone(task: ProjectTask): boolean {
    const importance: MilestoneImportance =
      task.milestoneImportance ?? (task.type === "milestone" ? "major" : "minor");
    return task.type === "milestone" && importance === "major";
  }

  function getVisibleTasksForProject(projectId: string): ProjectTask[] {
    const projectTasks = tasksByProject.get(projectId) ?? [];
    if (!showMajorOnlyGlobal && !majorOnlyProjects.has(projectId)) {
      return projectTasks;
    }
    return projectTasks.filter((t) => isMajorMilestone(t));
  }

  const sortedProjects = useMemo(() => {
    const todayKey = dayjs().format("YYYY-MM-DD");

    const withKey = projects.map((project) => {
      const projectTasks = getVisibleTasksForProject(project.id);

      let nextUpcoming: string | null = null;
      let latestPast: string | null = null;

      for (const task of projectTasks) {
        const startKey = task.startDate || null;
        const fallbackKey = task.startDate || task.dueDate || null;
        if (!fallbackKey) continue;

        if (startKey && startKey >= todayKey) {
          // Upcoming task, keyed strictly by start date.
          if (!nextUpcoming || startKey < nextUpcoming) nextUpcoming = startKey;
        } else {
          // No upcoming start date: use the most recent prior scheduled point
          // (start when present, otherwise due) only for secondary ordering.
          if (!latestPast || fallbackKey > latestPast) latestPast = fallbackKey;
        }
      }

      const hasUpcoming = !!nextUpcoming;
      const sortKey = nextUpcoming ?? latestPast;

      return {
        project,
        hasUpcoming,
        sortKey,
      };
    });

    withKey.sort((a, b) => {
      // Projects with an upcoming task come before projects with only past tasks (or no tasks).
      if (a.hasUpcoming && !b.hasUpcoming) return -1;
      if (!a.hasUpcoming && b.hasUpcoming) return 1;

      // If both have the same upcoming/past state, compare by sortKey.
      if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) {
        if (a.hasUpcoming && b.hasUpcoming) {
          // Both upcoming: earlier date first.
          return a.sortKey < b.sortKey ? -1 : 1;
        }
        // Both past-only: more recent past first.
        return a.sortKey > b.sortKey ? -1 : 1;
      }

      // Stable fallback: keep a deterministic order by name.
      return a.project.name.localeCompare(b.project.name);
    });

    return withKey.map((entry) => entry.project);
  }, [projects, tasksByProject]);

  type TaskTreeNode = { task: ProjectTask; children: TaskTreeNode[]; depth: number };

  function buildTaskTree(projectTasks: ProjectTask[]): TaskTreeNode[] {
    const byId = new Map<string, ProjectTask>();
    const childrenByParent = new Map<string, ProjectTask[]>();
    const order = new Map<string, number>();
    projectTasks.forEach((t, index) => {
      byId.set(t.id, t);
      order.set(t.id, index);
    });

    for (const task of projectTasks) {
      const dep = task.dependency;
      if (!dep) continue;
      const parent = byId.get(dep.dependsOnTaskId);
      if (!parent) continue;
      const arr = childrenByParent.get(parent.id) ?? [];
      arr.push(task);
      childrenByParent.set(parent.id, arr);
    }

    const roots: ProjectTask[] = [];
    for (const task of projectTasks) {
      const dep = task.dependency;
      if (!dep || !byId.has(dep.dependsOnTaskId)) {
        roots.push(task);
      }
    }
    roots.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));

    const result: TaskTreeNode[] = [];
    const visited = new Set<string>();

    function walk(task: ProjectTask, depth: number): TaskTreeNode | null {
      if (visited.has(task.id)) return null;
      visited.add(task.id);
      const node: TaskTreeNode = { task, children: [], depth };
      const children = (childrenByParent.get(task.id) ?? [])
        .slice()
        .sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
      for (const child of children) {
        const childNode = walk(child, depth + 1);
        if (childNode) node.children.push(childNode);
      }
      return node;
    }

    for (const root of roots) {
      const n = walk(root, 0);
      if (n) result.push(n);
    }

    for (const task of projectTasks) {
      if (!visited.has(task.id)) {
        const n = walk(task, 0);
        if (n) result.push(n);
      }
    }

    return result;
  }

  function flattenTaskTree(nodes: TaskTreeNode[]): TaskTreeNode[] {
    const flat: TaskTreeNode[] = [];
    const walk = (node: TaskTreeNode) => {
      flat.push(node);
      for (const child of node.children) {
        walk(child);
      }
    };
    for (const node of nodes) {
      walk(node);
    }
    return flat;
  }

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
  /** Resize handles (w-2) + inner horizontal padding (px-1.5) — space available for in-bar date text. */
  const BAR_DATE_INSET_PX = 8 + 8 + 6 + 6;
  const todayPx = dayjs().diff(chartStart, "day") * pxPerDay;

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3">
      {timelineSaveError && (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="font-medium">Timeline update failed</p>
          <p className="mt-1 break-words opacity-90">{timelineSaveError}</p>
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMajorOnlyGlobal((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              showMajorOnlyGlobal
                ? "border-amber-500 bg-amber-100 text-amber-900"
                : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
            title="Toggle major milestones for all projects"
            aria-pressed={showMajorOnlyGlobal}
          >
            <span className="text-[11px]">★</span>
            <span>{showMajorOnlyGlobal ? "Major only" : "All tasks"}</span>
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
      </div>

      <div className="flex min-w-0">
        <div
          className="shrink-0 border-r border-zinc-200 bg-white"
          style={{ width: LABEL_WIDTH }}
        >
          <div className="border-b border-zinc-200 bg-zinc-100" style={{ height: HEADER_ROW_H }} />
          <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: HEADER_ROW_H }} />
          <div className="border-b border-zinc-200 bg-white" style={{ height: HEADER_ROW_H }} />
          {sortedProjects.map((project) => {
            const projectTasks = getVisibleTasksForProject(project.id);
            const tree = buildTaskTree(projectTasks);
            const flatTree = flattenTaskTree(tree);
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
                    <button
                      type="button"
                      onClick={() =>
                        setMajorOnlyProjects((prev) => {
                          const next = new Set(prev);
                          if (next.has(project.id)) next.delete(project.id);
                          else next.add(project.id);
                          return next;
                        })
                      }
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-colors ${
                        showMajorOnlyGlobal || majorOnlyProjects.has(project.id)
                          ? "border-amber-500 bg-amber-200 text-amber-900"
                          : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                      title="Show only major milestones for this project"
                      aria-pressed={showMajorOnlyGlobal || majorOnlyProjects.has(project.id)}
                    >
                      ★
                    </button>
                    {onAddTask && (
                      <button
                        type="button"
                        onClick={() => {
                          setTaskModalProjectId(project.id);
                          setTaskError(null);
                          setTaskTitle("");
                          setTaskStartDate("");
                          setTaskDueDate("");
                          setTaskNotes("");
                          setTaskAssignedTo("");
                          setTaskIsDependent(false);
                          setTaskDependencyParentId("");
                          setTaskDependencyOffsetDays(0);
                          setTaskDurationDays("");
                          setTaskMilestoneImportance("major");
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
                  flatTree.map((node) => {
                    const task = node.task;
                    const depth = node.depth;
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
                          <p
                            className="truncate text-[10px] font-medium leading-tight text-zinc-900"
                            style={{ paddingLeft: depth > 0 ? depth * 10 : 0 }}
                          >
                            {task.dependency ? (
                              <DependentTaskArrowIcon className="mr-1 inline-block h-3.5 w-3.5 align-middle text-slate-700" />
                            ) : null}
                            {task.title}
                          </p>
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

            {sortedProjects.map((project) => {
              const projectTasks = getVisibleTasksForProject(project.id);
              const tree = buildTaskTree(projectTasks);
              const flatTree = flattenTaskTree(tree);
              const isCollapsed = collapsedProjects.has(project.id);
              return (
                <div key={project.id}>
                  <div className="border-b border-zinc-200 bg-zinc-50" style={{ height: PROJECT_ROW_H }} />
                  {!isCollapsed && flatTree.map((node) => {
                    const task = node.task;
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
                          const assigneeDisplay =
                            barOpt?.label || (task.assignedTo ? String(task.assignedTo) : "");
                          const barLabelText = assigneeDisplay
                            ? `${dateRangeText} (${assigneeDisplay})`
                            : dateRangeText;
                          const innerTextMaxPx = Math.max(0, barWidth - BAR_DATE_INSET_PX);
                          const dateFitsInBar =
                            innerTextMaxPx >= approximateLabelWidthPx(barLabelText, barLabelFontPx) + 2;
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
                                  {dateFitsInBar ? (
                                    <span
                                      className="block truncate px-1.5 text-left"
                                      title={barLabelText}
                                      style={{ fontSize: barLabelFontPx, lineHeight: `${TASK_BAR_H}px` }}
                                    >
                                      {barLabelText}
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, task, "resizeEnd")}
                                  className="h-full w-2 shrink-0 cursor-ew-resize rounded-r"
                                  style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
                                />
                              </div>
                              {!dateFitsInBar ? (
                                <span
                                  className="pointer-events-none absolute z-[5] whitespace-nowrap text-zinc-700"
                                  title={barLabelText}
                                  style={{
                                    left: left + barWidth + 6,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    fontSize: barLabelFontPx,
                                    lineHeight: `${TASK_BAR_H}px`,
                                  }}
                                >
                                  {barLabelText}
                                </span>
                              ) : null}
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
                setProjectModalOpen(false);
                setNewProjectName("");
                void onAddProject({ name: trimmed, address: "" }).catch((err: unknown) => {
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
                  setNewProjectName(trimmed);
                  setProjectModalOpen(true);
                  console.error(err);
                });
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
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white"
              >
                Create project
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
                  setTaskIsDependent(false);
                  setTaskDependencyParentId("");
                  setTaskDependencyOffsetDays(0);
                  setTaskDurationDays("");
                  setTaskMilestoneImportance("major");
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
                const projectId = taskModalProjectId;
                if (!projectId) return;

                let startDateForSave: string | undefined;
                let dueDateForSave: string | undefined;
                let dependency: TaskDependency | undefined;

                if (taskIsDependent) {
                  if (!taskDependencyParentId) {
                    setTaskError("Select a parent task for the dependency.");
                    return;
                  }
                  const projectTasks = tasksByProject.get(projectId) ?? [];
                  const parent = projectTasks.find((t) => t.id === taskDependencyParentId);
                  if (!parent) {
                    setTaskError("Selected parent task could not be found.");
                    return;
                  }
                  const parentStartStr = parent.startDate || parent.dueDate;
                  const parentEndStr = parent.dueDate;
                  if (!parentStartStr || !parentEndStr) {
                    setTaskError("Parent task must have dates before creating a dependent task.");
                    return;
                  }

                  const parentStart = dayjs(parentStartStr);
                  const parentEnd = dayjs(parentEndStr);
                  const offset = taskDependencyOffsetDays || 0;

                  let childStart = parentStart;
                  let childEnd: dayjs.Dayjs;
                  if (taskDependencyType === "FS") {
                    childStart = parentEnd.add(offset, "day");
                  } else if (taskDependencyType === "SS") {
                    childStart = parentStart.add(offset, "day");
                  } else {
                    // FF: child end is offset from parent end; start will be derived from duration/fixed end.
                    childStart = parentStart;
                  }

                  if (taskEndMode === "duration") {
                    if (!taskDurationDays || taskDurationDays <= 0) {
                      setTaskError("Enter a positive duration in days.");
                      return;
                    }
                    if (taskDependencyType === "FF") {
                      // For FF with duration, end is offset from parent end.
                      const endFromParent = parentEnd.add(offset, "day");
                      childEnd = endFromParent;
                      childStart = endFromParent.subtract(taskDurationDays - 1, "day");
                    } else {
                      childEnd = childStart.add(taskDurationDays - 1, "day");
                    }
                  } else {
                    // Fixed scheduled end date mode.
                    if (!taskFixedEndDate) {
                      setTaskError("Select a scheduled completion date.");
                      return;
                    }
                    childEnd = dayjs(taskFixedEndDate);
                    if (childEnd.isBefore(childStart, "day")) {
                      setTaskError("Completion date must be on or after the start date.");
                      return;
                    }
                    if (taskDependencyType === "FF") {
                      // Align end with offset from parent end, ignore manual mismatch.
                      childEnd = parentEnd.add(offset, "day");
                      if (taskEndMode === "fixed" && taskFixedEndDate) {
                        childEnd = dayjs(taskFixedEndDate);
                      }
                    }
                  }

                  startDateForSave = childStart.format("YYYY-MM-DD");
                  dueDateForSave = childEnd.format("YYYY-MM-DD");

                  dependency = {
                    dependsOnTaskId: taskDependencyParentId,
                    type: taskDependencyType,
                    offsetDays: offset,
                  };
                } else {
                  startDateForSave = taskStartDate || undefined;
                  dueDateForSave = taskDueDate || undefined;
                }

                const payload = {
                  title: taskTitle.trim(),
                  startDate: startDateForSave,
                  dueDate: dueDateForSave,
                  notes: taskNotes.trim() || undefined,
                  assignedTo: taskAssignedTo || undefined,
                  dependency,
                  milestoneImportance: taskMilestoneImportance,
                };

                setTaskError(null);
                setTaskModalProjectId(null);
                setTaskTitle("");
                setTaskStartDate("");
                setTaskDueDate("");
                setTaskNotes("");
                setTaskAssignedTo("");
                setTaskIsDependent(false);
                setTaskDependencyParentId("");
                setTaskDependencyOffsetDays(0);
                setTaskEndMode("duration");
                setTaskDurationDays("");
                setTaskFixedEndDate("");
                setTaskMilestoneImportance("major");

                void onAddTask(projectId, payload).catch((err: unknown) => {
                  const message =
                    err && typeof err === "object" && "message" in err
                      ? String((err as { message?: string }).message)
                      : "";
                  window.alert(message || "Could not add task.");
                  console.error(err);
                });
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

              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-700">Milestone type</p>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-300 text-amber-500"
                      checked={taskMilestoneImportance === "major"}
                      onChange={(e) => {
                        if (!e.target.checked) return;
                        setTaskMilestoneImportance("major");
                      }}
                    />
                    <span>Major Milestone</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-300 text-amber-500"
                      checked={taskMilestoneImportance === "minor"}
                      onChange={(e) => {
                        if (!e.target.checked) return;
                        setTaskMilestoneImportance("minor");
                      }}
                    />
                    <span>Minor Milestone</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={taskIsDependent}
                    onChange={(e) => setTaskIsDependent(e.target.checked)}
                    className="h-3 w-3 rounded border-zinc-300 text-zinc-900"
                  />
                  Make this a dependent task
                </label>
                {taskIsDependent && (
                  <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-700">Depends on</label>
                      <select
                        value={taskDependencyParentId}
                        onChange={(e) => setTaskDependencyParentId(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                      >
                        <option value="">Select parent task</option>
                        {(tasksByProject.get(taskModalProjectId ?? "") ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-700">Dependency type</label>
                        <select
                          value={taskDependencyType}
                          onChange={(e) => setTaskDependencyType(e.target.value as TaskDependencyType)}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                        >
                          <option value="FS">Start after parent finishes (FS)</option>
                          <option value="SS">Start with parent (SS)</option>
                          <option value="FF">Finish after parent finishes (FF)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-700">Offset (days)</label>
                        <input
                          type="number"
                          value={taskDependencyOffsetDays}
                          onChange={(e) => setTaskDependencyOffsetDays(Number(e.target.value || 0))}
                          className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-zinc-700">How does this task finish?</p>
                      <div className="flex flex-col gap-1 text-[11px] text-zinc-700">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="dependent-end-mode"
                            value="duration"
                            checked={taskEndMode === "duration"}
                            onChange={() => setTaskEndMode("duration")}
                            className="h-3 w-3 rounded border-zinc-300 text-zinc-900"
                          />
                          <span>Duration (days from start)</span>
                        </label>
                        {taskEndMode === "duration" && (
                          <div className="pl-4 space-y-1">
                            <input
                              type="number"
                              value={taskDurationDays}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setTaskDurationDays("");
                                  return;
                                }
                                const n = Number(raw);
                                if (Number.isNaN(n) || n <= 0) {
                                  setTaskDurationDays("");
                                  return;
                                }
                                setTaskDurationDays(n);
                              }}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                            />
                            <p className="text-[11px] text-zinc-600">
                              The completion date will be calculated from the computed start date.
                            </p>
                          </div>
                        )}
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="dependent-end-mode"
                            value="fixed"
                            checked={taskEndMode === "fixed"}
                            onChange={() => setTaskEndMode("fixed")}
                            className="h-3 w-3 rounded border-zinc-300 text-zinc-900"
                          />
                          <span>Scheduled end date</span>
                        </label>
                        {taskEndMode === "fixed" && (
                          <div className="pl-4 space-y-1">
                            <input
                              type="date"
                              value={taskFixedEndDate}
                              onChange={(e) => setTaskFixedEndDate(e.target.value)}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                            />
                            <p className="text-[11px] text-zinc-600">
                              Pick the exact completion date; the duration will be derived.
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600">
                        The start date is based on the parent task, dependency type, and offset. Positive offsets place
                        the task after the parent; negative offsets place it before.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {!taskIsDependent && (
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
              )}

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
                  className="flex-1 rounded bg-zinc-900 py-2 text-sm font-medium text-white"
                >
                  Add Task
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTaskModalProjectId(null);
                    setTaskError(null);
                    setTaskNotes("");
                    setTaskAssignedTo("");
                  }}
                  className="rounded bg-zinc-100 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
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
            if (e.target === e.currentTarget) {
              setNotesTask(null);
              setEditSaving(false);
            }
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
                onClick={() => {
                  setNotesTask(null);
                  setEditSaving(false);
                }}
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
                const fields: Parameters<typeof onUpdateTask>[1] = {
                  title: editTitle.trim(),
                  startDate: editStartDate,
                  dueDate: editDueDate,
                  notes: editNotes,
                  assignedTo: editAssignedTo,
                  status: editStatus,
                  milestoneImportance: editMilestoneImportance,
                };
                // Dependency updates are handled via the dependency editor and server logic.
                void onUpdateTask(notesTask.id, fields)
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
                        milestoneImportance: editMilestoneImportance,
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
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-700">Milestone type</p>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-300 text-amber-500"
                      checked={editMilestoneImportance === "major"}
                      onChange={(e) => {
                        if (!e.target.checked) return;
                        setEditMilestoneImportance("major");
                      }}
                    />
                    <span>Major Milestone</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-300 text-amber-500"
                      checked={editMilestoneImportance === "minor"}
                      onChange={(e) => {
                        if (!e.target.checked) return;
                        setEditMilestoneImportance("minor");
                      }}
                    />
                    <span>Minor Milestone</span>
                  </label>
                </div>
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
