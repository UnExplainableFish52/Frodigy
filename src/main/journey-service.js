const { getDatabase } = require('./db');

const MS_PER_DAY = 86400000;

function nowISO() {
  return new Date().toISOString();
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) {
    return null;
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function calendarDayDifference(fromDateString, toDateString) {
  const from = parseLocalDate(fromDateString);
  const to = parseLocalDate(toDateString);
  if (!from || !to) {
    return null;
  }

  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toUtc - fromUtc) / MS_PER_DAY);
}

function calculateLifeDay(dateOfBirth, dateString = formatLocalDate()) {
  const difference = calendarDayDifference(dateOfBirth, dateString);
  if (difference === null || difference < 0) {
    return null;
  }
  return difference + 1;
}

function isRecurringTaskDue(task, dateString) {
  if (!task || task.type !== 'recurring') {
    return false;
  }

  const startDate = task.due_date || task.created_date || String(task.created_at || '').slice(0, 10);
  const difference = calendarDayDifference(startDate, dateString);
  if (difference === null || difference < 0) {
    return false;
  }

  const interval = Math.max(1, Number.parseInt(task.recurrence_rule, 10) || 1);
  return difference % interval === 0;
}

function getProfile(db = getDatabase()) {
  return db.prepare('SELECT preferred_name, date_of_birth, avatar_path, updated_at FROM traveler_profile WHERE id = 1').get()
    || { preferred_name: 'Friend', date_of_birth: null, avatar_path: null, updated_at: null };
}

function validateProfile(profile, today = formatLocalDate()) {
  const preferredName = String(profile?.preferredName || '').trim().replace(/\s+/g, ' ');
  const dateOfBirth = String(profile?.dateOfBirth || '').trim();

  if (!preferredName) {
    return { ok: false, error: 'Full name or display name is required.' };
  }
  if (preferredName.length > 80) {
    return { ok: false, error: 'Name must be 80 characters or fewer.' };
  }
  if (dateOfBirth) {
    if (!parseLocalDate(dateOfBirth)) {
      return { ok: false, error: 'Enter a valid date of birth.' };
    }
    if (calendarDayDifference(dateOfBirth, today) < 0) {
      return { ok: false, error: 'Date of birth cannot be in the future.' };
    }
  }

  return { ok: true, preferredName, dateOfBirth: dateOfBirth || null };
}

