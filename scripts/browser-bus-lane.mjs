import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('[data-action="direction"]').first().click();
  await page.locator('[data-direction="1"]').click();
  await page.locator('[data-action="cow"]').click();
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.locator('#clock-status:not(.hidden)').waitFor({ state: 'visible', timeout: 50000 });
  assert.match(await page.locator('#clock-status').textContent(), /Bus lane active|Leave bus lane/i);

  const redDistribution = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas.game-canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const pixel = new Uint8Array(4);
      let left = 0;
      let right = 0;
      for (let y = 0; y < canvas.height * .62; y += 3) {
        for (let x = 0; x < canvas.width; x += 3) {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          const red = pixel[0] > 105 && pixel[0] > pixel[1] * 1.55 && pixel[0] > pixel[2] * 1.35;
          if (red) {
            if (x < canvas.width / 2) left += 1;
            else right += 1;
          }
        }
      }
      resolve({ left, right });
    }));
  }));
  assert.ok(redDistribution.left > redDistribution.right * 1.3, `Bus-lane red is not concentrated on visual left: ${JSON.stringify(redDistribution)}`);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  await mkdir(path.resolve('artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(path.resolve('artifacts'), 'bus-lane-left-active.png'), fullPage: true });
  console.log(JSON.stringify({ status: await page.locator('#clock-status').textContent(), redDistribution }, null, 2));
} finally {
  await browser.close();
}
