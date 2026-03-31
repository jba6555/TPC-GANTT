import type { Project, ProjectTask } from "@/types/scheduler";

function escapeCsvCell(value: string | undefined | null): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Builds a CSV string from the current projects and tasks data.
 * The column layout matches what CsvBulkUpload expects so the file can be
 * re-imported as-is.
 */
export function buildCsvContent(projects: Project[], tasks: ProjectTask[]): string {
  const headers = [
    "project_name",
    "address",
    "contract_start",
    "contract_end",
    "task_title",
    "task_type",
    "task_start",
    "task_due",
    "task_notes",
    "assigned_to",
    "milestone_importance",
  ];

  const rows: string[] = [headers.join(",")];

  for (const project of projects) {
    const projectTasks = tasks
      .filter((t) => t.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (projectTasks.length === 0) {
      rows.push(
        [
          escapeCsvCell(project.name),
          escapeCsvCell(project.address),
          escapeCsvCell(project.contractStart),
          escapeCsvCell(project.contractEnd),
          "", "", "", "", "", "", "",
        ].join(","),
      );
    } else {
      for (const task of projectTasks) {
        rows.push(
          [
            escapeCsvCell(project.name),
            escapeCsvCell(project.address),
            escapeCsvCell(project.contractStart),
            escapeCsvCell(project.contractEnd),
            escapeCsvCell(task.title),
            escapeCsvCell(task.type),
            escapeCsvCell(task.startDate),
            escapeCsvCell(task.dueDate),
            escapeCsvCell(task.notes),
            escapeCsvCell(task.assignedTo),
            escapeCsvCell(task.milestoneImportance),
          ].join(","),
        );
      }
    }
  }

  return rows.join("\r\n");
}

/** Triggers a browser file download for the given CSV string. */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
