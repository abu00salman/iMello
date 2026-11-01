-- Background notifications (Web Push). Payloads carry no message content.

-- Server-generated values such as the VAPID key pair (created on first start).
CREATE TABLE server_keys (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per browser/app install that allowed notifications.
-- pushkey is a random secret shared only with the homeserver's pusher for this device.
CREATE TABLE push_subscriptions (
  pushkey      text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES accounts (user_id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
