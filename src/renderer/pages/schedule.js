// ═══════════════════════════════════════════════════════════
// Schedule / Time Table Page
// ═══════════════════════════════════════════════════════════

// eslint-disable-next-line no-unused-vars
async function renderSchedule(container) {
  const scheduleData = await window.frodigy.invoke('schedule:list');

  container.innerHTML = `
    <div class="dashboard-top" style="margin-bottom: 24px;">
      <div class="dashboard-header-left">
        <h1 class="page-title">Daily Schedule</h1>
        <p class="page-subtitle">Your personal timetable</p>
      </div>
      <button class="btn btn-primary" id="btn-add-schedule" style="height: 40px; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Time Block
      </button>
    </div>

    <div class="task-section">
      <div class="section-header">
        <span class="section-title">TODAY'S TIMETABLE</span>
        <span class="section-badge">${scheduleData.length} Blocks</span>
      </div>
      <div class="task-list" id="schedule-list"></div>
    </div>
  `;

  renderScheduleList(scheduleData);

  document.getElementById('btn-add-schedule').addEventListener('click', () => {
    showAddScheduleModal();
  });
}

function renderScheduleList(scheduleList) {
  const list = document.getElementById('schedule-list');
  if (!scheduleList.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏱️</div>Your schedule is empty. Map out your day above!</div>';
    return;
  }

  list.innerHTML = scheduleList.map(item => `
    <div class="task-item" style="cursor: default;">
      <div style="min-width: 140px; display: flex; flex-direction: column; gap: 4px; padding-right: 16px; border-right: 2px solid var(--accent-primary-dim); margin-right: 16px;">
        <span style="font-size: 1.1rem; font-weight: 700; color: var(--accent-primary);">${item.start_time}</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">to ${item.end_time}</span>
      </div>
      <div class="task-info">
        <div class="task-title" style="font-size: 1.05rem;">${escapeHtmlSched(item.title)}</div>
      </div>
      <div class="task-actions" style="opacity: 1;">
        <button class="task-action-btn" data-delete-id="${item.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.deleteId);
      await window.frodigy.invoke('schedule:delete', { id });
      refreshSchedule();
    });
  });
}

function showAddScheduleModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">Add Time Block</h2>
      <div class="form-group">
        <label class="form-label">Title / Activity</label>
        <input class="form-input" id="sched-title" type="text" placeholder="e.g., Study Session 1" autofocus />
      </div>
      <div style="display: flex; gap: 16px;">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Start Time</label>
          <input class="form-input" id="sched-start" type="time" required />
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">End Time</label>
          <input class="form-input" id="sched-end" type="time" required />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const titleInput = overlay.querySelector('#sched-title');
  const startInput = overlay.querySelector('#sched-start');
  const endInput = overlay.querySelector('#sched-end');

  // Pre-fill time smartly (next hour)
  const now = new Date();
  startInput.value = String(now.getHours()).padStart(2, '0') + ':00';
  endInput.value = String((now.getHours() + 1) % 24).padStart(2, '0') + ':00';

  titleInput.focus();

  const save = async () => {
    const title = titleInput.value.trim();
    const start_time = startInput.value;
    const end_time = endInput.value;
    
    if (!title || !start_time || !end_time) return;

    await window.frodigy.invoke('schedule:create', { title, start_time, end_time });
    overlay.remove();
    refreshSchedule();
  };

  overlay.querySelector('#modal-save').addEventListener('click', save);
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function refreshSchedule() {
  const container = document.getElementById('page-content');
  if (window.location.hash === '#schedule') {
    await renderSchedule(container);
  }
}

function escapeHtmlSched(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
