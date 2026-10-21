import globals from 'globals';

/**
@type {import('xo').FlatXoConfig}
*/
const xoConfig = [
	{
		ignores: ['demo-extension/package.json'],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.webextensions,
			},
		},
		rules: {
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/naming-convention': 'off',
			'import-x/no-unassigned-import': 'off',
			'unicorn/prefer-top-level-await': 'off',
			// Async listeners are intentional, and `removeListener` needs the same reference
			'@typescript-eslint/strict-void-return': 'off',
			'regexp/no-useless-character-class': 'off',
			'unicorn/prefer-string-replace-all': 'off',
		},
	},
];

export default xoConfig;