function updateProfile(profile, db = getDatabase()) {
  const validated = validateProfile(profile);
  if (!validated.ok) {
    return validated;
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE traveler_profile
       SET preferred_name = ?, date_of_birth = ?, updated_at = ?
       WHERE id = 1`
    ).run(validated.preferredName, validated.dateOfBirth, nowISO());

    const trackedDays = db.prepare('SELECT activity_date FROM tracked_days').all();
    const updateDay = db.prepare('UPDATE tracked_days SET life_day_number = ? WHERE activity_date = ?');
    for (const day of trackedDays) {
      updateDay.run(validated.dateOfBirth ? calculateLifeDay(validated.dateOfBirth, day.activity_date) : null, day.activity_date);
    }
  });
  transaction();

  return {
    ok: true,
    profile: {
      preferredName: validated.preferredName,
      dateOfBirth: validated.dateOfBirth,
      avatarPath: getProfile(db).avatar_path || null,
      lifeDayNumber: validated.dateOfBirth ? calculateLifeDay(validated.dateOfBirth) : null
    }
  };
}

function updateProfileAvatar(avatarPath, db = getDatabase()) {
  const normalizedAvatarPath = avatarPath ? String(avatarPath).trim() : null;
  db.prepare(
    `UPDATE traveler_profile
     SET avatar_path = ?, updated_at = ?
     WHERE id = 1`
  ).run(normalizedAvatarPath || null, nowISO());

  const profile = getProfile(db);
  return {
    ok: true,
    profile: {
      preferredName: profile.preferred_name,
      dateOfBirth: profile.date_of_birth,
      avatarPath: profile.avatar_path || null,
      lifeDayNumber: profile.date_of_birth ? calculateLifeDay(profile.date_of_birth) : null
    }
  };
}

function listDueRecurringTasks(dateString, db = getDatabase()) {
  const tasks = db.prepare(
    `SELECT * FROM tasks
     WHERE type = 'recurring' AND is_completed = 0 AND archived_at IS NULL
     ORDER BY created_at ASC`
  ).all();
  return tasks.filter((task) => isRecurringTaskDue(task, dateString));
}

function ensureTrackedDay(dateString = formatLocalDate(), db = getDatabase()) {
  const timestamp = nowISO();
  const profile = getProfile(db);
  const lifeDayNumber = profile.date_of_birth ? calculateLifeDay(profile.date_of_birth, dateString) : null;

  db.prepare(
    `INSERT INTO tracked_days (activity_date, life_day_number, first_activity_at, last_activity_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(activity_date) DO UPDATE SET
       life_day_number = excluded.life_day_number,
       last_activity_at = excluded.last_activity_at`
  ).run(dateString, lifeDayNumber, timestamp, timestamp);

  const insertExpected = db.prepare(
    `INSERT OR IGNORE INTO daily_task_expectations (activity_date, task_id, task_title)
     VALUES (?, ?, ?)`
  );
  for (const task of listDueRecurringTasks(dateString, db)) {
    insertExpected.run(dateString, task.id, task.title);
  }
}

function recordAppOpen(db = getDatabase()) {
  const today = formatLocalDate();
  const timestamp = nowISO();
  const transaction = db.transaction(() => {
    ensureTrackedDay(today, db);
    db.prepare(
      `INSERT INTO app_open_logs (open_date, open_count, first_open_at, last_open_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(open_date) DO UPDATE SET
         open_count = app_open_logs.open_count + 1,
         last_open_at = excluded.last_open_at`
    ).run(today, timestamp, timestamp);
  });
  transaction();
}

function getConsistencyStats(db = getDatabase(), today = formatLocalDate()) {
  const monthPrefix = `${today.slice(0, 7)}-%`;
  const openedThisMonthDays = db.prepare('SELECT COUNT(*) AS count FROM app_open_logs WHERE open_date LIKE ?').get(monthPrefix).count;
  return {
    totalOpens: db.prepare('SELECT COALESCE(SUM(open_count), 0) AS count FROM app_open_logs').get().count,
    openedThisMonthDays,
    openedToday: Boolean(db.prepare('SELECT 1 FROM app_open_logs WHERE open_date = ?').get(today)),
    loginDaysThisMonth: openedThisMonthDays,
    loginStreakDays: getLoginStreakDays(db, today)
  };
}

function addLocalDays(dateString, days) {
  const date = parseLocalDate(dateString);
  if (!date) {
    return dateString;
  }
  date.setDate(date.getDate() + Number(days || 0));
  return formatLocalDate(date);
}

function getLoginStreakDays(db = getDatabase(), today = formatLocalDate()) {
  const hasOpen = db.prepare('SELECT 1 FROM app_open_logs WHERE open_date = ?');
  const cursor = parseLocalDate(today);
  let streak = 0;

  while (cursor) {
    const dateString = formatLocalDate(cursor);
    if (!hasOpen.get(dateString)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getPerfectDaysThisMonth(db = getDatabase(), today = formatLocalDate()) {
  const monthPrefix = `${today.slice(0, 7)}-%`;
  return db.prepare(
    `SELECT COUNT(*) AS count FROM (
       SELECT e.activity_date,
              COUNT(*) AS expected_count,
              COUNT(rc.task_id) AS completed_count
       FROM daily_task_expectations e
       LEFT JOIN recurring_completions rc
         ON rc.task_id = e.task_id AND rc.completion_date = e.activity_date
       WHERE e.activity_date LIKE ?
       GROUP BY e.activity_date
       HAVING expected_count > 0 AND completed_count = expected_count
     )`
  ).get(monthPrefix).count;
}

function getProjectPressureStats(db = getDatabase(), today = formatLocalDate()) {
  const monthPrefix = `${today.slice(0, 7)}-%`;
  const dueSoonEnd = addLocalDays(today, 7);
  const baseWhere = "type = 'one_time' AND is_completed = 0 AND archived_at IS NULL AND due_date IS NOT NULL AND due_date != ''";

  return {
    pendingProjectsDueThisMonth: db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${baseWhere} AND due_date LIKE ?`).get(monthPrefix).count,
    overdueProjects: db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${baseWhere} AND due_date < ?`).get(today).count,
    projectsDueSoon: db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${baseWhere} AND due_date >= ? AND due_date <= ?`).get(today, dueSoonEnd).count
  };
}

