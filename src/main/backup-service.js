const fs = require('fs');
const path = require('path');
const { app, dialog, shell } = require('electron');
const { getDatabase, getDatabasePath, getDataHealth, SCHEMA_VERSION } = require('./db');
const { recordAppOpen } = require('./journey-service');
const { applyStartWithWindowsSetting } = require('./startup');

const BACKUP_VERSION = 1;
const BACKUP_TABLES = [
  'app_meta',
  'tasks',
  'subtasks',
  'daily_notes',
  'timers',
  'timer_sessions',
  'app_settings',
  'recurring_completions',
  'daily_schedule',
  'activity_logs',
  'traveler_profile',
  'tracked_days',
  'daily_task_expectations',
  'app_open_logs'
];
const RESTORE_DELETE_ORDER = [...BACKUP_TABLES].reverse();

function backupFilename(date = new Date()) {
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `frodigy-productivity-backup-${localDate}.json`;
}

function getStorageLocations() {
  const userDataPath = app.getPath('userData');
  return {
    databasePath: getDatabasePath(),
    userDataPath,
    backupPath: path.join(userDataPath, 'backups')
  };
}

function createBackupPayload(db = getDatabase()) {
  const tables = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return {
    appName: 'Frodigy',
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Backup must contain a JSON object.' };
  }
  if (payload.appName !== 'Frodigy') {
    return { ok: false, error: 'This file is not a Frodigy backup.' };
  }
  if (payload.backupVersion !== BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version: ${payload.backupVersion}.` };
  }
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1 || payload.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported data schema version: ${payload.schemaVersion}.` };
  }
  if (!payload.tables || typeof payload.tables !== 'object') {
    return { ok: false, error: 'Backup is missing its data tables.' };
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(payload.tables[table])) {
      return { ok: false, error: `Backup table "${table}" is missing or invalid.` };
    }
  }
  return { ok: true };
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
  return filePath;
}

function createLocalBackup(label = 'manual') {
  const { backupPath } = getStorageLocations();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupPath, `frodigy-${label}-${timestamp}.json`);
  writeJsonAtomic(filePath, createBackupPayload());
  return { success: true, filePath };
}

async function exportBackup() {
  const result = await dialog.showSaveDialog({
    title: 'Export Frodigy Backup',
    defaultPath: backupFilename(),
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }
  writeJsonAtomic(result.filePath, createBackupPayload());
  return { success: true, filePath: result.filePath };
}

function insertRows(db, table, rows) {
  if (!rows.length) {
    return;
  }
  const columns = Object.keys(rows[0]);
  const allowedColumns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  if (!columns.length || columns.some((column) => !allowedColumns.has(column))) {
    throw new Error(`Backup table "${table}" contains unsupported columns.`);
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some((column) => !allowedColumns.has(column))) {
      throw new Error(`Backup table "${table}" contains an invalid row.`);
    }
  }
  const placeholders = columns.map(() => '?').join(', ');
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  );
  for (const row of rows) {
    statement.run(...columns.map((column) => row[column]));
  }
}

function restoreBackupPayload(payload, db = getDatabase()) {
  const validation = validateBackupPayload(payload);
  if (!validation.ok) {
    return validation;
  }

  try {
    const restore = db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      for (const table of RESTORE_DELETE_ORDER) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of BACKUP_TABLES) {
        insertRows(db, table, payload.tables[table]);
      }
      db.prepare(
        `INSERT OR IGNORE INTO traveler_profile (id, preferred_name, date_of_birth, updated_at)
         VALUES (1, 'Friend', NULL, ?)`
      ).run(new Date().toISOString());
      db.prepare(
        `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(String(SCHEMA_VERSION));
    });
    restore();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Backup restore failed: ${error.message}` };
  }
}

async function importBackup() {
  const selection = await dialog.showOpenDialog({
    title: 'Import Frodigy Backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (selection.canceled || !selection.filePaths[0]) {
    return { success: false, canceled: true };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(selection.filePaths[0], 'utf8'));
  } catch (error) {
    return { success: false, error: `Unable to read backup: ${error.message}` };
  }

  const validation = validateBackupPayload(payload);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    title: 'Replace local Frodigy data?',
    message: 'Restoring this backup will replace all current Frodigy data.',
    detail: 'A safety backup of the current data will be created automatically before replacement.',
    buttons: ['Cancel', 'Replace Data'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) {
    return { success: false, canceled: true };
  }

  const safetyBackup = createLocalBackup('pre-restore-safety');
  const restored = restoreBackupPayload(payload);
  if (!restored.ok) {
    return { success: false, error: restored.error };
  }
  recordAppOpen();
  const startWithWindows = getDatabase().prepare('SELECT value FROM app_settings WHERE key = ?').get('start_with_windows');
  applyStartWithWindowsSetting(startWithWindows?.value === 'true');
  return { success: true, safetyBackupPath: safetyBackup.filePath };
}

function openStorageLocation(kind) {
  const locations = getStorageLocations();
  const target = kind === 'backups' ? locations.backupPath : locations.userDataPath;
  fs.mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return { success: true, path: target };
}

module.exports = {
  BACKUP_TABLES,
  BACKUP_VERSION,
  backupFilename,
  createBackupPayload,
  createLocalBackup,
  exportBackup,
  getDataHealth,
  getStorageLocations,
  importBackup,
  openStorageLocation,
  restoreBackupPayload,
  validateBackupPayload,
  writeJsonAtomic
};
