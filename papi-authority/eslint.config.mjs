// @ts-check
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * papi-authority lint policy.
 *
 * Deliberately stricter than papi-back, which configures `parserOptions.project`
 * but enables ZERO type-aware rules and turns `no-explicit-any` off. In an
 * identity/authorization service a floating promise inside a guard is an auth
 * bug, so the type-checked rule set is mandatory here. See dossier D.3b.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      /* ---------------------------------------------------------------
       * Security-relevant
       * ------------------------------------------------------------- */

      /**
       * Mechanically enforces "never read process.env outside src/configs".
       * papi-back documents this rule in CLAUDE.md but never enforces it, and
       * five of its files violate it today (dossier D.3b). A convention with
       * no enforcement is not a control.
       */
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through ConfigService. process.env may only be accessed inside src/configs/**.',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      /* ---------------------------------------------------------------
       * Hygiene
       * ------------------------------------------------------------- */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'enum', format: ['PascalCase'] },
      ],

      // No logger exists yet (dossier 0.15 — the company logging package lands
      // at the final step). Until then nothing may write to stdout ad hoc.
      'no-console': 'error',

      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          pathGroups: [
            { pattern: '@nestjs/**', group: 'external', position: 'before' },
            { pattern: '$/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['@nestjs/**'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // `baseUrl` is absent by design (dossier 0.16) so bare `src/...` imports
      // cannot resolve; this makes the failure explicit rather than confusing.
      'import/no-absolute-path': 'error',
    },
  },

  {
    // The configs module's entire job is reading the environment.
    files: ['src/configs/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  {
    // Pre-bootstrap guards run before any DI container exists, and the TypeORM
    // CLI data-source runs outside Nest entirely (no ConfigService available).
    files: [
      'src/main.ts',
      'src/typeorm-cli-data-source.ts',
      'src/seeder/**/*.ts',
      'src/scripts/**/*.ts',
    ],
    rules: { 'no-restricted-properties': 'off', 'no-console': 'off' },
  },

  prettierRecommended,
);
