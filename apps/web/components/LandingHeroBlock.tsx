"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-hero-backing";
const LEGACY_NAV_STORAGE_KEY = "omnichat-landing-nav-links";
const BLEED = 80;

export const LANDING_HERO_BACKING_DEFAULTS = {
  x: "120",
  y: "220",
  width: "576",
  locked: false,
  color: "#ffffff",
  opacity: "35",
  radius: "16",
  sevenTvHue: "0",
  sevenTvSize: "28",
  loginColor: "#0000ff",
  loginOpacity: "100",
  loginTextColor: "#ffffff",
} as const;

export type LandingHeroBackingSettings = {
  x: string;
  y: string;
  width: string;
  locked: boolean;
  color: string;
  opacity: string;
  radius: string;
  sevenTvHue: string;
  sevenTvSize: string;
  loginColor: string;
  loginOpacity: string;
  loginTextColor: string;
};

function getLandingScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--landing-scale"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

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

function loginBackground(settings: Pick<LandingHeroBackingSettings, "loginColor" | "loginOpacity">): string {
  const rgb = hexToRgb(settings.loginColor);
  const alpha = Math.min(100, Math.max(0, Number(settings.loginOpacity) || 0)) / 100;
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(0, 0, 255, ${alpha})`;
}

export function applyLandingHeroBacking(settings: LandingHeroBackingSettings) {
  const root = document.documentElement;
  const rgb = hexToRgb(settings.color);
  const alpha = Math.min(100, Math.max(0, Number(settings.opacity) || 0)) / 100;
  const bg = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
    : `rgba(255, 255, 255, ${alpha})`;
  root.style.setProperty("--landing-hero-backing-x", `${settings.x}px`);
  root.style.setProperty("--landing-hero-backing-y", `${settings.y}px`);
  root.style.setProperty("--landing-hero-backing-width", `${settings.width}px`);
  root.style.setProperty("--landing-hero-backing-bg", bg);
  root.style.setProperty("--landing-hero-backing-radius", `${settings.radius}px`);
  root.style.setProperty("--landing-7tv-logo-hue", `${settings.sevenTvHue}deg`);
  root.style.setProperty("--landing-7tv-logo-size", `${settings.sevenTvSize}px`);
  root.style.setProperty("--landing-login-bg", loginBackground(settings));
  root.style.setProperty("--landing-login-text", settings.loginTextColor);
}

function loadLegacyNavLogin(): Partial<Pick<LandingHeroBackingSettings, "loginColor" | "loginOpacity" | "loginTextColor">> {
  try {
    const raw = localStorage.getItem(LEGACY_NAV_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<LandingHeroBackingSettings>;
    return {
      loginColor: parsed.loginColor ? normalizeHex(parsed.loginColor) : undefined,
      loginOpacity: parsed.loginOpacity,
      loginTextColor: parsed.loginTextColor ? normalizeHex(parsed.loginTextColor) : undefined,
    };
  } catch {
    return {};
  }
}

function loadStored(): LandingHeroBackingSettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    const legacy = loadLegacyNavLogin();
    if (!raw) {
      return {
        ...LANDING_HERO_BACKING_DEFAULTS,
        loginColor: legacy.loginColor ?? LANDING_HERO_BACKING_DEFAULTS.loginColor,
        loginOpacity: legacy.loginOpacity ?? LANDING_HERO_BACKING_DEFAULTS.loginOpacity,
        loginTextColor: legacy.loginTextColor ?? LANDING_HERO_BACKING_DEFAULTS.loginTextColor,
      };
    }
    const parsed = JSON.parse(raw) as Partial<LandingHeroBackingSettings>;
    return {
      x: parsed.x ?? LANDING_HERO_BACKING_DEFAULTS.x,
      y: parsed.y ?? LANDING_HERO_BACKING_DEFAULTS.y,
      width: parsed.width ?? LANDING_HERO_BACKING_DEFAULTS.width,
      locked: parsed.locked ?? LANDING_HERO_BACKING_DEFAULTS.locked,
      color: normalizeHex(parsed.color ?? LANDING_HERO_BACKING_DEFAULTS.color),
      opacity: parsed.opacity ?? LANDING_HERO_BACKING_DEFAULTS.opacity,
      radius: parsed.radius ?? LANDING_HERO_BACKING_DEFAULTS.radius,
      sevenTvHue: parsed.sevenTvHue ?? LANDING_HERO_BACKING_DEFAULTS.sevenTvHue,
      sevenTvSize: parsed.sevenTvSize ?? LANDING_HERO_BACKING_DEFAULTS.sevenTvSize,
      loginColor: normalizeHex(parsed.loginColor ?? legacy.loginColor ?? LANDING_HERO_BACKING_DEFAULTS.loginColor),
      loginOpacity: parsed.loginOpacity ?? legacy.loginOpacity ?? LANDING_HERO_BACKING_DEFAULTS.loginOpacity,
      loginTextColor: normalizeHex(
        parsed.loginTextColor ?? legacy.loginTextColor ?? LANDING_HERO_BACKING_DEFAULTS.loginTextColor,
      ),
    };
  } catch {
    return { ...LANDING_HERO_BACKING_DEFAULTS };
  }
}

function save(settings: LandingHeroBackingSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyLandingHeroBacking(settings);
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
    unit === "px" ? `${value}px` : unit === "%" ? `${value}%` : unit === "°" ? `${value}°` : `${value}${unit}`;
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

type ColorFieldProps = {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
};

function ColorField({ label, value, disabled, onChange }: ColorFieldProps) {
  return (
    <div className="landing-color-field">
      <div className="landing-color-field-head">
        <span className="landing-color-field-label">{label}</span>
      </div>
      <div className="landing-color-field-row">
        <input
          type="color"
          className="landing-color-picker"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          aria-label={label}
        />
        <input
          type="text"
          className="landing-color-hex"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          spellCheck={false}
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

type Props = {
  pageRef: RefObject<HTMLElement | null>;
};

export function LandingHeroBlock({ pageRef }: Props) {
  const embedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingHeroBackingSettings>(() => ({
    ...LANDING_HERO_BACKING_DEFAULTS,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setSettings(stored);
    applyLandingHeroBacking(stored);
    setHydrated(true);
  }, []);

  const patch = useCallback((partial: Partial<LandingHeroBackingSettings>) => {
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
      if ((e.target as HTMLElement).closest("a")) return;
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
      const scale = getLandingScale();
      const dx = (e.clientX - dragRef.current.startX) / scale;
      const dy = (e.clientY - dragRef.current.startY) / scale;
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

  const previewBg = (() => {
    const rgb = hexToRgb(settings.color);
    const alpha = Number(settings.opacity) / 100;
    return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(255,255,255,${alpha})`;
  })();

  if (!hydrated) return null;

  const editable = LANDING_LAYOUT_EDITORS_ENABLED && !settings.locked;

  return (
    <>
      <div
        ref={embedRef}
        className={`landing-hero-embed${
          !editable ? " landing-hero-embed--locked" : ""
        }${dragging ? " landing-hero-embed--dragging" : ""}`}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? onPointerUp : undefined}
        onPointerCancel={editable ? onPointerUp : undefined}
        aria-hidden={!editable}
      >
        <div className="landing-hero-backing">
          <h1 className="landing-hero-title text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight mb-4">
            The Ultimate Chat
            <span className="landing-hero-accent landing-hero-title-accent">FUN-NLE</span>
          </h1>
          <p className="landing-hero-body mb-8 leading-relaxed font-medium">
            Powerful multi-chat for streamers and creators. Twitch, Kick, and X in one timeline — OBS overlay, mod
            tools, and viewer collective built in.
          </p>
          <ul className="landing-hero-features">
            <li>Twitch, Kick &amp; X in one unified chat feed</li>
            <li className="landing-hero-feature-7tv">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing-7tv-logo.png" alt="" className="landing-hero-7tv-logo" draggable={false} />
              <span>7TV emotes — channel and global, right in chat</span>
            </li>
            <li>Omnibunny — auto-timeouts anyone who posts crypto wallets</li>
            <li>OBS overlay, mod tools &amp; community viewer panel</li>
          </ul>

          <div className="landing-hero-backing-actions">
            <Link href="/login" className="landing-nav-link-embed-anchor landing-nav-link-embed-anchor--login px-5 py-2.5 text-sm">
              Login
            </Link>
            <Link href="/signup" className="landing-nav-link-embed-anchor btn-primary px-5 py-2.5 text-sm">
              Sign Up
            </Link>
            <a
              href="https://github.com/dogogdfive/Om-nichat-public/releases"
              className="landing-nav-link-embed-anchor px-5 py-2.5 text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download app
            </a>
          </div>
        </div>
        {editable ? <span className="landing-hero-embed-badge">Drag hero box</span> : null}
      </div>

      {LANDING_LAYOUT_EDITORS_ENABLED ? (
      <div className={`landing-hero-backing-editor${open ? " landing-hero-backing-editor--open" : ""}`}>
        <button
          type="button"
          className="landing-hero-backing-editor-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide hero box tools" : "Edit hero box"}
        </button>

        {open ? (
          <div className="landing-hero-backing-editor-panel" role="dialog" aria-label="Hero backing">
            <div className="landing-color-editor-head">
              <h2 className="landing-color-editor-title">Hero box</h2>
              <p className="landing-color-editor-sub">
                {settings.locked
                  ? "Unlock to drag the whole box on the canvas"
                  : "Drag to move · title, features & Login / Sign Up move together"}
              </p>
            </div>


            <SliderField
              label="X position"
              value={settings.x}
              min={-BLEED}
              max={1920}
              disabled={settings.locked}
              onChange={(v) => patch({ x: v })}
            />
            <SliderField
              label="Y position"
              value={settings.y}
              min={-BLEED}
              max={1080}
              disabled={settings.locked}
              onChange={(v) => patch({ y: v })}
            />
            <SliderField
              label="Width"
              value={settings.width}
              min={280}
              max={720}
              disabled={settings.locked}
              onChange={(v) => patch({ width: v })}
            />

            <div className="landing-color-preview" style={{ background: previewBg }} aria-hidden />

            <ColorField
              label="Background color"
              value={settings.color}
              onChange={(v) => patch({ color: v })}
            />
            <SliderField
              label="Opacity"
              value={settings.opacity}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => patch({ opacity: v })}
            />
            <SliderField
              label="Corner radius"
              value={settings.radius}
              min={0}
              max={48}
              onChange={(v) => patch({ radius: v })}
            />

            <p className="landing-logo-mode-hint">Login button</p>
            <div
              className="landing-color-preview landing-login-color-preview"
              style={{ background: loginBackground(settings), color: settings.loginTextColor }}
              aria-hidden
            >
              Login
            </div>
            <ColorField label="Login background" value={settings.loginColor} onChange={(v) => patch({ loginColor: v })} />
            <SliderField
              label="Login opacity"
              value={settings.loginOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => patch({ loginOpacity: v })}
            />
            <ColorField label="Login text" value={settings.loginTextColor} onChange={(v) => patch({ loginTextColor: v })} />

            <p className="landing-logo-mode-hint">7TV logo</p>
            <SliderField
              label="Logo hue"
              value={settings.sevenTvHue}
              min={-180}
              max={180}
              unit="°"
              onChange={(v) => patch({ sevenTvHue: v })}
            />
            <SliderField
              label="Logo size"
              value={settings.sevenTvSize}
              min={18}
              max={48}
              onChange={(v) => patch({ sevenTvSize: v })}
            />

            <div className="landing-color-editor-actions landing-logo-editor-actions">
              {settings.locked ? (
                <button type="button" className="landing-color-btn landing-color-btn--ghost" onClick={() => patch({ locked: false })}>
                  Unlock to drag
                </button>
              ) : (
                <button type="button" className="landing-color-btn landing-color-btn--lock" onClick={() => patch({ locked: true })}>
                  Lock position
                </button>
              )}
              <button
                type="button"
                className="landing-color-btn landing-color-btn--ghost"
                disabled={settings.locked}
                onClick={() => {
                  const defaults = { ...LANDING_HERO_BACKING_DEFAULTS };
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
