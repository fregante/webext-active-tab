/* eslint-disable @typescript-eslint/no-floating-promises -- `node:test` returns promises, fixed in a later xo */
import {setTimeout as sleep} from 'node:timers/promises';
import {describe, it, type TestContext} from 'node:test';
import {disableWebextDetectPageCache} from 'webext-detect';
import type * as OnActiveTab from './on-active-tab.ts';

// The module decides what to do at import time, based on the environment
disableWebextDetectPageCache();

type Listener = (...arguments_: unknown[]) => unknown;

const mockEvent = (t: TestContext) => ({
	addListener: t.mock.fn((_listener: Listener) => undefined),
	removeListener: t.mock.fn((_listener: Listener) => undefined),
});

type MockEvent = ReturnType<typeof mockEvent>;

const getListener = ({addListener}: MockEvent) => addListener.mock.calls[0]!.arguments[0];

function setup(t: TestContext, {permissions = ['activeTab'], pathname = '/background.js'} = {}) {
	const events = {
		action: mockEvent(t),
		contextMenus: mockEvent(t),
		commands: mockEvent(t),
		onUpdated: mockEvent(t),
		onRemoved: mockEvent(t),
	};

	Object.assign(globalThis, {
		location: {origin: 'chrome-extension://abc', pathname},
		chrome: {
			runtime: {
				id: 'abc',
				getManifest: () => ({manifest_version: 3, permissions, background: {service_worker: 'background.js'}}),
			},
			action: {onClicked: events.action},
			contextMenus: {onClicked: events.contextMenus},
			commands: {onCommand: events.commands},
			tabs: {onUpdated: events.onUpdated, onRemoved: events.onRemoved},
		},
	});

	t.mock.method(console, 'debug', () => undefined);
	return events;
}

// `onActiveTab` has global state, so each test needs a fresh module
let importCount = 0;
const importFresh = async () => (await import(`./on-active-tab.ts?${importCount++}`)) as typeof OnActiveTab;

const exampleTab = {id: 1, url: 'https://example.com/page'};

describe('on-active-tab', () => {
	it('should throw outside of the background context', async (t: TestContext) => {
		setup(t, {pathname: '/popup.html'});

		await t.assert.rejects(importFresh(), {message: /only allowed in a background script/v});
	});

	it('should throw without the `activeTab` permission', async (t: TestContext) => {
		setup(t, {permissions: []});

		await t.assert.rejects(importFresh(), {message: /`activeTab` permission/v});
	});

	it('should only start tracking once a listener is added', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, onActiveTabLost} = await importFresh();

		t.assert.strictEqual(events.action.addListener.mock.callCount(), 0);

		onActiveTab.addListener(() => undefined);
		onActiveTabLost.addListener(() => undefined);

		t.assert.deepStrictEqual(Object.values(events).map(event => event.addListener.mock.callCount()), [2, 2, 2, 2, 2]);
	});

	it('should stop tracking and forget the tabs', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, possiblyActiveTabs, PRIVATE} = await importFresh();

		onActiveTab.addListener(() => undefined);
		await getListener(events.action)(exampleTab);
		PRIVATE.stopActiveTabTracking();

		t.assert.deepStrictEqual(Object.values(events).map(event => event.removeListener.mock.callCount()), [1, 1, 1, 1, 1]);

		t.assert.strictEqual(await possiblyActiveTabs.has('1'), false);
	});

	it('should emit when the action is clicked on a scriptable tab', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, possiblyActiveTabs} = await importFresh();
		const activated: unknown[] = [];
		onActiveTab.addListener(tab => {
			activated.push(tab);
		});

		await getListener(events.action)(exampleTab);

		t.assert.deepStrictEqual(activated, [{id: 1, origin: 'https://example.com'}]);
		t.assert.strictEqual(await possiblyActiveTabs.get('1'), 'https://example.com');
	});

	it('should emit for context menu items and commands', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab} = await importFresh();
		const activated: unknown[] = [];
		onActiveTab.addListener(tab => {
			activated.push(tab);
		});

		getListener(events.contextMenus)({}, exampleTab);
		getListener(events.commands)('command', {id: 2, url: 'https://example.org/'});
		await sleep(5);

		t.assert.deepStrictEqual(activated, [
			{id: 1, origin: 'https://example.com'},
			{id: 2, origin: 'https://example.org'},
		]);
	});

	it('should ignore tabs that cannot be scripted', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, possiblyActiveTabs} = await importFresh();
		const activated: unknown[] = [];
		onActiveTab.addListener(tab => {
			activated.push(tab);
		});

		await getListener(events.action)({id: 1, url: 'chrome://extensions/'});
		await getListener(events.action)({id: 2});

		t.assert.deepStrictEqual(activated, []);
		t.assert.strictEqual(await possiblyActiveTabs.has('1'), false);
	});

	it('should not emit twice for a tab that is already active', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab} = await importFresh();
		const activated: unknown[] = [];
		onActiveTab.addListener(tab => {
			activated.push(tab);
		});

		await getListener(events.action)(exampleTab);
		await getListener(events.action)(exampleTab);

		t.assert.strictEqual(activated.length, 1);
	});

	it('should stop emitting to removed listeners', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab} = await importFresh();
		const listener = t.mock.fn((_tab: OnActiveTab.ActiveTab) => undefined);
		onActiveTab.addListener(listener);
		onActiveTab.removeListener(listener);

		await getListener(events.action)(exampleTab);

		t.assert.strictEqual(listener.mock.callCount(), 0);
	});

	it('should emit the loss when the tab is closed', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, onActiveTabLost, possiblyActiveTabs} = await importFresh();
		const lost: unknown[] = [];
		onActiveTab.addListener(() => undefined);
		onActiveTabLost.addListener(tabId => {
			lost.push(tabId);
		});

		await getListener(events.action)(exampleTab);
		await getListener(events.onRemoved)(1);
		await getListener(events.onRemoved)(1);

		t.assert.deepStrictEqual(lost, [1]);
		t.assert.strictEqual(await possiblyActiveTabs.has('1'), false);
	});

	it('should emit the loss only when the origin changes', async (t: TestContext) => {
		const events = setup(t);
		const {onActiveTab, onActiveTabLost} = await importFresh();
		const lost: unknown[] = [];
		onActiveTab.addListener(() => undefined);
		onActiveTabLost.addListener(tabId => {
			lost.push(tabId);
		});
		await getListener(events.action)(exampleTab);

		const onUpdated = getListener(events.onUpdated);
		await onUpdated(1, {status: 'loading'});
		await onUpdated(1, {url: ''});
		await onUpdated(1, {url: 'https://example.com/other-page'});
		t.assert.deepStrictEqual(lost, []);

		await onUpdated(1, {url: 'https://example.org/'});
		t.assert.deepStrictEqual(lost, [1]);
	});
});
