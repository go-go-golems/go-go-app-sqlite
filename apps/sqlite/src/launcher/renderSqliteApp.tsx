import type { ReactNode } from 'react';
import { SqliteUnknownWindow } from '../components/SqliteUnknownWindow';
import { SqliteWorkspaceWindow } from '../components/SqliteWorkspaceWindow';

export const SQLITE_WORKSPACE_INSTANCE = 'workspace';

export interface SqliteLauncherAppWindowProps {
  instanceId: string;
  apiBasePrefix: string;
}

export function SqliteLauncherAppWindow({ instanceId, apiBasePrefix }: SqliteLauncherAppWindowProps): ReactNode {
  if (instanceId === SQLITE_WORKSPACE_INSTANCE) {
    return <SqliteWorkspaceWindow apiBasePrefix={apiBasePrefix} />;
  }

  return <SqliteUnknownWindow instanceId={instanceId} />;
}
