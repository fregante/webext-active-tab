import {setTimeout as sleep} from 'node:timers/promises';
import {describe, it, type TestContext} from 'node:test';
import {disableWebextDetectPageCache} from 'webext-detect';

// The modules decide what to do at import time, based on the environment
disableWebextDetectPageCache();

type Listener = (...arguments_: unknown[]) => unknown;
type Injection = {target: {frameIds: number[]}; files?: string[]};

const listeners: Record<'action' | 'onUpdated' | 'onCommitted', Listener[]> = {action: [], onUpdated: [], onCommitted: []};
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
		webNavigation: {
			async getAllFrames() {
				return [
					{frameId: 0, url: 'https://example.com/page'},
					{frameId: 3, url: 'https://example.com/frame'},
					{frameId: 4, url: 'https://ads.example.net/'},
				];
			},
			onCommitted: mockEvent('onCommitted'),
		},
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

const activate = async (id: number, url: string) => {
	await listeners.action[0]!({id, url});
	await sleep(10);
};

const describeInjections = (injections: Injection[]) => injections.map(({target, files}) => `${String(files)} in frame ${target.frameIds.join(',')}`).toSorted();

describe('registerActiveTabScripts with webNavigation', () => {
	it('should not listen to tab updates', (t: TestContext) => {
		// Only the listener that drops tabs whose origin changed
		t.assert.strictEqual(listeners.onUpdated.length, 1);
		t.assert.strictEqual(listeners.onCommitted.length, 1);
	});

	it('should inject in all the frames with the same origin as soon as the tab becomes active', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		await activate(1, 'https://example.com/page');

		t.assert.deepStrictEqual(describeInjections(scripts), [
			'a.js in frame 0',
			'a.js in frame 3',
			'b.js in frame 0',
			'b.js in frame 3',
		]);
		t.assert.deepStrictEqual(describeInjections(styles), [
			'a.css in frame 0',
			'a.css in frame 3',
		]);
	});

	it('should inject in new frames of active tabs', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		scripts.length = 0;

		await listeners.onCommitted[0]!({tabId: 1, frameId: 7, url: 'https://example.com/new-frame'});

		t.assert.deepStrictEqual(describeInjections(scripts), ['a.js in frame 7', 'b.js in frame 7']);
	});

	it('should not inject in cross-origin frames or in tabs that are not active', async (t: TestContext) => {
		t.mock.method(console, 'debug', () => undefined);
		scripts.length = 0;

		await listeners.onCommitted[0]!({tabId: 1, frameId: 8, url: 'https://ads.example.net/'});
		await listeners.onCommitted[0]!({tabId: 2, frameId: 0, url: 'https://example.com/page'});

		t.assert.deepStrictEqual(scripts, []);
	});
});
