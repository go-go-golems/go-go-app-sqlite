# go-go-app-sqlite

SQLite app workspace for the go-go / wesen-os stack.

## Scope

- Go backend packages and command scaffolding for SQLite app services.
- Frontend launcher module package `@go-go-golems/sqlite`.
- Composition hooks into `wesen-os` launcher via `@go-go-golems/sqlite/launcher`.

## Layout

- `cmd/go-go-app-sqlite`: minimal CLI scaffold.
- `apps/sqlite`: frontend launcher module and window rendering.
- `pkg/`: backend packages (implemented in later phases).

## Frontend package exports

`apps/sqlite/package.json` exports:

- `@go-go-golems/sqlite`
- `@go-go-golems/sqlite/launcher`

## Development

```bash
# Go checks
GOWORK=off go test ./...

# Frontend typecheck/build (from repository root)
npm install
npm run typecheck
npm run build -w apps/sqlite
```
