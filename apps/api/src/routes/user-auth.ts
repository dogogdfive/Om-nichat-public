import "../env.js";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  clearSessionCookieHeader,
  parseSessionFromRequest,
  sessionCookieHeader,
  signSession,
} from "../auth/session.js";
import {
  createUserWithWorkspace,
  findUserByEmail,
  findUserById,
  findUserByLogin,
  getConnections,
  getWorkspaceForUser,
  isProfileSetupComplete,
  isSlugAvailable,
  resolveSuperAdminRole,
  updateWorkspaceProfile,
} from "../db/repos.js";
import { billingPayload } from "../billing/stripe.js";

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return local.replace(/[^a-z0-9]/gi, "").toLowerCase() || "user";
}

export const userAuthRoutes = new Hono();

userAuthRoutes.post("/api/auth/signup", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    slug?: string;
    displayName?: string;
  };
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password || password.length < 8) {
    return c.json({ error: "email and password (8+ chars) required" }, 400);
  }
  const existing = await findUserByEmail(email);
  if (existing) return c.json({ error: "email already registered" }, 409);
  const slug = (body.slug ?? slugFromEmail(email)).toLowerCase().replace(/^@/, "");
  const role = resolveSuperAdminRole(email);
  const { user, workspace } = await createUserWithWorkspace(
    email,
    hashPassword(password),
    slug,
    body.displayName ?? slug,
    role,
  );
  const token = signSession({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    role: user.role,
  });
  c.header("Set-Cookie", sessionCookieHeader(token));
  return c.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
    workspace: { id: workspace.id, slug: workspace.slug },
  });
});

userAuthRoutes.post("/api/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    login?: string;
    password?: string;
  };
  const identifier = (body.login ?? body.email ?? "").trim();
  const user = identifier ? await findUserByLogin(identifier) : null;
  if (!user || !body.password || !verifyPassword(body.password, user.passwordHash)) {
    return c.json({ error: "invalid credentials" }, 401);
  }
  const workspace = await getWorkspaceForUser(user.id);
  if (!workspace) return c.json({ error: "no workspace" }, 500);
  const role =
    resolveSuperAdminRole(user.email) === "super_admin" || user.role === "super_admin"
      ? "super_admin"
      : user.role;
  const token = signSession({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    role,
  });
  c.header("Set-Cookie", sessionCookieHeader(token));
  return c.json({
    token,
    user: { id: user.id, email: user.email, role },
    workspace: { id: workspace.id, slug: workspace.slug },
  });
});

userAuthRoutes.post("/api/auth/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});

userAuthRoutes.get("/api/auth/me", async (c) => {
  const session = parseSessionFromRequest({
    cookie: c.req.header("cookie"),
    authorization: c.req.header("authorization"),
  });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const role =
    resolveSuperAdminRole(session.email) === "super_admin" || session.role === "super_admin"
      ? "super_admin"
      : session.role;
  const workspace = await getWorkspaceForUser(session.userId);
  const profileSetupComplete = workspace
    ? await isProfileSetupComplete(workspace.id)
    : false;
  const user = await findUserById(session.userId);
  const billing = user
    ? billingPayload({
        role,
        plan: user.plan,
        stripeSubscriptionStatus: user.stripeSubscriptionStatus,
      })
    : { plan: "free" as const, isPremium: role === "super_admin", stripeSubscriptionStatus: null };
  return c.json({
    user: {
      id: session.userId,
      email: session.email,
      role,
      ...billing,
    },
    workspace: workspace
      ? {
          id: workspace.id,
          slug: workspace.slug,
          displayName: workspace.displayName,
          profileSetupComplete,
        }
      : null,
  });
});

userAuthRoutes.patch("/api/workspaces/:id/profile", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  if (session.workspaceId !== id && session.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
  };
  const raw = (body.username ?? body.displayName ?? "").trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(raw)) {
    return c.json({ error: "Username must be 3–24 letters, numbers, or underscores" }, 400);
  }
  const slug = raw.toLowerCase();
  const available = await isSlugAvailable(slug, id);
  if (!available) return c.json({ error: "Username is already taken" }, 409);
  try {
    const updated = await updateWorkspaceProfile(id, raw, slug);
    return c.json({ ok: true, workspace: { ...updated, profileSetupComplete: true } });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "update failed" }, 500);
  }
});

userAuthRoutes.get("/api/workspaces/:id/profile/check-slug", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const slug = (c.req.query("slug") ?? "").toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,24}$/.test(slug)) {
    return c.json({ available: false, reason: "invalid" });
  }
  const available = await isSlugAvailable(slug, c.req.param("id"));
  return c.json({ available });
});

userAuthRoutes.get("/api/workspaces/:id/connections", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  if (session.workspaceId !== id && session.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const connections = await getConnections(id);
    return c.json({ workspaceId: id, connections });
  } catch (e) {
    console.error("[connections]", e);
    const msg = e instanceof Error ? e.message : "failed to load connections";
    return c.json({ error: msg }, 500);
  }
});

export function requireSession(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
}): { userId: string; workspaceId: string; email: string; role: string } | null {
  const session = parseSessionFromRequest({
    cookie: c.req.header("cookie"),
    authorization: c.req.header("authorization"),
  });
  if (session) {
    const role =
      resolveSuperAdminRole(session.email) === "super_admin" || session.role === "super_admin"
        ? "super_admin"
        : session.role;
    return { ...session, role };
  }
  const devWs = c.req.query("workspace");
  if (devWs && process.env.NODE_ENV !== "production") {
    return {
      userId: "dev",
      workspaceId: devWs,
      email: "dev@local",
      role: "owner",
    };
  }
  return null;
}
