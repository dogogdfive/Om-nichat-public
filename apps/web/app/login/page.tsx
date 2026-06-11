"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthOAuthButtons, type OAuthAvailability } from "@/components/AuthOAuthButtons";
import { apiFetch } from "@/lib/api";
import { clearToken, saveToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [oauth, setOauth] = useState<OAuthAvailability | null>(null);

  useEffect(() => {
    apiFetch("/health")
      .then(async (res) => {
        if (!res.ok) {
          setApiReachable(false);
          return;
        }
        const data = (await res.json()) as {
          oauth?: OAuthAvailability & { youtube?: boolean };
        };
        setApiReachable(true);
        setOauth({
          google: data.oauth?.google,
          twitch: data.oauth?.twitch,
          kick: data.oauth?.kick,
          x: data.oauth?.x,
        });
      })
      .catch(() => setApiReachable(false));
  }, []);

  const oauthConfigured = oauth !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Invalid username or password");
        return;
      }
      if (data.token) {
        if (remember) saveToken(data.token);
        else clearToken();
      }
      const meRes = await apiFetch("/api/auth/me");
      if (!meRes.ok) {
        router.replace("/chat");
        return;
      }
      const me = (await meRes.json()) as {
        workspace?: { profileSetupComplete?: boolean };
      };
      if (!me.workspace?.profileSetupComplete) {
        router.replace("/onboarding/username");
        return;
      }
      router.replace("/chat");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="prochat-auth-page">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="prochat-auth-panel">
          <Link href="/" className="prochat-auth-home-link">
            ← Back to home
          </Link>

          <h1 className="text-2xl font-bold text-center mb-8 flex items-center justify-center gap-2">
            <span>Welcome to OMnichat!</span>
            <Image
              src="/om-login-star.png"
              alt=""
              width={28}
              height={28}
              className="shrink-0"
              aria-hidden
            />
          </h1>

          {apiReachable === false ? (
            <p className="text-sm text-amber-200 text-center mb-4" role="status">
              Cannot reach the API server. Start it with{" "}
              <code className="text-xs bg-black/25 px-1 rounded">pnpm dev:api</code> in the
              project root, then try again.
            </p>
          ) : null}

          {apiReachable && oauth && !oauthConfigured ? (
            <p className="text-sm prochat-auth-muted text-center mb-4" role="status">
              Use username/password below. OAuth buttons need provider keys in{" "}
              <code className="text-xs bg-black/25 px-1 rounded">.env</code>.
            </p>
          ) : null}

          {oauth !== null ? <AuthOAuthButtons mode="login" oauth={oauth} /> : null}

          {oauthConfigured ? (
            <div className="prochat-auth-divider">
              <div className="prochat-auth-divider-line" />
              <span className="prochat-auth-divider-text">or continue with email</span>
              <div className="prochat-auth-divider-line" />
            </div>
          ) : (
            <div className="mt-6" />
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="prochat-auth-muted mb-1 block font-medium">Username or email</span>
              <input
                type="text"
                className="prochat-auth-input"
                placeholder="you@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="prochat-auth-muted mb-1 block font-medium">Password</span>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className="prochat-auth-input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs font-semibold hover:text-zinc-900"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 prochat-auth-muted cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-white/40"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
            </div>
            {error ? (
              <p className="text-sm text-amber-100 text-center font-medium" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="prochat-auth-submit disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>

          <p className="text-center text-sm prochat-auth-muted mt-6">
            Need an account?{" "}
            <Link href="/signup" className="prochat-auth-link">
              Sign up
            </Link>
          </p>
        </div>
      </div>
      <footer className="prochat-auth-footer">
        <Link href="/features" className="hover:text-white">
          Terms of Service
        </Link>
        <span className="mx-2">·</span>
        <Link href="/" className="hover:text-white">
          Home
        </Link>
      </footer>
    </main>
  );
}
