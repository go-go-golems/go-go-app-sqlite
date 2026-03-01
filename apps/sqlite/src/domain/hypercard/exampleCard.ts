import { SQLITE_HYPERCARD_QUERY_INTENT } from './intentContract';

export const SQLITE_HYPERCARD_EXAMPLE_CARD_ACTION = {
  type: 'intent.call',
  intent: SQLITE_HYPERCARD_QUERY_INTENT,
  payload: {
    sql: 'SELECT id, name FROM people WHERE id >= :minimum_id ORDER BY id LIMIT 5',
    namedParams: {
      minimum_id: 1,
    },
    rowLimit: 5,
  },
};

export const SQLITE_HYPERCARD_EXAMPLE_CARD_NOTE = [
  'HyperCard action example for sqlite query execution intent.',
  'Expected result envelope:',
  '- success: { ok: true, intent, data: { columns, rows, meta } }',
  '- failure: { ok: false, intent, error: { category, message, correlationId? } }',
].join('\n');
