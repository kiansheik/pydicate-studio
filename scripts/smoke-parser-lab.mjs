import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Native end-to-end proof for the hidden Tupi → Pydicate laboratory.
// It runs the production Electron origin with an isolated user profile, a
// disposable corpus copy and a read-only engine symlink. It never writes to the
// user's repositories, never publishes source, never approves a reference and
// never contacts a provider.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originals = path.resolve(
  process.argv[2] || process.env.PYDICATE_PROJECT_PARENT || path.join(root, '..'),
);
const reportPath = path.join(root, 'docs/coverage/parser-lab-native.json');
const evidenceDirectory = path.join(root, 'docs/coverage/native-screenshots');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-parser-lab-'));
const parent = path.join(temporary, 'projects');
const corpus = path.join(parent, 'oldtupicorpus');
const userData = path.join(temporary, 'user-data');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const watchedFiles = [
  'historic/araujo_catecismo_1686.tu.py',
  'historic/lexicon.tu.py',
  'ground_truth/records/historic/araujo_catecismo_1686.jsonl',
];
const originalHashes = {};
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  productionOrigin: 'studio://app/index.html',
  temporaryDirectory: temporary,
  boundary:
    'Isolated Electron profile, disposable corpus copy, engine symlink read-only. No provider call, no publication, no approval.',
  stages: [],
  pageErrors: [],
};
let app, page;

async function saveReport() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
async function stage(name, fn) {
  const item = { name, startedAt: new Date().toISOString(), status: 'running' };
  report.stages.push(item);
  try {
    item.evidence = await fn();
    item.status = 'passed';
  } catch (error) {
    item.status = 'failed';
    item.error = error.message;
    console.error(`${name}: ${error.message}`);
  }
  item.finishedAt = new Date().toISOString();
  if (page && !page.isClosed()) {
    const file = path.join(
      evidenceDirectory,
      `parser-lab-${String(report.stages.length).padStart(2, '0')}-${name}.png`,
    );
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    item.screenshot = path.relative(root, file);
  }
  console.log(`${item.status}: ${name}`);
  await saveReport();
  return item.status === 'passed';
}
async function launch() {
  const environment = { ...process.env, PYDICATE_STUDIO_DEV: '0', PYDICATE_PROJECT_PARENT: parent };
  delete environment.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [path.join(temporary, 'bootstrap.cjs')],
    env: environment,
    timeout: 60_000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await page.waitForURL('studio://app/index.html');
  await expect(page.getByText('Projeto local', { exact: true })).toBeVisible({ timeout: 60_000 });
}
async function close() {
  if (app) {
    await app.close();
    app = null;
  }
}
const invoke = (method, params = {}) =>
  page.evaluate(({ method, params }) => window.studio.invoke(method, params), { method, params });

