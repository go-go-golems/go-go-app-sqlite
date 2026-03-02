import type { Meta, StoryObj } from '@storybook/react';
import { SavedQueriesPanel } from './SavedQueriesPanel';
import type { SavedQuery } from './types';

const meta = {
  title: 'SQLite/Panels/SavedQueriesPanel',
  component: SavedQueriesPanel,
  tags: ['autodocs'],
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
} satisfies Meta<typeof SavedQueriesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleQueries: SavedQuery[] = [
  {
    id: 'sq-1',
    name: 'All People',
    sql: 'SELECT id, name, email FROM people ORDER BY id',
    schema_version: 1,
    created_at: '2026-02-28T10:00:00Z',
    updated_at: '2026-03-01T14:30:00Z',
  },
  {
    id: 'sq-2',
    name: 'Recent Entries',
    sql: 'SELECT * FROM people WHERE created_at > :since ORDER BY created_at DESC LIMIT 10',
    named_params: { since: '2026-01-01' },
    schema_version: 2,
    created_at: '2026-02-20T09:00:00Z',
    updated_at: '2026-02-25T16:00:00Z',
  },
];

export const WithQueries: Story = {
  args: {
    savedQueries: sampleQueries,
    selectedSavedQueryId: '',
    savedQueryName: '',
    savedQuerySchemaVersion: '1',
    isLoading: false,
    onReload: () => {},
    onRestore: () => {},
    onCreate: () => {},
    onUpdate: () => {},
    onDelete: () => {},
    onSavedQueryNameChange: () => {},
    onSchemaVersionChange: () => {},
  },
};

export const WithSelected: Story = {
  args: {
    ...WithQueries.args,
    selectedSavedQueryId: 'sq-1',
    savedQueryName: 'All People',
  },
};

export const EmptyList: Story = {
  args: {
    ...WithQueries.args,
    savedQueries: [],
  },
};
