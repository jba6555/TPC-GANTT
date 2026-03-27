import dayjs from "dayjs";
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type { TaskType } from "@/types/scheduler";
import { getServiceAccountFromEnv } from "@/lib/server/serviceAccount";

export type CalendarTaskPayload = {
  title: string;
  type: TaskType;
  startDate?: string;
  dueDate: string;
  notes?: string;
  assignedTo?: string;
};

export function getCalendarClient() {
  const sa = getServiceAccountFromEnv();
  if (!sa) return null;
  const auth = new google.auth.JWT({
    email: sa.clientEmail,
    key: sa.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

/** All-day event: Google `end.date` is exclusive (day after last inclusive day). */
export function buildAllDayEvent(
  projectName: string,
  task: CalendarTaskPayload,
): calendar_v3.Schema$Event {
  const startStr = task.startDate || task.dueDate;
  const endInclusive = task.dueDate || task.startDate || startStr;
  const endExclusive = dayjs(endInclusive).add(1, "day").format("YYYY-MM-DD");

  const summary = `${projectName}: ${task.title}`;
  const parts: string[] = [];
  if (task.notes?.trim()) parts.push(task.notes.trim());
  if (task.assignedTo?.trim()) parts.push(`Assigned: ${task.assignedTo.trim()}`);
  parts.push(`Type: ${task.type}`);
  const description = parts.join("\n\n");

  return {
    summary,
    description,
    start: { date: startStr },
    end: { date: endExclusive },
  };
}
