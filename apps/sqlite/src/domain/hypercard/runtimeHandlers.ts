import {
  SQLITE_HYPERCARD_QUERY_INTENT,
  type SqliteQueryIntentPayload,
  type SqliteQueryIntentResult,
} from './intentContract';
import { runSqliteHypercardQueryIntent } from './intentBridge';

export interface SqliteIntentRuntimeContext {
  apiBasePrefix: string;
  fetchImpl?: typeof fetch;
}

export async function handleSqliteQueryIntent(
  context: SqliteIntentRuntimeContext,
  payload: SqliteQueryIntentPayload,
): Promise<SqliteQueryIntentResult> {
  return runSqliteHypercardQueryIntent(payload, {
    apiBasePrefix: context.apiBasePrefix,
    fetchImpl: context.fetchImpl,
    requestId: `intent-${Date.now()}`,
    maxRowLimit: 200,
  });
}

export type SqliteIntentHandler = (
  context: SqliteIntentRuntimeContext,
  payload: SqliteQueryIntentPayload,
) => Promise<SqliteQueryIntentResult>;

export const sqliteHypercardDomainHandlers: Record<string, SqliteIntentHandler> = {
  [SQLITE_HYPERCARD_QUERY_INTENT]: handleSqliteQueryIntent,
};
