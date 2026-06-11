"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

type WsRow = {
  id: string;
  slug: string;
  displayName: string;
  connections: Record<string, { status: string }>;
};

export default function AdminPage() {
  const [rows, setRows] = useState<WsRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      setError("Log in as super admin first");
      return;
    }
    apiFetch("/api/admin/workspaces").then(async (res) => {
      if (!res.ok) {
        setError("Forbidden — set SUPER_ADMIN_EMAILS on your account");
        return;
      }
      const j = await res.json();
      setRows(j.workspaces ?? []);
    });
  }, []);

  if (error) {
    return (
      <main className="max-w-lg mx-auto py-16 px-6">
        <p className="text-red-400">{error}</p>
        <Link href="/login" className="text-violet-400">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold mb-2">Super admin</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Manage every streamer workspace. Only visible to super_admin users.
      </p>

      <ul className="space-y-4">
        {rows.map((w) => (
          <li key={w.id} className="border border-zinc-800 rounded-lg p-4">
            <strong>{w.displayName}</strong> (@{w.slug})
            <pre className="text-xs text-zinc-500 mt-2 overflow-auto">
              {JSON.stringify(w.connections, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
      <Link href="/" className="text-sm text-violet-400 mt-8 inline-block">
        Home
      </Link>
    </main>
  );
}
