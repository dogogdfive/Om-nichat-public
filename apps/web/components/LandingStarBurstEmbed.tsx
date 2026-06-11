"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { LANDING_STAR_VARIANTS, landingStarVariantSrc } from "@/lib/landing-star-variants";
import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-star";

function desktopBleed(sizePx: number) {
  return Math.max(280, Math.round(sizePx * 0.92));
}

const BASE_YELLOW_HUE = 52;

export const LANDING_STAR_DEFAULTS = {
  size: "200",
  x: "52",
  y: "-8",
  rotate: "-6",
  color: "#ffe600",
  layer: "38",
  variant: "0",
  locked: false,
} as const;

export type LandingStarSettings = {
  size: string;
  x: string;
  y: string;
  rotate: string;
  color: string;
  layer: string;
  variant: string;
  locked: boolean;
};

function normalizeHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  return LANDING_STAR_DEFAULTS.color;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  return { h: hue * 360, s: s * 100, l: l * 100 };
}

export function starColorFilter(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  const rotate = Math.round(h - BASE_YELLOW_HUE);
  const saturate = Math.round(Math.max(40, Math.min(320, 80 + s * 2.2)));
  const brightness = Math.round(Math.max(65, Math.min(145, 55 + l * 0.85)));
  return `hue-rotate(${rotate}deg) saturate(${saturate}%) brightness(${brightness}%) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.28))`;
}

export function applyLandingStar(settings: LandingStarSettings) {
  const root = document.documentElement;
  root.style.setProperty("--landing-star-size", `${settings.size}px`);
  root.style.setProperty("--landing-star-x", `${settings.x}px`);
  root.style.setProperty("--landing-star-y", `${settings.y}px`);
  root.style.setProperty("--landing-star-rotate", `${settings.rotate}deg`);
  root.style.setProperty("--landing-star-filter", starColorFilter(settings.color));
  root.style.setProperty("--landing-star-z", settings.layer);
}

function loadStored(): LandingStarSettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_STAR_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingStarSettings>;
    return {
      size: parsed.size ?? LANDING_STAR_DEFAULTS.size,
      x: parsed.x ?? LANDING_STAR_DEFAULTS.x,
      y: parsed.y ?? LANDING_STAR_DEFAULTS.y,
      rotate: parsed.rotate ?? LANDING_STAR_DEFAULTS.rotate,
      color: normalizeHex(parsed.color ?? LANDING_STAR_DEFAULTS.color),
      layer: parsed.layer ?? LANDING_STAR_DEFAULTS.layer,
      variant: parsed.variant ?? LANDING_STAR_DEFAULTS.variant,
      locked: parsed.locked ?? LANDING_STAR_DEFAULTS.locked,
    };
  } catch {
    return { ...LANDING_STAR_DEFAULTS };
  }
}

function save(settings: LandingStarSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyLandingStar(settings);
}

type SliderProps = {
  label: string;
  value: string;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
};

