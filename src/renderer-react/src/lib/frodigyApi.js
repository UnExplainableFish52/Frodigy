const bridge = () => window.frodigy;

function invoke(channel, payload) {
  return bridge().invoke(channel, payload);
}

export const frodigyApi = {
  version: () => bridge()?.version || '1.6.13',
  on: (channel, callback) => bridge().on(channel, callback),
  tasks: {
    listToday: () => invoke('tasks:list-today'),
    create: (payload) => invoke('tasks:create', payload),
    toggleRecurring: (payload) => invoke('tasks:toggle-recurring', payload),
    completeOneTime: (taskId) => invoke('tasks:complete-onetime', { taskId }),
    delete: (taskId) => invoke('tasks:delete', { taskId })
  },
  subtasks: {
    add: (payload) => invoke('subtasks:add', payload),
    toggle: (payload) => invoke('subtasks:toggle', payload)
  },
  notes: {
    get: (date) => invoke('notes:get', { date }),
    getMonth: (year, month) => invoke('notes:get-month', { year, month }),
    save: (date, content) => invoke('notes:save', { date, content })
  },
  timers: {
    list: () => invoke('timers:list'),
    create: (payload) => invoke('timers:create', payload),
    updateState: (payload) => invoke('timers:update-state', payload),
    delete: (timerId) => invoke('timers:delete', { timerId })
  },
  schedule: {
    list: () => invoke('schedule:list'),
    create: (payload) => invoke('schedule:create', payload),
    update: (payload) => invoke('schedule:update', payload),
    delete: (id) => invoke('schedule:delete', { id })
  },
  activities: {
    create: (payload) => invoke('activities:create', payload),
    delete: (id) => invoke('activities:delete', { id })
  },
  settings: {
    get: (key) => invoke('settings:get', { key }),
    getAll: () => invoke('settings:get-all'),
    set: (key, value) => invoke('settings:set', { key, value })
  },
  stats: {
    summary: () => invoke('stats:get-summary')
  },
  completed: {
    list: () => invoke('tasks:list-completed')
  },
  journey: {
    dashboard: () => invoke('journey:get-dashboard'),
    profile: () => invoke('journey:get-profile'),
    updateProfile: (payload) => invoke('journey:update-profile', payload),
    chooseProfileAvatar: () => invoke('journey:choose-profile-avatar'),
    clearProfileAvatar: () => invoke('journey:clear-profile-avatar'),
    history: (payload) => invoke('journey:get-history', payload),
    consistency: () => invoke('journey:get-consistency'),
    toggleRecurring: (payload) => invoke('journey:toggle-recurring', payload)
  },
  projects: {
    complete: (taskId) => invoke('projects:complete', { taskId }),
    reopen: (taskId) => invoke('projects:reopen', { taskId }),
    completed: (payload) => invoke('projects:list-completed', payload)
  },
  data: {
    exportBackup: () => invoke('data:export-backup'),
    createBackup: () => invoke('data:create-backup'),
    importBackup: () => invoke('data:import-backup'),
    locations: () => invoke('data:get-locations'),
    openFolder: (kind) => invoke('data:open-folder', { kind }),
    health: () => invoke('data:get-health')
  },
  app: {
    hide: () => invoke('app:hide'),
    checkForUpdates: () => invoke('app:check-for-updates'),
    openExternal: (url) => invoke('app:open-external', url)
  },
  markdown: {
    parse: (content) => window.markdown?.parse(content) || content
  }
};
