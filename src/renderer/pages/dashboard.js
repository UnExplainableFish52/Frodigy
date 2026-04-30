// ═══════════════════════════════════════════════════════════
// Dashboard Page — Today view
// ═══════════════════════════════════════════════════════════

const QUOTES = [
  { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
];

function getDailyQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function formatTodayDate() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function checkSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
}

function trashSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
}

// eslint-disable-next-line no-unused-vars
async function renderDashboard(container) {
  const quote = getDailyQuote();
  const data = await window.frodigy.invoke('tasks:list-today');

  container.innerHTML = `
    <div class="dashboard-top">
      <div class="dashboard-header-left">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">${formatTodayDate()}</p>
      </div>
      <div class="quote-block">
        <div class="quote-mark">❝</div>
        <p class="quote-text">"${quote.text}"</p>
        <p class="quote-author">— ${quote.author}</p>
      </div>
    </div>

    <div class="add-task-cards">
      <div class="add-task-card add-task-card--recurring" id="btn-add-recurring">
        <div class="add-icon add-icon--teal">+</div>
        <div class="add-card-info">
          <h3>Recurring Task</h3>
          <p>Resets daily. Perfect for habits.</p>
        </div>
      </div>
      <div class="add-task-card add-task-card--onetime" id="btn-add-onetime">
        <div class="add-icon add-icon--amber">+</div>
        <div class="add-card-info">
          <h3>One-Time Task</h3>
          <p>Projects & errands. Carries over.</p>
        </div>
      </div>
    </div>

    <div class="task-section">
      <div class="section-header">
        <span class="section-title">RECURRING</span>
        <span class="section-badge">Resets midnight</span>
      </div>
      <div class="task-list" id="recurring-list"></div>
    </div>

    <div class="task-section">
      <div class="section-header">
        <span class="section-title">ONE-TIME</span>
        <span class="section-badge">Carries over</span>
      </div>
      <div class="task-list" id="onetime-list"></div>
    </div>
  `;

  renderRecurringTasks(data.recurring);
  renderOneTimeTasks(data.oneTime);

  document.getElementById('btn-add-recurring').addEventListener('click', () => showAddTaskModal('recurring'));
  document.getElementById('btn-add-onetime').addEventListener('click', () => showAddTaskModal('one_time'));
}

