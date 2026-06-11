"use client";

import { useCallback, useEffect, useState } from "react";
import { LANDING_PANEL_COLOR_EDITOR_ENABLED } from "@/lib/landing-edit-mode";
import { readLandingStorage } from "@/lib/landing-baked";

const STORAGE_KEY = "omnichat-landing-colors";

export const LANDING_COLOR_DEFAULTS = {
  purple: "#dc51ff",
  green: "#279627",
  blue: "#0000ff",
  accent: "#e91916",
  framePadding: "16",
  panelRadius: "16",
} as const;

export type LandingColors = {
  purple: string;
  green: string;
  blue: string;
  accent: string;
  framePadding: string;
  panelRadius: string;
};

function normalizeHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  return v;
}

export function applyLandingColors(colors: LandingColors) {
  const root = document.documentElement;
  root.style.setProperty("--landing-purple", colors.purple);
  root.style.setProperty("--landing-green", colors.green);
  root.style.setProperty("--landing-blue", colors.blue);
  root.style.setProperty("--landing-accent", colors.accent);
  root.style.setProperty("--landing-frame-padding", `${colors.framePadding}px`);
  root.style.setProperty("--landing-panel-radius", `${colors.panelRadius}px`);
}

function loadStoredColors(): LandingColors {
  if (typeof window === "undefined") return { ...LANDING_COLOR_DEFAULTS };
  try {
    const raw = readLandingStorage(STORAGE_KEY);
    if (!raw) return { ...LANDING_COLOR_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<LandingColors>;
    return {
      purple: normalizeHex(parsed.purple ?? LANDING_COLOR_DEFAULTS.purple),
      green: normalizeHex(parsed.green ?? LANDING_COLOR_DEFAULTS.green),
      blue: normalizeHex(parsed.blue ?? LANDING_COLOR_DEFAULTS.blue),
      accent: normalizeHex(parsed.accent ?? LANDING_COLOR_DEFAULTS.accent),
      framePadding: parsed.framePadding ?? LANDING_COLOR_DEFAULTS.framePadding,
      panelRadius: parsed.panelRadius ?? LANDING_COLOR_DEFAULTS.panelRadius,
    };
  } catch {
    return { ...LANDING_COLOR_DEFAULTS };
  }
}

function saveColors(colors: LandingColors) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyLandingColors(colors);
}

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="landing-color-field">
      <div className="landing-color-field-head">
        <span className="landing-color-field-label">{label}</span>
        <span className="landing-color-field-hint">{value}</span>
      </div>
      <div className="landing-color-field-row">
        <input
          type="color"
          className="landing-color-picker"
          value={value}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          aria-label={label}
        />
        <input
          type="text"
          className="landing-color-hex"
          value={value}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          spellCheck={false}
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

export function LandingColorEditor() {
  const [colors, setColors] = useState<LandingColors>(() => ({ ...LANDING_COLOR_DEFAULTS }));
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredColors();
    setColors(stored);
    applyLandingColors(stored);
    setHydrated(true);
  }, []);

  const setGreen = useCallback((green: string) => {
    setColors((prev) => {
      const next = { ...prev, green: normalizeHex(green) };
      saveColors(next);
      return next;
    });
  }, []);

  if (!hydrated) return null;

  if (!LANDING_PANEL_COLOR_EDITOR_ENABLED) return null;

  return (
    <div className={`landing-color-editor${open ? " landing-color-editor--open" : ""}`}>
      <button type="button" className="landing-color-editor-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide green panel" : "Green panel"}
      </button>

      {open ? (
        <div className="landing-color-editor-panel" role="dialog" aria-label="Green panel color">
          <div className="landing-color-editor-head">
            <h2 className="landing-color-editor-title">Green panel</h2>
            <p className="landing-color-editor-sub">Main content area background · saved in your browser</p>
          </div>

          <div className="landing-color-preview" style={{ background: colors.green }} aria-hidden />

          <ColorField label="Panel green" value={colors.green} onChange={setGreen} />

          <div className="landing-color-editor-actions">
            <button
              type="button"
              className="landing-color-btn landing-color-btn--ghost"
              onClick={() => setGreen(LANDING_COLOR_DEFAULTS.green)}
            >
              Reset green
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
