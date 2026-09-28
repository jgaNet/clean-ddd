module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint/eslint-plugin', 'import', 'eslint-plugin-tsdoc'],
  extends: ['plugin:@typescript-eslint/recommended'],
  env: {
    jest: true,
    node: true,
  },
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-dupe-class-members': ['error'],
    '@typescript-eslint/no-useless-constructor': ['error'],
    '@typescript-eslint/no-inferrable-types': ['off'],

    // 'import/extensions': ['error', 'ignorePackages', { js: 'always', jsx: 'never', ts: 'never', tsx: 'never' }],
  },

  // Architecture boundaries: Presentation -> Infrastructure -> Application -> Domain, never the other way.
  // Imports are matched on their path alias, which is also why relative imports across layers are not allowed.
  overrides: [
    {
      files: ['src/Contexts/*/Domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@Contexts/*/Application',
                  '@Contexts/*/Application/**',
                  '@SharedKernel/Application',
                  '@SharedKernel/Application/**',
                  '**/Infrastructure',
                  '**/Infrastructure/**',
                  '**/Presentation',
                  '**/Presentation/**',
                  '@Bootstrap/**',
                  'fastify',
                ],
                message: 'The Domain layer depends on nothing outside the Domain.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/Contexts/*/Application/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/Infrastructure',
                  '**/Infrastructure/**',
                  '**/Presentation',
                  '**/Presentation/**',
                  '@Bootstrap/**',
                  'fastify',
                ],
                message: 'The Application layer may only depend on the Domain.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/Contexts/*/Application/**/*.spec.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/Presentation', '**/Presentation/**', '@Bootstrap/**', 'fastify'],
                message: 'Application tests may use in-memory Infrastructure as test doubles, nothing further out.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/Contexts/*/Infrastructure/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/Presentation', '**/Presentation/**', '@Bootstrap/**'],
                message: 'The Infrastructure layer does not depend on Presentation or Bootstrap.',
              },
            ],
          },
        ],
      },
    },
  ],
};
