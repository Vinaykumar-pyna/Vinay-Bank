import '@fontsource-variable/inter';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import './styles/main.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from './app/store';
import { installAutoHideScrollbars } from './lib/scrollbars';
import { setupAuthInterceptors } from './lib/session';

// Attach tokens to API calls and refresh expired sessions transparently.
setupAuthInterceptors(store);
// Scrollbar thumbs stay hidden until an area is scrolled or pointed at.
installAutoHideScrollbars();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
