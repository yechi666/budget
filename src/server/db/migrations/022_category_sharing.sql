ALTER TABLE categories
  ADD COLUMN sharing_type TEXT NOT NULL DEFAULT 'individual'
    CHECK(sharing_type IN ('individual', 'fixed', 'ratioed'));

ALTER TABLE categories
  ADD COLUMN fixed_ratio REAL NOT NULL DEFAULT 0.5;

ALTER TABLE transactions
  ADD COLUMN sharing_override TEXT
    CHECK(sharing_override IN ('individual', 'fixed', 'ratioed'));

UPDATE categories
  SET sharing_type = 'fixed'
  WHERE name IN ('Groceries', 'Restaurants', 'Bills & Utilities', 'Subscriptions', 'Home') COLLATE NOCASE;