function getDashboardData(db = getDatabase(), today = formatLocalDate()) {
  ensureTrackedDay(today, db);

  const profile = getProfile(db);
  const recurring = listDueRecurringTasks(today, db).map((task) => ({
    ...task,
    completed_today: Boolean(db.prepare(
      'SELECT 1 FROM recurring_completions WHERE task_id = ? AND completion_date = ?'
    ).get(task.id, today))
  }));
  const projects = db.prepare(
    `SELECT * FROM tasks
     WHERE type = 'one_time' AND is_completed = 0 AND archived_at IS NULL
     ORDER BY created_at ASC`
  ).all();
  const completedRecurring = recurring.filter((task) => task.completed_today).length;
  const projectsCompletedToday = db.prepare(
    `SELECT COUNT(*) AS count FROM tasks
     WHERE type = 'one_time' AND is_completed = 1 AND completed_date = ? AND archived_at IS NULL`
  ).get(today).count;
  const remainingRecurring = Math.max(0, recurring.length - completedRecurring);
  const recurringCompletionPercent = recurring.length ? Math.round((completedRecurring / recurring.length) * 100) : 0;

  return {
    date: today,
    profile: {
      preferredName: profile.preferred_name,
      dateOfBirth: profile.date_of_birth,
      avatarPath: profile.avatar_path || null,
      lifeDayNumber: profile.date_of_birth ? calculateLifeDay(profile.date_of_birth, today) : null
    },
    recurring,
    projects,
    summary: {
      completedRecurring,
      expectedRecurring: recurring.length,
      remainingRecurring,
      recurringCompletionPercent,
      projectsCompletedToday,
      perfectDaysThisMonth: getPerfectDaysThisMonth(db, today),
      ...getConsistencyStats(db, today),
      ...getProjectPressureStats(db, today)
    }
  };
}

function toggleRecurringTask({ taskId, date, completed }, db = getDatabase()) {
  const completionDate = parseLocalDate(date) ? date : formatLocalDate();
  const task = db.prepare(
    `SELECT * FROM tasks WHERE id = ? AND type = 'recurring' AND archived_at IS NULL`
  ).get(taskId);
  if (!task || !isRecurringTaskDue(task, completionDate)) {
    return { success: false, error: 'Routine is not available for this date.' };
  }

  const transaction = db.transaction(() => {
    ensureTrackedDay(completionDate, db);
    db.prepare(
      `INSERT OR IGNORE INTO daily_task_expectations (activity_date, task_id, task_title)
       VALUES (?, ?, ?)`
    ).run(completionDate, task.id, task.title);

    if (completed) {
      db.prepare(
        `INSERT INTO recurring_completions (task_id, completion_date, completed_at, task_title)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id, completion_date) DO UPDATE SET
           completed_at = excluded.completed_at,
           task_title = excluded.task_title`
      ).run(task.id, completionDate, nowISO(), task.title);
    } else {
      db.prepare(
        'DELETE FROM recurring_completions WHERE task_id = ? AND completion_date = ?'
      ).run(task.id, completionDate);
    }
  });
  transaction();
  return { success: true };
}

function completeProject(taskId, db = getDatabase()) {
  const task = db.prepare(
    `SELECT * FROM tasks WHERE id = ? AND type = 'one_time' AND is_completed = 0 AND archived_at IS NULL`
  ).get(taskId);
  if (!task) {
    return { success: false, error: 'Project was not found or is already completed.' };
  }

  const completedDate = formatLocalDate();
  const createdDate = task.created_date || String(task.created_at).slice(0, 10);
  const completionDays = Math.max(0, calendarDayDifference(createdDate, completedDate) || 0);
  const timestamp = nowISO();
  const transaction = db.transaction(() => {
    ensureTrackedDay(completedDate, db);
    db.prepare(
      `UPDATE tasks
       SET is_completed = 1,
           completed_at = ?,
           completed_date = ?,
           completion_days = ?,
           reminder_completed_at = ?
       WHERE id = ?`
    ).run(timestamp, completedDate, completionDays, timestamp, taskId);
  });
  transaction();
  return { success: true, completedDate, completionDays };
}

