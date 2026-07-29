import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDirectory = path.resolve('artifacts');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});

async function canvasPixels(page) {
  return page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas.game-canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      if (!canvas || !gl) { resolve({ available: false, unique: 0, opaque: 0 }); return; }
      const colors = new Set();
      let opaque = 0;
      const pixel = new Uint8Array(4);
      for (let y = 1; y < 8; y += 1) {
        for (let x = 1; x < 12; x += 1) {
          gl.readPixels(Math.floor(canvas.width * x / 12), Math.floor(canvas.height * y / 8), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          colors.add(`${pixel[0] >> 4},${pixel[1] >> 4},${pixel[2] >> 4},${pixel[3] >> 4}`);
          if (pixel[3] > 0) opaque += 1;
        }
      }
      resolve({ available: true, unique: colors.size, opaque });
    }));
  }));
}

async function runViewport(name, viewport, direction, quality = 'high') {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const navigationStarted = Date.now();
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('[data-action="direction"]').waitFor({ state: 'visible', timeout: 30000 });
  const interactiveLoadMs = Date.now() - navigationStarted;
  if (quality === 'low') {
    await page.locator('[data-action="settings"]').first().click();
    await page.locator('[data-quality="low"]').click();
    await page.locator('[data-action="close-settings"]').click();
  }
  const titlePixels = await canvasPixels(page);
  assert.ok(titlePixels.available && titlePixels.opaque > 60 && titlePixels.unique > 3, `${name} title canvas is blank or flat: ${JSON.stringify(titlePixels)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} title overflows horizontally`);
  await page.screenshot({ path: path.join(outputDirectory, `${name}-title.png`), fullPage: true });

  if (name.startsWith('desktop')) {
    await page.locator('[data-action="credits"]').click();
    assert.equal(await page.locator('.source-list li').count(), 4, 'Credits must list route, elevation, interchange location and visual-reference sources');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Credits overflow horizontally');
    await page.screenshot({ path: path.join(outputDirectory, 'desktop-credits.png'), fullPage: true });
    await page.locator('[data-action="title"]').click();
  }

  await page.locator('[data-action="direction"]').click();
  await page.locator(`[data-direction="${direction}"]`).click();
  await page.locator('[data-action="cow"]').click();
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.waitForTimeout(5200);
  const racePixels = await canvasPixels(page);
  assert.ok(racePixels.available && racePixels.opaque > 60 && racePixels.unique > 5, `${name} race canvas is blank or flat: ${JSON.stringify(racePixels)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} race HUD overflows horizontally`);
  assert.ok(await page.locator('#race-time').isVisible(), `${name} race HUD did not render`);
  await page.keyboard.press('F3');
  assert.ok(await page.locator('#diagnostics-panel').isVisible(), `${name} F3 diagnostics did not open`);
  await page.waitForFunction(() => {
    const value = document.querySelector('#diag-race-distance')?.textContent;
    return value && value !== '--';
  });
  for (const id of ['#diag-race-distance', '#diag-track-location', '#diag-local-position']) {
    const value = await page.locator(id).textContent();
    assert.ok(value && value !== '--', `${name} location diagnostic ${id} was not populated`);
  }
  assert.ok(await page.evaluate(() => {
    const panel = document.querySelector('#diagnostics-panel');
    return panel.scrollHeight <= panel.clientHeight + 1;
  }), `${name} diagnostics panel clips location data`);
  const measuredFps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const started = performance.now();
    const tick = (now) => {
      frames += 1;
      if (now - started >= 1200) resolve(frames / ((now - started) / 1000));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  if (quality === 'low') assert.ok(measuredFps >= 30, `${name} missed the 30 FPS Low-quality fallback target: ${measuredFps.toFixed(1)}`);
  await page.screenshot({ path: path.join(outputDirectory, `${name}-race-direction-${direction}.png`), fullPage: true });
  assert.deepEqual(errors, [], `${name} browser errors: ${errors.join(' | ')}`);
  await context.close();
  return { name, direction, quality, interactiveLoadMs, measuredFps: Number(measuredFps.toFixed(1)), titlePixels, racePixels };
}

try {
  const results = [];
  results.push(await runViewport('desktop-1280x720', { width: 1280, height: 720 }, 1));
  results.push(await runViewport('mobile-390x844', { width: 390, height: 844 }, -1));
  results.push(await runViewport('desktop-low-1280x720', { width: 1280, height: 720 }, -1, 'low'));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
