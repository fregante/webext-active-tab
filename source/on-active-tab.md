# on-active-tab

There are several scenarios that trigger the `activeTab` permission, for example when they click the "browser action" button. This helper lets you add a listener for this event.

> [!NOTE]
> Multiple clicks will not trigger multiple events if the previous `activeTab` is still active.

> [!NOTE]
> The action’s `onClicked` event does not fire if the manifest’s `action` has a `default_popup`, so `activeTab` won’t be detected when the popup opens. Context menu clicks and commands are also tracked.

```js
import {
	onActiveTab,
	onActiveTabLost,
} from 'webext-active-tab/on-active-tab';

onActiveTab.addListener((tab) => {
	console.log('We now have access to', tab.origin, 'on tab', tab.id);
	chrome.scripting.executeScript({
		target: {tabId: tab.id},
		func() {
			alert('All your bases are belong to us');
		}
	});
});


onActiveTabLost.addListener((tabId) => {
	console.log('Lost access to tab', tabId, '🥲');
});
```

## Compatibility

- Browser: any browser (in Firefox, reloads are only detected with the `webNavigation` permission)
- Manifest: MV3

## Permissions

- `activeTab`
- `storage` (optional; without it, the list of active tabs is lost when the background context restarts)
- `webNavigation` (optional; Firefox only; without it, `activeTab` loss on reload isn't detected)

## Context

- background

## [Main page ⏎](../readme.md)
