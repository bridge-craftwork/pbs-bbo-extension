// Report which revision of runtime/ the page loaded. Pair with --expect-build
// to turn "I think it picked up my push" into a pass/fail.
//
//   node pwrun.mjs --test ./check-runtime-fresh.mjs \
//     --expect-build $(node ../../tools/stamp-runtime.mjs | grep -o 'combined=[a-f0-9]*' | cut -d= -f2)
export default async function ({ page, say, runtimeBuild }) {
  const url = process.env.PBS_URL
    || 'https://github.com/bridge-craftwork/Practice-Bidding-Scenarios/blob/main/-PBS-beta.txt';
  await page.goto('https://www.bridgebase.com/v3/app/lv', { waitUntil: 'domcontentloaded' });
  await page.evaluate(u => localStorage.setItem('PBSCache', 'BBOalert\nImport,' + u), url);
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const b = await runtimeBuild();
    if (b) { say('loaded ' + b.combined + ' from ' + url); return b; }
  }
  say('no build stamp after 25s — data file may not import runtime/buildStamp.js');
  return null;
}
