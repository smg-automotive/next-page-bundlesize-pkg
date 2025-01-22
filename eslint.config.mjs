import globals from 'globals';
// eslint-disable-next-line import/no-unresolved
import baseConfig from '@smg-automotive/eslint-config/default';

export default [
  ...baseConfig,
  {
    ignores: ['!.prettierrc.mjs'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.es2021,
      },
    },
  },
  {
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
];
