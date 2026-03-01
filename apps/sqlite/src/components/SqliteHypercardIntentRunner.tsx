import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { handleSqliteQueryIntent } from '../domain/hypercard/runtimeHandlers';
import {
  selectHypercardJobByID,
  selectNextQueuedHypercardJob,
  sqliteLauncherActions,
  type SqliteHypercardErrorView,
  type SqliteSeedReport,
  type SqliteSeedStepReport,
} from '../domain/hypercard/runtimeState';

interface SqliteHypercardIntentRunnerProps {
  apiBasePrefix: string;
}

interface SeedStatement {
  label: string;
  sql: string;
}

function runnerInstanceID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `runner-${globalThis.crypto.randomUUID()}`;
  }
  return `runner-${Date.now()}-${Math.round(Math.random() * 10_000)}`;
}

function resolveSeedStatements(profile: string): SeedStatement[] {
  if (profile === 'people-v1') {
    return [
      {
        label: 'create-table',
        sql: [
          'CREATE TABLE IF NOT EXISTS people (',
          '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
          '  name TEXT NOT NULL,',
          '  email TEXT NOT NULL,',
          '  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
          ')',
        ].join('\n'),
      },
      { label: 'clear-table', sql: 'DELETE FROM people' },
      {
        label: 'insert-alice',
        sql: "INSERT INTO people (name, email) VALUES ('Alice', 'alice@example.com')",
      },
      {
        label: 'insert-bob',
        sql: "INSERT INTO people (name, email) VALUES ('Bob', 'bob@example.com')",
      },
      {
        label: 'insert-charlie',
        sql: "INSERT INTO people (name, email) VALUES ('Charlie', 'charlie@example.com')",
      },
    ];
  }

  return [
    {
      label: 'unsupported-profile',
      sql: `SELECT 'Unknown seed profile ${profile.replace(/'/g, "''")}' as message`,
    },
  ];
}

function buildExecutionError(message: string, category: SqliteHypercardErrorView['category'] = 'execution'): SqliteHypercardErrorView {
  return {
    category,
    message,
  };
}

async function runSeedProfile(
  apiBasePrefix: string,
  profile: string,
): Promise<{ ok: true; report: SqliteSeedReport } | { ok: false; error: SqliteHypercardErrorView; report: SqliteSeedReport }> {
  const startedAt = new Date().toISOString();
  const statements = resolveSeedStatements(profile);
  const steps: SqliteSeedStepReport[] = [];

  for (const statement of statements) {
    const result = await handleSqliteQueryIntent(
      { apiBasePrefix },
      { sql: statement.sql, rowLimit: 10 },
    );
    if (!result.ok) {
      steps.push({
        label: statement.label,
        status: 'error',
        correlationId: result.error.correlationId,
        message: result.error.message,
      });
      const report: SqliteSeedReport = {
        profile,
        startedAt,
        completedAt: new Date().toISOString(),
        steps,
      };
      return {
        ok: false,
        error: {
          category: result.error.category,
          message: result.error.message,
          correlationId: result.error.correlationId,
        },
        report,
      };
    }
    steps.push({
      label: statement.label,
      status: 'ok',
      correlationId: result.data.meta.correlationId,
    });
  }

  return {
    ok: true,
    report: {
      profile,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
    },
  };
}

export function SqliteHypercardIntentRunner({ apiBasePrefix }: SqliteHypercardIntentRunnerProps) {
  const dispatch = useDispatch();
  const store = useStore();
  const runnerIDRef = useRef<string>(runnerInstanceID());
  const runnerID = runnerIDRef.current;
  const nextJob = useSelector(selectNextQueuedHypercardJob);
  const nextJobID = nextJob?.id ?? null;
  const apiBase = useMemo(
    () => (apiBasePrefix.endsWith('/') ? apiBasePrefix.slice(0, -1) : apiBasePrefix),
    [apiBasePrefix],
  );

  useEffect(() => {
    if (!nextJobID) {
      return;
    }

    dispatch(sqliteLauncherActions.markHypercardJobRunning({ jobId: nextJobID, runnerId: runnerID }));
    const claimed = selectHypercardJobByID(store.getState(), nextJobID);
    if (!claimed || claimed.status !== 'running' || claimed.runningBy !== runnerID) {
      return;
    }

    let finished = false;

    const run = async () => {
      if (claimed.kind === 'query') {
        const result = await handleSqliteQueryIntent(
          {
            apiBasePrefix: apiBase,
          },
          claimed.payload,
        );
        if (result.ok) {
          dispatch(
            sqliteLauncherActions.completeHypercardQueryJob({
              jobId: claimed.id,
              runnerId: runnerID,
              result: result.data,
            }),
          );
        } else {
          dispatch(
            sqliteLauncherActions.failHypercardJob({
              jobId: claimed.id,
              runnerId: runnerID,
              error: {
                category: result.error.category,
                message: result.error.message,
                correlationId: result.error.correlationId,
              },
            }),
          );
        }
        finished = true;
        return;
      }

      const profile = claimed.payload.profile ?? 'people-v1';
      const seedResult = await runSeedProfile(apiBase, profile);
      if (seedResult.ok) {
        dispatch(
          sqliteLauncherActions.completeHypercardSeedJob({
            jobId: claimed.id,
            runnerId: runnerID,
            report: seedResult.report,
          }),
        );
      } else {
        dispatch(
          sqliteLauncherActions.failHypercardJob({
            jobId: claimed.id,
            runnerId: runnerID,
            error: seedResult.error,
            seedReport: seedResult.report,
          }),
        );
      }
      finished = true;
    };

    void run().catch((error: unknown) => {
      dispatch(
        sqliteLauncherActions.failHypercardJob({
          jobId: nextJobID,
          runnerId: runnerID,
          error: buildExecutionError(error instanceof Error ? error.message : String(error)),
        }),
      );
      finished = true;
    });

    return () => {
      if (finished) {
        return;
      }
      dispatch(
        sqliteLauncherActions.failHypercardJob({
          jobId: nextJobID,
          runnerId: runnerID,
          error: buildExecutionError('sqlite hypercard runner unmounted before completing active job'),
        }),
      );
    };
  }, [apiBase, dispatch, nextJobID, runnerID, store]);

  return null;
}
