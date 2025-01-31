# register-active-tab-scripts

This will automatically inject content scripts and styles into a tab and its iframes once the `activeTab` permission has been invoked. Reloads will also continue to receive the content scripts.

> [!NOTE]
> Multiple clicks will not inject the script multiple times if the previous `activeTab` is still active.

> [!NOTE]
> The defined content scripts will be injected even if they're already specified in the manifest for a specific host. This will cause a duplicate injection. PR welcome to add a host filter via `excludeMatches`.

> [!NOTE]
> If you expect injection into iframes, you will need the `webNavigation` permission, or else the scripts are only injected on the first page load.

```js
import registerActiveTabScripts from 'webext-active-tab/register-active-tab-scripts';

registerActiveTabScripts({
	js: [
		'content.js',
	],
	css: [
		'content.css',
	],

	runAt: 'document_idle',
	matchAboutBlank: false,
});
```

## Compatibility

- Browser: any browser
- Manifest: MV2, MV3

## Permissions

- `activeTab`
- `scripting` (only in MV3)
- `webNavigation` (only if you need consistent iframe injection)
	- consider using `optional_permissions` and request it later if the user needs it

## Context

- background

## [Main page ⏎](../readme.md)
