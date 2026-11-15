// Run: node --experimental-strip-types src/components/editor/single-line.check.mjs
import assert from 'node:assert/strict';
import { lineToValue, valueToLine } from './single-line.ts';

const subject = 'Your {{jobTitle}} interview at {{ company }} #1 *today*';
const value = lineToValue(subject);
assert.equal(value.length, 1);
assert.deepEqual(
  value[0].children.filter((n) => n.type === 'mention').map((n) => n.key),
  ['jobTitle', 'company'],
);
// Round trip keeps the text exactly, with no Markdown escapes.
assert.equal(valueToLine(value), 'Your {{jobTitle}} interview at {{company}} #1 *today*');
// Pasted lines and extra blocks become one line.
assert.equal(valueToLine(lineToValue('One\ntwo')), 'One two');
assert.equal(
  valueToLine([
    { type: 'p', children: [{ text: 'a' }] },
    { type: 'p', children: [{ text: 'b' }] },
  ]),
  'a b',
);
assert.equal(valueToLine(lineToValue('')), '');
console.log('single-line: ok');
