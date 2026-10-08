import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    '.next/**',
    '.next-auth-transition-*/**',
    '.tsconfig-auth-transition-*.json',
    '.artifacts/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'node_modules/**',
    '**/*.min.js',
  ]),
]);
