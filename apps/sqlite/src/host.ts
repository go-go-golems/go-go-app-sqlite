import type { FederatedAppHostContract } from '@go-go-golems/os-shell';
import { sqliteLauncherSlice } from './domain/hypercard/runtimeState';
import { SQLITE_STACK } from './domain/stack';
import { sqliteLauncherModule } from './launcher/module';

export const sqliteSharedReducers = {
  app_sqlite: sqliteLauncherSlice.reducer,
};

export const sqliteRuntimeBundles = [SQLITE_STACK] as const;

export const sqliteHostContract = {
  remoteId: 'sqlite',
  launcherModule: sqliteLauncherModule,
  sharedReducers: sqliteSharedReducers,
  runtimeBundles: sqliteRuntimeBundles,
} satisfies FederatedAppHostContract;
