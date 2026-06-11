-- Persist ingest watch list per workspace (survives API restarts on Postgres).
CREATE TABLE IF NOT EXISTS watched_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform platform NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS watched_channels_ws_platform_slug_idx
  ON watched_channels (workspace_id, platform, slug);

CREATE INDEX IF NOT EXISTS watched_channels_workspace_idx
  ON watched_channels (workspace_id);
