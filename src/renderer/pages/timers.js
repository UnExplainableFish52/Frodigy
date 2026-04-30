// ═══════════════════════════════════════════════════════════
// Timers Page
// ═══════════════════════════════════════════════════════════

let timerIntervalId = null;
let localTimers = []; // in-memory state for running timers

// eslint-disable-next-line no-unused-vars
async function renderTimers(container) {
  const timers = await window.frodigy.invoke('timers:list');
  localTimers = timers.map(t => ({
    ...t,
    remainingMs: calcRemainingMs(t),
  }));

  container.innerHTML = `
    <div class="timers-header">
      <div class="page-header" style="margin-bottom:0">
        <h1 class="page-title">Timers</h1>
        <p class="page-subtitle">Manage multiple background tasks</p>
      </div>
      <button class="new-timer-btn" id="btn-new-timer">
        <span>+</span> New Timer
      </button>
    </div>
    <div class="timer-grid" id="timer-grid"></div>
  `;

  renderTimerCards();
  startTimerTick();

  document.getElementById('btn-new-timer').addEventListener('click', showNewTimerModal);
}

function calcRemainingMs(t) {
  if (t.state === 'idle' || t.state === 'completed') {
    return t.duration_seconds * 1000;
  }
  if (t.state === 'running' && t.ends_at) {
    const remaining = new Date(t.ends_at).getTime() - Date.now();
    return Math.max(0, remaining);
  }
  if (t.state === 'paused' && t.ends_at && t.started_at) {
    // For paused timers, we store remaining time in ends_at as a future offset
    // When pausing, we save `ends_at - now` as a duration reference
    return Math.max(0, t.duration_seconds * 1000);
  }
  return t.duration_seconds * 1000;
}

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderTimerCards() {
  const grid = document.getElementById('timer-grid');
  if (!grid) return;

  if (!localTimers.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏱️</div>No timers yet. Create one to get started!</div>';
    return;
  }

  grid.innerHTML = localTimers.map(t => `
    <div class="timer-card" data-timer-id="${t.id}">
      <div class="timer-card-header">
        <span class="timer-name">${escapeHtmlTimer(t.name)}</span>
        <button class="timer-settings-btn" data-delete-timer="${t.id}" title="Delete timer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div class="timer-display ${t.state === 'running' ? 'running' : ''}" id="timer-display-${t.id}">
        ${formatTimer(t.remainingMs)}
      </div>
      <div class="timer-controls">
        <button class="timer-btn timer-btn-play" data-play-timer="${t.id}" title="${t.state === 'running' ? 'Pause' : 'Start'}">
          ${t.state === 'running' ? pauseSvg() : playSvg()}
        </button>
        <button class="timer-btn timer-btn-reset" data-reset-timer="${t.id}" title="Reset">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Play/pause handlers
  grid.querySelectorAll('[data-play-timer]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timerId = Number(btn.dataset.playTimer);
      const timer = localTimers.find(t => t.id === timerId);
      if (!timer) return;

      if (timer.state === 'running') {
        // Pause
        timer.state = 'paused';
        timer.duration_seconds = Math.ceil(timer.remainingMs / 1000);
        await window.frodigy.invoke('timers:update-state', {
          timerId, state: 'paused', startedAt: null, endsAt: null
        });
        // Update DB duration for proper resume
      } else {
        // Start / Resume
        const endsAt = new Date(Date.now() + timer.remainingMs).toISOString();
        timer.state = 'running';
        timer.ends_at = endsAt;
        await window.frodigy.invoke('timers:update-state', {
          timerId, state: 'running', startedAt: new Date().toISOString(), endsAt
        });
      }
      renderTimerCards();
    });
  });

  // Reset handlers
  grid.querySelectorAll('[data-reset-timer]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timerId = Number(btn.dataset.resetTimer);
      const timer = localTimers.find(t => t.id === timerId);
      if (!timer) return;

      timer.state = 'idle';
      timer.remainingMs = timer.duration_seconds * 1000;
      await window.frodigy.invoke('timers:update-state', {
        timerId, state: 'idle', startedAt: null, endsAt: null
      });
      renderTimerCards();
    });
  });

  // Delete handlers
  grid.querySelectorAll('[data-delete-timer]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timerId = Number(btn.dataset.deleteTimer);
      await window.frodigy.invoke('timers:delete', { timerId });
      localTimers = localTimers.filter(t => t.id !== timerId);
      renderTimerCards();
      updateTimerBadge();
    });
  });
}

function startTimerTick() {
  if (timerIntervalId) clearInterval(timerIntervalId);

  timerIntervalId = setInterval(() => {
    let needsRedraw = false;

    localTimers.forEach(t => {
      if (t.state !== 'running') return;

      if (t.ends_at) {
        t.remainingMs = Math.max(0, new Date(t.ends_at).getTime() - Date.now());
      }

      const display = document.getElementById(`timer-display-${t.id}`);
      if (display) display.textContent = formatTimer(t.remainingMs);

      if (t.remainingMs <= 0) {
        t.state = 'completed';
        t.remainingMs = 0;
        needsRedraw = true;
        // Fire notification
        window.frodigy.invoke('timers:notify', { timerName: t.name });
        window.frodigy.invoke('timers:update-state', {
          timerId: t.id, state: 'completed', startedAt: null, endsAt: null
        });
        showTimerFinishedModal(t.id, t.name);
      }
    });

    updateTimerBadge();
    if (needsRedraw) renderTimerCards();
  }, 250);
}

// eslint-disable-next-line no-unused-vars
function stopTimerTick() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function updateTimerBadge() {
  const badge = document.getElementById('active-timer-count');
  if (!badge) return;
  const running = localTimers.filter(t => t.state === 'running').length;
  badge.textContent = running > 0 ? `${running} timer${running > 1 ? 's' : ''} running` : 'No timers running';
}

function showNewTimerModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">New Timer</h2>
      <div class="form-group">
        <label class="form-label">Timer Name</label>
        <input class="form-input" id="modal-timer-name" type="text" placeholder="e.g., Deep Work" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Duration (minutes)</label>
        <input class="form-input" id="modal-timer-mins" type="number" min="1" max="999" value="25" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#modal-timer-name');
  nameInput.focus();

  const save = async () => {
    const name = nameInput.value.trim();
    const mins = parseInt(overlay.querySelector('#modal-timer-mins').value, 10);
    if (!name || !mins || mins < 1) return;

    const result = await window.frodigy.invoke('timers:create', { name, durationSeconds: mins * 60 });
    localTimers.push({ ...result, remainingMs: mins * 60 * 1000 });
    overlay.remove();
    renderTimerCards();
  };

  overlay.querySelector('#modal-save').addEventListener('click', save);
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') overlay.remove(); });
}

function playSvg() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}

function pauseSvg() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
}

function escapeHtmlTimer(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── AUDIO ALARM & NOTIFICATION MODAL ─────────────────────

let audioCtx = null;
let alarmInterval = null;
let customAudio = null;

function playTimerAlarm() {
  // Attempt custom audio first
  try {
    const audio = new Audio('./custom-alarm.mp3');
    audio.loop = true;
    audio.play().then(() => {
      customAudio = audio;
    }).catch((e) => {
      // Failed to play (e.g. file not found or browser blocked), fallback to beep
      playSynthesizedBeep();
    });
  } catch (err) {
    playSynthesizedBeep();
  }
}

function playSynthesizedBeep() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (alarmInterval) clearInterval(alarmInterval);

  const beep = () => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Create a pleasant but noticeable double-beep ping
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  };

  beep(); // initial beep
  alarmInterval = setInterval(beep, 1000); // repeat every 1s
}

function stopTimerAlarm() {
  if (customAudio) {
    customAudio.pause();
    customAudio.currentTime = 0;
    customAudio = null;
  }

  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}

function showTimerFinishedModal(timerId, timerName) {
  playTimerAlarm();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay timer-finished-overlay';
  overlay.innerHTML = `
    <div class="modal timer-finished-modal" style="border: 2px solid var(--accent-primary); box-shadow: 0 0 30px rgba(6, 182, 212, 0.3);">
      <div style="font-size: 48px; text-align: center; margin-bottom: 16px; animation: pulse 1s infinite alternate;">⏰</div>
      <h2 class="modal-title" style="text-align: center; color: var(--accent-primary);">Time's Up!</h2>
      <p style="text-align:center; margin-bottom: 32px; color: var(--text-muted); font-size: 1.1rem;">
        <strong>${escapeHtmlTimer(timerName)}</strong> has finished.
      </p>
      <div class="modal-actions" style="justify-content: center;">
        <button class="btn btn-primary" id="modal-dismiss-timer" style="width: 100%; padding: 12px; font-size: 1.1rem;">Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = () => {
    stopTimerAlarm();
    overlay.remove();
  };

  overlay.querySelector('#modal-dismiss-timer').addEventListener('click', dismiss);
  // Unlike other modals, we DO NOT close on overlay click or Escape key, we force them to click Dismiss.
}
