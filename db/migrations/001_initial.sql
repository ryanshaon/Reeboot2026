CREATE SCHEMA IF NOT EXISTS reboot;

CREATE TABLE IF NOT EXISTS reboot.event_meta (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO reboot.event_meta (id, revision) VALUES (true, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reboot.teams (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  captain_id uuid NOT NULL,
  enrollment_key_hash char(64),
  created_at timestamptz NOT NULL,
  CONSTRAINT teams_enrollment_key_hash_unique UNIQUE (enrollment_key_hash) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS reboot.members (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES reboot.teams(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) <= 254),
  access_code_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  is_captain boolean NOT NULL DEFAULT false,
  member_position smallint NOT NULL CHECK (member_position BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL,
  CONSTRAINT members_team_id_id_unique UNIQUE (team_id, id),
  CONSTRAINT members_email_unique UNIQUE (email) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT members_team_position_unique UNIQUE (team_id, member_position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS members_team_id_idx ON reboot.members (team_id);

ALTER TABLE reboot.teams ADD CONSTRAINT teams_captain_member_fk
  FOREIGN KEY (id, captain_id) REFERENCES reboot.members(team_id, id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS members_one_captain_per_team_idx ON reboot.members (team_id) WHERE is_captain;

CREATE TABLE IF NOT EXISTS reboot.games (
  id text PRIMARY KEY CHECK (id IN ('aiml', 'syscom', 'gamedev', 'webdev')),
  url text,
  status text NOT NULL CHECK (status IN ('coming_soon', 'live', 'closed'))
);
INSERT INTO reboot.games (id, url, status) VALUES
  ('aiml', NULL, 'coming_soon'), ('syscom', NULL, 'coming_soon'),
  ('gamedev', NULL, 'coming_soon'), ('webdev', NULL, 'coming_soon')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reboot.attempts (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES reboot.members(id) DEFERRABLE INITIALLY DEFERRED,
  game_id text NOT NULL REFERENCES reboot.games(id) DEFERRABLE INITIALLY DEFERRED,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 1000000),
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_member_created_idx ON reboot.attempts (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_game_created_idx ON reboot.attempts (game_id, created_at DESC);
