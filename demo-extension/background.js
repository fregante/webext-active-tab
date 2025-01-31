import registerActiveTabScripts from 'webext-active-tab/register-active-tab-scripts';
import js from 'url:./content.js';
import css from 'url:./content.css';

registerActiveTabScripts({
	js: [
		new URL(js).pathname,
	],
	css: [
		new URL(css).pathname,
	],
});

console.log('Background loaded');
