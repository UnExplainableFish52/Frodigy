// ═══════════════════════════════════════════════════════════
// Summary / Stats Page
// ═══════════════════════════════════════════════════════════

async function renderSummary(container) {
  const stats = await window.frodigy.invoke('stats:get-summary');

  const formatHours = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Summary</h1>
      <p class="page-subtitle">Your productivity metrics and history</p>
    </div>

    <div class="summary-dashboard">
      <div class="summary-section">
        <h2 class="section-title">Today's Progress</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.today.tasksCompleted}</div>
            <div class="stat-label">Tasks Completed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${formatHours(stats.today.timerSeconds)}</div>
            <div class="stat-label">Focused Time</div>
          </div>
        </div>
      </div>

      <div class="summary-section" style="margin-top: 32px;">
        <h2 class="section-title">All-Time Metrics</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.allTime.tasksCompleted}</div>
            <div class="stat-label">Total Tasks Completed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${formatHours(stats.allTime.timerSeconds)}</div>
            <div class="stat-label">Total Focused Time</div>
          </div>
        </div>
      </div>

      <div class="summary-section" style="margin-top: 32px;">
        <h2 class="section-title">Recent Focus Sessions</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timer Name</th>
                <th>Duration</th>
                <th>Completed At</th>
              </tr>
            </thead>
            <tbody>
              ${stats.recentSessions.length === 0 ? `
                <tr><td colspan="3" class="empty-cell">No focus sessions recorded yet.</td></tr>
              ` : stats.recentSessions.map(session => `
                <tr>
                  <td>${escapeHtmlSummary(session.timer_name)}</td>
                  <td>${formatHours(session.duration_seconds)}</td>
                  <td><span class="date-badge">${formatDate(session.completed_at)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function escapeHtmlSummary(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
