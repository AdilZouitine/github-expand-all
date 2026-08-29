/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    (message) => message.startsWith('Merge '),
    (message) => message.startsWith('Revert "'),
  ],
};

export default config;
