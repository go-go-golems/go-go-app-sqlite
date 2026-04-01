import { requireFederationSharedRuntime } from './runtime';

const ReactRedux = requireFederationSharedRuntime().reactRedux;

export const Provider = ReactRedux.Provider;
export const ReactReduxContext = ReactRedux.ReactReduxContext;
export const batch = ReactRedux.batch;
export const connect = ReactRedux.connect;
export const createDispatchHook = ReactRedux.createDispatchHook;
export const createSelectorHook = ReactRedux.createSelectorHook;
export const createStoreHook = ReactRedux.createStoreHook;
export const shallowEqual = ReactRedux.shallowEqual;
export const useDispatch = ReactRedux.useDispatch;
export const useSelector = ReactRedux.useSelector;
export const useStore = ReactRedux.useStore;
