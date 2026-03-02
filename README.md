# go-go-app-sqlite

SQLite app workspace for the go-go / wesen-os stack.

## Scope

- Go backend packages and command scaffolding for SQLite app services.
- Frontend launcher module package `@hypercard/sqlite`.
- Composition hooks into `wesen-os` launcher via `@hypercard/sqlite/launcher`.

## Layout

- `cmd/go-go-app-sqlite`: minimal CLI scaffold.
- `apps/sqlite`: frontend launcher module and window rendering.
- `pkg/`: backend packages (implemented in later phases).

## Frontend package exports

`apps/sqlite/package.json` exports:

- `@hypercard/sqlite`
- `@hypercard/sqlite/launcher`

## Development

```bash
# Go checks
GOWORK=off go test ./...

# Frontend typecheck/build (from repository root)
npm install
npm run typecheck
npm run build -w apps/sqlite
```
