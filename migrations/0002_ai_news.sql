CREATE TABLE IF NOT EXISTS ai_news_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','skipped')),
  found_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_news_runs_started ON ai_news_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS ai_news_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  sources_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','rejected')),
  article_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_candidates_status_created ON ai_news_candidates(status,created_at DESC);
