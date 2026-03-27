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
 *
 * Built-in users are always merged into the saved list and always pass when enforcement is on.
 */
/** Always included in the Users list and in access checks (lowercase in Firestore). */
export const BUILTIN_ALLOWED_USER_EMAILS = ["josh@theprimecompany.com"] as const;

export function mergeBuiltinAllowedEmails(emails: string[]): string[] {
  const set = new Set<string>();
  for (const e of emails) {
    const n = e.trim().toLowerCase();
    if (n) set.add(n);
  }
  for (const e of BUILTIN_ALLOWED_USER_EMAILS) {
    set.add(e.toLowerCase());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function isBuiltinAllowedUserEmail(email: string): boolean {
  const n = email.trim().toLowerCase();
  return BUILTIN_ALLOWED_USER_EMAILS.some((e) => e.toLowerCase() === n);
}

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
  if (BUILTIN_ALLOWED_USER_EMAILS.some((e) => e.toLowerCase() === norm)) return true;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(norm);
}
