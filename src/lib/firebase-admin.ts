import * as admin from "firebase-admin";
import { getServiceAccountFromEnv } from "@/lib/server/serviceAccount";

let initAttempted = false;

export function getFirebaseAdminApp(): admin.app.App {
  if (admin.apps.length) {
    return admin.app();
  }
  if (initAttempted) {
    throw new Error("Firebase Admin failed to initialize");
  }
  initAttempted = true;
  const sa = getServiceAccountFromEnv();
  if (!sa) {
    throw new Error("Service account not configured for Firebase Admin");
  }
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: sa.projectId,
      clientEmail: sa.clientEmail,
      privateKey: sa.privateKey,
    }),
  });
}

export function getAdminFirestore(): admin.firestore.Firestore {
  return getFirebaseAdminApp().firestore();
}
