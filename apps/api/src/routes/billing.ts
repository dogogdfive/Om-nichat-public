import Stripe from "stripe";
import { Hono } from "hono";
import { readEnv } from "../env.js";
import {
  billingPayload,
  getStripe,
  isPremiumUser,
  PREMIUM_SUBSCRIPTION_STATUSES,
  stripeConfigured,
} from "../billing/stripe.js";
import {
  findUserByEmail,
  findUserById,
  findUserByStripeCustomerId,
  updateUserBilling,
} from "../db/repos.js";
import { requireSession } from "./user-auth.js";

export const billingRoutes = new Hono();

billingRoutes.post("/api/billing/checkout", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  if (!stripeConfigured()) return c.json({ error: "billing not configured" }, 503);

  const user = await findUserById(session.userId);
  if (!user) return c.json({ error: "user not found" }, 404);
  if (isPremiumUser(user)) return c.json({ error: "already premium" }, 400);

  const stripe = getStripe();
  const webAppUrl = readEnv("WEB_APP_URL") ?? "http://localhost:3000";
  const priceId = readEnv("STRIPE_PRICE_ID")!;

  let customerId = user.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await updateUserBilling(user.id, { stripeCustomerId: customerId });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${webAppUrl}/chat?upgraded=1`,
    cancel_url: `${webAppUrl}/chat?upgrade=canceled`,
    client_reference_id: user.id,
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
  });

  if (!checkoutSession.url) return c.json({ error: "checkout session missing url" }, 500);
  return c.json({ url: checkoutSession.url });
});

billingRoutes.post("/api/billing/portal", async (c) => {
  const session = requireSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  if (!stripeConfigured()) return c.json({ error: "billing not configured" }, 503);

  const user = await findUserById(session.userId);
  if (!user?.stripeCustomerId) {
    return c.json({ error: "no billing account — subscribe first" }, 400);
  }

  const stripe = getStripe();
  const webAppUrl = readEnv("WEB_APP_URL") ?? "http://localhost:3000";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${webAppUrl}/chat`,
  });

  return c.json({ url: portalSession.url });
});

billingRoutes.post("/api/billing/webhook", async (c) => {
  const sig = c.req.header("stripe-signature");
  const webhookSecret = readEnv("STRIPE_WEBHOOK_SECRET");
  if (!sig || !webhookSecret) return c.json({ error: "webhook not configured" }, 400);

  const rawBody = await c.req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed", err);
    return c.json({ error: "invalid signature" }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] ${event.type}`, err);
    return c.json({ error: "webhook handler failed" }, 500);
  }

  return c.json({ received: true });
});

async function resolveUserId(
  userId: string | null | undefined,
  customerId: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  if (userId) {
    const user = await findUserById(userId);
    if (user) return user.id;
  }
  if (customerId) {
    const user = await findUserByStripeCustomerId(customerId);
    if (user) return user.id;
  }
  if (email) {
    const user = await findUserByEmail(email);
    if (user) return user.id;
  }
  return null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const userId = await resolveUserId(
    session.client_reference_id ?? session.metadata?.userId,
    customerId,
    session.customer_details?.email ?? session.customer_email,
  );
  if (!userId) {
    console.warn("[billing/webhook] checkout.session.completed: could not resolve user");
    return;
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (subId) {
    const sub = await getStripe().subscriptions.retrieve(subId);
    await applySubscription(sub, userId);
    return;
  }

  if (customerId) {
    await updateUserBilling(userId, { stripeCustomerId: customerId });
  }
}

async function applySubscription(sub: Stripe.Subscription, knownUserId?: string) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId =
    knownUserId ??
    (await resolveUserId(sub.metadata?.userId, customerId, null));
  if (!userId) {
    console.warn("[billing/webhook] subscription event: could not resolve user", sub.id);
    return;
  }

  const isPremium = PREMIUM_SUBSCRIPTION_STATUSES.has(sub.status);
  await updateUserBilling(userId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripeSubscriptionStatus: sub.status,
    plan: isPremium ? "premium" : "free",
  });
}
