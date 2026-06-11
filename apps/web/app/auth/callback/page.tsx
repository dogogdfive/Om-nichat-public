"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { saveToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("token");
    if (token) saveToken(token);
    const linked = params.get("linked");

    (async () => {
      const meRes = await apiFetch("/api/auth/me");
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const me = await meRes.json();
      if (!me.workspace?.profileSetupComplete) {
        router.replace("/onboarding/username");
        return;
      }
      router.replace(linked ? `/chat?linked=${linked}` : "/chat");
    })();
  }, [params, router]);

  return (
    <main className="min-h-screen flex items-center justify-center text-zinc-400">
      Signing you in…
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-zinc-400">
          Signing you in…
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
