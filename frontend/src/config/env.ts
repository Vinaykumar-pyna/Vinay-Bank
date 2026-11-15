/**
 * The only module that reads Vite's `import.meta.env`. Everything else imports
 * from here, which keeps configuration in one place and lets Jest replace it.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? '',
  apiDocsUrl: import.meta.env.VITE_API_DOCS_URL ?? '/api/docs',
  isDev: import.meta.env.DEV,
  appVersion: import.meta.env.VITE_APP_VERSION ?? '1.0.0',
  /** Shows the demo sign-in shortcuts on the login page. Set VITE_SHOW_DEMO_ACCOUNTS=false for real deployments. */
  showDemoAccounts: import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false',
} as const;
