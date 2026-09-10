# CLAUDE.md — PBS BBO Extension

## Project Overview

Chrome Manifest V3 extension that runs Practice Bidding Scenarios (PBS) on Bridge Base Online (BBO). Derived from BBOalert by stripping out alerting features and keeping only the script engine, shortcuts panel, options system, and plugin support.

**Repo:** `bridge-craftwork/pbs-bbo-extension`
**Install:** Load `src/` as unpacked extension in Chrome developer mode

## Repositories

| Repo | Purpose |
|---|---|
| `bridge-craftwork/pbs-bbo-extension` | This extension (derived from BBOalert) |
| `bridge-craftwork/bbo-pbs` | Fork of BBOalert — hosts `Plugins/BBAcompare.js` |
| `stanmaz/BBOalert` | Original BBOalert — hosts `Plugins/PBNcapture.js` and `Scripts/PBStooltips.js` |
| `bridge-craftwork/Practice-Bidding-Scenarios` | PBS data — `-PBS.txt` entry point, scenario files, `js/setDealerCode-polling.js`, `js/toggleRotate.js` |

## Runtime Data Loading

The extension doesn't bundle PBS data or plugins. Everything is fetched at runtime via the Import/Javascript chain starting from `-PBS.txt`:

```
PBSCache (localStorage) contains:
  BBOalert
  Import,https://github.com/bridge-craftwork/Practice-Bidding-Scenarios/blob/main/-PBS.txt

-PBS.txt loads:
  Import  → bridge-craftwork/.../js/setDealerCode-polling.js
  Import  → bridge-craftwork/.../js/toggleRotate.js
  Javascript → stanmaz/BBOalert/.../Plugins/PBNcapture.js          (eval'd, registers events via addBBOalertEvent)
  Javascript → bridge-craftwork/bbo-pbs/.../Plugins/BBAcompare.js  (eval'd, registers events via addBBOalertEvent)
  Import  → stanmaz/BBOalert/.../Scripts/PBStooltips.js
  Script,onDataLoad blocks → PBS Dynamic Layout system (fetches button layout + scenario metadata)
  295 .pbs scenario files (fetched on button click, not at startup)
```

`Import,` directives are included as data records. `Javascript,` directives are eval'd and can register event listeners.

## Architecture

### Two-Layer Iframe Pattern

1. **Content scripts** (`main.js`, `PBSiframe.js`, `jquery`, CSS) run in BBO's page context
2. `main.js` watches for `#navDiv` visibility (BBO login/logout) and creates/destroys the iframe
3. `PBSiframe.js` creates `pbs-panel0` div in BBO's `rightDiv`, then creates a sandboxed iframe (`pbs-iframe`) inside it
4. The iframe loads all `src/iframe/` scripts via `<script defer>` — these run in the iframe's isolated document

### Element ID Namespacing

**Parent document IDs** (renamed to avoid BBOalert conflicts):
- `pbs-panel0`, `pbs-tab`, `pbs-iframe`, `pbs-statText`, `PBSOriginal`

**Iframe-internal IDs** (unchanged — scoped to separate iframe documents):
- `adpanel0`, `adpanel2`, `bttab-buttons`, `bboalert-menu-config`, `bboalert-menu-settings`, `bboalert-p1`, etc.
- PBS scripts in `-PBS.txt` hardcode these, so they must not change

### localStorage Keys

| Key | Purpose |
|---|---|
| `PBSCache` | Cached alert data (the Import chain result) |
| `PBSSettings` | Settings toggle states (7 boolean flags) |
| `BBOalertPlugin <name>` | Plugin configs (PBS, BBA Compare, PBN Capture) — uses BBOalert prefix with space because `-PBS.txt` hardcodes `localStorage.getItem('BBOalertPlugin PBS')` |

The `BBOalertPlugin ` prefix (with trailing space before label) matches BBOalert's convention and is required for compatibility with `-PBS.txt`'s config change detection (lines 1018, 1090).

## Key Files

### Content Scripts (BBO page context)
- `main.js` — MutationObserver on `document.body`, creates/destroys iframe on navDiv visibility
- `PBSiframe.js` — `initBBOalertIframe()` creates the panel + sandboxed iframe with all script tags

### Iframe Scripts (loaded in order via `<script defer>`)
- `globals.js` — Event constants (`E_onDataLoad`, etc.), state variables
- `BBO_DOM.js` — DOM accessors for BBO elements (hands, auction, chat, seats), `addBBOalertTab()`
- `blogspot.js` — HTML parsing for GitHub/blogspot page content extraction
- `functions.js` — Core utilities: `execUserScript()`, `userScript()`, `updateAlertDataAsync()`, `isSettingON()`, `matchContext()`, event system (`initBBOalertEvents`, `addBBOalertEvent`, `BBOalertEvents`)
- `BBOalertData.js` — `BBOalertData` class for scanning alertTable records
- `BBOalertUI.js` — UI construction: tabs (Data/Options/Shortcuts), panels, settings/config selectors
- `BBOalertOptions.js` — Option button management, vulnerability/seat matching
- `BBOobserver.js` — MutationObserver on parent body, polls for navDiv then starts observing
- `BBOobserverHandlers.js` — Event handlers: `onNavDivDisplayed()` (init flow), `onAnyMutation()`, `onNewAuction()`, etc.
- `BBOalert.js` — `processTable()` (the main data processing pipeline), `setScriptList()`, `setShortcutButtons()`, `loadJavascript()`
- `BBOalertConfig.js` — `addConfigBox()` / `setConfigBox()` for plugin configuration dialogs
- `custom_syntax.js` — Custom alert syntax parsing (kept for BBOalertData compatibility)
- `webStorage.js` — `fetchWebData()`, `makeDirectLink()`, `HTMLpage2text()`, `loadJS()`
- `init.js` — Initialization: `initGlobals()`, default PBSCache URL, config normalization

