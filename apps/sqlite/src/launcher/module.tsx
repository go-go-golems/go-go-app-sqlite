import { formatAppKey, type LaunchableAppModule, type LaunchReason } from '@hypercard/desktop-os';
import type { OpenWindowPayload } from '@hypercard/engine/desktop-core';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { SQLITE_WORKSPACE_INSTANCE, SqliteLauncherAppWindow } from './renderSqliteApp';

const SQLITE_APP_ID = 'sqlite';
const SQLITE_API_BASE_PREFIX_FALLBACK = '/api/apps/sqlite';

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
  renderWindow: ({ instanceId, ctx }): ReactNode => {
    const apiBasePrefix =
      ctx.resolveApiBase?.(SQLITE_APP_ID) ??
      ctx.resolveWsBase?.(SQLITE_APP_ID)?.replace(/\/ws$/, '') ??
      SQLITE_API_BASE_PREFIX_FALLBACK;

    return <SqliteLauncherAppWindow instanceId={instanceId} apiBasePrefix={apiBasePrefix} />;
  },
};
