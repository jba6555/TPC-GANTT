import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const provider = new GoogleAuthProvider();
// Request a refresh token from Google so Firebase can renew sessions without a new OAuth prompt.
provider.setCustomParameters({ access_type: "offline" });

/**
 * Pin auth state to browser local storage (IndexedDB). Sessions survive closing the tab/browser;
 * Firebase refreshes ID tokens automatically using the stored refresh token (typically weeks–months
 * unless the user revokes access or Google requires re-consent). There is no Firebase JS API to set
 * an exact “30-day” TTL—that is controlled by Google/Firebase on the backend.
 */
let persistenceReady: Promise<void> | null = null;

export function ensureFirebaseAuthPersistence(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!persistenceReady) {
    persistenceReady = setPersistence(getFirebaseAuth(), browserLocalPersistence).catch((err) => {
      persistenceReady = null;
      console.error("[Auth] browserLocalPersistence failed:", err);
      throw err;
    });
  }
  return persistenceReady;
}

function shouldUseRedirectForGoogle() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/**
 * Hosted sites: popup sign-in (HTTPS) — redirect flow often breaks when browsers partition storage
 * between your domain and firebaseapp.com.
 * Localhost: redirect — more reliable when popups / OAuth origins are finicky on random ports.
 * @returns true if a full-page redirect was started (don't navigate; the tab is leaving).
 */
export async function loginWithGoogle(): Promise<boolean> {
  await ensureFirebaseAuthPersistence();
  const auth = getFirebaseAuth();
  if (shouldUseRedirectForGoogle()) {
    await signInWithRedirect(auth, provider);
    return true;
  }
  await signInWithPopup(auth, provider);
  return false;
}

/**
 * Finish redirect sign-in and wait until Firebase has settled initial auth state.
 * Call on protected routes before trusting onAuthStateChanged(null), or you can bounce
 * back to /login while the session is still being restored.
 */
export async function waitForRedirectAndAuthReady() {
  await ensureFirebaseAuthPersistence();
  const auth = getFirebaseAuth();
  await getRedirectResult(auth);
  await auth.authStateReady();
}

export async function logout() {
  await signOut(getFirebaseAuth());
}
