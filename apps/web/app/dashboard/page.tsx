"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

type Connections = Record<string, { status: string; username?: string }>;
type Omnibot = {
  enabled: boolean;
  paused?: boolean;
  walletScanner: boolean;
  walletTimeoutSeconds: number;
  viewerCollective: boolean;
  platforms: { twitch: boolean; kick: boolean; x: boolean };
};

type AuditRow = {
  id: string;
  platform: string;
  targetDisplayName: string;
  matchedPattern: string;
  action: string;
  createdAt: string;
};

const PLATFORMS = [
  { id: "twitch" as const, label: "Twitch" },
  { id: "kick" as const, label: "Kick" },
  { id: "x" as const, label: "X" },
];

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<{ workspace?: { id: string; slug: string } } | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [omnibot, setOmnibot] = useState<Omnibot | null>(null);
  const [error, setError] = useState("");
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [omnibotJustSaved, setOmnibotJustSaved] = useState(false);

  function patchOmnibot(patch: Partial<Omnibot>) {
    setOmnibotJustSaved(false);
    setOmnibot((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function load() {
    const meRes = await apiFetch("/api/auth/me");
    if (!meRes.ok) {
      setError("Please log in");
      return;
    }
    const meJson = await meRes.json();
    if (!meJson.workspace?.profileSetupComplete) {
      router.replace("/onboarding/username");
      return;
    }
    setMe(meJson);
    const wsId = meJson.workspace?.id;
    if (!wsId) return;
    const connRes = await apiFetch(`/api/workspaces/${wsId}/connections`);
    setConnections((await connRes.json()).connections);
    const obRes = await apiFetch(`/api/workspaces/${wsId}/omnibot`);
    setOmnibot((await obRes.json()).config);
    const auditRes = await apiFetch(`/api/workspaces/${wsId}/omnibot/audit?limit=30`);
    if (auditRes.ok) {
      const j = await auditRes.json();
      setAudit(j.audit ?? []);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      setError("Please log in");
      return;
    }
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("linked")) {
      load();
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  async function connectPlatform(platform: "twitch" | "kick" | "x") {
    if (connections?.[platform]?.status === "connected") return;
    const res = await apiFetch(`/api/auth/${platform}/start`);
    if (!res.ok) {
      setError("Connect failed — log in again");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
  }

  async function saveOmnibot() {
    if (!me?.workspace?.id || !omnibot) return;
    const res = await apiFetch(`/api/workspaces/${me.workspace.id}/omnibot`, {
      method: "PATCH",
      body: JSON.stringify(omnibot),
    });
    if (!res.ok) return;
    setOmnibotJustSaved(true);
    await load();
  }

  async function previewWalletScan() {
    if (!me?.workspace?.id) return;
    const res = await apiFetch(`/api/workspaces/${me.workspace.id}/omnibot/test-wallet`, {
      method: "POST",
      body: JSON.stringify({ text: testText }),
    });
    if (!res.ok) {
      setTestResult("Scan failed");
      return;
    }
    const j = await res.json();
    const matches = (j.matches ?? []) as { kind: string; match: string }[];
    if (matches.length === 0) setTestResult("No wallet addresses detected.");
    else
      setTestResult(
        `Would block: ${j.wouldBlock ? "yes" : "no"} — ${matches.map((m) => `${m.kind}: ${m.match}`).join("; ")}`,
      );
  }


  if (error) {
    return (
      <main className="max-w-lg mx-auto py-16 px-6">
        <p>{error}</p>
        <Link href="/login" className="text-violet-400">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto py-10 px-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link href="/chat" className="text-sm text-red-400 hover:underline">
            ← Back to chat
          </Link>
        </div>
        <button
          type="button"
          className="text-sm text-zinc-500"
          onClick={() => {
            clearToken();
            window.location.href = "/login";
          }}
        >
          Log out
        </button>
      </div>
      {me?.workspace && (
        <p className="text-zinc-400 text-sm">
          Workspace slug: <strong className="text-zinc-200">{me.workspace.slug}</strong>
        </p>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Link platforms</h2>
        <p className="text-sm text-zinc-500">
          Signed in with one platform? Connect the others here. Usernames can all be different.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => {
            const connected = connections?.[p.id]?.status === "connected";
            const username = connections?.[p.id]?.username;
            return (
              <button
                key={p.id}
                type="button"
                disabled={connected}
                onClick={() => connectPlatform(p.id)}
                aria-pressed={connected}
                className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                  connected
                    ? "border-green-500 bg-green-500/10 cursor-default"
                    : "border-zinc-700 bg-zinc-800 hover:border-zinc-500 hover:bg-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">{p.label}</span>
                  {connected && (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-black"
                      aria-hidden
                    >
                      ✓
                    </span>
                  )}
                </div>
                {connected ? (
                  <p className="mt-2 text-sm text-green-400">
                    Connected{username ? ` · @${username}` : ""}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">Tap to connect</p>
                )}
              </button>
            );
          })}
        </div>
      </section>
      {omnibot && (
        <section className="space-y-4 border border-zinc-800 rounded-xl p-4">
          <div>
            <h2 className="font-semibold text-lg">Omnibunny</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Auto-mod: times out chatters who post SOL, ETH, or BTC wallets on Twitch and Kick.
              Uses <strong className="text-zinc-400">your</strong> connected channel OAuth — not
              @omnibunnybot. Real timeouts on Twitch &amp; Kick chat when the scanner is on.
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              You do <strong className="text-zinc-400">not</strong> need to mod @omnibunnybot for
              timeouts. On your own channel, broadcaster permissions are enough. Reconnect Twitch/Kick
              if you linked before moderation scopes were added.
            </p>
            {omnibot.paused && (
              <p className="text-sm text-amber-400 mt-2">
                Paused in chat — type <code className="text-amber-200">@omnibunnybot start</code> to
                resume.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">Chat commands (mods / broadcaster)</p>
            <p>
              <code className="text-zinc-200">@omnibunnybot pause</code> — stop wallet timeouts
            </p>
            <p>
              <code className="text-zinc-200">@omnibunnybot start</code> — resume wallet timeouts
            </p>
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={omnibot.enabled}
              onChange={(e) => patchOmnibot({ enabled: e.target.checked })}
            />
            Omnibunny enabled
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={omnibot.walletScanner}
              onChange={(e) => patchOmnibot({ walletScanner: e.target.checked })}
            />
            Wallet scanner
          </label>
          <label className="flex gap-2 text-sm items-center">
            <span className="w-32">Timeout (sec)</span>
            <input
              type="number"
              min={60}
              max={1209600}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 w-28"
              value={omnibot.walletTimeoutSeconds ?? 600}
              onChange={(e) =>
                patchOmnibot({
                  walletTimeoutSeconds: Number(e.target.value) || 600,
                })
              }
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">Apply on platforms</p>
            {PLATFORMS.map((p) => (
              <label key={p.id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={omnibot.platforms[p.id]}
                  onChange={(e) =>
                    patchOmnibot({
                      platforms: { ...omnibot.platforms, [p.id]: e.target.checked },
                    })
                  }
                />
                {p.label}
                {p.id === "x" && (
                  <span className="text-zinc-500">(audit only until X mod bridge)</span>
                )}
              </label>
            ))}
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={omnibot.viewerCollective}
              onChange={(e) => patchOmnibot({ viewerCollective: e.target.checked })}
            />
            Viewer collective chat
          </label>
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <p className="text-sm font-medium">Test scanner (no timeout)</p>
            <textarea
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm min-h-[72px]"
              placeholder="Paste a message to test…"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
            />
            <button
              type="button"
              onClick={previewWalletScan}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm"
            >
              Preview scan
            </button>
            {testResult && <p className="text-sm text-zinc-400">{testResult}</p>}
          </div>
          <button
            type="button"
            onClick={saveOmnibot}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              omnibotJustSaved
                ? "bg-red-950 text-red-100 cursor-default"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {omnibotJustSaved ? "Saved" : "Save Omnibunny"}
          </button>
          {audit.length > 0 && (
            <div className="pt-3 border-t border-zinc-800">
              <p className="text-sm font-medium mb-2">Recent actions</p>
              <ul className="text-xs space-y-1 max-h-40 overflow-auto text-zinc-400">
                {audit.map((a) => (
                  <li key={a.id}>
                    {new Date(a.createdAt).toLocaleString()} · {a.platform} · @{a.targetDisplayName}{" "}
                    · {a.action} · {a.matchedPattern.slice(0, 40)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-2xl mx-auto py-10 px-6 text-zinc-400">Loading dashboard…</main>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
