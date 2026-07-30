const { app, BrowserWindow, dialog, ipcMain, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pathToFileURL } = require('url');

const GITHUB_REPO = 'UnExplainableFish52/Frodigy';
const CURRENT_VERSION = require('../../package.json').version;
const { getDatabase } = require('./db');
const { applyStartWithWindowsSetting, getStartWithWindowsSetting } = require('./startup');
const {
  archiveTask,
  calculateLifeDay,
  completeProject,
  getConsistencyStats,
  getDailyHistory,
  getDashboardData,
  getProfile,
  listCompletedProjects,
  reopenProject,
  toggleRecurringTask,
  updateProfile,
  updateProfileAvatar
} = require('./journey-service');
const {
  createLocalBackup,
  exportBackup,
  getDataHealth,
  getStorageLocations,
  importBackup,
  openStorageLocation
} = require('./backup-service');
const { processPendingProjectDigest } = require('./pending-digest-service');

let timerNotifierInterval = null;
let pendingDigestInterval = null;
const APP_ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icons', 'icon.ico');
const PROFILE_AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_PROFILE_AVATAR_BYTES = 10 * 1024 * 1024;

function todayISO() {
  const today = new Date();
  return formatLocalDate(today);
}

function nowISO() {
  return new Date().toISOString();
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDayBounds(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function getProfileAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return null;
  }

  try {
    return fs.existsSync(avatarPath) ? pathToFileURL(avatarPath).href : null;
  } catch (_error) {
    return null;
  }
}

function serializeProfile(profile) {
  return {
    preferredName: profile.preferred_name,
    dateOfBirth: profile.date_of_birth,
    avatarPath: profile.avatar_path || null,
    avatarUrl: getProfileAvatarUrl(profile.avatar_path),
    lifeDayNumber: profile.date_of_birth ? calculateLifeDay(profile.date_of_birth) : null
  };
}

function profileAvatarDirectory() {
  return path.join(app.getPath('userData'), 'profile');
}

function cleanupProfileAvatarFiles(keepPath = null) {
  const avatarDirectory = profileAvatarDirectory();
  for (const extension of PROFILE_AVATAR_EXTENSIONS) {
    const candidate = path.join(avatarDirectory, `profile-avatar${extension}`);
    if (keepPath && path.resolve(candidate) === path.resolve(keepPath)) {
      continue;
    }
    try {
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    } catch (_error) {
      // A stale avatar file should not block the current profile update.
    }
  }
}

function copyProfileAvatar(sourcePath) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!PROFILE_AVATAR_EXTENSIONS.has(extension)) {
    return { success: false, error: 'Choose a PNG, JPG, WEBP, or GIF image.' };
  }

  let stats;
  try {
    stats = fs.statSync(sourcePath);
  } catch (error) {
    return { success: false, error: `Unable to read selected image: ${error.message}` };
  }

  if (!stats.isFile()) {
    return { success: false, error: 'Choose an image file, not a folder.' };
  }
  if (stats.size > MAX_PROFILE_AVATAR_BYTES) {
    return { success: false, error: 'Profile pictures must be 10 MB or smaller.' };
  }

  const avatarDirectory = profileAvatarDirectory();
  const normalizedExtension = extension === '.jpeg' ? '.jpg' : extension;
  const targetPath = path.join(avatarDirectory, `profile-avatar${normalizedExtension}`);

  try {
    fs.mkdirSync(avatarDirectory, { recursive: true });
    if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  } catch (error) {
    return { success: false, error: `Unable to save profile picture: ${error.message}` };
  }

  cleanupProfileAvatarFiles(targetPath);
  return { success: true, avatarPath: targetPath };
}

function notifyTimerFinished(timerName) {
  const notification = new Notification({
    title: 'Frodigy Timer',
    body: `"${timerName}" has finished!`,
    icon: APP_ICON_PATH,
    silent: false
  });
  notification.show();
}

