import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { Bootstrap } from './shell/Bootstrap';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap>
      <App />
    </Bootstrap>
  </StrictMode>,
);
