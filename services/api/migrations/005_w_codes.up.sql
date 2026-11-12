-- Wanas: short codes are written w1122. Codes stored as mell-1122 become w1122.
-- Usernames never change (Matrix IDs are permanent); sign-in and adding by the old spelling keep working.
UPDATE accounts SET code = 'w' || substr(code, 6) WHERE code ~ '^mell-[0-9]{4}$';
