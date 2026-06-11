"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { LANDING_LAYOUT_EDITORS_ENABLED, LANDING_OMNIBUNNY_EDITOR_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-omnibunny";
const BLEED = 120;

export const LANDING_OMNIBUNNY_DEFAULTS = {
  size: "160",
  x: "320",
  y: "120",
  rotate: "0",
  locked: false,
} as const;

export type LandingOmnibunnySettings = {
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

export function applyLandingOmnibunny(settings: LandingOmnibunnySettings) {
  const root = document.documentElement;
  root.style.setProperty("--landing-omnibunny-size", `${settings.size}px`);
  root.style.setProperty("--landing-omnibunny-x", `${settings.x}px`);
  root.style.setProperty("--landing-omnibunny-y", `${settings.y}px`);
  root.style.setProperty("--landing-omnibunny-rotate", `${settings.rotate}deg`);
}

function loadStored(): LandingOmnibunnySettings {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_OMNIBUNNY_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingOmnibunnySettings>;
    return {
      size: parsed.size ?? LANDING_OMNIBUNNY_DEFAULTS.size,
      x: parsed.x ?? LANDING_OMNIBUNNY_DEFAULTS.x,
      y: parsed.y ?? LANDING_OMNIBUNNY_DEFAULTS.y,
      rotate: parsed.rotate ?? LANDING_OMNIBUNNY_DEFAULTS.rotate,
      locked: parsed.locked ?? LANDING_OMNIBUNNY_DEFAULTS.locked,
    };
  } catch {
    return { ...LANDING_OMNIBUNNY_DEFAULTS };
  }
}

function save(settings: LandingOmnibunnySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyLandingOmnibunny(settings);
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

const OMNIBUNNY_TOOLTIP_TEXT =
  "im bunny bot and i time out the poors who spam there wallets ╰(⸝⸝⸝´꒳`⸝⸝⸝)╯";

function OmnibunnyTypewriterTooltip({ visible }: { visible: boolean }) {
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (!visible) {
      setLength(0);
      return;
    }

    setLength(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setLength(index);
      if (index >= OMNIBUNNY_TOOLTIP_TEXT.length) window.clearInterval(timer);
    }, 32);

    return () => window.clearInterval(timer);
  }, [visible]);

  return (
    <span
      className={`landing-omnibunny-tooltip${visible ? " landing-omnibunny-tooltip--visible" : ""}`}
      role="tooltip"
    >
      <span className="landing-omnibunny-tooltip-text">
        {OMNIBUNNY_TOOLTIP_TEXT.slice(0, length)}
        {visible && length < OMNIBUNNY_TOOLTIP_TEXT.length ? (
          <span className="landing-omnibunny-tooltip-cursor" aria-hidden>
            |
          </span>
        ) : null}
      </span>
    </span>
  );
}

type Props = {
  pageRef: RefObject<HTMLElement | null>;
};

