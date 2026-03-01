import {
  formatAppKey,
  type LaunchableAppModule,
  type LaunchReason,
  type LauncherHostContext,
} from '@hypercard/desktop-os';
import {
  type OpenWindowPayload,
  type WindowInstance,
} from '@hypercard/engine/desktop-core';
import {
  type DesktopCommandHandler,
  type DesktopContribution,
  type WindowContentAdapter,
} from '@hypercard/engine/desktop-react';
import { PluginCardSessionHost } from '@hypercard/hypercard-runtime';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { SQLITE_STACK } from '../domain/stack';
import { SQLITE_WORKSPACE_INSTANCE, SqliteLauncherAppWindow } from './renderSqliteApp';

const SQLITE_APP_ID = 'sqlite';
const SQLITE_API_BASE_PREFIX_FALLBACK = '/api/apps/sqlite';
const SQLITE_CARD_COMMAND_PREFIX = 'sqlite.card.open.';

const launcherStateSlice = createSlice({
  name: 'sqliteLauncher',
  initialState: {
    launchCount: 0,
    lastLaunchReason: null as LaunchReason | null,
  },
  reducers: {
    markLaunched(state, action: PayloadAction<LaunchReason>) {
      state.launchCount += 1;
      state.lastLaunchReason = action.payload;
    },
  },
});

function buildSqliteLaunchWindowPayload(reason: LaunchReason): OpenWindowPayload {
  const instanceId = SQLITE_WORKSPACE_INSTANCE;
  return {
    id: `window:${SQLITE_APP_ID}:${instanceId}`,
    title: 'SQLite',
    icon: '🗄️',
    bounds: { x: 220, y: 68, w: 920, h: 620 },
    content: {
      kind: 'app',
      appKey: formatAppKey(SQLITE_APP_ID, instanceId),
    },
    dedupeKey: reason === 'startup' ? `${SQLITE_APP_ID}:startup` : `${SQLITE_APP_ID}:workspace`,
  };
}

function nextCardSessionId(cardId: string): string {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
  return `sqlite-card-${cardId}-${suffix}`;
}

function resolveCardBounds(cardId: string): OpenWindowPayload['bounds'] {
  const seed = [...cardId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    x: 180 + (seed % 5) * 26,
    y: 36 + (seed % 4) * 22,
    w: 860,
    h: 620,
  };
}

export function buildSqliteCardWindowPayload(
  cardId: string,
  options?: { dedupe?: boolean },
): OpenWindowPayload | null {
  const card = SQLITE_STACK.cards[cardId];
  if (!card) {
    return null;
  }

  const sessionId = nextCardSessionId(cardId);
  return {
    id: `window:${SQLITE_APP_ID}:card:${cardId}:${sessionId}`,
    title: card.title ?? cardId,
    icon: card.icon ?? 'DB',
    bounds: resolveCardBounds(cardId),
    content: {
      kind: 'card',
      card: {
        stackId: SQLITE_STACK.id,
        cardId,
        cardSessionId: sessionId,
      },
    },
    dedupeKey: options?.dedupe ? `${SQLITE_APP_ID}:card:${cardId}` : undefined,
  };
}

function createSqliteCardWindowAdapter(): WindowContentAdapter {
  return {
    id: 'sqlite.hypercard.card-adapter',
    canRender: (window: WindowInstance) =>
      window.content.kind === 'card' &&
      window.content.card?.stackId === SQLITE_STACK.id,
    render: (window: WindowInstance, ctx) => {
      const card = window.content.kind === 'card' ? window.content.card : undefined;
      if (!card?.cardSessionId) {
        return null;
      }
      return (
        <PluginCardSessionHost
          windowId={window.id}
          sessionId={card.cardSessionId}
          stack={SQLITE_STACK}
          mode={ctx.mode}
        />
      );
    },
  };
}

function parseCardIdFromCommand(commandId: string): string | null {
  if (!commandId.startsWith(SQLITE_CARD_COMMAND_PREFIX)) {
    return null;
  }
  const cardId = commandId.slice(SQLITE_CARD_COMMAND_PREFIX.length).trim();
  return cardId.length > 0 ? cardId : null;
}

function createSqliteCommandHandlers(hostContext: LauncherHostContext): DesktopCommandHandler[] {
  return [
    {
      id: 'sqlite.icon.open-new',
      priority: 120,
      matches: (commandId) => commandId === `icon.open-new.${SQLITE_APP_ID}`,
      run: () => {
        const payload = buildSqliteCardWindowPayload(SQLITE_STACK.homeCard);
        if (!payload) {
          return 'pass';
        }
        hostContext.openWindow(payload);
        return 'handled';
      },
    },
    {
      id: 'sqlite.card.open',
      priority: 110,
      matches: (commandId) => parseCardIdFromCommand(commandId) !== null,
      run: (commandId) => {
        const cardId = parseCardIdFromCommand(commandId);
        if (!cardId) {
          return 'pass';
        }
        const payload = buildSqliteCardWindowPayload(cardId);
        if (!payload) {
          return 'pass';
        }
        hostContext.openWindow(payload);
        return 'handled';
      },
    },
  ];
}

export function createSqliteContributions(hostContext: LauncherHostContext): DesktopContribution[] {
  return [
    {
      id: 'sqlite.hypercard',
      commands: createSqliteCommandHandlers(hostContext),
      windowContentAdapters: [createSqliteCardWindowAdapter()],
    },
  ];
}

export const sqliteLauncherModule: LaunchableAppModule = {
  manifest: {
    id: SQLITE_APP_ID,
    name: 'SQLite',
    icon: '🗄️',
    launch: { mode: 'window' },
    desktop: {
      order: 30,
    },
  },
  state: {
    stateKey: 'app_sqlite',
    reducer: launcherStateSlice.reducer,
  },
  buildLaunchWindow: (ctx, reason) => {
    ctx.dispatch(launcherStateSlice.actions.markLaunched(reason));
    return buildSqliteLaunchWindowPayload(reason);
  },
  createContributions: (ctx) => createSqliteContributions(ctx),
  renderWindow: ({ instanceId, ctx }): ReactNode => {
    const apiBasePrefix =
      ctx.resolveApiBase?.(SQLITE_APP_ID) ??
      ctx.resolveWsBase?.(SQLITE_APP_ID)?.replace(/\/ws$/, '') ??
      SQLITE_API_BASE_PREFIX_FALLBACK;

    return <SqliteLauncherAppWindow instanceId={instanceId} apiBasePrefix={apiBasePrefix} />;
  },
};
