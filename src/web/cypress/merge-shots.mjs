// Moves the page walk's screenshots and index into docs/screenshots. A run replaces the whole
// dark-mode set, so shots of records that no longer exist do not pile up. Light shots stay.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

const from = path.resolve('cypress/screenshots');
const to = path.resolve('../../docs/screenshots');
const index = path.join(from, 'index-desktop-dark.tsv');
if (!existsSync(index)) {
  console.log('No index: run `cypress run` first.');
  process.exit(1);
}
mkdirSync(to, { recursive: true });

// Only this run's shots: the ones the index names, plus the flow shots the spec names itself.
const listed = new Set(
  readFileSync(index, 'utf8')
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t')[1])
    .filter(Boolean),
);
for (const old of readdirSync(to)) if (/-desktop-dark/.test(old)) unlinkSync(path.join(to, old));

let moved = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (
      entry.name.endsWith('.tsv') ||
      listed.has(entry.name) ||
      entry.name.includes('_flow_')
    ) {
      renameSync(full, path.join(to, entry.name));
      moved++;
    }
  }
}
walk(from);
rmSync(from, { recursive: true, force: true });
console.log(`${moved} files moved to ${to}`);
