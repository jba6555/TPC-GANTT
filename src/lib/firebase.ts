import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

function getFirebaseApp() {
  if (!hasFirebaseConfig()) {
    throw new Error(
      "Firebase is not configured. Copy .env.local.example to .env.local and set values.",
    );
  }
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

let firestoreSingleton: Firestore | null = null;

/**
 * Without `localCache`, initializeFirestore defaults to memory-only — data disappears on refresh
 * and writes may not durably reach the server. Use IndexedDB + multi-tab sync in the browser.
 * Long-polling avoids WebChannel hangs on some networks.
 */
export function getFirestoreDb(): Firestore {
  if (firestoreSingleton) return firestoreSingleton;
  const app = getFirebaseApp();
  if (typeof window === "undefined") {
    firestoreSingleton = getFirestore(app);
    return firestoreSingleton;
  }
  try {
    firestoreSingleton = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    firestoreSingleton = getFirestore(app);
  }
  return firestoreSingleton;
}
