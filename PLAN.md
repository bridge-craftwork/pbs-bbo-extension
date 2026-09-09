# Plan: New Chrome Extension — PBS with BBA Compare

## Context

BBOalert is a full-featured Chrome extension for Bridge Base Online (BBO) that provides auto-alerting, bidding shortcuts, options management, recording, and more. Practice Bidding Scenarios (PBS) and BBA Compare run as plugins within BBOalert.

After analyzing `-PBS.txt` (the PBS startup file), PBS uses significantly more BBOalert infrastructure than just "data loading." It relies on:
- The **Script system** (`Script,onDataLoad`, `Script,onAnyMutation`, `Script,onLogin`, named scripts)
- The **Shortcuts tab (`adpanel2`)** — the entire PBS button UI (300+ collapsible scenario buttons) is built here
- The **tab system** — PBS auto-opens the Shortcuts tab via `$('#bttab-buttons').click()`
- **`BBOalertData` class** — for scanning Script/Button/Option records
- **`processTable()`** — which calls `setScriptList()`, `clearShortcutButtons()`, `setShortcutButtons()`, `setOptionButtons()`
- **`addConfigBox()`** — for PBS plugin settings (Enable_Test_Mode, Use_Beta_Layout)
- **Chat functions** — `sendPrivateChat()`, `setChatMessage()`, `setChatDestination()`
- **jQuery + jQueryUI** — used extensively (tooltips, DOM manipulation)
- **`execUserScript()`** — executes named scripts from button clicks
- **`Option` records** — `Option,Practice Table`
- **`setOptionsOff()`** — hides panel on login

However, PBS does **NOT** use:
- Alert finding/display (findAlert, getAlert, BBOalertFind)
- Recording/saving alerts (saveAlert, updateText, post-mortem)
- Clipboard import/export (paste/copy data operations)
- Custom syntax parsing
- Blogger integration
- Google Docs content script
- Profile features / BBOalert button overlay
- Built-in plugins (stanmazPlugin event logging, suit colors, prealert, timeout)
- Documents tab (release notes)
- Most of the Data tab (file selector, except the config/settings selectors)

The goal is to create a **standalone Chrome extension** (`pbs-bbo-extension` repo) that keeps only what PBS + BBA Compare need, removing alerting, recording, and other unneeded features.

---

## Architecture: What to Keep vs Remove

### KEEP (required by PBS and/or BBA Compare)

**Core Infrastructure:**
- `globals.js` — Event definitions, state variables, `PWD`, `alertData`/`alertTable`/`alertOriginal`/`scriptList`
- `BBO_DOM.js` — DOM accessors (hands, auction, seats, vulnerability, chat functions)
- `functions.js` — Event system, `isVisible()`, `replaceSuitSymbols()`, `bboalertLog()`, `isSettingON()`, data loading utilities
- `BBOobserver.js` — MutationObserver (needs enough checks for BBA Compare events)
- `BBOobserverHandlers.js` — Event handlers, `onAnyMutation()`, `onNavDivDisplayed()` init flow

**PBS-Critical:**
- `BBOalertData.js` — `BBOalertData` class for scanning alertTable records (Script, Button, Option)
- `BBOalert.js` — `processTable()`, `setScriptList()`, `setShortcutButtons()`, `setOptionButtons()`, `execUserScript()`, `getScript()`, `loadJavascript()`, `displayHeaders()`
- `BBOalertUI.js` — `setAdPanel()` (creates adpanel0-3, tab buttons including Shortcuts tab/`adpanel2`), `setControlButtons()` (config selector, settings selector, status `bboalert-p1`), `clearShortcutButtons()`, `addShortcutButton()`
- `BBOalertOptions.js` — `addOptionButton()`, `clearOptionButtons()`, `setOptionColors()`, `initOptionDefaults()`, `hideUnusedOptions()`, `optionsSelectorChanged()`, `addOptionsSelectorOption()`, `clearOptionsSelector()`
- `BBOalertConfig.js` — `addConfigBox()`, `setConfigBox()`
- `webStorage.js` — `makeDirectLink()`, `fetchWebData()`, `HTMLpage2text()`, `loadBBOalertWebDataFile()`
- `custom_syntax.js` — Needed by `BBOalertData` class (it may reference custom syntax functions)

**Plugins:**
- `BBAcompare.js` — Auction comparison plugin
- `PBNcapture.js` — Referenced by `-PBS.txt` line 5 (imported via `Javascript,` directive from stanmaz repo)

### REMOVE

