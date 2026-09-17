'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function serviceValue(reply) {
  if (
    reply &&
    typeof reply === 'object' &&
    !Array.isArray(reply) &&
    Object.keys(reply).length === 1 &&
    Object.prototype.hasOwnProperty.call(reply, '_studioServiceError')
  ) {
    const failure = reply._studioServiceError;
    if (
      !failure ||
      typeof failure !== 'object' ||
      failure.version !== 1 ||
      typeof failure.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(failure.code) ||
      typeof failure.message !== 'string' ||
      failure.message.length > 16_384
    )
      throw new Error('O serviço devolveu uma resposta de erro inválida.');
    // contextBridge copies Error.message, but discards custom Error fields.
    // The renderer normalizes this bounded prefix into its own Error.code.
    throw new Error(`[STUDIO:${failure.code}] ${failure.message}`);
  }
  return reply;
}

// Only named application operations cross the isolated renderer boundary.
contextBridge.exposeInMainWorld(
  'studio',
  Object.freeze({
    copyText: (text) => ipcRenderer.invoke('studio:copy-text', text),
    recordUsage: (event) => ipcRenderer.invoke('studio:usage', event),
    invoke: async (method, params = {}) =>
      serviceValue(await ipcRenderer.invoke('studio:invoke', method, params)),
    onEvent: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on('studio:event', wrapped);
      return () => ipcRenderer.removeListener('studio:event', wrapped);
    },
    openProject: () => ipcRenderer.invoke('studio:open-project'),
    refreshProject: () => ipcRenderer.invoke('studio:refresh-project'),
    render: (request) => ipcRenderer.invoke('studio:render', request),
    loadDrafts: (projectId) => ipcRenderer.invoke('studio:load-drafts', projectId),
    saveDrafts: (envelope) => ipcRenderer.invoke('studio:save-drafts', envelope),
  }),
);
