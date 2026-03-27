import {
  addDoc,
  collection,
  type CollectionReference,
  type DocumentData,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { AssignedOption, ChangeAction, ChangelogEntry, Project, ProjectInput, ProjectTask, TaskInput } from "@/types/scheduler";
import { DEFAULT_ASSIGNED_OPTIONS } from "@/types/scheduler";
import { mergeBuiltinAllowedEmails } from "@/lib/allowedUsers";

function projectsCollectionRef() {
  return collection(getFirestoreDb(), "projects");
}

function tasksCollectionRef() {
  return collection(getFirestoreDb(), "tasks");
}

function changelogCollectionRef() {
  return collection(getFirestoreDb(), "changelog");
}

function isFirestoreTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  );
}

/** Firestore rejects `undefined` anywhere in a document unless settings opt out; strip recursively. */
function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Timestamp) return value;
  if (isFirestoreTimestampLike(value)) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(omitUndefinedDeep).filter((item) => item !== undefined);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const next = omitUndefinedDeep(v);
    if (next !== undefined) {
      out[k] = next;
    }
  }
  return out;
}

function sanitizeChangelogSnapshot(snapshot: Record<string, unknown> | null): Record<string, unknown> | null {
  if (snapshot === null) return null;
  const sanitized = omitUndefinedDeep(snapshot);
  if (sanitized === null || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return snapshot;
  }
  return sanitized as Record<string, unknown>;
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
  const payload: Record<string, unknown> = {
    userId: entry.userId,
    userEmail: entry.userEmail,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    description: entry.description,
    before: sanitizeChangelogSnapshot(entry.before),
    after: sanitizeChangelogSnapshot(entry.after),
    timestamp: serverTimestamp(),
  };
  if (entry.projectName !== undefined && entry.projectName !== "") {
    payload.projectName = entry.projectName;
  }
  try {
    await addDoc(changelogCollectionRef(), payload);
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
            googleCalendarEventId: data.googleCalendarEventId,
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
            googleCalendarEventId: data.googleCalendarEventId,
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
  // Do not await: changelog is a second round-trip; UI should close as soon as the project exists.
  void logChange({
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
    void logChange({
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
  return docRef.id;
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

export async function deleteTask(
  taskId: string,
  actor?: { userId: string; userEmail: string },
) {
  const db = getFirestoreDb();
  const taskRef = doc(db, "tasks", taskId);

  let taskBefore: Record<string, unknown> | null = null;
  let projectName: string | undefined;
  let taskTitle = "task";
  if (actor) {
    const snap = await getDoc(taskRef);
    if (snap.exists()) {
      const d = snap.data();
      taskBefore = { id: taskId, ...d };
      taskTitle = (d.title as string) ?? "task";
      const projSnap = await getDoc(doc(db, "projects", (d.projectId as string) ?? ""));
      projectName = projSnap.exists() ? (projSnap.data().name as string) : undefined;
    }
  }

  await deleteDoc(taskRef);

  if (actor) {
    await logChange({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "delete_tasks",
      entityType: "task",
      entityId: taskId,
      projectName,
      description: `Deleted task "${taskTitle}"`,
      before: taskBefore ? ({ tasks: [taskBefore] } as Record<string, unknown>) : null,
      after: null,
    });
  }
}

const FIRESTORE_BATCH_LIMIT = 500;

/** Cache-first task query; server read only when cache is empty (cold cache), matching changelog pattern. */
async function loadTasksSnapshotForDelete(projectId: string) {
  const tasksQuery = query(tasksCollectionRef(), where("projectId", "==", projectId));
  let snap = await getDocs(tasksQuery);
  if (snap.metadata.fromCache && snap.docs.length === 0) {
    try {
      snap = await getDocsFromServer(tasksQuery);
    } catch (e) {
      console.warn("[deleteProject] server task read failed, using cache:", e);
    }
  }
  return snap;
}

/**
 * Deletes a project and its tasks.
 *
 * When `prefetched` is passed (normal UI delete), skips all Firestore reads — the client
 * already has project + tasks from listeners, so we only run batched deletes (fast).
 *
 * When omitted (e.g. history revert), loads task refs via queries.
 */
export async function deleteProjectAndTasks(
  projectId: string,
  actor?: { userId: string; userEmail: string },
  prefetched?: { project: Project; tasks: ProjectTask[] },
) {
  const db = getFirestoreDb();
  const projectRef = doc(db, "projects", projectId);

  let projectBefore: Record<string, unknown> | null = null;
  let projectName: string | undefined;
  let taskSnapshots: Record<string, unknown>[] = [];
  let taskRefs: ReturnType<typeof doc>[];

  if (prefetched) {
    if (prefetched.project.id !== projectId) {
      throw new Error("prefetched project id does not match projectId");
    }
    taskRefs = prefetched.tasks.map((t) => doc(db, "tasks", t.id));
    if (actor) {
      const { project, tasks } = prefetched;
      projectBefore = {
        id: project.id,
        name: project.name,
        address: project.address,
        contractStart: project.contractStart,
        contractEnd: project.contractEnd,
        createdBy: project.createdBy,
        createdAt: project.createdAt,
      };
      projectName = project.name;
      taskSnapshots = tasks.map((t) => ({ ...t }));
    }
  } else if (actor) {
    const [projSnap, taskSnap] = await Promise.all([getDoc(projectRef), loadTasksSnapshotForDelete(projectId)]);
    if (projSnap.exists()) {
      const d = projSnap.data();
      projectBefore = { id: projectId, ...d };
      projectName = d.name as string;
    }
    for (const taskDoc of taskSnap.docs) {
      taskSnapshots.push({ id: taskDoc.id, ...taskDoc.data() });
    }
    taskRefs = taskSnap.docs.map((d) => d.ref);
  } else {
    const tasksSnap = await loadTasksSnapshotForDelete(projectId);
    taskRefs = tasksSnap.docs.map((d) => d.ref);
  }

  // Delete tasks and project in the same batch sequence so a typical project (≤500 ops)
  // commits in one round-trip. Previously, task batches committed first and a separate
  // deleteDoc(project) could fail, leaving an empty project row.
  const refsToDelete = [...taskRefs, projectRef];
  for (let i = 0; i < refsToDelete.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = refsToDelete.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  // Do not await: history log is a second network round-trip; delete is already committed.
  if (actor) {
    void logChange({
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
// Allowed Google accounts: settings/allowedUsers { emails: string[] }
// Empty list = any authenticated user may use the app.
// ---------------------------------------------------------------------------

function normalizeAllowedEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function subscribeToAllowedUsers(
  callback: (emails: string[]) => void,
  onError?: (error: Error) => void,
) {
  const db = getFirestoreDb();
  const docRef = doc(db, "settings", "allowedUsers");
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const raw = data.emails as string[] | undefined;
        if (Array.isArray(raw)) {
          const emails = raw
            .map((e) => (typeof e === "string" ? normalizeAllowedEmail(e) : ""))
            .filter(Boolean);
          callback(mergeBuiltinAllowedEmails([...new Set(emails)]));
          return;
        }
      }
      callback(mergeBuiltinAllowedEmails([]));
    },
    (error) => {
      console.error("[Firestore] allowedUsers listener:", error);
      onError?.(error);
    },
  );
}

export async function saveAllowedUsers(emails: string[]) {
  const db = getFirestoreDb();
  const docRef = doc(db, "settings", "allowedUsers");
  const normalized = mergeBuiltinAllowedEmails(emails.map(normalizeAllowedEmail).filter(Boolean));
  await setDoc(docRef, { emails: normalized }, { merge: false });
}

// ---------------------------------------------------------------------------
// Changelog: subscribe + revert
// ---------------------------------------------------------------------------

export type SubscribeToChangelogOptions = {
  maxEntries?: number;
  onError?: (error: Error) => void;
};

function mapChangelogSnapshotDocs(
  snapshot: { docs: Array<{ id: string; data: () => DocumentData }> },
  maxEntries: number,
): ChangelogEntry[] {
  const rows = snapshot.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp as { toDate?: () => Date } | undefined;
    const ms = ts?.toDate?.()?.getTime?.() ?? 0;
    const entry: ChangelogEntry = {
      id: d.id,
      timestamp: ts?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
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
    return { ms, entry };
  });
  rows.sort((a, b) => b.ms - a.ms);
  return rows.slice(0, maxEntries).map((r) => r.entry);
}

/**
 * Prefer a server read so an empty IndexedDB cache does not hide remote data.
 * Falls back to `getDocs` when the server is unreachable (offline, flaky network) — same as Firebase’s hint.
 */
async function getChangelogSnapshotPreferServer(
  changelogCollection: CollectionReference<DocumentData>,
) {
  try {
    return await getDocsFromServer(changelogCollection);
  } catch (e) {
    console.warn("[Changelog] getDocsFromServer failed, using cache/default read:", e);
    return await getDocs(changelogCollection);
  }
}

/** Load changelog entries; prefers server, falls back to cache when server read fails. */
export async function fetchChangelogFromServer(maxEntries = 200): Promise<ChangelogEntry[]> {
  const changelogCollection = changelogCollectionRef();
  const snapshot = await getChangelogSnapshotPreferServer(changelogCollection);
  return mapChangelogSnapshotDocs(snapshot, maxEntries);
}

export function subscribeToChangelog(
  callback: (entries: ChangelogEntry[]) => void,
  options?: SubscribeToChangelogOptions,
) {
  const maxEntries = options?.maxEntries ?? 200;
  const onError = options?.onError;
  // Full collection + client sort avoids composite index requirements (same pattern as projects).
  const changelogCollection = changelogCollectionRef();
  return onSnapshot(
    changelogCollection,
    { includeMetadataChanges: true },
    (snapshot) => {
      const push = (snap: typeof snapshot) => {
        callback(mapChangelogSnapshotDocs(snap, maxEntries));
      };

      // IndexedDB cache can deliver an empty snapshot before the server sync; if so, read from server once.
      if (snapshot.metadata.fromCache && snapshot.docs.length === 0) {
        void getChangelogSnapshotPreferServer(changelogCollection)
          .then((snap) => {
            push(snap);
          })
          .catch((err) => {
            console.error("[Firestore] changelog read:", err);
            onError?.(err instanceof Error ? err : new Error(String(err)));
          });
        return;
      }

      push(snapshot);
    },
    (error) => {
      console.error("[Firestore] changelog listener:", error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    },
  );
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
      const tasksArr = Array.isArray(entry.before)
        ? (entry.before as unknown as Record<string, unknown>[])
        : ((entry.before.tasks as Record<string, unknown>[] | undefined) ?? []);
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
