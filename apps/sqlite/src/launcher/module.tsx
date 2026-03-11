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
import { RuntimeSurfaceSessionHost } from '@hypercard/hypercard-runtime';
import type { ReactNode } from 'react';
import { SqliteHypercardIntentRunner } from '../components/SqliteHypercardIntentRunner';
import {
  sqliteLauncherActions,
  sqliteLauncherSlice,
} from '../domain/hypercard/runtimeState';
import { SQLITE_STACK } from '../domain/stack';
import { SQLITE_WORKSPACE_INSTANCE, SqliteLauncherAppWindow } from './renderSqliteApp';

const SQLITE_APP_ID = 'sqlite';
const SQLITE_API_BASE_PREFIX_FALLBACK = '/api/apps/sqlite';
const SQLITE_CARD_COMMAND_PREFIX = 'sqlite.card.open.';

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
  surfaceId: string,
  options?: { dedupe?: boolean },
): OpenWindowPayload | null {
  const surface = SQLITE_STACK.surfaces[surfaceId];
  if (!surface) {
    return null;
  }

  const sessionId = nextCardSessionId(surfaceId);
  return {
    id: `window:${SQLITE_APP_ID}:surface:${surfaceId}:${sessionId}`,
    title: surface.title ?? surfaceId,
    icon: surface.icon ?? 'DB',
    bounds: resolveCardBounds(surfaceId),
    content: {
      kind: 'surface',
      surface: {
        bundleId: SQLITE_STACK.id,
        surfaceId,
        surfaceSessionId: sessionId,
      },
    },
    dedupeKey: options?.dedupe ? `${SQLITE_APP_ID}:surface:${surfaceId}` : undefined,
  };
}

function createSqliteCardWindowAdapter(hostContext: LauncherHostContext): WindowContentAdapter {
  const apiBasePrefix = hostContext.resolveApiBase(SQLITE_APP_ID) || SQLITE_API_BASE_PREFIX_FALLBACK;
  return {
    id: 'sqlite.hypercard.card-adapter',
    canRender: (window: WindowInstance) =>
      window.content.kind === 'surface' &&
      window.content.surface?.bundleId === SQLITE_STACK.id,
    render: (window: WindowInstance, ctx) => {
      const card = window.content.kind === 'surface' ? window.content.surface : undefined;
      if (!card?.surfaceSessionId) {
        return null;
      }
      return (
        <>
          <SqliteHypercardIntentRunner apiBasePrefix={apiBasePrefix} />
          <RuntimeSurfaceSessionHost
            windowId={window.id}
            sessionId={card.surfaceSessionId}
            bundle={SQLITE_STACK}
            mode={ctx.mode}
          />
        </>
      );
    },
  };
}

function parseCardIdFromCommand(commandId: string): string | null {
  if (!commandId.startsWith(SQLITE_CARD_COMMAND_PREFIX)) {
    return null;
  }
  const surfaceId = commandId.slice(SQLITE_CARD_COMMAND_PREFIX.length).trim();
  return surfaceId.length > 0 ? surfaceId : null;
}

function createSqliteCommandHandlers(hostContext: LauncherHostContext): DesktopCommandHandler[] {
  return [
    {
      id: 'sqlite.icon.open-new',
      priority: 120,
      matches: (commandId) => commandId === `icon.open-new.${SQLITE_APP_ID}`,
      run: () => {
        const payload = buildSqliteCardWindowPayload(SQLITE_STACK.homeSurface);
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
        const surfaceId = parseCardIdFromCommand(commandId);
        if (!surfaceId) {
          return 'pass';
        }
        const payload = buildSqliteCardWindowPayload(surfaceId);
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
      menus: [
        {
          id: 'sqlite',
          label: 'SQLite',
          items: [
            {
              id: 'sqlite-open-workspace',
              label: 'Open Workspace',
              commandId: `icon.open.${SQLITE_APP_ID}`,
            },
            {
              id: 'sqlite-open-home-card',
              label: 'Open Card Home',
              commandId: `${SQLITE_CARD_COMMAND_PREFIX}${SQLITE_STACK.homeSurface}`,
            },
          ],
        },
        {
          id: 'sqlite-cards',
          label: 'SQLite Cards',
          items: Object.keys(SQLITE_STACK.surfaces).map((surfaceId) => ({
            id: `sqlite-open-surface-${surfaceId}`,
            label: `${SQLITE_STACK.surfaces[surfaceId].icon ?? ''} ${SQLITE_STACK.surfaces[surfaceId].title ?? surfaceId}`.trim(),
            commandId: `${SQLITE_CARD_COMMAND_PREFIX}${surfaceId}`,
          })),
        },
      ],
      commands: createSqliteCommandHandlers(hostContext),
      windowContentAdapters: [createSqliteCardWindowAdapter(hostContext)],
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
    reducer: sqliteLauncherSlice.reducer,
  },
  buildLaunchWindow: (ctx, reason) => {
    ctx.dispatch(sqliteLauncherActions.markLaunched(reason));
    return buildSqliteLaunchWindowPayload(reason);
  },
  createContributions: (ctx) => createSqliteContributions(ctx),
  renderWindow: ({ instanceId, ctx }): ReactNode => {
    const apiBasePrefix =
      ctx.resolveApiBase?.(SQLITE_APP_ID) ??
      ctx.resolveWsBase?.(SQLITE_APP_ID)?.replace(/\/ws$/, '') ??
      SQLITE_API_BASE_PREFIX_FALLBACK;

    return (
      <>
        <SqliteHypercardIntentRunner apiBasePrefix={apiBasePrefix} />
        <SqliteLauncherAppWindow instanceId={instanceId} apiBasePrefix={apiBasePrefix} />
      </>
    );
  },
};
