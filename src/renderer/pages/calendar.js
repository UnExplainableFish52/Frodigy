// ═══════════════════════════════════════════════════════════
// Calendar & Notes Page
// ═══════════════════════════════════════════════════════════

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

let calState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDate: null,
  noteContent: '',
  noteSaveTimeout: null,
  zoomLevel: 1,
  mode: 'edit',
  isFullscreen: false,
};

// eslint-disable-next-line no-unused-vars
async function renderCalendar(container) {
  const today = new Date();
  if (!calState.selectedDate) {
    calState.selectedDate = formatDateISO(today);
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Calendar & Notes</h1>
      <p class="page-subtitle">Your daily journal</p>
    </div>
    <div class="calendar-layout">
      <div class="calendar-card">
        <div class="calendar-nav">
          <span class="calendar-month-title" id="cal-month-title">${MONTH_NAMES[calState.month]} ${calState.year}</span>
          <div class="calendar-nav-btns">
            <button class="cal-nav-btn" id="cal-prev">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="cal-nav-btn" id="cal-next">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        <div class="calendar-grid" id="cal-grid"></div>
      </div>
      <div class="note-card" id="note-container">
        <div class="note-header">
          <span class="note-title" id="note-title">Note for ${formatDateDisplay(calState.selectedDate)}</span>
          
          <div class="note-toolbar">
            <div class="note-tabs">
              <button class="note-tab ${calState.mode === 'edit' ? 'active' : ''}" id="tab-edit" data-mode="edit">Edit</button>
              <button class="note-tab ${calState.mode === 'preview' ? 'active' : ''}" id="tab-preview" data-mode="preview">Preview</button>
            </div>
            
            <div class="note-actions">
              <button class="note-action-btn" id="btn-zoom-out" title="Decrease Font Size" style="font-weight: bold;">A-</button>
              <button class="note-action-btn" id="btn-zoom-in" title="Increase Font Size" style="font-weight: bold;">A+</button>
              <div class="note-action-divider"></div>
              <button class="note-action-btn" id="btn-expand" title="Distraction-Free Mode">${calState.isFullscreen ? '⤡' : '⤢'}</button>
            </div>
          </div>
        </div>
        <div class="note-body">
          <textarea class="note-textarea" id="note-textarea" placeholder="Write your daily note here..." style="font-size: ${calState.zoomLevel}rem; display: ${calState.mode === 'edit' ? 'block' : 'none'};"></textarea>
          <div class="note-preview-content" id="note-preview-content" style="font-size: ${calState.zoomLevel}rem; display: ${calState.mode === 'preview' ? 'block' : 'none'};"></div>
        </div>
        <div class="note-footer-hint">
          💡 Tip: Press <kbd>Win</kbd> + <kbd>H</kbd> to activate Windows Voice Typing anywhere.
        </div>
      </div>
    </div>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    rebuildCalGrid();
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    rebuildCalGrid();
  });

  const textarea = document.getElementById('note-textarea');
  const preview = document.getElementById('note-preview-content');
  const noteContainer = document.getElementById('note-container');
  
  textarea.addEventListener('input', () => {
    clearTimeout(calState.noteSaveTimeout);
    calState.noteContent = textarea.value;
    calState.noteSaveTimeout = setTimeout(() => {
      window.frodigy.invoke('notes:save', { date: calState.selectedDate, content: textarea.value });
    }, 600);
  });

  // Editor Tabs
  document.getElementById('tab-edit').addEventListener('click', () => {
    calState.mode = 'edit';
    document.getElementById('tab-edit').classList.add('active');
    document.getElementById('tab-preview').classList.remove('active');
    textarea.style.display = 'block';
    preview.style.display = 'none';
  });

  document.getElementById('tab-preview').addEventListener('click', () => {
    calState.mode = 'preview';
    document.getElementById('tab-preview').classList.add('active');
    document.getElementById('tab-edit').classList.remove('active');
    textarea.style.display = 'none';
    preview.style.display = 'block';
    // Render markdown
    try {
      if (window.markdown && window.markdown.parse) {
        preview.innerHTML = window.markdown.parse(calState.noteContent || '*No content*');
      } else {
        preview.innerHTML = `<pre>${escapeHtmlCal(calState.noteContent)}</pre>`;
      }
    } catch(e) {
      preview.innerHTML = `<p style="color:var(--accent-red)">Error parsing Markdown.</p>`;
    }
  });

  // Zoom Controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (calState.zoomLevel < 3) calState.zoomLevel += 0.1;
    textarea.style.fontSize = `${calState.zoomLevel}rem`;
    preview.style.fontSize = `${calState.zoomLevel}rem`;
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (calState.zoomLevel > 0.6) calState.zoomLevel -= 0.1;
    textarea.style.fontSize = `${calState.zoomLevel}rem`;
    preview.style.fontSize = `${calState.zoomLevel}rem`;
  });

  // Fullscreen Toggle
  document.getElementById('btn-expand').addEventListener('click', (e) => {
    calState.isFullscreen = !calState.isFullscreen;
    if (calState.isFullscreen) {
      noteContainer.classList.add('note-fullscreen');
      e.target.textContent = '⤡';
    } else {
      noteContainer.classList.remove('note-fullscreen');
      e.target.textContent = '⤢';
    }
  });

  rebuildCalGrid();
  await loadNote(calState.selectedDate);
}

