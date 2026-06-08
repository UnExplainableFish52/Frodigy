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

assert(!indexHtml.includes('⌘'), 'Windows shortcut labels must use Ctrl, not Command symbols.');
assert(calendarJs.includes("settings:get") && calendarJs.includes('isWeekendDay'), 'Calendar must honor the saved weekend setting.');
assert(timersJs.includes('remaining_seconds') && timersJs.includes('remainingSeconds'), 'Renderer timers must persist remaining seconds.');
assert(ipcHandlersJs.includes("remaining_seconds") && ipcHandlersJs.includes('reconcileExpiredTimers'), 'Main timer handlers must reconcile persisted timer state.');
assert(ipcHandlersJs.includes('localDayBounds') && ipcHandlersJs.includes('formatLocalDate'), 'Daily stats must use local-day boundaries.');
assert(preloadJs.includes('sanitizeMarkdownHtml') && preloadJs.includes('ALLOWED_TAGS'), 'Markdown preview must be sanitized before rendering.');
assert(dbJs.includes('activity_logs') && dbJs.includes('reminder_at'), 'Database must include activity logs and task reminder fields.');
assert(ipcHandlersJs.includes('activities:create') && ipcHandlersJs.includes('startTaskReminderLoop'), 'IPC must include activity logging and task reminder notifications.');
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
assert(journeyService.includes('recordAppOpen') && journeyService.includes('getDailyHistory') && journeyService.includes('completeProject'), 'Journey service must own local history, consistency, and project completion.');
assert(backupService.includes('createBackupPayload') && backupService.includes('pre-restore-safety') && backupService.includes('restoreBackupPayload'), 'Backup service must validate, safety-backup, and replace local data.');
assert(preloadJs.includes('ALLOWED_INVOKE_CHANNELS') && preloadJs.includes('journey:get-dashboard'), 'Preload must restrict renderer IPC to an explicit allowlist.');

const journeyTests = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-journey-tests.js')], {
  cwd: root,
  encoding: 'utf8'
});
if (journeyTests.status !== 0) {
  throw new Error(`Journey data tests failed\n${journeyTests.stderr || journeyTests.stdout}`);
}

console.log('Frodigy checks passed.');
