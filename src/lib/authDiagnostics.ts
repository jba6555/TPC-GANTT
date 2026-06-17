import { getFirebaseAuth, getFirebaseProjectId } from "@/lib/firebase";

export type AuthTokenDiagnostics = {
  configuredProjectId: string;
  tokenAudience: string;
  tokenIssuer: string;
  email: string | null;
  uid: string;
  audiencesMatch: boolean;
};

/** Decode Firebase ID token claims to verify the token targets this Firebase project. */
export async function getAuthTokenDiagnostics(): Promise<AuthTokenDiagnostics | null> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as {
    aud?: string;
    iss?: string;
    email?: string;
    sub?: string;
  };

  const configuredProjectId = getFirebaseProjectId();
  const tokenAudience = String(payload.aud ?? "");
  const audiencesMatch =
    !configuredProjectId ||
    tokenAudience === configuredProjectId ||
    tokenAudience.includes(configuredProjectId);

  return {
    configuredProjectId,
    tokenAudience,
    tokenIssuer: String(payload.iss ?? ""),
    email: payload.email ?? user.email,
    uid: user.uid,
    audiencesMatch,
  };
}
