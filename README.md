# Frodigy

![Frodigy Banner](./frodigy_preview.jpg)

**Frodigy** is a beautiful, offline desktop productivity application built on Electron, Node.js, and Vanilla JavaScript. It is designed to act as your personalized, distraction-free command center for modern work sessions.

## 🚀 Features

- **Dashboard**: Track your daily routines and outstanding one-time tasks.
  - Custom-interval recurring tasks that auto-refresh based on your habits.
  - Subtask support for larger projects.
  - Optional due dates and reminder times for important one-time tasks.
- **Calendar & Daily Notes**: Never miss a beat with a visual calendar grid hooked up to an offline memory system.
  - Distraction-free full-screen editor mode (`⤢`).
  - Sanitized offline `.md` preview using `marked.js` with A-/A+ accessibility zoom features.
- **Advanced Timers**: Keep yourself accountable with custom multi-timers based on the native Web Audio API.
  - "Sticky" un-ignorable popup modals that force you to manually dismiss alarms.
  - Seamless fallback mechanisms for custom user audio (place a `custom-alarm.mp3` in the app directory for personalized sounds!).
- **Statistics & Summaries**: Your very own productivity tracker for completed tasks, focus sessions, structured activity logs, and progress history.
- **Journey Dashboard**: A personal greeting, inclusive life-day number, today's due routines, current projects, and local consistency tracking.
- **Local Backup & Restore**: Human-readable JSON exports, manual local backups, validated replace-only restore, and an automatic safety backup before import.
- **Dynamic Themes**: Fully equipped design system with easy switching between Amber Abyss, Warm Light, and High Contrast.

## 🛠️ Technologies Used

- **Electron** (v35.x LTS)
- **Node.js** (Vanilla JS with isolated contexts)
- **better-sqlite3** for lightning-fast, zero-configuration local persistence.
- **marked** for reliable, offline markdown rendering.

## 📦 Setup & Installation

### Running Locally
To run this application locally from the source code:

1. Clone the repository:
   ```bash
   git clone https://github.com/UnExplainableFish52/Frodigy.git
   cd Frodigy
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

### Building the Executable
To package the app into a standalone Windows `.exe`:
```bash
npm run dist
```
The resulting executable will be available inside the generated `dist/` directory.

## 🔒 Data Privacy
Because Frodigy is an offline-first desktop application, your task records, calendar notes, and timer statistics *never* leave your local machine. All data is securely persisted in Electron's local `userData` directory as `frodigy.sqlite`.

The Settings page shows the exact database and backup-folder locations. Manual backups contain all user-created Frodigy data and settings in a versioned JSON document. Import is replace-only: Frodigy validates the selected backup, warns before replacement, and creates a safety backup of the current data first. SQLite integrity is checked during startup; damaged database files are preserved with a `.corrupt-*` suffix before a fresh local database is created.
