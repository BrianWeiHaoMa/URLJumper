import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from './SettingsPage';
import '../styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root element not found');
}

createRoot(container).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>,
);
