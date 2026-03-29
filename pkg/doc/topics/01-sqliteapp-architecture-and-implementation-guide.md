---
Title: sqliteapp Architecture and Implementation Guide
Slug: sqliteapp-architecture-and-implementation-guide
Short: End-to-end guide for new go-go-os developers explaining how go-go-app-sqlite is structured, why each layer exists, and how to extend it safely.
Topics:
- sqlite
- go-go-os
- backend
- frontend
- hypercard
- tutorial
Commands:
- go-go-app-sqlite
Flags:
- --listen
- --db-path
- --db-read-only
- --db-auto-create
- --db-default-row-limit
- --db-statement-timeout
- --statement-allowlist
- --statement-denylist
- --redact-columns
- --rate-limit-requests
- --rate-limit-window
IsTopLevel: true
IsTemplate: false
ShowPerDefault: true
SectionType: Tutorial
---

This guide explains how `go-go-app-sqlite` is built from first principles for developers who are new to both go-go-os and app module development. It focuses on the practical architecture: which package owns which concern, how requests move through the system, where invariants live, and how to make changes without breaking composition.

If you read this once and keep it open while coding, you should be able to add a new endpoint, extend UI behavior, or debug startup failures without guessing.

## What This App Is

Think of `go-go-app-sqlite` as a reference-quality "full app module" in go-go-os form: it has its own backend runtime, its own frontend launcher integration, and a bridge for HyperCard-driven workflows. That combination makes it a good learning vehicle because you can see the entire stack in one repo without hidden magic.

`go-go-app-sqlite` is a split-repo app module that provides:

- A Go backend runtime and HTTP API under `/api/apps/sqlite/*`.
- A frontend launcher module (`@go-go-golems/sqlite/launcher`) that renders the SQLite workspace window.
- HyperCard intent bridge helpers so card/runtime flows can execute queries through the same policy path.

The implementation is intentionally layered so each part can be tested in isolation.

## System Map (High Level)

This map is your orientation compass. When you are debugging, always locate your current issue on this pipeline first: config issue, runtime issue, policy/executor issue, HTTP/handler issue, or UI bridge issue. Most "mysterious" bugs become straightforward once you identify the stage.

At runtime, the app is a pipeline:

```text
CLI config/env
  -> sqliteapp.Config (normalize + validate)
  -> sqliteapp.Runtime (open DB + migrate + ping + close)
  -> sqliteapi.QueryExecutor (policy + timeout + row/payload limits)
  -> sqliteapi.QueryHandler (HTTP decode/validate + history + saved queries + audit)
  -> backendcomponent.SQLiteBackendComponent (manifest + route mount + lifecycle)
  -> cmd/go-go-app-sqlite/main.go HTTP server (/api/apps/sqlite/*)
```

Frontend and HyperCard layers consume the same API contract:

```text
apps/sqlite launcher module
  -> SqliteWorkspaceWindow
  -> POST /api/apps/sqlite/query and metadata routes
  -> optional HyperCard intent bridge (runSqliteHypercardQueryIntent)
```

## Repository Layout and Ownership

Use this as your mental map before editing anything. In this project, correctness comes less from "clever code" and more from respecting ownership boundaries. If you modify the right layer, changes stay local and testable; if you cross boundaries casually, regressions propagate quickly.

- `cmd/go-go-app-sqlite/main.go`
  - Symbol references: `run`, `resolveCLIConfig`.
  - Owns process startup, flag/env parsing, HTTP server setup, route prefix mount.
- `pkg/sqliteapp/config.go`
  - Symbols: `Config`, `DefaultConfig`, `Normalize`, `Validate`.
  - Owns runtime configuration semantics and guardrails.
- `pkg/sqliteapp/runtime.go`
  - Symbols: `Runtime`, `NewRuntime`, `Open`, `Ping`, `Close`.
  - Owns DB file safety checks, DSN assembly, DB lifecycle.
- `pkg/sqliteapp/migrations.go`
  - Symbols: `Migrate`, `ensureColumn`.
  - Owns metadata schema (`query_history`, `saved_queries`).
- `pkg/sqliteapi/executor.go`
  - Symbols: `QueryExecutor`, `Execute`, `enforceStatementPolicy`.
  - Owns SQL execution policy and result shaping.
- `pkg/sqliteapi/handler.go`
  - Symbols: `QueryHandler`, `HandleQuery`, `HandleHistory`, `HandleSavedQueries`, `HandleSavedQueryByID`.
  - Owns HTTP contract and error/status mapping.
