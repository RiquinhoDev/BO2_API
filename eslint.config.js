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

      // Ratcheted: 'error' + bulk-suppressions baseline (eslint-suppressions.json).
      // Novo `any` falha o lint; os existentes descem por moagem + lint:baseline:prune.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]
