import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { QueryEditorPanel } from './QueryEditorPanel';
import type { ParameterMode } from './types';

const meta = {
  title: 'SQLite/Panels/QueryEditorPanel',
  component: QueryEditorPanel,
  tags: ['autodocs'],
} satisfies Meta<typeof QueryEditorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive() {
  const [sqlText, setSqlText] = useState('SELECT id, name FROM people ORDER BY id LIMIT 20');
  const [rowLimitInput, setRowLimitInput] = useState('');
  const [parameterMode, setParameterMode] = useState<ParameterMode>('none');
  const [paramsEditorText, setParamsEditorText] = useState('[]');

  return (
    <div style={{ width: 480 }}>
      <QueryEditorPanel
        sqlText={sqlText}
        onSqlChange={setSqlText}
        rowLimitInput={rowLimitInput}
        onRowLimitChange={setRowLimitInput}
        parameterMode={parameterMode}
        onParameterModeChange={setParameterMode}
        paramsEditorText={paramsEditorText}
        onParamsChange={setParamsEditorText}
        isExecuting={false}
        onExecute={() => alert('Execute!')}
        onCancel={() => {}}
        onReset={() => {
          setSqlText('');
          setRowLimitInput('');
          setParameterMode('none');
          setParamsEditorText('[]');
        }}
      />
    </div>
  );
}

export const Default: Story = {
  args: {
    sqlText: 'SELECT id, name FROM people ORDER BY id LIMIT 20',
    rowLimitInput: '',
    parameterMode: 'none',
    paramsEditorText: '[]',
    isExecuting: false,
    onSqlChange: () => {},
    onRowLimitChange: () => {},
    onParameterModeChange: () => {},
    onParamsChange: () => {},
    onExecute: () => {},
    onCancel: () => {},
    onReset: () => {},
  },
  decorators: [(Story) => <div style={{ width: 480 }}><Story /></div>],
};

export const WithPositionalParams: Story = {
  args: {
    ...Default.args,
    sqlText: 'SELECT * FROM people WHERE id = ?',
    parameterMode: 'positional',
    paramsEditorText: '[1]',
  },
  decorators: Default.decorators,
};

export const WithNamedParams: Story = {
  args: {
    ...Default.args,
    sqlText: 'SELECT * FROM people WHERE id >= :min_id',
    parameterMode: 'named',
    paramsEditorText: '{"min_id": 1}',
  },
  decorators: Default.decorators,
};

export const Executing: Story = {
  args: {
    ...Default.args,
    isExecuting: true,
  },
  decorators: Default.decorators,
};

export const InteractiveEditor: Story = {
  args: {
    ...Default.args,
  },
  render: () => <Interactive />,
};
