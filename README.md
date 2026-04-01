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
npm run build:federation -w apps/sqlite
```

## Federation Release

The sqlite frontend is published as a federated remote artifact in addition to
the normal local build output.

The release artifact is built with:

```bash
npm run build:federation -w apps/sqlite
```

That produces:

- `apps/sqlite/dist-federation/mf-manifest.json`
- `apps/sqlite/dist-federation/sqlite-host-contract.js`

The GitHub Actions workflow:

- `.github/workflows/publish-federation-remote.yml`

handles the hosted release path:

1. rewrite `@go-go-golems/os-*` dependencies to a published platform version
2. build `apps/sqlite/dist-federation`
3. publish immutable remote files to object storage
4. compute the remote manifest URL
5. open a GitOps PR against the K3s repo

### Required Repository Configuration

Secrets:

- `HETZNER_OBJECT_STORAGE_ACCESS_KEY_ID`
- `HETZNER_OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `HETZNER_OBJECT_STORAGE_BUCKET`
- `HETZNER_OBJECT_STORAGE_ENDPOINT`
- `HETZNER_OBJECT_STORAGE_REGION`
- `GITOPS_PR_TOKEN`
- `K3S_REPO_READ_TOKEN`

Variables:

- `SQLITE_FEDERATION_PUBLIC_BASE_URL`
- `GO_GO_OS_PLATFORM_VERSION`

### Published Remote Shape

Successful releases publish immutable files under:

```text
https://<bucket-host>/remotes/sqlite/versions/sha-<short-sha>/
```

with the manifest at:

```text
https://<bucket-host>/remotes/sqlite/versions/sha-<short-sha>/mf-manifest.json
```
