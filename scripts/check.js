const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fullPath.includes(`${path.sep}renderer-react`) || fullPath.includes(`${path.sep}renderer-dist`)) {
        continue;
      }
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runNodeCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: root,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`${path.relative(root, filePath)} failed syntax check\n${result.stderr || result.stdout}`);
  }
}

for (const filePath of walk(path.join(root, 'src'))) {
  runNodeCheck(filePath);
}

for (const filePath of walk(path.join(root, 'scripts'))) {
  runNodeCheck(filePath);
}

const indexHtml = read('src/renderer/index.html');
const calendarJs = read('src/renderer/pages/calendar.js');
const dashboardJs = read('src/renderer/pages/dashboard.js');
const timersJs = read('src/renderer/pages/timers.js');
const ipcHandlersJs = read('src/main/ipc-handlers.js');
const dbJs = read('src/main/db.js');
const preloadJs = read('src/main/preload.js');
const settingsJs = read('src/renderer/pages/settings.js');
const summaryJs = read('src/renderer/pages/summary.js');
const reactApp = read('src/renderer-react/src/App.jsx');
const reactUi = read('src/renderer-react/src/components/ui.jsx');
const readme = read('README.md');
const journeyService = read('src/main/journey-service.js');
const backupService = read('src/main/backup-service.js');
const mainJs = read('src/main/main.js');
const reactStyles = read('src/renderer-react/src/styles.css');

