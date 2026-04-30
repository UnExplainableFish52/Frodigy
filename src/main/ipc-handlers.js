const { ipcMain, Notification, shell } = require('electron');
const path = require('path');
const https = require('https');

const GITHUB_REPO = 'UnEliteFish52/frodigy';
const CURRENT_VERSION = require('../../package.json').version;
const { getDatabase } = require('./db');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function registerAllHandlers() {
  // ─── TASKS ───────────────────────────────────────────────

  ipcMain.handle('tasks:create', (_event, { title, type, recurrenceRule }) => {
    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO tasks (title, type, recurrence_rule, created_at, is_completed) VALUES (?, ?, ?, ?, 0)'
    );
    const result = stmt.run(title, type, recurrenceRule || null, nowISO());
    return { id: result.lastInsertRowid, title, type, recurrenceRule };
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
       WHERE t.type = 'one_time' AND t.is_completed = 0
       ORDER BY t.created_at ASC`
    ).all();

    // Recurring tasks: all active recurring, with max completion date
    const recurring = db.prepare(
      `SELECT t.*,
        (SELECT MAX(completion_date) FROM recurring_completions rc WHERE rc.task_id = t.id) AS last_completed
       FROM tasks t
       WHERE t.type = 'recurring' AND t.is_completed = 0
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
    const db = getDatabase();
    const today = todayISO();

    if (completed) {
      db.prepare(
        'INSERT OR IGNORE INTO recurring_completions (task_id, completion_date) VALUES (?, ?)'
      ).run(taskId, today);
    } else {
      const row = db.prepare('SELECT MAX(completion_date) as last_completed FROM recurring_completions WHERE task_id = ?').get(taskId);
      if (row && row.last_completed) {
        db.prepare(
          'DELETE FROM recurring_completions WHERE task_id = ? AND completion_date = ?'
        ).run(taskId, row.last_completed);
      }
    }

    return { success: true };
  });

  ipcMain.handle('tasks:complete-onetime', (_event, { taskId }) => {
    const db = getDatabase();
    db.prepare(
      'UPDATE tasks SET is_completed = 1, completed_at = ? WHERE id = ? AND type = \'one_time\''
    ).run(nowISO(), taskId);
    return { success: true };
  });

  ipcMain.handle('tasks:delete', (_event, { taskId }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    return { success: true };
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
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM tasks WHERE type = \'one_time\' AND is_completed = 1 ORDER BY completed_at DESC'
    ).all();
    return rows;
  });

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
      'INSERT INTO timers (name, duration_seconds, state, updated_at) VALUES (?, ?, \'idle\', ?)'
    ).run(name, durationSeconds, nowISO());
    return { id: result.lastInsertRowid, name, duration_seconds: durationSeconds, state: 'idle' };
  });

  ipcMain.handle('timers:list', () => {
    const db = getDatabase();
    return db.prepare('SELECT * FROM timers ORDER BY id ASC').all();
  });

  ipcMain.handle('timers:update-state', (_event, { timerId, state, startedAt, endsAt }) => {
    const db = getDatabase();
    db.prepare(
      'UPDATE timers SET state = ?, started_at = ?, ends_at = ?, updated_at = ? WHERE id = ?'
    ).run(state, startedAt || null, endsAt || null, nowISO(), timerId);

    // If completed, log to timer_sessions
    if (state === 'completed') {
      const timer = db.prepare('SELECT name, duration_seconds FROM timers WHERE id = ?').get(timerId);
      if (timer) {
        db.prepare(
          'INSERT INTO timer_sessions (timer_name, duration_seconds, completed_at) VALUES (?, ?, ?)'
        ).run(timer.name, timer.duration_seconds, nowISO());
      }
    }

    return { success: true };
  });

  ipcMain.handle('timers:delete', (_event, { timerId }) => {
    const db = getDatabase();
    db.prepare('DELETE FROM timers WHERE id = ?').run(timerId);
    return { success: true };
  });

  ipcMain.handle('timers:notify', (_event, { timerName }) => {
    const notification = new Notification({
      title: 'Frodigy Timer',
      body: `"${timerName}" has finished!`,
      silent: false
    });
    notification.show();
    return { success: true };
  });

  // ─── SETTINGS ───────────────────────────────────────────

  ipcMain.handle('settings:get', (_event, { key }) => {
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
      const { app } = require('electron');
      app.setLoginItemSettings({
        openAtLogin: value === 'true',
        args: ['--startup']
      });
    }

    return { success: true };
  });

  // ─── STATS SUMMARY ───────────────────────────────────────

  ipcMain.handle('stats:get-summary', () => {
    const db = getDatabase();
    const today = todayISO();
    
    // Tasks stats
    const oneTimeCompletedToday = db.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE type = \'one_time\' AND is_completed = 1 AND date(completed_at) = ?'
    ).get(today).count;
    
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
      'SELECT SUM(duration_seconds) as total FROM timer_sessions WHERE date(completed_at) = ?'
    ).get(today);
    const timersTodaySeconds = timersTodayRow.total || 0;

    const timersAllTimeRow = db.prepare(
      'SELECT SUM(duration_seconds) as total FROM timer_sessions'
    ).get();
    const timersAllTimeSeconds = timersAllTimeRow.total || 0;

    // Recent timer sessions
    const recentSessions = db.prepare(
      'SELECT * FROM timer_sessions ORDER BY completed_at DESC LIMIT 10'
    ).all();

    return {
      today: {
        tasksCompleted: oneTimeCompletedToday + recurringCompletedToday,
        timerSeconds: timersTodaySeconds
      },
      allTime: {
        tasksCompleted: allTimeTasksCount,
        timerSeconds: timersAllTimeSeconds
      },
      recentSessions
    };
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
