import type { Meta, StoryObj } from '@storybook/react';
import { ResultsPanel } from './ResultsPanel';
import type { QueryResponse } from './types';

const meta = {
  title: 'SQLite/Panels/ResultsPanel',
  component: ResultsPanel,
  tags: ['autodocs'],
  decorators: [(Story) => <div style={{ width: 600 }}><Story /></div>],
} satisfies Meta<typeof ResultsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { queryResponse: null },
};

const sampleResponse: QueryResponse = {
  columns: [
    { name: 'id', database_type: 'INTEGER' },
    { name: 'name', database_type: 'TEXT' },
    { name: 'email', database_type: 'TEXT' },
    { name: 'created_at', database_type: 'TEXT' },
  ],
  rows: [
    { id: 1, name: 'Alice', email: 'alice@example.com', created_at: '2026-01-15T10:00:00Z' },
    { id: 2, name: 'Bob', email: null, created_at: '2026-01-16T11:00:00Z' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', created_at: null },
  ],
  meta: {
    correlation_id: 'abc-123-def',
    duration_ms: 12,
    row_count: 3,
    effective_row_limit: 100,
    payload_bytes: 512,
    payload_cap_bytes: 10000,
    statement_timeout_ms: 5000,
    truncated: false,
    truncated_by_row_limit: false,
    truncated_by_payload: false,
    statement_type: 'SELECT',
  },
};

export const WithData: Story = {
  args: { queryResponse: sampleResponse },
};

export const WithNullValues: Story = {
  args: { queryResponse: sampleResponse },
};

const truncatedResponse: QueryResponse = {
  ...sampleResponse,
  meta: {
    ...sampleResponse.meta,
    truncated: true,
    truncated_by_row_limit: true,
    effective_row_limit: 3,
  },
};

export const Truncated: Story = {
  args: { queryResponse: truncatedResponse },
};

const payloadTruncated: QueryResponse = {
  ...sampleResponse,
  meta: {
    ...sampleResponse.meta,
    truncated: true,
    truncated_by_payload: true,
  },
};

export const PayloadTruncated: Story = {
  args: { queryResponse: payloadTruncated },
};

const emptyResult: QueryResponse = {
  columns: [
    { name: 'id', database_type: 'INTEGER' },
    { name: 'name', database_type: 'TEXT' },
  ],
  rows: [],
  meta: {
    ...sampleResponse.meta,
    row_count: 0,
    statement_type: 'SELECT',
  },
};

export const NoRows: Story = {
  args: { queryResponse: emptyResult },
};

const insertResult: QueryResponse = {
  columns: [],
  rows: [],
  meta: {
    ...sampleResponse.meta,
    row_count: 0,
    statement_type: 'INSERT',
  },
};

export const InsertResult: Story = {
  args: { queryResponse: insertResult },
};
