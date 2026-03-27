"use client";

import { useEffect } from "react";
import { ensureFirebaseAuthPersistence } from "@/lib/auth";

/** Ensures LOCAL auth persistence runs on every route before other auth listeners. */
export default function AuthPersistence() {
  useEffect(() => {
    void ensureFirebaseAuthPersistence();
  }, []);
  return null;
}
