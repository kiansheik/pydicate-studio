'use strict';
// Hidden Tupi → Pydicate laboratory service.
//
// Ownership rules follow the existing analysis service: one writer per artifact,
// durable control metadata, observable progress, real cancellation and honest
// recovery after a restart. Large artifacts never enter this store; only job
// records live here, and generated shards stay in the artifact directory.
//
// Nothing starts on its own. The Python lab worker is spawned on the first
// request that needs the engine, never when Studio opens or when the tab is
// revealed, and never by a status read.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');

const JOB_SCHEMA = 1;
const MAX_JOBS = 40;
const MAX_PROGRESS = 60;
const STAGES = new Set(['prepare', 'train', 'evaluate']);
const WORKER_METHODS = new Set([
  'context',
  'status',
  'analyze',
  'parse',
  'evaluate',
  'activate',
  'deactivate',
  'collisions',
  'judgment_add',
  'judgment_list',
  'optional_status',
  'project',
  'clear_staging',
  'feedback_summary',
  'feedback_export',
]);

function labError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class LabWorkerProcess {
  constructor({ executable, script, parent, artifacts, source, timeout = 120_000, spawnProcess }) {
    this.pending = new Map();
    this.sequence = 0;
    this.failed = null;
    this.stderr = '';
    this.buffer = '';
    this.timeout = timeout;
    const decoder = new StringDecoder('utf8');
    this.process = (spawnProcess || spawn)(
      executable,
      ['-B', script, '--parent', parent, '--artifacts', artifacts, '--source', source],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
        },
      },
    );
    this.process.on('error', (error) =>
      this.fail(labError('LAB_WORKER', `Não foi possível iniciar o laboratório. ${error.message}`)),
    );
    this.process.on('close', (code, signal) =>
      this.fail(
        labError(
          'LAB_WORKER',
          `O laboratório encerrou (${signal || code}). ${this.stderr.trim().slice(-800)}`,
        ),
      ),
    );
    this.process.stdin.on('error', (error) =>
      this.fail(labError('LAB_WORKER', `O laboratório não recebeu o pedido. ${error.message}`)),
    );
    this.process.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-16_384);
    });
    this.process.stdout.on('data', (chunk) => {
      if (this.failed) return;
      this.buffer += decoder.write(chunk);
      if (Buffer.byteLength(this.buffer, 'utf8') > 64 * 1024 * 1024) {
        this.fail(labError('LAB_WORKER', 'A resposta do laboratório excedeu o limite.'));
        return;
      }
      let newline;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          this.fail(labError('LAB_WORKER', 'O laboratório devolveu uma resposta inválida.'));
          return;
        }
        const waiting = this.pending.get(message.id);
        if (!waiting) continue;
        this.pending.delete(message.id);
        clearTimeout(waiting.timer);
        if (message.error)
          waiting.reject(labError(message.error.code || 'LAB_ERROR', message.error.message));
        else waiting.resolve(message.result);
      }
    });
  }

  fail(error) {
    if (this.failed) return;
    this.failed = error;
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }

  request(method, params = {}, timeout = this.timeout) {
    if (this.failed) return Promise.reject(this.failed);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(labError('LAB_TIMEOUT', 'O laboratório demorou demais para responder.'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n', (error) => {
        if (error) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(labError('LAB_WORKER', error.message));
        }
      });
    });
  }

  close() {
    this.fail(labError('LAB_WORKER', 'O laboratório foi encerrado.'));
    try {
      this.process.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function createParserLabService(options) {
  const {
    stateDirectory,
    emit,
    getProject,
    getParent,
    applicationDirectory,
    pythonExecutable = process.env.PYDICATE_PYTHON || 'python3',
    spawnProcess = spawn,
    artifactRoot = process.env.PYDICATE_PARSER_LAB_ARTIFACTS || null,
  } = options;
  const jobsFile = path.join(stateDirectory, 'jobs.json');
  const labWorkerScript = path.join(applicationDirectory, 'python', 'parser_lab', 'worker.py');
  const cliScript = path.join(applicationDirectory, 'scripts', 'parser-lab', 'cli.py');
  const configDirectory = path.join(applicationDirectory, 'configs', 'parser-lab');
  let state = null;
  let writes = Promise.resolve();
  let worker = null;
  let workerKey = '';
  const running = new Map();

  function artifactsFor(project) {
    if (artifactRoot) return path.resolve(artifactRoot, project.id);
    return path.join(stateDirectory, 'artifacts', project.id.replace(/[^a-zA-Z0-9._-]/g, '_'));
  }

  function parentOf(project) {
    const explicit = typeof getParent === 'function' ? getParent() : null;
    if (explicit) return explicit;
    const corpus = (project.repositories || []).find((item) => item.name === 'oldtupicorpus');
    if (!corpus?.path)
      throw labError('LAB_NO_PROJECT', 'Não foi possível localizar a pasta do projeto local.');
    return path.dirname(corpus.path);
  }

  function requireLocalProject(params) {
    const project = getProject();
    if (!project || project.mode !== 'local')
      throw labError('LAB_NO_PROJECT', 'Abra o corpus local para usar o laboratório.');
    if (params.projectId && params.projectId !== project.id)
      throw labError('STALE_PROJECT', 'O laboratório pertence a outro projeto.');
    return project;
  }

  // -- durable job records ------------------------------------------------
  async function load() {
    if (state) return state;
    try {
      const value = JSON.parse(await fsp.readFile(jobsFile, 'utf8'));
      state =
        value && value.schemaVersion === JOB_SCHEMA
          ? value
          : { schemaVersion: JOB_SCHEMA, jobs: {} };
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw labError('LAB_STORE', 'Os registros de trabalho do laboratório estão ilegíveis.');
      state = { schemaVersion: JOB_SCHEMA, jobs: {} };
    }
    // A process that was killed cannot be running now. Recovery is honest and
    // never replays work automatically.
    let changed = false;
    for (const job of Object.values(state.jobs)) {
      if (job.status === 'running' || job.status === 'cancelling' || job.status === 'queued') {
        job.status = 'interrupted';
        job.error = 'O Studio foi encerrado antes do fim deste trabalho. Execute novamente.';
        job.finishedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) await persist();
    return state;
  }

  async function persist() {
    const jobs = Object.values(state.jobs)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, MAX_JOBS);
    state.jobs = Object.fromEntries(jobs.map((job) => [job.id, job]));
    const text = JSON.stringify(state, null, 2);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await fsp.mkdir(stateDirectory, { recursive: true });
        const temp = jobsFile + '.tmp';
        await fsp.writeFile(temp, text, { mode: 0o600 });
        await fsp.rename(temp, jobsFile);
      });
    await writes;
  }

  function notify(job) {
    emit?.({
      type: 'parser-lab',
      projectId: job.projectId,
      jobId: job.id,
      stage: job.stage,
      status: job.status,
      phase: job.phase,
    });
  }

  // -- artifact listing without Python ------------------------------------
  function readManifests(root) {
    const rows = [];
    let active = {};
    let interrupted = [];
    try {
      active = JSON.parse(fs.readFileSync(path.join(root, 'active.json'), 'utf8'));
    } catch {
      active = {};
    }
    let names = [];
    try {
      names = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return { artifacts: [], active: {}, interrupted: [], root, exists: false };
    }
    for (const entry of names) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const manifestPath = path.join(root, entry.name, 'manifest.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        rows.push({
          artifactId: manifest.artifactId,
          kind: manifest.kind,
          status: manifest.status,
          completed: manifest.completed === true,
          createdAt: manifest.createdAt,
          counts: manifest.counts || {},
          metrics: manifest.metrics || {},
          recipe: manifest.recipe || {},
          parents: manifest.parents || [],
          contextFingerprint: manifest.context?.fingerprint ?? null,
        });
      } catch {
        rows.push({
          artifactId: entry.name,
          kind: 'unknown',
          status: 'interrupted',
          completed: false,
          counts: {},
          metrics: {},
          recipe: {},
          parents: [],
          contextFingerprint: null,
        });
      }
    }
    try {
      // Same shape the Python store reports, so the tab has one contract.
      interrupted = fs
        .readdirSync(path.join(root, '.staging'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('discard.'))
        .map((entry) => {
          let progress = null;
          try {
            progress = JSON.parse(
              fs.readFileSync(path.join(root, '.staging', entry.name, 'checkpoint.json'), 'utf8'),
            );
          } catch {
            progress = null;
          }
          return {
            name: entry.name,
            lastStage: progress?.stage ?? null,
            counts: progress?.counts ?? {},
          };
        });
    } catch {
      interrupted = [];
    }
    return { artifacts: rows, active, interrupted, root, exists: true };
  }

  function profiles() {
    try {
      return fs
        .readdirSync(configDirectory)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const value = JSON.parse(fs.readFileSync(path.join(configDirectory, name), 'utf8'));
          return {
            profile: value.profile,
            label: value.label,
            description: value.description,
            families: value.families,
            rootRules: value.rootRules,
            limits: value.limits,
            holdout: value.holdout,
            estimatedBytes: value.estimatedBytes ?? null,
            inventoryCounts: Object.fromEntries(
              Object.entries(value.inventory || {}).map(([key, list]) => [key, list.length]),
            ),
          };
        });
    } catch {
      return [];
    }
  }

  // -- lazy worker --------------------------------------------------------
  function ensureWorker(project) {
    const artifacts = artifactsFor(project);
    const key = `${parentOf(project)}:${artifacts}`;
    if (worker && workerKey === key && !worker.failed) return worker;
    if (worker) worker.close();
    fs.mkdirSync(artifacts, { recursive: true });
    worker = new LabWorkerProcess({
      executable: pythonExecutable,
      script: labWorkerScript,
      parent: parentOf(project),
      artifacts,
      source: project.passages?.[0]?.sourceId || 'araujo_catecismo_1686',
      spawnProcess,
    });
    workerKey = key;
    return worker;
  }

  async function callWorker(project, method, params, timeout) {
    if (!WORKER_METHODS.has(method))
      throw labError('LAB_UNKNOWN_METHOD', 'Operação de laboratório indisponível.');
    const current = ensureWorker(project);
    try {
      return await current.request(method, params, timeout);
    } catch (error) {
      if (current.failed && worker === current) {
        worker = null;
        workerKey = '';
      }
      throw error;
    }
  }

  // -- batch jobs ---------------------------------------------------------
  function argumentsFor(stage, project, params) {
    const base = [
      '-B',
      cliScript,
      '--parent',
      parentOf(project),
      '--artifacts',
      artifactsFor(project),
      '--source',
      project.passages?.[0]?.sourceId || 'araujo_catecismo_1686',
    ];
    if (stage === 'prepare')
      return [...base, 'prepare', '--profile', String(params.profile || 'smoke'), '--activate'];
    if (stage === 'train')
      return [
        ...base,
        'train',
        '--epochs',
        String(Math.min(Math.max(Number(params.epochs) || 8, 1), 64)),
        '--max-examples',
        String(Math.min(Math.max(Number(params.maxExamples) || 400, 1), 200_000)),
        '--max-contrasts',
        String(Math.min(Math.max(Number(params.maxContrasts) || 400, 1), 200_000)),
      ];
    return [
      ...base,
      'evaluate',
      '--sample',
      String(Math.min(Math.max(Number(params.sample) || 25, 1), 500)),
    ];
  }

  async function startJob(params) {
    const project = requireLocalProject(params);
    await load();
    const stage = params.stage;
    if (!STAGES.has(stage)) throw labError('LAB_INPUT', 'Etapa de laboratório desconhecida.');
    if (running.size)
      throw labError(
        'LAB_BUSY',
        'Já existe um trabalho do laboratório em andamento. Aguarde ou cancele-o.',
      );
    const job = {
      id: randomUUID(),
      schemaVersion: JOB_SCHEMA,
      projectId: project.id,
      stage,
      profile: params.profile || null,
      options: {
        epochs: params.epochs ?? null,
        maxExamples: params.maxExamples ?? null,
        sample: params.sample ?? null,
      },
      status: 'running',
      phase: 'starting',
      progress: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      artifactId: null,
      error: null,
      engineFingerprint: project.engineFingerprint,
    };
    state.jobs[job.id] = job;
    await persist();
    notify(job);

    const child = spawnProcess(pythonExecutable, argumentsFor(stage, project, params), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
    });
    running.set(job.id, child);
    let stdout = '';
    let stderrTail = '';
    // Progress is protocol and also arrives on stderr. Keeping the non-protocol
    // lines apart means a failure shows its reason, not a progress dump.
    let diagnostic = '';
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk.toString('utf8')).slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-8192);
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('{')) {
          try {
            const event = JSON.parse(line);
            job.phase = event.stage || job.phase;
            job.progress = [...job.progress, event].slice(-MAX_PROGRESS);
            notify(job);
            continue;
          } catch {
            /* not protocol after all; treat it as diagnostic text */
          }
        }
        diagnostic = (diagnostic + line + '\n').slice(-4096);
      }
    });
    child.on('error', (error) => {
      job.status = 'failed';
      job.error = `Não foi possível iniciar o processo do laboratório. ${error.message}`;
    });
    child.on('close', (code, signal) => {
      running.delete(job.id);
      job.finishedAt = new Date().toISOString();
      if (job.status === 'cancelling') {
        job.status = 'cancelled';
        job.error = 'Cancelado pelo contribuidor.';
      } else if (code === 0) {
        job.status = 'succeeded';
        try {
          const payload = JSON.parse(stdout.slice(stdout.indexOf('{')));
          job.artifactId = payload.artifactId || null;
          job.result = {
            counts: payload.counts || {},
            metrics: payload.metrics || {},
            activated: payload.activated ?? null,
          };
        } catch {
          job.result = null;
        }
      } else {
        job.status = 'failed';
        job.error =
          diagnostic.trim().slice(-1200) ||
          stderrTail.trim().slice(-1200) ||
          `O processo terminou (${signal || code}).`;
      }
      notify(job);
      void persist();
    });
    return present(job);
  }

  async function cancelJob(params) {
    requireLocalProject(params);
    await load();
    const job = state.jobs[params.jobId];
    if (!job) throw labError('LAB_NOT_FOUND', 'Trabalho do laboratório não encontrado.');
    const child = running.get(job.id);
    if (!child) {
      if (job.status === 'running' || job.status === 'cancelling') {
        job.status = 'interrupted';
        await persist();
      }
      return present(job);
    }
    job.status = 'cancelling';
    notify(job);
    await persist();
    try {
      child.kill('SIGTERM');
    } catch {
      /* already exited */
    }
    setTimeout(() => {
      if (running.has(job.id)) {
        try {
          running.get(job.id).kill('SIGKILL');
        } catch {
          /* already exited */
        }
      }
    }, 5000).unref?.();
    return present(job);
  }

  function present(job) {
    return {
      id: job.id,
      stage: job.stage,
      profile: job.profile,
      status: job.status,
      phase: job.phase,
      progress: job.progress.slice(-MAX_PROGRESS),
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      artifactId: job.artifactId,
      error: job.error,
      result: job.result ?? null,
    };
  }

  async function status(params) {
    const project = requireLocalProject(params);
    await load();
    const root = artifactsFor(project);
    const listing = readManifests(root);
    return {
      projectId: project.id,
      engineFingerprint: project.engineFingerprint,
      artifactRoot: root,
      ...listing,
      profiles: profiles(),
      jobs: Object.values(state.jobs)
        .filter((job) => job.projectId === project.id)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        .map(present),
      busy: running.size > 0,
      workerRunning: Boolean(worker && !worker.failed),
      note:
        'Contagens e compatibilidade do motor são conferidas ao abrir o laboratório; ' +
        'a leitura de estado não inicia geração, treino nem download.',
    };
  }

  async function invoke(method, params = {}) {
    if (method === 'parser_lab_status') return status(params);
    if (method === 'parser_lab_profiles') return { profiles: profiles() };
    if (method === 'parser_lab_job_start') return startJob(params);
    if (method === 'parser_lab_job_cancel') return cancelJob(params);
    if (method === 'parser_lab_jobs') {
      requireLocalProject(params);
      await load();
      return { jobs: Object.values(state.jobs).map(present), busy: running.size > 0 };
    }
    if (method === 'parser_lab_shutdown') {
      if (worker) worker.close();
      worker = null;
      workerKey = '';
      return { stopped: true };
    }
    const project = requireLocalProject(params);
    const direct = {
      parser_lab_context: ['context', {}, 180_000],
      parser_lab_engine_status: ['status', {}, 180_000],
      parser_lab_analyze: [
        'analyze',
        {
          text: params.text,
          indexId: params.indexId,
          rankerId: params.rankerId,
          seconds: params.seconds,
          useRanker: params.useRanker,
          lexicalHints: params.lexicalHints,
        },
        180_000,
      ],
      parser_lab_parse: ['parse', { raw: params.raw }, 60_000],
      parser_lab_evaluate: ['evaluate', { raw: params.raw }, 120_000],
      parser_lab_activate: [
        'activate',
        { kind: params.kind, artifactId: params.artifactId },
        60_000,
      ],
      parser_lab_deactivate: ['deactivate', { kind: params.kind }, 60_000],
      parser_lab_collisions: ['collisions', { limit: params.limit }, 120_000],
      parser_lab_clear_staging: ['clear_staging', {}, 60_000],
      parser_lab_feedback: ['feedback_summary', { limit: params.limit }, 120_000],
      parser_lab_feedback_export: ['feedback_export', {}, 120_000],
      parser_lab_judgment: ['judgment_add', params.judgment || {}, 60_000],
      parser_lab_judgments: ['judgment_list', { limit: params.limit }, 60_000],
      parser_lab_optional: ['optional_status', {}, 60_000],
    }[method];
    if (!direct) throw labError('LAB_UNKNOWN_METHOD', 'Operação de laboratório indisponível.');
    const [workerMethod, workerParams, timeout] = direct;
    return callWorker(project, workerMethod, workerParams, timeout);
  }

  return {
    invoke,
    hasWork: () => running.size > 0,
    close: async () => {
      for (const child of running.values()) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already exited */
        }
      }
      if (worker) worker.close();
      worker = null;
      await writes;
    },
  };
}

module.exports = { createParserLabService };