function notifyPendingProjectDigest(count) {
  const notification = new Notification({
    title: 'Frodigy Projects',
    body: `You have ${count} pending projects. Open Frodigy, complete what you can, and mark finished work complete.`,
    icon: APP_ICON_PATH,
    silent: false
  });
  notification.show();
}

function broadcastTimerFinished(timer) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('timer:completed', {
        id: timer.id,
        name: timer.name
      });
    }
  }
}

function completeTimer(db, timer, shouldNotify) {
  if (!timer || timer.state === 'completed') {
    return false;
  }

  db.prepare(
    'UPDATE timers SET state = \'completed\', remaining_seconds = 0, started_at = NULL, ends_at = NULL, updated_at = ? WHERE id = ?'
  ).run(nowISO(), timer.id);

  db.prepare(
    'INSERT INTO timer_sessions (timer_name, duration_seconds, completed_at) VALUES (?, ?, ?)'
  ).run(timer.name, timer.duration_seconds, nowISO());

  if (shouldNotify) {
    notifyTimerFinished(timer.name);
    broadcastTimerFinished(timer);
  }

  return true;
}

function reconcileExpiredTimers(db, shouldNotify = false) {
  const expiredTimers = db.prepare(
    'SELECT * FROM timers WHERE state = \'running\' AND ends_at IS NOT NULL AND ends_at <= ?'
  ).all(nowISO());

  for (const timer of expiredTimers) {
    completeTimer(db, timer, shouldNotify);
  }
}

function startTimerNotifierLoop() {
  if (timerNotifierInterval) {
    return;
  }

  timerNotifierInterval = setInterval(() => {
    try {
      const db = getDatabase();
      reconcileExpiredTimers(db, true);
    } catch (err) {
      // Suppress timer checks until the database is available.
    }
  }, 1000);
}

function startPendingDigestLoop() {
  if (pendingDigestInterval) {
    return;
  }

  pendingDigestInterval = setInterval(() => {
    try {
      const db = getDatabase();
      processPendingProjectDigest(db, new Date(), notifyPendingProjectDigest);
    } catch (err) {
      // Suppress digest checks until the database is available.
    }
  }, 30000);
}

