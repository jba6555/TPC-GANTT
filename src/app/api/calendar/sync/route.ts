import * as admin from "firebase-admin";
import { NextResponse, type NextRequest } from "next/server";
import { getFirebaseAdminApp, getAdminFirestore } from "@/lib/firebase-admin";
import {
  buildAllDayEvent,
  getCalendarClient,
  type CalendarTaskPayload,
} from "@/lib/server/googleCalendarServer";
import { isCalendarSyncConfigured } from "@/lib/server/serviceAccount";

export const runtime = "nodejs";

type SyncBody =
  | {
      action: "upsert";
      taskId: string;
      projectName: string;
      task: CalendarTaskPayload & { googleCalendarEventId?: string };
    }
  | {
      action: "delete";
      taskId: string;
      googleCalendarEventId?: string;
    };

function parseBody(raw: unknown): SyncBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (action !== "upsert" && action !== "delete") return null;
  const taskId = typeof o.taskId === "string" ? o.taskId : "";
  if (!taskId) return null;

  if (action === "delete") {
    return {
      action: "delete",
      taskId,
      googleCalendarEventId: typeof o.googleCalendarEventId === "string" ? o.googleCalendarEventId : undefined,
    };
  }

  const projectName = typeof o.projectName === "string" ? o.projectName : "";
  const task = o.task;
  if (!projectName || !task || typeof task !== "object") return null;
  const t = task as Record<string, unknown>;
  const title = typeof t.title === "string" ? t.title : "";
  const dueDate = typeof t.dueDate === "string" ? t.dueDate : "";
  if (!title || !dueDate) return null;
  const type = t.type === "milestone" || t.type === "task" ? t.type : "task";

  return {
    action: "upsert",
    taskId,
    projectName,
    task: {
      title,
      type,
      startDate: typeof t.startDate === "string" ? t.startDate : undefined,
      dueDate,
      notes: typeof t.notes === "string" ? t.notes : undefined,
      assignedTo: typeof t.assignedTo === "string" ? t.assignedTo : undefined,
      googleCalendarEventId:
        typeof t.googleCalendarEventId === "string" ? t.googleCalendarEventId : undefined,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!isCalendarSyncConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 401 });
  }

  try {
    const app = getFirebaseAdminApp();
    await app.auth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const calendar = getCalendarClient();
  if (!calendar) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  if (body.action === "delete") {
    const eventId = body.googleCalendarEventId?.trim();
    if (!eventId) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    try {
      await calendar.events.delete({
        calendarId,
        eventId,
      });
    } catch (e: unknown) {
      const err = e as { code?: number };
      if (err.code === 404) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      console.error("[calendar/sync] delete failed:", e);
      return NextResponse.json({ ok: false, error: "calendar_delete_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  const { taskId, projectName, task } = body;
  const eventPayload = buildAllDayEvent(projectName, task);
  const existingId = task.googleCalendarEventId?.trim();

  try {
    if (existingId) {
      await calendar.events.patch({
        calendarId,
        eventId: existingId,
        requestBody: eventPayload,
      });
      return NextResponse.json({ ok: true, googleCalendarEventId: existingId });
    }

    const inserted = await calendar.events.insert({
      calendarId,
      requestBody: eventPayload,
    });
    const newId = inserted.data.id;
    if (!newId) {
      return NextResponse.json({ ok: false, error: "no_event_id" }, { status: 502 });
    }

    const db = getAdminFirestore();
    await db.collection("tasks").doc(taskId).update({
      googleCalendarEventId: newId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, googleCalendarEventId: newId });
  } catch (e) {
    console.error("[calendar/sync] upsert failed:", e);
    return NextResponse.json({ ok: false, error: "calendar_upsert_failed" }, { status: 502 });
  }
}
