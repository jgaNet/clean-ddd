import 'dotenv/config';
import { createRequire } from 'module';
import { pathsToModuleNameMapper } from 'ts-jest';

// JSON import attributes (`with { type: 'json' }`) are not understood by the TypeScript
// version behind eslint yet, and the older `assert` form was dropped by Node 22+.
const tsconfig = createRequire(import.meta.url)('./tsconfig.json');

const isCI = process.env.CI === 'true';

export default {
  verbose: true,
  collectCoverage: false,
  resetModules: true,
  restoreMocks: true,
  testEnvironment: 'node',
  transform: {},
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.test.json',
      useESM: true,
    },
  },
  collectCoverageFrom: ['<rootDir>/src/*.ts'],
  coveragePathIgnorePatterns: ['<rootDir>/dist/', '/node_modules/', '<rootDir>/scripts', '<rootDir>/tools'],
  coverageProvider: 'v8',
  coverageReporters: isCI ? ['json'] : ['text'],
  moduleDirectories: ['node_modules', 'src'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths),
};