function SliderField({ label, value, min, max, unit = "px", disabled, onChange }: SliderProps) {
  const hint =
    unit === "px" ? `${value}px` : unit === "°" ? `${value}°` : unit === "%" ? `${value}%` : `${value}${unit}`;
  return (
    <div className="landing-color-field">
      <div className="landing-color-field-head">
        <span className="landing-color-field-label">{label}</span>
        <span className="landing-color-field-hint">{hint}</span>
      </div>
      <input
        type="range"
        className="landing-color-slider"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}

type Props = {
  pageRef: RefObject<HTMLElement | null>;
};

export function LandingStarBurstEmbed({ pageRef }: Props) {
  const embedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const rotateRef = useRef<{ startAngle: number; originRotate: number; cx: number; cy: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingStarSettings>(() => ({ ...LANDING_STAR_DEFAULTS }));
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setSettings(stored);
    applyLandingStar(stored);
    setHydrated(true);
  }, []);

  const patch = useCallback((partial: Partial<LandingStarSettings>) => {
    setSettings((prev) => {
      if (prev.locked && !("locked" in partial)) return prev;
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, []);

  const clampPosition = useCallback(
    (x: number, y: number) => {
      const page = pageRef.current;
      const el = embedRef.current;
      if (!page || !el) return { x, y };
      const w = el.offsetWidth || Number(settings.size);
      const h = el.offsetHeight || Number(settings.size);
      const bleed = desktopBleed(w);
      return {
        x: Math.min(Math.max(-bleed, x), page.clientWidth - w + bleed),
        y: Math.min(Math.max(-bleed, y), page.clientHeight - h + bleed),
      };
    },
    [pageRef, settings.size],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (settings.locked) return;
      if ((e.target as HTMLElement).closest(".landing-star-rotate-handle")) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: Number(settings.x),
        originY: Number(settings.y),
      };
      setDragging(true);
    },
    [settings.locked, settings.x, settings.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current && !settings.locked) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const next = clampPosition(dragRef.current.originX + dx, dragRef.current.originY + dy);
        patch({ x: String(Math.round(next.x)), y: String(Math.round(next.y)) });
        return;
      }
      if (rotateRef.current && !settings.locked) {
        const { cx, cy, startAngle, originRotate } = rotateRef.current;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
        const delta = angle - startAngle;
        let next = Math.round(originRotate + delta);
        while (next > 180) next -= 360;
        while (next < -180) next += 360;
        patch({ rotate: String(next) });
      }
    },
    [clampPosition, patch, settings.locked],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current || rotateRef.current) {
      dragRef.current = null;
      rotateRef.current = null;
      setDragging(false);
      setRotating(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const onRotateHandleDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (settings.locked) return;
      e.stopPropagation();
      e.preventDefault();
      const el = embedRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      rotateRef.current = {
        cx,
        cy,
        startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI),
        originRotate: Number(settings.rotate),
      };
      setRotating(true);
      el.setPointerCapture(e.pointerId);
    },
    [settings.locked, settings.rotate],
  );

  if (!hydrated) return null;

  const src = landingStarVariantSrc(settings.variant);
  const editable = LANDING_LAYOUT_EDITORS_ENABLED && !settings.locked;

  return (
    <>
      <div
        ref={embedRef}
        className={`landing-star-embed${
          !editable ? " landing-star-embed--locked" : ""
        }${dragging ? " landing-star-embed--dragging" : ""}${rotating ? " landing-star-embed--rotating" : ""}`}
        style={{ zIndex: Number(settings.layer) }}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? onPointerUp : undefined}
        onPointerCancel={editable ? onPointerUp : undefined}
        aria-hidden={!editable}
      >
        <Image
          src={src}
          alt=""
          width={512}
          height={512}
          className="landing-star-embed-img"
          draggable={false}
          priority
          unoptimized
        />
        {editable ? (
          <>
            <span className="landing-star-embed-badge">Drag star</span>
            <button
              type="button"
              className="landing-star-rotate-handle"
              aria-label="Rotate star"
              onPointerDown={onRotateHandleDown}
            />
          </>
        ) : null}
      </div>

      {LANDING_LAYOUT_EDITORS_ENABLED ? (
      <div className={`landing-star-editor${open ? " landing-star-editor--open" : ""}`}>
        <button type="button" className="landing-star-editor-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide star tools" : "Edit star"}
        </button>

        {open ? (
          <div className="landing-star-editor-panel" role="dialog" aria-label="Star burst style">
            <div className="landing-color-editor-head">
              <h2 className="landing-color-editor-title">Star burst</h2>
              <p className="landing-color-editor-sub">
                {settings.locked ? "Unlock to drag · pick a shape variant" : "Drag to move · color, size & layer"}
              </p>
            </div>

            <div className="landing-color-field">
              <div className="landing-color-field-head">
                <span className="landing-color-field-label">Color</span>
              </div>
              <div className="landing-color-field-row">
                <input
                  type="color"
                  className="landing-color-picker"
                  value={settings.color}
                  disabled={settings.locked}
                  onChange={(e) => patch({ color: normalizeHex(e.target.value) })}
                  aria-label="Star color"
                />
                <input
                  type="text"
                  className="landing-color-hex"
                  value={settings.color}
                  disabled={settings.locked}
                  onChange={(e) => patch({ color: normalizeHex(e.target.value) })}
                  spellCheck={false}
                  aria-label="Star color hex"
                />
              </div>
            </div>

            <div className="landing-color-field">
              <div className="landing-color-field-head">
                <span className="landing-color-field-label">Shape</span>
              </div>
              <div className="landing-star-variant-grid">
                {LANDING_STAR_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`landing-star-variant-btn${settings.variant === v.id ? " landing-star-variant-btn--active" : ""}`}
                    disabled={settings.locked}
                    onClick={() => patch({ variant: v.id })}
                    title={v.label}
                  >
                    <Image src={v.src} alt="" width={48} height={48} unoptimized draggable={false} />
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <SliderField
              label="Size"
              value={settings.size}
              min={80}
              max={480}
              disabled={settings.locked}
              onChange={(v) => patch({ size: v })}
            />
            <SliderField
              label="Layer"
              value={settings.layer}
              min={20}
              max={60}
              unit=""
              disabled={settings.locked}
              onChange={(v) => patch({ layer: v })}
            />
            <SliderField
              label="Rotation"
              value={settings.rotate}
              min={-180}
              max={180}
              unit="°"
              disabled={settings.locked}
              onChange={(v) => patch({ rotate: v })}
            />
            <SliderField
              label="Horizontal"
              value={settings.x}
              min={-280}
              max={1200}
              disabled={settings.locked}
              onChange={(v) => patch({ x: v })}
            />
            <SliderField
              label="Vertical"
              value={settings.y}
              min={-280}
              max={800}
              disabled={settings.locked}
              onChange={(v) => patch({ y: v })}
            />

            <div className="landing-logo-editor-actions">
              {settings.locked ? (
                <button type="button" className="landing-color-btn landing-color-btn--ghost" onClick={() => patch({ locked: false })}>
                  Unlock
                </button>
              ) : (
                <button type="button" className="landing-color-btn landing-color-btn--primary" onClick={() => patch({ locked: true })}>
                  Lock in place
                </button>
              )}
              <button
                type="button"
                className="landing-color-btn landing-color-btn--ghost"
                onClick={() => {
                  const next = { ...LANDING_STAR_DEFAULTS };
                  setSettings(next);
                  save(next);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}
    </>
  );
}