- `pkg/sqliteapi/metadata_store.go`
  - Symbols: `MetadataStore` CRUD methods.
  - Owns persistence for query history and saved queries.
- `pkg/backendcomponent/component.go`
  - Symbols: `SQLiteBackendComponent`, `Manifest`, `MountRoutes`, lifecycle methods.
  - Owns backend module boundary for composition hosts.
- `apps/sqlite/src/launcher/module.tsx`
  - Symbol: `sqliteLauncherModule`.
  - Owns launcher registration and app window bootstrap.
- `apps/sqlite/src/components/SqliteWorkspaceWindow.tsx`
  - Symbol: `SqliteWorkspaceWindow`.
  - Owns query workbench UI and API calls.
- `apps/sqlite/src/domain/hypercard/*`
  - Symbols: `runSqliteHypercardQueryIntent`, `handleSqliteQueryIntent`.
  - Owns HyperCard intent contract and bridge behavior.

## Backend Runtime: Config, DB Path Safety, and Migrations

The backend startup path is defensive by design. It does not assume the filesystem is valid, it does not assume flags are coherent, and it does not assume schema state is current. That caution is intentional because app modules are frequently run in many contexts: local dev, launcher composition, CI, and ad-hoc operator invocations.

The backend starts by resolving config from flags + env, then normalizing and validating.

### Config Contract

This section matters because config is where operational intent is translated into runtime behavior. A field that is unclear or weakly validated at config level creates downstream ambiguity in every other layer.

`pkg/sqliteapp/config.go` defines `sqliteapp.Config` with runtime controls:

- DB selection and mode:
  - `DBPath`
  - `ReadOnly`
  - `AutoCreate`
- Execution shape:
  - `DefaultRowLimit`
  - `StatementTimeout`
  - `EnableMultiStatement`
- Policy:
  - `StatementAllowlist`
  - `StatementDenylist`
  - `RedactedColumns`
- Throughput:
  - `RateLimitRequests`
  - `RateLimitWindow`

`Normalize` and `Validate` are non-optional boundaries. New fields should be added there first so behavior is deterministic.

### DB Open and File Safety

SQLite is deceptively simple: "just a file" can become a major source of production incidents when mode, permissions, or path semantics are wrong. The runtime code here is essentially a hardening layer that fails early with actionable errors instead of leaking low-level driver failures later.

`pkg/sqliteapp/runtime.go` enforces strict file behavior before opening SQLite:

- Rejects empty DB path.
- Rejects directory path in place of file.
- In read-only mode:
  - requires existing readable file.
  - rejects `AutoCreate=true` + `ReadOnly=true`.
- In writable mode:
  - ensures file writable if exists.
  - creates file/parent directory only when `AutoCreate=true`.

DSN logic (`buildDSN`) sets:

- `_busy_timeout`
- `_foreign_keys=1`
- `mode=ro` + `_query_only=1` for read-only
- `mode=rwc` + `_journal_mode=WAL` for writable

### Metadata Schema

The metadata schema stores app-operational records (history, saved queries), so migrations must be safe, additive, and idempotent. The migration logic here is written to tolerate partially-upgraded local environments and repeated startup runs.

`pkg/sqliteapp/migrations.go` bootstraps app metadata tables:

- `query_history`
- `saved_queries`
- supporting indexes

It also runs additive compatibility logic (`ensureColumn`) for older schemas. This pattern is important: never rely only on CREATE TABLE for evolving existing deployments.

## Request Lifecycle: Query Path (Detailed)

When a query comes in, several concerns are handled in a strict order: protocol validity, request fairness, policy enforcement, execution, observability, and persistence. Understanding this order is critical for debugging because each phase has distinct failure modes and response categories.

The `POST /query` flow:

```text
HTTP request
  -> QueryHandler.HandleQuery
  -> decodeJSONBody + correlation ID
  -> rate limiter check
  -> QueryExecutor.Execute
     -> validateAndNormalizeRequest
     -> enforceStatementPolicy
     -> with timeout context
     -> ExecContext (mutations) OR QueryContext (reads)
     -> row scan + redaction + payload accounting
     -> metadata envelope (duration, truncation flags, row_count, statement_type)
  -> recordHistory
  -> audit log emit
  -> JSON response
```

### Pseudocode for the Core Path

The pseudocode below intentionally mirrors production control flow. Use it as a checklist during debugging and when reviewing code changes.

