-- Short iMello Codes live beside the Matrix username. This migration only adds the column.
-- It copies a code onto accounts whose username is already 4 digits (mell-1122).
-- It does not assign codes to older 6-digit accounts and does not remap any person.
-- A one-account alias is a separate, reviewed command: services/api/src/remap-code.ts
ALTER TABLE accounts ADD COLUMN code text UNIQUE;

UPDATE accounts SET code = username
  WHERE code IS NULL AND username ~ '^mell-[0-9]{4}$';
