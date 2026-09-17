'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Only named application operations cross the isolated renderer boundary.
contextBridge.exposeInMainWorld(
  'studio',
  Object.freeze({
    openProject: () => ipcRenderer.invoke('studio:open-project'),
    refreshProject: () => ipcRenderer.invoke('studio:refresh-project'),
    render: (request) => ipcRenderer.invoke('studio:render', request),
    loadDrafts: (projectId) => ipcRenderer.invoke('studio:load-drafts', projectId),
    saveDrafts: (envelope) => ipcRenderer.invoke('studio:save-drafts', envelope),
  }),
);
