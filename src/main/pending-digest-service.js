const DEFAULT_PENDING_DIGEST_ENABLED = 'true';
const DEFAULT_PENDING_DIGEST_TIME = '10:00';
const PENDING_DIGEST_ENABLED_KEY = 'pending_digest_enabled';
const PENDING_DIGEST_TIME_KEY = 'pending_digest_time';
const PENDING_DIGEST_LAST_PROCESSED_KEY = 'pending_digest_last_processed_date';

function nowISO() {
  return new Date().toISOString();
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLocalTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return (hour * 60) + minute;
}

function normalizeDigestTime(value) {
  const input = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(input) ? input : DEFAULT_PENDING_DIGEST_TIME;
}

function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), nowISO());
}

function getPendingDigestSettings(db) {
  return {
    enabled: getSetting(db, PENDING_DIGEST_ENABLED_KEY, DEFAULT_PENDING_DIGEST_ENABLED) !== 'false',
    time: normalizeDigestTime(getSetting(db, PENDING_DIGEST_TIME_KEY, DEFAULT_PENDING_DIGEST_TIME))
  };
}

function countPendingOneTimeProjects(db) {
  return db.prepare(
    `SELECT COUNT(*) AS count
     FROM tasks
     WHERE type = 'one_time'
       AND is_completed = 0
       AND archived_at IS NULL`
  ).get().count;
}

function processPendingProjectDigest(db, currentDate = new Date(), notify = () => {}) {
  const settings = getPendingDigestSettings(db);
  if (!settings.enabled) {
    return { sent: false, reason: 'disabled', count: 0, settings };
  }

  if (timeToMinutes(formatLocalTime(currentDate)) < timeToMinutes(settings.time)) {
    return { sent: false, reason: 'not-due', count: 0, settings };
  }

  const today = formatLocalDate(currentDate);
  const lastProcessed = getSetting(db, PENDING_DIGEST_LAST_PROCESSED_KEY, '');
  if (lastProcessed === today) {
    return { sent: false, reason: 'already-processed', count: 0, settings };
  }

  const count = countPendingOneTimeProjects(db);
  setSetting(db, PENDING_DIGEST_LAST_PROCESSED_KEY, today);
  if (count <= 0) {
    return { sent: false, reason: 'empty', count, settings };
  }

  notify(count);
  return { sent: true, reason: 'sent', count, settings };
}

module.exports = {
  DEFAULT_PENDING_DIGEST_ENABLED,
  DEFAULT_PENDING_DIGEST_TIME,
  PENDING_DIGEST_ENABLED_KEY,
  PENDING_DIGEST_TIME_KEY,
  PENDING_DIGEST_LAST_PROCESSED_KEY,
  countPendingOneTimeProjects,
  formatLocalDate,
  getPendingDigestSettings,
  normalizeDigestTime,
  processPendingProjectDigest
};
