/* eslint-disable react-refresh/only-export-components --
 * dataContext.tsx is the single entry point for state types, the reducer,
 * the provider component, and the consumer hooks. Splitting it across files
 * would obscure intent and add no functional benefit; HMR for the rest of
 * the app is unaffected because consumers never re-import this file at runtime.
 */
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  ApprovalDecision,
  Field,
  FormDef,
  Group,
  Request,
  RequestStatus,
  TemplateFile,
  User,
} from '../types';

export type DataState = {
  requests: Request[];
  forms: FormDef[];
  fields: Record<string, Field[]>;
  users: User[];
  groups: Group[];
  templates: Record<string, TemplateFile[]>;
};

export type DataAction =
  | { type: 'ADD_REQUEST'; request: Request }
  | {
      type: 'UPDATE_REQUEST_STATUS';
      id: string;
      status: RequestStatus;
      stage?: number;
      decision?: ApprovalDecision;
    }
  | { type: 'ADD_FORM'; form: FormDef }
  | { type: 'UPDATE_FORM'; id: string; patch: Partial<FormDef> }
  | { type: 'REORDER_FIELDS'; formId: string; from: number; to: number }
  | { type: 'UPDATE_FIELD'; formId: string; key: string; patch: Partial<Field> }
  | { type: 'UPDATE_TEMPLATES'; formId: string; templates: TemplateFile[] }
  | { type: 'ADD_USER'; user: User }
  | { type: 'UPDATE_USER'; id: string; patch: Partial<User> }
  | { type: 'ADD_GROUP'; group: Group }
  | { type: 'UPDATE_GROUP'; id: string; patch: Partial<Group> };

export function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'ADD_REQUEST':
      return { ...state, requests: [...state.requests, action.request] };

    case 'UPDATE_REQUEST_STATUS':
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== action.id) return r;
          const next: Request = { ...r, status: action.status };
          if (action.stage !== undefined) next.stage = action.stage;
          if (action.decision) {
            next.approvalChain = [...(r.approvalChain ?? []), action.decision];
          }
          return next;
        }),
      };

    case 'ADD_FORM':
      return {
        ...state,
        forms: [...state.forms, action.form],
        fields: state.fields[action.form.id]
          ? state.fields
          : { ...state.fields, [action.form.id]: [] },
      };

    case 'UPDATE_FORM':
      return {
        ...state,
        forms: state.forms.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      };

    case 'REORDER_FIELDS': {
      const list = state.fields[action.formId];
      if (!list) return state;
      const next = list.slice();
      const [moved] = next.splice(action.from, 1);
      if (!moved) return state;
      next.splice(action.to, 0, moved);
      return { ...state, fields: { ...state.fields, [action.formId]: next } };
    }

    case 'UPDATE_FIELD': {
      const list = state.fields[action.formId];
      if (!list) return state;
      const exists = list.some((f) => f.key === action.key);
      const next = exists
        ? list.map((f) => (f.key === action.key ? { ...f, ...action.patch } : f))
        : [...list, { key: action.key, label: action.key, type: 'text', bucket: 'vars', ...action.patch } as Field];
      return { ...state, fields: { ...state.fields, [action.formId]: next } };
    }

    case 'UPDATE_TEMPLATES':
      return {
        ...state,
        templates: { ...state.templates, [action.formId]: action.templates },
      };

    case 'ADD_USER':
      return { ...state, users: [...state.users, action.user] };

    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)),
      };

    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.group] };

    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

const DataStateContext = createContext<DataState | undefined>(undefined);
const DataDispatchContext = createContext<Dispatch<DataAction> | undefined>(undefined);

export function GdfDataProvider({
  initial,
  children,
}: {
  initial: DataState;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(dataReducer, initial);
  // Memoize so referentially-equal state across renders doesn't churn.
  const stateValue = useMemo(() => state, [state]);
  return (
    <DataStateContext.Provider value={stateValue}>
      <DataDispatchContext.Provider value={dispatch}>{children}</DataDispatchContext.Provider>
    </DataStateContext.Provider>
  );
}

export function useGdfData(): DataState {
  const ctx = useContext(DataStateContext);
  if (!ctx) throw new Error('useGdfData must be used inside <GdfDataProvider>');
  return ctx;
}

export function useGdfDispatch(): Dispatch<DataAction> {
  const ctx = useContext(DataDispatchContext);
  if (!ctx) throw new Error('useGdfDispatch must be used inside <GdfDataProvider>');
  return ctx;
}
