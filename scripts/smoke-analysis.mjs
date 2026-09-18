// Native application smoke: real owner/worker/dictionary/evaluator, deterministic agent transport.
// All editable corpora/profile data are disposable copies. This script cannot call a paid provider.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const { makePdfFixture } = require('../electron/tests/pdf-fixture.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalParent = path.resolve(root, '..');
const run = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-analysis-native-'));
const parent = path.join(temp, 'repositories');
const profile = path.join(temp, 'user-data');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const originals = [
  ['oldtupicorpus', 'historic/araujo_catecismo_1686.tu.py'],
  ['oldtupicorpus', 'historic/lexicon.tu.py'],
  ['oldtupicorpus', 'ground_truth/records/historic/araujo_catecismo_1686.jsonl'],
  ['nhe-enga', 'docs/dict-conjugated.json.gz'],
];
const hashes = () =>
  Promise.all(
    originals.map(async ([repo, file]) =>
      hash(await fs.readFile(path.join(originalParent, repo, file))),
    ),
  );
const before = await hashes();
await fs.mkdir(parent, { recursive: true });
await fs.mkdir(profile, { recursive: true });
const revisions = {};
for (const [name, directories] of [
  ['oldtupicorpus', ['historic', 'ground_truth', 'authoring', 'synthetic', 'dictionary']],
  ['nhe-enga', ['pydicate', 'tupi', 'js', 'css']],
]) {
  const from = path.join(originalParent, name);
  const to = path.join(parent, name);
  await run('git', ['clone', '--shared', '--no-checkout', from, to], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  await run('git', ['-C', to, 'read-tree', 'HEAD']);
  revisions[name] = (await run('git', ['-C', from, 'rev-parse', 'HEAD'])).stdout.trim();
  for (const directory of directories) {
    try {
      await fs.cp(path.join(from, directory), path.join(to, directory), {
        recursive: true,
        filter: (file) => !file.includes('__pycache__') && !file.endsWith('.pyc'),
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.isFile() && /\.(py|html|css|json)$/.test(entry.name))
      await fs.copyFile(path.join(from, entry.name), path.join(to, entry.name));
  }
}
await fs.mkdir(path.join(parent, 'nhe-enga/docs'), { recursive: true });
await fs.copyFile(
  path.join(originalParent, 'nhe-enga/docs/dict-conjugated.json.gz'),
  path.join(parent, 'nhe-enga/docs/dict-conjugated.json.gz'),
);
const pdfPath = path.join(temp, 'registered-vector.pdf');
await fs.writeFile(pdfPath, makePdfFixture());

// Patch only this disposable Electron process's module cache. Production sources have no test hook.
const bootstrap = path.join(temp, 'bootstrap.cjs');
await fs.writeFile(
  bootstrap,
  `
const { app, dialog } = require('electron');
app.setPath('userData', ${JSON.stringify(profile)});
dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[${JSON.stringify(pdfPath)}] });
for (const [file, name, id] of [
  ['provider-codex.cjs','CodexProvider','codex'], ['provider-claude.cjs','ClaudeProvider','claude']
]) {
  const Provider = require(${JSON.stringify(path.join(root, 'electron'))} + '/' + file)[name];
  Provider.prototype.status = async (model) => ({id,state:'authenticated',model,detail:'DETERMINISTIC NATIVE FIXTURE; no provider traffic'});
  Provider.prototype.run = Provider.prototype.generate = Provider.prototype.runAgent = async () => { throw new Error('Paid provider calls are forbidden in this native smoke'); };
}
require(${JSON.stringify(path.join(root, 'electron/agent-runner.cjs'))}).runAgent = async (options) => {
  let step = 0;
  const tool = async (name,args={}) => {
    const operationId = 'native-fixture:' + options.input.id + ':' + (++step);
    await options.onEvent?.({type:'tool-start',tool:name,phase:name});
    const result = await options.callTool(name,args,{signal:options.signal,operationId});
    await options.onEvent?.({type:'tool-result',tool:name,result});
    await options.onCheckpoint?.({version:1,fixture:true,step,messages:[]});
    return result;
  };
  await tool('studio_context');
  if (options.input.includeImages) {
    const imageEvidence = await tool('studio_evidence',{pixels:true});
    if (!imageEvidence.content?.some(item => item.type === 'image')) throw new Error('Registered region pixels were not supplied');
  }
  const found = await tool('studio_dictionary_search',{query:'abaregûasu',limit:10});
  const row = found.results.find(item => /bispo/.test(item.definition));
  if (!row) throw new Error('Real Navarro bishop sense not found');
  const identity = {entryIndex:row.entryIndex,datasetFingerprint:row.datasetFingerprint || found.datasetFingerprint};
  await tool('studio_dictionary_entry',identity);
  let candidate = await tool('studio_candidate_create');
  candidate = await tool('studio_candidate_edit',{candidateId:candidate.id,expectedRevision:candidate.revisionId,action:{type:'dictionary',...identity,constructor:'Noun'}});
  candidate = await tool('studio_candidate_evaluate',{candidateId:candidate.id,expectedRevision:candidate.revisionId});
  await tool('studio_candidate_propose',{candidateId:candidate.id,expectedRevision:candidate.revisionId,rationale:'Teste determinístico: acepção real de bispo, avaliada pelo motor selecionado.',uncertainties:['A geração linguística autônoma não é avaliada por esta fixture.'],translation:{text:'Bispo.',uncertainties:['Tradução determinística de teste.']}});
  return {text:'Proposta de teste avaliada, pronta para revisão humana.',summary:'Proposta de teste avaliada.',questions:[],usage:{inputTokens:0,outputTokens:0},messages:[]};
};
require(${JSON.stringify(path.join(root, 'electron/main.cjs'))});
`,
);
const env = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
let projectSnapshot;
const report = {
  artifacts: temp,
  dependencyRevisions: revisions,
  providerCalls: 0,
  errors: [],
  remoteRequests: [],
};
async function launch() {
  app = await electron.launch({ args: [bootstrap], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) report.remoteRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1512, height: 1050 });
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
  // Fresh copied directories can still deliver delayed macOS file-watch notifications.
  // Let the application's ordinary refresh complete before beginning the authoring gesture.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let timer;
        const done = () => {
          unsubscribe?.();
          resolve(null);
        };
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(done, 1800);
        };
        const unsubscribe = window.studio.onEvent((event) => {
          if (event.type === 'source-change') arm();
        });
        arm();
      }),
  );
  projectSnapshot = await page.evaluate(() => window.studio.refreshProject());
}
async function state() {
  return page.evaluate(async (project) => {
    const envelope = await window.studio.loadDrafts(project.id);
    const analyses = await window.studio.invoke('analysis_list', { projectId: project.id });
    const details = await Promise.all(
      analyses.jobs.map((job) =>
        window.studio.invoke('analysis_get', { projectId: project.id, jobId: job.id }),
      ),
    );
    analyses.jobs = details
      .map((detail) => detail.job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    analyses.candidates = details.flatMap((detail) => detail.candidates);
    analyses.conversations = [
      ...new Map(
        details
          .filter((detail) => detail.conversation)
          .map((detail) => [detail.conversation.id, detail.conversation]),
      ).values(),
    ];
    return { project, envelope, analyses };
  }, projectSnapshot);
}
function externalMcp(descriptor) {
  const child = spawn(descriptor.command, descriptor.args, {
    env: { ...process.env, ...descriptor.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let sequence = 0,
    buffer = '',
    stderr = '';
  const pending = new Map();
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const response = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      const request = pending.get(response.id);
      if (request) {
        pending.delete(response.id);
        clearTimeout(request.timer);
        response.error
          ? request.reject(new Error(response.error.message))
          : request.resolve(response.result);
      }
    }
  });
  child.on('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('External MCP closed: ' + stderr));
    }
    pending.clear();
  });
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('External MCP timed out: ' + method));
      }, 60000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  return {
    send,
    async call(name, args = {}) {
      const response = await send('tools/call', { name, arguments: args });
      if (response.isError) throw new Error(response.content[0].text);
      return response.structuredContent;
    },
    close() {
      child.kill();
    },
  };
}
async function externalStartup(passageId) {
  await app.close();
  app = null;
  page = null;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-external-request-'));
  await fs.chmod(directory, 0o700);
  const responsePath = path.join(directory, 'response.json');
  let client;
  try {
    app = await electron.launch({
      args: [
        bootstrap,
        '--studio-external-analysis',
        passageId,
        '--studio-external-response',
        responsePath,
        '--studio-external-description',
        'Deterministic external authoring fixture',
      ],
      env,
      timeout: 30000,
    });
    let response;
    await expect
      .poll(
        async () => {
          try {
            response = JSON.parse(await fs.readFile(responsePath, 'utf8'));
            return true;
          } catch (error) {
            if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
            throw error;
          }
        },
        { timeout: 90000 },
      )
      .toBe(true);
    assert.ok(!response.error, JSON.stringify(response.error));
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      0,
    );
    assert.equal((await fs.stat(responsePath)).mode & 0o777, 0o600);
    const config = JSON.parse(await fs.readFile(response.configPath, 'utf8'));
    client = externalMcp(config.mcpServers.studio_authoring);
    const initialized = await client.send('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'native-external-fixture', version: '1' },
    });
    assert.equal(initialized.protocolVersion, '2025-11-25');
    const guide = await client.send('resources/read', { uri: 'studio://authoring/guide' });
    assert.match(guide.contents[0].text, /ground truth/);
    await client.call('studio_context');
    const found = await client.call('studio_dictionary_search', { query: 'abaregûasu', limit: 10 });
    const row = found.results.find((item) => /bispo/.test(item.definition));
    assert.ok(row);
    const identity = {
      entryIndex: row.entryIndex,
      datasetFingerprint: row.datasetFingerprint || found.datasetFingerprint,
    };
    await client.call('studio_dictionary_entry', identity);
    let candidate = await client.call('studio_candidate_create');
    candidate = await client.call('studio_candidate_edit', {
      candidateId: candidate.id,
      expectedRevision: candidate.revisionId,
      action: { type: 'dictionary', ...identity, constructor: 'Noun' },
    });
    candidate = await client.call('studio_candidate_evaluate', {
      candidateId: candidate.id,
      expectedRevision: candidate.revisionId,
    });
    await client.call('studio_candidate_propose', {
      candidateId: candidate.id,
      expectedRevision: candidate.revisionId,
      rationale:
        'External native fixture: exact Navarro bishop sense with actual engine evaluation.',
      uncertainties: ['Fixture proves transport, not autonomous linguistic quality.'],
      translation: { text: 'Bispo.', uncertainties: ['Tradução determinística de teste.'] },
    });
    await app.evaluate(({ app }) => app.emit('activate'));
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1512, height: 1050 });
    await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 30000 });
    projectSnapshot = await page.evaluate(() => window.studio.refreshProject());
    await expect
      .poll(
        async () => (await state()).analyses.jobs.find((job) => job.id === response.jobId)?.status,
        { timeout: 30000 },
      )
      .toBe('ready-for-review');
    const result = (await state()).analyses.jobs.find((job) => job.id === response.jobId);
    assert.equal(result.execution, 'external');
    assert.equal(result.usage.providerRequests, 0);
    report.externalMcpStartup = true;
    return response.jobId;
  } finally {
    client?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
try {
  await launch();
  await page.locator('.add-next-passage').click();
  await page.getByLabel('Transcrição diplomática', { exact: true }).fill('abaregûasu');
  await page.getByLabel('Grafia provável em Navarro', { exact: true }).fill('a ba regûasu');
  await page.getByLabel('Significado provável', { exact: true }).fill('bispo');
  await page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
  const canvas = page.getByTestId('pdf-canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45, { steps: 8 });
  await page.mouse.up();
  const physicalRect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
  await page.getByRole('button', { name: 'Salvar e analisar', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^IA/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Proposta pronta', { exact: true }).first()).toBeVisible({
    timeout: 60000,
  });
  let current = await state();
  const firstJob = current.analyses.jobs[0];
  const passageId = firstJob.passageId;
  assert.equal(current.envelope.drafts[passageId].raw, '');
  assert.equal(current.envelope.drafts[passageId].normalized, '');
  assert.equal(firstJob.input.tentativeReading, 'a ba regûasu');
  assert.ok(firstJob.input.evidence.regions.length === 1);
  assert.deepEqual(firstJob.input.evidence.regions[0].rect, physicalRect.split(',').map(Number));
  assert.equal(firstJob.input.evidence.images?.length ?? 0, 0);
  report.savedTypedInputAndExactRegion = true;
  await page.getByRole('button', { name: 'Inspecionar na árvore', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Prévia da proposta de IA' })).toContainText(
    'abaregûasu',
  );
  await page.getByRole('button', { name: 'Questionar / refinar', exact: true }).first().click();
  await page
    .getByLabel('Mensagem para a IA')
    .fill('Confirme a acepção de bispo e conserve a definição completa.');
  await page
    .getByRole('checkbox', { name: 'Enviar imagem das regiões selecionadas', exact: true })
    .check();
  await page.getByRole('button', { name: 'Salvar e enviar', exact: true }).click();
  await expect(page.getByText('Proposta pronta', { exact: true })).toHaveCount(2, {
    timeout: 60000,
  });
  current = await state();
  assert.equal(current.analyses.jobs[0].parentJobId, firstJob.id);
  assert.equal(current.analyses.jobs[0].input.evidence.images.length, 1);
  report.registeredRegionPixels = true;
  report.feedbackPreservesAlternative = current.analyses.candidates.length === 2;
  await page.getByRole('button', { name: 'Usar no rascunho', exact: true }).first().click();
  await expect(page.getByTestId('generated-surface')).toHaveText('abaregûasu', { timeout: 20000 });
  current = await state();
  assert.ok(current.envelope.drafts[passageId].raw.includes('Noun('));
  assert.ok(current.envelope.drafts[passageId].aiAcceptances.length);
  assert.equal(
    current.envelope.drafts[passageId].aiAcceptances.at(-1).jobId,
    current.analyses.jobs[0].id,
  );
  report.explicitDraftAcceptance = true;
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  const review = page.getByRole('dialog', { name: /^Revisar (passagem e léxico|nova passagem)$/ });
  await expect(review).toBeVisible({ timeout: 20000 });
  await expect(review).toContainText('abaregûasu');
  await review.getByText('Mostrar diff técnico', { exact: true }).click();
  await expect(review).toContainText('abareguasu');
  report.lexicalPublication = (await review.innerText()).includes('lexicon.tu.py')
    ? 'new declaration and passage reviewed together'
    : 'exact shared lexical declaration reused';
  await page.screenshot({ path: path.join(temp, 'review-publication.png') });
  await review.getByRole('button', { name: 'Voltar sem aplicar', exact: true }).click();
  await page
    .locator('.workspace-footer')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  await expect.poll(async () => (await state()).envelope.drafts[passageId].raw).toBe('');
  assert.ok((await state()).envelope.drafts[passageId].aiAcceptances.length);
  report.namedPublicationPreviewAndUndo = true;
  await page.getByLabel('Mensagem para a IA').fill('Rascunho de próxima pergunta preservado.');
  await page.getByRole('tab', { name: 'Fonte', exact: true }).click();
  await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', physicalRect);
  await page.getByRole('button', { name: 'Passagem anterior', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima passagem', exact: true }).click();
  await page.getByRole('tab', { name: /^IA/ }).click();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue(
    'Rascunho de próxima pergunta preservado.',
  );
  await app.close();
  app = null;
  await launch();
  await expect(page.getByLabel('Mensagem para a IA')).toHaveValue(
    'Rascunho de próxima pergunta preservado.',
    { timeout: 20000 },
  );
  await expect(page.getByText('Proposta pronta', { exact: true })).toHaveCount(2);
  report.restartAndNavigation = true;
  await page.screenshot({ path: path.join(temp, 'analysis-support.png') });
  const externalJobId = await externalStartup(passageId);
  await page.getByRole('button', { name: 'Usar no rascunho', exact: true }).first().click();
  await expect(page.getByTestId('generated-surface')).toHaveText('abaregûasu', { timeout: 20000 });
  await page.getByRole('button', { name: 'Revisar nova passagem', exact: true }).click();
  const publication = page.getByRole('dialog', {
    name: /^Revisar (passagem e léxico|nova passagem)$/,
  });
  await expect(publication).toBeVisible();
  await publication.getByRole('button', { name: /^Aplicar/ }).click();
  await expect(publication).toHaveCount(0, { timeout: 20000 });
  projectSnapshot = await page.evaluate(() => window.studio.refreshProject());
  const published = passageId.replace(/^pending:/, 'passage:');
  const publishedState = await state();
  assert.ok(publishedState.project.passages.some((passage) => passage.id === published));
  assert.equal(
    publishedState.analyses.jobs.find((job) => job.id === externalJobId).passageId,
    published,
  );
  assert.equal(
    publishedState.analyses.jobs.find((job) => job.id === firstJob.id).passageId,
    published,
  );
  assert.ok(
    publishedState.analyses.conversations.find((thread) => thread.passageId === published)?.turns
      .length,
  );
  report.disposablePublicationPreservesHistory = true;
  assert.deepEqual(await hashes(), before);
  assert.deepEqual(report.remoteRequests, []);
  assert.deepEqual(report.errors, []);
  report.originalFilesUnchanged = true;
  await fs.writeFile(path.join(temp, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  if (page) {
    await page.screenshot({ path: path.join(temp, 'failure.png') }).catch(() => {});
    await fs
      .writeFile(path.join(temp, 'dom.txt'), await page.locator('body').innerText())
      .catch(() => {});
  }
  await fs.writeFile(path.join(temp, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (app) await app.close();
}
