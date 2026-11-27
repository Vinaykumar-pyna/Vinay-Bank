import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/router';
import { store } from './app/store';
import { CursorEffects } from './components/common/CursorEffects';
import { AuthBootstrap } from './features/auth/AuthBootstrap';
import { releaseBootSplash } from './lib/bootSplash';

export default function App() {
  // Pages that need no loading screen at start-up (the landing page) fade the boot splash out at once.
  useEffect(() => releaseBootSplash(), []);

  return (
    <Provider store={store}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
      <CursorEffects />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          className: 'shadow-sm',
          style: { background: 'var(--vb-surface)', color: 'var(--bs-body-color)' },
        }}
      />
    </Provider>
  );
}
