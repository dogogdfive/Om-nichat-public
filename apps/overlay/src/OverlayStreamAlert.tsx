import type { StreamAlertEvent, StreamAlertKind } from "@omnichat/chat-types";
import { platformIconSrc } from "./params";

const PLATFORM_COLORS: Record<string, string> = {
  twitch: "#a78bfa",
  kick: "#53FC18",
  rumble: "#85c742",
};

function bannerClass(platform: string, kind: StreamAlertKind): string {
  if (platform === "twitch") {
    return kind === "bits"
      ? "overlay-stream-alert overlay-stream-alert--twitch-bits"
      : "overlay-stream-alert overlay-stream-alert--twitch-sub";
  }
  if (platform === "kick") {
    return kind === "donation"
      ? "overlay-stream-alert overlay-stream-alert--kick-donation"
      : "overlay-stream-alert overlay-stream-alert--kick-sub";
  }
  return "overlay-stream-alert";
}

function usesBanner(kind: StreamAlertKind): boolean {
  return kind === "sub" || kind === "resub" || kind === "sub_gift" || kind === "donation";
}

function alertBody(alert: StreamAlertEvent): string {
  if (alert.kind !== "bits") return alert.text.trim();
  const user = alert.user?.trim();
  if (!user) return alert.text;
  const text = alert.text.trim();
  const lower = text.toLowerCase();
  const nameLower = user.toLowerCase();
  if (lower.startsWith(nameLower)) {
    let rest = text.slice(user.length).trim();
    if (rest.startsWith(":")) rest = rest.slice(1).trim();
    return rest || text;
  }
  return text.replace(/^cheered \d+ bits(?::\s*)?/i, "").trim() || text;
}

type Props = {
  alert: StreamAlertEvent;
  showPlatformIcon: boolean;
};

export function OverlayStreamAlert({ alert, showPlatformIcon }: Props) {
  const platform = alert.platform;
  const user = alert.user?.trim() || "Someone";
  const userColor = PLATFORM_COLORS[platform] ?? "#a78bfa";
  const kind = alert.kind;

  if (usesBanner(kind)) {
    return (
      <div className={bannerClass(platform, kind)}>
        {showPlatformIcon ? (
          <img
            className="overlay-platform-icon"
            src={platformIconSrc(platform)}
            alt={platform}
            title={platform}
          />
        ) : null}
        <p className="overlay-stream-alert-copy">
          <span className="overlay-stream-alert-user" style={{ color: userColor }}>
            {user}
          </span>{" "}
          <span className="overlay-stream-alert-text">{alert.text.trim()}</span>
        </p>
      </div>
    );
  }

  if (kind === "bits" && platform === "twitch") {
    const bits = alert.amount ?? "100";
    return (
      <div className={bannerClass(platform, kind)}>
        {showPlatformIcon ? (
          <img
            className="overlay-platform-icon"
            src={platformIconSrc(platform)}
            alt={platform}
            title={platform}
          />
        ) : null}
        <p className="overlay-stream-alert-copy">
          <span className="overlay-bits-badge" aria-hidden>
            ◆
          </span>
          <span className="overlay-stream-alert-user" style={{ color: userColor }}>
            {user}
          </span>
          <span className="overlay-text-muted">: </span>
          <span className="overlay-bits-prefix">cheer{bits} </span>
          <span className="overlay-stream-alert-text">{alertBody(alert)}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="overlay-msg">
      {showPlatformIcon ? (
        <img
          className="overlay-platform-icon"
          src={platformIconSrc(platform)}
          alt={platform}
          title={platform}
        />
      ) : null}
      <p style={{ margin: 0, minWidth: 0, flex: 1 }}>
        <span className="overlay-username" style={{ color: userColor }}>
          {user}
        </span>
        <span className="overlay-text-muted">: </span>
        <span className="overlay-text">{alert.text.trim()}</span>
      </p>
    </div>
  );
}
