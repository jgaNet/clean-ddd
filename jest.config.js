import 'dotenv/config';
import { createRequire } from 'module';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsconfig = createRequire(import.meta.url)('./tsconfig.json');

const isCI = process.env.CI === 'true';

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
  moduleNameMapper: pathsToModuleNameMapper(tsconfig.compilerOptions.paths),
  moduleDirectories: ['node_modules', 'src'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coveragePathIgnorePatterns: ['<rootDir>/dist/', '/node_modules/'],
  coverageProvider: 'v8',
  coverageReporters: isCI ? ['json'] : ['text'],
};
