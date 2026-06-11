"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthOAuthButtons, type OAuthAvailability } from "@/components/AuthOAuthButtons";
import { apiFetch } from "@/lib/api";
import { saveToken } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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

  const oauthConfigured = Boolean(
    oauth?.google || oauth?.twitch || oauth?.kick || oauth?.x,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create account");
        return;
      }
      if (data.token) saveToken(data.token);
      router.replace("/onboarding/username");
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

          <h1 className="text-2xl font-bold text-center mb-8">Create your OMnichat account</h1>

          {apiReachable === false ? (
            <p className="text-sm text-amber-200 text-center mb-4" role="status">
              Cannot reach the API server. Start it with{" "}
              <code className="text-xs bg-black/25 px-1 rounded">pnpm dev:api</code> in the
              project root, then try again.
            </p>
          ) : null}

          {apiReachable && oauth && !oauthConfigured ? (
            <p className="text-sm prochat-auth-muted text-center mb-4" role="status">
              Use email below to sign up. OAuth buttons need provider keys in{" "}
              <code className="text-xs bg-black/25 px-1 rounded">.env</code>.
            </p>
          ) : null}

          {oauth !== null ? <AuthOAuthButtons mode="signup" oauth={oauth} /> : null}

          {oauthConfigured ? (
            <div className="prochat-auth-divider">
              <div className="prochat-auth-divider-line" />
              <span className="prochat-auth-divider-text">or sign up with email</span>
              <div className="prochat-auth-divider-line" />
            </div>
          ) : (
            <div className="mt-6" />
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm">
              <span className="prochat-auth-muted mb-1 block font-medium">Email</span>
              <input
                type="email"
                className="prochat-auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="prochat-auth-muted mb-1 block font-medium">Password</span>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className="prochat-auth-input pr-10"
                  placeholder="8+ characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
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
            {error ? (
              <p className="text-sm text-amber-100 text-center font-medium" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={loading} className="prochat-auth-submit">
              {loading ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <p className="text-center text-sm prochat-auth-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="prochat-auth-link">
              Log in
            </Link>
          </p>
          <p className="text-center text-sm prochat-auth-muted mt-3">
            Or{" "}
            <Link href="/" className="prochat-auth-link">
              explore without an account
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
