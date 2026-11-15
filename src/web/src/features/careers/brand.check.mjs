// Run: node --experimental-strip-types src/features/careers/brand.check.mjs
import assert from 'node:assert';
import { brandStyle, contrast, isHexColor, socialName, textOn } from './brand.ts';

assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
assert.equal(contrast('#2468ff', '#2468ff'), 1);
// Our blue takes white text; a yellow brand gets dark text so the button stays readable.
assert.equal(textOn('#1a56e8'), '#ffffff');
assert.equal(textOn('#ffd400'), '#111827');
assert.equal(isHexColor('#12ab9F'), true);
assert.equal(isHexColor('red'), false);
assert.equal(brandStyle('nope'), undefined);
assert.equal(brandStyle('#0f766e')['--primary'], '#0f766e');
assert.equal(brandStyle('#0f766e')['--primary-foreground'], '#ffffff');
assert.equal(socialName('https://www.linkedin.com/company/acme'), 'LinkedIn');
assert.equal(socialName('https://twitter.com/acme'), 'X');
assert.equal(socialName('https://blog.acme.com/'), 'blog.acme.com');
assert.equal(socialName('not a link'), 'not a link');
console.log('brand ok');
