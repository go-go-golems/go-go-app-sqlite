import type * as ReactNamespace from 'react';
import type * as ReactJsxRuntimeNamespace from 'react/jsx-runtime';
import type * as ReactReduxNamespace from 'react-redux';

interface FederationSharedRuntime {
  react: typeof ReactNamespace;
  reactJsxRuntime: typeof ReactJsxRuntimeNamespace;
  reactRedux: typeof ReactReduxNamespace;
}

const FEDERATION_SHARED_RUNTIME_KEY = '__WESEN_FEDERATION_SHARED__';

type FederationSharedRuntimeGlobal = typeof globalThis & {
  [FEDERATION_SHARED_RUNTIME_KEY]?: FederationSharedRuntime;
};

export function requireFederationSharedRuntime(): FederationSharedRuntime {
  const runtime = (globalThis as FederationSharedRuntimeGlobal)[FEDERATION_SHARED_RUNTIME_KEY];
  if (!runtime) {
    throw new Error(
      'Missing host federation shared runtime. Expected __WESEN_FEDERATION_SHARED__ to be installed before loading the remote bundle.',
    );
  }
  return runtime;
}
