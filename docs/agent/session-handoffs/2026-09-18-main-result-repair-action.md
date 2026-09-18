# Main result grammar repair action

- Goal: make the repair loop findable directly below the main rendered form quoted by the contributor.
- Files inspected: `src/App.tsx`, `src/useStudio.ts`, `src/components/ExpressionCanvas.tsx`, `src/components/GrammarDiagnosticDialog.tsx`, result-card styles and existing browser fixtures.
- Files changed: `src/App.tsx`, `src/workbench.css`, current state and log.
- Commands run: targeted `rg`/source reads; `npm run build`; Prettier and `git diff --check`.
- Worked: the visible local-project result card now opens the existing repair dialog with the current passage's expression, evaluated tree, revision and failures. The tree-inspector action remains available.
- Failed: no UI browser run was needed for this small placement change; no corpus or engine files were touched.
- Remaining questions: desktop users need a reload/restart if their running window serves an older build.
- Suggested next prompt: open a real local passage in Studio and click **Corrigir gramática / árvore** immediately beneath **RESULTADO ATUAL**; confirm it shows the current expression and intended-form field.
