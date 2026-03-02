import {
  SQLITE_HYPERCARD_QUERY_INTENT,
  type SqliteQueryIntentPayload,
  type SqliteQueryIntentResult,
} from './intentContract';

interface QueryAPIResponse {
  columns: Array<{ name: string; database_type?: string; scan_type?: string }>;
  rows: Record<string, unknown>[];
  meta: {
    correlation_id: string;
    duration_ms: number;
    row_count: number;
    statement_type: string;
    truncated: boolean;
    truncated_by_row_limit: boolean;
    truncated_by_payload: boolean;
  };
}

interface QueryAPIErrorResponse {
  error?: {
    category?: 'validation' | 'permission' | 'syntax' | 'execution' | 'timeout';
    message?: string;
    correlation_id?: string;
  };
}

export interface SqliteIntentBridgeOptions {
  apiBasePrefix: string;
  requestId?: string;
  fetchImpl?: typeof fetch;
  maxRowLimit?: number;
}

export async function runSqliteHypercardQueryIntent(
  payload: SqliteQueryIntentPayload,
  options: SqliteIntentBridgeOptions,
): Promise<SqliteQueryIntentResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBasePrefix.endsWith('/')
    ? options.apiBasePrefix.slice(0, -1)
    : options.apiBasePrefix;

  const validationError = validatePayload(payload, options.maxRowLimit ?? 200);
  if (validationError) {
    return {
      ok: false,
      intent: SQLITE_HYPERCARD_QUERY_INTENT,
      error: {
        category: 'validation',
        message: validationError,
      },
    };
  }

  const requestBody: Record<string, unknown> = {
    sql: payload.sql.trim(),
  };
  if (payload.rowLimit) {
    requestBody.row_limit = payload.rowLimit;
  }
  if (payload.positionalParams && payload.positionalParams.length > 0) {
    requestBody.positional_params = payload.positionalParams;
  }
  if (payload.namedParams && Object.keys(payload.namedParams).length > 0) {
    requestBody.named_params = payload.namedParams;
  }

  try {
    const response = await fetchImpl(`${apiBase}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.requestId ? { 'X-Request-ID': options.requestId } : {}),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = (await response.json()) as QueryAPIErrorResponse;
      return {
        ok: false,
        intent: SQLITE_HYPERCARD_QUERY_INTENT,
        error: {
          category: body.error?.category ?? 'execution',
          message: body.error?.message ?? `query failed with status ${response.status}`,
          correlationId: body.error?.correlation_id,
        },
      };
    }

    const body = (await response.json()) as QueryAPIResponse;
    return {
      ok: true,
      intent: SQLITE_HYPERCARD_QUERY_INTENT,
      data: {
        columns: (body.columns ?? []).map((column) => ({
          name: column.name,
          databaseType: column.database_type,
          scanType: column.scan_type,
        })),
        rows: body.rows ?? [],
        meta: {
          correlationId: body.meta?.correlation_id ?? '',
          durationMs: body.meta?.duration_ms ?? 0,
          rowCount: body.meta?.row_count ?? 0,
          statementType: body.meta?.statement_type ?? 'UNKNOWN',
          truncated: Boolean(body.meta?.truncated),
          truncatedByRowLimit: Boolean(body.meta?.truncated_by_row_limit),
          truncatedByPayload: Boolean(body.meta?.truncated_by_payload),
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      intent: SQLITE_HYPERCARD_QUERY_INTENT,
      error: {
        category: 'execution',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function validatePayload(payload: SqliteQueryIntentPayload, maxRowLimit: number): string | null {
  if (!payload || typeof payload !== 'object') {
    return 'Intent payload must be an object.';
  }
  const sql = payload.sql?.trim();
  if (!sql) {
    return 'Intent payload requires SQL text.';
  }
  if (payload.positionalParams && payload.namedParams) {
    return 'Intent payload must not include both positionalParams and namedParams.';
  }
  if (payload.positionalParams && !Array.isArray(payload.positionalParams)) {
    return 'Intent positionalParams must be an array.';
  }
  if (payload.namedParams) {
    if (Array.isArray(payload.namedParams) || typeof payload.namedParams !== 'object') {
      return 'Intent namedParams must be an object.';
    }
  }
  if (payload.rowLimit !== undefined) {
    if (!Number.isFinite(payload.rowLimit) || payload.rowLimit <= 0) {
      return 'Intent rowLimit must be a positive number.';
    }
    if (payload.rowLimit > maxRowLimit) {
      return `Intent rowLimit must be <= ${maxRowLimit}.`;
    }
  }
  return null;
}
