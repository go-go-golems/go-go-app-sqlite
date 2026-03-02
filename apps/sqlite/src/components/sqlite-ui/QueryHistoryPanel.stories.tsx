import type { Meta, StoryObj } from '@storybook/react';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import type { QueryHistoryEntry } from './types';

const meta = {
  title: 'SQLite/Panels/QueryHistoryPanel',
  component: QueryHistoryPanel,
  tags: ['autodocs'],
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
} satisfies Meta<typeof QueryHistoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems: QueryHistoryEntry[] = [
  {
    id: '1',
    query_text: 'SELECT id, name FROM people ORDER BY id LIMIT 20',
    query_preview: 'SELECT id, name FROM people ORDER BY id LIMIT 20',
    params_json: '{}',
    status: 'success',
    duration_ms: 12,
    row_count: 3,
    error_summary: '',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    query_text: 'SELECT * FORM people',
    query_preview: 'SELECT * FORM people',
    params_json: '{}',
    status: 'error',
    duration_ms: 1,
    row_count: 0,
    error_summary: 'near "FORM": syntax error',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    query_text: 'INSERT INTO people (name, email) VALUES (?, ?)',
    query_preview: 'INSERT INTO people (name, email) VALUES (?, ?)',
    params_json: '{"positional_params": ["Dave", "dave@example.com"]}',
    status: 'success',
    duration_ms: 5,
    row_count: 0,
    error_summary: '',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
];

export const WithItems: Story = {
  args: {
    historyFilter: 'all',
    onFilterChange: () => {},
    historyItems: sampleItems,
    historyTotal: 3,
    isLoading: false,
    onReload: () => {},
    onRestore: () => {},
  },
};

export const EmptyHistory: Story = {
  args: {
    historyFilter: 'all',
    onFilterChange: () => {},
    historyItems: [],
    historyTotal: 0,
    isLoading: false,
    onReload: () => {},
    onRestore: () => {},
  },
};

export const FilteredSuccess: Story = {
  args: {
    ...WithItems.args,
    historyFilter: 'success',
    historyItems: sampleItems.filter((i) => i.status === 'success'),
    historyTotal: 2,
  },
};

export const Loading: Story = {
  args: {
    ...WithItems.args,
    isLoading: true,
  },
};
