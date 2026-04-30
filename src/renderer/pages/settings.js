// ═══════════════════════════════════════════════════════════
// Settings Page
// ═══════════════════════════════════════════════════════════

const GITHUB_RELEASES_URL = 'https://github.com/UnEliteFish52/frodigy/releases';

const THEMES = [
  { id: 'neon_abyss', label: 'Amber Abyss', desc: 'Warm charcoal with amber & sage accents' },
  { id: 'high_contrast', label: 'High Contrast', desc: 'Maximum visibility dark theme' },
  { id: 'warm_light', label: 'Warm Light', desc: 'Clean whites with warm amber accents' },
];

const WEEKEND_OPTIONS = [
  { value: 'saturday', label: 'Saturday Only' },
  { value: 'saturday_sunday', label: 'Saturday & Sunday' },
];

// eslint-disable-next-line no-unused-vars
async function renderSettings(container) {
  const allSettings = await window.frodigy.invoke('settings:get-all');
  // Map legacy theme names
  let currentTheme = allSettings.theme || 'neon_abyss';
  if (currentTheme === 'vibrant_gold') currentTheme = 'warm_light';
  const startWithWindows = allSettings.start_with_windows === 'true';
  const weekendMode = allSettings.weekend_mode || 'saturday';

  const paletteIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.65 1.5-1.5 0-.39-.15-.74-.39-1.02-.23-.27-.37-.62-.37-1.02C12.76 15.65 13.52 15 14.5 15H16c3.31 0 6-2.69 6-6 0-5.52-4.48-10-10-10z"/></svg>';
  const infoIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">${paletteIcon} APPEARANCE</div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>App Theme</h4>
          <p>Choose the aesthetic that fits your workspace</p>
        </div>
        <div class="radio-group" id="theme-radios">
          ${THEMES.map(t => `
            <div class="radio-option ${t.id === currentTheme ? 'selected' : ''}" data-theme-val="${t.id}">
              <div class="radio-circle"><div class="radio-circle-inner"></div></div>
              <div>
                <span style="font-weight: 600;">${t.label}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">${t.desc}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">GENERAL</div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>Start with Windows</h4>
          <p>Launch Frodigy minimized to tray on startup</p>
        </div>
        <button class="toggle ${startWithWindows ? 'active' : ''}" id="toggle-startup"></button>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>Weekend Setup</h4>
          <p>Mute calendar days for weekends</p>
        </div>
        <select class="form-select" id="weekend-select" style="width:200px">
          ${WEEKEND_OPTIONS.map(o => `
            <option value="${o.value}" ${o.value === weekendMode ? 'selected' : ''}>${o.label}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">${infoIcon} ABOUT</div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>Version</h4>
          <p>Current app version</p>
        </div>
        <span class="version-badge">v${window.frodigy.version}</span>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>Updates</h4>
          <p id="update-status">Check for the latest version</p>
        </div>
        <div class="update-actions">
          <button class="btn btn-secondary" id="check-updates-btn">Check for Updates</button>
          <button class="btn btn-secondary" id="releases-btn" title="View releases on GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Theme radio handlers
  container.querySelectorAll('.radio-option').forEach(el => {
    el.addEventListener('click', async () => {
      const theme = el.dataset.themeVal;
      container.querySelectorAll('.radio-option').forEach(r => r.classList.remove('selected'));
      el.classList.add('selected');
      await window.frodigy.invoke('settings:set', { key: 'theme', value: theme });
      document.documentElement.setAttribute('data-theme', theme);
    });
  });

  // Start with Windows toggle
  const toggle = document.getElementById('toggle-startup');
  toggle.addEventListener('click', async () => {
    const isActive = toggle.classList.toggle('active');
    await window.frodigy.invoke('settings:set', { key: 'start_with_windows', value: String(isActive) });
  });

  // Weekend select
  const weekendSelect = document.getElementById('weekend-select');
  weekendSelect.addEventListener('change', async () => {
    await window.frodigy.invoke('settings:set', { key: 'weekend_mode', value: weekendSelect.value });
  });

  // Check for updates button
  const checkUpdatesBtn = document.getElementById('check-updates-btn');
  const updateStatus = document.getElementById('update-status');

  checkUpdatesBtn.addEventListener('click', async () => {
    checkUpdatesBtn.disabled = true;
    checkUpdatesBtn.textContent = 'Checking...';
    updateStatus.textContent = 'Checking for updates...';

    try {
      const result = await window.frodigy.invoke('app:check-for-updates');

      if (result.success) {
        if (result.hasUpdate) {
          updateStatus.innerHTML = `<span class="update-available">Update available: v${result.latestVersion}</span>`;
          checkUpdatesBtn.textContent = 'Update Available!';
          checkUpdatesBtn.classList.add('has-update');
        } else {
          updateStatus.textContent = 'You are running the latest version';
          checkUpdatesBtn.textContent = 'Check for Updates';
        }
      } else {
        updateStatus.textContent = `Unable to check: ${result.error}`;
        checkUpdatesBtn.textContent = 'Check for Updates';
      }
    } catch (err) {
      updateStatus.textContent = 'Failed to check for updates';
      checkUpdatesBtn.textContent = 'Check for Updates';
    }

    checkUpdatesBtn.disabled = false;
  });

  // Open GitHub releases button
  const releasesBtn = document.getElementById('releases-btn');
  releasesBtn.addEventListener('click', async () => {
    await window.frodigy.invoke('app:open-external', GITHUB_RELEASES_URL);
  });
}
