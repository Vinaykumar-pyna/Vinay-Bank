/**
 * Jest + React Testing Library.
 * TypeScript is compiled by ts-jest (transpile-only; `tsc -b` does type checking).
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    // Vite-only `import.meta.env` lives in one module, replaced in tests.
    '^@/config/env$': '<rootDir>/src/test/envMock.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|scss)$': 'identity-obj-proxy',
    '\\.(svg|png|jpg|jpeg|gif|webp|woff2?)$': '<rootDir>/src/test/fileMock.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/main.tsx',
    '!src/test/**',
    '!src/**/*.d.ts',
    '!src/config/env.ts',
  ],
  coverageDirectory: 'coverage',
};
