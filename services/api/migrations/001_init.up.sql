-- iMello policy database. Stores account relationships and guardian policy only.
-- It never stores message content, message metadata, or encryption keys —
-- those live (encrypted) on the Matrix homeserver.

CREATE TABLE accounts (
  user_id        text PRIMARY KEY,
  username       text NOT NULL UNIQUE,
  display_name   text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('adult', 'child')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  locale         text NOT NULL DEFAULT 'en',
  created_at     timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

CREATE TABLE guardianships (
  guardian_id text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  child_id    text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, child_id),
  CHECK (guardian_id <> child_id)
);
CREATE INDEX guardianships_child_idx ON guardianships (child_id);

-- One row per unordered pair; user_low < user_high enforces uniqueness of the pair.
CREATE TABLE contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low     text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  user_high    text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('accepted', 'pending_guardian', 'denied')),
  initiated_by text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX contacts_high_idx ON contacts (user_high);

CREATE TABLE contact_approvals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  child_id   text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  decision   text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'denied')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, child_id)
);
CREATE INDEX contact_approvals_child_idx ON contact_approvals (child_id) WHERE decision = 'pending';

CREATE TABLE families (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  created_by     text REFERENCES accounts (user_id) ON DELETE SET NULL,
  matrix_room_id text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('admin', 'guardian', 'member', 'child')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX family_members_user_idx ON family_members (user_id);

-- Invite tokens are stored only as SHA-256 hashes; the plaintext token exists
-- only in the link the creator shares.
CREATE TABLE invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,
  kind       text NOT NULL CHECK (kind IN ('contact', 'family')),
  creator_id text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  family_id  uuid REFERENCES families (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  max_uses   integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses       integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'family') = (family_id IS NOT NULL))
);

CREATE TABLE blocks (
  blocker_id text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  blocked_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id text REFERENCES accounts (user_id) ON DELETE SET NULL,
  reported_id text NOT NULL,
  reason      text NOT NULL,
  details     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Security-relevant events. Never contains message content, passwords or tokens.
CREATE TABLE audit_events (
  id         bigserial PRIMARY KEY,
  event_type text NOT NULL,
  actor_id   text,
  target_id  text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at);
