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
  await page.goto('http://127.0.0.1:4173/?debug=1', { waitUntil: 'networkidle' });
  await page.locator('[data-action="direction"]').first().click();
  await page.locator('[data-direction="1"]').click();
  await page.locator('[data-action="cow"]').click();
  await page.locator('[data-action="prepare"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.waitForTimeout(5200);
  await page.evaluate(() => {
    const world = window.__TMR_DEBUG__.world;
    const player = world.racers[0];
    const obstacle = world.activeObstacles[0];
    const car = obstacle.cars[0];
    const sample = world.track.sampleDistance(obstacle.raceDistance, world.direction);
    const position = sample.point.clone().addScaledVector(sample.right, car.lateral).addScaledVector(sample.tangent, car.longitudinal);
    player.body.setTranslation({ x: position.x, y: sample.point.y + 2.5, z: position.z }, true);
    player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    player.progress = obstacle.raceDistance / world.track.length;
    player.lastPosition.copy(position);
    player.protection = 0;
  });
  await page.locator('#lives').filter({ hasText: '2 / 3' }).waitFor({ state: 'visible', timeout: 25000 });
  assert.equal(await page.getByText('Game over', { exact: true }).count(), 0, 'The first obstacle hit must not end the game');
  assert.ok(await page.getByText(/Life lost/).isVisible(), 'Life-loss notification must be visible');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  await mkdir(path.resolve('artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(path.resolve('artifacts'), 'first-life-lost.png'), fullPage: true });
  console.log(JSON.stringify({
    lives: await page.locator('#lives').textContent(),
    notification: await page.getByText(/Life lost/).textContent(),
  }, null, 2));
} finally {
  await browser.close();
}
