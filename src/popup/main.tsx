import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import '../theme.css';
import './popup.css';
import { Popup } from './Popup';

const root = document.getElementById('root');
if (!root) throw new Error('popup.html has no #root element');
// Drawn before this script returns, so the search box is there and focused by the page's load event, when
// Chrome shows the popup and gives it the keyboard; a first render left to React's scheduler can come after,
// and a key typed in between is lost.
flushSync(() =>
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  ),
);
