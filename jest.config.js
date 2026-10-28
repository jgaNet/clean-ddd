/** The tooling's own specs, run from the root with `yarn test`; the languages test themselves. */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tools/tsconfig.json' }],
  },
  testMatch: ['<rootDir>/tools/src/**/*.spec.ts'],
  // A spec that spawns the CLI, or creates an application, takes seconds, not milliseconds.
  testTimeout: 60000,
  modulePathIgnorePatterns: ['<rootDir>/tools/dist/'],
};
