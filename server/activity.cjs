'use strict';
const MAX_INTERVAL_MS = 30000, MAX_DELAY_MS = 90000;
function invalid() {
  return Object.assign(new Error('Intervalo de atividade inválido.'), { status: 400, code: 'INVALID_ACTIVITY' });
}
function interval(input, now) {
  if (typeof input.eventId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.eventId) ||
      ![input.durationMs, input.intervalStartMs, input.intervalEndMs].every(Number.isFinite) ||
      input.durationMs <= 0 || input.intervalStartMs < 0 || input.intervalEndMs <= input.intervalStartMs ||
      input.intervalEndMs > now + 5000) throw invalid();
  const end = Math.min(now, Math.floor(input.intervalEndMs));
  const start = Math.max(Math.ceil(input.intervalStartMs), now - MAX_DELAY_MS,
    end - Math.min(MAX_INTERVAL_MS, Math.floor(input.durationMs)));
  return start < end ? [start, end] : null;
}
function subtract(candidate, accepted) {
  if (!candidate) return [];
  let remaining = [candidate];
  for (const [start, end] of accepted) remaining = remaining.flatMap(([from, to]) =>
    end <= from || start >= to ? [[from, to]] : [
      ...(start > from ? [[from, Math.min(start, to)]] : []),
      ...(end < to ? [[Math.max(end, from), to]] : []),
    ]);
  return remaining;
}
async function recordActivity(store, user, input, passageId) {
  return store.transaction(async () => {
    await store.assertUser(user);
    const now = store.now(), candidate = interval(input, now);
    const duplicate = await store.db.prepare(`SELECT duration_ms FROM audit
      WHERE user_id=$1 AND event='activity.active' AND metadata->>'eventId'=$2 LIMIT 1`)
      .get(user.id, input.eventId);
    if (duplicate) return { ok: true, acceptedMs: duplicate.duration_ms, duplicate: true };
    const prior = await store.db.prepare(`SELECT metadata FROM audit WHERE user_id=$1
      AND event='activity.active' AND at>=$2`).all(user.id, now - MAX_DELAY_MS);
    const accepted = subtract(candidate, prior.flatMap(row => row.metadata.acceptedIntervals ?? []));
    const acceptedMs = accepted.reduce((sum, [from, to]) => sum + to - from, 0);
    await store.audit(user.id, 'activity.active', passageId, 'succeeded', acceptedMs, 'browser', {
      platform: 'studio', eventId: input.eventId, acceptedIntervals: accepted,
      reportedInterval: candidate,
    });
    return { ok: true, acceptedMs, duplicate: false };
  });
}