async function rebuildCalGrid() {
  const grid = document.getElementById('cal-grid');
  const titleEl = document.getElementById('cal-month-title');
  titleEl.textContent = `${MONTH_NAMES[calState.month]} ${calState.year}`;

  const today = new Date();
  const todayISO = formatDateISO(today);

  const firstDay = new Date(calState.year, calState.month, 1).getDay();
  const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();

  let html = DAY_HEADERS.map((d, i) => {
    const isWeekendHeader = (i === 0 || i === 6); // SU=0, SA=6
    return `<div class="cal-header-cell${isWeekendHeader ? ' weekend-header' : ''}">${d}</div>`;
  }).join('');

  const notesWithContent = await window.frodigy.invoke('notes:get-month', { year: calState.year, month: calState.month + 1 });

  // Blank cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${calState.year}-${String(calState.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dow = new Date(calState.year, calState.month, day).getDay();
    const isToday = dateISO === todayISO;
    const isSelected = dateISO === calState.selectedDate;
    const isWeekend = dow === 0 || dow === 6;
    const isBoldDay = dow >= 1 && dow <= 5; // Mon-Fri bold

    let classes = 'cal-day';
    if (isToday) classes += ' today';
    if (isSelected && !isToday) classes += ' selected';
    if (isWeekend) classes += ' weekend';
    if (isBoldDay) classes += ' bold-day';
    if (notesWithContent.includes(dateISO)) classes += ' has-note';

    html += `<div class="${classes}" data-date="${dateISO}">${day}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', async () => {
      calState.selectedDate = el.dataset.date;
      rebuildCalGrid();
      await loadNote(calState.selectedDate);
    });
  });
}

function generateDefaultTemplate(date) {
  const displayDate = formatDateDisplay(date);
  return `# ${displayDate}
### What I focused on today

- 
- 
- 

`;
}

async function loadNote(date) {
  const titleEl = document.getElementById('note-title');
  const textarea = document.getElementById('note-textarea');
  if (titleEl) titleEl.textContent = `Note for ${formatDateDisplay(date)}`;

  const note = await window.frodigy.invoke('notes:get', { date });
  
  // If note is brand new (empty), pre-fill with a structured template
  if (!note.content && note.updated_at === null) {
    calState.noteContent = generateDefaultTemplate(date);
  } else {
    calState.noteContent = note.content || '';
  }
  
  if (textarea) {
    textarea.value = calState.noteContent;
    // If template was just inserted, place cursor at the first empty bullet
    if (!note.content && note.updated_at === null) {
      setTimeout(() => {
        const firstBulletPos = textarea.value.indexOf('- \n') + 2;
        if (firstBulletPos > 1) {
          textarea.setSelectionRange(firstBulletPos, firstBulletPos);
        }
      }, 50);
    }
  }
}

function formatDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function escapeHtmlCal(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
