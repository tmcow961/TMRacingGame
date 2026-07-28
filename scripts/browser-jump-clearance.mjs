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

  await page.waitForTimeout(9000);
  assert.equal(await page.locator('#progress').textContent(), '0%', 'Player moved without holding W or Up Arrow');
  assert.equal(await page.locator('#lives').textContent(), '3 / 3');

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => Number.parseInt(document.querySelector('#progress')?.textContent ?? '0', 10) >= 2, null, { timeout: 15000 });
  await page.keyboard.down('Space');
  await page.getByText('Airborne', { exact: true }).waitFor({ state: 'visible', timeout: 1500 });
  await mkdir(path.resolve('artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(path.resolve('artifacts'), 'jump-clears-accident.png'), fullPage: true });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => Number.parseInt(document.querySelector('#progress')?.textContent ?? '0', 10) >= 5 || document.body.textContent.includes('Game over'), null, { timeout: 15000 });
  assert.equal(await page.getByText('Game over', { exact: true }).count(), 0, 'Jumping through the accident caused game over');
  assert.equal(await page.locator('#lives').textContent(), '3 / 3', 'Jumping through the accident consumed a life');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    progress: await page.locator('#progress').textContent(),
    lives: await page.locator('#lives').textContent(),
  }, null, 2));
} finally {
  await browser.close();
}
