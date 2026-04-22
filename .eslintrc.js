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
};