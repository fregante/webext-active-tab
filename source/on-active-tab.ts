import {isScriptableUrl} from 'webext-content-scripts';
import {isBackground} from 'webext-detect';
import SimpleEventTarget from 'simple-event-target';
import {StorageItemMap} from 'webext-storage';

if (!isBackground()) {
	throw new Error('This module is only allowed in a background script');
}

if (!chrome.runtime.getManifest().permissions?.includes('activeTab')) {
	throw new Error('The manifest should include the `activeTab` permission for `webext-active-tab` to work');
}

type TabId = number;
type Origin = string;

export type ActiveTab = {
	id: TabId;
	origin: Origin;
};

const activation = new SimpleEventTarget<ActiveTab>();
const deactivation = new SimpleEventTarget<TabId>();

type ActiveTabStore = Pick<StorageItemMap<Origin>, 'has' | 'get' | 'set' | 'remove'>;

// Fallback for when the `storage` permission is missing or `storage.session` is unavailable
const memory = new Map<string, Origin>();

/**
 The list is not guaranteed to be up to date. The activeTab permission might be lost before it's detected.
 */
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- Typed as always defined, but `chrome.storage` or `chrome.storage.session` can be missing at runtime
export const possiblyActiveTabs: ActiveTabStore = chrome.storage?.session
	? new StorageItemMap<Origin>('webext-active-tab', {
		area: 'session',
	})
	: {
		async has(tabId) {
			return memory.has(tabId);
		},
		async get(tabId) {
			return memory.get(tabId);
		},
		async set(tabId, origin) {
			memory.set(tabId, origin);
		},
		async remove(tabId) {
			memory.delete(tabId);
		},
	};

async function addIfScriptable({url, id}: chrome.tabs.Tab): Promise<void> {
	if (
		id !== undefined && url !== undefined

		// Skip if it already exists. A previous change of origin already cleared this
		&& !await possiblyActiveTabs.has(String(id))

		// ActiveTab doesn't make sense on non-scriptable URLs as they generally don't have scriptable frames
		&& isScriptableUrl(url)

	// Note: Do not filter by `isContentScriptRegistered`; `active-tab` also applies to random `executeScript` calls
	) {
		const {origin} = new URL(url);
		console.debug('activeTab:', id, 'added', {origin});
		await possiblyActiveTabs.set(String(id), origin);
		activation.emit({id, origin});
	} else {
		console.debug('activeTab:', id, 'not added', {url});
	}
}

async function drop(tabId: TabId): Promise<void> {
	console.debug('activeTab:', tabId, 'removed');
	await possiblyActiveTabs.remove(String(tabId));
	deactivation.emit(tabId);
}

async function dropIfActive(tabId: TabId): Promise<void> {
	if (await possiblyActiveTabs.has(String(tabId))) {
		await drop(tabId);
	}
}

async function dropIfOriginChanged(tabId: number, {url}: chrome.tabs.OnUpdatedInfo): Promise<void> {
	if (url === undefined || url === '') {
		return;
	}

	const activeOrigin = await possiblyActiveTabs.get(String(tabId));

	// Not active, nothing to drop
	if (activeOrigin === undefined) {
		return;
	}

	const {origin} = new URL(url);
	if (activeOrigin === origin) {
		return;
	}

	console.debug('activeTab:', tabId, 'removed because origin changed from', activeOrigin, 'to', origin);
	await drop(tabId);
}

function altListener(_: unknown, tab?: chrome.tabs.Tab): void {
	if (tab) {
		void addIfScriptable(tab);
	}
}

// https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/#invoking-activeTab
function startActiveTabTracking(): void {
	chrome.action?.onClicked.addListener(addIfScriptable);
	chrome.contextMenus?.onClicked.addListener(altListener);
	chrome.commands?.onCommand.addListener(altListener);

	chrome.tabs.onUpdated.addListener(dropIfOriginChanged);
	chrome.tabs.onRemoved.addListener(dropIfActive);
}

function stopActiveTabTracking(): void {
	chrome.action?.onClicked.removeListener(addIfScriptable);
	chrome.contextMenus?.onClicked.removeListener(altListener);
	chrome.commands?.onCommand.removeListener(altListener);

	chrome.tabs.onUpdated.removeListener(dropIfOriginChanged);
	chrome.tabs.onRemoved.removeListener(dropIfActive);
	// TODO: Restore after https://github.com/fregante/webext-storage/issues/9
	// void possiblyActiveTabs.clear();
}

export const PRIVATE = {
	startActiveTabTracking,
	stopActiveTabTracking,
};

export const onActiveTab = {
	addListener(callback: (tab: ActiveTab) => void): void {
		startActiveTabTracking();
		activation.subscribe(callback);
	},
	removeListener: activation.unsubscribe.bind(activation),
};

export const onActiveTabLost = {
	addListener(callback: (tabId: TabId) => void): void {
		startActiveTabTracking();
		deactivation.subscribe(callback);
	},
	removeListener: deactivation.unsubscribe.bind(deactivation),
};
