"use client";

import {
  FREE_TIER_STAR_COUNT,
  type FreeTierState,
  filledStarCount,
  freeUsesLeft,
  isFreeTierWarning,
} from "@/lib/free-tier-stars";

type Props = {
  state: FreeTierState;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`prochat-free-star${filled ? " prochat-free-star--filled" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        d="M12 2.5l2.9 6.1 6.8.6-5.1 4.5 1.5 6.6L12 17.8 5.9 20.3l1.5-6.6-5.1-4.5 6.8-.6L12 2.5z"
      />
    </svg>
  );
}

export function FreeTierStars({ state }: Props) {
  const filled = filledStarCount(state);
  const remaining = freeUsesLeft(state);
  const showWarning = isFreeTierWarning(state);

  return (
    <span
      className={`prochat-free-stars${showWarning ? " prochat-free-stars--warning" : ""}`}
      aria-label={`${remaining} free day${remaining === 1 ? "" : "s"} left`}
    >
      {Array.from({ length: FREE_TIER_STAR_COUNT }, (_, i) => (
        <StarIcon key={i} filled={i < filled} />
      ))}
      <span className="prochat-free-stars-tooltip" role="tooltip">
        {showWarning ? (
          <>
            <strong>{remaining} free day{remaining === 1 ? "" : "s"} left.</strong> You&apos;ve been
            using OMnichat a lot — after this, <strong>X and Rumble chat</strong> require OM+ (
            $4.99/mo).
          </>
        ) : (
          <>
            <strong>{remaining} free day{remaining === 1 ? "" : "s"} left</strong> ({filled} of{" "}
            {FREE_TIER_STAR_COUNT} used). Each day you return uses one star.
          </>
        )}
      </span>
    </span>
  );
}
