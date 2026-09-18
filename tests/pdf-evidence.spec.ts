import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { EvidenceStatus } from '../src/domain/evidence';

const require = createRequire(import.meta.url);
const { createEvidenceService } = require('../electron/evidence-service.cjs') as {
  createEvidenceService: (options: {
    stateDirectory: string;
    chooseFile: () => Promise<string>;
  }) => { invoke(method: string, params: Record<string, unknown>): Promise<unknown> };
};
const { makePdfFixture } = require('../electron/tests/pdf-fixture.cjs') as {
  makePdfFixture: () => Buffer;
};
const params = { projectId: 'project:pdf-test', sourceId: 'araujo', passageId: 'passage:a' };

async function ready(page: Page) {
  await expect(page.getByTestId('pdf-canvas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Renderizando' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled();
}
async function draw(page: Page, start: [number, number], end: [number, number]) {
  await ready(page);
  await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
  const box = (await page.getByTestId('pdf-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 8 });
  await page.mouse.up();
}

async function guideFixture(page: Page, directory: string) {
  const source = join(directory, 'guide-vector.pdf');
  await writeFile(source, makePdfFixture());
  const options = { stateDirectory: join(directory, 'state'), chooseFile: async () => source };
  const fixture = {
    service: createEvidenceService(options),
    restart() {
      this.service = createEvidenceService(options);
    },
  };
  const attached = (await fixture.service.invoke('evidence_attach', {
    ...params,
    expectedRevision: 0,
  })) as EvidenceStatus;
  await page.exposeFunction(
    '__pdfInvoke',
    async (method: string, input: Record<string, unknown>) => {
      const result = await fixture.service.invoke(method, {
        ...input,
        previousPassages: input.passageId === 'passage:a' ? [] : [{ id: 'passage:a', ordinal: 1 }],
      });
      return result instanceof ArrayBuffer ? Array.from(new Uint8Array(result)) : result;
    },
  );
  await page.addInitScript(() => {
    const bridge = window as unknown as {
      __pdfInvoke: (method: string, input: unknown) => Promise<unknown>;
      studio: unknown;
    };
    bridge.studio = {
      invoke: async (method: string, input: unknown) => {
        const result = await bridge.__pdfInvoke(method, input);
        return method === 'evidence_bytes' ? new Uint8Array(result as number[]).buffer : result;
      },
    };
  });
  return { fixture, assetId: attached.asset!.id, revision: attached.revision };
}

test('analysis preparation awaits the exact saved region and hidden tabs keep unsaved PDF edits', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-analysis-'));
  try {
    const { fixture } = await guideFixture(page, directory);
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await draw(page, [0.25, 0.3], [0.5, 0.45]);
    const rect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByLabel('Zoom do PDF').selectOption('1.5');
    await page.getByRole('button', { name: 'Alternar apoio Fonte / IA' }).click();
    await expect(page.getByTestId('pdf-canvas')).toBeHidden();
    await page.getByRole('button', { name: 'Alternar apoio Fonte / IA' }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByLabel('Zoom do PDF')).toHaveValue('1.5');
    await page.getByRole('button', { name: 'Preparar evidência para análise' }).click();
    await expect(page.locator('#prepared-evidence')).toContainText('regionIds');
    const prepared = JSON.parse(await page.locator('#prepared-evidence').innerText());
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(prepared.revision).toBe(saved.revision);
    expect(prepared.regionIds).toEqual(saved.passage!.regions.map((region) => region.id));
    expect(saved.passage!.regions[0].rect).toEqual(rect!.split(',').map(Number));
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Preparar evidência para análise' }).click();
    await expect(page.locator('#prepared-evidence')).toContainText('"regionIds":[]');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('actual PDF canvas and same physical region survive zoom, resize, rotation, save, service restart and passage return', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-browser-'));
  try {
    const source = join(directory, 'original-vector.pdf');
    await writeFile(source, makePdfFixture());
    const options = { stateDirectory: join(directory, 'state'), chooseFile: async () => source };
    let service = createEvidenceService(options);
    await page.exposeFunction(
      '__pdfInvoke',
      async (method: string, input: Record<string, unknown>) => {
        const result = await service.invoke(method, {
          ...input,
          previousPassages:
            input.passageId === 'passage:b' ? [{ id: 'passage:a', ordinal: 1 }] : [],
        });
        return result instanceof ArrayBuffer ? Array.from(new Uint8Array(result)) : result;
      },
    );
    await page.addInitScript(() => {
      const bridge = window as unknown as {
        __pdfInvoke: (method: string, input: unknown) => Promise<unknown>;
        studio: unknown;
      };
      bridge.studio = {
        invoke: async (method: string, input: unknown) => {
          const result = await bridge.__pdfInvoke(method, input);
          return method === 'evidence_bytes' ? new Uint8Array(result as number[]).buffer : result;
        },
      };
    });
    await page.goto('/tests/pdf-harness.html');
    await page.getByRole('button', { name: 'Vincular PDF à fonte' }).click();
    await ready(page);
    const color = await page.getByTestId('pdf-canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return Array.from(
        canvas
          .getContext('2d')!
          .getImageData(canvas.width * 0.45, canvas.height * (1 - 350 / 600), 1, 1).data,
      );
    });
    expect(color[2]).toBeGreaterThan(180);
    expect(color[0]).toBeLessThan(30);
    await draw(page, [0.25, 1 / 3], [0.65, 0.5]);
    const region = page.getByTestId('pdf-region');
    await expect(region).toHaveCount(1);
    const coordinates = (await region.getAttribute('data-pdf-rect'))!.split(',').map(Number);
    for (const [i, expected] of [100, 300, 260, 400].entries())
      expect(coordinates[i]).toBeCloseTo(expected, 0);
    const originalRect = await region.getAttribute('data-pdf-rect');
    await page.getByLabel('Zoom do PDF').selectOption('1.5');
    await page.getByRole('button', { name: 'Girar 90°' }).click();
    await ready(page);
    await page.setViewportSize({ width: 850, height: 1000 });
    await ready(page);
    await expect(region).toHaveAttribute('data-pdf-rect', originalRect!);
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    const saved = (await service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.view.rotation).toBe(90);
    expect(saved.passage!.view.zoom).toBe(1.5);
    expect(saved.passage!.regions[0].rect).toEqual(coordinates);
    service = createEvidenceService(options);
    await page.reload();
    await ready(page);
    await expect(region).toHaveAttribute('data-pdf-rect', originalRect!);
    await expect(page.getByLabel('Zoom do PDF')).toHaveValue('1.5');
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('data-pdf-rect', originalRect!);
    await expect(
      page.getByText('Localização herdada da passagem 1', { exact: false }),
    ).toBeVisible();
    expect(
      (
        (await service.invoke('evidence_status', {
          ...params,
          passageId: 'passage:b',
        })) as EvidenceStatus
      ).passage,
    ).toBeNull();
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await expect(region).toHaveAttribute('data-pdf-rect', originalRect!);

    // A second region on a page with intrinsic /Rotate 90 remains a separate physical page.
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await page.getByLabel('Página física do PDF', { exact: true }).fill('2');
    await ready(page);
    await draw(page, [0.2, 0.2], [0.4, 0.4]);
    await expect(page.getByRole('button', { name: 'Região 2 · PDF 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    service = createEvidenceService(options);
    await page.reload();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    const multi = (await service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(multi.passage!.regions.map((entry) => entry.pageIndex)).toEqual([0, 1]);
    await page.getByRole('button', { name: 'Remover região', exact: true }).click();
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    expect(
      ((await service.invoke('evidence_status', params)) as EvidenceStatus).passage!.regions,
    ).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PDF region moving/resizing changes native coordinates and an unsaved draft stays attached to its passage across reload', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-edits-'));
  try {
    const source = join(directory, 'original-vector.pdf');
    await writeFile(source, makePdfFixture());
    const service = createEvidenceService({
      stateDirectory: join(directory, 'state'),
      chooseFile: async () => source,
    });
    await page.exposeFunction(
      '__pdfInvoke',
      async (method: string, input: Record<string, unknown>) => {
        const result = await service.invoke(method, {
          ...input,
          previousPassages:
            input.passageId === 'passage:b' ? [{ id: 'passage:a', ordinal: 1 }] : [],
        });
        return result instanceof ArrayBuffer ? Array.from(new Uint8Array(result)) : result;
      },
    );
    await page.addInitScript(() => {
      const bridge = window as unknown as {
        __pdfInvoke: (method: string, input: unknown) => Promise<unknown>;
        studio: unknown;
      };
      bridge.studio = {
        invoke: async (method: string, input: unknown) => {
          const result = await bridge.__pdfInvoke(method, input);
          return method === 'evidence_bytes' ? new Uint8Array(result as number[]).buffer : result;
        },
      };
    });
    await page.goto('/tests/pdf-harness.html');
    await page.getByRole('button', { name: 'Vincular PDF à fonte' }).click();
    await ready(page);
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await draw(page, [0.25, 0.2], [0.65, 0.4]);
    const region = page.getByTestId('pdf-region');
    const original = (await region.getAttribute('data-pdf-rect'))!.split(',').map(Number);
    const box = (await region.locator(':scope > rect').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 15, { steps: 4 });
    await page.mouse.up();
    const moved = (await region.getAttribute('data-pdf-rect'))!.split(',').map(Number);
    expect(moved[0]).toBeGreaterThan(original[0]);
    expect(moved[1]).toBeLessThan(original[1]);
    expect(moved[2] - moved[0]).toBeCloseTo(original[2] - original[0], 5);
    const handle = (await region.locator('[data-handle="se"]').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 18, handle.y + handle.height / 2 + 22, {
      steps: 4,
    });
    await page.mouse.up();
    const resized = await region.getAttribute('data-pdf-rect');
    expect(resized).not.toEqual(moved.join(','));
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect(region).toHaveAttribute('data-pdf-rect', resized!);
    await expect(
      page.getByText('Localização herdada da passagem 1', { exact: false }),
    ).toBeVisible();
    const inheritedCache = await page.evaluate(() =>
      localStorage.getItem(
        'pydicate-studio:evidence-draft:v1:["project:pdf-test","araujo","passage:b"]',
      ),
    );
    await page.reload();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect(region).toHaveAttribute('data-pdf-rect', resized!);
    expect(
      await page.evaluate(() =>
        localStorage.getItem(
          'pydicate-studio:evidence-draft:v1:["project:pdf-test","araujo","passage:b"]',
        ),
      ),
    ).toBe(inheritedCache);
    await page.getByRole('button', { name: 'Remover região', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await expect(region).toHaveAttribute('data-pdf-rect', resized!);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect(region).toHaveCount(0);
    await expect(page.getByText('Localização herdada', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await expect(region).toHaveAttribute('data-pdf-rect', resized!);
    await page.reload();
    await ready(page);
    await expect(region).toHaveAttribute('data-pdf-rect', resized!);
    await expect(
      page.getByText('Regiões ou visualização não salvas', { exact: false }),
    ).toBeVisible();
    expect(
      ((await service.invoke('evidence_status', params)) as EvidenceStatus).passage,
    ).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('next-passage guides stay separate from new evidence, accept drawing through the shadow, and retain page navigation on restart', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-guide-'));
  try {
    const { fixture, assetId, revision } = await guideFixture(page, directory);
    const original = { id: 'original-box', assetId, pageIndex: 0, rect: [100, 300, 260, 400] };
    await fixture.service.invoke('evidence_save', {
      ...params,
      assetId,
      expectedRevision: revision,
      regions: [original],
      view: { pageIndex: 0, zoom: 0.5, rotation: 0 },
    });
    const savedOriginal = (
      (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus
    ).passage;
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    const ghost = page.getByTestId('pdf-guide-region');
    await expect(ghost).toHaveAttribute('data-pdf-rect', original.rect.join(','));
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:a');
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await expect(ghost.locator('[data-handle]')).toHaveCount(0);
    expect(await ghost.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
    await expect(page.getByRole('button', { name: 'Remover região', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    await expect(page.locator('#evidence-pointers')).toHaveText('0');
    let saved = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    expect(saved.passage!.regions).toEqual([]);
    expect(saved.passage!.guide!.region).toEqual(original);
    await draw(page, [0.3, 0.36], [0.6, 0.45]);
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    await expect(ghost).toHaveAttribute('data-pdf-rect', original.rect.join(','));
    await page.getByRole('button', { name: 'Salvar regiões', exact: true }).click();
    await expect(page.locator('#evidence-pointers')).toHaveText('1');
    saved = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    expect(saved.passage!.regions[0].id).not.toBe(original.id);
    expect(saved.passage!.regions[0].rect).not.toEqual(original.rect);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:b');
    await expect(ghost).toHaveAttribute('data-pdf-rect', saved.passage!.regions[0].rect.join(','));
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Próxima página do PDF', exact: true }).click();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await expect(ghost).toHaveCount(0);
    fixture.restart();
    await page.reload();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await page.getByLabel('Página física do PDF', { exact: true }).fill('1');
    await ready(page);
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:b');
    expect(
      ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage,
    ).toEqual(savedOriginal);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unsaved predecessor and repeated empty pending passages preserve a guide without promoting its box', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-guide-unsaved-'));
  try {
    const { fixture } = await guideFixture(page, directory);
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await draw(page, [0.2, 0.2], [0.55, 0.4]);
    const rect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Próxima página do PDF', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    fixture.restart();
    await page.reload();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await page.getByLabel('Página física do PDF', { exact: true }).fill('1');
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute(
      'data-source-passage',
      'passage:a',
    );
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    expect(
      ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage,
    ).toBeNull();
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByTestId('pdf-guide-region')).toHaveCount(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
