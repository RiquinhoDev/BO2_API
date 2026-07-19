const js = require('@eslint/js')
const typescriptEslint = require('@typescript-eslint/eslint-plugin')
const globals = require('globals')

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // TypeScript strict is now enabled. Reactivate this through its own
      // suppression-ratcheted migration: 1965 violations across 183 files
      // are too large to fold into the atomic strict-mode change safely.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
