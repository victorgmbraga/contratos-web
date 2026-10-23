import js from '@eslint/js';
import globals from 'globals';

const languageOptions = (globalsSet) => ({
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: globalsSet,
});

export default [
  {
    ignores: [
      'dist-browser/**',
      'dist-browser-test/**',
      'node_modules/**',
      'coverage/**',
      '.npm-cache/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'public/**/*.js'],
    languageOptions: languageOptions({
      ...globals.browser,
      ...globals.serviceworker,
    }),
    rules: {
      // Distribution code must not log: diagnostics belong to the application UI.
      'no-console': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-return-assign': ['error', 'except-parens'],
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unreachable-loop': 'error',
      'no-promise-executor-return': 'error',
    },
  },
  {
    // The JSON parser deliberately scans control characters in filter values.
    files: ['src/validation.js'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    // Runs before the module graph and stays ES5 so it never blocks the first paint.
    files: ['public/theme-boot.js'],
    rules: { 'no-var': 'off' },
  },
  {
    // Browser tests mix Node orchestration with code evaluated inside the page.
    files: ['test/**/*.js', 'test/**/*.mjs'],
    languageOptions: languageOptions({ ...globals.node, ...globals.browser }),
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: languageOptions({ ...globals.node }),
  },
];
