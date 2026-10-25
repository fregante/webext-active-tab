import {injectContentScript, type RunAt} from 'webext-content-scripts';
import {type ActiveTab, onActiveTab, possiblyActiveTabs} from './on-active-tab.js';

export type ActiveTabContentScript = {
	css?: string[];
	js?: string[];
	matchAboutBlank?: boolean;
	runAt?: RunAt;
};

type InjectionDetails = {
	tabId: number;
	frameId: number;
	url: string;
};

const hasNavigation = typeof chrome === 'object' && 'webNavigation' in chrome;

const scripts: ActiveTabContentScript[] = [];

async function injectAllFrames({id: tabId, origin: url}: ActiveTab): Promise<void> {
	if (tabId === undefined) {
		return;
	}

	if (!hasNavigation) {
		// Without it, we only inject it into the top frame
		return injectOneFrame({frameId: 0, url, tabId});
	}

	const frames = await chrome.webNavigation.getAllFrames({tabId});
	// .map() needed for async loop
	void frames?.map(async ({frameId, url: frameUrl}) => injectOneFrame({frameId, url: frameUrl, tabId}));
}

async function injectOneFrame(
	{tabId, frameId, url}: InjectionDetails,
): Promise<void> {
	const {origin} = new URL(url);
	const activeOrigin = await possiblyActiveTabs.get(String(tabId));

	// Check origin because the request might be for a frame; cross-origin frames do not receive activeTab
	if (activeOrigin === origin) {
		console.debug('activeTab: will inject', {tabId, frameId, url});
		await injectContentScript(
			{tabId, frameId},
			// `webext-content-scripts` uses the `manifest.json` format
			scripts.map(({runAt, matchAboutBlank, ...script}) => ({...script, run_at: runAt, match_about_blank: matchAboutBlank})),
			{ignoreTargetErrors: true},
		);
	} else {
		console.debug('activeTab: won’t inject', {tabId, frameId, url}, {activeTab: activeOrigin ?? 'no'});
	}
}

async function tabListener(
	tabId: number,
	{status}: chrome.tabs.OnUpdatedInfo,
	{url}: chrome.tabs.Tab,
): Promise<void> {
	// Only status updates are relevant
	// No URL = no permission
	if (status === 'loading' && url !== undefined) {
		await injectOneFrame({tabId, url, frameId: 0});
	}
}

export default function registerActiveTabScripts(...newScripts: ActiveTabContentScript[]) {
	scripts.push(...newScripts);

	onActiveTab.addListener(injectAllFrames);

	if (hasNavigation) {
		chrome.webNavigation.onCommitted.addListener(injectOneFrame);
	} else {
		chrome.tabs.onUpdated.addListener(tabListener);
	}
}
