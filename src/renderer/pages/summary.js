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

  const formatMinutes = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
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
          <div class="stat-card">
            <div class="stat-value">${stats.today.activitiesLogged}</div>
            <div class="stat-label">Activities Logged</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${formatMinutes(stats.today.activityMinutes)}</div>
            <div class="stat-label">Activity Time</div>
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
          <div class="stat-card">
            <div class="stat-value">${stats.allTime.activitiesLogged}</div>
            <div class="stat-label">Total Activities</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${formatMinutes(stats.allTime.activityMinutes)}</div>
            <div class="stat-label">Activity Time</div>
          </div>
        </div>
      </div>

      <div class="summary-section" style="margin-top: 32px;">
        <h2 class="section-title">Log Activity</h2>
        <form class="activity-form" id="activity-form">
          <input class="form-input" id="activity-date" type="date" value="${formatDateISO(new Date())}" />
          <input class="form-input" id="activity-title" type="text" placeholder="Activity title" required />
          <select class="form-select" id="activity-category">
            <option value="Study">Study</option>
            <option value="Work">Work</option>
            <option value="Health">Health</option>
            <option value="Creative">Creative</option>
            <option value="General">General</option>
          </select>
          <input class="form-input" id="activity-duration" type="number" min="0" max="1440" value="30" />
          <textarea class="form-input activity-note-input" id="activity-note" placeholder="Progress note"></textarea>
          <button class="btn btn-primary" type="submit">Add Activity</button>
        </form>
      </div>

      <div class="summary-section" style="margin-top: 32px;">
        <h2 class="section-title">Recent Activities</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${stats.recentActivities.length === 0 ? `
                <tr><td colspan="5" class="empty-cell">No activities logged yet.</td></tr>
              ` : stats.recentActivities.map(activity => `
                <tr>
                  <td>
                    <strong>${escapeHtmlSummary(activity.title)}</strong>
                    ${activity.progress_note ? `<div class="table-note">${escapeHtmlSummary(activity.progress_note)}</div>` : ''}
                  </td>
                  <td>${escapeHtmlSummary(activity.category)}</td>
                  <td>${formatMinutes(activity.duration_minutes || 0)}</td>
                  <td><span class="date-badge">${activity.activity_date}</span></td>
                  <td><button class="task-action-btn" data-delete-activity="${activity.id}" title="Delete">×</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="summary-section" style="margin-top: 32px;">
        <h2 class="section-title">Progress Timeline</h2>
        <div class="timeline-list">
          ${stats.timeline.length === 0 ? `
            <div class="empty-state"><div class="empty-state-icon">📈</div>No progress history yet.</div>
          ` : stats.timeline.map(item => `
            <div class="timeline-item">
              <div class="timeline-type">${escapeHtmlSummary(item.type)}</div>
              <div class="timeline-main">
                <div class="timeline-title">${escapeHtmlSummary(item.title)}</div>
                <div class="timeline-meta">${escapeHtmlSummary(item.meta)} · ${formatDate(item.occurredAt)}</div>
                ${item.note ? `<div class="timeline-note">${escapeHtmlSummary(item.note)}</div>` : ''}
              </div>
            </div>
          `).join('')}
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

  document.getElementById('activity-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.getElementById('activity-title').value.trim();
    if (!title) return;

    await window.frodigy.invoke('activities:create', {
      activityDate: document.getElementById('activity-date').value,
      title,
      category: document.getElementById('activity-category').value,
      durationMinutes: Number(document.getElementById('activity-duration').value) || 0,
      progressNote: document.getElementById('activity-note').value.trim()
    });

    renderSummary(container);
  });

  container.querySelectorAll('[data-delete-activity]').forEach(button => {
    button.addEventListener('click', async () => {
      await window.frodigy.invoke('activities:delete', { id: Number(button.dataset.deleteActivity) });
      renderSummary(container);
    });
  });
}

function escapeHtmlSummary(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
