import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');

const config: StorybookConfig = {
  stories: [
    {
      directory: '../apps/sqlite/src',
      files: '**/*.stories.@(ts|tsx)',
    },
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
  ],
  framework: '@storybook/react-vite',
  viteFinal: async (config_) => {
    config_.resolve = config_.resolve || {};
    config_.resolve.alias = {
      ...config_.resolve.alias,
      '@hypercard/engine': resolve(workspaceRoot, 'go-go-os-frontend/packages/engine/src'),
      '@hypercard/desktop-os': resolve(workspaceRoot, 'go-go-os-frontend/packages/desktop-os/src'),
      '@hypercard/hypercard-runtime': resolve(workspaceRoot, 'go-go-os-frontend/packages/hypercard-runtime/src'),
    };
    return config_;
  },
};

export default config;
