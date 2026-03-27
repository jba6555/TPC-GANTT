"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GanttScheduler from "@/components/GanttScheduler";
import { logout, subscribeToAuth, waitForRedirectAndAuthReady } from "@/lib/auth";
import HistoryLog from "@/components/HistoryLog";
import AssignedToManager from "@/components/AssignedToManager";
import UserManager from "@/components/UserManager";
import CsvBulkUpload from "@/components/CsvBulkUpload";
import { isEmailAllowlisted } from "@/lib/allowedUsers";
import {
  createProject,
  createTask,
  deleteProjectAndTasks,
  deleteTask,
  fetchChangelogFromServer,
  revertChange,
  saveAllowedUsers,
  saveAssignedOptions,
  subscribeToProjects,
  subscribeToAllTasks,
  subscribeToChangelog,
  subscribeToAssignedOptions,
  subscribeToAllowedUsers,
  updateTask,
  updateTaskDates,
} from "@/lib/db";
import type { AssignedOption, BulkImportCsvRow, ChangelogEntry, Project, ProjectInput, ProjectTask, AssignedTo } from "@/types/scheduler";
import { DEFAULT_ASSIGNED_OPTIONS } from "@/types/scheduler";

export default function Home() {
  const APP_VERSION = "frozen-col-v11";
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assignedToOpen, setAssignedToOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [allowedUserEmails, setAllowedUserEmails] = useState<string[]>([]);
  const [allowedUsersReady, setAllowedUsersReady] = useState(false);
  const [allowedUsersLoadError, setAllowedUsersLoadError] = useState(false);
  const [assignedOptions, setAssignedOptions] = useState<AssignedOption[]>(DEFAULT_ASSIGNED_OPTIONS);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const DEFAULT_TITLE = "Real Estate Gantt Scheduler";
  const [appTitle, setAppTitle] = useState(DEFAULT_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("app-title");
    if (saved) setAppTitle(saved);
  }, []);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        await waitForRedirectAndAuthReady();
      } catch (e) {
        console.error(e);
      }
      if (cancelled) return;

      unsubscribe = subscribeToAuth((user) => {
        setAuthReady(true);
        if (!user) {
          router.replace("/login");
          return;
        }
        setUserId(user.uid);
        setUserEmail(user.email ?? "");
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const unsubscribe = subscribeToProjects(setProjects);
    return () => unsubscribe();
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const unsubscribe = subscribeToAllTasks(setAllTasks);
    return () => unsubscribe();
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) {
      setChangelogError(null);
      return;
    }
    const unsubscribe = subscribeToChangelog(
      (entries) => {
        setChangelog(entries);
        setChangelogError(null);
      },
      {
        onError: (e) => {
          setChangelogError(e.message);
        },
      },
    );
    return () => unsubscribe();
  }, [authReady, userId]);

  useEffect(() => {
    if (!historyOpen || !authReady || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const entries = await fetchChangelogFromServer();
        if (!cancelled) {
          setChangelog(entries);
          setChangelogError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setChangelogError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const unsubscribe = subscribeToAssignedOptions(setAssignedOptions);
    return () => unsubscribe();
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) {
      setAllowedUserEmails([]);
      setAllowedUsersReady(false);
      setAllowedUsersLoadError(false);
      return;
    }
    setAllowedUsersReady(false);
    setAllowedUsersLoadError(false);
    const unsubscribe = subscribeToAllowedUsers(
      (emails) => {
        setAllowedUserEmails(emails);
        setAllowedUsersReady(true);
      },
      () => {
        setAllowedUsersLoadError(true);
        setAllowedUsersReady(true);
      },
    );
    return () => unsubscribe();
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId || !allowedUsersReady || !userEmail) return;
    if (allowedUsersLoadError) {
      void (async () => {
        await logout();
        router.replace("/login");
      })();
      return;
    }
    if (isEmailAllowlisted(userEmail, allowedUserEmails)) return;
    void (async () => {
      await logout();
      router.replace("/login?denied=1");
    })();
  }, [authReady, userId, userEmail, allowedUsersReady, allowedUserEmails, allowedUsersLoadError, router]);

  const actor = useMemo(() => ({ userId, userEmail }), [userId, userEmail]);

  async function handleAddProject(input: ProjectInput) {
    await createProject(userId, input, userEmail);
  }

  async function handleDeleteProject(projectId: string) {
    await deleteProjectAndTasks(projectId, actor);
    // Apply locally so the row disappears even if the projects snapshot briefly replays a stale cache.
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setAllTasks((prev) => prev.filter((t) => t.projectId !== projectId));
  }

  async function handleAddTaskForProject(
    projectId: string,
    input: {
      title: string;
      startDate?: string;
      dueDate?: string;
      notes?: string;
      assignedTo?: string;
    },
  ) {
    const date = input.startDate || input.dueDate || dayjs().format("YYYY-MM-DD");
    const sortOrder = allTasks.filter((t) => t.projectId === projectId).length;
    const projectName = projects.find((p) => p.id === projectId)?.name;
    await createTask(projectId, {
      title: input.title,
      type: "task",
      startDate: input.startDate || date,
      dueDate: input.dueDate || date,
      notes: input.notes,
      assignedTo: (input.assignedTo as import("@/types/scheduler").AssignedTo) || undefined,
    }, sortOrder, { ...actor, projectName });
  }

  async function handleUpdateTaskDates(taskId: string, startDate?: string, dueDate?: string) {
    await updateTaskDates(taskId, startDate, dueDate, actor);
  }

  async function handleUpdateTask(
    taskId: string,
    fields: Partial<Pick<ProjectTask, "title" | "startDate" | "dueDate" | "notes" | "assignedTo" | "status">>,
  ) {
    await updateTask(taskId, fields, actor);
  }

  async function handleDeleteTask(taskId: string) {
    await deleteTask(taskId, actor);
  }

  async function handleRevertChange(entry: ChangelogEntry) {
    await revertChange(entry, actor);
  }

  async function handleSignOut() {
    await logout();
    router.replace("/login");
  }

  async function handleBulkUpload(rows: BulkImportCsvRow[]) {
    if (!userId) {
      throw new Error("You must be signed in.");
    }

    let createdProjects = 0;
    let createdTasks = 0;
    const projectIdByKey = new Map<string, string>();
    const taskCountByProjectId = new Map<string, number>();

    for (const row of rows) {
      const key = [
        row.projectName.trim(),
        row.address?.trim() ?? "",
        row.contractStart ?? "",
        row.contractEnd ?? "",
      ].join("|");

      let projectId = projectIdByKey.get(key);
      if (!projectId) {
        projectId = await createProject(userId, {
          name: row.projectName.trim(),
          address: row.address?.trim() ?? "",
          contractStart: row.contractStart || undefined,
          contractEnd: row.contractEnd || undefined,
        }, userEmail);
        projectIdByKey.set(key, projectId);
        taskCountByProjectId.set(projectId, 0);
        createdProjects += 1;
      }

      if (!row.taskTitle?.trim()) continue;
      const startDate = row.taskStartDate || row.taskDueDate;
      const dueDate = row.taskDueDate || row.taskStartDate;
      if (!startDate || !dueDate) continue;

      const sortOrder = taskCountByProjectId.get(projectId) ?? 0;
      await createTask(
        projectId,
        {
          title: row.taskTitle.trim(),
          type: "task",
          startDate,
          dueDate,
          notes: row.taskNotes?.trim() || undefined,
        },
        sortOrder,
        { ...actor, projectName: row.projectName.trim() },
      );
      taskCountByProjectId.set(projectId, sortOrder + 1);
      createdTasks += 1;
    }

    return { createdProjects, createdTasks };
  }

  async function handleSeedSample() {
    if (!userId) return;
    const seedActor = { ...actor, projectName: "3217 Rowena Ave" };
    const projectId = await createProject(userId, {
      name: "3217 Rowena Ave",
      address: "3217 Rowena Ave",
      contractStart: "2026-03-13",
      contractEnd: "2027-01-01",
    }, userEmail);
    await createTask(projectId, { title: "Pre-Application due", type: "milestone", dueDate: "2026-05-01" }, 0, seedActor);
    await createTask(projectId, { title: "Full Application due", type: "milestone", dueDate: "2026-05-15" }, 1, seedActor);
    await createTask(projectId, { title: "Under Contract", type: "task", startDate: "2026-03-13", dueDate: "2027-01-01" }, 2, seedActor);
    await createTask(projectId, { title: "Meeting with NCHFA", type: "milestone", dueDate: "2026-06-01" }, 3, seedActor);
  }

  if (!authReady) {
    return <main className="p-8 text-sm text-zinc-600">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4">
      <header className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3">
        <div>
          {editingTitle ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = titleDraft.trim() || DEFAULT_TITLE;
                setAppTitle(value);
                localStorage.setItem("app-title", value);
                setEditingTitle(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  const value = titleDraft.trim() || DEFAULT_TITLE;
                  setAppTitle(value);
                  localStorage.setItem("app-title", value);
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingTitle(false);
                  }
                }}
                className="rounded border border-zinc-300 px-2 py-0.5 text-xl font-bold text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(appTitle);
                setEditingTitle(true);
              }}
              className="group flex items-center gap-1.5 rounded px-1 -ml-1 transition-colors hover:bg-zinc-50"
              title="Click to edit title"
            >
              <h1 className="text-xl font-bold text-zinc-900">{appTitle}</h1>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
                <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
              </svg>
            </button>
          )}
          <p className="text-sm text-zinc-600">{userEmail}</p>
          <p className="text-xs text-zinc-400">Version: {APP_VERSION}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
              historyOpen
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            History
          </button>
          <CsvBulkUpload onBulkUpload={handleBulkUpload} />
          <button
            type="button"
            onClick={() => setUsersOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
              usersOpen
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
            Users
          </button>
          <button
            type="button"
            onClick={() => setAssignedToOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
              assignedToOpen
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            Assigned To
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded bg-zinc-800 px-3 py-1 text-sm text-white"
          >
            Sign Out
          </button>
        </div>
      </header>

      <section className="min-w-0 space-y-3">
          {projects.length === 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <h2 className="text-lg font-semibold text-zinc-900">No projects yet</h2>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-zinc-500">
                  Create a project with <span className="font-medium text-zinc-700">+ Project</span> above the timeline, or seed an example.
                </p>
                <button
                  type="button"
                  onClick={handleSeedSample}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                >
                  Seed Example Project
                </button>
              </div>
            </div>
          )}

          <GanttScheduler
            projects={projects}
            tasks={allTasks}
            assignedOptions={assignedOptions}
            onAddProject={handleAddProject}
            onDeleteProject={handleDeleteProject}
            onUpdateTaskDates={handleUpdateTaskDates}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onAddTask={handleAddTaskForProject}
          />
      </section>

      {historyOpen && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-zinc-900">History Log</h2>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {changelogError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <p className="font-medium">Could not load history</p>
                <p className="mt-1 break-words opacity-90">{changelogError}</p>
                <p className="mt-2 text-[11px] text-red-700">
                  If this mentions missing permissions, deploy{" "}
                  <code className="rounded bg-red-100 px-1">firestore.rules</code> from this repo in the Firebase
                  console or CLI so signed-in users can read and write the{" "}
                  <code className="rounded bg-red-100 px-1">changelog</code> collection.
                </p>
              </div>
            )}
            <HistoryLog entries={changelog} onRevert={handleRevertChange} />
          </div>
        </div>
      )}

      {usersOpen && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-zinc-900">Google sign-in users</h2>
            <button
              type="button"
              onClick={() => setUsersOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <UserManager emails={allowedUserEmails} onSave={saveAllowedUsers} currentUserEmail={userEmail} />
          </div>
        </div>
      )}

      {assignedToOpen && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-zinc-900">Assigned To Options</h2>
            <button
              type="button"
              onClick={() => setAssignedToOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <AssignedToManager
              options={assignedOptions}
              onSave={saveAssignedOptions}
            />
          </div>
        </div>
      )}
    </main>
  );
}
