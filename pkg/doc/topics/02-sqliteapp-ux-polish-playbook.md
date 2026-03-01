---
Title: sqliteapp UX Polish Playbook for Interns
Slug: sqliteapp-ux-polish-playbook
Short: Practical, end-to-end instructions for a UX intern to improve the SQLite app UI with clear scope, reading order, implementation steps, and validation checks.
Topics:
- sqlite
- ux
- frontend
- go-go-os
- launcher
- hypercard
Commands:
- go-go-app-sqlite
- wesen-os-launcher
Flags:
- --addr
- --sqlite-db
- --sqlite-db-read-only
- --sqlite-default-row-limit
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: Tutorial
---

This playbook is for a UX intern who is new to go-go-os and wants to make the SQLite app feel faster, clearer, and easier to trust. The app already works functionally; your job is to remove friction, improve readability, and make the query workflow feel obvious even for first-time users.

Treat this as a guided production task, not a design exercise in isolation. You will read the architecture first, run the real launcher UI, identify interaction pain points, then apply polish in small, testable increments.

## Mission and Scope

You are polishing the SQLite frontend experience in two places:

- The primary workspace window (`SqliteWorkspaceWindow`) used for direct query execution.
- The SQLite HyperCard stack cards (home/query/results/seed) used from card windows.

Out of scope for this ticket:

- Changing backend SQL policy behavior.
- Changing API request/response contracts.
- Rewriting launcher shell primitives.

The expectation is UX polish and frontend structure improvements, while preserving existing behavior.

## First Read (Required)

Read these in order before touching code.

- [SQLite Architecture and Implementation Guide](01-sqliteapp-architecture-and-implementation-guide.md)
  Why: full backend/frontend/system map and data flow.
- [SQLite Workspace Component](../../../apps/sqlite/src/components/SqliteWorkspaceWindow.tsx)
  Why: main UI implementation and current visual language.
- [SQLite Launcher Module](../../../apps/sqlite/src/launcher/module.tsx)
  Why: how windows are opened and where card adapters are wired.
- [SQLite HyperCard VM Bundle](../../../apps/sqlite/src/domain/pluginBundle.vm.js)
  Why: card-level UI and actions that must remain coherent with workspace UX.
- [SQLite Runtime Queue State](../../../apps/sqlite/src/domain/hypercard/runtimeState.ts)
  Why: status/error/result state used by card views.
- [wesen-os Startup Playbook](../../../../wesen-os/docs/startup-playbook.md)
  Why: canonical way to launch backend + frontend in tmux.
- [Launcher Module Registry](../../../../wesen-os/apps/os-launcher/src/app/modules.tsx)
  Why: confirms SQLite is registered and discoverable in launcher UI.
- [Vite Alias and Proxy Config](../../../../wesen-os/apps/os-launcher/vite.config.ts)
  Why: confirms how sqlite frontend code and API paths resolve in dev.

## Mental Model Before Design Changes

The SQLite UI is a thin client over namespaced backend APIs. Every visual change should preserve this flow:

```text
Launcher icon/menu
  -> sqlite launcher module opens window
  -> SqliteWorkspaceWindow renders editor, status, results, history, saved queries
  -> fetch /api/apps/sqlite/query (or history/saved-queries)
  -> render metadata + rows + errors
```

HyperCard cards are a parallel UI path that should feel consistent with the workspace:

```text
Card action dispatch (sqlite.query.execute / sqlite.seed.execute)
  -> runtimeState queue
  -> SqliteHypercardIntentRunner executes API requests
  -> results/errors stored in app_sqlite.hypercard
  -> pluginBundle.vm.js cards render that state
```

If you change language, statuses, or affordances in the workspace, review card copy and labels so users do not get two conflicting UX dialects.

## UX Quality Bar (Definition of Good)

Use this bar to judge each change:

- Clarity: users know what to do next without reading source code.
- Feedback: every async action has visible loading, success, and failure states.
- Recoverability: users can fix errors quickly (invalid JSON, bad SQL, wrong filter).
- Information hierarchy: query editor, execution status, and results are scannable.
- Consistency: button styles, spacing, labels, and error language follow one pattern.
- Accessibility basics: sufficient contrast, keyboard focus visibility, sensible control labels.

## Audit Checklist (Run Before Editing)

Launch the real UI and write a short audit report with screenshots.

1. Start launcher dev session:

```bash
cd wesen-os
pnpm run launcher:dev:start
pnpm run launcher:dev:status
```

2. Open frontend URL from status output and launch SQLite from the desktop.
3. Execute these user journeys and log friction:

- Run a valid `SELECT` with and without row limit.
- Run malformed JSON params and malformed SQL.
- Cancel a running query.
- Save, update, reload, and delete saved queries.
- Restore queries from history and re-run.
- Open SQLite cards (home/query/results/seed) from context/menu.
- Run query and seed from cards, then compare status copy with workspace.

