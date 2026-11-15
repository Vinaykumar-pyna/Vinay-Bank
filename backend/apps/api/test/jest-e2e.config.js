/**
 * End-to-end tests: boot the real AppModule against a throwaway in-memory
 * MongoDB replica set and exercise it over HTTP with supertest.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '../../..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'apps/api/test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@app/shared(|/.*)$': '<rootDir>/libs/shared/src$1',
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/apps/api/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/apps/api/test/setup/global-teardown.ts',
  setupFiles: ['<rootDir>/apps/api/test/setup/env.ts'],
  testTimeout: 60000,
  // `npm run test:e2e:cov`: what the end-to-end suite exercises across both NestJS apps and the shared lib.
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    'apps/card-switch/src/**/*.ts',
    'libs/shared/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/main.ts',
  ],
  coverageDirectory: 'coverage/e2e',
};
