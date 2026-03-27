/**
 * Allowed-user list lives in Firestore (`settings/allowedUsers`).
 * Empty list = any authenticated Google account may use the app (legacy behavior).
 * Non-empty = only those emails (normalized lowercase) may access data.
 *
 * Optional recovery: set `NEXT_PUBLIC_SCHEDULER_ADMIN_EMAILS` (comma-separated) in
 * Vercel / `.env.local` so those addresses always pass the client check if you lock
 * yourself out of Firestore. Prefer fixing `settings/allowedUsers` in the console.
 */
function parseSchedulerAdminOverrideEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_SCHEDULER_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowlisted(
  email: string | null | undefined,
  allowedEmails: string[],
): boolean {
  if (!email?.trim()) return false;
  const norm = email.trim().toLowerCase();
  if (parseSchedulerAdminOverrideEmails().includes(norm)) return true;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(norm);
}