**Alert System:**
- `BBOalertFind.js` — Alert matching/search logic (`findAlert()`, `BBOalertFind` class)
- From `BBOalert.js`: `findAlert()`, `getAlert()`, `saveAlert()`, `savePostMortem()`, `setPostMortem()`, `findAlertText()`, `updateAlertText()`, `findShortcut()`, `inputOnKeyup()`, `inputChanged()`, `messageOnKeyup()`, `explainOnKeyup()`, `explainCallOnKeyup()`, `inputOnFocus()`, `inputOnBlur()`

**Data Import/Export:**
- From `BBOalert.js`: `exportAlertData()`, `exportOriginalData()`, `importClipboardData()`, `appendClipboardData()`, `clearData()`, `getClipboardData()`, `readNewData()`, `exportUpdateData()`, `getDataType()`
- Dropbox handler (lines 4-13) and Google Docs pub handler (lines 15-27)

**UI Elements:**
- From `BBOalertUI.js`: `addBBOalertButton()`, `setBBOalertButton()`, `toggleButtons()`, `setExplainInputClickEvents()`, `setChatInputClickEvents()`, `setInputClickEvents()`, `toggleOptions1()`, `setButtonPanel()`, Documents tab (`adpanel3`, info selector, release notes iframe)
- From `setControlButtons()`: File selector (`bboalert-menu-file`) — strip entirely. Settings selector — keep but reduce to only settings 5, 6. Keep config selector as-is.

**Built-in Plugins:**
- `BBOalertPlugin.js` — Entire file (770 lines of stanmazPlugin built-in plugins). The `PluginInit()` call in `functions.js` needs to be removed/stubbed.

**Other:**
- `blogspot.js` — Blogger integration (but keep `parseHTML()` if `HTMLpage2text()` references it)
- `googleDocs.js` — Google Docs content script
- Profile features from `BBO_DOM.js`
- TinyURL support from `webStorage.js`

---

## New Project Structure

```
pbs-bbo-extension/
  src/
    manifest.json              # New — BBO-only, simplified permissions
    main.js                    # Simplified from BBOalert main.js
    PBSiframe.js               # Modified from BBOalertIframe.js
    BBOalert.css               # Copied (may need minor edits)
    jquery-3.5.1.min.js        # Copied (needed as content script)
    icons/
      icon16.png, icon48.png, icon128.png
    iframe/
      globals.js               # Stripped — remove BBOalertButtonHTML, blog vars, profile vars
      BBO_DOM.js               # Stripped — remove profile, BBOalert button, alert explanation handlers
      functions.js             # Stripped — remove logging export, drag-and-drop, page reload
      webStorage.js            # Stripped — remove TinyURL, keep fetch/Import chain
      BBOobserver.js           # Modified — reduced check set
      BBOobserverHandlers.js   # Stripped — remove alert-specific handlers, simplify onAnyMutation
      BBOalertData.js          # Keep as-is (123 lines) — BBOalertData class for record scanning
      BBOalertConfig.js        # Keep as-is (107 lines) — addConfigBox
      BBOalertUI.js            # Stripped — keep Shortcuts tab + panel structure, remove Documents tab, simplify Data tab, remove BBOalert button overlay
      BBOalertOptions.js       # Keep as-is (358 lines) — Option system needed by PBS
      BBOalert.js              # Stripped — keep processTable, Script system, remove alert finding/recording/export
      custom_syntax.js         # Keep as-is (108 lines) — may be referenced by BBOalertData
      blogspot.js              # Strip to just parseHTML() + liNestingLevel() if needed
      init.js                  # Modified
```

Note: `BBAcompare.js` and `PBNcapture.js` are NOT bundled as iframe scripts. They are loaded dynamically via `Javascript,` directives in `-PBS.txt` from their GitHub repos, same as today. This means the new extension doesn't need to bundle them — they're fetched at runtime.

---

## Key Differences from BBOalert

### manifest.json
- Name: "PBS with BBA Compare" (or similar)
- Matches only `*://www.bridgebase.com/v3/*` (remove Google Docs, Dropbox, GitHub, tinyurl matches)
- No `googleDocs.js` in content scripts
- New icons

### UI Changes (BBOalertUI.js)
- **Keep**: Tab bar (Data, Options, Shortcuts tabs), `adpanel0`-`adpanel2`, `setAdPanel()`, `setControlButtons()`
- **Remove**: Documents tab (`adpanel3`, info selector, release notes iframe)
- **Simplify Data tab** (`adpanel1`): Remove file selector (`bboalert-menu-file`). Keep config selector (`bboalert-menu-config`), simplified settings selector, status area (`bboalert-p1`). Add PBS URL input field.
- **Remove**: `setBBOalertButton()`, `toggleButtons()`, `setButtonPanel()`, BBOalert button overlay

