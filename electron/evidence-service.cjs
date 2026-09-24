'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const fail = (message) => {
  throw new Error(message);
};
function identity(value, label) {
  if (typeof value !== 'string' || !value || value.length > 300 || /[\u0000-\u001f]/u.test(value))
    fail(`${label} inválido.`);
  return value;
}
function fingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('Identidade do PDF inválida.');
  return value;
}
function pageIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100000) fail('Página física inválida.');
  return value;
}
function regions(value, assetId) {
  if (!Array.isArray(value) || value.length > 500)
    fail('Regiões inválidas ou limite de 500 excedido.');
  const ids = new Set();
  return value.map((region) => {
    identity(region?.id, 'Região');
    if (ids.has(region.id)) fail('Identidade de região repetida.');
    ids.add(region.id);
    if (region.assetId !== assetId) fail('A região pertence a outro testemunho.');
    const rect = region.rect;
    if (
      !Array.isArray(rect) ||
      rect.length !== 4 ||
      rect.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 10000000) ||
      rect[0] >= rect[2] ||
      rect[1] >= rect[3]
    )
      fail('Coordenadas PDF inválidas.');
    return { id: region.id, assetId, pageIndex: pageIndex(region.pageIndex), rect: [...rect] };
  });
}
function view(value) {
  if (
    !value ||
    ![0, 90, 180, 270].includes(value.rotation) ||
    typeof value.zoom !== 'number' ||
    !Number.isFinite(value.zoom) ||
    value.zoom < 0.25 ||
    value.zoom > 4
  )
    fail('Estado de visualização inválido.');
  return { pageIndex: pageIndex(value.pageIndex), zoom: value.zoom, rotation: value.rotation };
}
function guide(value, assetId) {
  if (!value || typeof value !== 'object' || value.assetId !== assetId)
    fail('Guia visual pertence a outro testemunho.');
  const fromPassageId = identity(value.fromPassageId, 'Passagem anterior');
  if (
    value.fromOrdinal !== undefined &&
    (!Number.isInteger(value.fromOrdinal) || value.fromOrdinal < 1)
  )
    fail('Ordem da passagem anterior inválida.');
  return {
    assetId,
    fromPassageId,
    ...(value.fromOrdinal !== undefined ? { fromOrdinal: value.fromOrdinal } : {}),
    ...(value.region !== undefined ? { region: regions([value.region], assetId)[0] } : {}),
  };
}

async function atomicWrite(filename, contents) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, filename);
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

