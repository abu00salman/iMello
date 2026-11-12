UPDATE accounts SET code = 'mell-' || substr(code, 2) WHERE code ~ '^w[0-9]{4}$';
