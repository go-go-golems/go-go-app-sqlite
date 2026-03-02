export const SQLITE_HYPERCARD_QUERY_INTENT = 'sqlite.query.execute';

export interface SqliteQueryIntentPayload {
  sql: string;
  rowLimit?: number;
  positionalParams?: unknown[];
  namedParams?: Record<string, unknown>;
}

export interface SqliteQueryIntentColumn {
  name: string;
  databaseType?: string;
  scanType?: string;
}

export interface SqliteQueryIntentMeta {
  correlationId: string;
  durationMs: number;
  rowCount: number;
  statementType: string;
  truncated: boolean;
  truncatedByRowLimit: boolean;
  truncatedByPayload: boolean;
}

export interface SqliteQueryIntentSuccessResult {
  ok: true;
  intent: typeof SQLITE_HYPERCARD_QUERY_INTENT;
  data: {
    columns: SqliteQueryIntentColumn[];
    rows: Record<string, unknown>[];
    meta: SqliteQueryIntentMeta;
  };
}

export interface SqliteQueryIntentErrorResult {
  ok: false;
  intent: typeof SQLITE_HYPERCARD_QUERY_INTENT;
  error: {
    category: 'validation' | 'permission' | 'syntax' | 'execution' | 'timeout';
    message: string;
    correlationId?: string;
  };
}

export type SqliteQueryIntentResult = SqliteQueryIntentSuccessResult | SqliteQueryIntentErrorResult;

export const SQLITE_HYPERCARD_QUERY_INTENT_PAYLOAD_SCHEMA_REFERENCE = {
  type: 'object',
  required: ['sql'],
  properties: {
    sql: { type: 'string', description: 'Single SQL statement to execute.' },
    rowLimit: { type: 'number', minimum: 1, description: 'Optional row cap for this query.' },
    positionalParams: { type: 'array', description: 'Optional positional params for ? placeholders.' },
    namedParams: {
      type: 'object',
      description: 'Optional named params for :name placeholders. Do not combine with positionalParams.',
      additionalProperties: true,
    },
  },
};

export const SQLITE_HYPERCARD_QUERY_INTENT_RESULT_SCHEMA_REFERENCE = {
  type: 'object',
  oneOf: [
    {
      required: ['ok', 'intent', 'data'],
      properties: {
        ok: { const: true },
        intent: { const: SQLITE_HYPERCARD_QUERY_INTENT },
      },
    },
    {
      required: ['ok', 'intent', 'error'],
      properties: {
        ok: { const: false },
        intent: { const: SQLITE_HYPERCARD_QUERY_INTENT },
      },
    },
  ],
};
