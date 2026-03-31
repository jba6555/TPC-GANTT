"use client";

import dayjs from "dayjs";
import { useEffect, useRef } from "react";
import type { ChangelogEntry, Project, ProjectTask } from "@/types/scheduler";
import { buildCsvContent, downloadCsv } from "@/lib/csvExport";

const LAST_BACKUP_KEY = "tpc-last-backup-date";

/** End-of-day hour (24h) at which the automatic backup fires if the app is open. */
const EOD_HOUR = 23;

function runBackup(projects: Project[], tasks: ProjectTask[]): void {
  const today = dayjs().format("YYYY-MM-DD");
  const csv = buildCsvContent(projects, tasks);
  const filename = `TPC Project Tracker ${today}.csv`;
  downloadCsv(csv, filename);
  localStorage.setItem(LAST_BACKUP_KEY, today);
}

/**
 * Automatically downloads a CSV backup of all projects and tasks:
 *
 *  1. On app load — if there are unbackedup changes from a previous day, the
 *     download fires immediately so no backup is ever lost.
 *  2. At 11 PM — if changes occurred today and no backup was made yet, the
 *     download fires while the app is still open.
 *
 * "Changes" are detected by checking whether any changelog entry's local date
 * is more recent than the last recorded backup date stored in localStorage.
 */
export function useAutoBackup(
  projects: Project[],
  tasks: ProjectTask[],
  changelog: ChangelogEntry[],
  authReady: boolean,
): void {
  // Refs so the interval closure always reads the latest data without needing
  // to be recreated on every Firestore update.
  const projectsRef = useRef<Project[]>(projects);
  const tasksRef = useRef<ProjectTask[]>(tasks);
  const changelogRef = useRef<ChangelogEntry[]>(changelog);
  const hasCheckedMissedRef = useRef(false);

  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { changelogRef.current = changelog; }, [changelog]);

  // ── Missed-backup check ───────────────────────────────────────────────────
  // Runs once after auth + the initial changelog load settle.  If the most
  // recent change date is before today and hasn't been backed up, download now.
  useEffect(() => {
    if (!authReady || changelog.length === 0 || hasCheckedMissedRef.current) return;
    hasCheckedMissedRef.current = true;

    const today = dayjs().format("YYYY-MM-DD");
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY) ?? "";

    // Determine the latest local date that has a changelog entry.
    let mostRecentChangeDate = "";
    for (const entry of changelog) {
      const d = dayjs(entry.timestamp).format("YYYY-MM-DD");
      if (d > mostRecentChangeDate) mostRecentChangeDate = d;
    }

    // Only trigger for *previous* days that weren't backed up.
    if (mostRecentChangeDate && mostRecentChangeDate < today && mostRecentChangeDate > lastBackup) {
      runBackup(projects, tasks);
    }
  }, [authReady, changelog, projects, tasks]);

  // ── End-of-day scheduled backup ───────────────────────────────────────────
  // Polls every 60 s. At 11 PM, if changes exist today and no backup was made,
  // triggers the download automatically.
  useEffect(() => {
    if (!authReady) return;

    const checkEndOfDay = () => {
      const now = dayjs();
      const today = now.format("YYYY-MM-DD");

      if (now.hour() < EOD_HOUR) return;

      const lastBackup = localStorage.getItem(LAST_BACKUP_KEY) ?? "";
      if (lastBackup >= today) return;

      const todayHasChanges = changelogRef.current.some(
        (e) => dayjs(e.timestamp).format("YYYY-MM-DD") === today,
      );
      if (!todayHasChanges) return;

      runBackup(projectsRef.current, tasksRef.current);
    };

    const intervalId = setInterval(checkEndOfDay, 60_000);
    return () => clearInterval(intervalId);
  }, [authReady]);
}
