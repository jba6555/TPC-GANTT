import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getFirebaseApp } from "@/lib/firebase";

let appCheckReady = false;

/**
 * When Firebase App Check enforces Firestore, server reads/writes fail with
 * permission-denied unless the web app sends an App Check token. Local cache
 * can still show stale data, which looks like "signed in but blocked".
 */
export function ensureFirebaseAppCheck() {
  if (typeof window === "undefined" || appCheckReady) return;

  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey) return;

  const app = getFirebaseApp();
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckReady = true;
}