function renderRecurringTasks(tasks) {
  const list = document.getElementById('recurring-list');
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔄</div>No recurring tasks yet. Create one above!</div>';
    return;
  }

  list.innerHTML = tasks.map(t => {
    const interval = parseInt(t.recurrence_rule, 10) || 1;
    let isCompleted = false;
    let dueTag = '';

    if (t.last_completed) {
      const todayStr = new Date().toISOString().slice(0, 10);
      
      // Calculate start of day for accurate day-diffs
      const today = new Date(todayStr + 'T00:00:00');
      const lastCompleted = new Date(t.last_completed + 'T00:00:00');
      
      const diffTime = today - lastCompleted;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < interval) {
        isCompleted = true;
        const daysLeft = interval - diffDays;
        if (daysLeft === 1) {
          dueTag = '<span class="due-badge" style="background:var(--accent-primary); color:black;">Tomorrow</span>';
        } else if (daysLeft > 1) {
          dueTag = `<span class="due-badge" style="background:#3b82f6; color:white;">In ${daysLeft} days</span>`;
        }
      }
    }

    return `
      <div class="task-item ${isCompleted ? 'completed' : ''}">
        <button class="task-checkbox ${isCompleted ? 'checked' : ''}" data-task-id="${t.id}" data-type="recurring">
          ${isCompleted ? checkSvg() : ''}
        </button>
        <div class="task-info">
          <div class="task-title" style="display:flex; align-items:center; gap:8px;">
            <span style="flex:1">${escapeHtml(t.title)}</span>
            ${dueTag}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-action-btn" data-delete-id="${t.id}" title="Delete">${trashSvg()}</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.task-checkbox[data-type="recurring"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = Number(btn.dataset.taskId);
      const wasChecked = btn.classList.contains('checked');
      await window.frodigy.invoke('tasks:toggle-recurring', { taskId, completed: !wasChecked });
      refreshDashboard();
    });
  });

  attachDeleteHandlers(list);
}

function renderOneTimeTasks(tasks) {
  const list = document.getElementById('onetime-list');
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>No pending tasks. Add one above!</div>';
    return;
  }

  list.innerHTML = tasks.map(t => {
    const subtasks = t.subtasks || [];
    const createdDate = t.created_at ? t.created_at.slice(0, 10) : '';
    return `
      <div class="task-item-wrapper">
        <div class="task-item">
          <button class="task-checkbox" data-task-id="${t.id}" data-type="onetime">
            ${checkSvg().replace('currentColor', 'currentColor')}
          </button>
          <div class="task-info">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta">Started: ${createdDate}</div>
          </div>
          <div class="task-actions">
            <button class="task-action-btn" data-delete-id="${t.id}" title="Delete">${trashSvg()}</button>
          </div>
        </div>
        ${subtasks.length > 0 || true ? `
          <div class="subtask-list" id="subtasks-${t.id}">
            ${subtasks.filter(s => s.id).map(s => `
              <div class="subtask-item ${s.is_completed ? 'completed-sub' : ''}">
                <button class="subtask-checkbox ${s.is_completed ? 'checked' : ''}" data-subtask-id="${s.id}">
                  ${s.is_completed ? checkSvg() : ''}
                </button>
                <span>${escapeHtml(s.title)}</span>
              </div>
            `).join('')}
          </div>
          <button class="add-subtask-btn" data-parent-id="${t.id}">+ Add subtask</button>
        ` : ''}
      </div>
    `;
  }).join('');

  // One-time complete handlers
  list.querySelectorAll('.task-checkbox[data-type="onetime"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = Number(btn.dataset.taskId);
      await window.frodigy.invoke('tasks:complete-onetime', { taskId });
      refreshDashboard();
    });
  });

  // Subtask toggle handlers
  list.querySelectorAll('.subtask-checkbox').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subtaskId = Number(btn.dataset.subtaskId);
      const wasChecked = btn.classList.contains('checked');
      await window.frodigy.invoke('subtasks:toggle', { subtaskId, completed: !wasChecked });
      refreshDashboard();
    });
  });

  // Add subtask handlers
  list.querySelectorAll('.add-subtask-btn').forEach(btn => {
    btn.addEventListener('click', () => showAddSubtaskModal(Number(btn.dataset.parentId)));
  });

  attachDeleteHandlers(list);
}

function attachDeleteHandlers(container) {
  container.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = Number(btn.dataset.deleteId);
      await window.frodigy.invoke('tasks:delete', { taskId });
      refreshDashboard();
    });
  });
}

function showAddTaskModal(type) {
  const typeLabel = type === 'recurring' ? 'Recurring Task' : 'One-Time Task';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">New ${typeLabel}</h2>
      <div class="form-group">
        <label class="form-label">Task Name</label>
        <input class="form-input" id="modal-task-title" type="text" placeholder="e.g., ${type === 'recurring' ? 'Brush Teeth' : 'Fix bug #42'}" autofocus />
      </div>
      ${type === 'recurring' ? `
      <div class="form-group">
        <label class="form-label">Recurrence Interval (Days)</label>
        <input class="form-input" id="modal-task-interval" type="number" min="1" max="365" value="1" />
      </div>
      ` : ''}
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#modal-task-title');
  input.focus();

  const save = async () => {
    const title = input.value.trim();
    if (!title) return;
    
    let recurrenceRule = null;
    if (type === 'recurring') {
      const intervalInput = overlay.querySelector('#modal-task-interval');
      const interval = parseInt(intervalInput.value, 10);
      recurrenceRule = (interval && interval > 0) ? interval.toString() : '1';
    }

    await window.frodigy.invoke('tasks:create', { title, type, recurrenceRule });
    overlay.remove();
    refreshDashboard();
  };

  overlay.querySelector('#modal-save').addEventListener('click', save);
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') overlay.remove(); });
}

function showAddSubtaskModal(parentTaskId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">Add Subtask</h2>
      <div class="form-group">
        <label class="form-label">Subtask</label>
        <input class="form-input" id="modal-subtask-title" type="text" placeholder="e.g., Write unit tests" autofocus />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Add</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#modal-subtask-title');
  input.focus();

  const save = async () => {
    const title = input.value.trim();
    if (!title) return;
    await window.frodigy.invoke('subtasks:add', { taskId: parentTaskId, title });
    overlay.remove();
    refreshDashboard();
  };

  overlay.querySelector('#modal-save').addEventListener('click', save);
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') overlay.remove(); });
}

async function refreshDashboard() {
  const container = document.getElementById('page-content');
  if (window.location.hash === '#dashboard' || window.location.hash === '' || window.location.hash === '#') {
    await renderDashboard(container);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
