-- "Start now" accounts (BBM-style iMello numbers) and contact requests by number.

-- 'device': the homeserver password is a random secret held only by the user's device.
-- 'password': the user chose their own password (account is "protected").
ALTER TABLE accounts ADD COLUMN credential text NOT NULL DEFAULT 'password'
  CHECK (credential IN ('password', 'device'));

CREATE TABLE contact_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id      text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  to_id        text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_id <> to_id)
);
-- At most one pending request per direction.
CREATE UNIQUE INDEX contact_requests_pending_uq ON contact_requests (from_id, to_id) WHERE status = 'pending';
CREATE INDEX contact_requests_to_idx ON contact_requests (to_id) WHERE status = 'pending';
