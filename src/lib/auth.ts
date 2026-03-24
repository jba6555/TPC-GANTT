import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const provider = new GoogleAuthProvider();

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
  const auth = getFirebaseAuth();
  await getRedirectResult(auth);
  await auth.authStateReady();
}

export async function logout() {
  await signOut(getFirebaseAuth());
}
