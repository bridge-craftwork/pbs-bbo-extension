#!/usr/bin/env node
// Check that the loader's .dlr stripping matches the PBS pipeline, for every
// scenario.
//
// runtime/pbsDynamicLayout.js fetches dlr/<name>.dlr and turns it into the
// arguments for setDealerCode. That is a JavaScript port of parse_dlr_file and
// bbo_dealer_code in PBS's build-scripts-mac/operations/pbs_from_dlr.py, so the
// two can drift. This runs both over every .dlr in a local PBS checkout and
// compares:
//
//   - dealer code and seat  against bbo_dealer_code (the pipeline's own Python)
//   - dealer code and seat  against pbs-release/<name>.pbs, while that folder
//                           exists: what setDealerCode received before the switch
//   - chat                  against manifest/manifest-release.json
//
//   node tools/check-dlr-strip.mjs [path-to-Practice-Bidding-Scenarios]
//
// Exits 1 on any mismatch.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const PBS = process.argv[2] || join(ROOT, '..', 'Practice-Bidding-Scenarios');
if (!existsSync(join(PBS, 'dlr'))) {
  console.error(`no dlr/ under ${PBS} - pass the path to a Practice-Bidding-Scenarios checkout`);
  process.exit(2);
}

// Pull dealerFromDlr out of the runtime file by its markers
const src = readFileSync(join(ROOT, 'runtime', 'pbsDynamicLayout.js'), 'utf8');
const block = src.match(/\/\/ --- dealerFromDlr: begin[\s\S]*?\/\/ --- dealerFromDlr: end ---/);
if (!block) {
  console.error('dealerFromDlr markers not found in runtime/pbsDynamicLayout.js');
  process.exit(2);
}
const dealerFromDlr = new Function(block[0] + '\nreturn dealerFromDlr;')();

// The pipeline's answer for every .dlr, in one Python run
const py = `
import json, os, sys
sys.path.insert(0, os.path.join(sys.argv[1], 'build-scripts-mac', 'operations'))
sys.path.insert(0, os.path.join(sys.argv[1], 'build-scripts-mac'))
from pbs_from_dlr import bbo_dealer_code
out = {}
d = os.path.join(sys.argv[1], 'dlr')
for fn in sorted(os.listdir(d)):
    if fn.endswith('.dlr'):
        with open(os.path.join(d, fn), encoding='utf-8') as f:
            code, seat = bbo_dealer_code(f.read())
        out[fn[:-4]] = [code, seat]
print(json.dumps(out))
`;
const expected = JSON.parse(execFileSync('python3', ['-P', '-c', py, PBS],
  { cwd: PBS, encoding: 'utf8', maxBuffer: 64 << 20 }));

const manifestPath = join(PBS, 'manifest', 'manifest-release.json');
const scenarios = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).scenarios : {};
const pbsRelease = join(PBS, 'pbs-release');
const WRAPPER = /setDealerCode\(`([\s\S]*?)`,\s*"([NSEW])",\s*(true|false)\)/;

const failures = [];
const counts = { dlr: 0, python: 0, pbs: 0, chat: 0 };
for (const fn of readdirSync(join(PBS, 'dlr')).filter(f => f.endsWith('.dlr')).sort()) {
  const name = fn.slice(0, -4);
  const got = dealerFromDlr(readFileSync(join(PBS, 'dlr', fn), 'utf8'));
  counts.dlr++;

  const [code, seat] = expected[name];
  if (got.code !== '\n' + code + '\n' || got.seat !== seat) failures.push(`${name}: differs from bbo_dealer_code`);
  else counts.python++;

  const pbsFile = join(pbsRelease, name + '.pbs');
  if (existsSync(pbsFile)) {
    const m = readFileSync(pbsFile, 'utf8').match(WRAPPER);
    if (!m || got.code !== m[1] || got.seat !== m[2]) failures.push(`${name}: differs from pbs-release/${name}.pbs`);
    else counts.pbs++;
  }

  const entry = scenarios[name];
  if (entry && entry.chat) {
    if (got.chat !== entry.chat) failures.push(`${name}: chat differs from manifest-release.json`);
    else counts.chat++;
  }
}

console.log(`${counts.dlr} .dlr files: ${counts.python} match bbo_dealer_code, `
  + `${counts.pbs} match pbs-release/, ${counts.chat} chats match manifest-release.json`);
for (const f of failures) console.log('  MISMATCH ' + f);
process.exit(failures.length ? 1 : 0);
