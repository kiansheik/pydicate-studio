'use strict';

const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { DraftStore } = require('./draft-store.cjs');
const { PythonWorker } = require('./python-worker.cjs');
const validate = require('./validation.cjs');
const { createProjectWatch } = require('./project-watch.cjs');
const { createNextService } = require('./next-service.cjs');
const { createUsageService } = require('./usage-service.cjs');
const { installApplicationPermissions } = require('./application-permissions.cjs');
const { createDictionarySite } = require('./dictionary-site.cjs');
const { serviceErrorReply } = require('./service-errors.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const DEV_URL = 'http://127.0.0.1:5173/';
const applicationDirectory = path.resolve(__dirname, '..');
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; object-src blob:; frame-src blob: studio://dictionary; worker-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'";
const development = !app.isPackaged && process.env.PYDICATE_STUDIO_DEV === '1';
const entryURL = development ? DEV_URL : 'studio://app/index.html';
const knownProjects = new Set(['example:araujo-0067']);
let window;
let worker;
let activeProject;
const externalRequests = [];
async function externalAnalysis(argv) {
  const option = (name) => {
    const index = argv.indexOf(name);
    return index < 0 ? undefined : argv[index + 1];
  };
  const passageId = option('--studio-external-analysis');
  if (!passageId) return false;
  if (!nextService) {
    externalRequests.push(argv);
    return true;
  }
  const responsePath = option('--studio-external-response');
  // CLI responses can only enter the requesting user's private temporary directory.
  if (!responsePath || path.basename(responsePath) !== 'response.json')
    throw new Error('Destino da sessão MCP inválido.');
  const directory = fs.realpathSync(path.dirname(responsePath));
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const stat = fs.lstatSync(directory);
  if (
    path.dirname(directory) !== temporaryRoot ||
    !path.basename(directory).startsWith('studio-external-request-') ||
    !stat.isDirectory() ||
    stat.mode & 0o077 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error('Diretório privado da sessão MCP inválido.');
  let response;
  try {
    validate.id(passageId, 'passagem');
    if (!activeProject) {
      const restored = await nextService.invoke('session_restore');
      if (!restored.project)
        throw new Error(restored.error ?? 'Abra e salve um projeto no Studio primeiro.');
    }
    response = await nextService.invoke('analysis_external_start', {
      projectId: activeProject.id,
      passageId,
      operationId: randomUUID(),
      task: option('--studio-external-task') ?? 'analyze',
      description: option('--studio-external-description') ?? '',
    });
  } catch (error) {
    response = { error: { code: error.code ?? 'EXTERNAL_START', message: error.message } };
  }
  const temporary = path.join(directory, randomUUID() + '.tmp');
  fs.writeFileSync(temporary, JSON.stringify(response), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, path.join(directory, 'response.json'));
  return true;
}
const dictionarySite = createDictionarySite({
  getProject: () => activeProject,
  parentOrigin: development ? new URL(DEV_URL).origin : 'studio://app',
});
let projectChanging = false;
let drafts;
let nextService;
let usage;
let projectParent;
let draftSaveCount = 0;
let draftSaveTimer;
function flushDraftSaves() {
  clearTimeout(draftSaveTimer);
  if (draftSaveCount)
    record({
      event: 'draft.persist',
      projectId: activeProject?.id,
      outcome: 'succeeded',
      details: { count: draftSaveCount },
    });
  draftSaveCount = 0;
}
const aiPhases = new Map();
function record(event) {
  void usage?.record(event).catch(() => {});
}
function buildIdentity() {
  const hash = createHash('sha256');
  const visit = (directory) => {
    const root = path.join(applicationDirectory, directory);
    if (!fs.existsSync(root)) return;
    for (const name of fs.readdirSync(root).sort()) {
      if (fs.statSync(path.join(root, name)).isDirectory()) {
        if (directory.startsWith('src') || (directory === 'electron' && name === 'dictionary'))
          visit(directory + '/' + name);
      } else if (/\.(cjs|py|js|css|ts|tsx)$/.test(name))
        hash.update(directory + '/' + name).update(fs.readFileSync(path.join(root, name)));
    }
  };
  for (const directory of ['electron', 'python', 'dist/assets', ...(development ? ['src'] : [])])
    visit(directory);
  return hash.digest('hex').slice(0, 20);
}
let watchers = [];
let sourceWrites = 0;
function emit(event) {
  if (event.type === 'analysis' && event.jobId) {
    const key = 'analysis:' + event.jobId;
    const state = `${event.status}:${event.phase}`;
    if (aiPhases.get(key) !== state) {
      aiPhases.set(key, state);
      record({
        event: 'ai.analysis.phase',
        projectId: event.projectId,
        passageId: event.passageId,
        requestId: event.jobId,
        outcome:
          event.status === 'failed' || event.status === 'blocked'
            ? 'failed'
            : event.status === 'cancelled'
              ? 'cancelled'
              : event.status === 'ready-for-review'
                ? 'succeeded'
                : 'started',
        details: { phase: event.phase, status: event.status },
      });
      if (aiPhases.size > 200) aiPhases.delete(aiPhases.keys().next().value);
    }
  }
  if (event.type === 'ai' && event.phase && aiPhases.get(event.requestId) !== event.phase) {
    aiPhases.set(event.requestId, event.phase);
    record({
      event: 'ai.phase',
      projectId: event.projectId,
      passageId: event.passageId,
      revisionId: event.revisionId,
      requestId: event.requestId,
      ...(event.result?.finishedAt && event.result?.startedAt
        ? {
            durationMs: Math.max(
              0,
              Date.parse(event.result.finishedAt) - Date.parse(event.result.startedAt),
            ),
          }
        : {}),
      outcome:
        event.phase === 'failed'
          ? 'failed'
          : event.phase === 'cancelled'
            ? 'cancelled'
            : event.phase === 'completed'
              ? 'succeeded'
              : 'started',
      details: {
        phase: event.phase,
        status: event.status,
        provider: event.result?.provider,
        model: event.result?.model,
        ...(event.phase === 'failed'
          ? {
              errorCode: /tempo limite|demorou/i.test(event.error || '')
                ? 'PROVIDER_TIMEOUT'
                : 'PROVIDER_FAILED',
            }
          : {}),
      },
    });
    // Retain terminal phases briefly to deduplicate the final durable update.
    if (aiPhases.size > 200) aiPhases.delete(aiPhases.keys().next().value);
  }
  window?.webContents.send('studio:event', event);
}
function watchProject(project) {
  watchers.forEach((w) => w.close());
  watchers = [];
  const corpus = project.repositories.find((r) => r.name === 'oldtupicorpus');
  if (!corpus) return;
  try {
    watchers.push(
      createProjectWatch({
        directory: path.join(corpus.path, 'historic'),
        isSuppressed: () => sourceWrites > 0,
        onChange: () => emit({ type: 'source-change', projectId: project.id }),
      }),
    );
  } catch {}
}
async function duringProjectWrite(action) {
  sourceWrites += 1;
  let failed = false;
  try {
    return await action();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    sourceWrites -= 1;
    if (sourceWrites === 0 && activeProject) {
      const changedDuringFailure = failed && watchers.some((w) => w.suppressedChange);
      watchProject(activeProject);
      if (changedDuringFailure) emit({ type: 'source-change', projectId: activeProject.id });
    }
  }
}
async function openPath(parentPath, expectedProjectId) {
  const candidate = createWorker();
  try {
    const project = validate.project(await candidate.request('open_project', { parentPath }));
    if (expectedProjectId && project.id !== expectedProjectId)
      throw new Error('A identidade do projeto mudou. Reabra o projeto.');
    // macOS can report delayed/coalesced notifications for unchanged files.
    // Keep in-flight evaluations when the fresh snapshot is byte-identical.
    if (
      worker &&
      activeProject?.id === project.id &&
      activeProject.engineFingerprint === project.engineFingerprint
    )
      candidate.close();
    else {
      worker?.close();
      worker = candidate;
    }
    activeProject = project;
    projectParent = parentPath;
    knownProjects.add(project.id);
    watchProject(project);
    return project;
  } catch (e) {
    candidate.close();
    throw e;
  }
}

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
    ipcMain.handle(channel, async (event, ...args) => {
      verifySender(event);
      if (args.length !== arity) throw new Error('Argumentos inesperados.');
      try {
        return await callback(...args);
      } catch (error) {
        if (channel !== 'studio:invoke' && channel !== 'studio:usage')
          record({
            event: 'bridge.failure',
            projectId: activeProject?.id,
            outcome: 'failed',
            details: { method: channel, errorCode: error.code || 'BRIDGE_FAILED' },
          });
        if (channel === 'studio:invoke') {
          const reply = serviceErrorReply(error);
          if (reply) return reply;
        }
        throw error;
      }
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
      const project = await openPath(selection.filePaths[0]);
      await nextService.saveSession({ parentPath: selection.filePaths[0] });
      return project;
    }),
  );
  handle('studio:refresh-project', 0, () =>
    changeProject(async () => {
      if (!worker || !activeProject)
        throw new Error('Abra um projeto local para atualizar suas fontes.');
      const project = await openPath(projectParent, activeProject.id);
      activeProject = project;
      return project;
    }),
  );
  handle('studio:usage', 1, (event) => usage.recordUi(event));
  handle('studio:copy-text', 1, (text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1_000_000)
      throw new Error('Texto ausente ou muito grande para copiar.');
    clipboard.writeText(text);
  });
  handle('studio:invoke', 2, async (method, params) => {
    if (method === 'dictionary_status') return dictionarySite.status(params);
    if (method === 'usage_status') return usage.status();
    if (method === 'usage_report') return usage.report(params);
    if (method === 'usage_export') return usage.export(params);
    if (method === 'usage_configure') return usage.configure(params);
    const started = performance.now();
    // Never persist request bodies, generated text, or credentials.
    const details = { method, provider: params?.provider, model: params?.model };
    const context = {
      projectId: activeProject?.id,
      passageId: params?.passageId,
      revisionId: params?.revisionId,
    };
    const shouldLog = !['session_select', 'ai_history', 'evidence_status'].includes(method);
    if (shouldLog)
      record({ event: 'operation.' + method, ...context, outcome: 'started', details });
    try {
      const result = await nextService.invoke(method, params);
      const returnedError =
        method === 'parse_expression' && !result?.root
          ? 'PARSE_INVALID'
          : method === 'session_restore' && result?.error
            ? 'PROJECT_RESTORE_FAILED'
            : null;
      if (shouldLog)
        record({
          event: 'operation.' + method,
          ...context,
          outcome: returnedError ? 'failed' : 'succeeded',
          durationMs: Math.round(performance.now() - started),
          details: { ...details, ...(returnedError ? { errorCode: returnedError } : {}) },
        });
      return result;
    } catch (error) {
      record({
        event: 'operation.' + method,
        ...context,
        outcome: 'failed',
        durationMs: Math.round(performance.now() - started),
        details: { ...details, errorCode: error.code || 'OPERATION_FAILED' },
      });
      throw error;
    }
  });
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
  handle('studio:save-drafts', 1, async (envelope) => {
    validate.envelope(envelope);
    authorizeProject(envelope.projectId);
    try {
      const saved = await drafts.saveChecked(envelope);
      draftSaveCount += 1;
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(flushDraftSaves, 1500);
      return saved;
    } catch (error) {
      record({
        event: 'draft.save',
        projectId: envelope.projectId,
        outcome: 'failed',
        details: { errorCode: 'DRAFT_WRITE_FAILED' },
      });
      throw error;
    }
  });
}

