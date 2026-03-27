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

export type AssignedTo = string;

export interface AssignedOption {
  value: string;
  label: string;
  color: string;
  textColor: string;
}

export const DEFAULT_ASSIGNED_OPTIONS: AssignedOption[] = [
  { value: "", label: "", color: "#3b82f6", textColor: "#ffffff" },
  { value: "Development", label: "Development", color: "#8b5cf6", textColor: "#ffffff" },
  { value: "Design", label: "Design", color: "#ec4899", textColor: "#ffffff" },
  { value: "Pre-Con", label: "Pre-Con", color: "#f59e0b", textColor: "#ffffff" },
  { value: "Construction", label: "Construction", color: "#ef4444", textColor: "#ffffff" },
  { value: "Bryan", label: "Bryan", color: "#10b981", textColor: "#ffffff" },
  { value: "Chris", label: "Chris", color: "#06b6d4", textColor: "#ffffff" },
  { value: "Josh", label: "Josh", color: "#6366f1", textColor: "#ffffff" },
  { value: "Marc", label: "Marc", color: "#f97316", textColor: "#ffffff" },
];

/** @deprecated Use dynamic options from Firestore. Kept for backward compat. */
export const ASSIGNED_OPTIONS = DEFAULT_ASSIGNED_OPTIONS;

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
  assignedTo?: AssignedTo;
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
  assignedTo?: AssignedTo;
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

export type ChangeAction =
  | "create_project"
  | "update_project"
  | "delete_project"
  | "create_task"
  | "update_task"
  | "delete_tasks"
  | "bulk_import";

export interface ChangelogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: ChangeAction;
  entityType: "project" | "task";
  entityId: string;
  projectName?: string;
  description: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
