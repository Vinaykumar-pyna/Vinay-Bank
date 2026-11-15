import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { makeStore, type RootState } from '@/app/store';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  route?: string;
}

/** Renders a component with a fresh Redux store and an in-memory router. */
export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, route = '/', ...options }: Options = {},
) {
  const store = makeStore(preloadedState);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Provider>
    );
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}
