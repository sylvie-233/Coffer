import reactConfig from '@coffer/eslint-config/react';

export default [
  ...reactConfig,
  {
    ignores: ['android/**', 'ios/**', '.expo/**', 'expo-env.d.ts'],
  },
  {
    // Metro / Babel / Config Plugin 与 React Native 静态资源 require 都是运行时约定。
    files: ['metro.config.js', 'babel.config.js', 'plugins/**/*.js', 'app/**/*.tsx', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
