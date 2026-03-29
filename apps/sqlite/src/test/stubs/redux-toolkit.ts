type CaseReducer<S> = (state: S, action: { type: string; payload?: unknown }) => void;
type ActionCreator<P = unknown> = ((payload: P) => { type: string; payload: P }) & { type: string };

interface SliceOptions<S> {
  name: string;
  initialState: S;
  reducers: Record<string, CaseReducer<S>>;
  extraReducers?: (builder: {
    addCase: (type: string | ActionCreator, reducer: CaseReducer<S>) => void;
  }) => void;
}

function cloneState<S>(value: S): S {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as S;
}

export function createAction<P = unknown>(type: string): ActionCreator<P> {
  const actionCreator = ((payload: P) => ({ type, payload })) as ActionCreator<P>;
  actionCreator.type = type;
  return actionCreator;
}

export function createSlice<S>(options: SliceOptions<S>) {
  const ownCaseMap: Record<string, CaseReducer<S>> = {};
  for (const [name, reducer] of Object.entries(options.reducers)) {
    ownCaseMap[`${options.name}/${name}`] = reducer;
  }

  const extraCaseMap: Record<string, CaseReducer<S>> = {};
  if (options.extraReducers) {
    options.extraReducers({
      addCase(type, reducer) {
        const actionType =
          typeof type === 'function' && typeof (type as ActionCreator).type === 'string'
            ? (type as ActionCreator).type
            : String(type);
        extraCaseMap[actionType] = reducer;
      },
    });
  }

  function reducer(state: S | undefined, action: { type: string; payload?: unknown }): S {
    const draft = cloneState(state ?? options.initialState);
    const handler = ownCaseMap[action.type] ?? extraCaseMap[action.type];
    if (handler) {
      handler(draft, action);
    }
    return draft;
  }

  const actions = Object.fromEntries(
    Object.keys(options.reducers).map((name) => [
      name,
      (payload: unknown) => ({ type: `${options.name}/${name}`, payload }),
    ]),
  );

  return {
    reducer,
    actions,
  };
}
