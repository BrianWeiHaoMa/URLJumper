import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import './options-page.css';
import { OptionsPage } from './OptionsPage';

const root = document.getElementById('root');
if (!root) throw new Error('options.html has no #root element');
createRoot(root).render(
  <StrictMode>
    <OptionsPage />
  </StrictMode>,
);
