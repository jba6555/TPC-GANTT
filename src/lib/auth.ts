import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const provider = new GoogleAuthProvider();

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/** Full-page redirect avoids popup issues on localhost (OAuth origins / third-party cookies). */
export async function loginWithGoogle() {
  await signInWithRedirect(getFirebaseAuth(), provider);
}

/** Call once after returning from Google (e.g. on /login mount). */
export async function completeGoogleRedirect() {
  return getRedirectResult(getFirebaseAuth());
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
