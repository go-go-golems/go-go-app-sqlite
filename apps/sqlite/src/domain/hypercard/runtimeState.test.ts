import { describe, expect, it } from 'vitest';
import {
  SQLITE_HYPERCARD_QUERY_ACTION_TYPE,
  SQLITE_HYPERCARD_SEED_ACTION_TYPE,
  sqliteLauncherActions,
  sqliteLauncherSlice,
  selectHypercardJobByID,
  selectNextQueuedHypercardJob,
  type SqliteLauncherState,
} from './runtimeState';

interface RootStateLike {
  app_sqlite: SqliteLauncherState;
}

function reduce(
  state: SqliteLauncherState | undefined,
  action: { type: string; payload?: unknown },
): SqliteLauncherState {
  return sqliteLauncherSlice.reducer(state, action as never);
}

function wrap(state: SqliteLauncherState): RootStateLike {
  return { app_sqlite: state };
}

describe('sqliteLauncherSlice runtime queue', () => {
  it('enqueues query jobs from runtime domain action', () => {
    const state = reduce(undefined, {
      type: SQLITE_HYPERCARD_QUERY_ACTION_TYPE,
      payload: { sql: 'select 1', rowLimit: 5 },
    });

    expect(state.hypercard.queue).toHaveLength(1);
    expect(state.hypercard.status.queueDepth).toBe(1);
    const job = selectNextQueuedHypercardJob(wrap(state));
    expect(job?.kind).toBe('query');
    expect(job?.status).toBe('queued');
  });

  it('enqueues seed jobs from runtime domain action', () => {
    const state = reduce(undefined, {
      type: SQLITE_HYPERCARD_SEED_ACTION_TYPE,
      payload: { profile: 'people-v1' },
    });

    const job = selectNextQueuedHypercardJob(wrap(state));
    expect(job?.kind).toBe('seed');
    if (job?.kind === 'seed') {
      expect(job.payload.profile).toBe('people-v1');
    }
  });

  it('applies running->success transition only for claiming runner', () => {
    let state = reduce(undefined, {
      type: SQLITE_HYPERCARD_QUERY_ACTION_TYPE,
      payload: { sql: 'select 1' },
    });
    const job = selectNextQueuedHypercardJob(wrap(state));
    expect(job).not.toBeNull();
    if (!job) return;

    state = reduce(
      state,
      sqliteLauncherActions.markHypercardJobRunning({
        jobId: job.id,
        runnerId: 'runner-a',
      }),
    );
    const runningJob = selectHypercardJobByID(wrap(state), job.id);
    expect(runningJob?.status).toBe('running');
    expect(state.hypercard.runningJobId).toBe(job.id);

    // Wrong runner should not complete the job.
    state = reduce(
      state,
      sqliteLauncherActions.completeHypercardQueryJob({
        jobId: job.id,
        runnerId: 'runner-b',
        result: {
          columns: [{ name: 'n' }],
          rows: [{ n: 1 }],
          meta: {
            correlationId: 'c1',
            durationMs: 3,
            rowCount: 1,
            statementType: 'SELECT',
            truncated: false,
            truncatedByRowLimit: false,
            truncatedByPayload: false,
          },
        },
      }),
    );
    expect(selectHypercardJobByID(wrap(state), job.id)?.status).toBe('running');

    state = reduce(
      state,
      sqliteLauncherActions.completeHypercardQueryJob({
        jobId: job.id,
        runnerId: 'runner-a',
        result: {
          columns: [{ name: 'n' }],
          rows: [{ n: 1 }],
          meta: {
            correlationId: 'c1',
            durationMs: 3,
            rowCount: 1,
            statementType: 'SELECT',
            truncated: false,
            truncatedByRowLimit: false,
            truncatedByPayload: false,
          },
        },
      }),
    );

    expect(selectHypercardJobByID(wrap(state), job.id)?.status).toBe('succeeded');
    expect(state.hypercard.runningJobId).toBeNull();
    expect(state.hypercard.lastQueryResult?.meta.statementType).toBe('SELECT');
  });

  it('stores failure details when runner reports an error', () => {
    let state = reduce(undefined, {
      type: SQLITE_HYPERCARD_SEED_ACTION_TYPE,
      payload: { profile: 'people-v1' },
    });
    const job = selectNextQueuedHypercardJob(wrap(state));
    expect(job?.kind).toBe('seed');
    if (!job) return;

    state = reduce(
      state,
      sqliteLauncherActions.markHypercardJobRunning({
        jobId: job.id,
        runnerId: 'runner-z',
      }),
    );

    state = reduce(
      state,
      sqliteLauncherActions.failHypercardJob({
        jobId: job.id,
        runnerId: 'runner-z',
        error: { category: 'execution', message: 'seed failed' },
        seedReport: {
          profile: 'people-v1',
          startedAt: '2026-03-01T00:00:00.000Z',
          completedAt: '2026-03-01T00:00:01.000Z',
          steps: [{ label: 'create-table', status: 'error', message: 'boom' }],
        },
      }),
    );

    expect(selectHypercardJobByID(wrap(state), job.id)?.status).toBe('failed');
    expect(state.hypercard.lastQueryError?.message).toBe('seed failed');
    expect(state.hypercard.lastSeedReport?.steps[0]?.status).toBe('error');
  });
});
