"use client";

import { useEffect, useState } from "react";
import { isBuiltinAllowedUserEmail, isUserAllowlistEnforced } from "@/lib/allowedUsers";

interface UserManagerProps {
  emails: string[];
  onSave: (emails: string[]) => Promise<void>;
  currentUserEmail?: string;
}

export default function UserManager({ emails, onSave, currentUserEmail }: UserManagerProps) {
  const [draft, setDraft] = useState<string[]>(() => [...emails]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    setDraft([...emails]);
  }, [emails]);

  function normalizeEmail(raw: string) {
    return raw.trim().toLowerCase();
  }

  function isValidEmail(raw: string) {
    const e = normalizeEmail(raw);
    if (!e) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  function addEmail() {
    const e = normalizeEmail(newEmail);
    if (!isValidEmail(newEmail)) {
      setError("Enter a valid email address (the Google account they will use to sign in).");
      return;
    }
    if (draft.includes(e)) {
      setError("That email is already on the list.");
      return;
    }
    setDraft((prev) => [...prev, e].sort((a, b) => a.localeCompare(b)));
    setNewEmail("");
    setError(null);
    setSuccess(null);
  }

  function removeAt(index: number) {
    const email = draft[index];
    if (email && isBuiltinAllowedUserEmail(email)) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setError(null);
    setSuccess(null);
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    let toSave = draft;
    if (toSave.length > 0 && currentUserEmail) {
      const selfNorm = normalizeEmail(currentUserEmail);
      if (selfNorm && !toSave.includes(selfNorm)) {
        toSave = [...toSave, selfNorm].sort((a, b) => a.localeCompare(b));
        setDraft(toSave);
      }
    }
    setSaving(true);
    const savePromise = onSave(toSave);
    try {
      const result = await Promise.race([
        savePromise.then(() => "saved" as const),
        new Promise<"timeout">((resolve) => {
          window.setTimeout(() => resolve("timeout"), 2500);
        }),
      ]);

      if (result === "saved") {
        setSuccess("Saved successfully.");
      } else {
        setSuccess("Saved locally. Syncing to Firestore in the background...");
        void savePromise.catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not sync to Firestore.";
          setError(msg);
          setSuccess(null);
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const currentNorm = currentUserEmail ? normalizeEmail(currentUserEmail) : "";

  const enforcementOn = isUserAllowlistEnforced();

  return (
    <div className="space-y-4">
      {!enforcementOn && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          User restrictions are <strong className="font-medium">off</strong> until you set{" "}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_USER_ALLOWLIST_ENABLED=true</code> in Vercel (or{" "}
          <code className="rounded bg-amber-100 px-1">.env.local</code>
          ). The list below is saved for when you turn that on.
        </p>
      )}
      <p className="text-xs leading-relaxed text-zinc-600">
        Each entry must match the <strong className="font-medium text-zinc-800">Google account email</strong> someone
        uses to sign in. When enforcement is on and this list is <strong className="font-medium text-zinc-800">empty</strong>, any Google
        account can use the app. When enforcement is on and you add one or more emails, <strong className="font-medium text-zinc-800">only</strong>{" "}
        those accounts can load projects and the timeline. Saving a non-empty list automatically includes your
        current sign-in email so you do not lock yourself out.
      </p>

      <div className="space-y-2">
        {draft.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500">
            No restrictions — all Google sign-ins are allowed.
          </p>
        ) : (
          draft.map((email, i) => {
            const isSelf = currentNorm && email === currentNorm;
            const isBuiltin = isBuiltinAllowedUserEmail(email);
            return (
              <div
                key={email}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-zinc-800" title={email}>
                  {email}
                  {isSelf ? (
                    <span className="ml-2 text-xs font-normal text-zinc-500">(you)</span>
                  ) : null}
                  {isBuiltin ? (
                    <span className="ml-2 text-xs font-normal text-zinc-500">(built-in)</span>
                  ) : null}
                </span>
                {isBuiltin ? (
                  <span className="shrink-0 text-[10px] text-zinc-400" title="Required account">
                    —
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-zinc-700">Add Google account email</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
          />
          <button
            type="button"
            onClick={addEmail}
            disabled={!newEmail.trim()}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">{success}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save users"}
      </button>
    </div>
  );
}
