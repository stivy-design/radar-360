PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Brasil',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')),
  cover_image TEXT,
  author TEXT NOT NULL DEFAULT 'Redação RADAR 360',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_public ON articles(status,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category,status,published_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip,attempted_at);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO categories(name,slug) VALUES
('Brasil','brasil'),('Mundo','mundo'),('Política','politica'),('Economia','economia'),
('Esportes','esportes'),('Tecnologia','tecnologia'),('Entretenimento','entretenimento');
