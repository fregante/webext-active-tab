import {setTimeout as sleep} from 'node:timers/promises';
import {describe, it, type TestContext} from 'node:test';
import {disableWebextDetectPageCache} from 'webext-detect';

// The modules decide what to do at import time, based on the environment
disableWebextDetectPageCache();

type Listener = (...arguments_: unknown[]) => unknown;
type Injection = {target: unknown; files?: string[]};

const listeners: Record<'action' | 'onUpdated', Listener[]> = {action: [], onUpdated: []};
const mockEvent = (name?: keyof typeof listeners) => ({
	addListener(listener: Listener) {
		if (name !== undefined) {
			listeners[name].push(listener);
		}
	},
	removeListener: () => undefined,
});

const scripts: Injection[] = [];
const styles: Injection[] = [];

// This environment lacks `chrome.webNavigation`, so only top frames are injected
Object.assign(globalThis, {
	location: {origin: 'chrome-extension://abc', pathname: '/background.js'},
	chrome: {
		runtime: {
			id: 'abc',
			getManifest: () => ({manifest_version: 3, permissions: ['activeTab'], background: {service_worker: 'background.js'}}),
		},
		action: {onClicked: mockEvent('action')},
		contextMenus: {onClicked: mockEvent()},
		commands: {onCommand: mockEvent()},
		tabs: {onUpdated: mockEvent('onUpdated'), onRemoved: mockEvent()},
		scripting: {
			async executeScript(injection: Injection) {
				scripts.push(injection);
				return [];
			},
			async insertCSS(injection: Injection) {
				styles.push(injection);
			},
		},
	},
});

const {default: registerActiveTabScripts} = await import('./register-active-tab-scripts.ts');

registerActiveTabScripts({js: ['a.js'], css: ['a.css']}, {js: ['b.js']});

// `onActiveTab` registers its own `onUpdated` listener first
const [, tabListener] = listeners.onUpdated;

const activate = async (id: number, url: string) => {
	await listeners.action[0]!({id, url});
	await sleep(10);
};

describe('registerActiveTabScripts without webNavigation', () => {
	it('should inject in the top frame as soon as the tab becomes active', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		await activate(1, 'https://example.com/page');

		t.assert.deepStrictEqual(scripts.map(({target, files}) => ({target, files})), [
			{target: {tabId: 1, frameIds: [0]}, files: ['a.js']},
			{target: {tabId: 1, frameIds: [0]}, files: ['b.js']},
		]);
		t.assert.deepStrictEqual(styles.map(({target, files}) => ({target, files})), [
			{target: {tabId: 1, frameIds: [0]}, files: ['a.css']},
		]);
	});

	it('should inject again when an active tab starts loading a page', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		scripts.length = 0;

		await tabListener!(1, {status: 'loading'}, {url: 'https://example.com/other-page'});

		t.assert.deepStrictEqual(scripts.map(({target}) => target), [
			{tabId: 1, frameIds: [0]},
			{tabId: 1, frameIds: [0]},
		]);
	});

	it('should not inject when the page is not loading, has no URL or is on another origin', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		scripts.length = 0;

		await tabListener!(1, {status: 'complete'}, {url: 'https://example.com/page'});
		await tabListener!(1, {status: 'loading'}, {});
		await tabListener!(1, {status: 'loading'}, {url: 'https://example.org/'});

		t.assert.deepStrictEqual(scripts, []);
	});

	it('should not inject in tabs that are not active', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		scripts.length = 0;

		await tabListener!(2, {status: 'loading'}, {url: 'https://example.com/page'});

		t.assert.deepStrictEqual(scripts, []);
	});
});
