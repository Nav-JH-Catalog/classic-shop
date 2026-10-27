CREATE TABLE IF NOT EXISTS catalog_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_count INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_backups_created ON catalog_backups(created_at);
