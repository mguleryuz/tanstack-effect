// @ts-check

import importX from 'eslint-plugin-import-x'
import prettier from 'eslint-plugin-prettier'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig({
  files: ['**/*.{mjs,cjs,js,ts}'],
  ignores: [
    'dist/**',
    'node_modules/**',
    '**/.*',
    '**/*.test.{mjs,cjs,js,ts}',
    '**/*.spec.{mjs,cjs,js,ts}',
    '**/*.config.{mjs,cjs,js,ts}',
  ],
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    prettier,
    // Cast to any to work around upstream type incompatibility in plugin configs
    'import-x': /** @type {any} */ (importX),
  },

  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: true,
    },
  },
  rules: {
    // ImportX rules
    ...importX.configs.recommended.rules,
    'import-x/no-unresolved': 'off',
    'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],

    // Prettier rules
    'prettier/prettier': 'error',

    // TypeScript rules
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
})
