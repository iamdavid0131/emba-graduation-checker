-- 課程評價（Cloudflare D1）
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  course_name TEXT NOT NULL,
  instructor  TEXT NOT NULL DEFAULT '',
  nickname    TEXT NOT NULL DEFAULT '匿名',
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  token       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_course ON reviews (course_name, created_at DESC);
