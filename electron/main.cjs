'use strict';

const { app, BrowserWindow, dialog, ipcMain, net, protocol, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DraftStore } = require('./draft-store.cjs');
const { PythonWorker } = require('./python-worker.cjs');
const validate = require('./validation.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const DEV_URL = 'http://127.0.0.1:5173/';
const applicationDirectory = path.resolve(__dirname, '..');
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; object-src blob:; frame-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'";
const development = !app.isPackaged && process.env.PYDICATE_STUDIO_DEV === '1';
const entryURL = development ? DEV_URL : 'studio://app/index.html';
const knownProjects = new Set(['example:araujo-0067']);
let window;
let worker;
let activeProject;
let projectChanging = false;
let drafts;

function isApplicationURL(raw) {
  try {
    const url = new URL(raw);
    const expected = new URL(entryURL);
    return (
      url.protocol === expected.protocol &&
      url.host === expected.host &&
      url.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

function verifySender(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isApplicationURL(event.senderFrame.url)
  ) {
    throw new Error('Origem da operação não autorizada.');
  }
}

function authorizeProject(projectId) {
  validate.id(projectId, 'projeto');
  if (!knownProjects.has(projectId))
    throw new Error('Abra este projeto antes de acessar seus rascunhos.');
}

function createWorker() {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'python')
    : path.join(applicationDirectory, 'python');
  return new PythonWorker({
    script: path.join(directory, 'worker.py'),
    stateDirectory: path.join(app.getPath('userData'), 'projects'),
  });
}

async function changeProject(callback) {
  if (projectChanging) throw new Error('Aguarde a abertura ou atualização do projeto.');
  projectChanging = true;
  try {
    return await callback();
  } finally {
    projectChanging = false;
  }
}

function installBridge() {
  const handle = (channel, arity, callback) =>
    ipcMain.handle(channel, (event, ...args) => {
      verifySender(event);
      if (args.length !== arity) throw new Error('Argumentos inesperados.');
      return callback(...args);
    });
  handle('studio:open-project', 0, () =>
    changeProject(async () => {
      const selection = await dialog.showOpenDialog(window, {
        title: 'Abrir projeto Pydicate',
        message: 'Escolha a pasta que contém oldtupicorpus e nhe-enga.',
        buttonLabel: 'Abrir projeto',
        properties: ['openDirectory'],
      });
      if (selection.canceled || selection.filePaths.length !== 1) return null;
      const candidate = createWorker();
      try {
        const project = validate.project(
          await candidate.request('open_project', { parentPath: selection.filePaths[0] }),
        );
        worker?.close();
        worker = candidate;
        activeProject = project;
        knownProjects.add(project.id);
        return project;
      } catch (error) {
        candidate.close();
        throw error;
      }
    }),
  );
  handle('studio:refresh-project', 0, () =>
    changeProject(async () => {
      if (!worker || !activeProject)
        throw new Error('Abra um projeto local para atualizar suas fontes.');
      const project = validate.project(await worker.request('refresh_project', {}));
      if (project.id !== activeProject.id)
        throw new Error('A identidade do projeto mudou. Reabra o projeto.');
      activeProject = project;
      return project;
    }),
  );
  handle('studio:render', 1, async (request) => {
    validate.renderRequest(request);
    if (projectChanging)
      throw new Error('O projeto está sendo atualizado. Aguarde para verificar.');
    if (!worker || !activeProject)
      throw new Error('Abra um projeto local para verificar com o motor Python.');
    if (request.engineFingerprint !== activeProject.engineFingerprint)
      throw new Error('A versão do motor mudou. Atualize o projeto antes de verificar.');
    const result = validate.renderResult(await worker.request('render', request));
    if (
      result.revisionId !== request.revisionId ||
      result.engineFingerprint !== request.engineFingerprint
    )
      throw new Error('A realização pertence a uma versão anterior. Verifique novamente.');
    return result;
  });
  handle('studio:load-drafts', 1, (projectId) => {
    authorizeProject(projectId);
    return drafts.load(projectId);
  });
  handle('studio:save-drafts', 1, (envelope) => {
    validate.envelope(envelope);
    authorizeProject(envelope.projectId);
    return drafts.save(envelope);
  });
}

function serveApplication() {
  const directory = path.join(applicationDirectory, 'dist');
  protocol.handle('studio', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || request.method !== 'GET')
        return new Response('Not found', { status: 404 });
      const target = path.resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      const relative = path.relative(directory, target);
      if (relative.startsWith('..') || path.isAbsolute(relative))
        return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(target).toString());
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1512,
    height: 982,
    minWidth: 820,
    minHeight: 620,
    title: 'Pydicate Studio',
    backgroundColor: '#f4f1eb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isApplicationURL(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    window = null;
  });
  await window.loadURL(entryURL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // One writer owns each userData directory, including its draft and identity stores.
  app.on('second-instance', () => {
    if (!window) {
      if (app.isReady()) createWindow().catch(showStartupError);
      return;
    }
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      drafts = new DraftStore(path.join(app.getPath('userData'), 'drafts'));
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      serveApplication();
      installBridge();
      await createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(showStartupError);
      });
    })
    .catch(showStartupError);
}

function showStartupError(error) {
  dialog.showErrorBox(
    'Pydicate Studio não conseguiu abrir',
    `${error.message}\n\nNo checkout de desenvolvimento, execute npm run desktop; para abrir a versão compilada, execute npm run build e npm start.`,
  );
  app.quit();
}

app.on('before-quit', () => worker?.close());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
