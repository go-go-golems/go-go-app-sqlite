import type { LauncherHostContext } from '@hypercard/desktop-os';
import type { DesktopCommandContext } from '@hypercard/engine/desktop-react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hypercard/hypercard-runtime', () => ({
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
    openCardWindow: vi.fn(),
    closeWindow: vi.fn(),
  };
}

describe('sqlite launcher contributions', () => {
  it('builds sqlite card payload for known cards', () => {
    const payload = buildSqliteCardWindowPayload('query');
    expect(payload).not.toBeNull();
    if (!payload || payload.content.kind !== 'card' || !payload.content.card) return;
    expect(payload.content.card.stackId).toBe(SQLITE_STACK.id);
    expect(payload.content.card.cardId).toBe('query');
    expect(payload.dedupeKey).toBeUndefined();
  });

  it('returns null for unknown card payload requests', () => {
    expect(buildSqliteCardWindowPayload('missing-card')).toBeNull();
  });

  it('handles icon.open-new.sqlite by opening sqlite home card window', () => {
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
    expect(payload.content.kind).toBe('card');
    expect(payload.content.card.cardId).toBe(SQLITE_STACK.homeCard);
  });

  it('handles sqlite.card.open.<cardId> commands', () => {
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
    expect(payload.content.card.cardId).toBe('results');
  });

  it('registers card adapter for sqlite stack card windows', () => {
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
        kind: 'card',
        card: { stackId: SQLITE_STACK.id, cardId: 'home', cardSessionId: 'session-1' },
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
        kind: 'card',
        card: { stackId: 'other', cardId: 'home', cardSessionId: 'session-2' },
      },
    } as any, { mode: 'interactive' } as any);

    expect(canRenderSqliteCard).toBe(true);
    expect(canRenderNonSqliteCard).toBe(false);
  });
});
