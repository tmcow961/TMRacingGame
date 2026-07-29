import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { GAME } from '../src/config.js';

const track = new Track();
assert.ok(Math.abs(track.length - 6000) <= 300, `Track length ${track.length.toFixed(1)} is outside the 6000 +/- 5% target`);
assert.equal(track.anchors[0].id, 'tuen-mun');
assert.equal(track.anchors.at(-1).id, 'tsuen-wan');
assert.ok(track.anchors.every((anchor, index) => index === 0 || anchor.distance > track.anchors[index - 1].distance), 'Landmark anchors must be ordered');
assert.equal(track.cowStops.length, 1, 'The route must contain the Tuen Mun Road Cow Interchange');
assert.equal(track.cowStops[0].id, 'tuen-mun-road-cow-interchange');
assert.ok(Math.abs(track.cowStops[0].distance - 2300.57) < 1, 'Cow interchange must match the OpenStreetMap-derived TM+2301 m location');
assert.equal(track.roadWidthAtDistance(0), GAME.trackWidth, 'The normal route must remain three lanes wide');
assert.equal(track.roadWidthAtDistance(track.cowStops[0].distance), GAME.trackWidth * 4 / 3, 'The cow interchange must have four full-width lanes');
assert.ok(track.isRaceLeftLane(16.5, track.cowStops[0].distance), 'The far-left interchange lane must be detected');
assert.ok(!track.isRaceLeftLane(5.5, track.cowStops[0].distance), 'The second-left interchange lane must not trigger cow changing');
assert.ok(track.isBusLane(5.5, track.cowStops[0].distance), 'The second-left interchange lane must be the bus lane');
assert.ok(!track.isBusLane(16.5, track.cowStops[0].distance), 'The far-left interchange lane must remain available when the bus lane is active');
assert.equal(track.checkpoints.length, GAME.checkpointCount + 1);
assert.ok(track.isRaceLeftLane(track.raceLeftLaneCenter()), 'Positive race-relative lateral must be the visual left lane');
assert.ok(!track.isRaceLeftLane(-track.raceLeftLaneCenter()), 'Negative race-relative lateral must not be the visual left lane');
assert.equal(track.canonicalLeftLaneCenter(1), GAME.trackWidth / 3, 'Direction 1 must use the positive canonical lane mesh');
assert.equal(track.canonicalLeftLaneCenter(-1), -GAME.trackWidth / 3, 'Direction -1 must use the negative canonical lane mesh');
assert.ok(track.environmentZones.every((zone) => zone.seaSide === -1), 'The sea must stay on the right from Tuen Mun to Tsuen Wan');
assert.ok(track.obstacles.every((obstacle) => obstacle.distance > 0 && obstacle.distance < track.length), 'Obstacles must lie within the route');
assert.ok(track.obstacles.every((obstacle) => obstacle.type === 'accident'), 'Only vehicle accident scenes may be gameplay obstacles');
assert.ok(track.obstacles.every((obstacle) => obstacle.cars.length >= 3 && obstacle.cars.length <= 5), 'Every accident must contain 3-5 vehicles');

let maximumRailIntrusion = -Infinity;
for (let i = 0; i < GAME.railSegments; i += 1) {
  for (const side of [-1, 1]) {
    const segment = track.offsetSegment(i, GAME.railSegments, (progress) => side * (track.roadWidthAtProgress(progress) / 2 + GAME.railShoulderOffset), GAME.railSegmentOverlap);
    for (const x of [-GAME.railColliderHalfWidth, GAME.railColliderHalfWidth]) {
      for (const z of [-segment.length / 2, segment.length / 2]) {
        const corner = segment.position.clone().addScaledVector(segment.right, x).addScaledVector(segment.tangent, z);
        const hint = (i + .5) / GAME.railSegments;
        const road = track.sample(track.nearestProgress(corner, hint, 1), 1);
        const lateral = corner.clone().sub(road.point).dot(road.right);
        const roadHalfWidth = track.roadWidthAtDistance(road.distance) / 2;
        const intrusion = side === 1 ? roadHalfWidth - lateral : lateral + roadHalfWidth;
        maximumRailIntrusion = Math.max(maximumRailIntrusion, intrusion);
      }
    }
  }
}
assert.ok(maximumRailIntrusion <= 0, `Rail collider intrudes ${maximumRailIntrusion.toFixed(2)} units into the playable road`);

let minimumRadius = Infinity;
let maximumGrade = 0;
let previousHeading = null;
for (let i = 0; i < track.sampleCount; i += 1) {
  const current = track.sample(i / track.sampleCount, 1);
  const next = track.sample((i + 1) / track.sampleCount, 1);
  const planarDistance = Math.hypot(next.point.x - current.point.x, next.point.z - current.point.z);
  maximumGrade = Math.max(maximumGrade, Math.abs(next.point.y - current.point.y) / Math.max(planarDistance, .001));
  const heading = Math.atan2(current.tangent.x, current.tangent.z);
  if (previousHeading !== null) {
    const turn = Math.abs(Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading)));
    if (turn > .0001) minimumRadius = Math.min(minimumRadius, planarDistance / turn);
  }
  previousHeading = heading;
}
assert.ok(minimumRadius >= 24, `Minimum curve radius ${minimumRadius.toFixed(1)} is too tight for the widened road`);
assert.ok(maximumGrade <= .08, `Maximum grade ${(maximumGrade * 100).toFixed(1)}% is too abrupt`);

let minimumNonlocalDistance = Infinity;
for (let i = 0; i < track.samples.length; i += 4) {
  for (let j = i + 24; j < track.samples.length; j += 4) {
    minimumNonlocalDistance = Math.min(
      minimumNonlocalDistance,
      Math.hypot(track.samples[i].x - track.samples[j].x, track.samples[i].z - track.samples[j].z),
    );
  }
}
assert.ok(minimumNonlocalDistance > GAME.trackWidth * 4 / 3 + 30, `Route self-approach ${minimumNonlocalDistance.toFixed(1)} may overlap the widened road environment`);

for (const progress of [.05, .25, .5, .75, .95]) {
  const forward = track.sample(progress, 1);
  const reverse = track.sample(1 - progress, -1);
  assert.ok(forward.point.distanceTo(reverse.point) < .001, 'Reverse route must share the same physical alignment');
  assert.ok(forward.tangent.dot(reverse.tangent) < -.999, 'Reverse tangent must face the opposite direction');
  assert.ok(forward.right.dot(reverse.right) < -.999, 'Reverse left/right orientation must be derived from the shared route');
}

console.log(JSON.stringify({
  routeLength: Number(track.length.toFixed(1)),
  routePoints: track.data.routePoints.length,
  anchors: track.anchors.length,
  obstacles: track.obstacles.length,
  minimumCurveRadius: Number(minimumRadius.toFixed(1)),
  maximumGradePercent: Number((maximumGrade * 100).toFixed(1)),
  minimumNonlocalDistance: Number(minimumNonlocalDistance.toFixed(1)),
  maximumRailIntrusion: Number(maximumRailIntrusion.toFixed(2)),
}, null, 2));
