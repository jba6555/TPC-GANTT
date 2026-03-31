import dayjs from "dayjs";
import type { ProjectTask, TaskDependency, TaskDependencyType } from "@/types/scheduler";

export type DependencyGraph = {
  byId: Map<string, ProjectTask>;
  childrenByParent: Map<string, string[]>;
};

export function buildDependencyGraph(tasks: ProjectTask[]): DependencyGraph {
  const byId = new Map<string, ProjectTask>();
  const childrenByParent = new Map<string, string[]>();

  for (const task of tasks) {
    byId.set(task.id, task);
  }

  for (const task of tasks) {
    const dep = task.dependency;
    if (!dep) continue;
    const parentId = dep.dependsOnTaskId;
    if (!byId.has(parentId)) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(task.id);
    childrenByParent.set(parentId, children);
  }

  return { byId, childrenByParent };
}

export function detectDependencyCycle(tasks: ProjectTask[]): string[] | null {
  const { byId, childrenByParent } = buildDependencyGraph(tasks);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    if (visiting.has(nodeId)) {
      const idx = path.indexOf(nodeId);
      return idx !== -1;
    }
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    path.push(nodeId);
    const children = childrenByParent.get(nodeId) ?? [];
    for (const childId of children) {
      if (dfs(childId)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    path.pop();
    visited.add(nodeId);
    return false;
  }

  for (const id of byId.keys()) {
    if (!visited.has(id)) {
      if (dfs(id)) {
        const cycleStart = path.indexOf(path[path.length - 1]);
        return path.slice(cycleStart);
      }
    }
  }

  return null;
}

export function computeDependentDates(tasks: ProjectTask[], rootTaskId: string): Map<string, { startDate: string; dueDate: string }> {
  const { byId, childrenByParent } = buildDependencyGraph(tasks);
  const updates = new Map<string, { startDate: string; dueDate: string }>();

  const queue: string[] = [];
  const directChildren = childrenByParent.get(rootTaskId) ?? [];
  queue.push(...directChildren);

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    const task = byId.get(taskId);
    if (!task || !task.dependency) continue;

    const parent = byId.get(task.dependency.dependsOnTaskId);
    if (!parent) continue;

    const parentStartStr = parent.startDate || parent.dueDate;
    const parentEndStr = parent.dueDate;
    if (!parentStartStr || !parentEndStr) continue;

    const parentStart = dayjs(parentStartStr);
    const parentEnd = dayjs(parentEndStr);

    const currentStartStr = task.startDate || task.dueDate;
    const currentEndStr = task.dueDate;
    if (!currentStartStr || !currentEndStr) continue;

    const currentStart = dayjs(currentStartStr);
    const currentEnd = dayjs(currentEndStr);
    const durationDays = Math.max(currentEnd.diff(currentStart, "day"), 0);

    const offsetDays = task.dependency.offsetDays ?? 0;
    const type: TaskDependencyType = task.dependency.type;

    let nextStart = currentStart;
    let nextEnd = currentEnd;

    if (type === "FS") {
      nextStart = parentEnd.add(offsetDays, "day");
      nextEnd = nextStart.add(durationDays, "day");
    } else if (type === "SS") {
      nextStart = parentStart.add(offsetDays, "day");
      nextEnd = nextStart.add(durationDays, "day");
    } else if (type === "FF") {
      nextEnd = parentEnd.add(offsetDays, "day");
      nextStart = nextEnd.subtract(durationDays, "day");
    }

    const nextStartStr = nextStart.format("YYYY-MM-DD");
    const nextEndStr = nextEnd.format("YYYY-MM-DD");

    if (nextStartStr !== task.startDate || nextEndStr !== task.dueDate) {
      updates.set(taskId, { startDate: nextStartStr, dueDate: nextEndStr });
      const updatedTask: ProjectTask = {
        ...task,
        startDate: nextStartStr,
        dueDate: nextEndStr,
      };
      byId.set(taskId, updatedTask);
    }

    const grandchildren = childrenByParent.get(taskId) ?? [];
    for (const childId of grandchildren) {
      if (!queue.includes(childId)) {
        queue.push(childId);
      }
    }
  }

  return updates;
}

