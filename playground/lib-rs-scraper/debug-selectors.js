import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://lib.rs/crates/tokio', { waitUntil: 'domcontentloaded' });

console.log('=== Authors section ===');
const byline = await page.locator('p.byline').innerHTML();
console.log(byline);

console.log('\n=== Dependencies section ===');
const depsSection = await page.locator('section#deps').innerHTML().catch(() => 'NOT FOUND');
console.log(depsSection.slice(0, 2000));

console.log('\n=== Testing author selectors ===');
const authorSelectors = [
  'p.byline span.coowners a.owner span[property="name"]',
  'p.byline a.owner span[property="name"]',
  'p.byline a.owner',
  'p.byline span.coowners a',
];

for (const sel of authorSelectors) {
  const count = await page.locator(sel).count();
  const texts = [];
  if (count > 0) {
    const els = await page.locator(sel).all();
    for (const el of els.slice(0, 3)) {
      texts.push(await el.textContent());
    }
  }
  console.log(sel + ' => count:' + count + ', texts: ' + JSON.stringify(texts));
}

await browser.close();