async function openLab() {
  // The full laboratory (preparation, training, evaluation) opens from the tab.
  await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
  await page.getByRole('button', { name: 'Laboratório', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tupi → Pydicate' })).toBeVisible();
}
async function analyse(text) {
  // These stages exercise the full laboratory, which keeps its own editor.
  if (
    !(await page
      .getByRole('heading', { name: 'Tupi → Pydicate' })
      .isVisible()
      .catch(() => false))
  )
    await openLab();
  await page.getByRole('button', { name: 'Analisar' }).first().click();
  await page.getByTestId('lab-input').fill(text);
  await page.getByTestId('lab-analyse').click();
  await expect(page.getByTestId('lab-status')).toBeVisible({ timeout: 120_000 });
  return page.getByTestId('lab-status').innerText();
}

await fs.mkdir(parent, { recursive: true });
await fs.mkdir(userData, { recursive: true });
await fs.mkdir(path.join(temporary, 'session-data'), { recursive: true });
await fs.mkdir(evidenceDirectory, { recursive: true });
// Disposable clone with the user's working content copied in, exactly as the
// other native smokes do. The engine is a symlink and is only ever read.
await run('git', [
  'clone',
  '--shared',
  '--no-checkout',
  path.join(originals, 'oldtupicorpus'),
  corpus,
]);
await run('git', ['-C', corpus, 'read-tree', 'HEAD']);
for (const directory of [
  'historic',
  'ground_truth',
  'authoring',
  'tests',
  'synthetic',
  'dictionary',
])
  await fs
    .cp(path.join(originals, 'oldtupicorpus', directory), path.join(corpus, directory), {
      recursive: true,
      filter: (file) => !file.includes('__pycache__'),
    })
    .catch(() => {});
for (const entry of await fs.readdir(path.join(originals, 'oldtupicorpus')))
  if (entry.endsWith('.py'))
    await fs.copyFile(path.join(originals, 'oldtupicorpus', entry), path.join(corpus, entry));
await fs.symlink(path.join(originals, 'nhe-enga'), path.join(parent, 'nhe-enga'));
for (const file of watchedFiles)
  originalHashes[file] = hash(await fs.readFile(path.join(originals, 'oldtupicorpus', file)));
await fs.writeFile(
  path.join(temporary, 'bootstrap.cjs'),
  `const { app }=require('electron');\napp.setPath('userData',${JSON.stringify(userData)});\napp.setPath('sessionData',${JSON.stringify(path.join(temporary, 'session-data'))});\nrequire(${JSON.stringify(path.join(root, 'electron/main.cjs'))});\n`,
);
await fs.access(path.join(root, 'dist/index.html'));

const labState = path.join(userData, 'parser-lab');
async function listing(directory) {
  try {
    return await fs.readdir(directory);
  } catch {
    return [];
  }
}

let ok = await stage('solver-sits-with-the-passage', async () => {
  await launch();
  // The solver is a projection of the passage being worked on, beside the tree
  // it feeds, not a separate place to remember.
  await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Sugerir', exact: true })).toBeVisible();
  const state = await listing(labState);
  assert.deepEqual(state, [], 'Opening Studio must create no laboratory state.');
  return { entryPoint: 'editor tab', labStateEntries: state };
});

if (ok)
  ok = await stage('opening-the-tab-starts-nothing', async () => {
    await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Sugerir uma análise/ })).toBeVisible();
    // Reading state is a filesystem listing; preparation is offered, not run.
    await expect(page.getByRole('button', { name: /Preparar índice/ })).toBeVisible({
      timeout: 30_000,
    });
    const status = await invoke('parser_lab_status', {});
    assert.deepEqual(status.artifacts, []);
    assert.deepEqual(status.jobs, []);
    return { preparationOffered: true, artifacts: 0, jobs: 0 };
  });

if (ok)
  ok = await stage('prepare-baseline-from-the-tab', async () => {
    // One button, in the tab, for a contributor who has never opened the
    // laboratory: no profile to choose and no other screen to find.
    await page.getByRole('button', { name: /Preparar índice/ }).click();
    await expect(page.getByTestId('solver-analyse')).toBeEnabled({ timeout: 300_000 });
    const status = await invoke('parser_lab_status', {});
    assert.equal(status.jobs[0].stage, 'prepare');
    assert.equal(status.jobs[0].status, 'succeeded');
    assert.ok(status.active.index, 'Preparation activates its own index explicitly.');
    assert.deepEqual(status.interrupted, []);
    return {
      artifactRoot: status.artifactRoot,
      artifact: status.jobs[0].artifactId,
      counts: status.artifacts.find((item) => item.artifactId === status.active.index)?.counts,
    };
  });

