import globals from 'globals';

/**
@type {import('xo').FlatXoConfig}
*/
const xoConfig = [
	{
		ignores: ['demo-extension/package.json'],
	},
	{
		files: ['source/**/*.test.ts'],
		rules: {
			// `node:test` registers tests synchronously and returns promises
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.webextensions,
			},
		},
		rules: {
			'no-implicit-globals': 'off',
			'@typescript-eslint/strict-void-return': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/no-implicit-any-catch': 'off',
			'@typescript-eslint/naming-convention': 'off',
			'import/extensions': 'off',
			'import/no-unassigned-import': 'off',
			'unicorn/prefer-top-level-await': 'off',
			'unicorn/prefer-node-protocol': 'off',
			'n/file-extension-in-import': 'off',
		},
	},
];

export default xoConfig;
