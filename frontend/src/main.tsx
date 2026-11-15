import '@fontsource-variable/inter';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import './styles/main.scss';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from './app/store';
import { setupAuthInterceptors } from './lib/session';

// Attach tokens to API calls and refresh expired sessions transparently.
setupAuthInterceptors(store);

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
