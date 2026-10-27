CREATE TABLE IF NOT EXISTS chat_conversations (
  session_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  message_count INTEGER NOT NULL DEFAULT 0,
  escalated INTEGER NOT NULL DEFAULT 0,
  device TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id,created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last ON chat_conversations(last_message_at);
