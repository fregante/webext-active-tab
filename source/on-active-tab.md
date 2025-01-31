# on-active-tab

There are several scenarios that trigger the `activeTab` permission, for example when they click the "browser action" button. This helper lets you add a listener for this event.

> [!NOTE]
> Multiple clicks will not trigger multiple events if the previous `activeTab` is still active.

```js
import {
	onActiveTab,
	onActiveTabLost,
} from 'webext-active-tab/on-active-tab';

onActiveTab.addListener((tab) => {
	console.log('We now have access to', tab.origin, 'on tab', tab.id);
	chrome.scripting.executeFunction({
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

- Browser: any browser
- Manifest: MV2, MV3

## Permissions

- `activeTab`

## Context

- background

## [Main page ⏎](../readme.md)
