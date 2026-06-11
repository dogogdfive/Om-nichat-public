"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-brand-text";
const BLEED = 120;

export const BRAND_TEXT_LABEL = "-Nichat";

export const LANDING_BRAND_TEXT_DEFAULTS = {
  size: "36",
  x: "100",
  y: "18",
  rotate: "0",
  curve: "0",
  wave: "0",
  color: "#e91916",
  shadow: "28",
  locked: false,
} as const;

export type LandingBrandTextSettings = {
  size: string;
  x: string;
  y: string;
  rotate: string;
  curve: string;
  wave: string;
  color: string;
  shadow: string;
  locked: boolean;
};

function normalizeHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  return v;
}

function shadowFilter(intensity: number): string {
  if (intensity <= 0) return "none";
  const t = intensity / 100;
  const y = 1 + t * 10;
  const blur = 2 + t * 18;
  const alpha = 0.15 + t * 0.7;
  return `drop-shadow(0px ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${alpha.toFixed(2)}))`;
}

export function applyLandingBrandText(settings: LandingBrandTextSettings) {
  const root = document.documentElement;
  root.style.setProperty("--landing-brand-text-size", `${settings.size}px`);
  root.style.setProperty("--landing-brand-text-x", `${settings.x}px`);
  root.style.setProperty("--landing-brand-text-y", `${settings.y}px`);
  root.style.setProperty("--landing-brand-text-rotate", `${settings.rotate}deg`);
  root.style.setProperty("--landing-brand-text-color", settings.color);
  root.style.setProperty("--landing-brand-text-shadow-filter", shadowFilter(Number(settings.shadow)));
}

function loadStored(): LandingBrandTextSettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_BRAND_TEXT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingBrandTextSettings>;
    return {
      size: parsed.size ?? LANDING_BRAND_TEXT_DEFAULTS.size,
      x: parsed.x ?? LANDING_BRAND_TEXT_DEFAULTS.x,
      y: parsed.y ?? LANDING_BRAND_TEXT_DEFAULTS.y,
      rotate: parsed.rotate ?? LANDING_BRAND_TEXT_DEFAULTS.rotate,
      curve: parsed.curve ?? LANDING_BRAND_TEXT_DEFAULTS.curve,
      wave: parsed.wave ?? LANDING_BRAND_TEXT_DEFAULTS.wave,
      color: normalizeHex(parsed.color ?? LANDING_BRAND_TEXT_DEFAULTS.color),
      shadow: parsed.shadow ?? LANDING_BRAND_TEXT_DEFAULTS.shadow,
      locked: parsed.locked ?? LANDING_BRAND_TEXT_DEFAULTS.locked,
    };
  } catch {
    return { ...LANDING_BRAND_TEXT_DEFAULTS };
  }
}

function save(settings: LandingBrandTextSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyLandingBrandText(settings);
}

export function buildBrandTextPath(fontSize: number, curve: number, wave: number): string {
  const w = Math.round(fontSize * BRAND_TEXT_LABEL.length * 0.62);
  const h = Math.round(fontSize * 2.8);
  const mid = h / 2;
  const steps = 28;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * w;
    const arc = mid - curve * 4 * t * (1 - t);
    const squiggle = wave * Math.sin(t * Math.PI * 2);
    const y = arc + squiggle;
    d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
  }
  return d;
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

