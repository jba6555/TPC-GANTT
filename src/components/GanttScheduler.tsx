"use client";

import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";
import type { ProjectTask } from "@/types/scheduler";

interface GanttSchedulerProps {
  tasks: ProjectTask[];
  onUpdateTaskDates: (taskId: string, startDate?: string, dueDate?: string) => Promise<void>;
}

type DragMode = "move" | "resizeStart" | "resizeEnd";

const DAY_WIDTH = 28;

export default function GanttScheduler({ tasks, onUpdateTaskDates }: GanttSchedulerProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

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
    const startX = event.clientX;
    const originalStart = dayjs(task.startDate || task.dueDate);
    const originalDue = dayjs(task.dueDate);
    setDragTaskId(task.id);

    const onMove = (moveEvent: PointerEvent) => {
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

    const onUp = async (upEvent: PointerEvent) => {
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

      setPending(task.id);
      await onUpdateTaskDates(task.id, nextStart.format("YYYY-MM-DD"), nextDue.format("YYYY-MM-DD"));
      setPending(null);
      setDragTaskId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-base font-semibold text-zinc-900">Gantt Timeline</h3>
      <div className="overflow-auto" ref={viewportRef}>
        <div className="min-w-[900px]">
          <div className="sticky top-0 grid grid-cols-[280px_1fr] bg-white">
            <div className="border-b border-zinc-200 p-2 text-xs font-semibold text-zinc-600">Task</div>
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

          {tasks.map((task) => {
            const start = dayjs(task.startDate || task.dueDate);
            const due = dayjs(task.dueDate);
            const left = start.diff(chartStart, "day") * DAY_WIDTH;
            const width = Math.max(due.diff(start, "day") + 1, 1) * DAY_WIDTH;
            return (
              <div key={task.id} className="grid grid-cols-[280px_1fr] border-b border-zinc-100">
                <div className="p-2 text-sm">
                  <p className="font-medium text-zinc-900">{task.title}</p>
                  <p className="text-xs text-zinc-500">
                    {start.format("MMM D")} - {due.format("MMM D, YYYY")}
                  </p>
                </div>
                <div className="relative h-12 bg-[linear-gradient(to_right,#f4f4f5_1px,transparent_1px)] bg-[length:28px_100%]">
                  <div
                    data-task-id={task.id}
                    className={`absolute top-2 flex h-8 items-center rounded ${
                      dragTaskId === task.id ? "bg-blue-700" : "bg-blue-600"
                    } text-white ${pending === task.id ? "opacity-60" : ""}`}
                    style={{ left, width }}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown(e, task, "resizeStart")}
                      className="h-full w-2 cursor-ew-resize rounded-l bg-blue-800"
                    />
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown(e, task, "move")}
                      className="h-full flex-1 cursor-grab px-2 text-left text-xs"
                    >
                      {task.title}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown(e, task, "resizeEnd")}
                      className="h-full w-2 cursor-ew-resize rounded-r bg-blue-800"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Drag the center to move a task, or drag either edge to change dates.
      </p>
      <p className="text-xs text-zinc-500">
        Timeline range: {chartStart.format("MMM D, YYYY")} - {chartEnd.format("MMM D, YYYY")}
      </p>
    </section>
  );
}
