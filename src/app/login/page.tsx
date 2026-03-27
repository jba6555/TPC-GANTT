"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { loginWithGoogle, logout, subscribeToAuth, waitForRedirectAndAuthReady } from "@/lib/auth";
import { isEmailAllowlisted } from "@/lib/allowedUsers";
import { subscribeToAllowedUsers } from "@/lib/db";
import { getFirebaseAuth } from "@/lib/firebase";

function parseFirebaseError(e: unknown): { code?: string; message?: string } {
  if (e && typeof e === "object") {
    const o = e as { code?: string; message?: string };
    return { code: o.code, message: o.message };
  }
  return {};
}

function formatAuthError(e: unknown, pageOrigin: string): string {
  const { code, message } = parseFirebaseError(e);
  const host = (() => {
    try {
      return new URL(pageOrigin).hostname;
    } catch {
      return "localhost";
    }
  })();

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID";
  const firebaseHandler = `https://${projectId}.firebaseapp.com/__/auth/handler`;
  const localHandler =
    pageOrigin && pageOrigin.startsWith("http")
      ? `${pageOrigin.replace(/\/$/, "")}/__/auth/handler`
      : "http://localhost:3000/__/auth/handler";

  switch (code) {
    case "auth/configuration-not-found":
      return [
        "Firebase Auth OAuth is not fully wired (configuration-not-found).",
        "",
        "A) Firebase → Authentication → Sign-in method → Google → Enabled.",
        "   Expand “Web SDK configuration” and set Web client ID + Web client secret",
        "   to the SAME OAuth “Web client” in Google Cloud (Credentials).",
        "   If you created a new client (e.g. “TPC Gantt 1”), paste that client’s ID/secret here.",
        "   Mismatch between Firebase Google settings and GCP OAuth client causes this error.",
        "",
        "B) Google Cloud → Credentials → that Web client:",
        `   • Authorized redirect URIs must include: ${firebaseHandler}`,
        "     plus http://localhost:3000/__/auth/handler (and :3001, :3002 if you use those ports).",
        "   • Authorized JavaScript origins must list EVERY port you use:",
        "     http://localhost:3000, http://localhost:3001, http://localhost:3002",
        "     (Redirect URIs alone are not enough — JS origin must match the address bar.)",
        "",
        `Try from the origin you whitelisted (e.g. ${localHandler.replace("/__/auth/handler", "")}).`,
        "",
        "C) Google Cloud → Library — enable Identity Toolkit API (and Google Identity if listed).",
        "",
        "Note: Google says OAuth changes can take several minutes to apply.",
      ].join("\n");
    case "auth/unauthorized-domain":
      return `This origin is not allowed for Firebase Auth. Firebase Console → Authentication → Settings → Authorized domains → add "${host}" (for local dev, "localhost" is usually enough; save and retry).`;
    case "auth/operation-not-allowed":
      return "Google sign-in is disabled. Firebase Console → Authentication → Sign-in method → enable Google.";
    case "auth/popup-blocked":
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled. Try again.";
    default: {
      const detail = [code && `Code: ${code}`, message && message !== code && message].filter(Boolean).join(" · ");
      return [
        "Sign-in failed.",
        detail || "Unknown error.",
        "",
        `Add this exact line under Google Cloud Console → APIs & Services → Credentials → your Web client → Authorized JavaScript origins:`,
        pageOrigin || "http://localhost:3000",
        "",
        `Use the same port as in your browser address bar (e.g. :3001 if Next chose another port).`,
      ].join("\n");
    }
  }
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [allowedReady, setAllowedReady] = useState(false);
  const [allowedUsersLoadError, setAllowedUsersLoadError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    if (typeof window !== "undefined" && window.location.search.includes("denied=1")) {
      setError("That Google account is not allowed to use this app. Ask an administrator to add your email under Users.");
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        await waitForRedirectAndAuthReady();
        if (cancelled) return;
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          setAuthUser(auth.currentUser);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(formatAuthError(e, typeof window !== "undefined" ? window.location.origin : ""));
        }
        console.error(e);
      }

      unsubscribe = subscribeToAuth((user) => {
        setAuthUser(user);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);

  useEffect(() => {
    if (!authUser) {
      setAllowedEmails([]);
      setAllowedReady(false);
      return;
    }
    setAllowedReady(false);
    const unsub = subscribeToAllowedUsers((emails) => {
      setAllowedEmails(emails);
      setAllowedReady(true);
    });
    return () => unsub();
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !allowedReady) return;
    if (!isEmailAllowlisted(authUser.email, allowedEmails)) {
      void (async () => {
        await logout();
        setError(
          "That Google account is not allowed to use this app. Ask an administrator to add your email under Users.",
        );
      })();
      return;
    }
    router.replace("/");
  }, [authUser, allowedReady, allowedEmails, router]);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      // Navigation happens in the allowlist effect after Firestore syncs.
    } catch (loginError: unknown) {
      setError(formatAuthError(loginError, origin || (typeof window !== "undefined" ? window.location.origin : "")));
      console.error(loginError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Real Estate Scheduler</h1>
        <p className="mb-4 text-sm text-zinc-600">Sign in using your Google ID to continue.</p>
        <button
          type="button"
          disabled={loading}
          onClick={handleLogin}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Signing In..." : "Sign in with Google"}
        </button>
        {error && (
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-red-50 p-3 text-left text-xs text-red-800">
            {error}
          </pre>
        )}
      </div>
    </main>
  );
}
