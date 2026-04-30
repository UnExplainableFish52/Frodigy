const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { initializeDatabase, getDatabase } = require('./db');
const { registerAllHandlers } = require('./ipc-handlers');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#111115',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, '..', '..', 'calendar_notes.png');
  let icon = nativeImage.createFromPath(trayIconPath);

  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Frodigy');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Frodigy',
      click: () => {
        if (!mainWindow) {
          return;
        }

        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }

    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady()
    .then(() => {
      initializeDatabase(app.getPath('userData'));
      registerAllHandlers();

      // Apply Windows startup setting from DB
      try {
        const db = getDatabase();
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('start_with_windows');
        const shouldAutoStart = row && row.value === 'true';
        app.setLoginItemSettings({
          openAtLogin: shouldAutoStart,
          args: ['--startup']
        });
      } catch (e) {
        // Settings table may not exist yet on first run
      }

      createMainWindow();
      createTray();

      // If launched via startup (minimized to tray), hide the window
      const isStartup = process.argv.includes('--startup');
      if (isStartup && mainWindow) {
        mainWindow.once('ready-to-show', () => {
          mainWindow.hide();
        });
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        } else if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    })
    .catch((error) => {
      console.error('Failed to initialize Frodigy app:', error);
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      return;
    }

    app.quit();
  });
}