export function LandingBrandTextOverlay({ pageRef }: Props) {
  const pathId = useId().replace(/:/g, "");
  const embedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingBrandTextSettings>(() => ({ ...LANDING_BRAND_TEXT_DEFAULTS }));
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setSettings(stored);
    applyLandingBrandText(stored);
    setReady(true);
  }, []);

  const patch = useCallback((partial: Partial<LandingBrandTextSettings>) => {
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
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      return {
        x: Math.min(Math.max(-BLEED, x), page.clientWidth - w + BLEED),
        y: Math.min(Math.max(-BLEED, y), page.clientHeight - h + BLEED),
      };
    },
    [pageRef],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (settings.locked) return;
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
      if (!dragRef.current || settings.locked) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const next = clampPosition(dragRef.current.originX + dx, dragRef.current.originY + dy);
      patch({ x: String(Math.round(next.x)), y: String(Math.round(next.y)) });
    },
    [clampPosition, patch, settings.locked],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  if (!ready) return null;

  const fontSize = Number(settings.size);
  const w = Math.round(fontSize * BRAND_TEXT_LABEL.length * 0.62);
  const h = Math.round(fontSize * 2.8);
  const pathD = buildBrandTextPath(fontSize, Number(settings.curve), Number(settings.wave));
  const editable = LANDING_LAYOUT_EDITORS_ENABLED && !settings.locked;

  return (
    <>
      <div
        ref={embedRef}
        className={`landing-brand-text-embed${
          !editable ? " landing-brand-text-embed--locked" : ""
        }${dragging ? " landing-brand-text-embed--dragging" : ""}`}
        style={{ width: w, height: h }}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? onPointerUp : undefined}
        onPointerCancel={editable ? onPointerUp : undefined}
        aria-hidden={!editable}
      >
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
          <path id={pathId} d={pathD} fill="none" />
          <text className="landing-brand-text-svg" fontSize={fontSize} fontWeight={800} dominantBaseline="middle">
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {BRAND_TEXT_LABEL}
            </textPath>
          </text>
        </svg>
        {editable ? <span className="landing-brand-text-badge">Drag -Nichat</span> : null}
      </div>

      {LANDING_LAYOUT_EDITORS_ENABLED ? (
      <div className={`landing-brand-text-editor${open ? " landing-brand-text-editor--open" : ""}`}>
        <button type="button" className="landing-brand-text-editor-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide -Nichat tools" : "Edit -Nichat"}
        </button>

        {open ? (
          <div className="landing-brand-text-editor-panel" role="dialog" aria-label="-Nichat text style">
            <div className="landing-color-editor-head">
              <h2 className="landing-color-editor-title">-Nichat</h2>
              <p className="landing-color-editor-sub">
                {settings.locked ? "Unlock to drag · curve & squiggle the text path" : "Drag to move · tweak curve & color"}
              </p>
            </div>

            <div className="landing-color-field">
              <div className="landing-color-field-head">
                <span className="landing-color-field-label">Text color</span>
              </div>
              <div className="landing-color-field-row">
                <input
                  type="color"
                  className="landing-color-picker"
                  value={settings.color}
                  disabled={settings.locked}
                  onChange={(e) => patch({ color: normalizeHex(e.target.value) })}
                  aria-label="Text color"
                />
                <input
                  type="text"
                  className="landing-color-hex"
                  value={settings.color}
                  disabled={settings.locked}
                  onChange={(e) => patch({ color: normalizeHex(e.target.value) })}
                  spellCheck={false}
                  aria-label="Text color hex"
                />
              </div>
            </div>

            <SliderField
              label="Size"
              value={settings.size}
              min={18}
              max={96}
              disabled={settings.locked}
              onChange={(v) => patch({ size: v })}
            />
            <SliderField
              label="Curve"
              value={settings.curve}
              min={-12}
              max={12}
              unit=""
              disabled={settings.locked}
              onChange={(v) => patch({ curve: v })}
            />
            <SliderField
              label="Squiggle"
              value={settings.wave}
              min={0}
              max={24}
              unit=""
              disabled={settings.locked}
              onChange={(v) => patch({ wave: v })}
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
              label="Shadow"
              value={settings.shadow}
              min={0}
              max={100}
              unit="%"
              disabled={settings.locked}
              onChange={(v) => patch({ shadow: v })}
            />
            <SliderField
              label="Horizontal"
              value={settings.x}
              min={-BLEED}
              max={1200}
              disabled={settings.locked}
              onChange={(v) => patch({ x: v })}
            />
            <SliderField
              label="Vertical"
              value={settings.y}
              min={-BLEED}
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
                <button type="button" className="landing-color-btn landing-color-btn--lock" onClick={() => patch({ locked: true })}>
                  Lock in place
                </button>
              )}
              <button
                type="button"
                className="landing-color-btn landing-color-btn--ghost"
                disabled={settings.locked}
                onClick={() => {
                  const defaults = { ...LANDING_BRAND_TEXT_DEFAULTS };
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
