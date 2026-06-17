"use client";

import { useEffect } from "react";
import { ensureFirebaseAppCheck } from "@/lib/appCheck";
import { ensureFirebaseAuthPersistence } from "@/lib/auth";

/** App Check + auth persistence before any Firestore listeners on any route. */
export default function AuthPersistence() {
  useEffect(() => {
    ensureFirebaseAppCheck();
    void ensureFirebaseAuthPersistence();
  }, []);
  return null;
}
