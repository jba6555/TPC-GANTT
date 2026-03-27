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
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { AssignedOption, ChangeAction, ChangelogEntry, Project, ProjectInput, ProjectTask, TaskInput } from "@/types/scheduler";
import { DEFAULT_ASSIGNED_OPTIONS } from "@/types/scheduler";

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
            assignedTo: data.assignedTo,
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
            assignedTo: data.assignedTo,
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

export async function updateTaskDates(
  taskId: string,
  startDate?: string,
  dueDate?: string,
  actor?: { userId: string; userEmail: string },
) {
  const db = getFirestoreDb();
  const taskRef = doc(db, "tasks", taskId);

  let beforeData: Record<string, unknown> | null = null;
  let taskTitle = "task";
  let projectName: string | undefined;
  if (actor) {
    const snap = await getDoc(taskRef);
    if (snap.exists()) {
      const d = snap.data();
      beforeData = { startDate: d.startDate, dueDate: d.dueDate };
      taskTitle = d.title ?? "task";
      const projSnap = await getDoc(doc(db, "projects", d.projectId ?? ""));
      projectName = projSnap.exists() ? (projSnap.data().name as string) : undefined;
    }
  }

  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (startDate !== undefined) patch.startDate = startDate;
  if (dueDate !== undefined) patch.dueDate = dueDate;
  await updateDoc(taskRef, patch);

  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "update_task",
      entityType: "task",
      entityId: taskId,
      projectName,
      description: `Updated dates on "${taskTitle}"`,
      before: beforeData,
      after: { startDate, dueDate },
    });
  }
}

export async function updateTask(
  taskId: string,
  fields: Partial<Pick<ProjectTask, "title" | "startDate" | "dueDate" | "notes" | "assignedTo" | "status">>,
  actor?: { userId: string; userEmail: string },
) {
  const db = getFirestoreDb();
  const taskRef = doc(db, "tasks", taskId);

  let beforeData: Record<string, unknown> | null = null;
  let taskTitle = "task";
  let projectName: string | undefined;
  if (actor) {
    const snap = await getDoc(taskRef);
    if (snap.exists()) {
      const d = snap.data();
      beforeData = {
        title: d.title,
        startDate: d.startDate,
        dueDate: d.dueDate,
        notes: d.notes,
        assignedTo: d.assignedTo,
        status: d.status,
      };
      taskTitle = d.title ?? "task";
      const projSnap = await getDoc(doc(db, "projects", d.projectId ?? ""));
      projectName = projSnap.exists() ? (projSnap.data().name as string) : undefined;
    }
  }

  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  await updateDoc(taskRef, patch);

  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "update_task",
      entityType: "task",
      entityId: taskId,
      projectName,
      description: `Updated "${taskTitle}"`,
      before: beforeData,
      after: { ...fields },
    });
  }
}

const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Deletes a project and its tasks. Uses a server read so the query does not hang on
 * local cache, and batched writes so many task deletes are one round-trip each
 * instead of N parallel deleteDoc calls.
 */
export async function deleteProjectAndTasks(
  projectId: string,
  actor?: { userId: string; userEmail: string },
) {
  const db = getFirestoreDb();
  const projectRef = doc(db, "projects", projectId);
  const tasksQuery = query(tasksCollectionRef(), where("projectId", "==", projectId));

  let projectBefore: Record<string, unknown> | null = null;
  let projectName: string | undefined;
  const taskSnapshots: Record<string, unknown>[] = [];

  if (actor) {
    const projSnap = await getDoc(projectRef);
    if (projSnap.exists()) {
      const d = projSnap.data();
      projectBefore = { id: projectId, ...d };
      projectName = d.name as string;
    }
  }

  const tasksSnap = await getDocsFromServer(tasksQuery);
  const taskRefs = tasksSnap.docs.map((d) => d.ref);

  if (actor) {
    for (const taskDoc of tasksSnap.docs) {
      taskSnapshots.push({ id: taskDoc.id, ...taskDoc.data() });
    }
  }

  for (let i = 0; i < taskRefs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = taskRefs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  await deleteDoc(projectRef);

  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "delete_project",
      entityType: "project",
      entityId: projectId,
      projectName,
      description: `Deleted project "${projectName ?? projectId}" and ${taskSnapshots.length} task(s)`,
      before: { project: projectBefore, tasks: taskSnapshots },
      after: null,
    });
  }
}

export async function updateProject(
  projectId: string,
  input: ProjectInput,
  actor?: { userId: string; userEmail: string },
) {
  const db = getFirestoreDb();
  const projectRef = doc(db, "projects", projectId);

  let beforeData: Record<string, unknown> | null = null;
  if (actor) {
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
      const d = snap.data();
      beforeData = { name: d.name, address: d.address, contractStart: d.contractStart, contractEnd: d.contractEnd };
    }
  }

  const patch: Partial<ProjectInput> = {
    name: input.name,
    address: input.address,
  };
  if (input.contractStart) patch.contractStart = input.contractStart;
  if (input.contractEnd) patch.contractEnd = input.contractEnd;

  await updateDoc(projectRef, patch);

  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "update_project",
      entityType: "project",
      entityId: projectId,
      projectName: input.name,
      description: `Updated project "${input.name}"`,
      before: beforeData,
      after: { ...input },
    });
  }
}

