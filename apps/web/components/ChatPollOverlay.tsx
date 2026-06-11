"use client";

import { memo } from "react";
import type { PollEvent } from "@/lib/overlay-types";
import { PlatformEmblem } from "@/components/PlatformLogos";

type Props = {
  polls: PollEvent[];
};

function PollCard({ poll }: { poll: PollEvent }) {
  const total = poll.totalVotes || poll.choices.reduce((s, c) => s + c.votes, 0);
  const leadingVotes = Math.max(0, ...poll.choices.map((c) => c.votes));
  return (
    <div className="prochat-poll-card">
      <div className="prochat-poll-head">
        <PlatformEmblem platform={poll.platform} size={16} />
        <span className="prochat-poll-title">{poll.title || "Poll"}</span>
        <span className="prochat-poll-total">{total} votes</span>
      </div>
      <div className="prochat-poll-choices">
        {poll.choices.map((choice) => {
          const pct = total > 0 ? Math.round((choice.votes / total) * 100) : 0;
          const leading = choice.votes > 0 && choice.votes === leadingVotes;
          return (
            <div
              key={choice.id}
              className={`prochat-poll-choice ${leading ? "prochat-poll-choice--leading" : ""}`}
            >
              <div className="prochat-poll-choice-fill" style={{ width: `${pct}%` }} />
              <span className="prochat-poll-choice-label">{choice.title}</span>
              <span className="prochat-poll-choice-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChatPollOverlay = memo(function ChatPollOverlay({ polls }: Props) {
  if (polls.length === 0) return null;
  return (
    <div className="prochat-poll-overlay" role="status" aria-live="polite">
      {polls.map((poll) => (
        <PollCard key={`${poll.platform}:${poll.pollId}`} poll={poll} />
      ))}
    </div>
  );
});
