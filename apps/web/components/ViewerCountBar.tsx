"use client";

import { PlatformEmblem } from "@/components/PlatformLogos";
import { formatViewers, type StreamViewerEntry } from "@/lib/stream-viewers";

function IconEye() {
  return (
    <svg className="prochat-viewer-eye" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
  );
}

function ViewerChip({
  stream,
  mode,
}: {
  stream: StreamViewerEntry;
  mode: "icons" | "compact";
}) {
  const label =
    stream.viewers != null
      ? formatViewers(stream.viewers)
      : stream.platform === "x"
        ? "—"
        : stream.isLive
          ? "Live"
          : "Offline";

  const title =
    stream.title ??
    (stream.viewers != null
      ? `${stream.login} — ${stream.viewers.toLocaleString()} viewers`
      : stream.platform === "x"
        ? `${stream.login} on X — viewer count unavailable`
        : stream.isLive
          ? `${stream.login} is live`
          : `${stream.login} is offline`);

  const dim = !stream.isLive && stream.viewers == null;

  return (
    <span
      className={`prochat-viewer-chip${dim ? " prochat-viewer-chip--dim" : ""}`}
      title={title}
    >
      {mode === "icons" && <PlatformEmblem platform={stream.platform} size={14} />}
      {mode === "icons" && stream.viewers != null && <IconEye />}
      <span className="prochat-viewer-chip-count">{label}</span>
    </span>
  );
}

export function ViewerCountBar({
  streams,
  totalViewers,
  mode,
}: {
  streams: StreamViewerEntry[];
  totalViewers: number;
  mode: "icons" | "compact";
}) {
  const live = streams.filter((s) => {
    if (s.platform === "x") return false;
    return s.isLive || s.viewers != null;
  });
  if (live.length === 0) return null;

  const showTotal = live.length > 1 && totalViewers > 0;

  return (
    <div className="prochat-viewer-bar" role="status" aria-live="polite">
      {live.map((stream) => (
        <ViewerChip key={`${stream.platform}:${stream.login}`} stream={stream} mode={mode} />
      ))}
      {showTotal && (
        <span className="prochat-viewer-total" title={`${totalViewers.toLocaleString()} total viewers`}>
          {mode === "icons" && <IconEye />}
          {formatViewers(totalViewers)}
        </span>
      )}
    </div>
  );
}
