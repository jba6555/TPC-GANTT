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

export async function logout() {
  await signOut(getFirebaseAuth());
}
