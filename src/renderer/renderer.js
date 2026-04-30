// ═══════════════════════════════════════════════════════════
// Renderer — Page Router & App Initialization
// ═══════════════════════════════════════════════════════════

const pageRenderers = {
  dashboard: 'renderDashboard',
  schedule: 'renderSchedule',
  calendar: 'renderCalendar',
  timers: 'renderTimers',
  completed: 'renderCompleted',
  summary: 'renderSummary',
  settings: 'renderSettings',
  about: 'renderAbout',
};

const pageContent = document.getElementById('page-content');
const navItems = document.querySelectorAll('.nav-item');

async function navigateTo(page) {
  // Update nav active state
  navItems.forEach(item => {
    if (item.dataset.page === page) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Clear and render
  pageContent.innerHTML = '';
  const renderFnName = pageRenderers[page];
  const renderFn = renderFnName ? window[renderFnName] : null;
  if (renderFn) {
    await renderFn(pageContent);
  } else {
    pageContent.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Page Load Error</h1>
        <p class="page-subtitle">Unable to load "${page}" page renderer.</p>
      </div>
    `;
  }
}

function getPageFromHash() {
  const hash = window.location.hash.replace('#', '');
  return pageRenderers[hash] ? hash : 'dashboard';
}

// Hash change listener
window.addEventListener('hashchange', () => {
  navigateTo(getPageFromHash());
});

// Keyboard shortcuts
const pageKeys = ['dashboard', 'schedule', 'calendar', 'timers', 'completed', 'summary', 'settings', 'about'];
document.addEventListener('keydown', (e) => {
  // Ctrl + 1-8
  if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    const page = pageKeys[parseInt(e.key, 10) - 1];
    window.location.hash = '#' + page;
    return;
  }

  // Ctrl + Tab
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const currentPage = getPageFromHash();
    let currentIndex = pageKeys.indexOf(currentPage);
    if (currentIndex === -1) currentIndex = 0;
    
    if (e.shiftKey) {
      currentIndex = (currentIndex - 1 + pageKeys.length) % pageKeys.length;
    } else {
      currentIndex = (currentIndex + 1) % pageKeys.length;
    }
    window.location.hash = '#' + pageKeys[currentIndex];
    return;
  }

  // Ctrl + Q
  if (e.ctrlKey && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    window.frodigy.invoke('app:hide');
    return;
  }

  // Ctrl + T
  if (e.ctrlKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    if (window.showAddTaskModal) {
      window.showAddTaskModal('one_time');
    } else {
      window.location.hash = '#dashboard';
      setTimeout(() => {
        if (window.showAddTaskModal) window.showAddTaskModal('one_time');
      }, 100);
    }
    return;
  }

  // Ctrl + N
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    window.location.hash = '#calendar';
    setTimeout(() => {
      const textarea = document.getElementById('note-textarea');
      if (textarea) textarea.focus();
    }, 100);
    return;
  }
});

// Global error catcher for debugging
window.addEventListener('error', (e) => {
  document.body.innerHTML = `<div style="color:red; background:white; padding:20px; z-index:99999; position:absolute; top:0; left:0; right:0; bottom:0;">
    <h2>Renderer Crash:</h2>
    <pre>${e.error ? e.error.stack : e.message}</pre>
  </div>`;
});
window.addEventListener('unhandledrejection', (e) => {
  document.body.innerHTML = `<div style="color:red; background:white; padding:20px; z-index:99999; position:absolute; top:0; left:0; right:0; bottom:0;">
    <h2>Unhandled Promise Rejection:</h2>
    <pre>${e.reason ? e.reason.stack || e.reason : e}</pre>
  </div>`;
});

// Initial load
(async () => {
  try {
    let theme = await window.frodigy.invoke('settings:get', { key: 'theme' }) || 'neon_abyss';
    // Map legacy theme names
    if (theme === 'vibrant_gold') theme = 'warm_light';
    document.documentElement.setAttribute('data-theme', theme);
    navigateTo(getPageFromHash());
  } catch (err) {
    document.body.innerHTML = `<div style="color:red; background:white; padding:20px; z-index:99999; position:absolute; top:0; left:0; right:0; bottom:0;">
      <h2>Init Crash:</h2>
      <pre>${err.stack || err.message}</pre>
    </div>`;
  }
})();
