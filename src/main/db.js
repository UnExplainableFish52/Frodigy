const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function initializeDatabase(userDataPath) {
  if (db) {
    return db;
  }

  const databasePath = path.join(userDataPath, 'frodigy.sqlite');
  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('one_time', 'recurring')),
      recurrence_rule TEXT,
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
  `);

  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('Database has not been initialized yet.');
  }

  return db;
}

module.exports = {
  initializeDatabase,
  getDatabase
};
