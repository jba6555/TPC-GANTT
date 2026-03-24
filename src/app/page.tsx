"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProjectList from "@/components/ProjectList";
import TaskForm from "@/components/TaskForm";
import GanttScheduler from "@/components/GanttScheduler";
import { logout, subscribeToAuth, waitForRedirectAndAuthReady } from "@/lib/auth";
import {
  createProject,
  createTask,
  subscribeToProjects,
  subscribeToTasks,
  updateTaskDates,
} from "@/lib/db";
import type { Project, ProjectInput, ProjectTask, TaskInput } from "@/types/scheduler";

export default function Home() {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
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
      if (!selectedProjectId && incoming.length > 0) {
        setSelectedProjectId(incoming[0].id);
      }
    });
    return () => unsubscribe();
  }, [authReady, userId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const unsubscribe = subscribeToTasks(selectedProjectId, setTasks);
    return () => unsubscribe();
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  async function handleAddProject(input: ProjectInput) {
    await createProject(userId, input);
  }

  async function handleAddTask(input: TaskInput) {
    if (!selectedProjectId) return;
    await createTask(selectedProjectId, input, tasks.length);
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

          {selectedProject && <TaskForm onAddTask={handleAddTask} tasks={tasks} />}
          {selectedProject && (
            <GanttScheduler tasks={tasks} onUpdateTaskDates={updateTaskDates} />
          )}
        </section>
      </div>
    </main>
  );
}
