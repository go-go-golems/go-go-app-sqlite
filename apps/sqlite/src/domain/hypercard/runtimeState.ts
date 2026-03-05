import type { LaunchReason } from '@hypercard/desktop-os';
import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  SqliteQueryIntentPayload,
} from './intentContract';

export const SQLITE_HYPERCARD_QUERY_ACTION_TYPE = 'sqlite/query.execute';
export const SQLITE_HYPERCARD_SEED_ACTION_TYPE = 'sqlite/seed.execute';
export const sqliteHypercardQueryIntent = createAction<SqliteQueryIntentPayload>(SQLITE_HYPERCARD_QUERY_ACTION_TYPE);
export const sqliteHypercardSeedIntent = createAction<SqliteSeedIntentPayload>(SQLITE_HYPERCARD_SEED_ACTION_TYPE);

export interface SqliteSeedIntentPayload {
  profile?: string;
}

export type SqliteHypercardJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface SqliteQueryResultView {
  columns: Array<{ name: string; databaseType?: string; scanType?: string }>;
  rows: Record<string, unknown>[];
  meta: {
    correlationId: string;
    durationMs: number;
    rowCount: number;
    statementType: string;
    truncated: boolean;
    truncatedByRowLimit: boolean;
    truncatedByPayload: boolean;
  };
}

export interface SqliteHypercardErrorView {
  category: 'validation' | 'permission' | 'syntax' | 'execution' | 'timeout';
  message: string;
  correlationId?: string;
}

export interface SqliteSeedStepReport {
  label: string;
  status: 'ok' | 'error';
  correlationId?: string;
  message?: string;
}

export interface SqliteSeedReport {
  profile: string;
  startedAt: string;
  completedAt: string;
  steps: SqliteSeedStepReport[];
}

interface SqliteHypercardQueryJob {
  id: string;
  kind: 'query';
  status: SqliteHypercardJobStatus;
  payload: SqliteQueryIntentPayload;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runningBy: string | null;
}

interface SqliteHypercardSeedJob {
  id: string;
  kind: 'seed';
  status: SqliteHypercardJobStatus;
  payload: SqliteSeedIntentPayload;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runningBy: string | null;
}

export type SqliteHypercardJob = SqliteHypercardQueryJob | SqliteHypercardSeedJob;

export interface SqliteHypercardStatusView {
  queueDepth: number;
  runningJobType: 'query' | 'seed' | null;
  runningJobId: string | null;
  lastEventAt: string | null;
}

export interface SqliteHypercardRuntimeState {
  queue: string[];
  jobsById: Record<string, SqliteHypercardJob>;
  runningJobId: string | null;
  lastQueryResult: SqliteQueryResultView | null;
  lastQueryError: SqliteHypercardErrorView | null;
  lastSeedReport: SqliteSeedReport | null;
  status: SqliteHypercardStatusView;
}

export interface SqliteLauncherState {
  launchCount: number;
  lastLaunchReason: LaunchReason | null;
  hypercard: SqliteHypercardRuntimeState;
}

export interface SqliteLauncherStateSlice {
  app_sqlite?: SqliteLauncherState;
}

const initialState: SqliteLauncherState = {
  launchCount: 0,
  lastLaunchReason: null,
  hypercard: {
    queue: [],
    jobsById: {},
    runningJobId: null,
    lastQueryResult: null,
    lastQueryError: null,
    lastSeedReport: null,
    status: {
      queueDepth: 0,
      runningJobType: null,
      runningJobId: null,
      lastEventAt: null,
    },
  },
};

interface MarkHypercardJobRunningPayload {
  jobId: string;
  runnerId: string;
}

interface CompleteHypercardQueryJobPayload {
  jobId: string;
  runnerId: string;
  result: SqliteQueryResultView;
}

interface CompleteHypercardSeedJobPayload {
  jobId: string;
  runnerId: string;
  report: SqliteSeedReport;
}

interface FailHypercardJobPayload {
  jobId: string;
  runnerId: string;
  error: SqliteHypercardErrorView;
  seedReport?: SqliteSeedReport;
}

function nowISO(): string {
  return new Date().toISOString();
}

