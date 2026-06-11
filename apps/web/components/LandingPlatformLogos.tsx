"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PlatformLogoHorizontal, type PlatformId } from "@/components/platform-icons";
import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-platform-logos";
const BLEED = 480;

const PLATFORMS: PlatformId[] = ["youtube", "twitch", "kick", "tiktok", "rumble", "x"];

/** Default page-space positions (platforms card removed from page). */
const PAGE_DEFAULTS: Record<PlatformId, PlatformLogoTransform> = {
  youtube: { x: "72", y: "580", size: "32", rotate: "-6" },
  twitch: { x: "200", y: "600", size: "34", rotate: "4" },
  kick: { x: "340", y: "575", size: "32", rotate: "-3" },
  tiktok: { x: "480", y: "605", size: "30", rotate: "8" },
  rumble: { x: "620", y: "585", size: "32", rotate: "-5" },
  x: { x: "760", y: "595", size: "30", rotate: "6" },
};

/** Legacy offsets inside #platforms before page-space migration */
const CARD_LOCAL_DEFAULTS: Record<PlatformId, PlatformLogoTransform> = {
  youtube: { x: "24", y: "52", size: "28", rotate: "0" },
  twitch: { x: "112", y: "52", size: "28", rotate: "0" },
  kick: { x: "200", y: "52", size: "28", rotate: "0" },
  tiktok: { x: "288", y: "52", size: "28", rotate: "0" },
  rumble: { x: "376", y: "52", size: "28", rotate: "0" },
  x: { x: "452", y: "52", size: "28", rotate: "0" },
};

export type PlatformLogoTransform = {
  x: string;
  y: string;
  size: string;
  rotate: string;
};

export type LandingPlatformLogosSettings = {
  coordSpace: "page";
  locked: boolean;
  logos: Record<PlatformId, PlatformLogoTransform>;
};

export const LANDING_PLATFORM_LOGOS_DEFAULTS: LandingPlatformLogosSettings = {
  coordSpace: "page",
  locked: false,
  logos: structuredClone(PAGE_DEFAULTS),
};

function looksLikeCardCoords(logos: Record<PlatformId, PlatformLogoTransform>): boolean {
  return PLATFORMS.every((id) => Number(logos[id].y) < 200);
}

function loadStored(): LandingPlatformLogosSettings & { coordSpace?: string } {
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return structuredClone(LANDING_PLATFORM_LOGOS_DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<LandingPlatformLogosSettings> & {
      positions?: Record<PlatformId, { x: string; y: string }>;
      coordSpace?: string;
    };
    const logos = { ...PAGE_DEFAULTS };
    for (const id of PLATFORMS) {
      const legacy = parsed.positions?.[id];
      const next = parsed.logos?.[id];
      if (next) {
        logos[id] = {
          x: next.x ?? logos[id].x,
          y: next.y ?? logos[id].y,
          size: next.size ?? logos[id].size,
          rotate: next.rotate ?? logos[id].rotate,
        };
      } else if (legacy) {
        logos[id] = { ...logos[id], x: legacy.x ?? logos[id].x, y: legacy.y ?? logos[id].y };
      }
    }

    const coordSpace = parsed.coordSpace === "page" ? "page" : "card";
    if (coordSpace !== "page" || looksLikeCardCoords(logos)) {
      return {
        coordSpace: "page",
        locked: parsed.locked ?? LANDING_PLATFORM_LOGOS_DEFAULTS.locked,
        logos: structuredClone(PAGE_DEFAULTS),
      };
    }

    return {
      coordSpace: "page",
      locked: parsed.locked ?? LANDING_PLATFORM_LOGOS_DEFAULTS.locked,
      logos,
    };
  } catch {
    return structuredClone(LANDING_PLATFORM_LOGOS_DEFAULTS);
  }
}

function offsetCardToPage(
  logos: Record<PlatformId, PlatformLogoTransform>,
  pageEl: HTMLElement,
  cardEl: HTMLElement,
): Record<PlatformId, PlatformLogoTransform> {
  const pageRect = pageEl.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect();
  const ox = cardRect.left - pageRect.left;
  const oy = cardRect.top - pageRect.top;
  const out = { ...logos };
  for (const id of PLATFORMS) {
    out[id] = {
      ...out[id],
      x: String(Math.round(Number(out[id].x) + ox)),
      y: String(Math.round(Number(out[id].y) + oy)),
    };
  }
  return out;
}

