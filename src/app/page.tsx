"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProjectList from "@/components/ProjectList";
import GanttScheduler from "@/components/GanttScheduler";
import { logout, subscribeToAuth, waitForRedirectAndAuthReady } from "@/lib/auth";
import {
  createProject,
  createTask,
  deleteProjectAndTasks,
  subscribeToProjects,
  subscribeToAllTasks,
  updateProject,
  updateTaskDates,
} from "@/lib/db";
import type { BulkImportCsvRow, Project, ProjectInput, ProjectTask } from "@/types/scheduler";

export default function Home() {
  const APP_VERSION = "gantt-zoom-3";
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

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
    const unsubscribe = subscribeToProjects((incoming) => {
      setProjects(incoming);
      const stillExists = selectedProjectId
        ? incoming.some((p) => p.id === selectedProjectId)
        : false;
      if (!stillExists) {
        setSelectedProjectId(incoming[0]?.id ?? "");
      }
    });
    return () => unsubscribe();
  }, [authReady, userId, selectedProjectId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const unsubscribe = subscribeToAllTasks(setAllTasks);
    return () => unsubscribe();
  }, [authReady, userId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  async function handleAddProject(input: ProjectInput) {
    await createProject(userId, input);
  }

  async function handleAddTaskForProject(
    projectId: string,
    input: {
      title: string;
      startDate: string;
      dueDate: string;
      notes?: string;
    },
  ) {
    const sortOrder = allTasks.filter((t) => t.projectId === projectId).length;
    await createTask(projectId, {
      title: input.title,
      type: "task",
      startDate: input.startDate,
      dueDate: input.dueDate,
      notes: input.notes,
    }, sortOrder);
  }

  async function handleDeleteProject(projectId: string) {
    await deleteProjectAndTasks(projectId);
  }

  async function handleUpdateProject(
    projectId: string,
    input: ProjectInput,
  ) {
    await updateProject(projectId, input);
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
        });
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
      );
      taskCountByProjectId.set(projectId, sortOrder + 1);
      createdTasks += 1;
    }

    return { createdProjects, createdTasks };
  }

  async function handleSeedSample() {
    if (!userId) return;
    const projectId = await createProject(userId, {
      name: "3217 Rowena Ave",
      address: "3217 Rowena Ave",
      contractStart: "2026-03-13",
      contractEnd: "2027-01-01",
    });
    await createTask(
      projectId,
      {
        title: "Pre-Application due",
        type: "milestone",
        dueDate: "2026-05-01",
      },
      0,
    );
    await createTask(
      projectId,
      {
        title: "Full Application due",
        type: "milestone",
        dueDate: "2026-05-15",
      },
      1,
    );
    await createTask(
      projectId,
      {
        title: "Under Contract",
        type: "task",
        startDate: "2026-03-13",
        dueDate: "2027-01-01",
      },
      2,
    );
    await createTask(
      projectId,
      {
        title: "Meeting with NCHFA",
        type: "milestone",
        dueDate: "2026-06-01",
      },
      3,
    );
    setSelectedProjectId(projectId);
  }

  if (!authReady) {
    return <main className="p-8 text-sm text-zinc-600">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4">
      <header className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Real Estate Gantt Scheduler</h1>
          <p className="text-sm text-zinc-600">{userEmail}</p>
          <p className="text-xs text-zinc-400">Version: {APP_VERSION}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded bg-zinc-800 px-3 py-1 text-sm text-white"
        >
          Sign Out
        </button>
      </header>

      <div className={`grid gap-4 ${sidebarOpen ? "lg:grid-cols-[320px_1fr]" : "lg:grid-cols-[auto_1fr]"}`}>
        {sidebarOpen ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              title="Collapse sidebar"
              className="absolute -right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-500 shadow-sm hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <ProjectList
              projects={projects}
              tasks={allTasks}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onAddProject={handleAddProject}
              onDeleteProject={handleDeleteProject}
              onUpdateProject={handleUpdateProject}
              onAddTask={handleAddTaskForProject}
              onUpdateTaskDates={updateTaskDates}
              onBulkUpload={handleBulkUpload}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-lg border border-zinc-200 bg-white py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              title="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="mt-2 text-xs font-medium text-zinc-400" style={{ writingMode: "vertical-lr" }}>
              Projects
            </span>
          </div>
        )}
        <section className="space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              {selectedProject ? selectedProject.name : "Select a project"}
            </h2>
            {selectedProject ? (
              <p className="text-sm text-zinc-600">
                Contract: {selectedProject.contractStart || "N/A"} to{" "}
                {selectedProject.contractEnd || "N/A"}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-zinc-500">No projects yet. Add one to begin.</p>
                <button
                  type="button"
                  onClick={handleSeedSample}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                >
                  Seed Example Project
                </button>
              </div>
            )}
          </div>

          {selectedProject && (
            <GanttScheduler
              projects={projects}
              tasks={allTasks}
              onUpdateTaskDates={updateTaskDates}
            />
          )}
        </section>
      </div>
    </main>
  );
}
