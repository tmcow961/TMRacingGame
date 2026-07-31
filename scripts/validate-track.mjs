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
assert.ok(track.cowStops[0].triggerHalfLength >= 45, 'Cow-changing must remain active along the full interchange platform');
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
assert.ok(track.roadElevationSamples.length >= 75, 'The route must include official road-elevation samples at roughly 80-unit spacing');
assert.ok(track.terrainProfiles.profiles.length >= 75, 'The route must include cross-route terrain profiles');
assert.equal(track.environmentData.roadElevationSourceId, 'csdi-dtm-5m', 'Road elevations must retain their CSDI provenance');
assert.equal(track.terrainProfiles.sourceId, 'csdi-dtm-5m', 'Terrain profiles must retain their CSDI provenance');
assert.equal(track.environmentData.buildingSourceId, 'csdi-building', 'Buildings must retain their CSDI provenance');
assert.ok(track.environmentData.sources.includes('csdi-3d-individualised'), 'Coastline references must be listed in the environment sources');
assert.equal(track.environmentData.lateralOrientation, 'visual-left-positive', 'Geographic environment data must use the game lateral convention');
assert.ok(track.terrainProfiles.offsets[0] <= -500 && track.terrainProfiles.offsets.at(-1) >= 400, 'Terrain profiles must cover the coast and hillside background');
assert.ok(Math.max(...track.roadElevationSamples.map((sample) => sample.height)) - Math.min(...track.roadElevationSamples.map((sample) => sample.height)) >= 25, 'The official road profile must preserve recognizable uphill and downhill sections');
assert.ok(track.buildings.length >= 300, 'The route must include the official CSDI-derived building corridor');
assert.ok(track.structures.some((structure) => structure.type === 'viaduct'), 'The environment must include elevated-road structure zones');
assert.ok(track.structures.some((structure) => structure.type === 'cut-slope'), 'The environment must include a cut-slope zone');

const tingKauDistance = track.getAnchor('ting-kau').distance;
assert.ok(track.terrainHeightAt(tingKauDistance, 90) > track.terrainHeightAt(tingKauDistance, -90) + 20, 'Ting Kau mountains must render on the visible left');
const tingKauBuildings = track.buildings.filter((building) => Math.abs(building.distance - tingKauDistance) <= 600);
assert.ok(tingKauBuildings.filter((building) => building.lateral < 0).length > tingKauBuildings.filter((building) => building.lateral > 0).length, 'Ting Kau residential buildings must retain their geographic side');

let minimumBuildingClearance = Infinity;
for (const building of track.buildings) {
  const sample = track.canonicalSample(track.progressAtDistance(building.distance), 1);
  const position = sample.point.clone().addScaledVector(sample.right, building.lateral);
  const radius = Math.hypot(building.width / 2, building.depth / 2);
  for (const direction of [1, -1]) {
    const nearestProgress = track.nearestProgress(position, direction === 1 ? building.distance / track.length : 1 - building.distance / track.length, direction);
    const road = track.sample(nearestProgress, direction);
    const centreDistance = Math.hypot(position.x - road.point.x, position.z - road.point.z);
    minimumBuildingClearance = Math.min(minimumBuildingClearance, centreDistance - track.roadWidthAtDistance(road.distance) / 2 - radius);
  }
}
assert.ok(minimumBuildingClearance > 0, `A CSDI building overlaps a carriageway by ${(-minimumBuildingClearance).toFixed(2)} units`);

