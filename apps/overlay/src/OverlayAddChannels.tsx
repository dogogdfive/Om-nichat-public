import { useState } from "react";
import {
  CHANNEL_PLATFORMS,
  channelPlatformLabel,
  type ChannelPlatform,
} from "./parse-channel-input";
import { platformIconSrc } from "./params";
import { addOverlayChannel } from "./overlay-add-channel";

const PLACEHOLDERS: Record<ChannelPlatform, string> = {
  twitch: "Paste link or channel name",
  kick: "Paste link or channel name",
  youtube: "Paste link or @channel",
  x: "Paste link or handle",
  rumble: "Paste link or channel name",
};

type Props = {
  ws: string;
  workspaceId: string;
  onClose: () => void;
  onAdded: () => void;
};

export function OverlayAddChannels({ ws, workspaceId, onClose, onAdded }: Props) {
  const [inputs, setInputs] = useState<Partial<Record<ChannelPlatform, string>>>({});
  const [adding, setAdding] = useState<ChannelPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAdd = async (platform: ChannelPlatform) => {
    const raw = inputs[platform]?.trim();
    if (!raw) {
      setError(`Enter a ${channelPlatformLabel(platform)} link or name`);
      return;
    }
    setAdding(platform);
    setError(null);
    setSuccess(null);
    const result = await addOverlayChannel(ws, workspaceId, platform, raw);
    setAdding(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInputs((prev) => ({ ...prev, [platform]: "" }));
    setSuccess(`Added ${channelPlatformLabel(platform)} channel`);
    onAdded();
  };

  return (
    <div className="overlay-add-backdrop" onClick={onClose} role="presentation">
      <div
        className="overlay-add-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add channels"
      >
        <div className="overlay-add-header">
          <h2 className="overlay-add-title">Add streamer</h2>
          <button type="button" className="overlay-add-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="overlay-add-desc">Paste a channel link or name for each platform.</p>
        <div className="overlay-add-grid">
          {CHANNEL_PLATFORMS.map((platform) => (
            <div key={platform} className="overlay-add-row">
              <span className="overlay-add-platform">
                <img src={platformIconSrc(platform)} alt="" className="overlay-add-platform-icon" />
                {channelPlatformLabel(platform)}
              </span>
              <input
                type="text"
                className="overlay-add-input"
                value={inputs[platform] ?? ""}
                placeholder={PLACEHOLDERS[platform]}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, [platform]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd(platform);
                }}
              />
              <button
                type="button"
                className="overlay-add-btn"
                disabled={adding === platform}
                onClick={() => void handleAdd(platform)}
              >
                {adding === platform ? "…" : "Add"}
              </button>
            </div>
          ))}
        </div>
        {error ? <p className="overlay-add-error">{error}</p> : null}
        {success ? <p className="overlay-add-success">{success}</p> : null}
      </div>
    </div>
  );
}
