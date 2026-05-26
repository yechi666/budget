ALTER TABLE categories
  ADD COLUMN sharing_type TEXT NOT NULL DEFAULT 'individual'
    CHECK(sharing_type IN ('individual', 'fixed', 'ratioed'));

-- fixed_ratio is the non-payer's share, in [0, 1]. Only meaningful when
-- sharing_type = 'fixed'. NULL otherwise (individual / ratioed don't use it).
-- App layer is responsible for setting fixed_ratio when sharing_type changes
-- to / from 'fixed'.
ALTER TABLE categories
  ADD COLUMN fixed_ratio REAL
    CHECK (fixed_ratio IS NULL OR (fixed_ratio >= 0 AND fixed_ratio <= 1));

ALTER TABLE transactions
  ADD COLUMN sharing_override TEXT
    CHECK(sharing_override IN ('individual', 'fixed', 'ratioed'));

-- Seed shared household categories. Set fixed_ratio = 0.5 on the same UPDATE
-- so 'fixed' rows have a meaningful default.
UPDATE categories
  SET sharing_type = 'fixed', fixed_ratio = 0.5
  WHERE name IN ('Groceries', 'Restaurants', 'Bills & Utilities', 'Subscriptions', 'Home') COLLATE NOCASE;
