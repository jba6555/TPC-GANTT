import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { Project, ProjectInput, ProjectTask, TaskInput } from "@/types/scheduler";

function projectsCollectionRef() {
  return collection(getFirestoreDb(), "projects");
}

function tasksCollectionRef() {
  return collection(getFirestoreDb(), "tasks");
}

export function subscribeToProjects(callback: (projects: Project[]) => void) {
  const projectsCollection = projectsCollectionRef();
  const projectsQuery = query(projectsCollection, orderBy("createdAt", "asc"));
  return onSnapshot(projectsQuery, (snapshot) => {
    const projects = snapshot.docs.map((projectDoc) => {
      const data = projectDoc.data();
      return {
        id: projectDoc.id,
        name: data.name ?? "",
        address: data.address ?? "",
        contractStart: data.contractStart,
        contractEnd: data.contractEnd,
        createdBy: data.createdBy ?? "",
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      } as Project;
    });
    callback(projects);
  });
}

export function subscribeToTasks(projectId: string, callback: (tasks: ProjectTask[]) => void) {
  const tasksQuery = query(
    tasksCollectionRef(),
    where("projectId", "==", projectId),
    orderBy("sortOrder", "asc"),
  );
  return onSnapshot(tasksQuery, (snapshot) => {
    const tasks = snapshot.docs.map((taskDoc) => {
      const data = taskDoc.data();
      return {
        id: taskDoc.id,
        projectId: data.projectId ?? projectId,
        title: data.title ?? "",
        type: data.type ?? "task",
        startDate: data.startDate,
        dueDate: data.dueDate ?? new Date().toISOString().slice(0, 10),
        status: data.status ?? "not_started",
        sortOrder: data.sortOrder ?? 0,
        notes: data.notes,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      } as ProjectTask;
    });
    callback(tasks);
  });
}

export async function createProject(userId: string, input: ProjectInput) {
  const docRef = await addDoc(projectsCollectionRef(), {
    ...input,
    createdBy: userId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function createTask(projectId: string, input: TaskInput, sortOrder: number) {
  await addDoc(tasksCollectionRef(), {
    ...input,
    projectId,
    status: "not_started",
    sortOrder,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTaskDates(taskId: string, startDate?: string, dueDate?: string) {
  const taskRef = doc(getFirestoreDb(), "tasks", taskId);
  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (startDate !== undefined) {
    patch.startDate = startDate;
  }
  if (dueDate !== undefined) {
    patch.dueDate = dueDate;
  }
  await updateDoc(taskRef, patch);
}
