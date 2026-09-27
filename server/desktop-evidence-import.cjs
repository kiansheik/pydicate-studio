'use strict';
// Stopped-server recovery. A persisted working copy is authoritative over its
// exact saved baseline, including removed rectangles and explicitly empty lists.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const {
  createEvidenceService,
  validateEvidenceLocation,
} = require('../electron/evidence-service.cjs');
const { same } = require('./store.cjs');
const prefix = 'pydicate-studio:evidence-draft:v1:';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonicalId = (id) => id.replace(/^pending:/, 'passage:');
function stable(value) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
async function readChecked(file, root, digest) {
  if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Unsafe evidence recovery file.');
  const relative = path.relative(path.resolve(root), path.resolve(file));
  const expected = path.join(await fs.realpath(root), relative);
  if ((await fs.realpath(file)) !== expected || !(await fs.stat(file)).isFile())
    throw new Error('Unsafe evidence recovery file.');
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    (await fs.stat(file)).size > 32 * 1024 * 1024
  )
    throw new Error('Invalid evidence recovery file.');
  const bytes = await fs.readFile(file);
  if (digest && sha(bytes) !== digest)
    throw new Error('Desktop browser storage checksum mismatch.');
  return JSON.parse(bytes);
}
async function writeLedger(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, file);
}
async function importDesktopEvidence({
  directory,
  manifest,
  receipt,
  project,
  stateDirectory,
  dryRun = false,
}) {
  const report = {
    inspected: 0,
    applied: 0,
    unchanged: 0,
    previouslyApplied: 0,
    conflicts: [],
    passages: [],
  };
  const file = manifest.files.find((item) => item.path === 'files/browser-storage.json');
  if (!file) return report;
  if (!/^[a-f0-9]{64}$/.test(file.sha256 || ''))
    throw new Error('Missing browser storage checksum.');
  if (receipt.projectId !== project.id || receipt.sourceProjectId !== manifest.projectId)
    throw new Error('Evidence recovery project mismatch.');
  const storage = await readChecked(path.join(directory, file.path), directory, file.sha256);
  if (
    storage.format !== 'pydicate-browser-storage' ||
    storage.version !== 1 ||
    !Array.isArray(storage.origins)
  )
    throw new Error('Invalid browser storage archive.');
  const ledgerFile = path.join(stateDirectory, 'evidence', 'desktop-recovery.json');
  let ledger;
  try {
    ledger = await readChecked(ledgerFile, stateDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ledger = { version: 1, applied: {} };
  }
  if (
    ledger.version !== 1 ||
    !ledger.applied ||
    typeof ledger.applied !== 'object' ||
    Array.isArray(ledger.applied)
  )
    throw new Error('Invalid evidence recovery receipt.');
  const service = createEvidenceService({
    stateDirectory: path.join(stateDirectory, 'evidence'),
    chooseFile: async () => {
      throw new Error('Recovery cannot attach PDFs.');
    },
  });
  const targets = new Map(project.passages.map((item) => [item.id, item]));
  const remap = (id) => {
    const mapped =
      receipt.passageMappings[id] || receipt.passageMappings[id.replace(/^passage:/, 'pending:')];
    if (!mapped || !targets.has(mapped))
      throw new Error('Historical passage has no proven current match.');
    return canonicalId(mapped);
  };
  function location(value, sourceId) {
    if (value === null) return null;
    const next = structuredClone(value);
    if (next.guide) {
      const old = next.guide.fromPassageId;
      const mapped = remap(old);
      if (targets.get(mapped)?.sourceId !== sourceId)
        throw new Error('Guide belongs to another source.');
      next.guide.fromPassageId = mapped;
      if (next.guide.fromOrdinal !== undefined)
        next.guide.fromOrdinal = targets.get(mapped).ordinal;
    }
    return next;
  }
  // Conflicting origin copies must not be decided by enumeration order.
  const groups = new Map();
  for (const origin of storage.origins)
    for (const [key, value] of Object.entries(origin.entries || {})) {
      if (!key.startsWith(prefix)) continue;
      const copies = groups.get(key) || [];
      copies.push(value);
      groups.set(key, copies);
    }
  for (const [key, copies] of groups) {
    report.inspected++;
    let passageId, sourceId;
    try {
      const identities = JSON.parse(key.slice(prefix.length));
      if (
        !Array.isArray(identities) ||
        identities.length !== 3 ||
        identities[0] !== manifest.projectId
      )
        throw new Error('Invalid evidence buffer identity.');
      sourceId = identities[1];
      passageId = remap(identities[2]);
      if (targets.get(passageId)?.sourceId !== sourceId)
        throw new Error('Evidence passage/source mismatch.');
      const buffers = copies.map((value) => JSON.parse(value));
      if (buffers.some((value) => !same(value, buffers[0])))
        throw new Error('Desktop origins contain different working copies.');
      const saved = buffers[0];
      if (typeof saved.baseline !== 'string')
        throw new Error('Working copy has no saved baseline.');
      const baseline = location(JSON.parse(saved.baseline), sourceId);
      const desired = validateEvidenceLocation(location(saved, sourceId), saved.assetId);
      const token = sha(
        stable([
          manifest.projectId,
          sourceId,
          identities[2],
          saved.assetId,
          JSON.parse(saved.baseline),
          validateEvidenceLocation(saved, saved.assetId),
        ]),
      );
      const receiptKey = sha(stable([project.id, passageId, token]));
      if (Object.hasOwn(ledger.applied, receiptKey)) {
        report.previouslyApplied++;
        continue;
      }
      const params = { projectId: project.id, sourceId, passageId };
      const current = await service.invoke('evidence_status', params);
      if (current.asset?.id !== saved.assetId || current.asset.managedState !== 'ok')
        throw new Error('Selected PDF does not match the verified desktop PDF.');
      // Keep evidence attached to other witnesses, just as the normal save does.
      desired.regions = [
        ...(current.passage?.regions || []).filter((region) => region.assetId !== saved.assetId),
        ...desired.regions,
      ];
      if (current.passage?.guide && desired.guide === undefined) {
        // The save API retains a guide if omitted; do not pretend it was removed.
        throw new Error('Current guide requires explicit reconciliation.');
      }
      if (same(current.passage, desired)) {
        report.unchanged++;
      } else {
        if (!same(current.passage, baseline))
          throw new Error('Online evidence differs from the desktop edit baseline.');
        if (!dryRun)
          await service.invoke('evidence_save', {
            ...params,
            assetId: saved.assetId,
            expectedRevision: current.revision,
            regions: desired.regions.filter((region) => region.assetId === saved.assetId),
            view: desired.view,
            ...(desired.guide ? { guide: desired.guide } : {}),
          });
        report.applied++;
      }
      report.passages.push({
        sourceId,
        passageId,
        ordinal: targets.get(passageId).ordinal,
        beforePages: (current.passage?.regions || []).map((region) => region.pageIndex + 1),
        afterPages: desired.regions.map((region) => region.pageIndex + 1),
      });
      if (!dryRun) {
        ledger.applied[receiptKey] = {
          snapshotSha256: receipt.snapshotSha256,
          sourceId,
          passageId,
          token,
        };
        await writeLedger(ledgerFile, ledger);
      }
    } catch (error) {
      // Storage failures must stop recovery, not masquerade as editorial conflicts.
      if (error.code) throw error;
      report.conflicts.push({ key, sourceId, passageId, reason: error.message });
    }
  }
  return report;
}
module.exports = { importDesktopEvidence };