// Authored fields only: navigation, camera, timestamps, publication identity and
// automatic source fingerprints are not contributions. Historical revisions stay intact.
const FIELDS = ['raw', 'diplomatic', 'normalized', 'translation', 'notes'];
const STRUCTURED_FIELDS = ['analysis', 'locators', 'translations'];
function fragments(alias) {
  const value = `${alias}::jsonb#>'{canvas,fragments}'`;
  return `coalesce((SELECT jsonb_agg(fragment->>'raw' ORDER BY fragment->>'raw')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${value})='array' THEN ${value} ELSE '[]'::jsonb END) fragment
    WHERE coalesce(btrim(fragment->>'raw'),'')<>''), '[]'::jsonb)`;
}
function authored(alias) {
  return `jsonb_build_array(${[
    ...FIELDS.map(key => `coalesce(${alias}::jsonb->'${key}', '\"\"'::jsonb)`),
    ...STRUCTURED_FIELDS.map(key => `coalesce(nullif(${alias}::jsonb->'${key}', 'null'::jsonb), '{}'::jsonb)`),
    fragments(alias),
  ].join(',')})`;
}
const canonical = field => `CASE WHEN ${field} LIKE 'pending:%' THEN 'passage:' || substr(${field},9) ELSE ${field} END`;
async function creditReport(store, cutoff) {
  const records = await store.db.prepare(`WITH credits AS (
      SELECT user_id, ${canonical('passage_id')} AS passage_id, 'saved' AS kind FROM revisions
      WHERE at >= $1 AND after_json IS NOT NULL AND ${authored('before_json')} IS DISTINCT FROM ${authored('after_json')}
        AND (before_json IS NOT NULL OR (passage_id LIKE 'pending:%' AND (
          ${FIELDS.map(key => `coalesce(btrim(after_json::jsonb->>'${key}'),'')<>''`).join(' OR ')}
          OR ${fragments('after_json')}<>'[]'::jsonb)))
      UNION ALL
      SELECT user_id, ${canonical('passage_id')}, CASE
        WHEN event='comment.create' THEN 'comment'
        WHEN event='operation.evidence_save' THEN 'regions'
        WHEN event='operation.lexical_notes_save' THEN 'lexical'
        ELSE 'published' END AS kind
      FROM audit WHERE at >= $1 AND origin='server' AND outcome='succeeded'
        AND event IN ('comment.create','operation.evidence_save','operation.lexical_notes_save','operation.source_apply','operation.reference_approve')
        AND (event<>'operation.evidence_save' OR metadata->'regionsChanged'='true'::jsonb)
    ) SELECT c.user_id AS "userId", u.name, c.passage_id AS "passageId", c.kind, count(*) AS count
      FROM credits c LEFT JOIN users u ON u.id=c.user_id WHERE c.user_id IS NOT NULL AND c.passage_id IS NOT NULL
      GROUP BY c.user_id,u.name,c.passage_id,c.kind ORDER BY u.name,c.user_id,c.passage_id,c.kind`).all(cutoff);
  const checkpoints = await store.db.prepare(`SELECT r.user_id AS "userId",u.name,count(*) AS checkpoints
      FROM revisions r LEFT JOIN users u ON u.id=r.user_id WHERE r.at>=$1
      GROUP BY r.user_id,u.name`).all(cutoff);
  const users = new Map(checkpoints.map(row => [row.userId, { ...row, passages: 0, kinds: {}, ids: new Set() }]));
  for (const row of records) {
    if (!users.has(row.userId)) users.set(row.userId, { userId: row.userId, name: row.name, checkpoints: 0, passages: 0, kinds: {}, ids: new Set() });
    const user = users.get(row.userId);
    user.ids.add(row.passageId); user.kinds[row.kind] = (user.kinds[row.kind] ?? 0) + row.count;
  }
  const unclassifiedEvidenceSaves = await store.db.prepare(`SELECT a.user_id AS "userId",u.name,count(*) AS saves
    FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.at>=$1
      AND a.event='operation.evidence_save' AND a.origin='server' AND a.outcome='succeeded'
      AND NOT (a.metadata ? 'regionsChanged') GROUP BY a.user_id,u.name ORDER BY u.name`).all(cutoff);
  return { contributions: [...users.values()].map(({ ids, ...user }) => ({ ...user, passages: ids.size }))
    .sort((a, b) => b.passages - a.passages || b.checkpoints - a.checkpoints), contributionPassages: records,
    unclassifiedEvidenceSaves };
}
async function activeReport(store, cutoff) {
  const tracking = await store.db.prepare(`SELECT min(at) AS since FROM audit WHERE event='activity.active'`).get();
  const passages = await store.db.prepare(`SELECT a.user_id AS "userId",u.name,
      ${canonical('a.passage_id')} AS "passageId",
      sum(greatest(0,(part->>1)::bigint-greatest((part->>0)::bigint,$1)))::bigint AS "activeMs"
    FROM audit a LEFT JOIN users u ON u.id=a.user_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.metadata->'acceptedIntervals','[]'::jsonb)) part
    WHERE a.event='activity.active' AND a.at>=$1
    GROUP BY a.user_id,u.name,${canonical('a.passage_id')} ORDER BY u.name,"passageId"`).all(cutoff);
  const users = new Map();
  for (const row of passages) {
    if (!users.has(row.userId)) users.set(row.userId, { userId: row.userId, name: row.name, activeMs: 0, passages: 0 });
    const user = users.get(row.userId); user.activeMs += row.activeMs;
    if (row.passageId && row.activeMs) user.passages++;
  }
  return { platform: 'studio', trackingSince: tracking.since,
    users: [...users.values()].sort((a, b) => b.activeMs - a.activeMs), passages,
    measurement: 'Tempo com a aba visível e focada, após interação recente; intervalos sobrepostos contam uma vez por pessoa. A atribuição entre abas segue o primeiro intervalo recebido. Não há estimativa retroativa de horas.' };
}
module.exports = { recordActivity, creditReport, activeReport, interval, subtract, MAX_INTERVAL_MS, MAX_DELAY_MS };
