import dayjs from "dayjs";
import { NextResponse } from "next/server";
import { getCalendarClient } from "@/lib/server/googleCalendarServer";
import type { CalendarEvent } from "@/types/scheduler";

export const runtime = "nodejs";

export async function GET() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) {
    return NextResponse.json({ ok: true, events: [] });
  }

  const client = getCalendarClient();
  if (!client) {
    return NextResponse.json({ ok: true, events: [] });
  }

  try {
    const timeMin = dayjs().subtract(7, "day").startOf("day").toISOString();
    const timeMax = dayjs().add(90, "day").endOf("day").toISOString();

    const res = await client.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const items = res.data.items ?? [];
    const events: CalendarEvent[] = items
      .filter((e) => e.id && e.summary)
      .map((e) => {
        const startRaw = e.start?.date ?? e.start?.dateTime;
        const endRaw = e.end?.date ?? e.end?.dateTime;
        // For timed events, end is exclusive — shift back one day for all-day representation
        const endDate = endRaw
          ? e.end?.date
            ? dayjs(endRaw).subtract(1, "day").format("YYYY-MM-DD")
            : dayjs(endRaw).format("YYYY-MM-DD")
          : undefined;

        return {
          id: e.id!,
          summary: e.summary!,
          description: e.description ?? undefined,
          startDate: startRaw ? dayjs(startRaw).format("YYYY-MM-DD") : undefined,
          endDate: endDate ?? undefined,
        };
      });

    return NextResponse.json({ ok: true, events });
  } catch (err) {
    console.error("[calendar/events] Failed to fetch events:", err);
    return NextResponse.json({ ok: false, events: [], error: "Failed to fetch calendar events" }, { status: 500 });
  }
}
