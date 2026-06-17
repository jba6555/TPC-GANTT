/** True when Firestore rejected a read/write for auth or rules reasons. */
export function isFirestorePermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  return code === "permission-denied" || code === "unauthenticated";
}

export function formatFirestoreError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  return [code, message].filter(Boolean).join(" · ");
}
