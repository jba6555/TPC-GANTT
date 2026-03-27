import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocsFromServer,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { ChangeAction, ChangelogEntry, Project, ProjectInput, ProjectTask, TaskInput } from "@/types/scheduler";

function projectsCollectionRef() {
  return collection(getFirestoreDb(), "projects");
}

function tasksCollectionRef() {
  return collection(getFirestoreDb(), "tasks");
}

function changelogCollectionRef() {
  return collection(getFirestoreDb(), "changelog");
}

async function logChange(entry: {
  userId: string;
  userEmail: string;
  action: ChangeAction;
  entityType: "project" | "task";
  entityId: string;
  projectName?: string;
  description: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  try {
    await addDoc(changelogCollectionRef(), {
      ...entry,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("[Changelog] failed to log change:", e);
  }
}

export function subscribeToProjects(
  callback: (projects: Project[]) => void,
  onError?: (error: Error) => void,
) {
  const projectsCollection = projectsCollectionRef();
  // Full collection + client sort avoids Firestore index requirements for orderBy.
  return onSnapshot(
    projectsCollection,
    (snapshot) => {
      const projects = snapshot.docs
        .map((projectDoc) => {
          const data = projectDoc.data();
          return {
            id: projectDoc.id,
            name: data.name ?? "",
            address: data.address ?? "",
            contractStart: data.contractStart,
            contractEnd: data.contractEnd,
            createdBy: data.createdBy ?? "",
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
            _createdMs: data.createdAt?.toMillis?.() ?? 0,
          };
        })
        .sort((a, b) => a._createdMs - b._createdMs)
        .map((row) => {
          const { _createdMs, ...rest } = row;
          void _createdMs;
          return rest as Project;
        });
      callback(projects);
    },
    (error) => {
      console.error("[Firestore] projects listener:", error);
      onError?.(error);
    },
  );
}

export function subscribeToTasks(
  projectId: string,
  callback: (tasks: ProjectTask[]) => void,
  onError?: (error: Error) => void,
) {
  const tasksQuery = query(tasksCollectionRef(), where("projectId", "==", projectId));
  return onSnapshot(
    tasksQuery,
    (snapshot) => {
      const tasks = snapshot.docs
        .map((taskDoc) => {
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
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
      callback(tasks);
    },
    (error) => {
      console.error("[Firestore] tasks listener:", error);
      onError?.(error);
    },
  );
}

export function subscribeToAllTasks(
  callback: (tasks: ProjectTask[]) => void,
  onError?: (error: Error) => void,
) {
  const tasksCollection = tasksCollectionRef();
  return onSnapshot(
    tasksCollection,
    (snapshot) => {
      const tasks = snapshot.docs
        .map((taskDoc) => {
          const data = taskDoc.data();
          return {
            id: taskDoc.id,
            projectId: data.projectId ?? "",
            title: data.title ?? "",
            type: data.type ?? "task",
            startDate: data.startDate,
            dueDate: data.dueDate ?? new Date().toISOString().slice(0, 10),
            status: data.status ?? "not_started",
            sortOrder: data.sortOrder ?? 0,
            notes: data.notes,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          } as ProjectTask;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
      callback(tasks);
    },
    (error) => {
      console.error("[Firestore] tasks(all) listener:", error);
      onError?.(error);
    },
  );
}

export async function createProject(userId: string, input: ProjectInput, userEmail = "") {
  const docRef = await addDoc(projectsCollectionRef(), {
    ...input,
    createdBy: userId,
    createdAt: serverTimestamp(),
  });
  await logChange({
    userId,
    userEmail,
    action: "create_project",
    entityType: "project",
    entityId: docRef.id,
    projectName: input.name,
    description: `Created project "${input.name}"`,
    before: null,
    after: { id: docRef.id, ...input },
  });
  return docRef.id;
}

export async function createTask(
  projectId: string,
  input: TaskInput,
  sortOrder: number,
  actor?: { userId: string; userEmail: string; projectName?: string },
) {
  const docRef = await addDoc(tasksCollectionRef(), {
    ...input,
    projectId,
    status: "not_started",
    sortOrder,
    updatedAt: serverTimestamp(),
  });
  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "create_task",
      entityType: "task",
      entityId: docRef.id,
      projectName: actor.projectName,
      description: `Created task "${input.title}"`,
      before: null,
      after: { id: docRef.id, projectId, ...input, sortOrder },
    });
  }
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

const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Deletes a project and its tasks. Uses a server read so the query does not hang on
 * local cache, and batched writes so many task deletes are one round-trip each
 * instead of N parallel deleteDoc calls.
 */
export async function deleteProjectAndTasks(projectId: string) {
  const db = getFirestoreDb();
  const projectRef = doc(db, "projects", projectId);
  const tasksQuery = query(tasksCollectionRef(), where("projectId", "==", projectId));

  const tasksSnap = await getDocsFromServer(tasksQuery);
  const taskRefs = tasksSnap.docs.map((d) => d.ref);

  for (let i = 0; i < taskRefs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = taskRefs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  await deleteDoc(projectRef);
}

export async function updateProject(projectId: string, input: ProjectInput) {
  const db = getFirestoreDb();
  const projectRef = doc(db, "projects", projectId);
  const patch: Partial<ProjectInput> = {
    name: input.name,
    address: input.address,
  };
  if (input.contractStart) patch.contractStart = input.contractStart;
  if (input.contractEnd) patch.contractEnd = input.contractEnd;

  await updateDoc(projectRef, patch);
}
