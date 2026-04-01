import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function emitFederationManifest(): Plugin {
  return {
    name: 'sqlite-federation-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'mf-manifest.json',
        source: JSON.stringify(
          {
            version: 1,
            remoteId: 'sqlite',
            compatiblePlatformRange: '^0.1.0',
            contract: {
              entry: './sqlite-host-contract.js',
              exportName: 'sqliteHostContract',
            },
          },
          null,
          2,
        ),
      });
    },
  };
}

const federationSharedAliases = [
  {
    find: /^react\/jsx-runtime$/,
    replacement: path.resolve(__dirname, 'src/federation-shared/react-jsx-runtime.ts'),
  },
  {
    find: /^react\/jsx-dev-runtime$/,
    replacement: path.resolve(__dirname, 'src/federation-shared/react-jsx-runtime.ts'),
  },
  {
    find: /^react-redux$/,
    replacement: path.resolve(__dirname, 'src/federation-shared/react-redux.ts'),
  },
  {
    find: /^react$/,
    replacement: path.resolve(__dirname, 'src/federation-shared/react.ts'),
  },
] as const;

export default defineConfig({
  plugins: [react(), emitFederationManifest()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: [...federationSharedAliases],
  },
  build: {
    target: 'es2022',
    outDir: 'dist-federation',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/host.ts'),
      formats: ['es'],
      fileName: () => 'sqlite-host-contract.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
