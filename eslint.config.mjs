import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'node_modules/**', '.npm-cache/**'] },
  ...compat.extends('next/core-web-vitals'),
];

export default config;
