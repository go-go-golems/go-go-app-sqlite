import { requireFederationSharedRuntime } from './runtime';

const ReactJsxRuntime = requireFederationSharedRuntime().reactJsxRuntime;

export const Fragment = ReactJsxRuntime.Fragment;
export const jsx = ReactJsxRuntime.jsx;
export const jsxs = ReactJsxRuntime.jsxs;
export const jsxDEV = ReactJsxRuntime.jsxDEV;