function reopenProject(taskId, db = getDatabase()) {
  const result = db.prepare(
    `UPDATE tasks
     SET is_completed = 0,
         completed_at = NULL,
         completed_date = NULL,
         completion_days = NULL,
         reminder_completed_at = NULL,
         reminder_last_notified_at = NULL
     WHERE id = ? AND type = 'one_time' AND archived_at IS NULL`
  ).run(taskId);
  return result.changes ? { success: true } : { success: false, error: 'Project was not found.' };
}

function archiveTask(taskId, db = getDatabase()) {
  const result = db.prepare('UPDATE tasks SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(nowISO(), taskId);
  return { success: Boolean(result.changes) };
}

function listCompletedProjects({ limit = 50, offset = 0 } = {}, db = getDatabase()) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const items = db.prepare(
    `SELECT * FROM tasks
     WHERE type = 'one_time' AND is_completed = 1 AND archived_at IS NULL
     ORDER BY completed_at DESC
     LIMIT ? OFFSET ?`
  ).all(safeLimit, safeOffset);
  const total = db.prepare(
    `SELECT COUNT(*) AS count FROM tasks
     WHERE type = 'one_time' AND is_completed = 1 AND archived_at IS NULL`
  ).get().count;
  return { items, total };
}

function getDailyHistory({ query = '', page = 1, pageSize = 10 } = {}, db = getDatabase()) {
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const safePage = Math.max(1, Number(page) || 1);
  const normalizedQuery = String(query || '').trim();
  const numericQuery = /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : -1;
  const where = normalizedQuery
    ? 'WHERE td.activity_date LIKE ? OR td.life_day_number = ?'
    : '';
  const params = normalizedQuery ? [`%${normalizedQuery}%`, numericQuery] : [];
  const total = db.prepare(`SELECT COUNT(*) AS count FROM tracked_days td ${where}`).get(...params).count;
  const days = db.prepare(
    `SELECT td.*,
       (SELECT COUNT(*) FROM daily_task_expectations e WHERE e.activity_date = td.activity_date) AS expected_count,
       (SELECT COUNT(*)
        FROM recurring_completions rc
        JOIN daily_task_expectations e ON e.task_id = rc.task_id AND e.activity_date = rc.completion_date
        WHERE rc.completion_date = td.activity_date) AS completed_count
     FROM tracked_days td
     ${where}
     ORDER BY td.activity_date DESC
     LIMIT ? OFFSET ?`
  ).all(...params, safePageSize, (safePage - 1) * safePageSize);

  const expectationQuery = db.prepare(
    `SELECT e.task_id, e.task_title,
       CASE WHEN rc.task_id IS NULL THEN 0 ELSE 1 END AS completed
     FROM daily_task_expectations e
     LEFT JOIN recurring_completions rc
       ON rc.task_id = e.task_id AND rc.completion_date = e.activity_date
     WHERE e.activity_date = ?
     ORDER BY e.task_title COLLATE NOCASE`
  );

  return {
    items: days.map((day) => ({
      ...day,
      full_completion: day.expected_count > 0 && day.completed_count === day.expected_count,
      tasks: expectationQuery.all(day.activity_date)
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize))
  };
}

module.exports = {
  archiveTask,
  calculateLifeDay,
  calendarDayDifference,
  completeProject,
  ensureTrackedDay,
  formatLocalDate,
  getConsistencyStats,
  getDailyHistory,
  getDashboardData,
  getLoginStreakDays,
  getPerfectDaysThisMonth,
  getProjectPressureStats,
  getProfile,
  isRecurringTaskDue,
  listCompletedProjects,
  parseLocalDate,
  recordAppOpen,
  reopenProject,
  toggleRecurringTask,
  updateProfile,
  updateProfileAvatar,
  validateProfile
};