// ---------------------------------------------------------------------------
// Assigned-to options: stored in settings/assignedOptions
// ---------------------------------------------------------------------------

export function subscribeToAssignedOptions(
  callback: (options: AssignedOption[]) => void,
) {
  const db = getFirestoreDb();
  const docRef = doc(db, "settings", "assignedOptions");
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      const raw = data.options as AssignedOption[] | undefined;
      if (Array.isArray(raw) && raw.length > 0) {
        callback(raw.map((o) => ({
          value: o.value ?? "",
          label: o.label ?? "",
          color: o.color ?? "#3b82f6",
          textColor: o.textColor ?? "#ffffff",
        })));
        return;
      }
    }
    callback(DEFAULT_ASSIGNED_OPTIONS);
  });
}

export async function saveAssignedOptions(options: AssignedOption[]) {
  const db = getFirestoreDb();
  const docRef = doc(db, "settings", "assignedOptions");
  await setDoc(docRef, { options }, { merge: false });
}

// ---------------------------------------------------------------------------
// Changelog: subscribe + revert
// ---------------------------------------------------------------------------

export function subscribeToChangelog(
  callback: (entries: ChangelogEntry[]) => void,
  maxEntries = 200,
) {
  const q = query(
    changelogCollectionRef(),
    orderBy("timestamp", "desc"),
    firestoreLimit(maxEntries),
  );
  return onSnapshot(q, (snapshot) => {
    const entries: ChangelogEntry[] = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        timestamp: data.timestamp?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        userId: data.userId ?? "",
        userEmail: data.userEmail ?? "",
        action: data.action ?? "update_task",
        entityType: data.entityType ?? "task",
        entityId: data.entityId ?? "",
        projectName: data.projectName,
        description: data.description ?? "",
        before: data.before ?? null,
        after: data.after ?? null,
      };
    });
    callback(entries);
  });
}

export async function revertChange(entry: ChangelogEntry, actor: { userId: string; userEmail: string }) {
  const db = getFirestoreDb();

  switch (entry.action) {
    case "create_project": {
      if (!entry.entityId) throw new Error("Missing project ID to revert");
      await deleteProjectAndTasks(entry.entityId);
      break;
    }
    case "create_task": {
      if (!entry.entityId) throw new Error("Missing task ID to revert");
      await deleteDoc(doc(db, "tasks", entry.entityId));
      break;
    }
    case "update_project": {
      if (!entry.before || !entry.entityId) throw new Error("Missing data to revert");
      const ref = doc(db, "projects", entry.entityId);
      await updateDoc(ref, entry.before);
      break;
    }
    case "update_task": {
      if (!entry.before || !entry.entityId) throw new Error("Missing data to revert");
      const ref = doc(db, "tasks", entry.entityId);
      await updateDoc(ref, { ...entry.before, updatedAt: serverTimestamp() });
      break;
    }
    case "delete_project": {
      if (!entry.before) throw new Error("No snapshot to restore");
      const snapshot = entry.before as { project: Record<string, unknown> | null; tasks: Record<string, unknown>[] };
      if (snapshot.project) {
        const { id: _id, createdAt, ...projData } = snapshot.project;
        void _id;
        void createdAt;
        const projRef = doc(db, "projects", entry.entityId);
        const batch = writeBatch(db);
        batch.set(projRef, { ...projData, createdAt: serverTimestamp() });
        if (snapshot.tasks?.length) {
          for (const task of snapshot.tasks) {
            const { id: taskId, updatedAt, ...taskData } = task as Record<string, unknown>;
            void updatedAt;
            const tRef = taskId ? doc(db, "tasks", taskId as string) : doc(tasksCollectionRef());
            batch.set(tRef, { ...taskData, updatedAt: serverTimestamp() });
          }
        }
        await batch.commit();
      }
      break;
    }
    case "delete_tasks": {
      if (!entry.before) throw new Error("No snapshot to restore");
      const tasksArr = entry.before as unknown as Record<string, unknown>[];
      const batch = writeBatch(db);
      for (const task of tasksArr) {
        const { id: taskId, updatedAt, ...taskData } = task;
        void updatedAt;
        const ref = taskId ? doc(db, "tasks", taskId as string) : doc(tasksCollectionRef());
        batch.set(ref, { ...taskData, updatedAt: serverTimestamp() });
      }
      await batch.commit();
      break;
    }
    default:
      throw new Error(`Cannot revert action: ${entry.action}`);
  }

  await logChange({
    userId: actor.userId,
    userEmail: actor.userEmail,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    projectName: entry.projectName,
    description: `Reverted: ${entry.description}`,
    before: entry.after,
    after: entry.before,
  });
}
