import { apiFetch } from "./api";

export async function startStripeCheckout(): Promise<boolean> {
  const res = await apiFetch("/api/billing/checkout", { method: "POST" });
  if (res.ok) {
    const data = (await res.json()) as { url?: string };
    if (data.url) {
      window.location.href = data.url;
      return true;
    }
  }
  const fallback = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
  if (fallback) {
    window.open(fallback, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

export async function openStripePortal(): Promise<boolean> {
  const res = await apiFetch("/api/billing/portal", { method: "POST" });
  if (!res.ok) return false;
  const data = (await res.json()) as { url?: string };
  if (!data.url) return false;
  window.location.href = data.url;
  return true;
}