function nextJobID(kind: 'query' | 'seed'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${kind}-${globalThis.crypto.randomUUID()}`;
  }
  return `${kind}-${Date.now()}-${Math.round(Math.random() * 10_000)}`;
}

function enqueueJob(state: SqliteLauncherState, job: SqliteHypercardJob): void {
  state.hypercard.jobsById[job.id] = job;
  state.hypercard.queue.push(job.id);
  syncHypercardStatus(state);
}

function syncHypercardStatus(state: SqliteLauncherState): void {
  const runningJob = state.hypercard.runningJobId
    ? state.hypercard.jobsById[state.hypercard.runningJobId]
    : null;
  state.hypercard.status = {
    queueDepth: state.hypercard.queue.length,
    runningJobType: runningJob?.kind ?? null,
    runningJobId: state.hypercard.runningJobId,
    lastEventAt: nowISO(),
  };
}

function canTransitionRunningJob(
  state: SqliteLauncherState,
  jobId: string,
  runnerId: string,
): SqliteHypercardJob | null {
  const job = state.hypercard.jobsById[jobId];
  if (!job) {
    return null;
  }
  if (job.status !== 'running') {
    return null;
  }
  if (job.runningBy !== runnerId) {
    return null;
  }
  return job;
}

export const sqliteLauncherSlice = createSlice({
  name: 'sqliteLauncher',
  initialState,
  reducers: {
    markLaunched(state, action: PayloadAction<LaunchReason>) {
      state.launchCount += 1;
      state.lastLaunchReason = action.payload;
    },
    markHypercardJobRunning(state, action: PayloadAction<MarkHypercardJobRunningPayload>) {
      if (state.hypercard.runningJobId) {
        return;
      }
      const job = state.hypercard.jobsById[action.payload.jobId];
      if (!job || job.status !== 'queued') {
        return;
      }
      const queueIndex = state.hypercard.queue.indexOf(job.id);
      if (queueIndex < 0) {
        return;
      }
      state.hypercard.queue.splice(queueIndex, 1);
      job.status = 'running';
      job.runningBy = action.payload.runnerId;
      job.startedAt = nowISO();
      state.hypercard.runningJobId = job.id;
      syncHypercardStatus(state);
    },
    completeHypercardQueryJob(state, action: PayloadAction<CompleteHypercardQueryJobPayload>) {
      const job = canTransitionRunningJob(state, action.payload.jobId, action.payload.runnerId);
      if (!job || job.kind !== 'query') {
        return;
      }
      job.status = 'succeeded';
      job.completedAt = nowISO();
      job.runningBy = null;
      state.hypercard.runningJobId = null;
      state.hypercard.lastQueryResult = action.payload.result;
      state.hypercard.lastQueryError = null;
      syncHypercardStatus(state);
    },
    completeHypercardSeedJob(state, action: PayloadAction<CompleteHypercardSeedJobPayload>) {
      const job = canTransitionRunningJob(state, action.payload.jobId, action.payload.runnerId);
      if (!job || job.kind !== 'seed') {
        return;
      }
      job.status = 'succeeded';
      job.completedAt = nowISO();
      job.runningBy = null;
      state.hypercard.runningJobId = null;
      state.hypercard.lastSeedReport = action.payload.report;
      syncHypercardStatus(state);
    },
    failHypercardJob(state, action: PayloadAction<FailHypercardJobPayload>) {
      const job = canTransitionRunningJob(state, action.payload.jobId, action.payload.runnerId);
      if (!job) {
        return;
      }
      job.status = 'failed';
      job.completedAt = nowISO();
      job.runningBy = null;
      state.hypercard.runningJobId = null;
      state.hypercard.lastQueryError = action.payload.error;
      if (action.payload.seedReport) {
        state.hypercard.lastSeedReport = action.payload.seedReport;
      }
      syncHypercardStatus(state);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sqliteHypercardQueryIntent, (state, action) => {
      const payload = action.payload;
      if (!payload || typeof payload.sql !== 'string' || payload.sql.trim().length === 0) {
        return;
      }
      const enqueuedAt = nowISO();
      enqueueJob(state, {
        id: nextJobID('query'),
        kind: 'query',
        status: 'queued',
        payload: {
          sql: payload.sql,
          rowLimit: payload.rowLimit,
          positionalParams: payload.positionalParams,
          namedParams: payload.namedParams,
        },
        enqueuedAt,
        startedAt: null,
        completedAt: null,
        runningBy: null,
      });
    });
    builder.addCase(sqliteHypercardSeedIntent, (state, action) => {
      const payload = action.payload ?? {};
      const enqueuedAt = nowISO();
      enqueueJob(state, {
        id: nextJobID('seed'),
        kind: 'seed',
        status: 'queued',
        payload: {
          profile: typeof payload.profile === 'string' ? payload.profile : undefined,
        },
        enqueuedAt,
        startedAt: null,
        completedAt: null,
        runningBy: null,
      });
    });
  },
});

export const sqliteLauncherActions = sqliteLauncherSlice.actions;

export function selectSqliteLauncherState(state: unknown): SqliteLauncherState | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return null;
  }
  const root = state as SqliteLauncherStateSlice;
  return root.app_sqlite ?? null;
}

export function selectNextQueuedHypercardJob(state: unknown): SqliteHypercardJob | null {
  const launcher = selectSqliteLauncherState(state);
  if (!launcher) {
    return null;
  }
  const nextJobID = launcher.hypercard.queue[0];
  if (!nextJobID) {
    return null;
  }
  return launcher.hypercard.jobsById[nextJobID] ?? null;
}

export function selectHypercardJobByID(state: unknown, jobId: string): SqliteHypercardJob | null {
  const launcher = selectSqliteLauncherState(state);
  if (!launcher) {
    return null;
  }
  return launcher.hypercard.jobsById[jobId] ?? null;
}
