# Testing against a live BBO session

Everything here drives a **real BBO account on the real site**. There is no test
server, so the rules below are about not making a mess of a live account, and
about not fooling yourself.

The harness is `test/playwright/pwrun.mjs`; an example test is beside it.

## The one rule that matters

**Verify what is LOADED, not what is published.**

`raw.githubusercontent.com` caches for ~5 minutes (`max-age=300`). A test run
started right after a merge will happily fetch the *old* file and fail, and the
failure looks exactly like a broken fix. This has now caused a wrong diagnosis
twice in one day, the second time after the trap was already written down.

Two habits that defeat it:

```js
// read the function back out of the iframe
const src = w.setDealerCode.toString();
const stillBroken = /mat-option", doc\)\.length === 0/.test(src);
```

```js
// or watch for a log line only the NEW code can print
"[PBS] seat directions for this language: [...]"
```

Cache-bust `curl` checks with a query string (`?cb=$RANDOM`), and prefer a
**fresh branch name** when testing a data file — a URL nobody has fetched cannot
be stale.

## Running a test

```bash
node pwrun.mjs --test ./mytest.mjs --out /tmp/out.json \
  --only pbs,bboalert \
  --profile ~/.playwright-mcp/bbo-profile-test \
  --timeout 150
```

| flag | why |
|---|---|
| `--only pbs,bboalert` | load just these extensions. Isolating to `pbs` alone is what identified the two-extension freeze |
| `--without bboalert` | the inverse |
| `--profile` | use the slim test profile so it does not contend with a browser open on the main one |
| `--timeout N` | seconds. A **hard watchdog** writes the result and names the step even if the page wedges, so a hung tab never blocks you |
| `--keep-open` | leave the browser up afterwards to poke at by hand. The result file is still written on time, so poll for the file, not for the process |
| `--net` | log non-static requests, so a GUI flow reveals the endpoints behind it |

A test is a module exporting `default async ({ page, ctx, say })`. Use `say()`
rather than `console.log` so the line lands in the result file.

## localStorage is the control panel

BBO keeps almost everything worth manipulating in `localStorage` on
`www.bridgebase.com`. Writing a key and reloading beats driving menus: it is
faster, it cannot half-complete, and it does not change the account.

| key | value | what it does |
|---|---|---|
| `PBSCache` | `BBOalert\nImport,<url>` | which data file PBS loads. Set it to a branch URL to test a change |
| `BBOalertCache` | same shape | the other extension's data file. Point it at the **same** file to test the both-installed case |
| `invisible` | `y` | **always set this.** Every sign-in notifies the account's friends; a day of runs spams real people. BBO reads the key, so setting it is equivalent to ticking the box on the sign-in form |
| `lang` | `en`, `tr`, `id`, … | interface language, **without touching the account setting**. This is how the non-English bugs were found |
| `pbsRotateDeals` | `true`/`false` | the rotate preference |
| `pbsLastTableType` | `bidding`/`teaching` | what auto-start creates |
| `pbsDevJS` | JS source | the dev loader's saved snippet — remove it unless you are testing it |
| `userID`, `password` | — | **never read, write, or print these.** BBO stores the password here in plain text |

The harness sets `invisible` for you via `addInitScript`, before any page script
runs, so it is in place before BBO can read it.

### Auto-login

The test profile carries a signed-in session, so the sign-in form normally never
renders — `signInFormPresent` is `false`. BBO refills its own form from its own
`localStorage`, so a sign-out/sign-in round trip needs no credential handling and
no browser autofill. Sign out via `.logoutBlock button.nameTagClass`, then the
element whose text is exactly `Sign out` — it is **not** a `<button>`, so a
button-only selector finds nothing. A `Yes` confirm follows.

### Chrome's password manager

It fires a spurious "Save password?" on this profile even though nothing types a
password. The setting lives in the **profile**, so rebuilding the profile loses
it — the harness therefore rewrites `<profile>/Default/Preferences` on every
launch (`credentials_enable_service` and friends). Two habits avoid provoking it:
never grab an input with a document-wide `querySelectorAll('input')` fallback,
and never press Enter to submit. Scope every field to the form you mean.

## Testing runtime JS without pushing

`runtime/devLoader.js` is imported by `-PBS-beta.txt` only. It adds a paste bar
to the PBS panel: paste JavaScript, press **Run**; **Save & Run** re-applies it on
every load. This removes the push-to-test loop, and with it the CDN caching above.

From a test, the same thing without the GUI:

```js
await page.evaluate(code => {
  const w = document.getElementById('pbs-iframe').contentWindow;
  w.eval(code);              // redefines window.startTable, etc.
}, readFileSync('runtime/startTable.js','utf8').replace(/^\/\/Script.*$/gm,''));
```

Strip the `//Script` marker lines — they are data-file directives, not JavaScript.

## Reproductions worth keeping

**The two-extension freeze.** Load both extensions, point `PBSCache` *and*
`BBOalertCache` at the same data file, start a table, click a scenario. Healthy
is `setDealerCode DONE in ~550ms`; broken is the watchdog firing with the tab at
0% CPU.

**Non-English breakage.** Set `lang` to `tr` and start a table. Healthy logs
`seat directions for this language: [...]` and fills four seats. The instructive
failure was a table that reported `DONE` **faster** than a healthy one, because
every seat looked already-filled and the work was skipped — a green tick on an
empty table. Always assert the seats, never just the `DONE` line.

## Leave it as you found it

- put `lang` back to `en`
- leave `invisible` at `y`
- point `PBSCache` back at a release URL rather than a scratch branch
- kill any `--keep-open` browser (`kill <pid>`; the harness prints it)
- do not commit `.playwright-mcp/` — it is gitignored for a reason, being console
  and network dumps from a live account
