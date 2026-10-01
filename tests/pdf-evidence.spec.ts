import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { EvidenceStatus } from '../src/domain/evidence';

const require = createRequire(import.meta.url);
const { createEvidenceService } = require('../runtime/evidence-service.cjs') as {
  createEvidenceService: (options: {
    stateDirectory: string;
    chooseFile: () => Promise<string>;
  }) => { invoke(method: string, params: Record<string, unknown>): Promise<unknown> };
};
const { makePdfFixture } = require('../runtime/tests/pdf-fixture.cjs') as {
  makePdfFixture: (options?: { paddingBytes?: number }) => Buffer;
};
const { makeScanPdfFixture } = require('../runtime/tests/pdf-scan-fixture.cjs') as {
  makeScanPdfFixture: () => Buffer;
};
const params = { projectId: 'project:pdf-test', sourceId: 'araujo', passageId: 'passage:a' };

async function ready(page: Page) {
  await expect(page.getByTestId('pdf-canvas')).toBeVisible();
  await expect(page.getByTestId('pdf-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status').filter({ hasText: 'Renderizando' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeEnabled();
}
async function draw(page: Page, start: [number, number], end: [number, number]) {
  await ready(page);
  const marking = page.getByRole('button', { name: 'Marcar região', exact: true });
  if ((await marking.getAttribute('aria-pressed')) !== 'true') await marking.click();
  // Wait for the page's geometry to settle before deriving mouse coordinates;
  // the second fixture page has a different aspect ratio.
  await page.getByTestId('pdf-canvas').scrollIntoViewIfNeeded();
  await ready(page);
  const box = (await page.getByTestId('pdf-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 8 });
  await page.mouse.up();
}

async function moveRegion(page: Page, dx: number, dy: number, resize = false) {
  const region = page.getByTestId('pdf-region');
  await region.scrollIntoViewIfNeeded();
  const target = resize
    ? region.locator('[data-handle="se"]')
    : region.locator(':scope > rect').first();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  return (await region.getAttribute('data-pdf-rect'))!.split(',').map(Number);
}

async function guideFixture(
  page: Page,
  directory: string,
  onInvoke?: (method: string, input: Record<string, unknown>) => void | Promise<void>,
  pdfBytes = makePdfFixture(),
  { attach = true } = {},
) {
  const source = join(directory, 'guide-vector.pdf');
  await writeFile(source, pdfBytes);
  const options = { stateDirectory: join(directory, 'state'), chooseFile: async () => source };
  const fixture = {
    service: createEvidenceService(options),
    restart() {
      this.service = createEvidenceService(options);
    },
  };
  const attached = attach
    ? ((await fixture.service.invoke('evidence_attach', {
        ...params,
        expectedRevision: 0,
      })) as EvidenceStatus)
    : null;
  await page.exposeFunction(
    '__pdfInvoke',
    async (method: string, input: Record<string, unknown>) => {
      await onInvoke?.(method, input);
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
  return { fixture, assetId: attached?.asset?.id ?? '', revision: attached?.revision ?? 0 };
}

test('region autosave waits until a drawing gesture has finished', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-region-autosave-gesture-'));
  try {
    const writes: Record<string, unknown>[] = [];
    const { fixture } = await guideFixture(page, directory, (method, input) => {
      if (method === 'evidence_save') writes.push(input);
    });
    await page.goto('/tests/pdf-harness.html');
    await ready(page);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Marcar região', exact: true }).click();
    await page.getByTestId('pdf-canvas').scrollIntoViewIfNeeded();
    const box = (await page.getByTestId('pdf-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.35, { steps: 4 });
    // Longer than the debounce: a partially drawn rectangle must never be saved.
    await page.waitForTimeout(650);
    expect(writes).toEqual([]);
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4, { steps: 4 });
    await page.mouse.up();
    const rect = (await page.getByTestId('pdf-region').getAttribute('data-pdf-rect'))!
      .split(',')
      .map(Number);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    expect(writes).toHaveLength(1);
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.regions[0].rect).toEqual(rect);
    expect(writes[0].expectedPassageFingerprint).toBeTruthy();
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('region autosave coalesces edits behind an inflight save without restoring its old rectangle', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-region-autosave-coalesce-'));
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  try {
    const writes: Record<string, unknown>[] = [];
    const { fixture } = await guideFixture(page, directory, async (method, input) => {
      if (method !== 'evidence_save') return;
      writes.push(input);
      if (writes.length === 1) await firstGate;
      if (writes.length === 2) await secondGate;
    });
    await page.goto('/tests/pdf-harness.html');
    await draw(page, [0.2, 0.2], [0.5, 0.4]);
    await expect.poll(() => writes.length).toBe(1);
    await moveRegion(page, 12, 8);
    await moveRegion(page, 8, 5);
    const latest = await moveRegion(page, 15, 10, true);
    expect((writes[0].regions as { rect: number[] }[])[0].rect).not.toEqual(latest);
    releaseFirst();
    await expect.poll(() => writes.length).toBe(2);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', latest.join(','));
    expect((writes[1].regions as { rect: number[] }[])[0].rect).toEqual(latest);
    releaseSecond();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    await page.waitForTimeout(650);
    expect(writes).toHaveLength(2);
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.regions[0].rect).toEqual(latest);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', latest.join(','));
  } finally {
    releaseFirst();
    releaseSecond();
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const stage of ['dirty', 'inflight']) {
  test(`switching passage with ${stage} regions saves the original and ignores its late response`, async ({
    page,
  }) => {
    const directory = await mkdtemp(join(tmpdir(), `studio-region-autosave-switch-${stage}-`));
    let releaseA!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    try {
      const writes: Record<string, unknown>[] = [];
      const { fixture } = await guideFixture(page, directory, async (method, input) => {
        if (method !== 'evidence_save') return;
        writes.push(input);
        if (input.passageId === 'passage:a') await gate;
      });
      const initialA = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
      const initialB = (await fixture.service.invoke('evidence_status', {
        ...params,
        passageId: 'passage:b',
      })) as EvidenceStatus;
      await page.goto('/tests/pdf-harness.html');
      await ready(page);
      if (stage === 'dirty') {
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 100));
      }
      await draw(page, [0.2, 0.2], [0.45, 0.35]);
      const rectA = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
      if (stage === 'inflight') await expect.poll(() => writes.length).toBe(1);
      else expect(writes).toEqual([]);
      await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
      if (stage === 'dirty') await page.clock.resume();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].passageId).toBe('passage:a');
      await ready(page);
      await expect(page.getByTestId('pdf-region')).toHaveCount(0);
      await draw(page, [0.4, 0.5], [0.65, 0.65]);
      const rectB = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
      await expect(
        page.getByText('Evidência salva no computador.', { exact: false }),
      ).toBeVisible();
      expect(writes.map((write) => write.passageId)).toEqual(['passage:a', 'passage:b']);
      expect(writes[0].expectedPassageFingerprint).toBe(initialA.passageFingerprint);
      expect(writes[1].expectedPassageFingerprint).toBe(initialB.passageFingerprint);
      expect(writes.every((write) => typeof write.expectedPassageFingerprint === 'string')).toBe(
        true,
      );
      const savedB = (await fixture.service.invoke('evidence_status', {
        ...params,
        passageId: 'passage:b',
      })) as EvidenceStatus;
      expect(savedB.passage!.regions[0].rect.join(',')).toBe(rectB);
      releaseA();
      await expect
        .poll(async () =>
          (
            (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus
          ).passage?.regions[0]?.rect.join(','),
        )
        .toBe(rectA);
      await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rectB!);
      const afterA = (await fixture.service.invoke('evidence_status', {
        ...params,
        passageId: 'passage:b',
      })) as EvidenceStatus;
      expect(afterA.passage).toEqual(savedB.passage);
      await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
      await ready(page);
      await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rectA!);
      expect(writes).toHaveLength(2);
    } finally {
      releaseA();
      await page.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('region autosave errors retain the local rectangle and offer an explicit retry', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-region-autosave-retry-'));
  try {
    let fail = true;
    let attempts = 0;
    const { fixture } = await guideFixture(page, directory, (method) => {
      if (method !== 'evidence_save') return;
      attempts++;
      if (fail) throw new Error('Falha de rede simulada');
    });
    await page.goto('/tests/pdf-harness.html');
    await draw(page, [0.2, 0.2], [0.55, 0.4]);
    const rect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await expect(page.getByRole('alert')).toContainText('Falha de rede simulada');
    const cached = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          'pydicate-studio:evidence-draft:v1:["project:pdf-test","araujo","passage:a"]',
        )!,
      ),
    );
    expect(cached.regions[0].rect.join(',')).toBe(rect);
    expect(
      ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage,
    ).toBeNull();
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect!);
    fail = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    expect(attempts).toBe(2);
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.regions[0].rect.join(',')).toBe(rect);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect!);
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const edited of [false, true]) {
  test(`server region corrections ${edited ? 'preserve actual unsaved edits' : 'replace a cached old saved region'}`, async ({
    page,
  }) => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-evidence-canonical-'));
    try {
      let saves = 0;
      const { fixture, assetId, revision } = await guideFixture(page, directory, (method) => {
        if (method === 'evidence_save') saves++;
      });
      const wrong = { id: 'old-wrong', assetId, pageIndex: 0, rect: [30, 40, 90, 100] };
      const correct = { id: 'correct', assetId, pageIndex: 1, rect: [30, 40, 90, 100] };
      const before = (await fixture.service.invoke('evidence_save', {
        ...params,
        assetId,
        expectedRevision: revision,
        regions: [wrong, correct],
        view: { pageIndex: 0, zoom: 1, rotation: 0 },
      })) as EvidenceStatus;
      const after = (await fixture.service.invoke('evidence_save', {
        ...params,
        assetId,
        expectedRevision: before.revision,
        regions: [correct],
        view: { pageIndex: 1, zoom: 1, rotation: 0 },
      })) as EvidenceStatus;
      const key =
        'pydicate-studio:evidence-draft:v1:' +
        JSON.stringify([params.projectId, params.sourceId, params.passageId]);
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        {
          key,
          value: {
            assetId,
            revision: before.revision,
            regions: edited ? [{ ...wrong, rect: [35, 45, 95, 105] }] : [wrong, correct],
            view: { pageIndex: 0, zoom: 1, rotation: 0 },
            baseline: JSON.stringify(before.passage),
          },
        },
      );
      await page.goto('/tests/pdf-harness.html');
      await ready(page);
      await expect(
        page.getByRole('button', { name: `Região 1 · PDF ${edited ? 1 : 2}`, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Região 2/ })).toHaveCount(0);
      if (edited)
        await expect(
          page.getByText(
            'Há regiões locais não salvas e a evidência mudou. Exporte o rascunho antes de recarregar.',
            { exact: true },
          ),
        ).toBeVisible();
      else
        await expect(
          page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true }),
        ).toHaveCount(0);
      expect(
        ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage,
      ).toEqual(after.passage);
      expect(saves).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const target of ['Fonte Bettendorff', 'Outro projeto']) {
  test(`switching to ${target} never requests the previous source's PDF`, async ({ page }) => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-source-switch-'));
    try {
      const byteRequests: Record<string, unknown>[] = [];
      const { fixture, assetId, revision } = await guideFixture(
        page,
        directory,
        (method, input) => {
          if (method === 'evidence_bytes') byteRequests.push(input);
        },
      );
      const saved = (await fixture.service.invoke('evidence_save', {
        ...params,
        assetId,
        expectedRevision: revision,
        regions: [{ id: 'saved-region', assetId, pageIndex: 0, rect: [30, 40, 90, 100] }],
        view: { pageIndex: 0, zoom: 1, rotation: 0 },
      })) as EvidenceStatus;
      await page.goto('/tests/pdf-harness.html?sources');
      await ready(page);
      await expect(
        page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: target, exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }),
      ).toBeEnabled();
      await expect(page.getByTestId('pdf-canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Voltar à fonte original', exact: true }).click();
      await ready(page);
      await expect(
        page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true }),
      ).toBeVisible();
      expect(byteRequests).toEqual([
        { ...params, assetId },
        { ...params, assetId },
      ]);
      const returned = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
      expect(returned.passage).toEqual(saved.passage);
      expect(returned.revision).toBe(saved.revision);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('passages in the same source reuse the open PDF and keep their own regions', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-reuse-'));
  try {
    const requests: Record<string, unknown>[] = [];
    const { fixture, assetId, revision } = await guideFixture(page, directory, (method, input) => {
      if (method === 'evidence_bytes') requests.push(input);
    });
    await fixture.service.invoke('evidence_save', {
      ...params,
      assetId,
      expectedRevision: revision,
      regions: [{ id: 'original', assetId, pageIndex: 0, rect: [30, 40, 90, 100] }],
      view: { pageIndex: 0, zoom: 1, rotation: 0 },
    });
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    const originalPixels = await page
      .getByTestId('pdf-canvas')
      .evaluate((node) => (node as HTMLCanvasElement).toDataURL());
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    expect(
      await page
        .getByTestId('pdf-canvas')
        .evaluate((node) => (node as HTMLCanvasElement).toDataURL()),
    ).toBe(originalPixels);
    expect(requests).toEqual([{ ...params, assetId }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('drawing waits for the selected passage while its metadata is delayed', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-readiness-'));
  let release!: () => void,
    waiting = false;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await guideFixture(page, directory, async (method, input) => {
      if (method === 'evidence_status' && input.passageId === 'passage:b') {
        waiting = true;
        await blocked;
      }
    });
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect.poll(() => waiting).toBe(true);
    await expect(page.getByTestId('pdf-canvas')).toBeVisible();
    await expect(page.getByTestId('pdf-canvas')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toBeDisabled();
    release();
    await ready(page);
    await expect(page.getByTestId('pdf-canvas')).toHaveAttribute('data-pdf-page', '1');
  } finally {
    release();
    await rm(directory, { recursive: true, force: true });
  }
});

test('hosted PDF caches original byte ranges across passage switches and reloads', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-ranges-'));
  try {
    const bytes = makePdfFixture({ paddingBytes: 2 * 1024 * 1024 });
    const { assetId } = await guideFixture(
      page,
      directory,
      (method) => {
        expect(method).not.toBe('evidence_bytes');
      },
      bytes,
    );
    const ranges: string[] = [];
    await page.route('**/fixture.pdf*', async (route) => {
      const range = route.request().headers().range;
      const headers: Record<string, string> = {
        'Content-Type': 'application/pdf',
        'Accept-Ranges': 'bytes',
        ETag: `"sha256-${assetId}"`,
      };
      if (range) {
        ranges.push(range);
        const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
        const start = Number(match[1]),
          end = Math.min(Number(match[2]), bytes.length - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
        headers['Content-Length'] = String(end - start + 1);
        await route.fulfill({ status: 206, headers, body: bytes.subarray(start, end + 1) });
      } else {
        headers['Content-Length'] = String(bytes.length);
        await route.fulfill({ status: 200, headers, body: bytes });
      }
    });
    await page.addInitScript(() => {
      window.studio!.runtime = 'collaborative';
      window.studio!.evidenceUrl = ({ assetId }) => `/fixture.pdf?asset=${assetId}`;
      window.studio!.evidenceCacheScope = () => 'fixture-account';
    });
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    expect(ranges.length).toBeGreaterThan(0);
    const requested = ranges.reduce((sum, range) => {
      const [start, end] = range.slice(6).split('-').map(Number);
      return sum + end - start + 1;
    }, 0);
    expect(requested).toBeLessThan(bytes.length / 4);
    const firstRanges = [...ranges];
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    expect(ranges).toEqual(firstRanges);
    await expect
      .poll(() =>
        page.getByTestId('pdf-canvas').evaluate((node) => {
          const canvas = node as HTMLCanvasElement;
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          return pixels.some((value, index) => index % 4 === 2 && value > pixels[index - 2] + 80);
        }),
      )
      .toBe(true);
    await page.reload();
    await ready(page);
    expect(ranges).toEqual(firstRanges);
    expect(assetId).toBeTruthy();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stalled hosted PDF stops loading and can be retried', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-retry-'));
  try {
    await guideFixture(page, directory);
    let requests = 0;
    await page.route('**/stalled.pdf', async (route) => {
      requests++;
      if (requests === 1) return; // A live request with no response/progress.
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: makePdfFixture() });
    });
    await page.addInitScript(() => {
      window.studio!.runtime = 'collaborative';
      window.studio!.evidenceUrl = () => '/stalled.pdf';
    });
    await page.clock.install();
    await page.goto('/tests/pdf-harness.html');
    await expect(page.getByRole('status').filter({ hasText: 'Carregando PDF' })).toBeVisible();
    await expect.poll(() => requests).toBe(1);
    await page.clock.fastForward(46000);
    await expect(page.getByRole('alert').filter({ hasText: 'sem progresso' })).toBeVisible();
    await page.getByRole('button', { name: 'Tentar carregar PDF novamente', exact: true }).click();
    await ready(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(requests).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('hosted PDF keeps real rendering and saved regions without desktop relocation controls', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-hosted-'));
  try {
    const { fixture } = await guideFixture(page, directory);
    await page.addInitScript(() => {
      window.studio!.runtime = 'collaborative';
      window.studio!.capabilities = { analysis: false };
    });
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await expect(page.getByRole('button', { name: 'Relocalizar mesmo PDF' })).toHaveCount(0);
    await draw(page, [0.2, 0.3], [0.5, 0.45]);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no servidor.', { exact: false })).toBeVisible();
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.regions).toHaveLength(1);
    await page.reload();
    await ready(page);
    await expect(page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true })).toBeVisible();
    await expect(page.locator('#evidence-pointer')).toHaveText(
      JSON.stringify({
        version: 1,
        assetId: saved.asset!.id,
        passageId: params.passageId,
      }),
    );
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    await expect(page.locator('#evidence-pointer')).toHaveText('null');
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    await expect(page.locator('#evidence-pointer')).toHaveText(
      JSON.stringify({
        version: 1,
        assetId: saved.asset!.id,
        passageId: params.passageId,
      }),
    );
    await writeFile(
      join(directory, 'guide-vector.pdf'),
      Buffer.concat([makePdfFixture(), Buffer.from('\n% a different witness\n')]),
    );
    await page.getByRole('button', { name: 'Vincular outro testemunho', exact: true }).click();
    await ready(page);
    await expect(page.locator('#evidence-pointer')).toHaveText('null');
    const replaced = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(replaced.asset!.id).not.toBe(saved.asset!.id);
    expect(replaced.passage!.regions).toEqual(saved.passage!.regions);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a passage continues onto another page with ordered crops preserved through restart and preparation', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-multipage-'));
  try {
    const { fixture } = await guideFixture(page, directory);
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await draw(page, [0.2, 0.3], [0.5, 0.45]);
    const firstRect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByRole('button', { name: 'Adicionar região na próxima página' }).click();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await expect(page.getByRole('button', { name: 'Marcar região', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await draw(page, [0.2, 0.2], [0.5, 0.4]);
    const secondRect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await expect(page.getByLabel('Páginas abrangidas pela passagem')).toContainText('1–2');
    await expect(
      page.getByRole('button', { name: 'Adicionar região na próxima página' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Mover região 2 para antes' }).click();
    await expect(page.getByRole('button', { name: 'Região 1 · PDF 2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    fixture.restart();
    await page.reload();
    await ready(page);
    await expect(page.getByRole('button', { name: 'Região 1 · PDF 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mover região 1 para depois' }).click();
    await page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', firstRect!);
    await page.getByRole('button', { name: 'Região 2 · PDF 2', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', secondRect!);
    await page.getByRole('button', { name: 'Preparar evidência para análise' }).click();
    await expect(page.locator('#prepared-evidence')).toContainText('regionIds');
    const prepared = JSON.parse(await page.locator('#prepared-evidence').innerText());
    const saved = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(saved.passage!.regions.map((region) => region.pageIndex)).toEqual([0, 1]);
    expect(prepared.regionIds).toEqual(saved.passage!.regions.map((region) => region.id));
    expect(saved.passage!.regions.map((region) => region.rect.join(','))).toEqual([
      firstRect,
      secondRect,
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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

test('an existing unmarked passage never adopts either page of its multipage predecessor', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-no-carryover-'));
  try {
    const { fixture } = await guideFixture(page, directory);
    await page.goto('/tests/pdf-harness.html');
    await ready(page);
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await draw(page, [0.2, 0.3], [0.5, 0.45]);
    await page.getByRole('button', { name: 'Adicionar região na próxima página' }).click();
    await ready(page);
    await draw(page, [0.2, 0.2], [0.5, 0.4]);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    const donor = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(donor.passage!.regions).toHaveLength(2);
    await page.getByRole('button', { name: 'Região 2 · PDF 2', exact: true }).click();
    await ready(page);

    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    await page.getByRole('button', { name: 'Preparar evidência para análise' }).click();
    await expect(page.locator('#prepared-evidence')).toContainText('"regionIds":[]');
    const onlyGuide = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    // Merely loading a guide, including preparing an empty analysis, is not an edit.
    expect(onlyGuide.passage).toBeNull();
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute(
      'data-pdf-rect',
      donor.passage!.regions[1].rect.join(','),
    );

    await draw(page, [0.25, 0.5], [0.6, 0.65]);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    fixture.restart();
    await page.reload();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    const own = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    expect(own.passage!.regions).toHaveLength(1);
    expect(donor.passage!.regions.map((region) => region.id)).not.toContain(
      own.passage!.regions[0].id,
    );
    expect(
      ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage!
        .regions,
    ).toEqual(donor.passage!.regions);
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
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
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
    await expect(region).toHaveCount(0);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    await expect(page.getByText('Guia da passagem anterior (1).', { exact: false })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    service = createEvidenceService(options);
    await page.reload();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('1');
    await page.getByRole('button', { name: 'Região 2 · PDF 2', exact: true }).click();
    await ready(page);
    const multi = (await service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(multi.passage!.regions.map((entry) => entry.pageIndex)).toEqual([0, 1]);
    await page.getByRole('button', { name: 'Remover região', exact: true }).click();
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    expect(
      ((await service.invoke('evidence_status', params)) as EvidenceStatus).passage!.regions,
    ).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PDF region moving/resizing autosaves native coordinates on its own passage across reload', async ({
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
    await expect(region).toHaveCount(0);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    await expect(page.getByText('Guia da passagem anterior (1).', { exact: false })).toBeVisible();
    const inheritedCache = await page.evaluate(() =>
      localStorage.getItem(
        'pydicate-studio:evidence-draft:v1:["project:pdf-test","araujo","passage:b"]',
      ),
    );
    await page.reload();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await expect(region).toHaveCount(0);
    await expect(page.getByTestId('pdf-guide-region')).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem(
          'pydicate-studio:evidence-draft:v1:["project:pdf-test","araujo","passage:b"]',
        ),
      ),
    ).toBe(inheritedCache);
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
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
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    expect(
      ((await service.invoke('evidence_status', params)) as EvidenceStatus).passage!.regions[0]
        .rect,
    ).toEqual(resized!.split(',').map(Number));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('next-passage guides stay separate from new evidence, accept drawing through the shadow, and retain page navigation on restart', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-guide-'));
  try {
    const writes: Record<string, unknown>[] = [];
    const { fixture, assetId, revision } = await guideFixture(page, directory, (method, input) => {
      if (method === 'evidence_save') writes.push(input);
    });
    const original = { id: 'original-box', assetId, pageIndex: 0, rect: [100, 300, 260, 400] };
    await fixture.service.invoke('evidence_save', {
      ...params,
      assetId,
      expectedRevision: revision,
      regions: [original],
      view: { pageIndex: 0, zoom: 0.5, rotation: 0 },
    });
    const originalStatus = (await fixture.service.invoke(
      'evidence_status',
      params,
    )) as EvidenceStatus;
    const savedOriginal = originalStatus.passage;
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
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evidência salva no computador.', { exact: false })).toBeVisible();
    await expect(page.locator('#evidence-pointers')).toHaveText('0');
    let saved = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    expect(saved.passage).toBeNull();
    const ownFingerprint = saved.passageFingerprint;
    expect(ownFingerprint).toBeTruthy();
    expect(ownFingerprint).not.toBe(originalStatus.passageFingerprint);
    await page.waitForTimeout(650);
    expect(writes).toEqual([]);
    await draw(page, [0.3, 0.36], [0.6, 0.45]);
    await expect(page.getByTestId('pdf-region')).toHaveCount(1);
    await expect(ghost).toHaveAttribute('data-pdf-rect', original.rect.join(','));
    await expect(page.getByRole('button', { name: 'Salvar regiões', exact: true })).toHaveCount(0);
    await expect(page.locator('#evidence-pointers')).toHaveText('1');
    expect(writes).toHaveLength(1);
    expect(writes[0].passageId).toBe('passage:b');
    expect(writes[0].expectedPassageFingerprint).toBe(ownFingerprint);
    saved = (await fixture.service.invoke('evidence_status', {
      ...params,
      passageId: 'passage:b',
    })) as EvidenceStatus;
    expect(saved.passage!.guide!.region).toEqual(original);
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

test('returning to an untouched existing next passage inherits the newly marked predecessor guide', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-next-empty-'));
  try {
    const { assetId, revision } = await guideFixture(page, directory);
    await page.goto('/tests/pdf-harness.html');
    await ready(page);
    // The earlier visit saved only its initial viewport, before a predecessor had a crop.
    await page.evaluate(
      ({ assetId, revision }) =>
        localStorage.setItem(
          `pydicate-studio:evidence-draft:v1:${JSON.stringify(['project:pdf-test', 'araujo', 'passage:b'])}`,
          JSON.stringify({
            assetId,
            revision,
            regions: [],
            baseline: 'null',
            view: { pageIndex: 0, zoom: 1, rotation: 0 },
          }),
        ),
      { assetId, revision },
    );
    await draw(page, [0.2, 0.2], [0.55, 0.4]);
    const rect = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByLabel('Página física do PDF', { exact: true }).fill('2');
    await ready(page);
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('visible-order guides refresh saved and cached passages after edits, reordering and exclusion', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-visible-guide-'));
  try {
    const writes: Record<string, unknown>[] = [];
    const { fixture, assetId, revision } = await guideFixture(page, directory, (method, input) => {
      if (method === 'evidence_save') writes.push(input);
    });
    const regionA = { id: 'a', assetId, pageIndex: 0, rect: [100, 300, 260, 400] };
    const regionB = { id: 'b', assetId, pageIndex: 0, rect: [40, 100, 160, 150] };
    const regionC = { id: 'c', assetId, pageIndex: 0, rect: [30, 40, 100, 75] };
    const save = async (
      passageId: string,
      regions: unknown[],
      expectedRevision: number,
      guide?: unknown,
    ) =>
      fixture.service.invoke('evidence_save', {
        ...params,
        passageId,
        assetId,
        expectedRevision,
        regions,
        view: { pageIndex: 0, zoom: 0.5, rotation: 0 },
        ...(guide ? { guide } : {}),
      }) as Promise<EvidenceStatus>;
    const a = await save('passage:a', [regionA], revision);
    const b = await save('passage:b', [regionB], a.revision);
    const c = await save('passage:c', [regionC], b.revision, {
      assetId,
      fromPassageId: 'passage:a',
      region: regionA,
    });
    await page.goto('/tests/pdf-harness.html?guide&ordered');
    await ready(page);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    const ghost = page.getByTestId('pdf-guide-region');
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:b');
    await expect(ghost).toHaveAttribute('data-pdf-rect', regionB.rect.join(','));
    await expect(page.getByTestId('pdf-region')).toHaveAttribute(
      'data-pdf-rect',
      regionC.rect.join(','),
    );
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    const changedA = await moveRegion(page, 24, 12);
    await expect
      .poll(
        async () =>
          ((await fixture.service.invoke('evidence_status', params)) as EvidenceStatus).passage
            ?.regions[0].rect,
      )
      .toEqual(changedA);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:b');
    await page.getByRole('button', { name: 'Ordem B A C', exact: true }).click();
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:a');
    await expect(ghost).toHaveAttribute('data-pdf-rect', changedA.join(','));
    await page.getByRole('button', { name: 'Excluir A da lista', exact: true }).click();
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:b');
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await expect(ghost).toHaveCount(0); // Neither last-visited C nor excluded A may supply it.
    await page.getByRole('button', { name: 'Ordem A B C', exact: true }).click();
    await expect(ghost).toHaveAttribute('data-source-passage', 'passage:a');
    await expect(ghost).toHaveAttribute('data-pdf-rect', changedA.join(','));
    await page.waitForTimeout(500);
    expect(writes).toHaveLength(1);
    expect(
      (
        (await fixture.service.invoke('evidence_status', {
          ...params,
          passageId: 'passage:c',
        })) as EvidenceStatus
      ).passage,
    ).toEqual(c.passage);
    expect(
      await ghost.locator(':scope > rect').evaluate((element) => getComputedStyle(element).fill),
    ).toBe('rgba(76, 83, 93, 0.17)');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a current unsaved predecessor crop is the guide through forward/back navigation and late autosave', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-guide-late-'));
  let release: (() => void) | undefined;
  try {
    let held = false;
    const { fixture } = await guideFixture(page, directory, async (method, input) => {
      if (method === 'evidence_save' && input.passageId === 'passage:b' && !held) {
        held = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    });
    await page.goto('/tests/pdf-harness.html?guide&ordered');
    await ready(page);
    await page.getByLabel('Zoom do PDF').selectOption('0.5');
    await draw(page, [0.12, 0.2], [0.38, 0.32]);
    await expect(page.locator('#evidence-pointers')).toHaveText('1');
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await draw(page, [0.42, 0.44], [0.69, 0.56]);
    const rectB = await page.getByTestId('pdf-region').getAttribute('data-pdf-rect');
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute(
      'data-source-passage',
      'passage:b',
    );
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute('data-pdf-rect', rectB!);
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await expect.poll(() => !!release).toBe(true);
    release!();
    await expect
      .poll(async () =>
        (
          (await fixture.service.invoke('evidence_status', {
            ...params,
            passageId: 'passage:b',
          })) as EvidenceStatus
        ).passage?.regions[0].rect.join(','),
      )
      .toBe(rectB);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute('data-pdf-rect', rectB!);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Remover região', exact: true }).click();
    await expect(page.getByTestId('pdf-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-guide-region')).toHaveAttribute(
      'data-source-passage',
      'passage:a',
    );
    await page.getByRole('button', { name: 'Excluir A da lista', exact: true }).click();
    await expect(page.getByTestId('pdf-guide-region')).toHaveCount(0);
    await page.getByRole('button', { name: 'Passagem B', exact: true }).click();
    await ready(page);
    await page.getByRole('button', { name: 'Passagem C', exact: true }).click();
    await ready(page);
    await expect(page.getByLabel('Zoom do PDF')).toHaveValue('0.5');
    await page.waitForTimeout(600);
    expect(
      (
        (await fixture.service.invoke('evidence_status', {
          ...params,
          passageId: 'passage:c',
        })) as EvidenceStatus
      ).passage,
    ).toBeNull();
  } finally {
    release?.();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an autosaved predecessor and repeated empty pending passages preserve a guide without promoting its box', async ({
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
    const savedDonor = (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus;
    expect(savedDonor.passage!.regions[0].rect).toEqual(rect!.split(',').map(Number));
    await page.getByRole('button', { name: 'Passagem A', exact: true }).click();
    await ready(page);
    await expect(page.getByTestId('pdf-region')).toHaveAttribute('data-pdf-rect', rect!);
    await expect(page.getByTestId('pdf-guide-region')).toHaveCount(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('opening a passage centers its first crop and clicking it again restores focus after scrolling', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-focus-'));
  try {
    const { fixture, assetId, revision } = await guideFixture(page, directory);
    await fixture.service.invoke('evidence_save', {
      ...params,
      assetId,
      expectedRevision: revision,
      regions: [
        { id: 'first', assetId, pageIndex: 0, rect: [100, 100, 200, 200] },
        { id: 'last', assetId, pageIndex: 1, rect: [100, 300, 200, 400] },
      ],
      view: { pageIndex: 1, zoom: 2, rotation: 0 },
    });
    await page.goto('/tests/pdf-harness.html?guide');
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('1');
    const scroller = page.locator('.evidence-scroller');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    const centered = await scroller.evaluate((el) => el.scrollTop);
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.getByRole('button', { name: 'Região 1 · PDF 1', exact: true }).click();
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeCloseTo(centered, 0);
    await page.getByRole('button', { name: 'Região 2 · PDF 2', exact: true }).click();
    await ready(page);
    await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
    await expect(page.getByTestId('pdf-region')).toBeInViewport();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/** The share of drawn pixels: a scan that decoded covers most of its page. */
async function inkedFraction(page: Page) {
  return page.getByTestId('pdf-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let inked = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index] < 210 || data[index + 1] < 210 || data[index + 2] < 210) inked++;
    return inked / (data.length / 4);
  });
}

// The live failure this covers: a scanned witness attached during a session
// loaded, reported itself ready and then showed white pages, because PDF.js
// silently skips an image whose decoder (JBIG2, JPEG 2000) it cannot load.
for (const hosted of [false, true]) {
  test(`a scan attached in the open session renders its pages${hosted ? ' over the hosted transport' : ''}, with no reload`, async ({
    page,
  }) => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-scan-'));
    try {
      const warnings: string[] = [];
      page.on('console', (entry) => {
        if (/Unable to decode image|failed to initialize|wasm/i.test(entry.text()))
          warnings.push(entry.text());
      });
      const { fixture } = await guideFixture(page, directory, undefined, makeScanPdfFixture(), {
        attach: false,
      });
      if (hosted) {
        const bytes = makeScanPdfFixture();
        await page.route('**/scan.pdf*', async (route) => {
          const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range || '');
          const assetId = (
            (await fixture.service.invoke('evidence_status', params)) as EvidenceStatus
          ).asset!.id;
          const headers: Record<string, string> = {
            'Content-Type': 'application/pdf',
            'Accept-Ranges': 'bytes',
            ETag: `"sha256-${assetId}"`,
          };
          if (!range) {
            headers['Content-Length'] = String(bytes.length);
            return route.fulfill({ status: 200, headers, body: bytes });
          }
          const start = Number(range[1]),
            end = Math.min(Number(range[2]), bytes.length - 1);
          headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
          headers['Content-Length'] = String(end - start + 1);
          await route.fulfill({ status: 206, headers, body: bytes.subarray(start, end + 1) });
        });
        await page.addInitScript(() => {
          window.studio!.runtime = 'collaborative';
          window.studio!.evidenceUrl = () => '/scan.pdf';
          window.studio!.evidenceCacheScope = () => 'scan-account';
        });
      }
      await page.goto('/tests/pdf-harness.html');
      await expect(page.getByText('Vincule a digitalização', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Vincular PDF à fonte', exact: true }).click();
      await ready(page);
      // Page 1 is JPEG 2000 and page 2 is JPEG: both must arrive drawn.
      expect(await inkedFraction(page)).toBeGreaterThan(0.4);
      await page.getByRole('button', { name: 'Próxima página do PDF', exact: true }).click();
      await ready(page);
      await expect(page.getByLabel('Página física do PDF', { exact: true })).toHaveValue('2');
      expect(await inkedFraction(page)).toBeGreaterThan(0.4);
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(warnings).toEqual([]);
      // The attached scan also stays usable for marking evidence right away.
      await draw(page, [0.2, 0.3], [0.5, 0.45]);
      await expect(page.getByTestId('pdf-region')).toBeVisible();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('a page whose image cannot be decoded reports itself instead of showing white', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-pdf-undecodable-'));
  try {
    await guideFixture(page, directory, undefined, makeScanPdfFixture());
    // Deny the JPEG 2000 decoder, both its WebAssembly module and the script
    // PDF.js falls back to: page 1 then has no picture at all.
    await page.route('**/pdfjs/wasm/openjpeg*', (route) => route.abort());
    await page.goto('/tests/pdf-harness.html');
    await expect(
      page.getByRole('alert').filter({ hasText: 'não pôde ser decodificada' }),
    ).toBeVisible();
    expect(await inkedFraction(page)).toBeLessThan(0.05);
    await expect(
      page.getByRole('button', { name: 'Tentar carregar PDF novamente', exact: true }),
    ).toBeVisible();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the support files PDF.js fetches for scans are served by the application', async ({
  page,
}) => {
  const files = [
    'wasm/openjpeg.wasm',
    'wasm/jbig2.wasm',
    'wasm/qcms_bg.wasm',
    'standard_fonts/FoxitSans.pfb',
    'cmaps/Adobe-Japan1-UCS2.bcmap',
    'iccs/CGATS001Compat-v2-micro.icc',
  ];
  for (const file of files) {
    const response = await page.request.get(`/pdfjs/${file}`);
    expect(response.status(), file).toBe(200);
    expect((await response.body()).length, file).toBeGreaterThan(64);
  }
});
