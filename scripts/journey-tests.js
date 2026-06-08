const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { closeDatabase, initializeDatabase, getDataHealth } = require('../src/main/db');
const {
  calculateLifeDay,
  calendarDayDifference,
  completeProject,
  ensureTrackedDay,
  formatLocalDate,
  getConsistencyStats,
  getDailyHistory,
  isRecurringTaskDue,
  recordAppOpen,
  toggleRecurringTask,
  updateProfile,
  validateProfile
} = require('../src/main/journey-service');
const {
  createBackupPayload,
  restoreBackupPayload,
  validateBackupPayload
} = require('../src/main/backup-service');

const root = path.resolve(__dirname, '..');
const testDirectory = fs.mkdtempSync(path.join(root, '.journey-test-'));

try {
  fs.writeFileSync(path.join(testDirectory, 'frodigy.sqlite'), 'damaged sqlite data', 'utf8');
  const db = initializeDatabase(testDirectory);
  assert.strictEqual(getDataHealth().status, 'recovered', 'Corrupt databases should be quarantined and recreated.');
  assert.strictEqual(db.pragma('integrity_check', { simple: true }), 'ok', 'Recovered database must pass integrity check.');

  assert.strictEqual(calculateLifeDay('2000-02-29', '2000-02-29'), 1, 'Birth date must be Day 1.');
  assert.strictEqual(calculateLifeDay('2000-02-29', '2000-03-01'), 2, 'Leap-day life-day calculation must use calendar days.');
  assert.strictEqual(calendarDayDifference('2026-06-01', '2026-06-07'), 6, 'Project duration must use elapsed calendar days.');
  assert.strictEqual(validateProfile({ preferredName: 'Future', dateOfBirth: '2999-01-01' }).ok, false, 'Future birth dates must be rejected.');

  const profileResult = updateProfile({ preferredName: 'David', dateOfBirth: '2000-02-29' }, db);
  assert.strictEqual(profileResult.ok, true, 'Valid personal profile should save.');

  const today = formatLocalDate();
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const startDate = formatLocalDate(twoDaysAgo);
  const recurringResult = db.prepare(
    `INSERT INTO tasks (title, type, recurrence_rule, due_date, created_at, created_date, is_completed)
     VALUES ('Review notes', 'recurring', '2', ?, ?, ?, 0)`
  ).run(startDate, new Date().toISOString(), startDate);
  const recurringTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(recurringResult.lastInsertRowid);
  assert.strictEqual(isRecurringTaskDue(recurringTask, today), true, 'Every-two-days routine should be due two days after its start.');

  ensureTrackedDay(today, db);
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS count FROM daily_task_expectations WHERE activity_date = ?').get(today).count,
    1,
    'Tracked day should snapshot due routines.'
  );

  toggleRecurringTask({ taskId: recurringTask.id, date: today, completed: true }, db);
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS count FROM recurring_completions WHERE task_id = ? AND completion_date = ?').get(recurringTask.id, today).count,
    1,
    'Recurring completion should be stored for the selected date.'
  );
  toggleRecurringTask({ taskId: recurringTask.id, date: today, completed: false }, db);
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS count FROM recurring_completions WHERE task_id = ? AND completion_date = ?').get(recurringTask.id, today).count,
    0,
    'Recurring untoggle should remove only the selected date.'
  );

  recordAppOpen(db);
  recordAppOpen(db);
  const consistency = getConsistencyStats(db, today);
  assert.strictEqual(consistency.totalOpens, 2, 'Each primary-process start should increment total opens.');
  assert.strictEqual(consistency.openedThisMonthDays, 1, 'Multiple opens in one day should count as one unique monthly day.');
  assert.strictEqual(consistency.openedToday, true, 'Today should show as opened.');

  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  const createdDate = formatLocalDate(sixDaysAgo);
  const projectResult = db.prepare(
    `INSERT INTO tasks (title, type, created_at, created_date, is_completed)
     VALUES ('Build journey dashboard', 'one_time', ?, ?, 0)`
  ).run(sixDaysAgo.toISOString(), createdDate);
  const completion = completeProject(projectResult.lastInsertRowid, db);
  assert.strictEqual(completion.success, true, 'Project should complete.');
  assert.strictEqual(completion.completionDays, 6, 'Project duration should be persisted as elapsed calendar days.');

  const lifeDayNumber = calculateLifeDay('2000-02-29', today);
  const historyByDay = getDailyHistory({ query: String(lifeDayNumber) }, db);
  assert.strictEqual(historyByDay.total, 1, 'Daily history should be searchable by life-day number.');
  const historyByDate = getDailyHistory({ query: today }, db);
  assert.strictEqual(historyByDate.total, 1, 'Daily history should be searchable by ISO date.');

  const backup = createBackupPayload(db);
  assert.strictEqual(validateBackupPayload(backup).ok, true, 'Generated logical backup should validate.');
  assert.strictEqual(validateBackupPayload({ appName: 'Frodigy', backupVersion: 999, tables: {} }).ok, false, 'Unknown backup versions must be rejected.');
  const invalidColumnsBackup = JSON.parse(JSON.stringify(backup));
  invalidColumnsBackup.tables.traveler_profile[0].unsupported_column = 'blocked';
  assert.strictEqual(restoreBackupPayload(invalidColumnsBackup, db).ok, false, 'Restore should reject unsupported table columns.');

  db.prepare("UPDATE traveler_profile SET preferred_name = 'Changed' WHERE id = 1").run();
  assert.strictEqual(restoreBackupPayload(backup, db).ok, true, 'Valid backup should restore transactionally.');
  assert.strictEqual(db.prepare('SELECT preferred_name FROM traveler_profile WHERE id = 1').get().preferred_name, 'David', 'Restore should replace current data.');

  const freshPath = path.join(testDirectory, 'fresh.sqlite');
  const fresh = new Database(freshPath);
  fresh.exec('CREATE TABLE check_table (id INTEGER PRIMARY KEY)');
  assert.strictEqual(fresh.pragma('integrity_check', { simple: true }), 'ok', 'A missing database path should support fresh SQLite creation.');
  fresh.close();

  console.log('Journey data tests passed.');
} finally {
  closeDatabase();
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
