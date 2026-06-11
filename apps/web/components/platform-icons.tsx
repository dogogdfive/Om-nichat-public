import Image from "next/image";

export type PlatformId = "twitch" | "kick" | "x" | "youtube" | "tiktok" | "rumble";

const LABELS: Record<PlatformId, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  rumble: "Rumble",
};

const WORKS_WITH: PlatformId[] = ["youtube", "twitch", "kick", "tiktok", "rumble", "x"];

/** ProChat-style paths: /platform-images/{id}/{id}-horizontal.png */
export function platformHorizontalSrc(id: PlatformId): string {
  return `/platform-images/${id}/${id}-horizontal.png`;
}

/** Square chat emblem when available, else horizontal scaled down */
export function platformIconSrc(id: PlatformId): string {
  if (
    id === "twitch" ||
    id === "youtube" ||
    id === "kick" ||
    id === "rumble" ||
    id === "x"
  ) {
    return `/platform-images/${id}/${id}-icon.png`;
  }
  return platformHorizontalSrc(id);
}

export function PlatformLogoHorizontal({
  id,
  height = 28,
  className = "",
}: {
  id: PlatformId;
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src={platformHorizontalSrc(id)}
      alt={LABELS[id]}
      title={LABELS[id]}
      width={500}
      height={250}
      className={`w-auto object-contain ${className}`}
      style={{ height }}
    />
  );
}

/** Chat-row platform emblem (real brand icon) */
export function PlatformEmblem({
  platform,
  size = 18,
}: {
  platform: "twitch" | "kick" | "x" | "youtube" | "tiktok" | "rumble";
  size?: number;
}) {
  const wide = platform === "tiktok";
  const slotSize = size;

  return (
    <span
      className="platform-emblem-slot"
      style={{ width: slotSize, height: slotSize }}
      title={LABELS[platform]}
    >
      <Image
        src={platformIconSrc(platform)}
        alt={LABELS[platform]}
        width={wide ? 80 : 32}
        height={wide ? 40 : 32}
        className="platform-emblem-img"
        style={{
          height: slotSize,
          width: wide ? "auto" : slotSize,
          maxWidth: slotSize,
        }}
      />
    </span>
  );
}

/** @deprecated use PlatformEmblem */
export function PlatformBadge({
  platform,
}: {
  platform: "twitch" | "kick" | "x" | "youtube" | "tiktok" | "rumble";
}) {
  return <PlatformEmblem platform={platform} />;
}

export function PlatformLogos({ compact = false }: { compact?: boolean }) {
  const h = compact ? 22 : 28;
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-6 gap-x-6 gap-y-5 items-center justify-items-center ${compact ? "gap-4" : ""}`}
    >
      {WORKS_WITH.map((id) => (
        <PlatformLogoHorizontal key={id} id={id} height={h} />
      ))}
    </div>
  );
}

/** Small icon for OAuth / auth buttons (~20px, ProChat-style) */
export function PlatformAuthIcon({
  id,
  size = 20,
  className = "",
}: {
  id: PlatformId;
  size?: number;
  className?: string;
}) {
  const wide = id === "x" || id === "tiktok";
  const height = size;
  const width = wide ? Math.round(size * 2.5) : size;
  return (
    <Image
      src={platformIconSrc(id)}
      alt=""
      aria-hidden
      width={wide ? 80 : 32}
      height={wide ? 32 : 32}
      className={`shrink-0 object-contain ${className}`}
      style={{ height, width }}
    />
  );
}

/** Legacy square SVG icon — prefer PlatformEmblem / PlatformLogoHorizontal */
export function PlatformIcon({
  id,
  size = 32,
  className = "",
}: {
  id: PlatformId;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={platformIconSrc(id)}
      alt={LABELS[id]}
      width={32}
      height={32}
      className={`object-contain ${className}`}
      style={{ height: size, width: size }}
    />
  );
}
