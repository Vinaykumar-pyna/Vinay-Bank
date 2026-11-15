import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/router';
import { store } from './app/store';
import { AuthBootstrap } from './features/auth/AuthBootstrap';

export default function App() {
  return (
    <Provider store={store}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          className: 'shadow-sm',
          style: { background: 'var(--ab-surface)', color: 'var(--bs-body-color)' },
        }}
      />
    </Provider>
  );
}
