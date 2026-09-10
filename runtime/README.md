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

`-PBS.txt` (release) and `-PBS-beta.txt` (beta) can import the same paths from
different branches, so a beta test period isolates users without duplicating the
code:

```
-PBS.txt       ->  .../pbs-bbo-extension/blob/release/runtime/...
-PBS-beta.txt  ->  .../pbs-bbo-extension/blob/main/runtime/...
```

Promotion is then a merge rather than copying files between variants.

## Migration status

Copied here, still also served from `Practice-Bidding-Scenarios/js/` while
release continues to use that location:

- `setDealerCode-polling.js`
- `toggleRotate.js`

Not copied: `js/setDealerCode.js`, the pre-polling variant. No `-PBS*.txt`
imports it.

Still inline in the `-PBS*.txt` files, to be extracted one block at a time:
the table launchers, the PBS Dynamic layout builder, `onAnyMutation`, and the
HCP display. Preserve their relative order when extracting — later blocks use
globals that earlier ones define.