4. For each friction point, write:

- `Problem:` what is confusing.
- `Impact:` what task slows down or fails.
- `Proposed UI change:` concrete control/text/layout improvement.

## Implementation Plan (Suggested Order)

### Phase 1: Tokenize and Split UI Structure

Goal: make polish work sustainable by reducing one giant component surface.

- Create a style token module for color, spacing, border radius, typography, panel shadows.
- Extract presentational subcomponents from `SqliteWorkspaceWindow`:
  - Query editor panel
  - Status panel
  - Results panel
  - History panel
  - Saved queries panel
  - HyperCard intent reference panel
- Keep behavioral state orchestration in the top-level component first.

Suggested target files:

- `apps/sqlite/src/components/SqliteWorkspaceWindow.tsx` (orchestrator)
- `apps/sqlite/src/components/sqlite-ui/*` (new presentational panels)
- `apps/sqlite/src/components/sqlite-ui/tokens.ts` (new style constants)

Pseudocode:

```pseudo
SqliteWorkspaceWindow
  owns state + async handlers
  renders <SqliteLayout>
    <QueryEditorPanel ... />
    <StatusPanel ... />
    <ResultsPanel ... />
    <HistoryPanel ... />
    <SavedQueriesPanel ... />
```

### Phase 2: Improve Interaction and Copy

Goal: make behavior legible and forgiving.

- Replace ambiguous button labels with action-specific text.
- Standardize status text and error phrasing.
- Add short helper copy for parameter mode and JSON format examples.
- Make loading and disabled states obvious and consistent.
- Improve empty states:
  - no results
  - no history
  - no saved queries
  - no seed runs

### Phase 3: Results and Data Legibility

Goal: optimize the core analysis surface.

- Improve table readability (header contrast, sticky header if appropriate, row striping).
- Use monospace only where it helps (SQL/results), not for all body text.
- Display key meta fields in predictable order:
  - statement type
  - row count
  - duration
  - correlation ID
  - truncation reason
- Ensure truncation warnings are unmistakable and actionable.

### Phase 4: HyperCard UX Alignment

Goal: keep card path and workspace path aligned.

- Review labels and action names in `pluginBundle.vm.js`.
- Align terms with workspace (for example: `Execute Query`, `Queue`, `Runner idle`).
- Ensure cards expose equivalent guidance for common errors.
- Keep navigation friction low between `query` and `results` cards.

## Guardrails While Editing

- Do not change backend HTTP schema without explicit ticket scope.
- Do not introduce hardcoded `/api/...` paths outside resolved app base patterns.
- Keep existing command IDs and app ID stable (`sqlite`).
- Preserve queue semantics and runner ownership in hypercard runtime state.

Backend/API contract references:

- [Query Handler Routes and Error Handling](../../../pkg/sqliteapi/handler.go)
- [Backend Component Route Mounting](../../../pkg/backendcomponent/component.go)
- [wesen-os SQLite Module Reflection/API Surface](../../../../wesen-os/pkg/sqlite/module.go)

## Validation Checklist (Required Before PR)

Manual validation:

- Workspace query execution path still works for success/error/cancel.
- History and saved query CRUD still work.
- HyperCard cards still launch from SQLite menus and from icon open-new path.
- Card query and seed still execute through intent runner.

Automated checks (run what is available in this repo state):

```bash
cd go-go-app-sqlite
pnpm dlx vitest run --config apps/sqlite/vitest.config.ts \
  apps/sqlite/src/domain/hypercard/runtimeState.test.ts \
  apps/sqlite/src/launcher/module.test.tsx
```

If workspace dependency resolution prevents some checks, document exact command + exact error in your diary.

## Handoff Artifacts

Submit these with your PR:

- Before/after screenshots for each changed panel.
- UX audit notes (problem -> impact -> change).
- Short changelog of UX decisions.
- Validation notes with commands executed.

Use this lightweight diary template:

```text
Date/Time:
Task:
What changed:
Why:
Validation run:
Observed result:
Follow-up:
```

## See Also

- [OS-03 SQLite Query App Ticket](../../../../wesen-os/ttmp/2026/03/01/OS-03-SQLITE-QUERY-APP--sqlite-query-app-with-backend-gui-components-and-hypercard-query-integration/index.md)
- [OS-05 SQLite HyperCard Stack Ticket](../../../../wesen-os/ttmp/2026/03/01/OS-05-SQLITE-HYPERCARD-STACK--sqlite-hypercard-vm-stack-for-query-seed-sqlite-icon-context-launch/index.md)
- [OS-05 Implementation Diary](../../../../wesen-os/ttmp/2026/03/01/OS-05-SQLITE-HYPERCARD-STACK--sqlite-hypercard-vm-stack-for-query-seed-sqlite-icon-context-launch/reference/01-diary.md)