### BBOalert.js Changes
- **Keep**: `processTable()`, `setScriptList()`, `setShortcutButtons()`, `setOptionButtons()`, `setOptionsSelector()`, `displayHeaders()`, `loadJavascript()`, `execUserScript()`, `getScript()`, `saveAlertTableToClipboard()`, `setParentBBOalertData()`
- **Remove**: `findAlert()`, `getAlert()`, `saveAlert()`, `findAlertText()`, `updateAlertText()`, all shortcut expansion functions, all clipboard import/export, recording/post-mortem, Dropbox/Google Docs handlers

### BBOobserverHandlers.js Changes
- **Simplify `onAnyMutation()`**: Remove `setBBOalertButton()`, `hover_bboalert()`, `disableSplitScreenSwitch()`, `adpanel2` input tracking, `toggleButtons()`. Keep `partnershipOptions()`, `checkOptionsVulnerability()`, `setOptionColors()`, event dispatch, `execUserScript('%onAnyMutation%')`.
- **Simplify `onBiddingBoxDisplayed()`**: Remove alert interception (`setBiddingButtonEvents()`), shortcut `inputOnKeyup`/`inputChanged`. Keep event dispatch.
- **Simplify `onNavDivDisplayed()`**: Load PBS data from configurable URL instead of localStorage cache. Remove BBOalert-specific init.
- **Remove**: `onExplainCallDisplayed()` alert logic, `onProfileBoxDisplayed()` logic

### functions.js Changes
- **Remove**: `PluginInit()` call (or stub it), `addLog()`, `exportLogData()`, `downloadTextAsFile()`, `triggerDragAndDrop()`, page reload functions, `getPartnerAlert()`, `sendMessageToOpponents()`
- **Keep**: Event system, `isVisible()`, `bboalertLog()`, `isSettingON()`, `saveSettings()`, `restoreSettings()`, data loading utilities, `loadJS()`, `makeRegExp()`, `matchContext()`, `bidArray()`, clipboard read/write

### Data Loading Flow
Default `alertOriginal` on first install:
```
//BBOalert, PBS + BBA Compare
Import,https://github.com/bridge-craftwork/Practice-Bidding-Scenarios/blob/main/-PBS.txt
```
This URL is configurable via a PBS URL input field in the Data tab. Stored in localStorage. The Import chain recursively loads all PBS scenarios, JS files (setDealerCode.js, toggleRotate.js, PBNcapture.js, BBAcompare.js, PBStooltips.js), and Script blocks from `-PBS.txt`.

---

## Element ID & Storage Renaming Strategy

### Parent Document IDs (renamed to avoid conflicts with BBOalert)

| BBOalert ID | New PBS Extension ID | Where |
|---|---|---|
| `bboalert-iframe` | `pbs-iframe` | `main.js`, `PBSiframe.js` — the iframe element in BBO's page |
| `bboalert-tab` | `pbs-tab` | `BBO_DOM.js` `addBBOalertTab()` — sidebar tab in BBO's rightDiv |
| `bboalert-button` | *(removed)* | Not needed in PBS extension |
| `BBOalertOriginal` | `PBSOriginal` | `BBOalert.js` `setParentBBOalertData()` — data element in parent |
| `statText` | `pbs-statText` | `BBO_DOM.js` — status text overlay |
| `bboalert-sc` | *(removed)* | Not needed |

### Iframe-Internal IDs (KEPT UNCHANGED — scoped to separate iframe documents)

These don't conflict because each extension creates its own iframe with its own document:
- `adpanel0`, `adpanel`, `adpanel1`, `adpanel2`, `adpanel3`
- `bttab-bboalert`, `bttab-options`, `bttab-buttons`, `bttab-info`
- `bboalert-ds`, `bboalert-menu-file`, `bboalert-menu-settings`, `bboalert-menu-config`, `bboalert-p1`
- `myButton`

This is critical: PBS scripts from `-PBS.txt` hardcode `adpanel2`, `bttab-buttons`, etc. Keeping these unchanged means PBS scripts work without modification.

### localStorage Keys (renamed for independent storage)

| BBOalert Key | New PBS Key | Used By |
|---|---|---|
| `BBOalertCache` | `PBSCache` | `saveAlertTableToClipboard()`, data persistence |
| `BBOalertPlugin <name>` | `PBSPlugin <name>` | `addConfigBox()` in `BBOalertConfig.js` |
| `BBOalertSettings` | `PBSSettings` | `saveSettings()` / `restoreSettings()` in `functions.js` |
| `BBOalertEvents` | `PBSEvents` | Event log (if kept) |