if (ok)
  ok = await stage('solve-and-import-into-the-draft', async () => {
    // The point of the tool: analyse the form this passage is transcribed as,
    // and take the chosen reading into the draft being built.
    await page.getByRole('tab', { name: 'Código', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Pydicate editável', exact: true });
    const before = await editor.inputValue();
    await page.getByRole('tab', { name: 'Sugerir', exact: true }).click();
    await page.getByTestId('solver-input').fill('Asó xe rokype');
    await expect(page.getByTestId('solver-normalized')).toContainText('asoxerokype');
    await page.getByTestId('solver-analyse').click();
    const candidates = page.getByTestId('solver-candidates');
    await expect(candidates).toContainText('(+ixé * só) + (pe * (ixé * oka))', {
      timeout: 120_000,
    });
    await page.getByTestId('solver-use-0').click();
    await expect(page.getByTestId('solver-imported')).toBeVisible();
    await page.getByRole('tab', { name: 'Código', exact: true }).click();
    await expect(editor).toHaveValue('(+ixé * só) + (pe * (ixé * oka))');
    // An ordinary draft edit, undoable, and nothing published or approved.
    await page.getByRole('tab', { name: 'Árvore', exact: true }).click();
    await page.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
    await page.getByRole('tab', { name: 'Código', exact: true }).click();
    await expect(editor).toHaveValue(before);
    return { importedIntoDraft: '(+ixé * só) + (pe * (ixé * oka))', undoRestored: true };
  });

if (ok)
  ok = await stage('first-sentence-offline', async () => {
    const text = await analyse('Asó xe rokype');
    assert.match(text, /Análise completa/);
    await expect(page.getByTestId('lab-normalized')).toContainText('asoxerokype');
    const candidates = await page.getByTestId('lab-candidates').innerText();
    assert.match(candidates, /\(\+ixé \* só\) \+ \(pe \* \(ixé \* oka\)\)/);
    assert.match(candidates, /Composta de fragmentos/);
    await expect(page.getByTestId('lab-surface')).toHaveText('asó xe rokype');
    const morphemes = await page.getByTestId('lab-morphemes').innerText();
    for (const tag of ['SUBJECT_PREFIX:1ps', 'PLURIFORM_PREFIX:R', 'POSTPOSITION:LOCATIVE'])
      assert.ok(morphemes.includes(tag), `missing ${tag}`);
    assert.ok((await page.locator('.lab-tree svg').count()) > 0, 'the real tree must render');
    const screenshot = path.join(evidenceDirectory, 'parser-lab-first-result.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    return { normalized: 'asoxerokype', screenshot: path.relative(root, screenshot) };
  });

if (ok)
  ok = await stage('variants-and-unknown-input', async () => {
    const evidence = {};
    for (const value of ['ASOXEROKYPE', 'a so xé ró kŷ pe', 'Asó, xe rokype.']) {
      await analyse(value);
      await expect(page.getByTestId('lab-normalized')).toContainText('asoxerokype');
      await expect(page.getByTestId('lab-candidates')).toContainText(
        '(+ixé * só) + (pe * (ixé * oka))',
      );
      evidence[value] = 'asoxerokype';
    }
    for (const value of ['zzzz', 'Açó xe rokîpe']) {
      const text = await analyse(value);
      assert.match(text, /Nenhuma análise completa/);
      assert.equal(await page.getByTestId('lab-candidates').count(), 0);
      evidence[value] = 'unknown';
    }
    return evidence;
  });

if (ok)
  ok = await stage('composes-a-sentence-absent-from-the-index', async () => {
    const probe = await invoke('parser_lab_analyze', { text: 'ereso nde rokype' });
    assert.equal(probe.configuration.diagnostics.knownExpression, false);
    assert.equal(probe.candidates[0].provenance.route, 'composition');
    await analyse('ereso nde rokype');
    await expect(page.getByTestId('lab-candidates')).toContainText(
      '(+nde * só) + (pe * (nde * oka))',
    );
    await expect(page.getByTestId('lab-surface')).toHaveText('eresó nde rokype');
    return {
      knownExpression: false,
      route: probe.candidates[0].provenance.route,
      source: probe.candidates[0].source,
    };
  });

if (ok)
  ok = await stage('tree-edit-changes-source-and-surface', async () => {
    await analyse('Asó xe rokype');
    await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó xe rokype');
    await page.getByTestId('lab-code').fill('(+ixé * só) + (pe * (nde * oka))');
    await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó nde rokype', {
      timeout: 60_000,
    });
    const editor = page.locator('.lab-editor');
    await editor.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
    await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó xe rokype');
    await editor.getByRole('button', { name: 'Refazer edição na árvore', exact: true }).click();
    await expect(page.getByTestId('lab-editor-surface')).toHaveText('asó nde rokype');
    // The other direction: a real context-menu gesture on the actual editor
    // rewrites the laboratory source and triggers a fresh engine evaluation.
    const tree = page.locator('.lab-tree');
    await tree.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await tree.locator('.canvas-node').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Escolher variante…', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Adicionar operação', exact: true });
    await panel.getByRole('button', { name: 'Criar operação', exact: true }).click();
    await expect(page.getByTestId('lab-code')).toHaveValue(/\.var\(/);
    const gestured = await page.getByTestId('lab-code').inputValue();
    await editor.getByRole('button', { name: 'Desfazer edição na árvore', exact: true }).click();
    await expect(page.getByTestId('lab-code')).toHaveValue('(+ixé * só) + (pe * (nde * oka))');
    return { edited: 'asó nde rokype', undo: true, redo: true, treeGesture: gestured };
  });

