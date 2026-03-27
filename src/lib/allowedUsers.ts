/**
 * Allowed-user list lives in Firestore (`settings/allowedUsers`).
 *
 * Enforcement is **opt-in**: set `NEXT_PUBLIC_USER_ALLOWLIST_ENABLED=true` in Vercel
 * / `.env.local` to restrict who can use the app. When unset or not `"true"`, any
 * Google sign-in works (same as before this feature).
 *
 * When enforcement is on:
 * - Empty list = any authenticated Google account may use the app.
 * - Non-empty = only those emails (normalized lowercase) may access data.
 *
 * Optional recovery when enforced: `NEXT_PUBLIC_SCHEDULER_ADMIN_EMAILS` (comma-separated)
 * always passes the check.
 */
export function isUserAllowlistEnforced(): boolean {
  return process.env.NEXT_PUBLIC_USER_ALLOWLIST_ENABLED === "true";
}

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
  if (!isUserAllowlistEnforced()) return true;
  if (!email?.trim()) return false;
  const norm = email.trim().toLowerCase();
  if (parseSchedulerAdminOverrideEmails().includes(norm)) return true;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(norm);
}
