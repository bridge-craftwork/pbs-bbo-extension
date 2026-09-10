# runtime/

JavaScript that the extension **fetches from GitHub at run time**. It is *not*
part of the packaged extension — nothing here is in `src/`, nothing here ships
through the Chrome, Firefox or App Store review process.

That distinction is the point. A BBO UI change can break this code overnight;
fixing it means pushing to this repo, and users pick it up on their next page
load. Code that lives in `src/` needs a store release to fix — days at best. So
behaviour that has to track BBO's UI belongs here, and only here.

## How it gets loaded

The chain starts from `PBSCache` in the user's `localStorage`, which points at a
`-PBS*.txt` file in `bridge-craftwork/Practice-Bidding-Scenarios`. That file
lists `Import,` lines; each one is fetched and included as data records.

A file in this folder carries its own script-block markers, so it behaves
exactly like a block written inline in `-PBS.txt`:

```js
//Script,onDataLoad     <- the event this block runs on
...
//Script                <- end of block
```

Fetching works because `raw.githubusercontent.com` sends
`Access-Control-Allow-Origin: *`. The extension declares no `host_permissions`
and needs none — but **this repo must stay public**, or the raw URLs stop
resolving for everyone.

## Channels

`-PBS.txt` (release) and `-PBS-beta.txt` (beta) import the same paths from
different branches, so a beta test period isolates users without duplicating the
code:

```
-PBS.txt       ->  .../pbs-bbo-extension/blob/release/runtime/...
-PBS-beta.txt  ->  .../pbs-bbo-extension/blob/main/runtime/...
```

Promotion is a merge — `main` into `release` in this repo — rather than copying
files between variants. Nothing in `runtime/` may name a channel: a version
string hardcoded here would describe the wrong one for half the users. The data
file declares `window.pbsVersionLabel` and `window.pbsClientVersion`, and code
here reads those.

Beware the raw CDN cache. `raw.githubusercontent.com` serves a stale copy for
minutes after a push, so a test run right after a merge can exercise the *old*
file and look like a failed fix. Cache-bust with a query string when checking by
`curl`, and in the browser confirm what is loaded by reading the function back
(`setDealerCode.toString()`) rather than trusting the URL.

## Migration status

`-PBS.txt` (release) and `-PBS-beta.txt` (beta) are both thin import lists
carrying no JavaScript of their own. `-PBS-toggle.txt` has a PR open to do the
same; until it merges, that file is still a stale v4.1.8 copy of release.

`Practice-Bidding-Scenarios/js/` still holds the pre-split originals
(`setDealerCode-polling.js`, `toggleRotate.js`, `setDealerCode.js`). Nothing
imports them any more, and they are kept only so that URLs which may still sit
in somebody's `PBSCache` keep resolving. **Do not edit them** — they are frozen
copies, and a fix applied there reaches nobody. That trap has already been
sprung once: after the beta split these two files went on being imported from
`js/` while the fixed copies here were imported by nothing, so two fixes that
were believed shipped were in fact loaded by no one for a day.

When extracting anything further, preserve relative order — later blocks use
globals that earlier ones define.
