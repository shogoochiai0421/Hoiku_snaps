DROP TABLE IF EXISTS thread_tags;
DROP TABLE IF EXISTS tag_keywords;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS ng_words;
DROP TABLE IF EXISTS boards;

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tag_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  UNIQUE(tag_id, keyword)
);

CREATE TABLE threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  place TEXT,
  child_age TEXT,
  poster_age TEXT,
  poster_gender TEXT,
  poster_role TEXT,
  ip_address TEXT,
  delete_password TEXT,
  likes INTEGER DEFAULT 0,
  surprises INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE thread_tags (
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, tag_id)
);

CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  type TEXT DEFAULT 'like',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(thread_id, ip_address, type)
);

CREATE TABLE ng_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tags (name) VALUES ('保育園');
INSERT INTO tags (name) VALUES ('幼稚園');
INSERT INTO tags (name) VALUES ('小学校');
INSERT INTO tags (name) VALUES ('子育て');
INSERT INTO tags (name) VALUES ('発達');
INSERT INTO tags (name) VALUES ('遊び');
INSERT INTO tags (name) VALUES ('食事');
INSERT INTO tags (name) VALUES ('睡眠');
INSERT INTO tags (name) VALUES ('排泄');
INSERT INTO tags (name) VALUES ('基本的生活習慣');
INSERT INTO tags (name) VALUES ('保護者対応');
INSERT INTO tags (name) VALUES ('行事');
INSERT INTO tags (name) VALUES ('トイトレ');
INSERT INTO tags (name) VALUES ('イヤイヤ期');
INSERT INTO tags (name) VALUES ('言葉');