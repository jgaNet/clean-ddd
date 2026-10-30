import 'dotenv/config';

export default {
  verbose: true,
  resetModules: true,
  restoreMocks: true,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: './tsconfig.test.json' }],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  testTimeout: 20000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