```pseudo
function HandleQuery(request):
  require POST
  cid = request.header["X-Request-ID"] or newID("sqlite")
  reqBody = decodeStrictJSON(request.body)
  if rateLimited(): return 429 categorized error

  result, err = executor.Execute(ctx, reqBody, cid)
  if err:
    history.record(status="error", summary=err)
    audit.emit(status="error", category=classify(err))
    return categorized HTTP error

  history.record(status="success", rowCount=result.meta.row_count)
  audit.emit(status="success")
  return 200 result
```

## Query Policy and Guardrails

This is the most security-sensitive part of the app. Even though this module is developer-facing, it still needs strong protection against unsafe statements, runaway workloads, and accidental data leakage through result payloads.

`pkg/sqliteapi/executor.go` is the policy center.

Rules enforced:

- Request shape:
  - SQL required.
  - cannot send both `positional_params` and `named_params`.
  - non-negative `row_limit`, `timeout_ms`.
- Multi-statement:
  - disabled unless server config enables it.
  - client must explicitly set `allow_multi_statement=true` when enabled.
- Statement policy:
  - denylist blocks statement type immediately.
  - allowlist (if non-empty) requires explicit inclusion.
  - read-only mode blocks mutations regardless of other policy.
- Resource caps:
  - effective timeout is min(request timeout, configured max).
  - row cap and payload-byte cap are enforced with explicit truncation metadata.
- Redaction:
  - response column names can be redacted to `"[REDACTED]"`.

The `QueryExecutionMeta` envelope is intentionally rich so UI and HyperCard handlers can make policy-aware decisions.

## HTTP Contract and Error Semantics

The handler surface is small on purpose. Stable, explicit route contracts make launcher composition, frontend integrations, and HyperCard bridges much easier to maintain over time.

Main route surface from `pkg/backendcomponent/component.go`:

- `GET /health`
- `POST /query`
- `GET /history`
- `GET /saved-queries`
- `POST /saved-queries`
- `PUT /saved-queries/{id}`
- `DELETE /saved-queries/{id}`

Error categories (`pkg/sqliteapi/errors.go`):

- `validation`
- `permission`
- `syntax`
- `execution`
- `timeout`

HTTP mappings:

- validation/syntax: `400`
- permission: `403`
- timeout: `504`
- execution: `500`
- throttle path: `429`

Use category values in frontend logic. Avoid parsing text messages for behavior.

## Metadata Stores: History and Saved Query State

These stores are what make the workbench feel like an application rather than a stateless query console. They provide continuity across requests and allow users to iterate safely.

`pkg/sqliteapi/metadata_store.go` persists developer-facing operational data:

- Query history records:
  - normalized parameter JSON.
  - query preview.
  - status, duration, row_count, error summary.
- Saved queries:
  - CRUD operations.
  - stable schema version field for future upgrades.
  - unique-name policy via DB constraint + explicit validation mapping.

Design note: this is app metadata, not your business tables. Keep it isolated in implementation and naming.

## CLI Entry Point and Runtime Wiring

The CLI entrypoint is the composition seam for backend-only execution. It wires all backend layers together in one place and is the quickest path for isolating backend bugs from launcher/frontend complexity.

`cmd/go-go-app-sqlite/main.go` composes all backend layers:

1. `resolveCLIConfig` (env + flags).
2. `sqliteapp.NewRuntime`.
3. `backendcomponent.NewSQLiteBackendComponent`.
4. `Init` then `Start`.
5. Mount routes under `/api/apps/sqlite`.
6. Start `http.Server` with graceful shutdown.

Example command:

```bash
go run ./cmd/go-go-app-sqlite \
  --listen 127.0.0.1:8097 \
  --db-path ./data/dev-sqlite.db \
  --db-auto-create=true \
  --db-read-only=false \
  --statement-denylist ATTACH,DETACH,DROP \
  --rate-limit-requests 30 \
  --rate-limit-window 10s
```

## Frontend Module and Window Composition

The frontend side follows the launcher contract used across go-go-os apps. The point is to keep app UI logic independent while still allowing host-provided API base resolution, window management, and desktop ordering.

The frontend module is in `apps/sqlite/src/launcher/module.tsx`.

Responsibilities:

- Defines manifest (`id`, `name`, icon, launch mode, desktop order).
- Builds window payload (`buildLaunchWindow`).
- Resolves API base via host context.
- Renders `SqliteLauncherAppWindow`.

