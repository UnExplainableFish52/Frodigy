const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { initializeDatabase, getDatabase } = require('./db');
const { registerAllHandlers } = require('./ipc-handlers');
const { applyStartWithWindowsSetting } = require('./startup');
const { recordAppOpen } = require('./journey-service');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const APP_ID = 'com.theidealdev.frodigy';
const APP_ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icons', 'icon.ico');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    fullscreen: true,
    backgroundColor: '#111115',
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  const devServerUrl = process.env.FRODIGY_RENDERER_URL;
  const builtRendererPath = path.join(__dirname, '..', 'renderer-dist', 'index.html');
  const legacyRendererPath = path.join(__dirname, '..', 'renderer', 'index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(require('fs').existsSync(builtRendererPath) ? builtRendererPath : legacyRendererPath);
  }

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(true);
    }
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
  let icon = nativeImage.createFromPath(APP_ICON_PATH);

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

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

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
      recordAppOpen();
      registerAllHandlers();

      // Apply Windows startup setting from DB
      try {
        const db = getDatabase();
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('start_with_windows');
        const shouldAutoStart = row && row.value === 'true';
        applyStartWithWindowsSetting(shouldAutoStart);
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
