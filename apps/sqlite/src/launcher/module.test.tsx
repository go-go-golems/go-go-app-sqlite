import type { LauncherHostContext } from '@go-go-golems/os-shell';
import type { DesktopCommandContext } from '@go-go-golems/os-core/desktop-react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@go-go-golems/os-scripting', () => ({
  RuntimeSurfaceSessionHost: () => null,
}));
vi.mock('../components/SqliteHypercardIntentRunner', () => ({
  SqliteHypercardIntentRunner: () => null,
}));

import { SQLITE_STACK } from '../domain/stack';
import { buildSqliteCardWindowPayload, createSqliteContributions } from './module';

function createHostContext(): LauncherHostContext {
  return {
    dispatch: vi.fn(),
    getState: vi.fn(() => ({})),
    openWindow: vi.fn(),
    closeWindow: vi.fn(),
    resolveApiBase: vi.fn(() => '/api/apps/sqlite'),
    resolveWsBase: vi.fn(() => '/api/apps/sqlite/ws'),
  };
}

function createCommandContext(): DesktopCommandContext {
  return {
    dispatch: vi.fn(),
    getState: vi.fn(() => ({})),
    focusedWindowId: null,
    openSurfaceWindow: vi.fn(),
    closeWindow: vi.fn(),
  };
}

describe('sqlite launcher contributions', () => {
  it('builds sqlite surface payload for known surfaces', () => {
    const payload = buildSqliteCardWindowPayload('query');
    expect(payload).not.toBeNull();
    if (!payload || payload.content.kind !== 'surface' || !payload.content.surface) return;
    expect(payload.content.surface.bundleId).toBe(SQLITE_STACK.id);
    expect(payload.content.surface.surfaceId).toBe('query');
    expect(payload.dedupeKey).toBeUndefined();
  });

  it('returns null for unknown surface payload requests', () => {
    expect(buildSqliteCardWindowPayload('missing-card')).toBeNull();
  });

  it('handles icon.open-new.sqlite by opening sqlite home surface window', () => {
    const host = createHostContext();
    const commandCtx = createCommandContext();
    const contributions = createSqliteContributions(host);
    const handlers = contributions.flatMap((item) => item.commands ?? []);
    const handler = handlers.find((candidate) => candidate.matches('icon.open-new.sqlite'));
    expect(handler).toBeTruthy();
    if (!handler) return;

    const result = handler.run('icon.open-new.sqlite', commandCtx, { source: 'icon' });
    expect(result).toBe('handled');
    expect(host.openWindow).toHaveBeenCalledTimes(1);
    const payload = (host.openWindow as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.content.kind).toBe('surface');
    expect(payload.content.surface.surfaceId).toBe(SQLITE_STACK.homeSurface);
  });

  it('handles sqlite.card.open.<surfaceId> commands', () => {
    const host = createHostContext();
    const commandCtx = createCommandContext();
    const contributions = createSqliteContributions(host);
    const handlers = contributions.flatMap((item) => item.commands ?? []);
    const handler = handlers.find((candidate) => candidate.matches('sqlite.card.open.results'));
    expect(handler).toBeTruthy();
    if (!handler) return;

    const result = handler.run('sqlite.card.open.results', commandCtx, { source: 'menu' });
    expect(result).toBe('handled');
    expect(host.openWindow).toHaveBeenCalledTimes(1);
    const payload = (host.openWindow as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.content.surface.surfaceId).toBe('results');
  });

  it('registers surface adapter for sqlite bundle surface windows', () => {
    const host = createHostContext();
    const contributions = createSqliteContributions(host);
    const adapters = contributions.flatMap((item) => item.windowContentAdapters ?? []);
    expect(adapters.length).toBeGreaterThan(0);
    const adapter = adapters[0];

    const canRenderSqliteCard = adapter.canRender({
      id: 'window:1',
      title: 'x',
      icon: 'x',
      z: 1,
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      isDialog: false,
      isResizable: true,
      content: {
        kind: 'surface',
        surface: { bundleId: SQLITE_STACK.id, surfaceId: 'home', surfaceSessionId: 'session-1' },
      },
    } as any, { mode: 'interactive' } as any);

    const canRenderNonSqliteCard = adapter.canRender({
      id: 'window:2',
      title: 'x',
      icon: 'x',
      z: 2,
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      isDialog: false,
      isResizable: true,
      content: {
        kind: 'surface',
        surface: { bundleId: 'other', surfaceId: 'home', surfaceSessionId: 'session-2' },
      },
    } as any, { mode: 'interactive' } as any);

    expect(canRenderSqliteCard).toBe(true);
    expect(canRenderNonSqliteCard).toBe(false);
  });
});
