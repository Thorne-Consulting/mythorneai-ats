// Run: node --experimental-strip-types src/lib/safe-url.check.mjs
import assert from 'node:assert';
import { safeWebUrl } from './safe-url.ts';

assert.equal(safeWebUrl('https://www.linkedin.com/in/ada'), 'https://www.linkedin.com/in/ada');
assert.equal(safeWebUrl(' http://example.com/x '), 'http://example.com/x');
assert.equal(safeWebUrl('javascript:alert(1)'), undefined);
assert.equal(safeWebUrl('JavaScript:alert(1)'), undefined);
assert.equal(safeWebUrl('data:text/html,<script>alert(1)</script>'), undefined);
assert.equal(safeWebUrl('linkedin.com/in/ada'), undefined);
assert.equal(safeWebUrl(''), undefined);
assert.equal(safeWebUrl(undefined), undefined);
console.log('safe url ok');
