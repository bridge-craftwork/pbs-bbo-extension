# BBO's Phoenix UI, the tab freeze, and what we measured

Findings from a working session on 2026-09-09/10. Written down because most of it
was *measured* rather than reasoned, and the measurements are the valuable part —
several plausible-sounding theories turned out to be wrong.

## 1. BBO rewrote its table-creation UI ("Phoenix")

`setBiddingTable` stopped starting tables: it navigated to the practice screen,
opened the create-table dialog, then silently did nothing. Users had to click
**Start** by hand.

Measured against a live session — the old elements are simply gone:

| selector | matches |
|---|---|
| `start-table-screen .buttonRowClass button` | **0** |
| `table-options-panel .toggleDivClass ion-toggle` | **0** |
| `button.bbo-phx-navigation:contains('Practice')` | 1 |

jQuery `.click()` on an empty set throws nothing, so the failure was invisible.
The only symptom was a bare `waitFor timeout` from the *next* step, because the
chain had no `.catch()`.

Note the selectors that still worked were already `bbo-phx-*`: **this was a
half-finished migration**, not a fresh break.

What replaced it:

- `bbo-create-table-modal` — creation is a modal, not a screen
- `bbo-sticky-bottom-create` — holds Cancel + **Start Table**, and is a *sibling*
  of the modal, not a descendant
- Table options are `input.bbo-phx-toggle-input`, keyed by **stable ids**
  (`allow-kibitzers`, `invisible-table`, …) — language- and order-independent,
  unlike the positional `.eq(0..4)` they replaced. BBO has since inserted
  "Video chat" at index 0, so the old positional code was setting the *wrong*
  options even before it broke.

**Also:** BBO now renders `Practice` / `Start a bidding table` on **two** surfaces
(main nav and a right-hand drawer) with identical classes. On `/practice` the
hidden copy sorts first, so `.first()` picks a button that isn't on screen. Hence
`:visible` in the selectors.

## 2. The freeze — two MutationObservers, one table

The headline bug. With **both PBS and BBOalert installed**, clicking a scenario
froze the tab: clicks dead, DevTools unable to attach, **0% CPU**, other tabs fine.

