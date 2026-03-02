import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionStatusPanel } from './ExecutionStatusPanel';
import type { QueryResponse, UIErrorState } from './types';

const meta = {
  title: 'SQLite/Panels/ExecutionStatusPanel',
  component: ExecutionStatusPanel,
  tags: ['autodocs'],
} satisfies Meta<typeof ExecutionStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { uiError: null, queryResponse: null },
};

const sampleResponse: QueryResponse = {
  columns: [
    { name: 'id', database_type: 'INTEGER' },
    { name: 'name', database_type: 'TEXT' },
  ],
  rows: [{ id: 1, name: 'Alice' }],
  meta: {
    correlation_id: 'abc-123-def',
    duration_ms: 42,
    row_count: 1,
    effective_row_limit: 100,
    payload_bytes: 256,
    payload_cap_bytes: 10000,
    statement_timeout_ms: 5000,
    truncated: false,
    truncated_by_row_limit: false,
    truncated_by_payload: false,
    statement_type: 'SELECT',
  },
};

export const Success: Story = {
  args: { uiError: null, queryResponse: sampleResponse },
};

const validationError: UIErrorState = {
  category: 'validation',
  message: 'SQL text is required.',
};

export const ValidationError: Story = {
  args: { uiError: validationError, queryResponse: null },
};

const syntaxError: UIErrorState = {
  category: 'syntax',
  message: 'near "FORM": syntax error',
  correlationId: 'err-456-ghi',
};

export const SyntaxError_: Story = {
  name: 'Syntax Error',
  args: { uiError: syntaxError, queryResponse: null },
};

const executionError: UIErrorState = {
  category: 'execution',
  message: 'no such table: nonexistent',
  correlationId: 'err-789-jkl',
};

export const ExecutionError: Story = {
  args: { uiError: executionError, queryResponse: null },
};

const timeoutError: UIErrorState = {
  category: 'timeout',
  message: 'Query request was cancelled.',
};

export const TimeoutError: Story = {
  args: { uiError: timeoutError, queryResponse: null },
};
