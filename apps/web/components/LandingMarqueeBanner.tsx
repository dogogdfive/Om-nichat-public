"use client";

const PHRASE = "one chat box to rule them all";
const CHUNK = `${PHRASE} • `;

export function LandingMarqueeBanner() {
  const line = CHUNK.repeat(10);

  return (
    <footer className="landing-bottom-banner" aria-label={PHRASE}>
      <div className="landing-bottom-banner-viewport">
        <div className="landing-bottom-banner-track">
          <span className="landing-bottom-banner-copy">{line}</span>
          <span className="landing-bottom-banner-copy" aria-hidden="true">
            {line}
          </span>
        </div>
      </div>
    </footer>
  );
}
