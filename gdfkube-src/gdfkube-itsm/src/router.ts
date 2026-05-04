// In-app router for the ITSM portal demo.
//
// Per design D3 the prototype uses an in-app reducer router instead of a
// router library. This module exposes a `useRouter()` hook that holds
// `{ route, params }` via `useReducer` and returns a `navigate(name, params?)`
// callback. The hook is the only public surface — pages receive `navigate`
// (and optionally `route`/`params`) as props from `App`.

import { useCallback, useReducer } from 'react';
import type { RouteName, RouteParams } from './types';

export type { RouteName, RouteParams } from './types';

export type Route = {
  name: RouteName;
  params: RouteParams;
};

type RouterState = Route;

type RouterAction = {
  type: 'NAVIGATE';
  name: RouteName;
  params: RouteParams;
};

const INITIAL_STATE: RouterState = { name: 'home', params: {} };

function routerReducer(_state: RouterState, action: RouterAction): RouterState {
  switch (action.type) {
    case 'NAVIGATE':
      return { name: action.name, params: action.params };
    default: {
      const _exhaustive: never = action.type;
      return _exhaustive;
    }
  }
}

export type Navigate = (name: RouteName, params?: RouteParams) => void;

export type RouterApi = {
  route: RouteName;
  params: RouteParams;
  navigate: Navigate;
};

/**
 * Reducer-backed router. Returns the current `route` name, its `params`,
 * and a stable `navigate(name, params?)` callback. Initial state is
 * `{ route: "home", params: {} }`.
 */
export function useRouter(): RouterApi {
  const [state, dispatch] = useReducer(routerReducer, INITIAL_STATE);

  const navigate = useCallback<Navigate>((name, params) => {
    dispatch({ type: 'NAVIGATE', name, params: params ?? {} });
  }, []);

  return { route: state.name, params: state.params, navigate };
}
