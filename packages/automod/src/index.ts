export type WalletKind = "evm" | "bitcoin" | "solana" | "payment_uri";

export type WalletMatch = {
  kind: WalletKind;
  match: string;
  index: number;
};

const RULES: { kind: WalletKind; re: RegExp }[] = [
  { kind: "payment_uri", re: /(?:ethereum|bitcoin|solana):[^\s]+/gi },
  { kind: "evm", re: /\b0x[a-fA-F0-9]{40}\b/g },
  { kind: "bitcoin", re: /\bbc1[ac-hj-np-z02-9]{11,71}\b/gi },
  { kind: "bitcoin", re: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g },
  { kind: "solana", re: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g },
];

function overlaps(index: number, len: number, used: { start: number; end: number }[]): boolean {
  const end = index + len;
  return used.some((u) => index < u.end && end > u.start);
}

function looksLikeSolanaAddress(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  if (/^(.)\1+$/.test(s)) return false;
  return true;
}

/** Detect ETH, BTC, and Solana wallet-like strings in chat text. */
export function scanWalletAddresses(text: string): WalletMatch[] {
  const hits: WalletMatch[] = [];
  const used: { start: number; end: number }[] = [];

  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const match = m[0];
      const index = m.index;
      if (kind === "solana" && !looksLikeSolanaAddress(match)) continue;
      if (overlaps(index, match.length, used)) continue;
      used.push({ start: index, end: index + match.length });
      hits.push({ kind, match, index });
    }
  }

  return hits;
}

export function hasWalletAddress(text: string): boolean {
  return scanWalletAddresses(text).length > 0;
}
