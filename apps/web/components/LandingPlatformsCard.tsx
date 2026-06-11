"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "omnichat-landing-platforms-card";

export const LANDING_PLATFORMS_CARD_DEFAULTS = {
  color: "#ffffff",
  opacity: "35",
  borderColor: "#1a1a1a",
  borderOpacity: "100",
  squiggle: "5",
  waves: "7",
  borderWidth: "2",
} as const;

export type LandingPlatformsCardSettings = {
  color: string;
  opacity: string;
  borderColor: string;
  borderOpacity: string;
  squiggle: string;
  waves: string;
  borderWidth: string;
};

function normalizeHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  return v;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const v = normalizeHex(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/.test(v)) return null;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgba(hex: string, opacityPct: string, fallback = "255, 255, 255"): string {
  const rgb = hexToRgb(hex);
  const alpha = Math.min(100, Math.max(0, Number(opacityPct) || 0)) / 100;
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(${fallback}, ${alpha})`;
}

function wavyEdge(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude: number,
  waves: number,
  steps: number,
  move: boolean,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = amplitude * Math.sin(t * Math.PI * 2 * waves);
    const px = x1 + dx * t + nx * wave;
    const py = y1 + dy * t + ny * wave;
    if (i === 0 && move) d += `M ${px.toFixed(1)},${py.toFixed(1)}`;
    else d += ` L ${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return d;
}

export function buildSquiggleRectPath(
  width: number,
  height: number,
  inset: number,
  amplitude: number,
  waves: number,
): string {
  if (width <= 0 || height <= 0) return "";
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const steps = Math.max(16, Math.round(waves * 6));

  const edges: [number, number, number, number][] = [
    [left, top, right, top],
    [right, top, right, bottom],
    [right, bottom, left, bottom],
    [left, bottom, left, top],
  ];

  let d = "";
  for (let i = 0; i < edges.length; i++) {
    const [x1, y1, x2, y2] = edges[i]!;
    d += wavyEdge(x1, y1, x2, y2, amplitude, waves, steps, i === 0);
  }
  return `${d} Z`;
}

function loadStored(): LandingPlatformsCardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...LANDING_PLATFORMS_CARD_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingPlatformsCardSettings>;
    return {
      color: normalizeHex(parsed.color ?? LANDING_PLATFORMS_CARD_DEFAULTS.color),
      opacity: parsed.opacity ?? LANDING_PLATFORMS_CARD_DEFAULTS.opacity,
      borderColor: normalizeHex(parsed.borderColor ?? LANDING_PLATFORMS_CARD_DEFAULTS.borderColor),
      borderOpacity: parsed.borderOpacity ?? LANDING_PLATFORMS_CARD_DEFAULTS.borderOpacity,
      squiggle: parsed.squiggle ?? LANDING_PLATFORMS_CARD_DEFAULTS.squiggle,
      waves: parsed.waves ?? LANDING_PLATFORMS_CARD_DEFAULTS.waves,
      borderWidth: parsed.borderWidth ?? LANDING_PLATFORMS_CARD_DEFAULTS.borderWidth,
    };
  } catch {
    return { ...LANDING_PLATFORMS_CARD_DEFAULTS };
  }
}

export function LandingPlatformsCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<LandingPlatformsCardSettings>(() => ({
    ...LANDING_PLATFORMS_CARD_DEFAULTS,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setSettings(loadStored());
    setHydrated(true);
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hydrated]);

  const inset = Math.max(4, Number(settings.borderWidth) + 2);
  const pathD = buildSquiggleRectPath(
    size.width,
    size.height,
    inset,
    Number(settings.squiggle),
    Number(settings.waves),
  );
  const fill = rgba(settings.color, settings.opacity);
  const stroke = rgba(settings.borderColor, settings.borderOpacity, "26, 26, 26");

  if (!hydrated) return null;

  return (
    <div ref={cardRef} id="platforms" className="landing-platforms-card mt-8">
        <svg
          className="landing-platforms-card-frame"
          viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {pathD ? (
            <path
              d={pathD}
              fill={fill}
              stroke={stroke}
              strokeWidth={Number(settings.borderWidth)}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <div className="landing-platforms-card-content">
          <p className="landing-card-label">Works with all your platforms</p>
        </div>
      </div>
  );
}
