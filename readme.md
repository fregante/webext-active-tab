# webext-active-tab [![npm version](https://img.shields.io/npm/v/webext-active-tab.svg)](https://www.npmjs.com/package/webext-active-tab)

> WebExtension module: Track `activeTab` permission; automatically inject content scripts

The main use case is to ship your extension without `host_permissions` and have the user invoke the extension on click on any website.

Alternatively, consider using [webext-permission-toggle](https://github.com/fregante/webext-permission-toggle) and [webext-dynamic-content-scripts](https://github.com/fregante/webext-dynamic-content-scripts) to permanently receive access to certain hosts and automatically register content scripts on it.

## Install

```sh
npm install webext-active-tab
```

## Usage

This package exports various utilities, just import what you need.

- [on-active-tab](./source/on-active-tab.md) - Watch when tabs receive `activeTab`
- [register-active-tab-scripts](./source/register-active-tab-scripts.md) - Automatically inject scripts into tabs with `activeTab`

> [!NOTE]
> Firefox has some limitations:
> - `activeTab` seems to be lost after a reload
> - further `contextMenu` clicks receive a moz-extension URL rather than the current page’s URL

## Related

- [webext-dynamic-content-scripts](https://github.com/fregante/webext-dynamic-content-scripts) - Automatically registers your `content_scripts` on domains added via `permission.request`.
- [webext-events](https://github.com/fregante/webext-events) - High-level events and utilities for events in Web Extensions
- [Awesome-WebExtensions](https://github.com/fregante/Awesome-WebExtensions) - A curated list of awesome resources for WebExtensions development.
- [More…](https://github.com/fregante/webext-fun)

## License

MIT © [Federico Brigante](https://fregante.com)