function save(settings: LandingPlatformLogosSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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

type Props = {
  pageRef: RefObject<HTMLElement | null>;
};

export function LandingPlatformLogos({ pageRef }: Props) {
  const migratedRef = useRef(false);
  const dragRef = useRef<{
    kind: "move" | "rotate" | "scale";
    id: PlatformId;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originRotate: number;
    originSize: number;
    startAngle: number;
    cx: number;
    cy: number;
  } | null>(null);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<LandingPlatformLogosSettings>(() =>
    structuredClone(LANDING_PLATFORM_LOGOS_DEFAULTS),
  );
  const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState<PlatformId | null>(null);
  const [draggingId, setDraggingId] = useState<PlatformId | null>(null);

  useEffect(() => {
    const stored = loadStored();
    setSettings({
      coordSpace: "page",
      locked: stored.locked,
      logos: stored.logos,
    });
    setHydrated(true);
  }, []);

  useLayoutEffect(() => {
    if (!hydrated || migratedRef.current) return;
    const page = pageRef.current;
    if (!page) return;

    const card = document.getElementById("platforms");
    const raw = readLandingStorage(STORAGE_KEY);
    let alreadyPage = false;
    if (raw) {
      try {
        alreadyPage = JSON.parse(raw).coordSpace === "page";
      } catch {
        alreadyPage = false;
      }
    }

    if (!card) {
      if (!alreadyPage || looksLikeCardCoords(settings.logos)) {
        const next: LandingPlatformLogosSettings = {
          coordSpace: "page",
          locked: settings.locked,
          logos: structuredClone(PAGE_DEFAULTS),
        };
        setSettings(next);
        save(next);
      }
      migratedRef.current = true;
      return;
    }

    if (!alreadyPage) {
      setSettings((prev) => {
        const next: LandingPlatformLogosSettings = {
          coordSpace: "page",
          locked: prev.locked,
          logos: offsetCardToPage(prev.logos, page, card),
        };
        save(next);
        return next;
      });
    }

    migratedRef.current = true;
  }, [hydrated, pageRef]);

  const patch = useCallback((partial: Partial<LandingPlatformLogosSettings>) => {
    setSettings((prev) => {
      const next: LandingPlatformLogosSettings = { ...prev, ...partial, coordSpace: "page" };
      save(next);
      return next;
    });
  }, []);

  const patchLogo = useCallback((id: PlatformId, partial: Partial<PlatformLogoTransform>) => {
    setSettings((prev) => {
      if (prev.locked) return prev;
      const next: LandingPlatformLogosSettings = {
        coordSpace: "page",
        locked: prev.locked,
        logos: {
          ...prev.logos,
          [id]: { ...prev.logos[id], ...partial },
        },
      };
      save(next);
      return next;
    });
  }, []);

  const clampMove = useCallback(
    (x: number, y: number, _logoW: number, _logoH: number) => {
      const page = pageRef.current;
      if (!page) return { x, y };
      const w = page.clientWidth;
      const h = page.clientHeight;
      return {
        x: Math.min(Math.max(-BLEED, x), w + BLEED),
        y: Math.min(Math.max(-BLEED, y), h + BLEED),
      };
    },
    [pageRef],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onMoveDown = useCallback(
    (id: PlatformId, e: React.PointerEvent<HTMLDivElement>) => {
      if (!LANDING_LAYOUT_EDITORS_ENABLED || settings.locked) return;
      if ((e.target as HTMLElement).closest(".landing-platform-logo-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveId(id);
      e.currentTarget.setPointerCapture(e.pointerId);
      const logo = settings.logos[id];
      dragRef.current = {
        kind: "move",
        id,
        startX: e.clientX,
        startY: e.clientY,
        originX: Number(logo.x),
        originY: Number(logo.y),
        originRotate: Number(logo.rotate),
        originSize: Number(logo.size),
        startAngle: 0,
        cx: 0,
        cy: 0,
      };
      setDraggingId(id);
    },
    [settings.locked, settings.logos],
  );

  const onRotateDown = useCallback(
    (id: PlatformId, e: React.PointerEvent<HTMLButtonElement>) => {
      if (settings.locked) return;
      e.stopPropagation();
      e.preventDefault();
      setActiveId(id);
      const el = e.currentTarget.closest(".landing-platform-logo-embed") as HTMLDivElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "rotate",
        id,
        startX: e.clientX,
        startY: e.clientY,
        originX: Number(settings.logos[id].x),
        originY: Number(settings.logos[id].y),
        originRotate: Number(settings.logos[id].rotate),
        originSize: Number(settings.logos[id].size),
        startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI),
        cx,
        cy,
      };
      setDraggingId(id);
    },
    [settings.locked, settings.logos],
  );

  const onScaleDown = useCallback(
    (id: PlatformId, e: React.PointerEvent<HTMLButtonElement>) => {
      if (settings.locked) return;
      e.stopPropagation();
      e.preventDefault();
      setActiveId(id);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "scale",
        id,
        startX: e.clientX,
        startY: e.clientY,
        originX: Number(settings.logos[id].x),
        originY: Number(settings.logos[id].y),
        originRotate: Number(settings.logos[id].rotate),
        originSize: Number(settings.logos[id].size),
        startAngle: 0,
        cx: 0,
        cy: 0,
      };
      setDraggingId(id);
    },
    [settings.locked, settings.logos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current || settings.locked) return;
      const d = dragRef.current;
      const logo = settings.logos[d.id];
      const logoH = Number(logo.size);
      const logoW = logoH * 2;

      if (d.kind === "move") {
        const scale =
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--landing-scale")) || 1;
        const dx = (e.clientX - d.startX) / scale;
        const dy = (e.clientY - d.startY) / scale;
        const next = clampMove(d.originX + dx, d.originY + dy, logoW, logoH);
        patchLogo(d.id, { x: String(Math.round(next.x)), y: String(Math.round(next.y)) });
        return;
      }

      if (d.kind === "rotate") {
        const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * (180 / Math.PI);
        let next = Math.round(d.originRotate + (angle - d.startAngle));
        while (next > 180) next -= 360;
        while (next < -180) next += 360;
        patchLogo(d.id, { rotate: String(next) });
        return;
      }

      if (d.kind === "scale") {
        const dy = e.clientY - d.startY;
        const next = Math.min(96, Math.max(14, Math.round(d.originSize + dy * 0.35)));
        patchLogo(d.id, { size: String(next) });
      }
    },
    [clampMove, patchLogo, settings.locked, settings.logos],
  );

  if (!hydrated) return null;

  const selected = activeId ?? PLATFORMS[0]!;
  const selectedLogo = settings.logos[selected];
  const editable = LANDING_LAYOUT_EDITORS_ENABLED && !settings.locked;

  return (
    <>
      <div className="landing-platforms-logos" aria-hidden={!editable}>
        {PLATFORMS.map((id) => {
          const logo = settings.logos[id];
          const size = Number(logo.size);
          const isActive = activeId === id;
          return (
            <div
              key={id}
              className={`landing-platform-logo-embed${
                !editable ? " landing-platform-logo-embed--locked" : ""
              }${draggingId === id ? " landing-platform-logo-embed--dragging" : ""}${
                isActive && editable ? " landing-platform-logo-embed--active" : ""
              }`}
              style={{
                left: `${logo.x}px`,
                top: `${logo.y}px`,
                transform: `rotate(${logo.rotate}deg)`,
              }}
              onPointerDown={editable ? (e) => onMoveDown(id, e) : undefined}
              onPointerMove={editable ? onPointerMove : undefined}
              onPointerUp={editable ? endDrag : undefined}
              onPointerCancel={editable ? endDrag : undefined}
            >
              <PlatformLogoHorizontal id={id} height={size} className="landing-platform-logo-img" />
              {editable ? (
                <>
                  <span className="landing-platform-logo-embed-badge">{id}</span>
                  <button
                    type="button"
                    className="landing-platform-logo-handle landing-platform-logo-rotate-handle"
                    aria-label={`Rotate ${id}`}
                    onPointerDown={(e) => onRotateDown(id, e)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                  <button
                    type="button"
                    className="landing-platform-logo-handle landing-platform-logo-scale-handle"
                    aria-label={`Resize ${id}`}
                    onPointerDown={(e) => onScaleDown(id, e)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {LANDING_LAYOUT_EDITORS_ENABLED ? (
      <div className={`landing-platform-logos-editor${open ? " landing-platform-logos-editor--open" : ""}`}>
        <button type="button" className="landing-platform-logos-editor-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide logo tools" : "Edit platform logos"}
        </button>

        {open ? (
          <div className="landing-platform-logos-editor-panel" role="dialog" aria-label="Platform logo placement">
            <div className="landing-color-editor-head">
              <h2 className="landing-color-editor-title">Platform logos</h2>
              <p className="landing-color-editor-sub">
                {settings.locked
                  ? "Unlock to drag outside the box · rotate & resize handles"
                  : "Drag anywhere · handles to rotate / resize"}
              </p>
            </div>

            <div className="landing-platform-logo-picker">
              {PLATFORMS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`landing-platform-logo-picker-btn${selected === id ? " landing-platform-logo-picker-btn--active" : ""}`}
                  disabled={settings.locked}
                  onClick={() => setActiveId(id)}
                >
                  {id}
                </button>
              ))}
            </div>

            <SliderField
              label={`${selected} size`}
              value={selectedLogo.size}
              min={14}
              max={96}
              disabled={settings.locked}
              onChange={(v) => patchLogo(selected, { size: v })}
            />
            <SliderField
              label={`${selected} rotation`}
              value={selectedLogo.rotate}
              min={-180}
              max={180}
              unit="°"
              disabled={settings.locked}
              onChange={(v) => patchLogo(selected, { rotate: v })}
            />
            <SliderField
              label={`${selected} horizontal`}
              value={selectedLogo.x}
              min={-BLEED}
              max={1800}
              disabled={settings.locked}
              onChange={(v) => patchLogo(selected, { x: v })}
            />
            <SliderField
              label={`${selected} vertical`}
              value={selectedLogo.y}
              min={-BLEED}
              max={1400}
              disabled={settings.locked}
              onChange={(v) => patchLogo(selected, { y: v })}
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
                  const page = pageRef.current;
                  const card = document.getElementById("platforms");
                  if (page && card) {
                    const next: LandingPlatformLogosSettings = {
                      coordSpace: "page",
                      locked: false,
                      logos: offsetCardToPage(structuredClone(CARD_LOCAL_DEFAULTS), page, card),
                    };
                    setSettings(next);
                    save(next);
                  } else {
                    const defaults = structuredClone(LANDING_PLATFORM_LOGOS_DEFAULTS);
                    setSettings(defaults);
                    save(defaults);
                  }
                  setActiveId(PLATFORMS[0]!);
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
