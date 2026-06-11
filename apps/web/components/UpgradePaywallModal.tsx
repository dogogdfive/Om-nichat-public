"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

const PRICE = "$4.99";

export function UpgradePaywallModal({ open, onClose, onUpgrade }: Props) {
  if (!open) return null;

  return (
    <div className="prochat-paywall-overlay" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <div className="prochat-paywall-card">
        <button type="button" className="prochat-paywall-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="prochat-paywall-eyebrow">Free tier complete</p>
        <h2 id="paywall-title" className="prochat-paywall-title">
          Keep chatting on every platform
        </h2>
        <p className="prochat-paywall-copy">
          You&apos;ve used your 10 free days. Upgrade to OM+ to keep{" "}
          <strong>X and Rumble live chat</strong>, unlock more channels, and support the project.
        </p>
        <ul className="prochat-paywall-list">
          <li>X &amp; Rumble live chat ingest</li>
          <li>Up to 8+ live channels at once</li>
          <li>Priority ingest &amp; early features</li>
          <li>Full mod tools &amp; overlay integrations</li>
        </ul>
        <div className="prochat-paywall-price">
          <span className="prochat-paywall-price-amount">{PRICE}</span>
          <span className="prochat-paywall-price-period">/ month</span>
        </div>
        <button type="button" className="prochat-paywall-upgrade" onClick={onUpgrade}>
          Upgrade with Stripe — {PRICE}/mo
        </button>
        <p className="prochat-paywall-foot">Billed monthly. Cancel anytime.</p>
      </div>
    </div>
  );
}
