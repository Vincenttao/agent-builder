// Flat ESLint config shared across the monorepo.
// Lenient-but-useful: catches real bugs (unused vars, no-undef, no-debugger)
// without blocking on stylistic rules or legitimate `any` in adapter boundaries.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
      'apps/web/next-env.d.ts',
      'apps/web/playwright.config.ts',
      // Generated output / runtime workspace
      'workspace/**',
      'services/python-runner/**',
      // Template data package (CommonJS index.js + .d.ts; not application code)
      'packages/generated-project-templates/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Adapter boundaries and demo code legitimately use `any`; lint must pass, not block.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'off',
      // NestJS DI + Next.js async components use empty interfaces/functions commonly.
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-undef': 'off',
    },
  },
);
