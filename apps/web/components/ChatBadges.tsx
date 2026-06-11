type Badge = {
  url: string;
  title?: string;
};

type Props = {
  badges?: Badge[];
};

export function ChatBadges({ badges }: Props) {
  if (!badges?.length) return null;
  return (
    <span className="prochat-user-badges">
      {badges.map((badge, i) => (
        <img
          key={`${badge.url}-${i}`}
          src={badge.url}
          alt={badge.title ?? ""}
          title={badge.title}
          className="prochat-chat-badge"
          loading="lazy"
        />
      ))}
    </span>
  );
}
