module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { args: 'none' }],
    'no-console': 'off',
  },
  ignorePatterns: ['node_modules/', 'coverage/', 'database/', 'tests/tmp/'],
};