Root cause: each extension builds its own iframe and runs **its own
`BBOobserver`** over the same BBO page. Measured — they are genuinely independent
(separate windows, separate function objects, neither sees the other's globals)
but both have `parent === the BBO page`. The two interleave while `setDealerCode`
drives the Deal Source dialog, and the renderer stops responding.

Isolated by elimination, each a separate run:

| configuration | result |
|---|---|
| PBS alone | clean |
| PBS + Bridge Solver | clean |
| PBS + BBO Extractor | clean |
| **PBS + BBOalert** | **hang, reproducible** |

Then confirmed with a single variable changed:

| both extensions | BBOalert's `BBOobserver` | result |
|---|---|---|
| loaded | connected | **hang** (watchdog fired, twice) |
| loaded | **disconnected** | `setDealerCode DONE in 552ms`, survived |

Fix: `runtime/activeWatcher.js` — **one active watcher at a time, following the
last panel clicked**. Neither extension is disabled; a user clicks one panel's
button, not both, so the *handlers* were never in conflict. Only the watching is
serialised, so both panels stay live and each keeps running its own code — which
is the point of installing both.

Two things that fix depends on:

- `BBOobserver` is a **`const` lexical binding**, not a window property, so it is
  unreachable from outside the iframe. It is in scope for data-file blocks because
  those are `eval`'d *inside* it. That is why this lives in the data file and needs
  no extension change or store release.
- **BBAcompare replaces BBOalert's observer** with its own `idleModeObserver` and
  leaves `BBOobserver` disconnected deliberately. Never call `observe()` on an
  observer you did not disconnect yourself, or you resurrect it alongside
  BBAcompare's and defeat the optimisation. The first version of this fix had that
  bug and passed testing anyway, because BBAcompare *defers when PBS is present* —
  the damage would only have shown with BBOalert running alone.

### Theories that were wrong

Recorded because each looked convincing:

- a `MutationObserver` feedback loop (real bug, genuinely fixed — but not this)
- Phoenix having broken the Deal Source dialog too (it hadn't)
- the seating loop leaving an overlay open (measured: zero backdrops)
- a busy loop of any kind — **0% CPU ruled that out and I kept ignoring it**

The clue that mattered was that **release was clean and beta was not**, plus
**new tabs still opened** while the tab was dead — meaning a blocked renderer,
not a blocked browser.

## 3. Two five-second stalls, both from impossible waits

**`setDealerCode`: 5552ms → 551ms.** Step 4 waited for the dealer dropdown to
close (`$("mat-option").length === 0`) before ticking "Randomly rotate". It can
never be true: the dealer select is a **multi-select**, so it stays open by
design. The step burned its full 5s cap on *every scenario click*.

Measured while hunting for a way to close only the dropdown:

| action | options | dialog |
|---|---|---|
| click an option | 4 remain | open |
| click the select again | 4 remain | open |
| Escape at the mat-select | 0 | **closes too** |

The Escape route was tried first and is wrong — it takes the textarea with it and
step 7 then stalls for the same 5s. *The time moves rather than disappearing*,
which only per-step timing exposed. No collapse is possible and none is needed:
the checkbox is ticked by dispatching an event **at** the element, so an overlay
above it is irrelevant.

**Seating: ~8.0s → ~5.4s**, and no more padlocked seats. The old code indexed
`menu-item .eq(0)` across *every* menu item in the DOM, hidden ones included.
The seat menu is state-dependent:

| when | total | visible |
|---|---|---|
| unseated, own seat | 6 | `Sit`, `Robot`, `Reserve` |
| after you sit, North | 4 | `Robot`, `Reserve` |
| after you sit, East | 4 | `Robot` |

Click the next seat before the previous menu tears down and `.eq(0)` lands in a
stale menu — sometimes on **Reserve**, giving a padlocked empty seat that never
bids and an auction stalled forever. Now: choose from *visible* items by intent,
and confirm each seat filled (~100ms) before touching the next.

## 4. A late-arriving tab that looked like a freeze

BBO adds a **Tables** tab once a table is created. `setTabEvents()` binds its
handler only to tabs present when it runs, so that tab never got one — and that
handler is what calls `setOptionsOff()` to hide our panel. Clicking Tables left
`pbs-panel0` covering BBO's own panel: the tab highlighted, showed nothing, and
the right-hand side looked frozen at 0% CPU. It self-healed confusingly, because
clicking the PBS tab re-ran `setTabEvents()` and finally bound the new tab.

Fixed by delegation (`runtime/tabDelegation.js`), in the data file so it ships by
pushing — and because BBOalert loads the same file, one fix repairs both
extensions inside their own iframes.

## 5. `runtime/` — the JavaScript moved here

About **94% of each `-PBS*.txt` was JavaScript** (~1,000 lines each), triplicated
across release/beta/toggle variants that were ~85% identical. A Phoenix fix
applied to two of them still missed the third.

The JS now lives in `runtime/` in this repo. It is **not** packaged — it is still
fetched from GitHub at run time, deliberately: a BBO UI change can then be fixed
by pushing, where the same code in `src/` would need a store release. Two of this
session's fixes shipped that way precisely to avoid one.

`-PBS-beta.txt` went **1085 → 55 lines**, and the split was verified byte-for-byte
(only the block markers gained a `//` prefix so the files are valid JavaScript).
Ordering holds because each `Import` sits where its block was, and `addrecs()`
reserves the slot before the async fetch resolves.

Channels become **branch URLs against the same paths** rather than duplicated
code, so promoting beta to release is a merge.

## 6. Test tooling built along the way

- **`runtime/devLoader.js`** — beta-only paste-and-run bar. Paste JS, press Run;
  "Save & Run" re-applies on every load. Removes the push-to-test loop entirely,
  and with it the `raw.githubusercontent` caching that probably caused several
  confusing results this session.
- **A background Playwright harness** with a hard watchdog, so a hung page writes
  a timestamped log naming the step it died on instead of blocking for a minute.
  Extension filtering (`--only pbs,bboalert`) is what isolated the freeze.

## 7. Two pipelines shown to be viable

**Script testing without pushing.** PBN Capture's auto-redeal loop runs
unattended: config armed purely through `localStorage`
(`BBOalertPlugin PBN capture and auto-redeal`), results readable from
`localStorage['PBNcapture']` — no Export button, no clipboard, no downloads.
Measured **3 deals in 5 seconds** with robots in all four seats.

Two gotchas: capture only fires on a *completed* auction, so the fixture needs
robots in **all four** seats — do not sit down and swap later, because leaving
your own seat raises a Material confirm dialog that blocks silently (Playwright's
native-dialog handler never sees it). And BBO's **Animation** setting must be off.

**Uploading to the deal archive.** Verified end to end with a LIN file generated
on the fly:

- create folder — click `img.flex-header-icon` in the SELECT FOLDER heading
- upload — `POST v2linuploader_sess.php?cu=<user>&cp=<token>&cf=<folderId>`
- result — *"2 games were successfully uploaded"*, deals listed as Board 1/Board 2

The uploader is on **`www.bridgebase.com`, same origin as the app**, so page code
can POST a `FormData` directly with no GUI. (`webutil.bridgebase.com`, which
serves the folder list via `ard.php`, *is* cross-origin and refuses direct fetch.)

Still unknown: selecting an uploaded folder as a table's deal source, and getting
the folder id programmatically.

## Open items

- `setDealerCode` 5s fix — PR #9, unmerged
- Phoenix Start fix for **release** — Practice-Bidding-Scenarios PR #303, unmerged
- Release still has none of this; beta carries it all, by choice
- `activeWatcher` only works if **both** data files import it, so it needs to
  reach release before the both-installed case is fixed for real
- Moving `BBAcompare.js` into this repo, and its `isSettingON(5/6/8)` indices,
  which are BBOalert setting numbers that mean nothing under PBS
