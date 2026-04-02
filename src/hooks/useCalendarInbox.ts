"use client";

import { useCallback, useEffect, useState } from "react";
import { getDismissedCalendarEventIds, dismissCalendarEventId } from "@/lib/db";
import type { CalendarEvent, ProjectTask } from "@/types/scheduler";

const SESSION_KEY = "calendarInbox_fetched";

interface UseCalendarInboxResult {
  pendingEvents: CalendarEvent[];
  isLoading: boolean;
  dismissEvent: (eventId: string) => Promise<void>;
  refetch: () => void;
}

export function useCalendarInbox(tasks: ProjectTask[]): UseCalendarInboxResult {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const fetchEvents = useCallback(async (force = false) => {
    if (!force && sessionStorage.getItem(SESSION_KEY)) return;
    setIsLoading(true);
    try {
      const [eventsRes, dismissed] = await Promise.all([
        fetch("/api/calendar/events").then((r) => r.json() as Promise<{ ok: boolean; events: CalendarEvent[] }>),
        getDismissedCalendarEventIds(),
      ]);
      if (eventsRes.ok) {
        setAllEvents(eventsRes.events);
      }
      setDismissedIds(new Set(dismissed));
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (err) {
      console.error("[useCalendarInbox] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const importedIds = new Set(tasks.map((t) => t.googleCalendarEventId).filter(Boolean) as string[]);

  const pendingEvents = allEvents.filter(
    (e) => !importedIds.has(e.id) && !dismissedIds.has(e.id),
  );

  const dismissEvent = useCallback(
    async (eventId: string) => {
      setDismissedIds((prev) => new Set([...prev, eventId]));
      await dismissCalendarEventId(eventId);
    },
    [],
  );

  const refetch = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    void fetchEvents(true);
  }, [fetchEvents]);

  return { pendingEvents, isLoading, dismissEvent, refetch };
}
