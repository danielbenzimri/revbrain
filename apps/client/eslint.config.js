import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Downgrade to warning — informational about React Compiler compatibility,
      // not a code defect. TanStack Virtual is not yet React Compiler-safe.
      'react-hooks/incompatible-library': 'warn',
    },
  },
  // Disable all linting for legacy lift-and-shift modules
  // These will be refactored in future iterations
  {
    files: ['**/features/modules/legacy/**/*.{ts,tsx}'],
    rules: {
      // Disable all TypeScript rules for legacy code
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Disable all React rules for legacy code
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
      // Disable general rules for legacy code
      'no-empty': 'off',
    },
  },
  // Allow Context files to export both provider and hook (standard React pattern)
  {
    files: ['**/contexts/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]);