export function LandingOmnibunnyEmbed({ pageRef }: Props) {
  const embedRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const rotateRef = useRef<{ startAngle: number; originRotate: number; cx: number; cy: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingOmnibunnySettings>(() => ({ ...LANDING_OMNIBUNNY_DEFAULTS }));
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setSettings(stored);
    applyLandingOmnibunny(stored);
    setHydrated(true);
  }, []);

  const patch = useCallback((partial: Partial<LandingOmnibunnySettings>) => {
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
      return {
        x: Math.min(Math.max(-BLEED, x), page.clientWidth - w + BLEED),
        y: Math.min(Math.max(-BLEED, y), page.clientHeight - h + BLEED),
      };
    },
    [pageRef, settings.size],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (settings.locked) return;
      if ((e.target as HTMLElement).closest(".landing-omnibunny-rotate-handle")) return;
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
      const scale = getLandingScale();
      if (dragRef.current && !settings.locked) {
        const dx = (e.clientX - dragRef.current.startX) / scale;
        const dy = (e.clientY - dragRef.current.startY) / scale;
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

  const editorEnabled = LANDING_LAYOUT_EDITORS_ENABLED || LANDING_OMNIBUNNY_EDITOR_ENABLED;
  const editable = editorEnabled && !settings.locked;
  const isAlive = settings.locked && !dragging && !rotating;
  const showTooltip = isAlive;

  return (
    <>
      <div
        ref={embedRef}
        className={`landing-omnibunny-embed${
          !editable ? " landing-omnibunny-embed--locked" : ""
        }${isAlive ? " landing-omnibunny-embed--alive" : ""}${dragging ? " landing-omnibunny-embed--dragging" : ""}${rotating ? " landing-omnibunny-embed--rotating" : ""}${
          showTooltip ? " landing-omnibunny-embed--tooltip" : ""
        }${hovered && isAlive ? " landing-omnibunny-embed--hovered" : ""}`}
        onMouseEnter={isAlive ? () => setHovered(true) : undefined}
        onMouseLeave={isAlive ? () => setHovered(false) : undefined}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? onPointerUp : undefined}
        onPointerCancel={editable ? onPointerUp : undefined}
        aria-hidden={!editable}
      >
        {settings.locked ? (
          <Link
            href="/omnibunny"
            className="landing-omnibunny-body landing-omnibunny-body--link"
            aria-label="Meet Omnibunny — wallet bonker mod bot"
            draggable={false}
          >
            <Image
              src="/landing-omnibunny.png"
              alt="Omnibunny mascot"
              width={512}
              height={512}
              className="landing-omnibunny-embed-img"
              draggable={false}
              priority
            />
          </Link>
        ) : (
          <div className="landing-omnibunny-body">
            <Image
              src="/landing-omnibunny.png"
              alt="Omnibunny mascot"
              width={512}
              height={512}
              className="landing-omnibunny-embed-img"
              draggable={false}
              priority
            />
          </div>
        )}
        {showTooltip ? <OmnibunnyTypewriterTooltip visible={hovered} /> : null}
        {editable ? (
          <>
            <span className="landing-omnibunny-embed-badge">Drag Omnibunny</span>
            <button
              type="button"
              className="landing-omnibunny-rotate-handle"
              aria-label="Rotate Omnibunny"
              onPointerDown={onRotateHandleDown}
            />
          </>
        ) : null}
      </div>

      {editorEnabled && typeof document !== "undefined"
        ? createPortal(
            <div className={`landing-omnibunny-editor${open ? " landing-omnibunny-editor--open" : ""}`}>
              <button type="button" className="landing-omnibunny-editor-toggle" onClick={() => setOpen((v) => !v)}>
                {open ? "Hide Omnibunny tools" : "Edit Omnibunny"}
              </button>

              {open ? (
                <div className="landing-omnibunny-editor-panel" role="dialog" aria-label="Omnibunny placement">
                  <div className="landing-color-editor-head">
                    <h2 className="landing-color-editor-title">Omnibunny</h2>
                    <p className="landing-color-editor-sub">
                      {settings.locked
                        ? "Unlock to drag · rotate with the top handle"
                        : "Drag to move · size & rotation sliders"}
                    </p>
                  </div>

                  <SliderField
                    label="Size"
                    value={settings.size}
                    min={80}
                    max={320}
                    disabled={settings.locked}
                    onChange={(v) => patch({ size: v })}
                  />
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
                      <button
                        type="button"
                        className="landing-color-btn landing-color-btn--ghost"
                        onClick={() => patch({ locked: false })}
                      >
                        Unlock
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="landing-color-btn landing-color-btn--lock"
                        onClick={() => patch({ locked: true })}
                      >
                        Lock in place
                      </button>
                    )}
                    <button
                      type="button"
                      className="landing-color-btn landing-color-btn--ghost"
                      disabled={settings.locked}
                      onClick={() => {
                        const defaults = { ...LANDING_OMNIBUNNY_DEFAULTS };
                        setSettings(defaults);
                        save(defaults);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </div>,
            document.querySelector(".landing-stage") ?? document.body,
          )
        : null}
    </>
  );
}
