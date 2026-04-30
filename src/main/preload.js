const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

const APP_VERSION = require('../../package.json').version;

contextBridge.exposeInMainWorld('markdown', {
  parse: (text) => marked.parse(text)
});

contextBridge.exposeInMainWorld('frodigy', {
  version: APP_VERSION,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
