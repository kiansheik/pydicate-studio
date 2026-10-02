'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { fault, passageKey, stable } = require('./store.cjs');
const hash = (value) => createHash('sha256').update(stable(value)).digest('hex');
function createSubmissionReview({ store, getProject, invoke }) {
  const receipts = new Map();
  async function actor(context) {
    const user = await store.assertUser(context.user);
    if (user.role !== 'admin')
      throw fault(403, 'ADMIN_REQUIRED', 'Somente a administração pode incorporar o lote.');
  }
  async function state(id) {
    const row = await store.db.prepare('SELECT * FROM submissions WHERE id=$1').get(id);
    if (!row || row.project_id !== getProject().id)
      throw fault(404, 'SUBMISSION_MISSING', 'Envio não encontrado neste projeto.');
    const event = await store.db
      .prepare(
        'SELECT event FROM submission_events WHERE submission_id=$1 ORDER BY id DESC LIMIT 1',
      )
      .get(id);
    if (!['submitted', 'ready'].includes(event?.event))
      throw fault(409, 'REVIEW_STATE', 'Este envio não está aguardando incorporação.');
    const newer = await store.db
      .prepare(
        'SELECT id FROM submissions WHERE project_id=$1 AND passage_id=$2 AND draft_revision_id>$3 LIMIT 1',
      )
      .get(row.project_id, row.passage_id, row.draft_revision_id);
    if (newer)
      throw fault(
        409,
        'NEWER_SUBMISSION',
        'Existe um envio mais recente desta passagem. Atualize a fila.',
      );
    const snapshot = JSON.parse(row.snapshot),
      saved = await store.snapshot(row.project_id);
    const key = saved.envelope.drafts[row.passage_id]
      ? row.passage_id
      : row.passage_id.replace(/^passage:/, 'pending:');
    const draft = saved.envelope.drafts[key];
    if (
      !draft ||
      draft.organization?.deleted ||
      draft.revisionId !== snapshot.draft.revisionId ||
      draft.raw !== snapshot.draft.raw
    )
      throw fault(
        409,
        'DRAFT_CHANGED',
        'A passagem foi alterada depois do envio. Peça uma atualização antes de incorporar.',
      );
    const source = getProject().passages.find((p) => p.id === row.passage_id);
    if (source && source.sourceFingerprint !== draft.sourceFingerprint)
      throw fault(
        409,
        'SOURCE_CHANGED',
        'A fonte mudou desde este rascunho. Reconcilie a passagem antes de incorporar.',
      );
    return { row, snapshot, saved, key, draft };
  }
  async function inspect(id, context, pageIndex) {
    const current = await state(id),
      { snapshot, key, draft } = current,
      project = getProject();
    const sourceId = snapshot.sourceId;
    const evaluation = await invoke(
      'evaluate_expression',
      {
        passageId: key,
        sourceId,
        raw: draft.raw,
        revisionId: draft.revisionId,
        engineFingerprint: project.engineFingerprint,
      },
      context,
    );
    if (
      evaluation.origin !== 'engine' ||
      evaluation.evaluationStatus === 'partial' ||
      !evaluation.surface?.trim()
    )
      throw fault(
        409,
        'INCOMPLETE_RESULT',
        'A árvore precisa produzir uma forma completa antes da revisão.',
      );
    const evidence = await invoke(
      'evidence_status',
      { projectId: project.id, sourceId, passageId: key },
      context,
    );
    const regions =
      evidence.passage?.regions?.filter((region) => region.assetId === evidence.asset?.id) || [];
    if (!evidence.asset || evidence.asset.managedState !== 'ok')
      throw fault(
        409,
        'EVIDENCE_REQUIRED',
        'Vincule um PDF legível à fonte antes de revisar esta linha.',
      );
    if (!regions.length) {
      if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 100000)
        throw fault(
          400,
          'PDF_PAGE_REQUIRED',
          'Escolha a página física do PDF para conferir esta linha.',
        );
      evidence.passage = {
        regions: [],
        view: { pageIndex, zoom: 1, rotation: 0 },
        viewAssetId: evidence.asset.id,
      };
    }
    const metadata = {
      ...draft.locators,
      diplomatic: draft.diplomatic,
      normalized: draft.normalized,
      translation: draft.translation,
      translations: draft.translations || {},
      notes: draft.notes,
      ...(regions.length
        ? { evidence: { version: 1, assetId: evidence.asset.id, passageId: passageKey(key) } }
        : {}),
    };
    const pending = key.startsWith('pending:');
    let before = draft.pending?.beforePassageId;
    const visited = new Set();
    while (
      before &&
      !project.passages.some((p) => p.id === passageKey(before)) &&
      !visited.has(before)
    ) {
      visited.add(before);
      before = current.saved.envelope.drafts[before]?.pending?.beforePassageId;
    }
    const beforePassageId =
      before && project.passages.some((p) => p.id === passageKey(before))
        ? passageKey(before)
        : undefined;
    const preview = await invoke(
      pending ? 'source_new_preview' : 'source_preview',
      {
        passageId: key,
        sourceId,
        raw: draft.raw,
        metadata,
        ...(pending
          ? { newPassageId: passageKey(key), ...(beforePassageId ? { beforePassageId } : {}) }
          : {}),
      },
      context,
    );
    const evidenceIdentity = {
      assetId: evidence.asset.id,
      regions,
      pageIndex: regions.length ? null : pageIndex,
      rotation: evidence.passage?.view?.rotation || 0,
    };
    // Context lines/line numbers may shift as earlier checked rows are inserted.
    // The reviewed content, promoted expression, lexical meanings and pixels may not.
    const signature = hash({
      revision: draft.revisionId,
      raw: draft.raw,
      metadata,
      surface: evaluation.surface,
      annotated: evaluation.annotated,
      publishedRaw: preview.raw,
      lexicalAdditions: preview.lexicalAdditions,
      definitionRepairs: preview.definitionRepairs,
      evidence: evidenceIdentity,
    });
    return { ...current, evaluation, preview, evidence, signature };
  }
  async function prepare(input, context) {
    await actor(context);
    const item = await inspect(input.id, context, input.pageIndex),
      token = randomUUID();
    if (receipts.size >= 256) receipts.delete(receipts.keys().next().value);
    receipts.set(token, {
      id: input.id,
      userId: context.user.id,
      clientId: context.clientId,
      signature: item.signature,
      pageIndex: input.pageIndex,
      expires: Date.now() + 30 * 60000,
    });
    return {
      token,
      id: input.id,
      passageId: item.key,
      sourceId: item.snapshot.sourceId,
      draft: item.draft,
      evaluation: item.evaluation,
      preview: item.preview,
      evidence: item.evidence,
    };
  }
  async function publish(input, context) {
    await actor(context);
    const receipt = receipts.get(input.token);
    if (
      !receipt ||
      receipt.userId !== context.user.id ||
      receipt.clientId !== context.clientId ||
      receipt.expires < Date.now()
    )
      throw fault(409, 'REVIEW_EXPIRED', 'Abra a prévia e confira a linha novamente.');
    if (receipt.result)
      return {
        ...receipt.result,
        project: getProject(),
        ...(await store.snapshot(getProject().id)),
      };
    // The same DB write lock used by autosave prevents a concurrent edit between
    // the final revision check and publication. The runtime owns its engine queue.
    return store
      .transaction(async () => {
        await actor(context);
        const item = await inspect(receipt.id, context, receipt.pageIndex);
        if (item.signature !== receipt.signature)
          throw fault(
            409,
            'REVIEW_CHANGED',
            'A forma, o léxico ou a evidência mudou. Confira esta linha novamente.',
          );
        const changed =
          !!item.preview.diff?.trim() || item.preview.files?.some((file) => file.diff?.trim());
        const project = changed
          ? await invoke(
              'source_apply',
              {
                previewId: item.preview.previewId,
                sourceFingerprint: item.preview.sourceFingerprint,
              },
              context,
            )
          : getProject();
        const target = project.passages.find((p) => p.id === passageKey(item.key));
        if (!target)
          throw fault(
            409,
            'PUBLISHED_PASSAGE_MISSING',
            'A fonte mudou, mas a passagem não foi localizada. Recarregue antes de continuar.',
          );
        // Hosted publication already migrates the UUID and anchors while holding
        // this transaction's write lock. Do not repeat that migration using the
        // pre-publication versions; only record the subsequent review outcome.
        const finalized = !!project.draftPublication;
        const saved = finalized ? await store.snapshot(project.id) : item.saved;
        const updated = {
          ...(finalized ? saved.envelope.drafts[target.id] : item.draft),
          passageId: target.id,
          raw: target.sourceExpression,
          sourceFingerprint: target.sourceFingerprint,
        };
        delete updated.pending;
        let approved = false,
          error;
        try {
          await invoke(
            'reference_approve',
            {
              passageId: target.id,
              sourceFingerprint: target.sourceFingerprint,
              engineFingerprint: project.engineFingerprint,
              reviewedSurface: item.evaluation.surface,
            },
            context,
          );
          approved = true;
          updated.workflow = { stage: 'complete', updatedAt: new Date().toISOString() };
        } catch (reason) {
          error = reason.message;
        }
        const changes = [
          { id: target.id, version: saved.versions[target.id] || 0, draft: updated },
        ];
        if (!finalized && item.key !== target.id) {
          changes.unshift({ id: item.key, version: item.saved.versions[item.key], draft: null });
          for (const [id, draft] of Object.entries(item.saved.envelope.drafts)) {
            if (id === item.key || !draft.pending) continue;
            if (
              draft.pending.previousPassageId !== item.key &&
              draft.pending.beforePassageId !== item.key
            )
              continue;
            changes.push({
              id,
              version: item.saved.versions[id],
              draft: {
                ...draft,
                pending: {
                  ...draft.pending,
                  ...(draft.pending.previousPassageId === item.key
                    ? { previousPassageId: target.id }
                    : {}),
                  ...(draft.pending.beforePassageId === item.key
                    ? { beforePassageId: target.id }
                    : {}),
                },
              },
            });
          }
        }
        await store.patch(project.id, changes, context.user, context.clientId);
        if (approved)
          await store.db.query(
            "INSERT INTO submission_events(submission_id,actor_id,event,at,details) VALUES($1,$2,'imported',$3,$4)",
            [
              receipt.id,
              context.user.id,
              store.now(),
              {
                mode: 'studio-source-review',
                snapshotSha256: item.row.snapshot_sha256,
                reviewedSurface: item.evaluation.surface,
                evidence: {
                  assetId: item.evidence.asset.id,
                  regions: item.evidence.passage.regions,
                  pageIndex: receipt.pageIndex,
                },
              },
            ],
          );
        const result = {
          id: receipt.id,
          passageId: target.id,
          sourceApplied: changed,
          approved,
          ...(error ? { error } : {}),
          project: getProject(),
          ...(await store.snapshot(project.id)),
        };
        // Cache after commit, never report a rolled-back database transaction as done.
        return result;
      })
      .then((result) => {
        receipt.result = result;
        return result;
      });
  }
  return { prepare, publish };
}
module.exports = { createSubmissionReview };
