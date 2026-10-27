/** Lints the tooling under tools/; each language lints its own tree with its own linter. */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['tools/dist/', 'typescript/', 'rust/', 'python/', 'go/', 'web/', 'api/', 'docs/', '**/*.d.ts'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-inferrable-types': ['off'],
    },
  },
);
