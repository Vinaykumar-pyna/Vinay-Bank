import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'light' | 'dark';

export interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
}

export const THEME_STORAGE_KEY = 'vb-theme';

function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
}

const initialState: UiState = {
  theme: initialTheme(),
  sidebarOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
    },
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
    openSidebar(state) {
      state.sidebarOpen = true;
    },
    closeSidebar(state) {
      state.sidebarOpen = false;
    },
  },
});

export const { toggleTheme, setTheme, openSidebar, closeSidebar } = uiSlice.actions;
export default uiSlice.reducer;
