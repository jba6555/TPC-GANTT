export type TaskType = "milestone" | "task";

export interface Project {
  id: string;
  name: string;
  address: string;
  contractStart?: string;
  contractEnd?: string;
  createdBy: string;
  createdAt: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  type: TaskType;
  startDate?: string;
  dueDate: string;
  status: "not_started" | "in_progress" | "complete";
  sortOrder: number;
  notes?: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  address: string;
  contractStart?: string;
  contractEnd?: string;
}

export interface TaskInput {
  title: string;
  type: TaskType;
  startDate?: string;
  dueDate: string;
  notes?: string;
}

export interface BulkImportCsvRow {
  projectName: string;
  address?: string;
  contractStart?: string;
  contractEnd?: string;
  taskTitle?: string;
  taskStartDate?: string;
  taskDueDate?: string;
  taskNotes?: string;
}