assert(!indexHtml.includes('⌘'), 'Windows shortcut labels must use Ctrl, not Command symbols.');
assert(calendarJs.includes("settings:get") && calendarJs.includes('isWeekendDay'), 'Calendar must honor the saved weekend setting.');
assert(timersJs.includes('remaining_seconds') && timersJs.includes('remainingSeconds'), 'Renderer timers must persist remaining seconds.');
assert(ipcHandlersJs.includes("remaining_seconds") && ipcHandlersJs.includes('reconcileExpiredTimers'), 'Main timer handlers must reconcile persisted timer state.');
assert(ipcHandlersJs.includes('localDayBounds') && ipcHandlersJs.includes('formatLocalDate'), 'Daily stats must use local-day boundaries.');
assert(preloadJs.includes('sanitizeMarkdownHtml') && preloadJs.includes('ALLOWED_TAGS'), 'Markdown preview must be sanitized before rendering.');
assert(dbJs.includes('activity_logs') && dbJs.includes('reminder_at'), 'Database must include activity logs and task reminder fields.');
assert(ipcHandlersJs.includes('activities:create') && ipcHandlersJs.includes('startPendingDigestLoop'), 'IPC must include activity logging and daily pending project digest notifications.');
assert(dashboardJs.includes('modal-task-reminder-at') && dashboardJs.includes('getTaskReminderBadge'), 'Dashboard must expose task reminder inputs and status badges.');
assert(summaryJs.includes('activity-form') && summaryJs.includes('Progress Timeline'), 'Summary must expose activity logging and progress timeline UI.');
assert(ipcHandlersJs.includes("UnExplainableFish52/Frodigy"), 'Update checks must use the canonical GitHub repository.');
assert(settingsJs.includes('UnExplainableFish52/Frodigy/releases'), 'Settings releases link must use the canonical GitHub repository.');
assert(readme.includes('frodigy.sqlite') && readme.includes('userData'), 'README must document the actual SQLite storage location.');
assert(reactApp.includes('CommandMenu') && reactApp.includes('DashboardPage') && reactApp.includes('TimersPage'), 'React renderer must include command menu and redesigned core pages.');
assert(reactUi.includes('PrimaryButton') && reactUi.includes('Panel') && reactUi.includes('StatusChip'), 'React renderer must expose shared UI primitives.');
assert(reactApp.includes('Today&apos;s Agenda') && reactApp.includes('ScheduleAgendaItem') && reactApp.includes('scheduleDurationMinutes'), 'Schedule must expose a compact synchronized agenda and duration-aware blocks.');
assert(reactApp.includes('SCHEDULE_START_MINUTES = 5 * 60') && reactApp.includes('SCHEDULE_END_MINUTES = 22 * 60') && reactApp.includes('SCHEDULE_SLOT_MINUTES = 15'), 'Schedule must use the requested 05:00-22:00 quarter-hour scale.');
assert(reactApp.includes('layoutScheduleBlocks') && reactApp.includes('laneCount'), 'Schedule must arrange overlapping routine blocks into readable lanes.');
assert(reactApp.includes('Duration must be a multiple of 15 minutes.') && reactApp.includes('duration_minutes'), 'Schedule creation must use start time plus a 15-minute-multiple duration.');
assert(mainJs.includes('fullscreen: true') && mainJs.includes("input.key === 'F11'"), 'Main window must open fullscreen and expose an F11 fullscreen toggle.');
assert(reactApp.includes("event.key === 'Tab'") && reactApp.includes('event.shiftKey ? -1 : 1'), 'React navigation must support forward and reverse Ctrl+Tab cycling.');
assert(reactApp.includes('changeScheduleZoom') && reactApp.includes('timelineFocus') && reactApp.includes('schedule-now-line'), 'Schedule must expose zoom, focus view, and a live now marker.');
assert(reactStyles.includes('.premium-page-title') && reactStyles.includes('.premium-kicker') && reactStyles.includes('.schedule-block'), 'React styling must include the premium heading hierarchy and schedule treatment.');
assert(reactApp.includes('function FaqItem') && reactApp.includes('aria-expanded={open}') && reactApp.includes('GNU General Public License v3.0'), 'About page must expose accessible collapsed FAQ content and license information.');
assert(reactApp.includes('View Source') && reactApp.includes('Contribute') && reactApp.includes('Fumic'), 'About page must expose working project actions and the developer application showcase.');
assert(reactApp.includes('Super Productivity') && reactApp.includes('function KeywordTag') && reactApp.includes('function ChangelogItem'), 'About page must use concise keyword-led comparison and changelog content.');
assert(journeyService.includes('recordAppOpen') && journeyService.includes('getDailyHistory') && journeyService.includes('completeProject'), 'Journey service must own local history, consistency, and project completion.');
assert(backupService.includes('createBackupPayload') && backupService.includes('pre-restore-safety') && backupService.includes('restoreBackupPayload'), 'Backup service must validate, safety-backup, and replace local data.');
assert(preloadJs.includes('ALLOWED_INVOKE_CHANNELS') && preloadJs.includes('journey:get-dashboard'), 'Preload must restrict renderer IPC to an explicit allowlist.');
assert(reactApp.includes('Due in how many days?') && reactApp.includes('formatDeadlinePreview') && reactApp.includes('getEndOfMonthDeadlineDays'), 'Task creation must use days-from-now deadline input with quick chips.');
assert(reactApp.includes('Daily pending project digest') && reactApp.includes('pending_digest_enabled') && reactApp.includes('pending_digest_time'), 'Settings must expose daily pending project digest controls.');
assert(ipcHandlersJs.includes('processPendingProjectDigest') && ipcHandlersJs.includes('You have ${count} pending projects'), 'Main process must use a daily pending project digest notification.');
assert(journeyService.includes('getLoginStreakDays') && journeyService.includes('getPerfectDaysThisMonth') && journeyService.includes('getProjectPressureStats'), 'Journey service must derive dashboard streak, perfect-day, and project pressure stats.');
assert(reactApp.includes('Focus active') && reactApp.includes('DashboardCommandCenter'), 'Dashboard must expose the active profile status and command-center overview.');
assert(reactApp.includes('Today&apos;s tasks completed') && reactApp.includes('Login streak') && reactApp.includes('Perfect days') && reactApp.includes('Pending this month'), 'Dashboard command center must show daily, consistency, and project insight labels.');
assert(reactApp.includes('sortedRecurring') && reactApp.includes('Number(left.task.completed_today) - Number(right.task.completed_today)'), 'Dashboard recurring tasks must sort unfinished items above completed items.');

const journeyTests = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-journey-tests.js')], {
  cwd: root,
  encoding: 'utf8'
});
if (journeyTests.status !== 0) {
  throw new Error(`Journey data tests failed\n${journeyTests.stderr || journeyTests.stdout}`);
}

const deadlineTests = spawnSync(process.execPath, [path.join(root, 'scripts', 'deadline-tests.mjs')], {
  cwd: root,
  encoding: 'utf8'
});
if (deadlineTests.status !== 0) {
  throw new Error(`Deadline input tests failed\n${deadlineTests.stderr || deadlineTests.stdout}`);
}

console.log('Frodigy checks passed.');
