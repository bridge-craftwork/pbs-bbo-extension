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

## Shipped to release, 2026-09-10

All of the above reached release that day. The order mattered, and one thing
found on the way changes how the beta channel should be read.

**The beta split had quietly stopped shipping two of its own fixes.**
`-PBS-beta.txt` was rewritten to import `runtime/`, but two lines were left
pointing at the pre-split originals in `Practice-Bidding-Scenarios/js/`. Both
files had been copied to `runtime/` *and then fixed there*, so beta went on
loading the unfixed copies and the fixed ones were imported by nothing.
Measured on the live raw URLs beta actually fetched: the 5s dead wait still
present, `pbsGetRotatePref` absent. Beta was in fact *behind*
`beta/phoenix-plus-sticky-rotate`, which had imported those two from its own
branch. Merging PR #9 would have changed nothing for anyone.

The lesson is the section-2 lesson again in a different costume: **verify what
is loaded, not what is published.** The check that settles it is reading the
function back out of the iframe — `setDealerCode.toString()` — rather than
trusting the URL or the commit.

- **PR #9** merged, then actually wired up: beta and release both import
  `runtime/setDealerCode-polling.js`. `setDealerCode DONE in 551ms`, confirmed
  on both channels with `deadWaitPresent: false` read from the live function.
- **PBS #303** merged to release, then superseded hours later by the split —
  `runtime/startTable.js` is a superset, adding the `:visible` guard and the
  seating fix that #303 did not carry.
- **`-PBS.txt` split, 1135 → 80 lines.** Verified block by block against the
  file it replaced: four of six inline blocks byte-identical to their
  `runtime/` counterpart, one differing only by the deferGuard early-out, and
  the 836-line layout builder differing in exactly two substantive hunks
  (auto-start, and the version now coming from the data file).
- **`activeWatcher.js` is in release**, so the both-extensions-installed freeze
  is closed whenever both extensions load a data file that imports it — but see
  below, because that condition is narrower than it looks.
- **Channel identity moved into the data file.** Nothing in `runtime/` may name
  a channel now that both channels load the same files; release was otherwise
  about to report itself as `1.9.26-beta` on every scenario click.

## The freeze is fixed

The headline bug is closed: **installing PBS and BBOalert together used to freeze
the tab on a scenario click, and it no longer does.** Confirmed on release with
both extensions loaded — `setDealerCode DONE in 552ms`, page still responsive,
and the watcher visibly handing over:

```
[BBA Compare] PBS extension detected on page - deferring to PBS instance
[PBS watcher] BBOalert -> ACTIVE (startup)
[PBS watcher] BBOalert -> standby
```

That is the case users are in, and it is the case that matters.

One configuration note for whoever maintains this next, not a caveat on the
above: `activeWatcher.js` lives in the data file, so it only serialises
instances that load one. A BBOalert whose `BBOalertCache` has never been pointed
anywhere seeds to an empty `"BBOalert\n"` and imports nothing — no watcher, no
BBAcompare — while still running its own `BBOobserver`. Point `BBOalertCache` at
`-PBS.txt` as well, which is the documented arrangement anyway, and it is
covered. Closing that by code would need the registration inside BBOalert's own
extension or its default data file, both somebody else's repo, and it is not
worth chasing: a BBOalert with no data file does nothing useful in the first
place.

## Still open

- ~~`-PBS-toggle.txt`~~ — **deleted.** Pointing it at the release runtime was
  the first move, and it was not enough: a thin file still has content, so it
  stayed a third thing to remember, and the next fix after that had to be
  hand-copied into it. Safe to delete because it had never been the seeded
  default - added as a test file in Feb 2026 and reachable only by setting
  `PBSCache` by hand. The other two were handed out and must keep resolving.
- Moving `BBAcompare.js` into this repo, and its `isSettingON(5/6/8)` indices,
  which are BBOalert setting numbers that mean nothing under PBS
- `Practice-Bidding-Scenarios/js/` is now frozen dead code kept only so old
  cached URLs resolve. It is a live trap — see above — and a fix applied there
  reaches nobody.
- The shipped extension seeds `ADavidBailey/Practice-Bidding-Scenarios`, which
  still resolves only because GitHub redirects the repo's former name to
  `bridge-craftwork`. That redirect is now load-bearing for every existing
  install: renaming the repo again, or creating a new repo under the old name,
  would break them.
