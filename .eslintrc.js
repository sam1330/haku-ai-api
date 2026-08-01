module.exports = {
  env: {
    node: true,
    commonjs: true,
    jest: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    // add custom rules here
  },
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
      ],
      rules: {
        // Repo stays CommonJS (require/module.exports) throughout the TS migration.
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
