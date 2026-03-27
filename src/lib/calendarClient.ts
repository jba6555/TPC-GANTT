import { getFirebaseAuth } from "@/lib/firebase";
import type { ProjectTask } from "@/types/scheduler";

type UpsertFields = Pick<
  ProjectTask,
  "title" | "type" | "startDate" | "dueDate" | "notes" | "assignedTo" | "googleCalendarEventId"
>;

export async function syncTaskToGoogleCalendar(params: {
  taskId: string;
  projectName: string;
  task: UpsertFields;
}) {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "upsert",
        taskId: params.taskId,
        projectName: params.projectName,
        task: {
          title: params.task.title,
          type: params.task.type,
          startDate: params.task.startDate,
          dueDate: params.task.dueDate,
          notes: params.task.notes,
          assignedTo: params.task.assignedTo,
          googleCalendarEventId: params.task.googleCalendarEventId,
        },
      }),
    });
    if (res.status === 503) return;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[calendar] upsert failed:", res.status, text);
    }
  } catch (e) {
    console.warn("[calendar] upsert error:", e);
  }
}

export async function deleteTaskFromGoogleCalendar(params: {
  taskId: string;
  googleCalendarEventId?: string;
}) {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "delete",
        taskId: params.taskId,
        googleCalendarEventId: params.googleCalendarEventId,
      }),
    });
    if (res.status === 503) return;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[calendar] delete failed:", res.status, text);
    }
  } catch (e) {
    console.warn("[calendar] delete error:", e);
  }
}
