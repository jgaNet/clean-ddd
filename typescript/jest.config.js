import 'dotenv/config';
import { createRequire } from 'module';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsconfig = createRequire(import.meta.url)('./tsconfig.json');

const isCI = process.env.CI === 'true';

// The end-to-end suites sign in as the administrator the application is seeded with, and it seeds
// one only when both are set (there is no default), so the test run sets them.
process.env.ADMIN_IDENTIFIER ||= 'admin@admin.fr';
process.env.ADMIN_PASSWORD ||= 'admin';

export default {
  verbose: true,
  collectCoverage: false,
  resetModules: true,
  restoreMocks: true,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: './tsconfig.test.json' }],
  },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  // The end-to-end suites boot the whole application (bcrypt seed included) in beforeAll.
  testTimeout: 20000,
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths),
  moduleDirectories: ['node_modules', 'src'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: ['<rootDir>/dist/', '/node_modules/'],
  coverageProvider: 'v8',
  coverageReporters: isCI ? ['json'] : ['text'],
};
