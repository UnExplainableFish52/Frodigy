// ═══════════════════════════════════════════════════════════
// About Page — Premium showcase with features, workflow & FAQ
// ═══════════════════════════════════════════════════════════

// eslint-disable-next-line no-unused-vars
async function renderAbout(container) {
  const version = window.frodigy?.version || '1.6.13';

  container.innerHTML = `
    <!-- ═══ Hero Section ═══ -->
    <div class="about-hero">
      <div class="about-hero-logo">
        <svg class="about-logo-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h1 class="about-hero-title">Frodigy</h1>
      <p class="about-hero-subtitle">Prodigy-level productivity. Zero distractions. Fully yours.</p>
      <span class="about-hero-version">v${version} | Open Source | Offline-First | Free Forever</span>
    </div>

    <!-- ═══ Features Section ═══ -->
    <div class="about-section">
      <h2 class="about-section-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Features
      </h2>
      <div class="about-features-grid">
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <h3>Smart Dashboard</h3>
          <p>Recurring and one-time tasks with subtasks, daily motivational quotes, and a clean overview of your day.</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h3>Calendar & Journal</h3>
          <p>Full markdown diary with preview mode, zoom controls, and distraction-free writing. Pre-formatted templates for fast journaling.</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3>Focus Timers</h3>
          <p>Create unlimited custom timers. Pomodoro, deep work, breaks — track your sessions and stay accountable.</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
          </div>
          <h3>Daily Schedule</h3>
          <p>Block your day into focused time slots. Get native desktop notifications when it's time to switch tasks.</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3>100% Private</h3>
          <p>No cloud. No accounts. No telemetry. Your data lives on your machine and nowhere else. Period.</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>
          </div>
          <h3>Keyboard-First</h3>
          <p>Navigate with Ctrl+1-8, add tasks with Ctrl+T, write notes with Ctrl+N. Every action has a shortcut.</p>
        </div>
      </div>
    </div>

    <!-- ═══ Workflow Section ═══ -->
    <div class="about-section">
      <h2 class="about-section-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        How to Use Frodigy
      </h2>
      <div class="about-workflow">
        <div class="about-workflow-step">
          <div class="about-step-number">1</div>
          <div class="about-step-content">
            <h4>Plan Your Day</h4>
            <p>Open the Dashboard and add your recurring habits and one-time tasks. Break big tasks into subtasks for clarity.</p>
          </div>
        </div>
        <div class="about-workflow-step">
          <div class="about-step-number">2</div>
          <div class="about-step-content">
            <h4>Set Your Schedule</h4>
            <p>Go to Schedule and block your time. You'll get desktop notifications when it's time to switch — no need to watch the clock.</p>
          </div>
        </div>
        <div class="about-workflow-step">
          <div class="about-step-number">3</div>
          <div class="about-step-content">
            <h4>Work With Timers</h4>
            <p>Create focus timers for deep work sessions. Track how many minutes you've put in. Build accountability over time.</p>
          </div>
        </div>
        <div class="about-workflow-step">
          <div class="about-step-number">4</div>
          <div class="about-step-content">
            <h4>Journal Daily</h4>
            <p>End each day in Calendar & Notes. The pre-formatted template helps you quickly log what you worked on, so nothing gets forgotten.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ FAQ Section ═══ -->
    <div class="about-section">
      <h2 class="about-section-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Frequently Asked Questions
      </h2>

      <div class="about-faq-list">
        <details class="about-faq-item">
          <summary class="about-faq-question">Why Frodigy?</summary>
          <div class="about-faq-answer">
            <p>I developed this application because I felt a strong need for a time management tool that lets me plan my workdays and weeks, while also providing a space for daily journaling. This allows me to look back over an entire month, see what I have accomplished, and keep track of pending tasks so nothing gets missed. This workflow is crucial for anyone in their development phase, especially students and individuals with hectic lifestyles.</p>
            <p>When I searched for existing solutions, I ended up downloading multiple apps just to maintain this single workflow. Most of these tools were corporate products that sent my data over a network to unknown servers, often bloated with adware and privacy concerns. To solve this, I built Frodigy: a reliable, free, and open source solution. Since it is open for anyone to inspect, you don't need to blindly trust anyone. Your data stays yours.</p>
          </div>
        </details>

        <details class="about-faq-item">
          <summary class="about-faq-question">Why Free & Open Source?</summary>
          <div class="about-faq-answer">
            <p>FOSS means Free Open Source Software. It is not just a license, it is a philosophy.</p>
            <p>Growing up, I used many tools built by generous developers. Now that I am in a position to contribute, it feels right to give back. Everyone deserves good tools without strings attached.</p>
          </div>
        </details>

        <details class="about-faq-item">
          <summary class="about-faq-question">Who built this?</summary>
          <div class="about-faq-answer">
            <p><strong>Saksham Sharma</strong>, under the aliases <strong>TheIdealDev52</strong> and <strong>UnExplainableFish52</strong>, built this app along with <strong>Shelly</strong> (AI Agent).</p>
            <p>The main motive was a hunger for clean, free, and high quality software, because everyone deserves it!</p>
          </div>
        </details>

        <details class="about-faq-item">
          <summary class="about-faq-question">How can I contribute?</summary>
          <div class="about-faq-answer">
            <p>You'll find this repository at <a href="#" class="about-link" data-url="https://github.com/UnExplainableFish52/Frodigy">github.com/UnExplainableFish52/Frodigy</a></p>
            <p>Follow the profile to stay updated. Support by giving stars, it genuinely helps with visibility and motivation.</p>
            <p>Pull requests, bug reports, and feature suggestions are always welcome. Every bit of contribution counts.</p>
            <p>If you want to support financially, reach out at:</p>
            <ul class="about-contact-list">
              <li>sharma@saksham.info.np</li>
              <li>contactsaksham52@gmail.com</li>
              <li>info@sakshamsharma.com.np</li>
            </ul>
          </div>
        </details>

        <details class="about-faq-item">
          <summary class="about-faq-question">What license is this under?</summary>
          <div class="about-faq-answer">
            <p>Frodigy is released under the <strong>GNU General Public License v3.0</strong>. This ensures that the software remains free and open for the community, and prevents it from being made proprietary by corporate entities.</p>
          </div>
        </details>

        <details class="about-faq-item">
          <summary class="about-faq-question">Where can I give feedback?</summary>
          <div class="about-faq-answer">
            <p>Open an issue on <a href="#" class="about-link" data-url="https://github.com/UnExplainableFish52/Frodigy/issues">GitHub Issues</a> for bugs and feature requests.</p>
            <p>For general feedback or anything else, email any of the addresses listed above. We read every message.</p>
          </div>
        </details>
      </div>
    </div>

    <!-- ═══ Footer ═══ -->
    <div class="about-footer">
      <p>Made with focus and intention | Frodigy v${version}</p>
    </div>
  `;

  // Wire up external links
  container.querySelectorAll('.about-link[data-url]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.frodigy.invoke('app:open-external', el.dataset.url);
    });
  });
}
