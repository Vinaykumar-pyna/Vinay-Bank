import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  isAnyOf,
} from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@/api/baseApi';
import authReducer, { loggedOut } from '@/features/auth/authSlice';
import uiReducer, { setTheme, THEME_STORAGE_KEY, toggleTheme } from './uiSlice';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Side effects live in listeners, keeping reducers pure. */
const listener = createListenerMiddleware();

listener.startListening({
  matcher: isAnyOf(toggleTheme, setTheme),
  effect: (_action, api) => {
    const theme = (api.getState() as RootState).ui.theme;
    document.documentElement.setAttribute('data-bs-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private mode or storage disabled: the theme still applies for this session.
    }
  },
});

// Never let one user's cached data be visible to the next user on a shared device.
listener.startListening({
  actionCreator: loggedOut,
  effect: (_action, api) => {
    api.dispatch(baseApi.util.resetApiState());
  },
});

export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(listener.middleware).concat(baseApi.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
