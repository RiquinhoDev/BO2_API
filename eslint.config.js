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

      // Reactivate when TypeScript strict starts rolling out in waves.
      // With strict:false, 1965 existing violations across 183 files are migration noise.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
