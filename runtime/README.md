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

Two kinds of file live here, and the difference is which directive loads them.

**`runtime/*.js` - loaded with `Import,`.** These carry their own script-block
markers, so each behaves exactly like a block written inline in `-PBS.txt`:

```js
//Script,onDataLoad     <- the event this block runs on
...
//Script                <- end of block
```

**`runtime/plugins/*.js` - loaded with `Javascript,`.** These are `eval`'d whole
and register their own handlers through `addBBOalertEvent`, so they carry no
markers. `BBAcompare.js` is one.

The distinction is only about how they are loaded. It says nothing about where
they should live, and reading it as a scope boundary is how `BBAcompare.js` came
to be left behind by the original split: that work was framed as "extract the
JavaScript inline in `-PBS*.txt`", and BBAcompare was already an external URL, so
by that yardstick it looked finished. It was not - it simply had no channel, and
shipped every change straight to release with no beta stage.

Anything fetched at run time belongs here, whichever directive loads it.

The exceptions are files in repositories we do not control -
`stanmaz/BBOalert`'s `PBNcapture.js` and `PBStooltips.js`. We cannot branch
those, so they stay on `master` and have no channel. That is a constraint, not a
choice, and it is worth remembering that those two still ship unstaged.

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

**Edit `main`. Never commit to `release` directly.** `release` is produced by
promoting, and a hand edit there is a change beta never saw.

### Promoting

Everything on `main` that is ready:

```sh
git fetch origin
git checkout -B promote origin/release
git merge --no-edit origin/main
git push origin promote:release
```

**Use a merge, not `git push origin main:release`.** That works exactly once.
The moment a single file has been promoted on its own (below), `release` carries
a commit `main` does not, the branches have diverged, and the direct push is
rejected as non-fast-forward. Merging is always correct; the fast-forward only
sometimes is.

### Promoting one file

When `main` carries two independent changes and only one has finished its beta
soak, a whole-branch promotion ships both. Take just the file:

```sh
git checkout -B promote origin/release
git checkout origin/main -- runtime/thatOneFile.js
git commit -m "Promote runtime/thatOneFile.js to release"
git push origin promote:release
```

Then prove the other change did *not* come along:

```sh
curl -sf "https://raw.githubusercontent.com/…/release/runtime/startTable.js?cb=$RANDOM" \
  | grep -c navButton     # 0 = still beta-only, as intended
```

The best moment to move a file between paths is when its content is identical on
both sides: the promotion then changes which URL serves it and nothing else. Do a
path change and a code change together and a regression has two candidate causes.

### After promoting, wait before testing

`raw.githubusercontent.com` serves a stale copy for about five minutes
(`max-age=300`), so a test run started right after a merge exercises the *old*
file and the failure looks exactly like a broken fix. Poll the release URL until
it shows the new content before you trust any test:

```sh
until curl -sf ".../release/runtime/startTable.js?cb=$RANDOM" | grep -q navButton
do sleep 25; done
```

Better than either: **check the build stamp.** `runtime/buildStamp.js` publishes
the content hash of every file in this folder into the page, so "did the browser
load what I pushed?" is a comparison rather than a judgement:

```sh
node tools/stamp-runtime.mjs            # prints combined=<hash>, rewrites the stamp
node test/playwright/pwrun.mjs --test ./mytest.mjs --expect-build <hash>
```

The run reports `status: "stale"` instead of passing against the wrong code.
Regenerate the stamp whenever a `runtime/` file changes — `--check` fails if it
is out of date, and a forgotten regeneration surfaces as the same mismatch.

Reading a published commit is not evidence. That produced three wrong diagnoses
in one day, twice after the trap had already been written down here, which is
why it is now a tool rather than a warning.

## Migration status

Two data files remain, `-PBS.txt` (release) and `-PBS-beta.txt` (beta), and both
are thin import lists carrying no JavaScript of their own.

`-PBS-toggle.txt` is gone. Making it thin was not enough: it still had content of
its own, so it stayed a third thing to remember, and the very next fix had to be
hand-copied into it. Deleting was safe because it had never been the extension's
seeded default - it was a test file, reachable only by setting `PBSCache` by
hand. Do not read that as a precedent for the other two, which were handed out
and must keep resolving forever.

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
