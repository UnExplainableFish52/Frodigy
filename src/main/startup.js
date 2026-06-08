const { app } = require('electron');

const STARTUP_ARGS = ['--startup'];

function applyStartWithWindowsSetting(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath,
    args: STARTUP_ARGS
  });
}

function getStartWithWindowsSetting() {
  return app.getLoginItemSettings({
    path: process.execPath,
    args: STARTUP_ARGS
  }).openAtLogin;
}

module.exports = {
  applyStartWithWindowsSetting,
  getStartWithWindowsSetting
};
