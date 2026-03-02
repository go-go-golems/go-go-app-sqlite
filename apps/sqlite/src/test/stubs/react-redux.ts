export function useDispatch() {
  return () => undefined;
}

export function useSelector<T>(selector: (state: unknown) => T): T {
  return selector({});
}

export function useStore() {
  return {
    getState() {
      return {};
    },
  };
}
