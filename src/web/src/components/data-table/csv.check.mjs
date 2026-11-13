// Run: node --experimental-strip-types src/components/data-table/csv.check.mjs
import assert from 'node:assert';
import { toCsv } from './csv.ts';

assert.equal(toCsv([['a', 'b'], [1, null]]), 'a,b\r\n1,');
assert.equal(toCsv([['Smith, Jo']]), '"Smith, Jo"');
assert.equal(toCsv([['say "hi"']]), '"say ""hi"""');
assert.equal(toCsv([['line\nbreak']]), '"line\nbreak"');
assert.equal(toCsv([['=SUM(A1)']]), "'=SUM(A1)");
assert.equal(toCsv([['-5']]), "'-5");
console.log('csv ok');
