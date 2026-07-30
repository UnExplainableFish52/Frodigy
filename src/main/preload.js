const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

const APP_VERSION = require('../../package.json').version;

const ALLOWED_TAGS = new Set([
  'A', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HR', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG',
  'UL'
]);
const ALLOWED_ATTRIBUTES = {
  A: new Set(['href', 'title'])
};
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const ALLOWED_INVOKE_CHANNELS = new Set([
  'tasks:create', 'tasks:list-today', 'tasks:toggle-recurring', 'tasks:complete-onetime', 'tasks:delete', 'tasks:list-completed',
  'subtasks:add', 'subtasks:toggle', 'subtasks:delete',
  'notes:get-month', 'notes:get', 'notes:save',
  'timers:create', 'timers:list', 'timers:update-state', 'timers:delete', 'timers:notify',
  'settings:get', 'settings:get-all', 'settings:set',
  'stats:get-summary',
  'activities:create', 'activities:delete',
  'schedule:create', 'schedule:list', 'schedule:update', 'schedule:delete',
  'app:hide', 'app:get-version', 'app:check-for-updates', 'app:open-external',
  'journey:get-dashboard', 'journey:get-profile', 'journey:update-profile', 'journey:choose-profile-avatar', 'journey:clear-profile-avatar', 'journey:get-history', 'journey:get-consistency',
  'journey:toggle-recurring', 'projects:complete', 'projects:reopen', 'projects:list-completed',
  'data:export-backup', 'data:create-backup', 'data:import-backup', 'data:get-locations', 'data:open-folder', 'data:get-health'
]);
const ALLOWED_EVENT_CHANNELS = new Set(['timer:completed']);

function sanitizeMarkdownHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const sanitizeNode = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ''));
          continue;
        }

        const allowedAttributes = ALLOWED_ATTRIBUTES[child.tagName] || new Set();
        for (const attribute of [...child.attributes]) {
          if (!allowedAttributes.has(attribute.name.toLowerCase())) {
            child.removeAttribute(attribute.name);
            continue;
          }

          if (child.tagName === 'A' && attribute.name.toLowerCase() === 'href') {
            try {
              const parsedUrl = new URL(attribute.value, window.location.href);
              if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
                child.removeAttribute(attribute.name);
              }
            } catch (err) {
              child.removeAttribute(attribute.name);
            }
          }
        }

        if (child.tagName === 'A') {
          child.setAttribute('rel', 'noreferrer');
        }
      }

      sanitizeNode(child);
    }
  };

  sanitizeNode(template.content);
  return template.innerHTML;
}

contextBridge.exposeInMainWorld('markdown', {
  parse: (text) => sanitizeMarkdownHtml(marked.parse(text))
  parse: (text) => sanitizeMarkdownHtml(marked.parse(text))
});

contextBridge.exposeInMainWorld('frodigy', {
  version: APP_VERSION,
  invoke: (channel, ...args) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel is not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  invoke: (channel, ...args) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel is not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      throw new Error(`IPC event channel is not allowed: ${channel}`);
    }
    if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
      throw new Error(`IPC event channel is not allowed: ${channel}`);
    }
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