if (ok)
  ok = await stage('ambiguity-and-collisions-preserved', async () => {
    const collisions = await invoke('parser_lab_collisions', { limit: 5 });
    const optional = await invoke('parser_lab_optional', {});
    assert.equal(optional.neural.trained, false);
    assert.equal(optional.agent.ran, false);
    return {
      collisionGroups: collisions.total,
      neuralState: optional.neural.state,
      neuralMissing: optional.neural.missingDependencies,
      agentState: optional.agent.state,
    };
  });

if (ok)
  ok = await stage('choose-a-reading-then-learn-from-it', async () => {
    // The import in an earlier stage already confirmed one reading, but a form
    // with a single reading yields no contrast, so training must still refuse.
    const learnedBefore = await invoke('parser_lab_feedback', {});
    await page.getByRole('button', { name: 'Treinar' }).click();
    await page.getByTestId('lab-start-train').click();
    await expect
      .poll(async () => (await invoke('parser_lab_status', {})).jobs[0].status, {
        timeout: 600_000,
      })
      .toMatch(/succeeded|failed/);
    const refused = (await invoke('parser_lab_status', {})).jobs[0];
    assert.equal(refused.status, 'failed', 'an undecided laboratory has nothing to train on');
    assert.match(refused.error, /contrastes decididos/);

    // `sapépe` has two readings the surface cannot separate. Both are shown with
    // the exact tag that differs, and the contributor chooses one.
    const shown = await analyse('sapépe');
    assert.match(shown, /Análise completa/);
    const candidates = page.getByTestId('lab-candidates');
    assert.equal(await candidates.locator('li').count(), 2, 'both readings are offered');
    const listed = await candidates.innerText();
    assert.match(listed, /\(pe \* apé\)/);
    assert.match(listed, /\(pe \* \(ae \* apé\)\)/);
    assert.match(listed, /PLURIFORM_PREFIX:S:ABSOLUTE/);
    await candidates.locator('li').nth(1).locator('button').first().click();
    await page.getByTestId('lab-choose-1').click();
    await expect(page.getByTestId('lab-acceptance')).toContainText('Confirmada por você', {
      timeout: 60_000,
    });
    const reordered = await candidates.locator('li').first().innerText();
    assert.match(reordered, /\(pe \* \(ae \* apé\)\)/, 'the confirmed reading comes first now');

    // That one decision is what training can actually use.
    const learned = await invoke('parser_lab_feedback', {});
    assert.equal(
      learned.summary.confirmedExamples,
      learnedBefore.summary.confirmedExamples + 1,
      'choosing a reading adds exactly one confirmed reading',
    );
    assert.ok(learned.summary.preferencePairs > learnedBefore.summary.preferencePairs);
    assert.ok(learned.summary.attempts > 0);
    await page.getByRole('button', { name: 'Treinar' }).click();
    await page.getByTestId('lab-start-train').click();
    await expect
      .poll(async () => (await invoke('parser_lab_status', {})).jobs[0].status, {
        timeout: 600_000,
      })
      .toBe('succeeded');
    const trained = (await invoke('parser_lab_status', {})).jobs[0];
    await page.getByRole('button', { name: 'Avaliar' }).click();
    await page.getByTestId('lab-start-evaluate').click();
    await expect
      .poll(async () => (await invoke('parser_lab_status', {})).jobs[0].status, {
        timeout: 600_000,
      })
      .toMatch(/succeeded|failed/);
    await page.reload();
    await page.getByRole('button', { name: 'Montar a análise', exact: true }).click();
    await openLab();
    const status = await invoke('parser_lab_status', {});
    const ranker = status.artifacts.find((item) => item.kind === 'ranker');
    const evaluation = status.artifacts.find((item) => item.kind === 'evaluation');
    assert.ok(ranker?.completed, 'the trained ranker must survive a reload');
    assert.ok(evaluation?.completed, 'the evaluation artifact must survive a reload');
    assert.ok(
      ranker.metrics.trainPairsFromJudgments > 0,
      'the contributor decision must be what training used',
    );
    return {
      refusedWithoutJudgments: refused.error.slice(0, 120),
      readingsOffered: 2,
      confirmedBefore: learnedBefore.summary.confirmedExamples,
      learned: learned.summary,
      trainStatus: trained.status,
      ranker: { id: ranker.artifactId, metrics: ranker.metrics },
      evaluation: { id: evaluation.artifactId, metrics: evaluation.metrics },
    };
  });