**Note:** PBS scripts in `-PBS.txt` directly reference `localStorage.getItem('BBOalertPlugin PBS')` on lines 1018 and 1090. These two lines in the Practice-Bidding-Scenarios repo will need updating to `PBSPlugin PBS` to work with the new extension. This is a coordinated change with the PBS repo.

### CSS Classes (unchanged)
- `.bboalert` tooltip class from PBStooltips.js — kept as-is (iframe-scoped)
- `#BBOalertTooltipStyle` — kept as-is (iframe-scoped)

---

## Potential Risks

1. **Hidden dependencies in PBS scripts** — PBS Script blocks call many BBOalert functions (`sendPrivateChat`, `setChatMessage`, `setChatDestination`, `setOptionsOff`, `BBOcontext`, `whoAmI`, `hover_bboalert`, `isVisible`). Must keep all functions that PBS scripts reference, or they'll throw errors. Safest approach: strip conservatively and test with actual PBS data.
2. **`BBOalertPlugin.js` removal** — `PluginInit()` is called from `updateAlertDataAsync()` in `functions.js`. Need to remove/stub that call.
3. **`blogspot.js` dependency** — `HTMLpage2text()` in `webStorage.js` may call `parseHTML()` from `blogspot.js`. Need to verify and either keep the function or inline it.
4. **Element ID conflicts with BBOalert** — Both extensions would create `adpanel0`, `bboalert-tab`, etc. Document that only one should be active at a time.
5. **`BBOalertFind.js` removal** — `findAlert()` in `BBOalert.js` references `new BBOalertFind()`. Since we're removing findAlert, this is fine, but need to ensure no PBS scripts call `findAlertText()`.
6. **`hover_bboalert()` reference** — Called in `processTable()` line 268 and `onAnyMutation()`. PBS calls `setOptionsOff()` on login which may reference it. Need to keep or stub.

---

## Implementation Order

1. Create new repo `pbs-bbo-extension` with `src/` structure
2. Copy ALL source files from `bbo-pbs/src/` as starting point
3. Create new `manifest.json` (BBO-only matches, new name/icons)
4. Create `PBSiframe.js` (modified from `BBOalertIframe.js` — remove `BBOalertPlugin.js` and `BBOalertFind.js` from script list)
5. Modify `main.js` (remove Google Drive, tinyurl handlers)
6. Delete `BBOalertPlugin.js`, `BBOalertFind.js`, `googleDocs.js`
7. Strip `globals.js` (remove BBOalertButtonHTML, blog vars, profile vars, release notes URL)
8. Strip `BBOalertUI.js` (remove Documents tab, BBOalert button, simplify Data tab, add PBS URL input)
9. Strip `BBOalert.js` (remove findAlert/getAlert/saveAlert, clipboard import/export, recording, Dropbox/Google Docs handlers)
10. Strip `BBOobserverHandlers.js` (simplify onAnyMutation, onBiddingBoxDisplayed, onNavDivDisplayed)
11. Strip `functions.js` (remove PluginInit call, logging export, drag-and-drop, page reload)
12. Strip `webStorage.js` (remove TinyURL)
13. Strip `BBO_DOM.js` (remove profile features, BBOalert button tab management)
14. Strip `blogspot.js` (keep only parseHTML if needed, else delete)
15. Modify `BBOobserver.js` (reduce check set — keep checks needed for events PBS/BBA use)
16. Modify `init.js` — set default PBS URL, trigger data load
17. Create placeholder icons
18. Test with actual PBS data on BBO

---

## Verification

1. Load unpacked extension in Chrome
2. Navigate to BBO (`www.bridgebase.com/v3/`)
3. Verify PBS tab appears in BBO sidebar → clicks to Shortcuts tab automatically
4. Verify PBS data loads from default URL (300+ scenario buttons appear with collapsible sections)
5. Click a scenario button → verify `setDealerCode()` runs, dealer code is set
6. Verify BBA Compare config box appears in plugin settings dropdown
7. Start a practice bidding table → complete an auction → verify BBA Compare panel shows
8. Verify HCP display works on visible hands
9. Verify chat messages are sent when selecting scenarios
10. Verify "Strt Bid Tbl", "Strt Teach Tbl", "Auction Compare" action buttons work
11. Change PBS URL in settings, reload, verify new URL is used
12. Verify no console errors from missing functions/elements
13. Verify extension works when BBOalert is NOT installed