## runtime/ — JavaScript fetched at run time

`runtime/` holds JavaScript that the extension **fetches from GitHub at run time**.
It is not packaged: nothing there is in `src/`, and nothing there goes through
store review. A BBO UI change can therefore be fixed by pushing to this repo,
where the same code in `src/` would need a Chrome/Firefox/App Store release.

`-PBS-beta.txt` imports it (release still has its blocks inline). Each file
carries its own `//Script,<event>` … `//Script` markers, so it behaves exactly
like a block written inline in the data file. See `runtime/README.md`.

The repo **must stay public** — raw URLs for a private repo need a token.

## Two extensions on one page

PBS and BBOalert can both be installed, and both load the same `-PBS.txt` data.
They are fully independent (separate iframes, separate JS contexts) but drive the
**same BBO page**, which caused a reproducible tab freeze — see
[docs/2026-09-BBO-phoenix-and-freeze.md](docs/2026-09-BBO-phoenix-and-freeze.md).
`runtime/activeWatcher.js` serialises the watching without disabling either.

Note `BBOobserver` is a `const` lexical binding, so it is reachable only from code
running inside that iframe — which data-file blocks are, since they are `eval`'d
there.

## Important Patterns

### processTable() Pipeline
Called once when data loading completes. Clears and rebuilds everything:
```
clearOptionButtons → setOptionButtons → setOptionsSelector → initOptionDefaults →
hideUnusedOptions → clearShortcutButtons → setShortcutButtons → setScriptList →
saveAlertTableToClipboard → hover_bboalert → execUserScript('%onDataLoad%') →
[_pbsDynamicBuilding guard] → BBOalertEvents().dispatchEvent(E_onDataLoad)
```

The `_pbsDynamicBuilding = true` guard after `execUserScript` prevents `-PBS.txt`'s config change detection (in `onAnyMutation`) from racing with the initial `setTimeout(init, 100)` in the PBS Dynamic IIFE.

### Dual Event Mechanisms
1. **Script system**: `Script,onDataLoad` blocks in data → run via `execUserScript('%onDataLoad%')`
2. **Event system**: `addBBOalertEvent('onDataLoad', fn)` in JavaScript plugins → fired via `BBOalertEvents().dispatchEvent(E_onDataLoad)`

PBS uses the Script system. BBAcompare.js and PBNcapture.js use the Event system.

### PBS Dynamic Layout (-PBS.txt)
The largest `Script,onDataLoad` block (~800 lines) is an IIFE that:
1. Reads config via `addConfigBox('PBS', pbsConfig)`
2. Fetches button layout from GitHub (`-button-layout-release.txt` or `-button-layout-beta.txt`)
3. Renders 295 scenario buttons with async metadata loading
4. Optionally adds test mode buttons (pbs-test folder)
5. Sets up expand/collapse behavior

Config change detection runs in a `Script,onAnyMutation` block, reading from `localStorage.getItem('BBOalertPlugin PBS')`.

## What Was Removed from BBOalert

- Alert finding/display system (BBOalertFind.js, findAlert, getAlert, saveAlert)
- Recording/post-mortem features
- Clipboard data import/export
- Documents tab and release notes
- BBOalert button overlay on BBO UI
- Profile features (BBOalert URL in profiles)
- Google Docs content script
- Dropbox/TinyURL handlers
- Built-in plugins (BBOalertPlugin.js — stanmazPlugin event logging, suit colors, prealert)
- File selector in Data tab
- "BBOalert button" and "Deferred alerts" settings

## Known Issues

- **Iframe destruction on navDiv flicker**: BBO's navDiv briefly hides during normal operation, causing `main.js` to destroy and recreate the iframe. Shows as "BBA Compare: Iframe window unload" in console. Doesn't cause functional problems but wastes resources.
- **BBOalertPlugin prefix**: Can't rename to `PBSPlugin` until `-PBS.txt` is updated (lines 1018, 1090 hardcode `BBOalertPlugin PBS`). Tracked as coordinated change with PBS repo.
- **BBO's Phoenix UI**: BBO is mid-migration to a new UI (`bbo-phx-*`, `bbo-create-table-modal`). Selectors written against the old markup fail silently, because jQuery `.click()` on an empty set throws nothing. Prefer stable ids and `:visible` over positional `.eq(n)` — BBO now renders some labels on two surfaces at once.
- **Both extensions installed**: fixed by `runtime/activeWatcher.js`, but only when *both* data files import it. Until release carries it too, a user with PBS + BBOalert can still hit the freeze.
