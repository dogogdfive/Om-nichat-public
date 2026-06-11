"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-logo";
/** Design-canvas range — logo can sit fully off the 1920×1080 page. */
const POS_MIN = -2400;
const POS_MAX = 2400;

export const LANDING_LOGO_DEFAULTS = {
  size: "72",
  x: "24",
  y: "12",
  rotate: "0",
  locked: false,
} as const;

export type LandingLogoSettings = {
  size: string;
  x: string;
  y: string;
  rotate: string;
  locked: boolean;
};

function getLandingScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--landing-scale"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function applyLandingLogo(settings: LandingLogoSettings) {
  const root = document.documentElement;
  root.style.setProperty("--landing-logo-size", `${settings.size}px`);
  root.style.setProperty("--landing-logo-x", `${settings.x}px`);
  root.style.setProperty("--landing-logo-y", `${settings.y}px`);
  root.style.setProperty("--landing-logo-rotate", `${settings.rotate}deg`);
}

function loadStored(): LandingLogoSettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_LOGO_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingLogoSettings>;
    return {
      size: parsed.size ?? LANDING_LOGO_DEFAULTS.size,
      x: parsed.x ?? LANDING_LOGO_DEFAULTS.x,
      y: parsed.y ?? LANDING_LOGO_DEFAULTS.y,
      rotate: parsed.rotate ?? LANDING_LOGO_DEFAULTS.rotate,
      locked: parsed.locked ?? LANDING_LOGO_DEFAULTS.locked,
    };
  } catch {
    return { ...LANDING_LOGO_DEFAULTS };
  }
}

function save(settings: LandingLogoSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyLandingLogo(settings);
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
    unit === "px" ? `${value}px` : unit === "°" ? `${value}°` : `${value}${unit}`;
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

type NumberFieldProps = {
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (v: string) => void;
};

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <div className="landing-color-field">
      <div className="landing-color-field-head">
        <span className="landing-color-field-label">{label}</span>
        <span className="landing-color-field-hint">{value}px</span>
      </div>
      <input
        type="number"
        className="landing-color-hex"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.min(max, Math.max(min, Number(e.target.value) || min));
          onChange(String(Math.round(n)));
        }}
        aria-label={label}
      />
    </div>
  );
}

export function LandingLogoEmbed() {
  const embedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { kind: "move"; startX: number; startY: number; originX: number; originY: number }
    | { kind: "scale"; startY: number; originSize: number }
    | null
  >(null);
  const rotateRef = useRef<{ startAngle: number; originRotate: number; cx: number; cy: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingLogoSettings>(() => ({ ...LANDING_LOGO_DEFAULTS }));
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setSettings(stored);
    applyLandingLogo(stored);
    setHydrated(true);
  }, []);

  const patch = useCallback((partial: Partial<LandingLogoSettings>) => {
    setSettings((prev) => {
      const sizeOnly = "size" in partial && Object.keys(partial).length === 1;
      if (prev.locked && !("locked" in partial) && !sizeOnly) return prev;
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, []);

  const clampPosition = useCallback((x: number, y: number) => ({ x, y }), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (settings.locked) return;
      if ((e.target as HTMLElement).closest(".landing-logo-rotate-handle, .landing-logo-scale-handle")) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "move",
        startX: e.clientX,
        startY: e.clientY,
        originX: Number(settings.x),
        originY: Number(settings.y),
      };
      setDragging(true);
    },
    [settings.locked, settings.x, settings.y],
  );

  const onScaleHandleDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "scale",
        startY: e.clientY,
        originSize: Number(settings.size),
      };
      setDragging(true);
    },
    [settings.size],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const scale = getLandingScale();
      if (dragRef.current?.kind === "move" && !settings.locked) {
        const dx = (e.clientX - dragRef.current.startX) / scale;
        const dy = (e.clientY - dragRef.current.startY) / scale;
        const next = clampPosition(dragRef.current.originX + dx, dragRef.current.originY + dy);
        patch({ x: String(Math.round(next.x)), y: String(Math.round(next.y)) });
        return;
      }
      if (dragRef.current?.kind === "scale") {
        const dy = (e.clientY - dragRef.current.startY) / scale;
        const next = Math.min(320, Math.max(24, Math.round(dragRef.current.originSize + dy * 0.5)));
        patch({ size: String(next) });
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

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
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

  const editable = LANDING_LAYOUT_EDITORS_ENABLED && !settings.locked;

  return (
    <>
      <div
        ref={embedRef}
        className={`landing-logo-embed${
          !editable ? " landing-logo-embed--locked" : ""
        }${dragging ? " landing-logo-embed--dragging" : ""}${rotating ? " landing-logo-embed--rotate-mode" : ""}`}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? onPointerUp : undefined}
        onPointerCancel={editable ? onPointerUp : undefined}
        aria-hidden={!editable}
      >
        <Image
          src="/omnichat-brand-logo.png"
          alt=""
          width={512}
          height={512}
          className="landing-logo-embed-img"
          draggable={false}
          priority
        />
        {editable ? (
          <>
            <span className="landing-logo-embed-badge">Drag logo</span>
            <button
              type="button"
              className="landing-logo-rotate-handle"
              aria-label="Rotate logo"
              onPointerDown={onRotateHandleDown}
            />
          </>
        ) : null}
        {LANDING_LAYOUT_EDITORS_ENABLED ? (
        <button
          type="button"
          className="landing-logo-scale-handle"
          aria-label="Resize logo"
          onPointerDown={onScaleHandleDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        ) : null}
      </div>

      {LANDING_LAYOUT_EDITORS_ENABLED ? (
      <div className={`landing-logo-editor${open ? " landing-logo-editor--open" : ""}`}>
        <button type="button" className="landing-logo-editor-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide logo tools" : "Edit logo"}
        </button>

        {open ? (
          <div className="landing-logo-editor-panel" role="dialog" aria-label="Brand logo placement">
            <div className="landing-color-editor-head">
              <h2 className="landing-color-editor-title">Brand logo</h2>
              <p className="landing-color-editor-sub">
                {settings.locked
                  ? "Position locked · size slider & corner handle still work"
                  : "Drag anywhere — even off the page · size via slider or corner handle"}
              </p>
            </div>

            <SliderField
              label="Size"
              value={settings.size}
              min={24}
              max={320}
              onChange={(v) => patch({ size: v })}
            />
            <NumberField label="Size (px)" value={settings.size} min={24} max={320} onChange={(v) => patch({ size: v })} />
            <SliderField
              label="X position"
              value={settings.x}
              min={POS_MIN}
              max={POS_MAX}
              disabled={settings.locked}
              onChange={(v) => patch({ x: v })}
            />
            <SliderField
              label="Y position"
              value={settings.y}
              min={POS_MIN}
              max={POS_MAX}
              disabled={settings.locked}
              onChange={(v) => patch({ y: v })}
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

            <div className="landing-logo-editor-actions">
              {settings.locked ? (
                <button type="button" className="landing-color-btn landing-color-btn--ghost" onClick={() => patch({ locked: false })}>
                  Unlock
                </button>
              ) : (
                <button type="button" className="landing-color-btn landing-color-btn--lock" onClick={() => patch({ locked: true })}>
                  Lock in place
                </button>
              )}
              <button
                type="button"
                className="landing-color-btn landing-color-btn--ghost"
                disabled={settings.locked}
                onClick={() => {
                  const defaults = { ...LANDING_LOGO_DEFAULTS };
                  setSettings(defaults);
                  save(defaults);
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
