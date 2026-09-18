# AI authoring integration contract (implementation in progress)

The current checkout is baseline `07c3dbd` plus the uncommitted ground-truth shortcut and inline argument work. Preserve those changes. Araújo is this milestone's source. A source edit, human draft, scratch candidate and editorial approval remain distinct.

## Ownership and transport

The Electron main process owns the project/profile writer and queue. An authenticated local transport delegates scoped MCP calls to this owner; external clients never open draft/state files for writing. Candidate revisions live in the analysis store, separate from human draft envelopes. Human acceptance uses revision-checked draft commands and records acceptance provenance atomically in the resulting draft. Legacy AI histories remain readable, without invented traces.

Root owns `electron/analysis-service.cjs`, store/queue/input/evidence orchestration, `electron/next-service.cjs`, `electron/main.cjs`, `electron/draft-store.cjs`, validation, `src/useStudio.ts`, existing draft/model types, evidence image backend and integration verification. UI owns App/support-pane/assistant/PDF renderer code, workspace migration, new `src/domain/analysis.ts`, CSS and UI tests. Provider owns provider adapters and a new iterative runner. Authoring owns shared headless compiler, scoped scratch operations and MCP gateway, tests and tool inventory. Coordinate changes to existing domain code with root.

## Renderer methods

All are explicit `studio.invoke` methods, main-process authorized for the open project:

- `analysis_list {projectId, passageId?}` -> `{version:1, jobs:Job[], conversations:Conversation[], candidates:Candidate[], background:{running:boolean, detail:string}}` (bounded summaries; detail via get).
- `analysis_get {projectId, jobId}` -> `{job, conversation, candidates}`.
- `analysis_submit {projectId, passageId, revisionId, operationId, task, scope:'passage'|'constituent', selectedNode?, includeImages?, evidenceRevision?, description?, parentJobId?, candidateId?, candidateRevision?, budgets?}` -> Job. Await renderer draft/evidence saves first. Main independently freezes saved input; it does not trust an unsaved packet.
- `analysis_submit_batch {projectId, items:[submit parameters]}` -> `{jobs, errors}`. Each item is independently persisted/validated, and stable operation IDs prevent resubmission.
- `analysis_cancel`, `analysis_retry` `{projectId,jobId,operationId}` -> Job. Retry creates another attempt, not another input.
- `analysis_accept {projectId,jobId,candidateId,candidateRevision,expectedDraftRevision,operationId}` -> `{envelope, draft, decision}`. **Inspecionar na árvore** invokes this undoable adoption and opens the ordinary working canvas. Exact current draft CAS and candidate revision guards apply; the current draft need not equal the original AI input revision. Old engine fingerprints trigger local reevaluation, never another AI job. Original model evidence remains immutable.
- `analysis_composer {projectId,passageId,expectedRevision?,text?,selectedCandidateId?,scrollTop?}` -> Conversation; stores per-passage composer/review selection separately from drafts.

Events: `{type:'analysis',projectId,passageId,jobId?,status?,phase?,revision?}` signal committed changes; UI reloads scoped summary, never switches tabs on completion.

Tasks: `analyze`, `translate-source`, `translate-analysis`, `explain`, `revise`. Source translation works without an expression; analysis translation requires complete current evaluation. Provider setup continues using existing `ai_status`/`ai_configure`; old assistant/history remains available as a collapsed legacy view.

## Records

All IDs are bounded strings. Timestamps are UTC ISO strings. Storage validates schemas and preserves damaged data. Comparison version 1 separately reports exact, spacing/case-folded and accent-folded equality; preserved source strings always accompany results.

`InputPacket`: `{version:1,id,digest,projectId,sourceId,passageId,baseRevisionId,sourceFingerprint,engineFingerprint,repositories,diplomatic,tentativeReading,meaning,constraints,notes,reviewedTarget,raw,canvas,locators,evidence,context,manifest,task,scope,selectedNode,description,provider,model,reasoningEffort,budgets,createdAt}`. Context is frozen reviewed preceding passages with provenance. Evidence contains saved revision, asset hash and own regions; inherited guides are never evidence. Manifest gives allowed sources/dictionary identities and retrieval bounds. Provider traffic is the only permitted remote runtime research connection.

