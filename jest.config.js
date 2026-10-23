// Two projects = two test boundaries, visible right in the config.
//   unit        — no I/O, runs in parallel     (npm run test:unit)
//   integration — real Postgres, runs in band  (npm run test:integration)
//
// ts-jest type-checks every test file (a type error fails the test run).
// It compiles to CommonJS so jest.mock() works without ESM workarounds.
const tsJest = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'bundler' } }],
};

/** @type {import('jest').Config} */
module.exports = {
  // Coverage gate only where unit tests are the right tool (business rules). Routes and repositories are
  // covered by component / integration tests, so a unit-test threshold on them would only force bad tests.
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageThreshold: {
    './src/domain/': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/services/': { statements: 90, branches: 90, functions: 100, lines: 90 },
  },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: tsJest,
      testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/support/setupFaker.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: tsJest,
      testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
      setupFiles: ['<rootDir>/test/integration/env.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/support/setupFaker.ts'],
    },
  ],
};
