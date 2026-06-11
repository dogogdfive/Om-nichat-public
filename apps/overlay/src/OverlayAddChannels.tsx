import { useState } from "react";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./parse-channel-input";
import { platformIconSrc } from "./params";
import { addOverlayChannel } from "./overlay-add-channel";

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
      setError("Paste a link or channel name");
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
    setSuccess("Channel added");
    onAdded();
  };

  return (
    <div className="overlay-add-strip" role="region" aria-label="Add channels">
      <div className="overlay-add-strip-head">
        <span className="overlay-add-strip-title">Add channel</span>
        <button type="button" className="overlay-add-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="overlay-add-grid">
        {CHANNEL_PLATFORMS.map((platform) => (
          <div key={platform} className="overlay-add-row">
            <img
              src={platformIconSrc(platform)}
              alt={platform}
              className="overlay-add-platform-icon"
              title={platform}
            />
            <input
              type="text"
              className="overlay-add-input"
              value={inputs[platform] ?? ""}
              placeholder="Paste link"
              onChange={(e) => setInputs((prev) => ({ ...prev, [platform]: e.target.value }))}
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
  );
}
