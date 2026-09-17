# Open questions and next gates

1. Establish a clean compatible engine/corpus pair and prepared Python dependency set reproducible from a fresh checkout. The currently observed dirty pair is fingerprinted but not bundled.
2. Agree the lossless shared authoring representation with engine/corpus owners; add lexical lookup and source export/reimport before claiming stage 2 complete. Full coverage is tracked in [operation inventory](../design/operation-inventory.md).
3. Migrate canonical passage identities. Current Studio IDs survive unchanged expression moves, but external rewrites receive new IDs; old drafts are retained for manual reassociation. Saved reference pairing remains positional legacy behavior.
4. Persist witness attachments, printed/PDF page mappings, page rectangles and source-adjacent editorial metadata. Session consultation currently ends when the app closes.
5. Integrate sequential human reference acceptance through authoritative corpus services and immutable versioned review events. Equality or regeneration must never manufacture approval.
6. Add the 0074 referential relation/repair case, then nested Bettendorff constructions. Keep unimplemented forms inspectable without pretending visual support.
7. Add contextual provider adapters, isolated grammar workspaces, Git contribution synchronization, assignments, managed runtime/installer and colleague task acceptance in later milestones.

No approval is needed for ordinary local edits/tests within this repo. Publishing, upstream corpus mutation and editorial acceptance were not part of the initial task.
