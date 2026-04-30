// ═══════════════════════════════════════════════════════════
// Completed Tasks Page
// ═══════════════════════════════════════════════════════════

// eslint-disable-next-line no-unused-vars
async function renderCompleted(container) {
  const tasks = await window.frodigy.invoke('tasks:list-completed');

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Completed Tasks</h1>
      <p class="page-subtitle">Your accomplishments</p>
    </div>
    <div id="completed-container"></div>
  `;

  const completedContainer = document.getElementById('completed-container');

  if (!tasks.length) {
    completedContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div>No completed tasks yet. Finish a one-time task from the Dashboard!</div>';
    return;
  }

  const checkIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

  completedContainer.innerHTML = `
    <div class="completed-table">
      <div class="completed-table-header">
        <span class="completed-col-label">Task</span>
        <span class="completed-col-label" style="text-align:right">Completed on</span>
      </div>
      ${tasks.map(t => {
        const startDate = t.created_at ? t.created_at.slice(0, 10) : '—';
        const completedDate = t.completed_at ? t.completed_at.slice(0, 10) : '—';
        return `
          <div class="completed-row">
            <div class="completed-task-info">
              <span class="completed-check-icon">${checkIcon}</span>
              <div>
                <div class="completed-task-title">${escapeHtmlCompleted(t.title)}</div>
                <div class="completed-task-start">STARTED: ${startDate}</div>
              </div>
            </div>
            <div class="completed-date">${completedDate}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function escapeHtmlCompleted(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
