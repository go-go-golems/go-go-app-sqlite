import type { Preview } from '@storybook/react';
import React from 'react';
import { HyperCardTheme } from '@go-go-golems/os-core';
import '@go-go-golems/os-core/theme';

const preview: Preview = {
  decorators: [(Story) => React.createElement(HyperCardTheme, null, React.createElement(Story))],
  parameters: {
    docs: {
      codePanel: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ['SQLite', ['Workspace', 'Panels', 'Widgets']],
      },
    },
    layout: 'centered',
  },
};

export default preview;
