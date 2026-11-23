// Run: node --experimental-strip-types src/features/careers/source.check.mjs
import assert from 'node:assert';

// A stand-in for the browser's localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
};
const { captureSource, readSource, sourceQuery } = await import('./source.ts');

assert.equal(sourceQuery('?src=indeed&page=2'), '?src=indeed');
assert.equal(sourceQuery('?utm_source=li&utm_medium=post&foo=1'), '?utm_source=li&utm_medium=post');
assert.equal(sourceQuery('?page=2'), '');
assert.equal(sourceQuery(''), '');

// Nothing stored until a tagged visit.
captureSource('?page=2');
assert.deepEqual(readSource(), {});

// A tagged visit is kept with an expiry; the first one wins.
captureSource('?src=indeed&utm_campaign=spring');
assert.deepEqual(readSource(), { source: 'indeed', utmCampaign: 'spring' });
captureSource('?src=linkedin');
assert.deepEqual(readSource(), { source: 'indeed', utmCampaign: 'spring' });
const until = JSON.parse(store.get('careers-source')).until;
assert.ok(until > Date.now() + 29 * 24 * 60 * 60 * 1000, 'kept for about 30 days');

// An expired entry reads as nothing, and the next tagged visit replaces it.
store.set('careers-source', JSON.stringify({ source: 'old', until: Date.now() - 1 }));
assert.deepEqual(readSource(), {});
captureSource('?src=linkedin');
assert.deepEqual(readSource(), { source: 'linkedin' });

// Malformed entries read as nothing.
store.set('careers-source', '{"source":"x"}');
assert.deepEqual(readSource(), {});
store.set('careers-source', 'not json');
assert.deepEqual(readSource(), {});

console.log('source ok');
