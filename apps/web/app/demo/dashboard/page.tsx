"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatMockup } from "@/components/ChatMockup";
import { PlatformLogos } from "@/components/PlatformLogos";

const PLATFORMS = [
  { id: "twitch", label: "Twitch", connected: true, user: "streamer_demo" },
  { id: "kick", label: "Kick", connected: true, user: "streamer_demo" },
  { id: "x", label: "X", connected: false },
] as const;

export default function DemoDashboardPage() {
  const [tab, setTab] = useState<"chat" | "settings">("chat");

  return (
    <div className="min-h-[calc(100vh-32px)] flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between bg-[#111113]">
        <div className="flex items-center gap-6">
          <Link href="/demo" className="font-bold text-lg">
            <span className="text-white">OM</span>
            <span className="text-violet-500">nichat</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`px-3 py-1.5 rounded-md ${tab === "chat" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`px-3 py-1.5 rounded-md ${tab === "settings" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
            >
              Settings
            </button>
          </nav>
        </div>
        <Link href="/demo/login" className="text-sm text-zinc-500 hover:text-white">
          Log out
        </Link>
      </header>

      {tab === "chat" ? (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-zinc-800 p-4 bg-[#0e0e10] shrink-0">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Channels</p>
            <ul className="space-y-1 text-sm">
              {PLATFORMS.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${p.connected ? "bg-violet-950/40 text-white" : "text-zinc-500"}`}
                >
                  <span className="capitalize">{p.label}</span>
                  <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-green-500" : "bg-zinc-600"}`} />
                </li>
              ))}
            </ul>
          </aside>
          <div className="flex-1 flex flex-col min-h-0 bg-black">
            <div className="flex-1 flex items-center justify-center p-6 min-h-[400px]">
              <div className="w-full max-w-lg">
                <ChatMockup />
              </div>
            </div>
            <footer className="border-t border-zinc-800 p-3 bg-[#111113]">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <input
                  type="text"
                  placeholder="Send a message to all connected platforms…"
                  className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-2 text-sm"
                  readOnly
                />
                <button type="button" className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold">
                  Chat
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : (
        <div className="flex-1 max-w-2xl mx-auto w-full p-6 space-y-8">
          <section>
            <h2 className="text-xl font-bold mb-2">Link platforms</h2>
            <p className="text-sm text-zinc-500 mb-4">Static demo — connect buttons are visual only.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {PLATFORMS.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-xl border-2 p-4 ${p.connected ? "border-green-500/60 bg-green-500/5" : "border-zinc-700"}`}
                >
                  <p className="font-medium capitalize">{p.label}</p>
                  <p className="text-sm mt-1 text-zinc-500">
                    {p.connected ? `Connected · @${p.user}` : "Tap to connect"}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="demo-platforms-card p-6">
            <p className="text-xs font-semibold tracking-widest text-zinc-500 mb-4 text-center">
              WORKS WITH
            </p>
            <PlatformLogos compact />
          </section>
          <p className="text-sm text-zinc-500">
            Wire real OAuth in{" "}
            <Link href="/dashboard" className="text-violet-400 hover:underline">
              /dashboard
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