function registerAllHandlers() {
  startTimerNotifierLoop();
  startPendingDigestLoop();

  // ─── TASKS ───────────────────────────────────────────────

  ipcMain.handle('tasks:create', (_event, { title, type, recurrenceRule, dueDate, reminderAt }) => {
    const db = getDatabase();
    const stmt = db.prepare(
      `INSERT INTO tasks
        (title, type, recurrence_rule, due_date, reminder_at, created_at, created_date, is_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    );
    const timestamp = nowISO();
    const result = stmt.run(title, type, recurrenceRule || null, dueDate || null, reminderAt || null, timestamp, todayISO());
    return { id: result.lastInsertRowid, title, type, recurrenceRule, dueDate, reminderAt };
  });

  ipcMain.handle('tasks:list-today', () => {
    const db = getDatabase();
    const today = todayISO();

    // One-time tasks: not completed
    const oneTime = db.prepare(
      `SELECT t.*, 
        (SELECT json_group_array(json_object('id', s.id, 'title', s.title, 'is_completed', s.is_completed))
         FROM subtasks s WHERE s.task_id = t.id) AS subtasks_json
       FROM tasks t 
       WHERE t.type = 'one_time' AND t.is_completed = 0 AND t.archived_at IS NULL
       ORDER BY t.created_at ASC`
    ).all();

    // Recurring tasks: all active recurring, with max completion date
    const recurring = db.prepare(
      `SELECT t.*,
        (SELECT MAX(completion_date) FROM recurring_completions rc WHERE rc.task_id = t.id) AS last_completed
       FROM tasks t
       WHERE t.type = 'recurring' AND t.is_completed = 0 AND t.archived_at IS NULL
       ORDER BY t.created_at ASC`
    ).all();

    return {
      oneTime: oneTime.map(t => ({
        ...t,
        subtasks: t.subtasks_json ? JSON.parse(t.subtasks_json) : []
      })),
      recurring: recurring.map(t => ({
        ...t,
        subtasks: []
      }))
    };
  });

  ipcMain.handle('tasks:toggle-recurring', (_event, { taskId, completed }) => {
    return toggleRecurringTask({ taskId, date: todayISO(), completed });
  });

  ipcMain.handle('tasks:complete-onetime', (_event, { taskId }) => {
    return completeProject(taskId);
  });

  ipcMain.handle('tasks:delete', (_event, { taskId }) => {
    return archiveTask(taskId);
  });

  // ─── SUBTASKS ────────────────────────────────────────────

  ipcMain.handle('subtasks:add', (_event, { taskId, title }) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO subtasks (task_id, title, is_completed, created_at) VALUES (?, ?, 0, ?)'
    ).run(taskId, title, nowISO());
    return { id: result.lastInsertRowid, taskId, title, is_completed: 0 };
  });

  ipcMain.handle('subtasks:toggle', (_event, { subtaskId, completed }) => {
    const db = getDatabase();
    db.prepare('UPDATE subtasks SET is_completed = ? WHERE id = ?').run(completed ? 1 : 0, subtaskId);
    return { success: true };
  });

  ipcMain.handle('subtasks:delete', (_event, { subtaskId }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
    return { success: true };
  });

  // ─── COMPLETED TASKS ────────────────────────────────────

  ipcMain.handle('tasks:list-completed', () => {
    return listCompletedProjects({ limit: 100 }).items;
  });

  // ─── JOURNEY DASHBOARD & HISTORY ───────────────────────

  ipcMain.handle('journey:get-dashboard', () => getDashboardData());

  ipcMain.handle('journey:get-profile', () => {
    return serializeProfile(getProfile());
  });

  ipcMain.handle('journey:update-profile', (_event, profile) => {
    const result = updateProfile(profile);
    if (!result?.ok) {
      return result;
    }
    return { ...result, profile: serializeProfile(getProfile()) };
  });
  ipcMain.handle('journey:choose-profile-avatar', async () => {
    const selection = await dialog.showOpenDialog({
      title: 'Choose Profile Picture',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) {
      return { success: false, canceled: true };
    }

    const copied = copyProfileAvatar(selection.filePaths[0]);
    if (!copied.success) {
      return copied;
    }

    const updated = updateProfileAvatar(copied.avatarPath);
    if (!updated.ok) {
      return { success: false, error: updated.error || 'Unable to save profile picture.' };
    }

    return { success: true, profile: serializeProfile(getProfile()) };
  });
  ipcMain.handle('journey:clear-profile-avatar', () => {
    updateProfileAvatar(null);
    cleanupProfileAvatarFiles();
    return { success: true, profile: serializeProfile(getProfile()) };
  });
  ipcMain.handle('journey:get-history', (_event, payload) => getDailyHistory(payload || {}));
  ipcMain.handle('journey:get-consistency', () => getConsistencyStats());
  ipcMain.handle('journey:toggle-recurring', (_event, payload) => toggleRecurringTask(payload || {}));

  ipcMain.handle('projects:complete', (_event, { taskId }) => completeProject(taskId));
  ipcMain.handle('projects:reopen', (_event, { taskId }) => reopenProject(taskId));
  ipcMain.handle('projects:list-completed', (_event, payload) => listCompletedProjects(payload || {}));

  // ─── DATA MANAGEMENT ────────────────────────────────────

  ipcMain.handle('data:export-backup', () => exportBackup());
  ipcMain.handle('data:create-backup', () => createLocalBackup());
  ipcMain.handle('data:import-backup', () => importBackup());
  ipcMain.handle('data:get-locations', () => getStorageLocations());
  ipcMain.handle('data:open-folder', (_event, { kind }) => openStorageLocation(kind));
  ipcMain.handle('data:get-health', () => getDataHealth());

  // ─── DAILY NOTES ────────────────────────────────────────

  ipcMain.handle('notes:get-month', (_event, { year, month }) => {
    const db = getDatabase();
    const prefix = `${year}-${String(month).padStart(2, '0')}-%`;
    const rows = db.prepare('SELECT note_date FROM daily_notes WHERE note_date LIKE ? AND content != \'\'').all(prefix);
    return rows.map(r => r.note_date);
  });

  ipcMain.handle('notes:get', (_event, { date }) => {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM daily_notes WHERE note_date = ?').get(date);
    return row || { note_date: date, content: '', updated_at: null };
  });

  ipcMain.handle('notes:save', (_event, { date, content }) => {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO daily_notes (note_date, content, updated_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(note_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    ).run(date, content, nowISO());
    return { success: true };
  });

  // ─── TIMERS ─────────────────────────────────────────────

  ipcMain.handle('timers:create', (_event, { name, durationSeconds }) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO timers (name, duration_seconds, remaining_seconds, state, updated_at) VALUES (?, ?, ?, \'idle\', ?)'
    ).run(name, durationSeconds, durationSeconds, nowISO());
    return { id: result.lastInsertRowid, name, duration_seconds: durationSeconds, remaining_seconds: durationSeconds, state: 'idle' };
  });

  ipcMain.handle('timers:list', () => {
    const db = getDatabase();
    reconcileExpiredTimers(db, true);
    return db.prepare('SELECT * FROM timers ORDER BY id ASC').all();
  });

  ipcMain.handle('timers:update-state', (_event, { timerId, state, startedAt, endsAt, remainingSeconds }) => {
    const db = getDatabase();

    const timer = db.prepare('SELECT * FROM timers WHERE id = ?').get(timerId);
    if (!timer) {
      return { success: false, error: 'Timer not found' };
    }

    const normalizedRemaining = Number.isFinite(Number(remainingSeconds))
      ? Math.max(0, Math.ceil(Number(remainingSeconds)))
      : timer.remaining_seconds;

    if (state === 'completed') {
      completeTimer(db, timer, true);
      return { success: true };
    }

    db.prepare(
      'UPDATE timers SET state = ?, remaining_seconds = ?, started_at = ?, ends_at = ?, updated_at = ? WHERE id = ?'
    ).run(state, normalizedRemaining, startedAt || null, endsAt || null, nowISO(), timerId);

    return { success: true };
  });

  ipcMain.handle('timers:delete', (_event, { timerId }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM timers WHERE id = ?').run(timerId);
    return { success: true };
  });

  ipcMain.handle('timers:notify', (_event, { timerName }) => {
    notifyTimerFinished(timerName);
    return { success: true };
  });

  // ─── SETTINGS ───────────────────────────────────────────

  ipcMain.handle('settings:get', (_event, { key }) => {
    if (key === 'start_with_windows') {
      return String(getStartWithWindowsSetting());
    }

    const db = getDatabase();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : null;
  });

  ipcMain.handle('settings:get-all', () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM app_settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    settings.start_with_windows = String(getStartWithWindowsSetting());
    return settings;
  });

  ipcMain.handle('settings:set', (_event, { key, value }) => {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value, nowISO());

    // When start_with_windows is changed, immediately update the OS login items
    if (key === 'start_with_windows') {
      applyStartWithWindowsSetting(value === 'true');
    }

    return { success: true };
  });

  // ─── STATS SUMMARY ───────────────────────────────────────

  ipcMain.handle('stats:get-summary', () => {
    const db = getDatabase();
    const today = todayISO();
    const todayBounds = localDayBounds(today);
    
    // Tasks stats
    const oneTimeCompletedToday = db.prepare(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE type = 'one_time'
         AND is_completed = 1
         AND completed_at >= ?
         AND completed_at < ?`
    ).get(todayBounds.startIso, todayBounds.endIso).count;
    
    const recurringCompletedToday = db.prepare(
      'SELECT COUNT(*) as count FROM recurring_completions WHERE completion_date = ?'
    ).get(today).count;

    const allTimeTasksCount = db.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE type = \'one_time\' AND is_completed = 1'
    ).get().count + db.prepare(
      'SELECT COUNT(*) as count FROM recurring_completions'
    ).get().count;

    // Timer stats
    const timersTodayRow = db.prepare(
      `SELECT SUM(duration_seconds) as total
       FROM timer_sessions
       WHERE completed_at >= ? AND completed_at < ?`
    ).get(todayBounds.startIso, todayBounds.endIso);
    const timersTodaySeconds = timersTodayRow.total || 0;

    const timersAllTimeRow = db.prepare(
      'SELECT SUM(duration_seconds) as total FROM timer_sessions'
    ).get();
    const timersAllTimeSeconds = timersAllTimeRow.total || 0;

    const activitiesTodayRow = db.prepare(
      'SELECT COUNT(*) as count, SUM(duration_minutes) as totalMinutes FROM activity_logs WHERE activity_date = ?'
    ).get(today);

    const activitiesAllTimeRow = db.prepare(
      'SELECT COUNT(*) as count, SUM(duration_minutes) as totalMinutes FROM activity_logs'
    ).get();

    // Recent timer sessions
    const recentSessions = db.prepare(
      'SELECT * FROM timer_sessions ORDER BY completed_at DESC LIMIT 10'
    ).all();

    const recentActivities = db.prepare(
      'SELECT * FROM activity_logs ORDER BY activity_date DESC, created_at DESC LIMIT 10'
    ).all();

    const completedTasks = db.prepare(
      'SELECT title, completed_at FROM tasks WHERE type = \'one_time\' AND is_completed = 1 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 20'
    ).all();

    const recurringCompletions = db.prepare(
      `SELECT t.title, rc.completion_date
       FROM recurring_completions rc
       JOIN tasks t ON t.id = rc.task_id
       ORDER BY rc.completion_date DESC
       LIMIT 20`
    ).all();

    const timeline = [
      ...recentActivities.map(activity => ({
        type: 'activity',
        title: activity.title,
        occurredAt: activity.created_at,
        meta: `${activity.category} · ${activity.duration_minutes || 0}m`,
        note: activity.progress_note
      })),
      ...recentSessions.map(session => ({
        type: 'timer',
        title: session.timer_name,
        occurredAt: session.completed_at,
        meta: `${Math.round(session.duration_seconds / 60)}m focus`,
        note: ''
      })),
      ...completedTasks.map(task => ({
        type: 'task',
        title: task.title,
        occurredAt: task.completed_at,
        meta: 'One-time task completed',
        note: ''
      })),
      ...recurringCompletions.map(task => ({
        type: 'habit',
        title: task.title,
        occurredAt: `${task.completion_date}T12:00:00.000Z`,
        meta: 'Recurring task completed',
        note: ''
      }))
    ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 20);

    return {
      today: {
        tasksCompleted: oneTimeCompletedToday + recurringCompletedToday,
        timerSeconds: timersTodaySeconds,
        activitiesLogged: activitiesTodayRow.count || 0,
        activityMinutes: activitiesTodayRow.totalMinutes || 0
      },
      allTime: {
        tasksCompleted: allTimeTasksCount,
        timerSeconds: timersAllTimeSeconds,
        activitiesLogged: activitiesAllTimeRow.count || 0,
        activityMinutes: activitiesAllTimeRow.totalMinutes || 0
      },
      recentSessions,
      recentActivities,
      timeline
    };
  });

  // ─── ACTIVITY LOGS ───────────────────────────────────────

  ipcMain.handle('activities:create', (_event, { activityDate, title, category, durationMinutes, progressNote }) => {
    const db = getDatabase();
    const result = db.prepare(
      `INSERT INTO activity_logs
        (activity_date, title, category, duration_minutes, progress_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      activityDate || todayISO(),
      title,
      category || 'General',
      Math.max(0, Number(durationMinutes) || 0),
      progressNote || '',
      nowISO()
    );

    return { success: true, id: result.lastInsertRowid };
  });

  ipcMain.handle('activities:delete', (_event, { id }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM activity_logs WHERE id = ?').run(id);
    return { success: true };
  });

  // ─── APP CONTROLS ─────────────────────────────────────────
  ipcMain.handle('app:hide', (event) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.hide();
    }
    return { success: true };
  });
  // ─── SCHEDULE ───────────────────────────────────────────
  ipcMain.handle('schedule:create', (_event, { title, start_time, end_time }) => {
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO daily_schedule (title, start_time, end_time, created_at) VALUES (?, ?, ?, ?)'
    ).run(title, start_time, end_time, nowISO());
    return { id: result.lastInsertRowid, title, start_time, end_time };
  });

  ipcMain.handle('schedule:list', () => {
    const db = getDatabase();
    return db.prepare('SELECT * FROM daily_schedule ORDER BY start_time ASC').all();
  });

  ipcMain.handle('schedule:update', (_event, { id, title, start_time, end_time }) => {
    const db = getDatabase();
    db.prepare(
      'UPDATE daily_schedule SET title = ?, start_time = ?, end_time = ? WHERE id = ?'
    ).run(title, start_time, end_time, id);
    return db.prepare('SELECT * FROM daily_schedule WHERE id = ?').get(id);
  });

  ipcMain.handle('schedule:delete', (_event, { id }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM daily_schedule WHERE id = ?').run(id);
    return { success: true };
  });

  // Schedule Notifier Loop
  let lastNotifiedMinute = null;
  setInterval(() => {
    const nowLocal = new Date();
    const currentHMS = String(nowLocal.getHours()).padStart(2, '0') + ':' + String(nowLocal.getMinutes()).padStart(2, '0');
    if (currentHMS !== lastNotifiedMinute) {
      lastNotifiedMinute = currentHMS;
      try {
        const db = getDatabase();
        if (db) {
          const rows = db.prepare('SELECT * FROM daily_schedule WHERE start_time = ?').all(currentHMS);
          for (const row of rows) {
            new Notification({
              title: 'Frodigy Schedule',
              body: `Time for: ${row.title}`,
              icon: APP_ICON_PATH,
              silent: false
            }).show();
          }
        }
      } catch (err) {
        // Suppress db not initialized early on
      }
    }
  }, 10000);

  // ─── APP INFO & UPDATES ─────────────────────────────────────

  ipcMain.handle('app:get-version', () => {
    return CURRENT_VERSION;
  });

  ipcMain.handle('app:check-for-updates', () => {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'Frodigy-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const release = JSON.parse(data);
              const latestVersion = release.tag_name.replace(/^v/, '');
              const hasUpdate = compareVersions(latestVersion, CURRENT_VERSION) > 0;
              resolve({
                success: true,
                currentVersion: CURRENT_VERSION,
                latestVersion,
                hasUpdate,
                releaseUrl: release.html_url,
                releaseName: release.name || release.tag_name
              });
            } else if (res.statusCode === 404) {
              resolve({
                success: true,
                currentVersion: CURRENT_VERSION,
                latestVersion: CURRENT_VERSION,
                hasUpdate: false,
                releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
                releaseName: null
              });
            } else {
              resolve({ success: false, error: `GitHub API returned ${res.statusCode}` });
            }
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out' });
      });

      req.end();
    });
  });

  ipcMain.handle('app:open-external', (_event, url) => {
    shell.openExternal(url);
    return { success: true };
  });
}

// Compare semantic versions, returns: 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

module.exports = { registerAllHandlers };
