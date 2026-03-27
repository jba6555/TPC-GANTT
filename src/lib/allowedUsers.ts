/**
 * Allowed-user list lives in Firestore (`settings/allowedUsers`).
 * Empty list = any authenticated Google account may use the app (legacy behavior).
 * Non-empty = only those emails (normalized lowercase) may access data.
 */
export function isEmailAllowlisted(
  email: string | null | undefined,
  allowedEmails: string[],
): boolean {
  if (!email?.trim()) return false;
  const norm = email.trim().toLowerCase();
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(norm);
}