assert.ok(track.reverseRoutePoints.length >= 90, 'Reverse carriageway must contain a detailed route centreline');
assert.ok(Math.abs(track.reverseCurve.getLength() - 6000) <= 300, `Reverse route length ${track.reverseCurve.getLength().toFixed(1)} is outside the 6000 +/- 5% target`);
let minimumCarriagewayGap = Infinity;
let reverseMinimumRadius = Infinity;
let reversePrevious = null;
let reversePreviousHeading = null;
for (let i = 0; i <= track.sampleCount; i += 1) {
  const progress = i / track.sampleCount;
  const forward = track.canonicalSample(progress, 1);
  const reverse = track.canonicalSample(progress, -1);
  minimumCarriagewayGap = Math.min(minimumCarriagewayGap, forward.point.distanceTo(reverse.point) - track.roadWidthAtProgress(progress));
  if (reversePrevious) {
    const step = reverse.point.clone().sub(reversePrevious);
    const heading = Math.atan2(step.x, step.z);
    const turn = reversePreviousHeading === null ? 0 : Math.abs(Math.atan2(Math.sin(heading - reversePreviousHeading), Math.cos(heading - reversePreviousHeading)));
    if (turn > .0001) reverseMinimumRadius = Math.min(reverseMinimumRadius, Math.hypot(step.x, step.z) / turn);
  }
  reversePrevious = reverse.point;
  reversePreviousHeading = Math.atan2(reverse.tangent.x, reverse.tangent.z);
}
assert.ok(minimumCarriagewayGap >= 7, `Carriageways are too close: paved gap ${minimumCarriagewayGap.toFixed(1)} units`);
assert.ok(reverseMinimumRadius >= 24, `Reverse minimum curve radius ${reverseMinimumRadius.toFixed(1)} is too tight`);

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

let maximumReverseRailIntrusion = -Infinity;
for (let i = 0; i < GAME.railSegments; i += 1) {
  for (const side of [-1, 1]) {
    const segment = track.carriagewaySegment(-1, i, GAME.railSegments, (progress) => side * (track.roadWidthAtProgress(progress) / 2 + GAME.railShoulderOffset + .4), GAME.railSegmentOverlap);
    for (const x of [-GAME.railColliderHalfWidth, GAME.railColliderHalfWidth]) {
      for (const z of [-segment.length / 2, segment.length / 2]) {
        const corner = segment.position.clone().addScaledVector(segment.right, x).addScaledVector(segment.tangent, z);
        const road = track.canonicalSample((i + .5) / GAME.railSegments, -1);
        const lateral = corner.clone().sub(road.point).dot(road.right);
        const roadHalfWidth = track.roadWidthAtDistance(road.distance) / 2;
        const intrusion = side === 1 ? roadHalfWidth - lateral : lateral + roadHalfWidth;
        maximumReverseRailIntrusion = Math.max(maximumReverseRailIntrusion, intrusion);
      }
    }
  }
}
assert.ok(maximumReverseRailIntrusion <= 0, `Reverse rail collider intrudes ${maximumReverseRailIntrusion.toFixed(2)} units into the playable road`);

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
  const reverse = track.sample(1 - progress, -1);
  const canonical = track.canonicalSample(progress, -1);
  assert.ok(reverse.point.distanceTo(canonical.point) < .001, 'Reverse route must use its dedicated physical alignment');
  assert.ok(reverse.tangent.dot(canonical.tangent) < -.999, 'Reverse tangent must face the opposite direction');
  assert.ok(reverse.right.dot(canonical.right) < -.999, 'Reverse left/right orientation must be derived from the reverse route');
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
  minimumCarriagewayGap: Number(minimumCarriagewayGap.toFixed(2)),
  reverseMinimumRadius: Number(reverseMinimumRadius.toFixed(1)),
  maximumReverseRailIntrusion: Number(maximumReverseRailIntrusion.toFixed(2)),
  roadElevationSamples: track.roadElevationSamples.length,
  roadElevationRange: Number((Math.max(...track.roadElevationSamples.map((sample) => sample.height)) - Math.min(...track.roadElevationSamples.map((sample) => sample.height))).toFixed(1)),
  terrainProfiles: track.terrainProfiles.profiles.length,
  buildings: track.buildings.length,
  minimumBuildingClearance: Number(minimumBuildingClearance.toFixed(2)),
}, null, 2));
