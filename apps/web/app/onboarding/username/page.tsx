"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, saveToken } from "@/lib/auth";

const PLATFORM_LABELS: Record<string, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
};

function UsernameSetupInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const platform = params.get("platform") ?? "twitch";

  useEffect(() => {
    const token = params.get("token");
    if (token) saveToken(token);
    const suggested = params.get("suggested");
    if (suggested) setUsername(suggested.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24));
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Please confirm you agree to the terms.");
      return;
    }
    const raw = username.trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(raw)) {
      setError("Username must be 3–24 letters, numbers, or underscores.");
      return;
    }
    setStatus("saving");
    setError("");
    const meRes = await apiFetch("/api/auth/me");
    if (!meRes.ok) {
      setStatus("error");
      setError("Session expired — please sign in again.");
      return;
    }
    const me = await meRes.json();
    const wsId = me.workspace?.id;
    if (!wsId) {
      setStatus("error");
      setError("No workspace found.");
      return;
    }
    const res = await apiFetch(`/api/workspaces/${wsId}/profile`, {
      method: "PATCH",
      body: JSON.stringify({ username: raw }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStatus("error");
      setError((j as { error?: string }).error ?? "Could not save username");
      return;
    }
    setStatus("done");
    setTimeout(() => router.replace("/chat"), 1200);
  }

  if (!getToken() && !params.get("token")) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-zinc-400">
          <Link href="/login" className="text-red-400 underline">
            Sign in
          </Link>{" "}
          first.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <form onSubmit={submit} className="card-dark w-full max-w-md p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-center mb-6">Create Account 👋</h1>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3 mb-6 flex items-center gap-3">
            <span className="text-sm text-zinc-400">Signed in with</span>
            <span className="font-semibold capitalize">{PLATFORM_LABELS[platform] ?? platform}</span>
          </div>
          <label className="block text-sm text-zinc-400 mb-2">Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-black px-4 py-3 mb-4 focus:border-red-500 focus:outline-none"
            placeholder="yourname"
            maxLength={24}
            autoComplete="username"
            required
          />
          <label className="flex gap-2 text-xs text-zinc-400 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm that I am at least 13 years old and agree to the{" "}
              <Link href="/features" className="text-blue-400 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/" className="text-blue-400 hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {status === "done" && (
            <div className="mb-4 rounded-lg bg-emerald-600/20 border border-emerald-600/50 px-4 py-2 text-sm text-emerald-300 text-center">
              Account created. Redirecting…
            </div>
          )}
          {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
          <button
            type="submit"
            disabled={status === "saving" || status === "done"}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-3 font-semibold text-white transition-colors"
          >
            {status === "saving" ? "Creating Account…" : status === "done" ? "Done!" : "Create Account"}
          </button>
          <p className="text-center text-sm text-zinc-500 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:underline">
              Login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function UsernameOnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</main>}>
      <UsernameSetupInner />
    </Suspense>
  );
}
