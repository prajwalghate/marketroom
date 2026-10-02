import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Workspace lint configuration.
 *
 * The import-boundary rules below are the architectural firewall described in
 * README.md — dependencies point inward, and a violation fails CI rather than
 * depending on someone noticing it in review.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
      'packages/catalog/src/assets/**', // Generated data files.
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ── core: pure. No workspace dependencies, no I/O. ──────────────────────
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@marketroom/*'],
              message:
                '@marketroom/core must stay dependency-free. Shared logic moves INTO core, never the other way around.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'core is pure — all I/O belongs in @marketroom/adapters.' },
      ],
    },
  },

  // ── ui: presentational. No I/O. ─────────────────────────────────────────
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@marketroom/adapters', '@marketroom/adapters/*'],
              message:
                '@marketroom/ui is presentational and must not fetch. Pass data in as props.',
            },
          ],
        },
      ],
    },
  },

  // ── catalog: curated data only. ─────────────────────────────────────────
  {
    files: ['packages/catalog/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@marketroom/adapters', '@marketroom/ui'],
              message: '@marketroom/catalog is pure curated data.',
            },
          ],
        },
      ],
    },
  },

  // ── No raw colour outside tokens.css ────────────────────────────────────
  // tokens.css and the proposal both claim this is enforced; until now it was
  // not. Every colour must resolve to a `--mr-*` token, or the design system is
  // a suggestion rather than a contract.
  {
    files: ['packages/ui/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'Raw colour literal. Use a var(--mr-*) token from packages/ui/src/tokens.css.',
        },
        {
          selector: "Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]",
          message:
            'Raw colour literal. Use a var(--mr-*) token from packages/ui/src/tokens.css.',
        },
      ],
    },
  },

  // ── web: only adapters may talk to the network. ─────────────────────────
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'warn',
        {
          name: 'fetch',
          message:
            'Prefer an adapter in @marketroom/adapters so caching and retries stay in one place.',
        },
      ],
    },
  },

  // Scripts and tests are allowed to log and to stub globals.
  //
  // `.mjs` is included deliberately: the maintenance scripts run under plain
  // Node, so without declaring its globals every `console` and `process` reads
  // as undefined and the whole file fails `no-undef`.
  {
    files: ['**/scripts/**/*.{ts,mjs,js}', '**/*.test.ts', '**/*.config.{ts,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
