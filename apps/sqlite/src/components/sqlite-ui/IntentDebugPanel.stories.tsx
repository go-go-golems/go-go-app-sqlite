import type { Meta, StoryObj } from '@storybook/react';
import { IntentDebugPanel } from './IntentDebugPanel';

const meta = {
  title: 'SQLite/Panels/IntentDebugPanel',
  component: IntentDebugPanel,
  tags: ['autodocs'],
  decorators: [(Story) => <div style={{ width: 480 }}><Story /></div>],
} satisfies Meta<typeof IntentDebugPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  args: {
    lastIntentResult: null,
    isExecuting: false,
    onExecuteViaIntent: () => {},
  },
};

export const WithSuccessResult: Story = {
  args: {
    lastIntentResult: {
      ok: true,
      intent: 'sqlite.query.execute',
      data: {
        columns: [{ name: 'id' }, { name: 'name' }],
        rows: [{ id: 1, name: 'Alice' }],
        meta: {
          correlationId: 'intent-abc-123',
          durationMs: 8,
          rowCount: 1,
          statementType: 'SELECT',
          truncated: false,
          truncatedByRowLimit: false,
          truncatedByPayload: false,
        },
      },
    },
    isExecuting: false,
    onExecuteViaIntent: () => {},
  },
};

export const WithErrorResult: Story = {
  args: {
    lastIntentResult: {
      ok: false,
      intent: 'sqlite.query.execute',
      error: {
        category: 'syntax',
        message: 'near "FORM": syntax error',
        correlationId: 'intent-err-456',
      },
    },
    isExecuting: false,
    onExecuteViaIntent: () => {},
  },
};