`apps/sqlite/src/launcher/renderSqliteApp.tsx` routes instance IDs:

- `workspace` instance -> `SqliteWorkspaceWindow`
- unknown instance -> `SqliteUnknownWindow`

`SqliteWorkspaceWindow` is currently the main developer UX:

- SQL editor and parameter mode support.
- results grid with meta display.
- history panel and saved query CRUD.
- optional intent bridge execution path.

## HyperCard Integration Model

HyperCard integration is deliberately structured as a bridge, not a parallel API. That keeps behavior consistent: intent execution should obey the same backend validation and policy constraints as normal UI-triggered queries.

Files:

- `apps/sqlite/src/domain/hypercard/intentContract.ts`
- `apps/sqlite/src/domain/hypercard/intentBridge.ts`
- `apps/sqlite/src/domain/hypercard/runtimeHandlers.ts`

Bridge pattern:

1. Validate intent payload shape.
2. Convert to backend `/query` request.
3. Normalize backend response into intent result envelope.
4. Preserve error categories/correlation IDs when available.

This keeps HyperCard consumers aligned with the same backend policy model as the main UI.

## How This App Composes into go-go-os / wesen-os

`go-go-app-sqlite` is intentionally app-local, but real user workflows run through composed launcher runtime. That means you should always think in two scopes: app correctness in this repo, and composition correctness in `wesen-os`.

`go-go-app-sqlite` is app-local. Composition into the OS host happens in `wesen-os`:

- Backend adapter module:
  - `wesen-os/pkg/sqlite/module.go`
- Host module registration:
  - `wesen-os/cmd/wesen-os-launcher/main.go`
- Launcher app registry:
  - `wesen-os/apps/os-launcher/src/app/modules.tsx`

App ID consistency is a hard invariant:

- backend app ID (`sqlite`)
- frontend manifest ID (`sqlite`)
- API base path (`/api/apps/sqlite`)

If those diverge, discoverability and routing fail.

## SQLite HyperCard VM Stack and Intent Runner

The sqlite app now has two complementary user surfaces: the existing React workspace window and a VM-powered HyperCard stack. This design is intentional. The workspace remains the full-featured operator UI, while the card stack offers a focused, scriptable, event-driven flow that is ideal for guided tasks (run query, inspect result, seed sample data).

The launch flow is integrated into existing desktop behavior instead of inventing new shell primitives. Right-clicking the sqlite icon and selecting `Open New` issues `icon.open-new.sqlite`; sqlite contributions handle that command and open a card window bound to the sqlite stack home card.

### Runtime pieces and ownership

- Stack definition:
  - `apps/sqlite/src/domain/stack.ts`
- VM bundle source:
  - `apps/sqlite/src/domain/pluginBundle.vm.js`
- Bundle raw import:
  - `apps/sqlite/src/domain/pluginBundle.ts`
- Launcher contributions and adapter:
  - `apps/sqlite/src/launcher/module.tsx`
- Queue/reducer state model:
  - `apps/sqlite/src/domain/hypercard/runtimeState.ts`
- Async execution bridge:
  - `apps/sqlite/src/components/SqliteHypercardIntentRunner.tsx`

### Why an intent queue is required

VM card handlers emit intents synchronously; they do not perform direct async HTTP requests. That means a card click can express _what_ should happen (`sqlite/query.execute`, `sqlite/seed.execute`), but host code must perform _how_ it happens (call backend, normalize response, update domain state).

The queue model solves this cleanly:

1. VM card emits runtime domain intent.
2. Runtime routing dispatches Redux action (`sqlite/query.execute` or `sqlite/seed.execute`).
3. sqlite reducer enqueues a typed job.
4. runner claims exactly one queued job (ownership guard via `runnerId`).
5. runner calls backend through `handleSqliteQueryIntent`.
6. reducer stores success/failure into `app_sqlite.hypercard`.
7. cards re-render from projected domain state.

Pseudocode:

```pseudo
on redux action "sqlite/query.execute":
  enqueue(job(kind=query, status=queued))

runner loop:
  job = claimFirstQueuedJob(runnerId)
  result = execute(job)
  if result.ok: complete(job)
  else: fail(job)
```

### Seed behavior

There is no dedicated `/seed` backend endpoint. The seed card runs an ordered statement pipeline through existing `/query` requests. This keeps backend surface area small while still enabling deterministic local bootstrapping for demos and onboarding.

Default profile (`people-v1`) in the runner:

- create table if missing
- clear existing rows
- insert sample rows