/** Main-process service. Renderer never supplies an arbitrary filesystem path. */
function createEvidenceService({ stateDirectory, chooseFile }) {
  const writes = new Map();
  const assetDirectory = path.join(stateDirectory, 'assets');
  const manifestDirectory = path.join(stateDirectory, 'sources');
  const sourceKey = (params) =>
    hash(
      JSON.stringify([identity(params.projectId, 'Projeto'), identity(params.sourceId, 'Fonte')]),
    );
  const filename = (params) => path.join(manifestDirectory, `${sourceKey(params)}.json`);
  const assetFilename = (assetId) => path.join(assetDirectory, `${fingerprint(assetId)}.pdf`);
  async function read(params) {
    const empty = {
      version: 1,
      revision: 0,
      projectId: params.projectId,
      sourceId: params.sourceId,
      selectedAssetId: null,
      assets: [],
      passages: {},
    };
    try {
      const stat = await fs.stat(filename(params));
      if (stat.size > 8 * 1024 * 1024) fail('Manifesto de evidência excede 8 MiB.');
      const document = JSON.parse(await fs.readFile(filename(params), 'utf8'));
      if (
        document.version !== 1 ||
        document.projectId !== params.projectId ||
        document.sourceId !== params.sourceId ||
        !Number.isInteger(document.revision) ||
        document.revision < 0 ||
        !Array.isArray(document.assets) ||
        !document.passages ||
        typeof document.passages !== 'object' ||
        Array.isArray(document.passages)
      )
        fail('Formato de evidência incompatível.');
      for (const asset of document.assets) {
        fingerprint(asset.id);
        identity(asset.name, 'Nome do PDF');
        if (typeof asset.originalPath !== 'string' || !path.isAbsolute(asset.originalPath))
          fail('Referência do PDF inválida.');
      }
      if (
        document.selectedAssetId !== null &&
        !document.assets.some((asset) => asset.id === document.selectedAssetId)
      )
        fail('PDF selecionado não pertence ao manifesto.');
      for (const [id, entry] of Object.entries(document.passages)) {
        identity(id, 'Passagem');
        view(entry.view);
        if (
          entry.viewAssetId !== undefined &&
          !document.assets.some((asset) => asset.id === entry.viewAssetId)
        )
          fail('Visualização sem testemunho.');
        if (!Array.isArray(entry.regions)) fail('Regiões da passagem inválidas.');
        for (const asset of document.assets)
          regions(
            entry.regions.filter((r) => r.assetId === asset.id),
            asset.id,
          );
        if (entry.regions.some((r) => !document.assets.some((asset) => asset.id === r.assetId)))
          fail('Região sem testemunho.');
        if (entry.guide !== undefined) {
          if (!document.assets.some((asset) => asset.id === entry.guide.assetId))
            fail('Guia visual sem testemunho.');
          guide(entry.guide, entry.guide.assetId);
        }
      }
      return document;
    } catch (error) {
      if (error.code === 'ENOENT') return empty;
      throw new Error(`Evidência não foi carregada; o arquivo foi preservado. ${error.message}`);
    }
  }
  async function write(params, document) {
    await fs.mkdir(manifestDirectory, { recursive: true, mode: 0o700 });
    const contents = JSON.stringify(document, null, 2);
    if (Buffer.byteLength(contents) > 8 * 1024 * 1024) fail('Manifesto de evidência excede 8 MiB.');
    await atomicWrite(filename(params), contents);
  }
  async function fileState(filePath, expected) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_PDF_BYTES) return 'changed';
      return hash(await fs.readFile(filePath)) === expected ? 'ok' : 'changed';
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      return 'unreadable';
    }
  }
  async function status(params, document) {
    const selected = document.assets.find((asset) => asset.id === document.selectedAssetId);
    const states = selected
      ? await Promise.all([
          fileState(assetFilename(selected.id), selected.id),
          fileState(selected.originalPath, selected.id),
        ])
      : [];
    const passage = Object.hasOwn(document.passages, params.passageId)
      ? document.passages[params.passageId]
      : null;
    // The caller supplies source-order identities derived from the active project.
    const previousPassages = Array.isArray(params.previousPassages)
      ? params.previousPassages
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              Number.isInteger(item.ordinal) &&
              item.ordinal > 0 &&
              item.id !== params.passageId,
          )
          .slice(0, 5000)
      : [];
    let inherited = null;
    const guideCandidates = [];
    if (params.newPassageGuide === true) {
      const candidates = [
        { id: params.previousPassageId },
        ...(params.insertionBeforePassageId
          ? previousPassages
          : [
              { id: params.lastVisitedPassageId },
              ...previousPassages,
              ...Object.keys(document.passages)
                .reverse()
                .map((id) => ({ id })),
            ]),
      ];
      const seen = new Set([params.passageId]);
      for (const candidate of candidates) {
        if (
          typeof candidate.id !== 'string' ||
          !candidate.id ||
          candidate.id.length > 300 ||
          /[\u0000-\u001f]/u.test(candidate.id) ||
          seen.has(candidate.id)
        )
          continue;
        seen.add(candidate.id);
        const known = previousPassages.find((previous) => previous.id === candidate.id);
        guideCandidates.push({ id: candidate.id, ...(known ? { ordinal: known.ordinal } : {}) });
        if (guideCandidates.length >= 5000) break;
      }
    }
    let guideSeed = null;
    if (!passage && selected && states[0] === 'ok' && params.newPassageGuide === true) {
      for (const candidate of guideCandidates) {
        const entry = Object.hasOwn(document.passages, candidate.id)
          ? document.passages[candidate.id]
          : null;
        if (
          !entry ||
          !(
            entry.viewAssetId === selected.id ||
            (entry.viewAssetId === undefined &&
              entry.regions.some((region) => region.assetId === selected.id))
          )
        )
          continue;
        guideSeed = {
          fromPassageId: candidate.id,
          ...(candidate.ordinal ? { fromOrdinal: candidate.ordinal } : {}),
          assetId: selected.id,
          view: { ...entry.view },
          regions: entry.regions
            .filter((region) => region.assetId === selected.id)
            .map((region) => ({ ...region, rect: [...region.rect] })),
          ...(entry.guide?.assetId === selected.id ? { guide: structuredClone(entry.guide) } : {}),
        };
        break;
      }
    }
    if (!passage && selected && states[0] === 'ok' && params.newPassageGuide !== true) {
      for (const candidate of previousPassages) {
        const entry = Object.hasOwn(document.passages, candidate.id)
          ? document.passages[candidate.id]
          : null;
        if (
          !entry ||
          !(
            entry.viewAssetId === selected.id ||
            (entry.viewAssetId === undefined &&
              entry.regions.some((region) => region.assetId === selected.id))
          )
        )
          continue;
        inherited = {
          fromPassageId: candidate.id,
          fromOrdinal: candidate.ordinal,
          assetId: selected.id,
          view: { ...entry.view },
          regions: entry.regions
            .filter((region) => region.assetId === selected.id)
            .map((region) => ({ ...region, id: randomUUID(), rect: [...region.rect] })),
        };
        break;
      }
    }
    return {
      version: 1,
      revision: document.revision,
      projectId: document.projectId,
      sourceId: document.sourceId,
      asset: selected
        ? {
            id: selected.id,
            name: selected.name,
            bytes: selected.bytes,
            fingerprint: selected.id,
            managedState: states[0],
            originalState: states[1],
          }
        : null,
      passage,
      previousPassages,
      inherited,
      ...(params.newPassageGuide === true ? { guideCandidates, guideSeed } : {}),
      retainedAssetCount: document.assets.length,
    };
  }
  const staleCheck = (params, document) => {
    if (params.expectedRevision !== document.revision)
      fail(
        'A evidência mudou em outra janela. Recarregue antes de salvar; suas regiões ainda estão na tela.',
      );
  };
  async function mutate(method, params) {
    const document = await read(params);
    staleCheck(params, document);
    if (method === 'evidence_save') {
      const assetId = fingerprint(params.assetId);
      if (assetId !== document.selectedAssetId)
        fail('O PDF selecionado mudou. Recarregue a evidência.');
      if ((await fileState(assetFilename(assetId), assetId)) !== 'ok')
        fail('Cópia do PDF indisponível ou alterada; relocalize o mesmo arquivo.');
      const previous = Object.hasOwn(document.passages, params.passageId)
        ? document.passages[params.passageId]
        : null;
      const saved = {
        regions: [
          ...(previous?.regions || []).filter((r) => r.assetId !== assetId),
          ...regions(params.regions, assetId),
        ],
        view: view(params.view),
        viewAssetId: assetId,
        ...(params.guide !== undefined
          ? { guide: guide(params.guide, assetId) }
          : previous?.guide?.assetId === assetId
            ? { guide: previous.guide }
            : {}),
      };
      // Assignment through defineProperty also safely supports arbitrary legacy IDs.
      Object.defineProperty(document.passages, params.passageId, {
        value: saved,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      const selectedPath = await chooseFile();
      if (!selectedPath) return null;
      const stat = await fs.stat(selectedPath);
      if (!stat.isFile() || stat.size > MAX_PDF_BYTES) fail('Escolha um PDF de até 100 MB.');
      const bytes = await fs.readFile(selectedPath);
      if (bytes.length > MAX_PDF_BYTES || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
        fail('O arquivo não contém um cabeçalho PDF válido.');
      const id = hash(bytes);
      if (
        method === 'evidence_relocate' &&
        (!document.selectedAssetId || id !== document.selectedAssetId)
      )
        fail(
          'O arquivo tem outra impressão digital. Nenhuma região foi movida. Use “Vincular outro testemunho” se a substituição for intencional.',
        );
      if (
        method === 'evidence_attach' &&
        document.selectedAssetId &&
        id !== document.selectedAssetId &&
        params.replace !== true
      )
        fail('Outro PDF já está vinculado. A substituição precisa ser explícita.');
      await fs.mkdir(assetDirectory, { recursive: true, mode: 0o700 });
      // These exact bytes were fingerprinted; a concurrently changed original cannot substitute a different file.
      await atomicWrite(assetFilename(id), bytes);
      const asset = {
        id,
        name: path.basename(selectedPath),
        bytes: bytes.length,
        originalPath: selectedPath,
      };
      const index = document.assets.findIndex((entry) => entry.id === id);
      if (index < 0) document.assets.push(asset);
      else document.assets[index] = asset;
      document.selectedAssetId = id;
    }
    document.revision += 1;
    await write(params, document);
    return status(params, document);
  }
  return {
    async invoke(method, params) {
      if (!params || typeof params !== 'object') fail('Parâmetros de evidência inválidos.');
      const key = sourceKey(params);
      identity(params.passageId, 'Passagem');
      if (method === 'evidence_status') {
        await writes.get(key)?.catch(() => {});
        return status(params, await read(params));
      }
      if (method === 'evidence_bytes') {
        await writes.get(key)?.catch(() => {});
        const document = await read(params);
        const assetId = fingerprint(params.assetId);
        if (document.selectedAssetId !== assetId) fail('O PDF selecionado mudou.');
        const stat = await fs.stat(assetFilename(assetId));
        if (stat.size > MAX_PDF_BYTES) fail('PDF excede o limite.');
        const bytes = await fs.readFile(assetFilename(assetId));
        if (hash(bytes) !== assetId)
          fail('A cópia do PDF foi alterada. Relocalize o mesmo arquivo.');
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      if (!['evidence_attach', 'evidence_relocate', 'evidence_save'].includes(method))
        fail('Operação de evidência desconhecida.');
      // Snapshot parameters before joining the queue.
      const input = structuredClone(params);
      const previous = writes.get(key) || Promise.resolve();
      const pending = previous.catch(() => {}).then(() => mutate(method, input));
      writes.set(key, pending);
      try {
        return await pending;
      } finally {
        if (writes.get(key) === pending) writes.delete(key);
      }
    },
  };
}

module.exports = { createEvidenceService, MAX_PDF_BYTES };
