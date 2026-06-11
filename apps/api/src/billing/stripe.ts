import Stripe from "stripe";
import { readEnv } from "../env.js";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = readEnv("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    stripe = new Stripe(key);
  }
  return stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(readEnv("STRIPE_SECRET_KEY") && readEnv("STRIPE_PRICE_ID"));
}

export const PREMIUM_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export type BillingUser = {
  role: string;
  plan?: string | null;
  stripeSubscriptionStatus?: string | null;
};

export function isPremiumUser(user: BillingUser): boolean {
  if (user.role === "super_admin") return true;
  return (
    user.plan === "premium" &&
    !!user.stripeSubscriptionStatus &&
    PREMIUM_SUBSCRIPTION_STATUSES.has(user.stripeSubscriptionStatus)
  );
}

export function billingPayload(user: BillingUser) {
  const premium = isPremiumUser(user);
  return {
    plan: premium ? ("premium" as const) : ("free" as const),
    isPremium: premium,
    stripeSubscriptionStatus: user.stripeSubscriptionStatus ?? null,
  };
}
