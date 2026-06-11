"use client";

import Image from "next/image";

const SCAM_LINES = [
  { text: "plz give me crypto 🙏", user: "wallet_warrior99" },
  { text: "send eth to 0x… pls sir", user: "not_a_scammer_fr" },
  { text: "double your btc dm me!!", user: "trust_me_bro" },
  { text: "seed phrase help needed!!!", user: "totally_legit_guy" },
];

export function OmnibunnyBonkScene() {
  return (
    <div className="ob-bonk-scene" aria-hidden>
      {SCAM_LINES.map((line, i) => (
        <div
          key={line.user}
          className="ob-scam-bubble"
          style={{ animationDelay: `${i * 2.4}s` }}
        >
          <span className="ob-scam-user">{line.user}</span>
          <span className="ob-scam-text">{line.text}</span>
          <span className="ob-scam-verdict">TIMED OUT</span>
        </div>
      ))}

      <div className="ob-bonk-impact">BONK!</div>

      <div className="ob-bunny-wrap">
        <div className="ob-mallet" aria-hidden>
          <svg viewBox="0 0 64 64" className="ob-mallet-svg">
            <rect x="8" y="36" width="10" height="28" rx="3" fill="#8B4513" />
            <rect x="0" y="8" width="26" height="32" rx="6" fill="#6B7280" />
            <rect x="2" y="10" width="22" height="8" rx="4" fill="#9CA3AF" />
          </svg>
        </div>
        <Image
          src="/landing-omnibunny.png"
          alt=""
          width={200}
          height={200}
          className="ob-bunny-img"
          priority
        />
      </div>

      <div className="ob-bonk-floor" />
    </div>
  );
}