if (ok)
  ok = await stage('cancellation-and-interruption-are-honest', async () => {
    await page.getByRole('button', { name: 'Dados' }).click();
    // The largest profile, so the cancel always lands mid-run instead of
    // racing a preparation that may finish first on a warm engine.
    await page.getByTestId('lab-profile').selectOption('large');
    await page.getByTestId('lab-start-prepare').click();
    let job = null;
    // Wait until generation has actually begun. Cancelling during the earlier
    // fingerprint snapshot is also correct, but it leaves nothing on disk, so
    // it would not exercise interrupted-state recovery.
    await expect
      .poll(
        async () => {
          const { jobs } = await invoke('parser_lab_jobs', {});
          job = jobs.find((item) => item.status === 'running');
          return Boolean(job?.progress?.some((row) => row.stage === 'fragments'));
        },
        { timeout: 300_000 },
      )
      .toBe(true);
    assert.ok(job, 'the preparation must be observable while it runs');
    await invoke('parser_lab_job_cancel', { jobId: job.id });
    await expect
      .poll(
        async () => {
          const { jobs } = await invoke('parser_lab_jobs', {});
          return jobs.find((item) => item.id === job.id).status;
        },
        { timeout: 120_000 },
      )
      .toBe('cancelled');
    const after = await invoke('parser_lab_status', {});
    assert.ok(after.active.index, 'a cancelled job must not deactivate the working index');
    assert.notEqual(after.jobs.find((item) => item.id === job.id).status, 'succeeded');
    // The half-written preparation is reported as interrupted, never promoted to
    // a complete artifact, and can be discarded from the tab.
    assert.ok(after.interrupted.length > 0, 'a killed preparation leaves inspectable leftovers');
    assert.ok(
      !after.artifacts.some((item) => item.completed && item.recipe?.profile === 'large'),
      'an interrupted preparation must never appear as a complete artifact',
    );
    const leftovers = after.interrupted.map((row) => row.name);
    await page.getByTestId('lab-clear-staging').click();
    await expect
      .poll(async () => (await invoke('parser_lab_status', {})).interrupted.length, {
        timeout: 60_000,
      })
      .toBe(0);
    const cleared = await invoke('parser_lab_status', {});
    assert.equal(cleared.active.index, after.active.index);
    return {
      cancelledJob: job.id,
      activeIndexPreserved: after.active.index,
      interruptedLeftovers: leftovers,
      discarded: true,
    };
  });

await stage('corpus-untouched', async () => {
  const changed = [];
  for (const file of watchedFiles)
    if (
      hash(await fs.readFile(path.join(originals, 'oldtupicorpus', file))) !== originalHashes[file]
    )
      changed.push(file);
  assert.deepEqual(changed, [], 'The laboratory must never write to the corpus.');
  return { watchedFiles, unchanged: true };
});

await close();
report.finishedAt = new Date().toISOString();
report.passed = report.stages.every((item) => item.status === 'passed');
await saveReport();
await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
console.log(`report: ${path.relative(root, reportPath)}`);
process.exit(report.passed ? 0 : 1);
