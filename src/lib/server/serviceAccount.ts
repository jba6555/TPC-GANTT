/**
 * Service account credentials for Firebase Admin + Google Calendar API (same GCP project).
 */

export type ParsedServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\n/g, "\n");
}

export function getServiceAccountFromEnv(): ParsedServiceAccount | null {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw?.trim()) {
    try {
      const j = JSON.parse(jsonRaw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!j.project_id || !j.client_email || !j.private_key) return null;
      return {
        projectId: j.project_id,
        clientEmail: j.client_email,
        privateKey: normalizePrivateKey(j.private_key),
      };
    } catch {
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const projectId =
    process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (!clientEmail || !privateKeyRaw || !projectId) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKeyRaw),
  };
}

export function isCalendarSyncConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_ID?.trim() && getServiceAccountFromEnv(),
  );
}