`Job`: `{id,projectId,passageId,conversationId,input,status,phase,attempts,createdAt,updatedAt,error?,parentJobId?,candidateIds,questions,summary?,usage?}`. Status is `queued|running|cancelling|needs-input|ready-for-review|blocked|failed|cancelled`. Attempt has `{id,status,startedAt,finishedAt?,checkpoint?,error?,usage?}`. A restart makes ambiguous running attempts recoverable/blocked; it never silently repeats billed inference.

`Conversation`: `{id,projectId,passageId,revision,composer,selectedCandidateId?,scrollTop?,turns:[{id,role:'user'|'assistant',text,jobId?,candidateId?,candidateRevision?,inputRevisionId,at}]}`.

`Candidate`: `{id,jobId,projectId,passageId,revisionId,raw,canvas,tree?,evaluation?,comparison?,evidence:[],rationale?,translation?,uncertainties:[],failures:[],status:'scratch'|'proposed',createdAt,updatedAt}`. Evaluation must bind exact candidate revision/raw/engine and preserve partial errors. No certainty percentages or private reasoning traces.

New complete proposals require `translation: {text, uncertainties}` in `studio_candidate_propose`. The service records `{text,uncertainties,language:'pt',status:'tentative',revisionId,expression,engineFingerprint,evaluatedSurface}` on the candidate. Edits and reevaluation invalidate it; partial failed main expressions cannot claim a full translation. Older stored proposals without this field remain compatible. Translation is produced in the same analysis run. Human `draft.translation` remains independently editable; neither generation nor expression-only acceptance replaces it. Explicit copy actions preserve revision/passage guards.

**Usar e revisar proposta** accepts the visible candidate, then prepares ordinary source review against the resulting draft revision. The proposal canvas, passage review and Ground Truth dialog use the same path. The hook reads the latest snapshot after acceptance and discards previews when draft, selection or engine changes during preparation; it never publishes merely by opening review.

Direct inspection now loads the working draft immediately; that extra use-and-review action remains only for legacy saved previews. Acceptance records `decision.revalidation: {engineFingerprint,expressionFingerprint,sourceFingerprint?,at,status:'complete'|'partial'|'failed',surface?,annotated?,changedSinceProposal?,error?}`. Failed local evaluation has no fabricated surface. Source publication still evaluates/checks the current draft independently. Receipt replay returns the existing decision without reevaluation or replacement. A stale worker snapshot allows one renderer refresh and acceptance retry with the same operation ID; project/passage identity changes and current draft races reject. Reopening an identical working forest preserves its human layout without another adoption.

Draft preparation fields are `draft.aiInput?: {tentativeReading:string,meaning:string,constraints:string}`. They never map to @target. Root adds persistence/migration/type validation. UI edits these through `studio.edit`. `normalized` retains its existing reviewed-target semantics.

## Authoring/provider interfaces

Root creates `createScratchService({getJob,getCandidate,saveCandidate,request,getProject,getEvidence,askQuestion,recordTool})` (async callbacks). Its public `tools` are MCP-style `{name,description,inputSchema}` and `call(jobId,name,args,{signal,operationId})`. Root persists candidates/revisions/evidence/idempotency. Tools whitelist existing bounded worker reads/evaluation; tool params cannot override captured project/engine/source context. Builder commands invoke the same TypeScript canvas/tree transforms as UI. No publication, source/lexicon writes, approval or filesystem tool.

`createStudioMcpGateway({stateDirectory, callTool, listTools, getGuide, isJobActive})`: restricted authenticated local service plus stdio client shim; root requests a scoped per-attempt connection descriptor for Codex/external clients. Implementer may refine exact constructor/method names and must notify root/provider before integrating. Tool scopes bind job/attempt and revoke on cancellation/end.

Provider runner: `runAgent({provider,model,reasoningEffort,input,messages,tools,callTool,mcp,signal,budgets,onEvent,onCheckpoint})` -> `{text,summary?,questions?,providerResponseId?,usage,messages}`. `tools` follow MCP schema; Claude maps to Messages tools, Codex receives only the scoped Studio MCP descriptor. `onEvent` reports observable progress/tool results; checkpoints contain protocol messages, not private reasoning. Root records every checkpoint/event before further work. Budgets default one job at a time, finite wall time/tool steps/output tokens; no automatic billed retry on uncertain acknowledgement.

No paid generation tests. Deterministic protocol fixtures and disposable corpus/profile tests are required. Live-provider linguistic usefulness is a separate explicitly budgeted experiment, reported as unrun until authorized with a budget.
