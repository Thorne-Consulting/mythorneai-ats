// Run: node --experimental-strip-types src/components/calendar/event-layout.check.mjs
import assert from 'node:assert';
import { layoutEvents } from './event-layout.ts';

const at = (h, m = 0) => new Date(2026, 10, 20, h, m);
const ev = (id, from, to) => ({ id, start: at(...from), end: at(...to) });

// Apart: each takes the full width.
let placed = layoutEvents([ev('a', [9], [10]), ev('b', [10], [11])]);
assert.deepEqual(placed.get('a'), { column: 0, columns: 1 });
assert.deepEqual(placed.get('b'), { column: 0, columns: 1 });

// Two overlap, a third reuses the first column once it is free; all three share two columns.
placed = layoutEvents([ev('a', [9], [10]), ev('b', [9, 30], [11]), ev('c', [10], [10, 30])]);
assert.deepEqual(placed.get('a'), { column: 0, columns: 2 });
assert.deepEqual(placed.get('b'), { column: 1, columns: 2 });
assert.deepEqual(placed.get('c'), { column: 0, columns: 2 });

// Three at once need three columns; a later event alone gets the full width again.
placed = layoutEvents([
  ev('a', [9], [10]),
  ev('b', [9], [10]),
  ev('c', [9], [10]),
  ev('d', [13], [14]),
]);
assert.equal(placed.get('c').columns, 3);
assert.deepEqual(placed.get('d'), { column: 0, columns: 1 });
console.log('event-layout: ok');
