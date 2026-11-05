-- Short iMello Codes (mell-1122). The Matrix username never changes, so a short code is kept beside it.
-- Contacts can be added and people can sign in with either the short code or the original number.
ALTER TABLE accounts ADD COLUMN code text UNIQUE;

-- New 4-digit accounts already have a short username: it is their code.
UPDATE accounts SET code = username WHERE username ~ '^mell-[0-9]{4}$';

-- The owner's account asked for Mell-1122.
UPDATE accounts SET code = 'mell-1122'
  WHERE username = 'mell-872864' AND code IS NULL
    AND NOT EXISTS (SELECT 1 FROM accounts WHERE code = 'mell-1122' OR username = 'mell-1122');

-- Every other account with a 6-digit number gets a free random 4-digit code.
DO $$
DECLARE r record; c text;
BEGIN
  FOR r IN SELECT user_id FROM accounts WHERE code IS NULL AND username ~ '^mell-[0-9]{6}$' ORDER BY created_at LOOP
    LOOP
      c := 'mell-' || lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE code = c OR username = c);
    END LOOP;
    UPDATE accounts SET code = c WHERE user_id = r.user_id;
  END LOOP;
END $$;
