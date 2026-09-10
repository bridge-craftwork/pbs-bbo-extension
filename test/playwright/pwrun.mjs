// Background Playwright harness.
// The point: a hard watchdog guarantees this process exits and writes a result
// even if the page wedges, so a stalled browser never blocks the caller.
import { chromium } from '/Users/rick/.npm/_npx/705bc6b22212b352/node_modules/playwright-core/index.mjs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 ? process.argv[i + 1] : d;
};
const OUT = arg('out', '/tmp/pwrun.json');
const TEST = arg('test');
const TIMEOUT = parseInt(arg('timeout', '45'), 10) * 1000;
// --keep-open leaves the browser up after the run so it can be inspected and
// driven by hand. The result file is still written at the normal time; this
// process simply does not exit, so poll for the file rather than the exit.
const KEEP_OPEN = process.argv.includes('--keep-open');
// --profile lets a run use a second, slim profile so it does not contend with
// a browser already open on the main one.
const PROFILE = arg('profile', '/Users/rick/.playwright-mcp/bbo-profile');
const EXT = '/Users/rick/.playwright-mcp/ext';
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
  say('password manager: ' + disablePasswordManager(PROFILE));
  ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    // Pinned: the bundled playwright-core expects a chromium build that is
    // not installed. Use the same one the MCP server drives.
    executablePath: '/Users/rick/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
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
  const result = await mod.default({ page, ctx, say });
  say('test returned');
  clearTimeout(watchdog);
  if (!KEEP_OPEN) { try { await ctx.close(); } catch {} }
  finish('ok', { result, dialogs });
} catch (e) {
  say('ERROR: ' + (e?.message || e));
  clearTimeout(watchdog);
  if (!KEEP_OPEN) { try { await ctx?.close(); } catch {} }
  finish('error', { error: String(e?.message || e), dialogs });
}
