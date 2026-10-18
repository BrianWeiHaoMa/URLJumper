import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import './popup.css';
import { Popup } from './Popup';

const root = document.getElementById('root');
if (!root) throw new Error('popup.html has no #root element');
createRoot(root).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
