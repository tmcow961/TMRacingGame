import assert from 'node:assert/strict';
import { GAME } from '../src/config.js';
import { GameWorld, isRailContactNearBoundary, nextRacerSpeed, shouldFollowGround } from '../src/world.js';
import { Track } from '../src/track.js';

assert.equal(nextRacerSpeed(0, false, false, GAME.targetSpeed, GAME.acceleration, 1), 0, 'The player must remain stopped without acceleration input');
assert.equal(nextRacerSpeed(0, true, false, GAME.targetSpeed, GAME.acceleration, 1), GAME.acceleration, 'Acceleration input must increase speed');
assert.equal(nextRacerSpeed(20, false, false, GAME.targetSpeed, GAME.acceleration, 1), 2, 'Releasing acceleration must coast toward zero');
assert.equal(nextRacerSpeed(20, true, true, GAME.targetSpeed, GAME.acceleration, 1), 0, 'Brake input must override acceleration');
assert.equal(GAME.aiObstacleResetDelay, 2, 'AI racers must wait two seconds before bypassing an obstacle');
const track = new Track();
const reverseObstaclesA = track.createRaceObstacles(-1, 12345);
const reverseObstaclesB = track.createRaceObstacles(-1, 67890);
assert.equal(reverseObstaclesA.length, 27, 'Reverse races must contain 27 generated accidents');
assert.ok(reverseObstaclesA.some((obstacle, index) => obstacle.raceDistance !== reverseObstaclesB[index].raceDistance), 'Reverse accident positions must change with the race seed');
assert.ok(reverseObstaclesA.every((obstacle) => obstacle.cars.length >= 3 && obstacle.cars.length <= 5), 'Reverse accidents must contain 3-5 vehicles');
assert.ok(reverseObstaclesA.every((obstacle, index) => index === 0 || obstacle.raceDistance - reverseObstaclesA[index - 1].raceDistance >= 150), 'Reverse accidents must remain at least 150 m apart');
const reverseInterchangeDistance = track.length - track.cowStops[0].distance;
assert.ok(reverseObstaclesA.every((obstacle) => Math.abs(obstacle.raceDistance - reverseInterchangeDistance) >= 150), 'Reverse accidents must leave the interchange clear');
assert.equal(isRailContactNearBoundary(2.2), false, 'A centre-road player position cannot produce barrier feedback');
assert.equal(isRailContactNearBoundary(GAME.trackWidth / 2 - .2), true, 'A player beside the road edge can produce barrier feedback');
assert.equal(shouldFollowGround(false, .1, -.4), true, 'A grounded cow must follow a small downhill road step');
assert.equal(shouldFollowGround(false, .3, 0), true, 'A grounded cow must remain attached across sampled elevation changes');
assert.equal(shouldFollowGround(false, .4, 0), false, 'A meaningful drop must still make the cow airborne');
assert.equal(shouldFollowGround(true, .1, -1), false, 'An airborne cow must not be snapped down before landing');

const reverseBusWorld = {
  direction: -1,
  raceElapsed: 0,
  busLaneActive: true,
  busLaneViolationTime: 1.5,
  busLaneGameOverTriggered: false,
  racers: [{ progress: .5, lateral: 11, busLaneViolationTime: 1.5 }],
  track: { length: 6000, isBusLane: () => true },
  busLaneMeshes: { positive: { visible: true } },
  hasBusLane: GameWorld.prototype.hasBusLane,
  setBusLaneVisual: GameWorld.prototype.setBusLaneVisual,
};
GameWorld.prototype.updateBusLaneState.call(reverseBusWorld, 45);
GameWorld.prototype.checkBusLaneViolations.call(reverseBusWorld, GAME.fixedStep);
const reverseBusStatus = GameWorld.prototype.getBusLaneStatus.call(reverseBusWorld);
assert.equal(reverseBusStatus.enabled, false, 'Tsuen Wan to Tuen Mun must not have a bus lane');
assert.equal(reverseBusStatus.active, false, 'The reverse bus lane must remain inactive during restricted hours');
assert.equal(reverseBusWorld.busLaneMeshes.positive.visible, false, 'The forward bus-lane surface must remain hidden in a reverse race');
assert.equal(reverseBusWorld.racers[0].busLaneViolationTime, 0, 'Reverse racers must never accumulate a bus-lane violation');

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
  track: { length: 6000, roadWidthAtDistance: () => GAME.trackWidth },
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

const stop = { id: 'tuen-mun-road-cow-interchange', distance: 2300.57 };
const interchangePlayer = {
  progress: (stop.distance - 100) / 6000,
  lateral: 16.5,
  finished: false,
  speed: 80,
  actualForwardSpeed: 79,
  body: {
    linvel: () => ({ x: 10, y: 0, z: 70 }),
    setLinvel: (velocity) => { interchangePlayer.stoppedVelocity = velocity; },
  },
};
let interchangeApproaches = 0;
let interchangeStops = 0;
const interchangeWorld = {
  track: { length: 6000, cowStops: [stop], isRaceLeftLane: (lateral) => lateral > 11 },
  racers: [interchangePlayer],
  direction: 1,
  raceRunning: true,
  cowInterchangeAnnounced: false,
  cowInterchangeVisited: false,
  onCowInterchangeApproach: () => { interchangeApproaches += 1; },
  onCowInterchange: () => { interchangeStops += 1; },
};
GameWorld.prototype.checkCowInterchange.call(interchangeWorld);
assert.equal(interchangeApproaches, 1, 'The cow interchange must announce itself on approach');
interchangePlayer.progress = stop.distance / 6000;
GameWorld.prototype.checkCowInterchange.call(interchangeWorld);
assert.equal(interchangeStops, 1, 'The player must stop once at the cow interchange');
assert.equal(interchangeWorld.raceRunning, false, 'The race clock must pause while choosing a cow');
assert.deepEqual(interchangePlayer.stoppedVelocity, { x: 0, y: 0, z: 0 });
GameWorld.prototype.checkCowInterchange.call(interchangeWorld);
assert.equal(interchangeStops, 1, 'The same interchange must not reopen during one race');

const wrongLanePlayer = {
  ...interchangePlayer,
  progress: stop.distance / 6000,
  lateral: 5.5,
  body: interchangePlayer.body,
};
const wrongLaneWorld = {
  ...interchangeWorld,
  racers: [wrongLanePlayer],
  raceRunning: true,
  cowInterchangeAnnounced: true,
  cowInterchangeVisited: false,
};
GameWorld.prototype.checkCowInterchange.call(wrongLaneWorld);
assert.equal(interchangeStops, 1, 'Tuen Mun to Tsuen Wan must not open cow changing outside the far-left lane');
wrongLanePlayer.progress = (stop.distance + 40) / 6000;
wrongLanePlayer.lateral = 16.5;
GameWorld.prototype.checkCowInterchange.call(wrongLaneWorld);
assert.equal(interchangeStops, 2, 'Entering the far-left lane beside the platform must still open cow changing');

const reversePlayer = {
  ...wrongLanePlayer,
  progress: (6000 - stop.distance) / 6000,
  lateral: 5.5,
};
const reverseWorld = {
  ...interchangeWorld,
  racers: [reversePlayer],
  direction: -1,
  raceRunning: true,
  cowInterchangeAnnounced: true,
  cowInterchangeVisited: false,
};
GameWorld.prototype.checkCowInterchange.call(reverseWorld);
assert.equal(interchangeStops, 3, 'Tsuen Wan to Tuen Mun may open cow changing from any lane');

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
  cowInterchangeStops: interchangeStops,
  reverseBusLaneEnabled: reverseBusStatus.enabled,
}, null, 2));
