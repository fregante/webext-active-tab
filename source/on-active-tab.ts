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

const browserAction = chrome.action ?? chrome.browserAction;

/**
 * The list is not guaranteed to be up to date. The activeTab permission might be lost before it's detected.
 */
export const possiblyActiveTabs = chrome.storage.session
	? new StorageItemMap<Origin>('webext-active-tab', {
		area: 'session',
	})
	: new Map<string, Origin>();

async function addIfScriptable({url, id}: chrome.tabs.Tab): Promise<void> {
	if (
		id && url

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
		console.debug('activeTab:', id, 'not added', {origin});
	}
}

async function dropIfOriginChanged(tabId: number, {url}: chrome.tabs.TabChangeInfo): Promise<void> {
	if (!url) {
		return;
	}

	const activeOrigin = await possiblyActiveTabs.get(String(tabId));
	const {origin} = new URL(url);
	if (activeOrigin !== origin) {
		console.debug('activeTab:', tabId, 'removed because origin changed from', activeOrigin, 'to', origin);
		void possiblyActiveTabs.delete(String(tabId));
	}
}

function altListener(_: unknown, tab?: chrome.tabs.Tab): void {
	if (tab) {
		void addIfScriptable(tab);
	}
}

function drop(tabId: TabId): void {
	console.debug('activeTab:', tabId, 'removed');
	void possiblyActiveTabs.delete(String(tabId));
	deactivation.emit(tabId);
}

// https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/#invoking-activeTab
function startActiveTabTracking(): void {
	browserAction?.onClicked.addListener(addIfScriptable);
	chrome.contextMenus?.onClicked.addListener(altListener);
	chrome.commands?.onCommand.addListener(altListener);

	chrome.tabs.onUpdated.addListener(dropIfOriginChanged);
	chrome.tabs.onRemoved.addListener(drop);
}

function stopActiveTabTracking(): void {
	browserAction?.onClicked.removeListener(addIfScriptable);
	chrome.contextMenus?.onClicked.removeListener(altListener);
	chrome.commands?.onCommand.removeListener(altListener);

	chrome.tabs.onUpdated.removeListener(dropIfOriginChanged);
	chrome.tabs.onRemoved.removeListener(drop);
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
