import {isScriptableUrl} from 'webext-content-scripts';
import {isBackground, isFirefox} from 'webext-detect';
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

/**
 The list is not guaranteed to be up to date. The activeTab permission might be lost before it's detected.
 */
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- Typed as always defined, but `chrome.storage` or `chrome.storage.session` can be missing at runtime
export const possiblyActiveTabs = chrome.storage?.session
	? new StorageItemMap<Origin>('webext-active-tab', {
		area: 'session',
	})
	: new Map<string, Origin>();

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

// Serialized per tab, so overlapping events can't both see the entry and emit twice
const pendingDrops = new Map<TabId, Promise<void>>();

// Drops the tab if it's active, unless it's still on `keepOrigin`
async function drop(tabId: TabId, keepOrigin?: Origin): Promise<void> {
	const previous = pendingDrops.get(tabId);
	const {promise: current, resolve: release} = Promise.withResolvers<void>();
	pendingDrops.set(tabId, current);

	try {
		try {
			await previous;
		} catch {}

		const activeOrigin = await possiblyActiveTabs.get(String(tabId));
		if (activeOrigin !== undefined && activeOrigin !== keepOrigin) {
			console.debug('activeTab:', tabId, 'removed', {activeOrigin, keepOrigin});
			await possiblyActiveTabs.delete(String(tabId));
			deactivation.emit(tabId);
		}
	} finally {
		release();
		if (pendingDrops.get(tabId) === current) {
			pendingDrops.delete(tabId);
		}
	}
}

async function dropIfActive(tabId: TabId): Promise<void> {
	await drop(tabId);
}

async function dropIfOriginChanged(tabId: number, {url}: chrome.tabs.OnUpdatedInfo): Promise<void> {
	if (url === undefined || url === '') {
		return;
	}

	await drop(tabId, new URL(url).origin);
}

// Firefox revokes `activeTab` on reload, Chrome doesn't
function dropOnReload({tabId, frameId, transitionType}: chrome.webNavigation.WebNavigationTransitionCallbackDetails): void {
	if (frameId === 0 && transitionType === 'reload') {
		void dropIfActive(tabId);
	}
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

	if (isFirefox()) {
		chrome.webNavigation?.onCommitted.addListener(dropOnReload);
	}
}

function stopActiveTabTracking(): void {
	chrome.action?.onClicked.removeListener(addIfScriptable);
	chrome.contextMenus?.onClicked.removeListener(altListener);
	chrome.commands?.onCommand.removeListener(altListener);

	chrome.tabs.onUpdated.removeListener(dropIfOriginChanged);
	chrome.tabs.onRemoved.removeListener(dropIfActive);

	if (isFirefox()) {
		chrome.webNavigation?.onCommitted.removeListener(dropOnReload);
	}

	void possiblyActiveTabs.clear();
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
