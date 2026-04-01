import type { FederatedAppHostContract } from '@go-go-golems/os-shell';
import { SQLITE_STACK } from './domain/stack';
import { sqliteLauncherModule } from './launcher/module';

export const sqliteRuntimeBundles = [SQLITE_STACK] as const;

export const sqliteHostContract = {
  remoteId: 'sqlite',
  launcherModule: sqliteLauncherModule,
  runtimeBundles: sqliteRuntimeBundles,
} satisfies FederatedAppHostContract;
