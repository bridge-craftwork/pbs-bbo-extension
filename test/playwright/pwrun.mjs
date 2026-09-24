// Background Playwright harness.
// The point: a hard watchdog guarantees this process exits and writes a result
// even if the page wedges, so a stalled browser never blocks the caller.
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { homedir } from 'os';
import { createRequire } from 'module';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 ? process.argv[i + 1] : d;
};

// Everything this harness needs lives outside the repo -- a Chromium, a browser
// profile signed in to BBO, the unpacked extensions, playwright-core itself --
// and all four used to be written down as one person's home directory. Each is
// now a name with a per-user default, so a second Mac needs no edits to this
// file: HOME resolves the defaults, and a flag or env var overrides any of them.
const HOME = homedir();
const PW_CACHE = process.env.PW_CACHE || HOME + '/Library/Caches/ms-playwright';

// --check reports what this machine has and exits, launching neither a browser
// nor a BBO session. It is the first thing to run on a Mac that has not done
// this before: none of what it checks is in the repo, so "it works here" says
// nothing about anywhere else.
const CHECK = process.argv.includes('--check');

// playwright-core is not a dependency of this repo -- nothing here is npm
// installed -- so it is found rather than imported by name. The copy npx leaves
// behind when the Playwright MCP server runs is the one these Macs already
// have; its directory is a content hash, so it is searched for, not named.
const require_ = createRequire(import.meta.url);
function resolvePlaywrightCore() {
  const explicit = arg('playwright-core', process.env.PW_CORE);
  if (explicit) {
    if (!existsSync(explicit)) throw new Error('--playwright-core / PW_CORE does not exist: ' + explicit);
    return explicit;
  }
  try { return require_.resolve('playwright-core'); } catch {}
  const npx = HOME + '/.npm/_npx';
  if (existsSync(npx)) {
    for (const dir of readdirSync(npx)) {
      for (const entry of ['index.mjs', 'index.js']) {
        const p = `${npx}/${dir}/node_modules/playwright-core/${entry}`;
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error(
    'playwright-core not found. Install it (npm i -g playwright-core) or point PW_CORE ' +
    'at a copy. Running the Playwright MCP server once also leaves one in ~/.npm/_npx.');
}

let PW_CORE = null, coreError = null;
try { PW_CORE = resolvePlaywrightCore(); } catch (e) { if (!CHECK) throw e; coreError = e.message; }

// A CJS resolution usually gives named exports through the module lexer, but
// not always; take either shape.
let chromium = null;
if (PW_CORE) {
  const pwCore = await import(pathToFileURL(PW_CORE).href);
  chromium = pwCore.chromium || pwCore.default?.chromium;
  if (!CHECK && !chromium) throw new Error('playwright-core at ' + PW_CORE + ' exports no chromium');
}
const OUT = arg('out', '/tmp/pwrun.json');
const TEST = arg('test');
const TIMEOUT = parseInt(arg('timeout', '45'), 10) * 1000;
// --keep-open leaves the browser up after the run so it can be inspected and
// driven by hand. The result file is still written at the normal time; this
// process simply does not exit, so poll for the file rather than the exit.
const KEEP_OPEN = process.argv.includes('--keep-open');
// --profile lets a run use a second, slim profile so it does not contend with
// a browser already open on the main one.
const PROFILE = arg('profile', process.env.PBS_BBO_PROFILE || HOME + '/.playwright-mcp/bbo-profile');
// --expect-build <hash>  fail the run if the page loaded a different revision of
// runtime/ than the one on disk. Get the hash from: node tools/stamp-runtime.mjs
const EXPECT_BUILD = arg('expect-build');
const EXT = arg('ext', process.env.PBS_BBO_EXT || HOME + '/.playwright-mcp/ext');
// Which Chromium to launch. The bundled playwright-core expects a build that is
// usually not installed, and pinning one build number broke the harness the
// moment the MCP server updated (1243 -> 1244). So resolve it at launch:
//   1. --chromium <path> or $PW_CHROMIUM, when a specific build is wanted
//   2. the build playwright-core itself expects, if it happens to be installed
//   3. the newest chromium-NNNN in the Playwright cache
const CHROME_IN_BUILD = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
function resolveChromium() {
  const explicit = arg('chromium', process.env.PW_CHROMIUM);
  if (explicit) {
    if (!existsSync(explicit)) throw new Error('--chromium / PW_CHROMIUM does not exist: ' + explicit);
    return explicit;
  }
  try { const own = chromium.executablePath(); if (existsSync(own)) return own; } catch {}
  const builds = (existsSync(PW_CACHE) ? readdirSync(PW_CACHE) : [])
    .map(d => /^chromium-(\d+)$/.exec(d)).filter(Boolean)
    .map(m => ({ n: +m[1], path: PW_CACHE + '/' + m[0] + '/' + CHROME_IN_BUILD }))
    .filter(b => existsSync(b.path))
    .sort((a, b) => b.n - a.n);
  if (!builds.length) throw new Error('no Chromium found in ' + PW_CACHE + ' - run: npx playwright install chromium');
  return builds[0].path;
}
// PBS, BBOalert, Bridge Solver, BBO Extractor
const ALL = { pbs:      'bfgapanhaiakopfngbjiapbcgdgojoed',
              bboalert: 'bjgihidachainhhhilkeemegdhehnlcf',
              solver:   'kokhaneonlmnbgbnlohmbkgeahbjanbj',
              extractor:'omcdgcoibkfkiikoniabecnbbacmhfij' };
// --only pbs           -> load just PBS (removes the two-instance variable)
// --without bboalert   -> load everything except the named one
const only = arg('only');
const without = (arg('without') || '').split(',').filter(Boolean);
let names = only ? only.split(',') : Object.keys(ALL);
names = names.filter(n => !without.includes(n));
const IDS = names.map(n => ALL[n]).filter(Boolean);
const paths = IDS.map(i => EXT + '/' + i).join(',');

if (CHECK) {
  const line = (ok, label, detail) =>
    console.log(`  ${ok ? 'OK     ' : 'MISSING'}  ${label.padEnd(15)} ${detail}`);
  let chromiumPath = null, chromiumError = null;
  try { chromiumPath = resolveChromium(); } catch (e) { chromiumError = e.message; }
  const profileOk = existsSync(PROFILE) && readdirSync(PROFILE).length > 0;
  const missingExt = names.filter(n => !existsSync(EXT + '/' + ALL[n]));

  console.log('pwrun.mjs --check: nothing is launched, no BBO session is opened.');
  line(!!PW_CORE, 'playwright-core', PW_CORE || coreError);
  line(!!chromiumPath, 'chromium', chromiumPath || chromiumError);
  line(profileOk, 'BBO profile', PROFILE + (profileOk ? '' : '  (sign in to BBO once in this profile)'));
  line(missingExt.length === 0, 'extensions',
       missingExt.length ? `${EXT} lacks: ${missingExt.join(', ')}` : `${names.join(', ')} in ${EXT}`);

  const ready = PW_CORE && chromiumPath && profileOk && !missingExt.length;
  console.log(ready ? '\nReady.' : '\nNot ready. See docs/testing-with-playwright.md.');
  process.exit(ready ? 0 : 1);
}

const log = [];

// Chrome's password manager fires "Save password?" on this profile even though
// nothing here types a password: BBO keeps a sign-in form in the DOM, and any
// scripted interaction near it is enough for Chrome's heuristics. The dialog is
// spurious, it steals focus mid-run, and it has come back before now - the
// setting lives in the PROFILE, so rebuilding the profile silently loses it.
// Enforce it on every launch instead, so a fresh profile is fixed automatically.
const disablePasswordManager = (profileDir) => {
  const dir = profileDir + '/Default';
  const file = dir + '/Preferences';
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const prefs = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    prefs.credentials_enable_service = false;      // no "Save password?" bubble
    prefs.credentials_enable_autosignin = false;   // no silent re-auth
    prefs.profile = { ...(prefs.profile || {}), password_manager_enabled: false };
    prefs.autofill = { ...(prefs.autofill || {}),
                       profile_enabled: false, credit_card_enabled: false };
    writeFileSync(file, JSON.stringify(prefs));
    return 'prefs written';
  } catch (e) { return 'FAILED: ' + (e?.message || e); }
};
let dialogs = [];
const say = m => { log.push(`[${new Date().toISOString().slice(11,19)}] ${m}`); };
const finish = (status, extra = {}) => {
  try { writeFileSync(OUT, JSON.stringify({ status, log, keptOpen: KEEP_OPEN, ...extra }, null, 2)); } catch {}
  if (KEEP_OPEN) {
    console.log('[harness] result written; browser left open. kill ' + process.pid + ' to close it.');
    setInterval(() => {}, 1 << 30);   // park forever, browser stays up
    return;
  }
  process.exit(status === 'ok' ? 0 : 2);
};

// Watchdog: fires no matter what the page is doing.
const watchdog = setTimeout(() => {
  say(`WATCHDOG fired after ${TIMEOUT/1000}s — page or browser hung`);
  finish('timeout', { dialogs });
}, TIMEOUT);
watchdog.unref?.();

let ctx;
try {
  say('launching with extensions: ' + names.join(', '));
  const CHROMIUM = resolveChromium();
  say('chromium: ' + CHROMIUM.replace(PW_CACHE + '/', '').split('/')[0]);
  say('password manager: ' + disablePasswordManager(PROFILE));
  ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    executablePath: CHROMIUM,
    args: [`--disable-extensions-except=${paths}`, `--load-extension=${paths}`,
           '--disable-blink-features=AutomationControlled',
           // belt and braces alongside the profile prefs above
           '--password-store=basic',
           '--disable-features=PasswordManagerOnboarding,AutofillEnableAccountWalletStorage'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(15000);

  // A native modal (alert/confirm/beforeunload) blocks the renderer at 0% CPU:
  // the tab stops responding, DevTools will not attach, but other tabs are fine.
  // That is the exact signature we have been chasing, so capture and dismiss any
  // dialog and record its message - an unexpected alert() is the smoking gun.
  dialogs = [];
  page.on('dialog', async d => {
    dialogs.push({ type: d.type(), message: d.message() });
    say('DIALOG ' + d.type() + ': ' + JSON.stringify(d.message()));
    // beforeunload must be ACCEPTED: dismissing it means "stay on this page",
    // which silently cancels the navigation the test is waiting for. Everything
    // else is dismissed so a stray alert cannot block the run.
    try { if (d.type() === 'beforeunload') await d.accept(); else await d.dismiss(); } catch {}
  });
  page.on('pageerror', e => say('PAGEERROR: ' + (e?.message || e)));

  // --net logs non-static requests, so a GUI flow reveals the endpoints behind it.
  if (process.argv.includes('--net')) {
    page.on('request', r => {
      const u = r.url();
      if (/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|otf|ico)(\?|$)/i.test(u)) return;
      if (/doubleclick|googlead|amazon-adsystem|inmobi|33across|rubicon|bing|google-analytics|googletagmanager|fastclick/i.test(u)) return;
      const m = r.method();
      if (m === 'GET' && !/api|upload|deal|folder|lin/i.test(u)) return;
      let body = '';
      try { const pd = r.postData(); if (pd) body = ' body=' + pd.slice(0, 300); } catch {}
      say('NET ' + m + ' ' + u.slice(0, 180) + body);
    });
    // capture responses from the LIN uploader so a rejection is visible
    page.on('response', async r => {
      if (!/linuploader|ard\.php/i.test(r.url())) return;
      try {
        const t = await r.text();
        say('RESP ' + r.status() + ' ' + r.url().slice(0, 90) + ' -> ' + t.replace(/\s+/g,' ').slice(0, 400));
      } catch {}
    });
  }
  page.on('console', m => {
    const t = m.text();
    if (/\[PBS|BBA Compare|FAILED|waitFor timeout|deferring/.test(t)) say('console: ' + t.slice(0, 140));
  });
  say('launched');

  // Every run signs in, and each sign-in notifies everyone on the account's
  // friends list - so a day of testing spams real people. BBO's sign-in has an
  // "Invisible" toggle, and it is driven entirely by ONE localStorage key:
  //
  //     localStorage.invisible === 'y'
  //
  // Measured: after signing in once with the toggle ticked, a later sign-out
  // brought the form back up with the toggle already checked:true, untouched,
  // with the key reading "y". BBO READS the key, it does not merely record the
  // last choice - so setting it is equivalent to clicking the toggle, and does
  // not depend on the form ever being reachable (this profile auto-connects
  // from a stored session, so the form usually never renders at all).
  //
  // addInitScript runs before any page script in every frame, so the key is in
  // place before BBO can read it. No credentials are touched: the password is
  // BBO's own localStorage entry and this never reads, writes or types it.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('invisible', 'y'); } catch (e) { /* sandboxed frame */ }
  });

  const mod = await import(pathToFileURL(TEST).href);
  // Which revision of runtime/ did the browser actually load? Published by
  // runtime/buildStamp.js. Recorded on EVERY run, because "is this the code I
  // just pushed?" was a judgement call three times in one day and wrong each
  // time - raw.githubusercontent caches for ~5 minutes.
  const runtimeBuild = async () => {
    try {
      return await page.evaluate(() => {
        const f = document.getElementById('pbs-iframe');
        const w = f && f.contentWindow;
        return (w && w.pbsRuntimeBuild) ? w.pbsRuntimeBuild : null;
      });
    } catch { return null; }
  };

  const result = await mod.default({ page, ctx, say, runtimeBuild });
  const build = await runtimeBuild();
  let stale = false;
  if (build) {
    say('runtime build loaded: ' + build.combined);
    if (EXPECT_BUILD && build.combined !== EXPECT_BUILD) {
      say('STALE: expected build ' + EXPECT_BUILD + ' but the page loaded ' + build.combined);
      stale = true;
    }
  } else if (EXPECT_BUILD) {
    say('STALE CHECK FAILED: no window.pbsRuntimeBuild - does this data file import buildStamp.js?');
    stale = true;
  }
  say('test returned');
  clearTimeout(watchdog);
  if (!KEEP_OPEN) { try { await ctx.close(); } catch {} }
  finish(stale ? 'stale' : 'ok',
         { result, dialogs, runtimeBuild: build, expectedBuild: EXPECT_BUILD || undefined });
} catch (e) {
  say('ERROR: ' + (e?.message || e));
  clearTimeout(watchdog);
  if (!KEEP_OPEN) { try { await ctx?.close(); } catch {} }
  finish('error', { error: String(e?.message || e), dialogs });
}
