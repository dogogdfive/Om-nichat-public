const FEATURES = [
  {
    title: "Unified Chat Feed",
    body: "Stop juggling chat tabs. Unify messages from every platform in a single, clean feed.",
  },
  {
    title: "Send Messages",
    body: "Send chat messages into all your livestreams, or just the platforms you choose.",
  },
  {
    title: "Moderate",
    body: "Delete, timeout, and ban across connected channels from one panel.",
  },
  {
    title: "Chatter Insights",
    body: "Click any chatter to see history, join date, follower count, and profile links.",
  },
  {
    title: "Stream Integration",
    body: "Add OMnichat as a browser source in OBS, Streamlabs, XSplit, and more.",
  },
  {
    title: "Add Any Channel",
    body: "Monitor any livestream — not just your own — for friends or community events.",
  },
];

export function FeatureGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {FEATURES.map((f) => (
        <article key={f.title} className="demo-feature-card p-6">
          <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
        </article>
      ))}
    </div>
  );
}