function serveApplication() {
  const directory = path.join(applicationDirectory, 'dist');
  protocol.handle('studio', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host === 'dictionary') return dictionarySite.handle(request);
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
      // Keep tree fullscreen inside the app window. A macOS native fullscreen
      // transition can race an immediate Escape and strand DOM fullscreen.
      disableHtmlFullscreenWindowResize: true,
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
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--studio-external-analysis')) {
      void externalAnalysis(argv).catch((error) => console.error(error.message));
      return;
    }
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
      usage = createUsageService({
        directory: path.join(app.getPath('userData'), 'usage'),
        appVersion: app.getVersion(),
        buildId: buildIdentity(),
      });
      record({ event: 'application.ready', outcome: 'succeeded' });
      drafts = new DraftStore(path.join(app.getPath('userData'), 'drafts'));
      nextService = createNextService({
        draftStore: drafts,
        duringProjectWrite,
        stateDirectory: app.getPath('userData'),
        emit,
        getProject: () => activeProject,
        getWorker: () => worker,
        openPath,
        reloadProject: (projectId) =>
          changeProject(async () => {
            if (!activeProject || activeProject.id !== projectId)
              throw new Error('Abra o projeto desta correção.');
            const project = await openPath(projectParent, projectId);
            emit({ type: 'source-change', projectId });
            return project;
          }),
        defaultParent:
          process.env.PYDICATE_PROJECT_PARENT || path.resolve(applicationDirectory, '..'),
        adoptProject: (project) => {
          activeProject = validate.project(project);
          watchProject(project);
        },
        chooseFile: async () => {
          const selection = await dialog.showOpenDialog(window, {
            title: 'Vincular PDF do testemunho',
            properties: ['openFile'],
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
          });
          return selection.canceled ? null : selection.filePaths[0];
        },
      });
      installApplicationPermissions(session.defaultSession, {
        getWindow: () => window,
        isApplicationURL,
      });
      serveApplication();
      installBridge();
      if (process.argv.includes('--studio-external-analysis')) await externalAnalysis(process.argv);
      else await createWindow();
      for (const argv of externalRequests.splice(0))
        void externalAnalysis(argv).catch((error) => console.error(error.message));
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

let closingUsage = false;
let quitReady = false;
app.on('before-quit', (event) => {
  if (quitReady) return;
  event.preventDefault();
  if (closingUsage) return;
  closingUsage = true;
  flushDraftSaves();
  watchers.forEach((w) => w.close());
  Promise.resolve()
    .then(async () => {
      await nextService?.close();
      await Promise.allSettled([...(drafts?.writes.values() ?? [])]);
      worker?.close();
      await usage?.close();
    })
    .catch((error) => console.error('Falha ao encerrar o Studio:', error.message))
    .finally(() => {
      quitReady = true;
      app.quit();
    });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !nextService?.hasWork()) app.quit();
});
