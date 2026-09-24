'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const RELEASE_URL = 'https://github.com/kiansheik/pydicate-studio/releases/latest';
const DEFAULT_TIMEOUTS = { check: 12_000, download: 180_000, install: 12_000 };

function newer(version, current) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+\.\d+\.\d+$/.test(current)) return false;
  const left = version.split('.').map(Number);
  const right = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

/** One bounded update attempt before opening editable project state. No timer
 * installs an update later, and no project/draft directories are ever touched. */
function createUpdateService({
  app,
  updater,
  emit = () => {},
  signedMac = false,
  platform = process.platform,
  env = process.env,
  checkTimeoutMs = DEFAULT_TIMEOUTS.check,
  downloadTimeoutMs = DEFAULT_TIMEOUTS.download,
  installTimeoutMs = DEFAULT_TIMEOUTS.install,
}) {
  const currentVersion = app.getVersion();
  const marker = path.join(app.getPath('userData'), 'application-update-attempt.json');
  let state = { phase: 'idle', currentVersion, releaseUrl: RELEASE_URL, canContinue: false };
  let startPromise;
  let stopped = false;
  let cancellation;
  let activeReject;
  let timer;
  const publish = (phase, message, fields = {}) => {
    state = {
      currentVersion,
      releaseUrl: RELEASE_URL,
      phase,
      message,
      canContinue: !['idle', 'checking', 'downloading', 'installing'].includes(phase),
      ...fields,
    };
    emit({ type: 'application-update', ...state });
    return { ...state };
  };
  const onError = (error) => activeReject?.(error);
  const onProgress = (progress) => {
    if (stopped || state.phase !== 'downloading') return;
    const percent = Number(progress.percent);
    publish('downloading', 'Baixando a nova versão do Studio…', {
      version: state.version,
      ...(Number.isFinite(percent) ? { percent: Math.max(0, Math.min(100, percent)) } : {}),
    });
  };
  const bounded = (operation, milliseconds) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        activeReject = undefined;
        callback(value);
      };
      activeReject = (error) => finish(reject, error);
      timer = setTimeout(() => {
        const error = new Error('A atualização excedeu o tempo de espera.');
        error.code = 'UPDATE_TIMEOUT';
        finish(reject, error);
      }, milliseconds);
      Promise.resolve()
        .then(operation)
        .then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
    });
  async function attempt() {
    if (!app.isPackaged)
      return publish(
        'disabled',
        'Atualizações automáticas estão disponíveis no aplicativo instalado.',
      );
    if (platform === 'darwin' && !signedMac)
      return publish(
        'manual',
        'Esta versão para Mac recebe atualizações pelo instalador na página de versões.',
      );
    if (platform === 'linux' && !env.APPIMAGE)
      return publish(
        'manual',
        'Abra a versão AppImage instalada para receber atualizações automáticas.',
      );
    if (!['darwin', 'win32', 'linux'].includes(platform) || !updater)
      return publish('manual', 'Consulte a página de versões para atualizar este aplicativo.');
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('error', onError);
    updater.on('download-progress', onProgress);
    let downloaded = false;
    const onDownloaded = () => {
      downloaded = true;
    };
    updater.on('update-downloaded', onDownloaded);
    try {
      publish('checking', 'Conferindo atualizações do Studio…');
      const checked = await bounded(() => updater.checkForUpdates(), checkTimeoutMs);
      cancellation = checked?.cancellationToken;
      if (stopped)
        return publish('offline', 'A verificação foi encerrada. Abrindo a versão instalada.');
      const version = checked?.updateInfo?.version;
      if (!version || !newer(version, currentVersion))
        return publish('current', 'O Studio instalado está atualizado.');
      let previous;
      try {
        previous = JSON.parse(await fs.readFile(marker, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (previous?.version === version && previous?.fromVersion === currentVersion)
        return publish(
          'manual',
          'A instalação anterior não foi concluída. Use o instalador da página de versões.',
          { version },
        );
      publish('downloading', 'Baixando a nova versão do Studio…', { version, percent: 0 });
      await bounded(() => updater.downloadUpdate(cancellation), downloadTimeoutMs);
      if (!downloaded || stopped)
        throw new Error('O instalador não foi confirmado pelo atualizador.');
      await fs.mkdir(path.dirname(marker), { recursive: true });
      const temporary = marker + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify({ fromVersion: currentVersion, version }), {
          mode: 0o600,
          flag: 'wx',
        });
        await fs.rename(temporary, marker);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      publish('installing', 'Instalando a atualização. O Studio será reaberto…', { version });
      // Electron normally exits here. If the installer cannot restart the app,
      // release the startup gate instead of leaving an endless loading screen.
      await bounded(() => {
        updater.quitAndInstall(true, true);
        return new Promise(() => {});
      }, installTimeoutMs);
      return { ...state };
    } catch (error) {
      const installing = state.phase === 'installing';
      const offline =
        !installing &&
        (error.code === 'UPDATE_TIMEOUT' ||
          /ENOTFOUND|ECONN|ENET|EAI_AGAIN|ERR_NETWORK|ERR_INTERNET|net::/i.test(
            String(error.code ?? '') + ' ' + error.message,
          ));
      return publish(
        installing ? 'manual' : offline ? 'offline' : 'error',
        installing
          ? 'A instalação não reiniciou o Studio. Você pode continuar e usar o instalador da página de versões.'
          : offline
            ? 'Não foi possível concluir a atualização agora. Abrindo a versão instalada.'
            : 'A atualização não pôde ser concluída. A versão instalada continua disponível.',
        state.version ? { version: state.version } : {},
      );
    } finally {
      stopped = true;
      cancellation?.cancel?.();
      updater.removeListener('download-progress', onProgress);
      updater.removeListener('update-downloaded', onDownloaded);
      // Keep the harmless error listener: a timed-out network request can still
      // emit an EventEmitter error after the startup gate has been released.
      clearTimeout(timer);
    }
  }
  return {
    start() {
      return (startPromise ??= attempt());
    },
    status() {
      return { ...state };
    },
    dispose() {
      stopped = true;
      cancellation?.cancel?.();
      activeReject?.(new Error('Atualizador encerrado.'));
    },
  };
}

module.exports = { createUpdateService, RELEASE_URL, DEFAULT_TIMEOUTS };
