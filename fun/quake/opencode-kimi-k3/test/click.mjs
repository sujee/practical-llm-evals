// Reproduce the user's click-to-start flow in a real browser via CDP.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://localhost:8123/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1024,576'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 576 });
page.on('console', m => console.log('CONSOLE:', m.type(), m.text()));
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 800));

const before = await page.evaluate(() => window.__game ? window.__game.state : 'NO GAME OBJECT');
console.log('state before click:', before);

// click center of the menu overlay, like a user would
await page.mouse.click(512, 288);
await new Promise(r => setTimeout(r, 1200));

const after = await page.evaluate(() => {
  const g = window.__game;
  return {
    state: g ? g.state : 'NO GAME OBJECT',
    menuVisible: document.getElementById('menu').classList.contains('visible'),
    hudVisible: document.getElementById('hud').classList.contains('visible'),
    pointerLock: !!document.pointerLockElement,
  };
});
console.log('after click:', JSON.stringify(after));
await page.screenshot({ path: '/var/folders/j6/m0w5wmps0vg7sf5jf5k6flj40000gn/T/opencode/click_test.png' });
await browser.close();
