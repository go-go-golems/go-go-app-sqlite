import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');

function fromFrontendPackages(packagePath: string): string {
  return path.resolve(workspaceRoot, `go-go-os-frontend/packages/${packagePath}/src`);
}

export default {
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    alias: {
      '@reduxjs/toolkit': path.resolve(__dirname, 'src/test/stubs/redux-toolkit.ts'),
      'react-redux': path.resolve(__dirname, 'src/test/stubs/react-redux.ts'),
    },
  },
  resolve: {
    alias: [
      {
        find: /^@hypercard\/desktop-os$/,
        replacement: path.join(fromFrontendPackages('desktop-os'), 'index.ts'),
      },
      {
        find: /^@hypercard\/desktop-os\/(.*)$/,
        replacement: `${fromFrontendPackages('desktop-os')}/$1`,
      },
      {
        find: /^@hypercard\/engine$/,
        replacement: path.join(fromFrontendPackages('engine'), 'index.ts'),
      },
      {
        find: /^@hypercard\/engine\/(.*)$/,
        replacement: `${fromFrontendPackages('engine')}/$1`,
      },
      {
        find: /^@hypercard\/hypercard-runtime$/,
        replacement: path.join(fromFrontendPackages('hypercard-runtime'), 'index.ts'),
      },
      {
        find: /^@hypercard\/hypercard-runtime\/(.*)$/,
        replacement: `${fromFrontendPackages('hypercard-runtime')}/$1`,
      },
      {
        find: /^@reduxjs\/toolkit$/,
        replacement: path.resolve(__dirname, 'src/test/stubs/redux-toolkit.ts'),
      },
      {
        find: /^react-redux$/,
        replacement: path.resolve(__dirname, 'src/test/stubs/react-redux.ts'),
      },
    ],
  },
};
