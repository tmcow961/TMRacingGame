import assert from 'node:assert/strict';
import { GAME } from '../src/config.js';
import { GameWorld, nextRacerSpeed } from '../src/world.js';

assert.equal(nextRacerSpeed(0, false, false, GAME.targetSpeed, GAME.acceleration, 1), 0, 'The player must remain stopped without acceleration input');
assert.equal(nextRacerSpeed(0, true, false, GAME.targetSpeed, GAME.acceleration, 1), GAME.acceleration, 'Acceleration input must increase speed');
assert.equal(nextRacerSpeed(20, false, false, GAME.targetSpeed, GAME.acceleration, 1), 2, 'Releasing acceleration must coast toward zero');
assert.equal(nextRacerSpeed(20, true, true, GAME.targetSpeed, GAME.acceleration, 1), 0, 'Brake input must override acceleration');
assert.equal(GAME.aiObstacleResetDelay, 2, 'AI racers must wait two seconds before bypassing an obstacle');

const diagnosticWorld = {
  racers: [{
    progress: .1,
    speed: 42,
    actualForwardSpeed: 40,
    windowForwardMovement: 12,
    stuck: 0,
    lateral: -3,
    body: {
      linvel: () => ({ x: 12, y: 0, z: 16 }),
      translation: () => ({ x: 123, y: 9, z: -456 }),
    },
  }],
  track: { length: 6000 },
  direction: -1,
  activePlayerContacts: new Map(),
  playerLives: GAME.playerLives,
  lastCollision: null,
  lastRecovery: null,
};
const diagnostics = GameWorld.prototype.getDiagnostics.call(diagnosticWorld);
assert.equal(diagnostics.raceDistance, 600, 'Race distance must increase from the selected starting point');
assert.equal(diagnostics.trackDistance, 5400, 'Track location must remain measured from the Tuen Mun end');
assert.deepEqual(diagnostics.localPosition, { x: 123, y: 9, z: -456 });

const lifeLosses = [];
const gameOvers = [];
let recoveries = 0;
const player = { protection: 0, airborne: false };
const fakeWorld = {
  racers: [player],
  playerLives: GAME.playerLives,
  obstacleGameOverTriggered: false,
  activePlayerContacts: new Map(),
  onPlayerLifeLost: (details) => lifeLosses.push(details.remaining),
  onObstacleGameOver: (details) => gameOvers.push(details),
  recover: () => { recoveries += 1; player.protection = 1.5; },
};
const hit = { type: 'accident', otherId: 'test-car', vehicleType: 'car' };
for (let remainingHit = 0; remainingHit < GAME.playerLives; remainingHit += 1) {
  player.protection = 0;
  GameWorld.prototype.takePlayerLife.call(fakeWorld, hit);
}
assert.deepEqual(lifeLosses, [2, 1], 'The first two obstacle hits must consume one life and continue');
assert.equal(recoveries, 2, 'The first two obstacle hits must recover the player');
assert.equal(fakeWorld.playerLives, 0);
assert.equal(gameOvers.length, 1, 'Only the third obstacle hit may end the game');

const gravity = Math.abs(GAME.gravity);
const jumpApex = GAME.jumpVelocity ** 2 / (2 * gravity);
const airborneTime = 2 * GAME.jumpVelocity / gravity;
const halfSpeedDistance = GAME.targetSpeed * GAME.turnSpeedMultiplier * airborneTime;
const maximumFiveVehicleSpan = 41 + 14.86;
assert.ok(jumpApex >= 10, `Jump apex ${jumpApex.toFixed(1)} is too low for a double-decker bus`);
assert.ok(halfSpeedDistance > maximumFiveVehicleSpan + 30, 'Jump duration must clear the longest five-vehicle accident at corner speed');

console.log(JSON.stringify({
  playerLives: GAME.playerLives,
  lifeLosses,
  jumpApex: Number(jumpApex.toFixed(1)),
  airborneTime: Number(airborneTime.toFixed(1)),
  halfSpeedDistance: Number(halfSpeedDistance.toFixed(1)),
}, null, 2));