Each step records status and optional correlation ID in `lastSeedReport`.

### Desktop launch behavior summary

- `icon.open.sqlite` -> existing sqlite workspace window.
- `icon.open-new.sqlite` -> sqlite HyperCard home card window.
- `sqlite.card.open.<cardId>` -> direct open of specific sqlite card.

### Practical debugging tips for this path

- If cards open but do nothing:
  - check that `app_sqlite.hypercard.queue` grows after click.
- If queue grows but never drains:
  - verify runner is mounted (workspace or card adapter).
- If runner drains but cards do not update:
  - inspect `app_sqlite.hypercard.lastQueryResult` / `lastQueryError` shape.
- If seed fails unexpectedly:
  - inspect step-level report entries and correlation IDs in `lastSeedReport`.

## Practical Extension Recipes

Use these recipes when changing behavior. They are structured to preserve layering: contract first, behavior second, exposure third, then tests and UI.

### Add a new endpoint (example: schema browser route)

This is the safest pattern for feature growth. Start with contracts and backend internals, then expose through handlers, then consume from UI. Avoid starting in UI first; otherwise contracts drift and rework increases.

1. Add contract types in `pkg/sqliteapi/contracts.go`.
2. Add execution/storage logic in `pkg/sqliteapi` package.
3. Add handler method in `pkg/sqliteapi/handler.go`.
4. Mount route in `pkg/backendcomponent/component.go`.
5. Add backend tests in `pkg/sqliteapi/handler_test.go`.
6. Add UI query/section in `SqliteWorkspaceWindow.tsx`.

Pseudocode:

```pseudo
define SchemaListResponse
handler.HandleSchema -> store.ListSchema()
mount "/schema" route
frontend fetch("/schema") and render tree
```

### Add new policy control

Policy changes are cross-cutting by nature. Keep the sequence strict so behavior remains explicit and reviewable.

1. Add config field to `sqliteapp.Config`.
2. Add default/normalize/validate logic.
3. Thread field through CLI/env parsing.
4. Use it in executor/handler.
5. Add unit + integration tests.

## End-to-End Developer Workflow

Treat this as your default loop while implementing features. Run backend tests often, keep frontend type/build healthy, and verify the API contract with real HTTP calls before moving to launcher composition testing.

### Backend checks

```bash
cd go-go-app-sqlite
go test ./...
```

### Frontend checks

```bash
cd go-go-app-sqlite
pnpm install
pnpm run typecheck
pnpm run build -w apps/sqlite
```

### API sanity checks

```bash
curl -sS -X POST http://127.0.0.1:8097/api/apps/sqlite/query \
  -H 'content-type: application/json' \
  -d '{"sql":"SELECT 1 AS one"}' | jq

curl -sS http://127.0.0.1:8097/api/apps/sqlite/history?limit=10 | jq
curl -sS http://127.0.0.1:8097/api/apps/sqlite/saved-queries | jq
```

## Troubleshooting

Use this table when symptoms appear in logs or UI and you need a fast first diagnosis path. In most cases, inspecting config mode and execution metadata (`meta.*`) resolves the issue quickly.

| Problem | Cause | Solution |
|---|---|---|
| Startup fails with read-only/auto-create error | invalid config combination | set `--db-read-only=true` only with existing DB and `--db-auto-create=false` |
| `query execution failed` on mutation in read-only mode | runtime read-only policy | use writable DB mode or restrict UI to SELECT-only operations |
| `statement type "X" is denied` | denylist/allowlist policy hit | adjust `--statement-allowlist` / `--statement-denylist` |
| Query returns fewer rows than expected | row limit or payload cap truncation | inspect `meta.truncated*` fields and raise limits intentionally |
| Saved query name rejected | unique-name constraint | rename query or update existing record by ID |
| HyperCard intent result has `ok=false` with validation | intent payload shape mismatch | verify `SqliteQueryIntentPayload` contract and row limit |

## See Also

If you need deeper context after this page, start with the files below in order; they mirror the runtime layering from configuration through UI.

- `cmd/go-go-app-sqlite/main.go`
- `pkg/sqliteapp/config.go`
- `pkg/sqliteapp/runtime.go`
- `pkg/sqliteapi/executor.go`
- `pkg/sqliteapi/handler.go`
- `pkg/backendcomponent/component.go`
- `apps/sqlite/src/launcher/module.tsx`
- `apps/sqlite/src/components/SqliteWorkspaceWindow.tsx`
