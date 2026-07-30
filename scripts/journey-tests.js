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
  getDashboardData,
  isRecurringTaskDue,
  recordAppOpen,
  toggleRecurringTask,
  updateProfile,
  updateProfileAvatar,
  validateProfile
} = require('../src/main/journey-service');
const {
  createBackupPayload,
  restoreBackupPayload,
  validateBackupPayload
} = require('../src/main/backup-service');
const {
  getPendingDigestSettings,
  processPendingProjectDigest
} = require('../src/main/pending-digest-service');

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

  const profileResult = updateProfile({ preferredName: 'David  Sharma', dateOfBirth: '2000-02-29' }, db);
  assert.strictEqual(profileResult.ok, true, 'Valid personal profile should save.');
  assert.strictEqual(profileResult.profile.preferredName, 'David Sharma', 'Profile names should collapse extra spacing.');
  const avatarPath = path.join(testDirectory, 'avatar.png');
  fs.writeFileSync(avatarPath, 'avatar image placeholder', 'utf8');
  const avatarResult = updateProfileAvatar(avatarPath, db);
  assert.strictEqual(avatarResult.ok, true, 'Profile avatar path should save.');
  assert.strictEqual(db.prepare('SELECT avatar_path FROM traveler_profile WHERE id = 1').get().avatar_path, avatarPath, 'Profile avatar path should persist in the database.');

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
  const restoredProfile = db.prepare('SELECT preferred_name, avatar_path FROM traveler_profile WHERE id = 1').get();
  assert.strictEqual(restoredProfile.preferred_name, 'David Sharma', 'Restore should replace current data.');
  assert.strictEqual(restoredProfile.avatar_path, avatarPath, 'Restore should preserve the profile avatar path.');

  const digestSettings = getPendingDigestSettings(db);
  assert.strictEqual(digestSettings.enabled, true, 'Pending project digest should default to enabled.');
  assert.strictEqual(digestSettings.time, '10:00', 'Pending project digest should default to 10:00.');
  const digestBeforeTime = processPendingProjectDigest(db, new Date(2026, 5, 17, 9, 59), () => {
    throw new Error('Digest should not send before the configured time.');
  });
  assert.strictEqual(digestBeforeTime.sent, false, 'Digest should not send before the configured time.');

  const pendingCreatedAt = new Date(2026, 5, 17, 8, 0).toISOString();
  db.prepare(
    `INSERT INTO tasks (title, type, created_at, created_date, is_completed)
     VALUES ('Pending A', 'one_time', ?, '2026-06-17', 0),
            ('Pending B', 'one_time', ?, '2026-06-17', 0)`
  ).run(pendingCreatedAt, pendingCreatedAt);
  const sentDigests = [];
  const digestAtTime = processPendingProjectDigest(db, new Date(2026, 5, 17, 10, 0), (count) => sentDigests.push(count));
  assert.strictEqual(digestAtTime.sent, true, 'Digest should send after the configured time.');
  assert.strictEqual(digestAtTime.count, 2, 'Digest should count all pending one-time projects.');
  assert.deepStrictEqual(sentDigests, [2], 'Digest should notify with the pending project count.');
  const duplicateDigest = processPendingProjectDigest(db, new Date(2026, 5, 17, 10, 30), (count) => sentDigests.push(count));
  assert.strictEqual(duplicateDigest.sent, false, 'Digest should only process once per local day.');
  assert.deepStrictEqual(sentDigests, [2], 'Duplicate digest should not notify again.');

  db.prepare("UPDATE tasks SET is_completed = 1 WHERE title IN ('Pending A', 'Pending B')").run();
  const emptyDigest = processPendingProjectDigest(db, new Date(2026, 5, 18, 10, 0), (count) => sentDigests.push(count));
  assert.strictEqual(emptyDigest.sent, false, 'Digest should not send when there are no pending one-time projects.');
  assert.strictEqual(emptyDigest.count, 0, 'Empty digest should report zero pending projects.');

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('pending_digest_enabled', 'false', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(new Date().toISOString());
  const disabledDigest = processPendingProjectDigest(db, new Date(2026, 5, 19, 10, 0), (count) => sentDigests.push(count));
  assert.strictEqual(disabledDigest.sent, false, 'Disabled digest should not send notifications.');

  const dashboardToday = '2026-06-17';
  const dashboardMonth = '2026-06-%';
  const dashboardTimestamp = '2026-06-17T08:00:00.000Z';
  db.prepare('UPDATE tasks SET archived_at = ? WHERE archived_at IS NULL').run(dashboardTimestamp);
  db.prepare('DELETE FROM daily_task_expectations WHERE activity_date LIKE ?').run(dashboardMonth);
  db.prepare('DELETE FROM recurring_completions WHERE completion_date LIKE ?').run(dashboardMonth);
  db.prepare('DELETE FROM app_open_logs WHERE open_date LIKE ?').run(dashboardMonth);

  const insertOpen = db.prepare(
    `INSERT INTO app_open_logs (open_date, open_count, first_open_at, last_open_at)
     VALUES (?, 1, ?, ?)`
  );
  for (const openDate of ['2026-06-10', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17']) {
    insertOpen.run(openDate, `${openDate}T08:00:00.000Z`, `${openDate}T08:00:00.000Z`);
  }

  const insertRecurring = db.prepare(
    `INSERT INTO tasks (title, type, recurrence_rule, due_date, created_at, created_date, is_completed)
     VALUES (?, 'recurring', '1', '2026-06-01', ?, '2026-06-01', 0)`
  );
  const routineA = insertRecurring.run('Dashboard routine A', dashboardTimestamp).lastInsertRowid;
  const routineB = insertRecurring.run('Dashboard routine B', dashboardTimestamp).lastInsertRowid;
  const insertExpectation = db.prepare(
    `INSERT INTO daily_task_expectations (activity_date, task_id, task_title)
     VALUES (?, ?, ?)`
  );
  const insertRecurringCompletion = db.prepare(
    `INSERT INTO recurring_completions (task_id, completion_date, completed_at, task_title)
     VALUES (?, ?, ?, ?)`
  );
  for (const [activityDate, taskId, title] of [
    ['2026-06-15', routineA, 'Dashboard routine A'],
    ['2026-06-15', routineB, 'Dashboard routine B'],
    ['2026-06-16', routineA, 'Dashboard routine A'],
    ['2026-06-16', routineB, 'Dashboard routine B']
  ]) {
    insertExpectation.run(activityDate, taskId, title);
  }
  for (const [activityDate, taskId, title] of [
    ['2026-06-15', routineA, 'Dashboard routine A'],
    ['2026-06-15', routineB, 'Dashboard routine B'],
    ['2026-06-16', routineA, 'Dashboard routine A'],
    ['2026-06-17', routineA, 'Dashboard routine A']
  ]) {
    insertRecurringCompletion.run(taskId, activityDate, `${activityDate}T12:00:00.000Z`, title);
  }

  const insertProject = db.prepare(
    `INSERT INTO tasks (title, type, due_date, created_at, created_date, is_completed)
     VALUES (?, 'one_time', ?, ?, '2026-06-01', ?)`
  );
  insertProject.run('Due soon project', '2026-06-20', dashboardTimestamp, 0);
  insertProject.run('Late month project', '2026-06-30', dashboardTimestamp, 0);
  insertProject.run('Overdue project', '2026-06-10', dashboardTimestamp, 0);
  insertProject.run('Next month project', '2026-07-01', dashboardTimestamp, 0);
  insertProject.run('Completed month project', '2026-06-22', dashboardTimestamp, 1);

  const dashboardData = getDashboardData(db, dashboardToday);
  assert.strictEqual(dashboardData.summary.completedRecurring, 1, 'Dashboard should count completed recurring tasks for today.');
  assert.strictEqual(dashboardData.summary.expectedRecurring, 2, 'Dashboard should count due recurring tasks for today.');
  assert.strictEqual(dashboardData.summary.remainingRecurring, 1, 'Dashboard should expose remaining daily tasks.');
  assert.strictEqual(dashboardData.summary.recurringCompletionPercent, 50, 'Dashboard should expose daily completion percentage.');
  assert.strictEqual(dashboardData.summary.loginStreakDays, 4, 'Login streak should count consecutive local open days ending today.');
  assert.strictEqual(dashboardData.summary.loginDaysThisMonth, 5, 'Login days should count unique app-open days inside the current month.');
  assert.strictEqual(dashboardData.summary.perfectDaysThisMonth, 1, 'Perfect days should count current-month days where all expected recurring tasks were completed.');
  assert.strictEqual(dashboardData.summary.pendingProjectsDueThisMonth, 3, 'Pending this month should count incomplete one-time projects due this month.');
  assert.strictEqual(dashboardData.summary.overdueProjects, 1, 'Overdue should count incomplete one-time projects due before today.');
  assert.strictEqual(dashboardData.summary.projectsDueSoon, 1, 'Due soon should count incomplete one-time projects due within the next seven days.');

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
