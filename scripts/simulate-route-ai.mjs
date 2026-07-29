import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GAME } from '../src/config.js';
import { Track } from '../src/track.js';

const track = new Track();
const dt = GAME.fixedStep;
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function runRace(direction, run) {
  const lane = [-11, 0, 11][run % 3];
  let progress = 0;
  let sample = track.sample(progress, direction);
  const position = sample.point.clone().addScaledVector(sample.right, lane);
  let heading = Math.atan2(sample.tangent.x, sample.tangent.z);
  let steer = 0;
  let speed = 0;
  let turnSpeedFactor = 1;
  let maximumLateral = Math.abs(lane);
  let previousProgress = 0;
  let noProgressTime = 0;
  let avoidLateral = lane;
  let elapsed = 0;

  while (elapsed < 150 && progress < .997) {
    progress = track.nearestProgress(position, progress, direction);
    sample = track.sample(progress, direction);
    const lateral = position.clone().sub(sample.point).dot(sample.right);
    maximumLateral = Math.max(maximumLateral, Math.abs(lateral));
    let desired = lane + Math.sin(elapsed * .7 + run * .61) * .65;
    const raceDistance = progress * track.length;
    const canonicalDistance = direction === 1 ? raceDistance : track.length - raceDistance;
    const roadHalfWidth = track.roadWidthAtDistance(canonicalDistance) / 2;
    let nearestObstacle = Infinity;
    for (const obstacle of track.obstacles) {
      const obstacleDistance = direction === 1 ? obstacle.distance : track.length - obstacle.distance;
      const delta = obstacleDistance - raceDistance;
      if (delta > 0 && delta < 390 && delta < nearestObstacle) {
        nearestObstacle = delta;
        const safeLane = direction === 1 ? obstacle.avoidLateral : -obstacle.avoidLateral;
        desired = THREE.MathUtils.clamp(safeLane + ((run % 3) - 1) * 1.1, -roadHalfWidth + 2.5, roadHalfWidth - 2.5);
      }
    }
    const edgeCorrection = roadHalfWidth - 7;
    if (lateral < -edgeCorrection) desired = Math.max(desired, 7);
    else if (lateral > edgeCorrection) desired = Math.min(desired, -7);
    const lateralResponse = Math.abs(lateral) > edgeCorrection ? 11 : 1.3;
    avoidLateral = THREE.MathUtils.lerp(avoidLateral, desired, Math.min(1, dt * lateralResponse));
    const aim = track.sampleDistance(Math.min(track.length - 18, raceDistance + 72), direction);
    const aimPoint = aim.point.clone().addScaledVector(aim.right, avoidLateral);
    const desiredHeading = Math.atan2(aimPoint.x - position.x, aimPoint.z - position.z);
    steer = THREE.MathUtils.lerp(steer, THREE.MathUtils.clamp(normalizeAngle(desiredHeading - heading) / .35, -1, 1), Math.min(1, dt * 7));
    const isTurning = Math.abs(steer) >= GAME.turnSteerThreshold;
    const wasRecovering = !isTurning && turnSpeedFactor < 1;
    if (isTurning) turnSpeedFactor = GAME.turnSpeedMultiplier;
    else turnSpeedFactor = Math.min(1, turnSpeedFactor + ((1 - GAME.turnSpeedMultiplier) / GAME.turnRecoveryTime) * dt);
    const target = GAME.aiBaseSpeed * turnSpeedFactor;
    const recoveryAcceleration = GAME.aiBaseSpeed * (1 - GAME.turnSpeedMultiplier) / GAME.turnRecoveryTime;
    speed = THREE.MathUtils.clamp(speed + (wasRecovering ? Math.max(GAME.acceleration, recoveryAcceleration) : GAME.acceleration) * dt, 8, target);
    heading = normalizeAngle(heading + steer * GAME.steerRate * dt);
    position.x += Math.sin(heading) * speed * dt;
    position.z += Math.cos(heading) * speed * dt;
    position.y = sample.point.y;
    elapsed += dt;
    if (progress <= previousProgress + .00001) noProgressTime += dt;
    else noProgressTime = 0;
    previousProgress = progress;
    assert.ok(Math.abs(lateral) <= roadHalfWidth, `AI reached the road rail in direction ${direction}, run ${run}, at ${(progress * 100).toFixed(1)}%: lateral ${lateral.toFixed(1)}, desired ${desired.toFixed(1)}, aim ${avoidLateral.toFixed(1)}, steer ${steer.toFixed(2)}, speed ${speed.toFixed(1)}`);
    assert.ok(noProgressTime < 3, `AI stopped progressing in direction ${direction} at ${(progress * 100).toFixed(1)}%`);
  }
  assert.ok(progress >= .997, `AI did not finish direction ${direction} within 150 seconds`);
  return { elapsed, maximumLateral };
}

const results = [];
for (const direction of [1, -1]) {
  for (let run = 0; run < 10; run += 1) results.push({ direction, ...runRace(direction, run) });
}
console.log(JSON.stringify({
  races: results.length,
  direction1AverageSeconds: Number((results.filter((result) => result.direction === 1).reduce((sum, result) => sum + result.elapsed, 0) / 10).toFixed(1)),
  directionMinus1AverageSeconds: Number((results.filter((result) => result.direction === -1).reduce((sum, result) => sum + result.elapsed, 0) / 10).toFixed(1)),
  maximumLateral: Number(Math.max(...results.map((result) => result.maximumLateral)).toFixed(1)),
}, null, 2));
