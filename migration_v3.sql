-- ============================================================
-- Sitters4Me — Database Migration v3
-- Run AFTER migration_v1.sql and migration_v2.sql
-- Run in GoDaddy → cPanel → phpMyAdmin → SQL tab
--
-- Adds:
--   • jobs.scheduled_time       — future appointment date/time
--   • user.last_seen            — sitter heartbeat for map visibility
-- ============================================================

-- ── 1. JOBS TABLE — future appointment date/time ─────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scheduled_time DATETIME DEFAULT NULL
    COMMENT 'For future/scheduled appointments (not real-time requests)';

-- ── 2. USER TABLE — sitter heartbeat timestamp ───────────────
--    Sitters update this every 6s while online (via check_incoming).
--    Parent map filters out sitters not seen in > 5 minutes,
--    so crashed/disconnected sitters auto-disappear from the map.
ALTER TABLE `user`
  ADD COLUMN IF NOT EXISTS last_seen DATETIME DEFAULT NULL
    COMMENT 'Last time sitter polled while online — used to filter stale sitters';

-- ── 3. INDEX last_seen for fast filtering ────────────────────
-- (safe to run even if index exists — IF NOT EXISTS requires MySQL 8.0)
-- If on MySQL 5.7, skip this line and add manually if needed.
ALTER TABLE `user`
  ADD INDEX IF NOT EXISTS idx_last_seen (last_seen);

-- ── 4. VERIFY ─────────────────────────────────────────────────
SHOW COLUMNS FROM jobs;
SHOW COLUMNS FROM `user`;
