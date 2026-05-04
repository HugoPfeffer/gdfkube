import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { GdfDataProvider, type DataState } from './state/dataContext';
import { REQUESTS } from './data/seeds';
import { FIELDS, FORMS, GROUPS, USERS } from './data/adminSeeds';
import { DEFAULT_TEMPLATES } from './data/defaultTemplates';

const initial: DataState = {
  requests: [...REQUESTS],
  forms: [...FORMS],
  fields: { ...FIELDS },
  users: [...USERS],
  groups: [...GROUPS],
  templates: { ...DEFAULT_TEMPLATES },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GdfDataProvider initial={initial}>
      <App />
    </GdfDataProvider>
  </StrictMode>,
);
