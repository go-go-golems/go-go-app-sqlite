import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SchemaBrowserPanel } from './SchemaBrowserPanel';
import type { SchemaTableInfo, SchemaTableDetails } from './types';

const sampleTables: SchemaTableInfo[] = [
  {
    name: 'people',
    type: 'table',
    sql: 'CREATE TABLE people (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)',
  },
  {
    name: 'sqlite_sequence',
    type: 'table',
    sql: 'CREATE TABLE sqlite_sequence(name,seq)',
  },
  {
    name: 'orders',
    type: 'table',
    sql: 'CREATE TABLE orders (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  person_id INTEGER NOT NULL REFERENCES people(id),\n  amount REAL NOT NULL,\n  status TEXT DEFAULT \'pending\',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)',
  },
  {
    name: 'active_orders',
    type: 'view',
    sql: "CREATE VIEW active_orders AS SELECT * FROM orders WHERE status != 'cancelled'",
  },
];

const sampleDetails: Record<string, SchemaTableDetails> = {
  people: {
    columns: [
      { cid: 0, name: 'id', type: 'INTEGER', notnull: false, dflt_value: null, pk: true },
      { cid: 1, name: 'name', type: 'TEXT', notnull: true, dflt_value: null, pk: false },
      { cid: 2, name: 'email', type: 'TEXT', notnull: true, dflt_value: null, pk: false },
      { cid: 3, name: 'created_at', type: 'TEXT', notnull: true, dflt_value: 'CURRENT_TIMESTAMP', pk: false },
    ],
    indexes: [
      { name: 'idx_people_email', unique: true },
      { name: 'idx_people_name', unique: false },
    ],
  },
  orders: {
    columns: [
      { cid: 0, name: 'id', type: 'INTEGER', notnull: false, dflt_value: null, pk: true },
      { cid: 1, name: 'person_id', type: 'INTEGER', notnull: true, dflt_value: null, pk: false },
      { cid: 2, name: 'amount', type: 'REAL', notnull: true, dflt_value: null, pk: false },
      { cid: 3, name: 'status', type: 'TEXT', notnull: false, dflt_value: "'pending'", pk: false },
      { cid: 4, name: 'created_at', type: 'TEXT', notnull: true, dflt_value: 'CURRENT_TIMESTAMP', pk: false },
    ],
    indexes: [],
  },
};

const meta = {
  title: 'SQLite/Panels/SchemaBrowserPanel',
  component: SchemaBrowserPanel,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div data-widget="hypercard" style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    tables: sampleTables,
    tableDetails: {},
    expandedTables: new Set<string>(),
    isLoading: false,
    onReload: () => {},
    onToggleTable: () => {},
    onUseInQuery: (sql: string) => alert(sql),
  },
} satisfies Meta<typeof SchemaBrowserPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    ...meta.args,
    tables: [],
    isLoading: true,
  },
};

export const EmptyDatabase: Story = {
  args: {
    ...meta.args,
    tables: [],
  },
};

export const WithExpandedTable: Story = {
  args: {
    ...meta.args,
    expandedTables: new Set(['people']),
    tableDetails: sampleDetails,
  },
};

export const WithMultipleExpanded: Story = {
  args: {
    ...meta.args,
    expandedTables: new Set(['people', 'orders']),
    tableDetails: sampleDetails,
  },
};

export const ExpandedWithoutDetails: Story = {
  args: {
    ...meta.args,
    expandedTables: new Set(['people']),
    tableDetails: {},
  },
};

function Interactive() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <SchemaBrowserPanel
      tables={sampleTables}
      tableDetails={sampleDetails}
      expandedTables={expanded}
      isLoading={false}
      onReload={() => alert('Reload')}
      onToggleTable={(name) => {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
          } else {
            next.add(name);
          }
          return next;
        });
      }}
      onUseInQuery={(sql) => alert(sql)}
    />
  );
}

export const InteractiveBrowser: Story = {
  args: {
    ...meta.args,
  },
  render: () => <Interactive />,
};
