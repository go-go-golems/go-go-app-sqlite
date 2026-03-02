import type { Meta, StoryObj } from '@storybook/react';
import { WorkspaceHeader } from './WorkspaceHeader';

const meta = {
  title: 'SQLite/Panels/WorkspaceHeader',
  component: WorkspaceHeader,
  tags: ['autodocs'],
  args: {
    apiBase: '/api/apps/sqlite',
    activeRequestId: '',
    isExecuting: false,
  },
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Executing: Story = {
  args: {
    activeRequestId: 'ui-1709312400000',
    isExecuting: true,
  },
};

export const WithRequestId: Story = {
  args: {
    activeRequestId: 'intent-ui-1709312400000',
    isExecuting: false,
  },
};
