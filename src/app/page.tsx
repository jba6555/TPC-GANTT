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
import type { Project, ProjectInput, ProjectTask } from "@/types/scheduler";

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
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
    if (selectedProjectId === projectId) {
      setSelectedProjectId("");
    }
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
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded bg-zinc-800 px-3 py-1 text-sm text-white"
        >
          Sign Out
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ProjectList
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onAddProject={handleAddProject}
          onDeleteProject={handleDeleteProject}
          onUpdateProject={handleUpdateProject}
          onAddTask={handleAddTaskForProject}
        />
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
