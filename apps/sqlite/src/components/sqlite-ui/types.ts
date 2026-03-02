export type ParameterMode = 'none' | 'positional' | 'named';
export type HistoryFilter = 'all' | 'success' | 'error';

export interface QueryColumn {
  name: string;
  database_type?: string;
  scan_type?: string;
}

export interface QueryMeta {
  correlation_id: string;
  duration_ms: number;
  row_count: number;
  effective_row_limit: number;
  payload_bytes: number;
  payload_cap_bytes: number;
  statement_timeout_ms: number;
  truncated: boolean;
  truncated_by_row_limit: boolean;
  truncated_by_payload: boolean;
  statement_type: string;
}

export interface QueryResponse {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  meta: QueryMeta;
}

export interface UIErrorState {
  category: string;
  message: string;
  correlationId?: string;
}

export interface QueryHistoryEntry {
  id: string;
  query_text: string;
  query_preview: string;
  params_json: string;
  status: 'success' | 'error' | string;
  duration_ms: number;
  row_count: number;
  error_summary: string;
  created_at: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  positional_params?: unknown[];
  named_params?: Record<string, unknown>;
  schema_version: number;
  created_at: string;
  updated_at: string;
}
