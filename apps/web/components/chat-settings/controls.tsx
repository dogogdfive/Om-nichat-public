"use client";

import type { ReactNode } from "react";

export function HelpTip() {
  return null;
}

export function SettingCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="prochat-setting-card">
      {title && <h3 className="prochat-setting-card-title">{title}</h3>}
      {children}
    </div>
  );
}

export function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="prochat-setting-row">
      <span className="prochat-setting-label">
        {label}
        {help && <HelpTip />}
      </span>
      <div className="prochat-setting-control">{children}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="prochat-segment">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`prochat-segment-btn ${value === opt.value ? "prochat-segment-btn--active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SliderRow({
  label,
  help,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string;
  help?: boolean;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="prochat-setting-row">
      <span className="prochat-setting-label">
        {label}
        {help && <HelpTip />}
      </span>
      <div className="prochat-slider-wrap">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="prochat-slider"
        />
        <span className="prochat-slider-value">{display}</span>
      </div>
    </div>
  );
}

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="prochat-subtabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`prochat-subtab ${active === t.id ? "prochat-subtab--active" : ""}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ChatPreviewBox({ children }: { children: ReactNode }) {
  return <div className="prochat-chat-preview">{children}</div>;
}

export function BoolSegment({
  value,
  onChange,
  showLabel = "Show",
  hideLabel = "Hide",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  showLabel?: string;
  hideLabel?: string;
}) {
  return (
    <SegmentedControl
      options={[
        { value: "show", label: showLabel },
        { value: "hide", label: hideLabel },
      ]}
      value={value ? "show" : "hide"}
      onChange={(v) => onChange(v === "show")}
    />
  );
}

type BoolSegmentProps = {
  value: boolean;
  onChange: (v: boolean) => void;
  showLabel?: string;
  hideLabel?: string;
};

export function OnOffSegment(props: Omit<BoolSegmentProps, "showLabel" | "hideLabel">) {
  return <BoolSegment showLabel="On" hideLabel="Off" {...props} />;
}

export function ModerateSegment(props: Omit<BoolSegmentProps, "showLabel" | "hideLabel">) {
  return <BoolSegment showLabel="Moderate" hideLabel="Off" {...props} />;
}
