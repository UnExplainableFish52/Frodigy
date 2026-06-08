const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;
let databasePath = null;
let dataHealth = {
  status: 'ok',
  message: 'Local data is healthy.',
  quarantinedPath: null
};

const SCHEMA_VERSION = 2;

function initializeDatabase(userDataPath) {
  if (db) {
    return db;
  }

  databasePath = path.join(userDataPath, 'frodigy.sqlite');

  try {
    db = new Database(databasePath);
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${integrity}`);
    }
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch (_closeError) {
        // Continue with recovery even if the damaged handle cannot close cleanly.
      }
      db = null;
    }

    const quarantinedPath = quarantineDatabase(databasePath);
    dataHealth = {
      status: 'recovered',
      message: 'The local database was damaged. Frodigy created a fresh database and preserved the damaged files for recovery.',
      quarantinedPath
    };
    db = new Database(databasePath);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('one_time', 'recurring')),
      recurrence_rule TEXT,
      due_date TEXT,
      reminder_at TEXT,
      reminder_completed_at TEXT,
      reminder_last_notified_at TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_notes (
      note_date TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      remaining_seconds INTEGER,
      state TEXT NOT NULL CHECK (state IN ('idle', 'running', 'paused', 'completed')),
      started_at TEXT,
      ends_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timer_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timer_name TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_completions (
      task_id INTEGER NOT NULL,
      completion_date TEXT NOT NULL,
      PRIMARY KEY (task_id, completion_date),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_date TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      progress_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traveler_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      preferred_name TEXT NOT NULL DEFAULT 'Friend',
      date_of_birth TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracked_days (
      activity_date TEXT PRIMARY KEY,
      life_day_number INTEGER,
      first_activity_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_task_expectations (
      activity_date TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      task_title TEXT NOT NULL,
      PRIMARY KEY (activity_date, task_id)
    );

    CREATE TABLE IF NOT EXISTS app_open_logs (
      open_date TEXT PRIMARY KEY,
      open_count INTEGER NOT NULL DEFAULT 0,
      first_open_at TEXT NOT NULL,
      last_open_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, 'tasks', 'due_date', 'TEXT');
  ensureColumn(db, 'tasks', 'reminder_at', 'TEXT');
  ensureColumn(db, 'tasks', 'reminder_completed_at', 'TEXT');
  ensureColumn(db, 'tasks', 'reminder_last_notified_at', 'TEXT');
  ensureColumn(db, 'tasks', 'created_date', 'TEXT');
  ensureColumn(db, 'tasks', 'completed_date', 'TEXT');
  ensureColumn(db, 'tasks', 'completion_days', 'INTEGER');
  ensureColumn(db, 'tasks', 'archived_at', 'TEXT');
  ensureColumn(db, 'timers', 'remaining_seconds', 'INTEGER');
  ensureColumn(db, 'recurring_completions', 'completed_at', 'TEXT');
  ensureColumn(db, 'recurring_completions', 'task_title', 'TEXT');

  db.prepare('UPDATE timers SET remaining_seconds = duration_seconds WHERE remaining_seconds IS NULL').run();
  db.prepare('UPDATE tasks SET created_date = substr(created_at, 1, 10) WHERE created_date IS NULL').run();
  db.prepare('UPDATE tasks SET completed_date = substr(completed_at, 1, 10) WHERE completed_at IS NOT NULL AND completed_date IS NULL').run();
  db.prepare(
    `UPDATE tasks
     SET completion_days = MAX(0, CAST(julianday(completed_date) - julianday(created_date) AS INTEGER))
     WHERE completed_date IS NOT NULL AND created_date IS NOT NULL AND completion_days IS NULL`
  ).run();
  db.prepare(
    `UPDATE recurring_completions
     SET task_title = COALESCE((SELECT title FROM tasks WHERE tasks.id = recurring_completions.task_id), 'Archived routine')
     WHERE task_title IS NULL`
  ).run();
  db.prepare(
    `UPDATE recurring_completions
     SET completed_at = completion_date || 'T12:00:00.000Z'
     WHERE completed_at IS NULL`
  ).run();

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO traveler_profile (id, preferred_name, date_of_birth, updated_at)
     VALUES (1, 'Friend', NULL, ?)`
  ).run(now);
  db.prepare("UPDATE traveler_profile SET preferred_name = 'Friend' WHERE preferred_name = 'Traveler'").run();
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(SCHEMA_VERSION));

  return db;
}

function quarantineDatabase(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantineBase = `${filePath}.corrupt-${timestamp}`;
  let preserved = null;

  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${filePath}${suffix}`;
    if (!fs.existsSync(source)) {
      continue;
    }

    const target = `${quarantineBase}${suffix}`;
    fs.renameSync(source, target);
    if (!suffix) {
      preserved = target;
    }
  }

  return preserved;
}

function ensureColumn(database, tableName, columnName, columnDefinition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some(column => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

function getDatabase() {
  if (!db) {
    throw new Error('Database has not been initialized yet.');
  }

  return db;
}

function getDatabasePath() {
  return databasePath;
}

function getDataHealth() {
  return { ...dataHealth };
}

function closeDatabase() {
  if (!db) {
    return;
  }
  db.close();
  db = null;
}

module.exports = {
  SCHEMA_VERSION,
  closeDatabase,
  initializeDatabase,
  getDatabase,
  getDatabasePath,
  getDataHealth
};
