/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from 'jest';

// Settings shared by every project. Kept in one place so the unit and
// integration suites stay in sync on transform/module resolution.
const common: Config = {
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^homebridge$': '<rootDir>/__mocks__/homebridge.js',
  },

  // Transform TypeScript using @swc/jest (replaces ts-jest)
  transform: {
    '^.+\\.[jt]sx?$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' } } },
    ],
  },

  // Transform ESM-only packages in node_modules
  transformIgnorePatterns: ['/node_modules/(?!homebridge(?!-base-platform))'],

  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};

const config: Config = {
  // Coverage is a global concern; the integration helpers are scaffolding, not
  // production code, so they are excluded from the report.
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/__integration__/',
  ],

  // Coverage guard: fails `npm test` (and therefore CI, which runs the tests)
  // if coverage regresses below these floors. Set just under the current
  // numbers (stmts 84.5 / branch 72.3 / funcs 84.9 / lines 84.9) so normal
  // churn passes while a real drop fails the build. Ratchet up as coverage
  // improves.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },

  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['**/__tests__/?(*.)+(spec|test).[tj]s?(x)'],
    },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['**/__integration__/?(*.)+(spec|test).[tj]s?(x)'],
      // The platform performs real (local) HTTP round-trips; give it headroom.
      testTimeout: 15000,
    },
  ],
};

export default config;
