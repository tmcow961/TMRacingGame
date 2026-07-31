import * as THREE from 'three';
import { GAME } from './config.js';
import trackData from './data/tuen-mun-road.track.json' with { type: 'json' };
import environmentData from './data/tuen-mun-road.environment.json' with { type: 'json' };

const ACCIDENT_LAYOUTS = [
  {
    avoidLateral: 11,
    cars: [
      { lateral: -11, longitudinal: -5, yaw: .15 },
      { lateral: 0, longitudinal: 4, yaw: -.2 },
      { lateral: -10, longitudinal: 14, yaw: .3 },
    ],
  },
  {
    avoidLateral: -11,
    cars: [
      { lateral: 1, longitudinal: -12, yaw: .3 },
      { lateral: 11, longitudinal: -3, yaw: -.18 },
      { lateral: 0, longitudinal: 7, yaw: -.28 },
      { lateral: 10.5, longitudinal: 17, yaw: .22 },
    ],
  },
  {
    avoidLateral: 0,
    cars: [
      { lateral: -11, longitudinal: -12, yaw: .2 },
      { lateral: 11, longitudinal: -2, yaw: -.24 },
      { lateral: -10.5, longitudinal: 9, yaw: -.15 },
      { lateral: 10.5, longitudinal: 19, yaw: .28 },
    ],
  },
  {
    avoidLateral: 11,
    cars: [
      { lateral: -11, longitudinal: -13, yaw: .24 },
      { lateral: 0, longitudinal: -3, yaw: -.16 },
      { lateral: -10.5, longitudinal: 8, yaw: -.2 },
      { lateral: 1, longitudinal: 18, yaw: .08 },
      { lateral: -10, longitudinal: 28, yaw: .18 },
    ],
  },
  {
    avoidLateral: -11,
    cars: [
      { lateral: 11, longitudinal: -7, yaw: -.2 },
      { lateral: 0, longitudinal: 3, yaw: .18 },
      { lateral: 10.5, longitudinal: 14, yaw: .24 },
    ],
  },
];

const REVERSE_ACCIDENT_COUNT = 27;
const ACCIDENT_END_CLEARANCE = 240;
const ACCIDENT_MIN_SPACING = 150;
const INTERCHANGE_ACCIDENT_CLEARANCE = 150;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function vehicleTypeForRoll(roll) {
  return roll < .18 ? 'bus' : roll < .48 ? 'taxi' : 'car';
}

function interpolateByDistance(samples, distance, field) {
  if (!samples.length) return 0;
  const target = THREE.MathUtils.clamp(distance, samples[0].distance, samples.at(-1).distance);
  let low = 1;
  let high = samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].distance < target) low = middle + 1;
    else high = middle;
  }
  const end = samples[low];
  const start = samples[Math.max(0, low - 1)];
  const mix = (target - start.distance) / Math.max(.001, end.distance - start.distance);
  return THREE.MathUtils.lerp(start[field], end[field], mix);
}

function applyElevationProfile(sourcePoints, samples, targetLength) {
  const points = sourcePoints.map((point) => new THREE.Vector3(...point));
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
  }
  const planarLength = distances.at(-1) || 1;
  points.forEach((point, index) => {
    point.y = interpolateByDistance(samples, distances[index] / planarLength * targetLength, 'height');
  });
  return points;
}

export class Track {
  constructor() {
    this.data = trackData;
    this.environmentData = environmentData;
    this.roadElevationSamples = environmentData.roadElevationSamples;
    this.terrainProfiles = environmentData.terrainProfiles;
    this.buildings = environmentData.buildings;
    this.structures = environmentData.structures;
    this.coastlineSegments = environmentData.coastlineSegments;
    this.seaLevel = environmentData.seaLevel;
    const routePoints = applyElevationProfile(trackData.routePoints, this.roadElevationSamples, trackData.targetLength);
    const reversePoints = applyElevationProfile(trackData.reverseRoutePoints, this.roadElevationSamples, trackData.targetLength);
    this.reverseRoutePoints = reversePoints.map((point) => point.toArray());
    this.curve = new THREE.CatmullRomCurve3(
      routePoints,
      false,
      'centripetal',
    );
    this.reverseCurve = new THREE.CatmullRomCurve3(
      reversePoints,
      false,
      'centripetal',
    );
    this.length = this.curve.getLength();
    this.sampleCount = 1600;
    this.samples = Array.from({ length: this.sampleCount + 1 }, (_, i) => this.curve.getPointAt(i / this.sampleCount));
    this.reverseSamples = Array.from({ length: this.sampleCount + 1 }, (_, i) => this.reverseCurve.getPointAt(i / this.sampleCount));
    this.minimapSamples = trackData.minimapPoints.map(([east, north]) => ({ x: east, y: -north }));
    this.minimapCache = new Map();
    this.anchors = trackData.anchors.map((anchor) => ({
      ...anchor,
      progress: this.progressAtDistance(anchor.distance),
    }));
    this.environmentZones = trackData.environmentZones.map((zone) => ({
      ...zone,
      start: this.progressAtDistance(zone.startDistance),
      end: this.progressAtDistance(zone.endDistance),
    }));
    this.coveredSections = trackData.coveredSections.map((section) => ({
      ...section,
      start: this.progressAtDistance(section.startDistance),
      end: this.progressAtDistance(section.endDistance),
    }));
    this.tunnels = this.coveredSections;
    this.cowStops = (trackData.cowStops ?? []).map((stop) => ({
      ...stop,
      progress: this.progressAtDistance(stop.distance),
    }));
    this.checkpoints = trackData.checkpoints.map((checkpoint) => ({ ...checkpoint }));
    this.obstacles = trackData.obstacles.map((obstacle) => {
      const progress = this.progressAtDistance(obstacle.distance);
      if (obstacle.type !== 'accident') return { ...obstacle, progress };
      const layout = ACCIDENT_LAYOUTS[obstacle.layout % ACCIDENT_LAYOUTS.length];
      return {
        ...obstacle,
        progress,
        avoidLateral: layout.avoidLateral,
        cars: layout.cars.map((car) => ({ ...car })),
      };
    });
  }

  progressAtDistance(distance) {
    return THREE.MathUtils.clamp(distance / this.length, 0, 1);
  }

  distanceAtProgress(progress) {
    return THREE.MathUtils.clamp(progress, 0, 1) * this.length;
  }

  roadHeightAtDistance(distance) {
    return interpolateByDistance(this.roadElevationSamples, distance, 'height');
  }

  terrainElevationsAtDistance(distance) {
    const profiles = this.terrainProfiles.profiles;
    const target = THREE.MathUtils.clamp(distance, profiles[0].distance, profiles.at(-1).distance);
    let low = 1;
    let high = profiles.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (profiles[middle].distance < target) low = middle + 1;
      else high = middle;
    }
    const end = profiles[low];
    const start = profiles[Math.max(0, low - 1)];
    const mix = (target - start.distance) / Math.max(.001, end.distance - start.distance);
    return start.elevations.map((value, index) => {
      const endValue = end.elevations[index];
      if (value === null && endValue === null) return null;
      if (value === null) return endValue;
      if (endValue === null) return value;
      return THREE.MathUtils.lerp(value, endValue, mix);
    });
  }

  terrainHeightAt(distance, lateral) {
    const offsets = this.terrainProfiles.offsets;
    const elevations = this.terrainElevationsAtDistance(distance);
    const target = THREE.MathUtils.clamp(lateral, offsets[0], offsets.at(-1));
    let index = 1;
    while (index < offsets.length - 1 && offsets[index] < target) index += 1;
    const startOffset = offsets[index - 1];
    const endOffset = offsets[index];
    const startHeight = elevations[index - 1];
    const endHeight = elevations[index];
    if (startHeight === null && endHeight === null) return this.seaLevel;
    if (startHeight === null) return endHeight;
    if (endHeight === null) return startHeight;
    return THREE.MathUtils.lerp(startHeight, endHeight, (target - startOffset) / Math.max(.001, endOffset - startOffset));
  }

  getAnchor(id) {
    return this.anchors.find((anchor) => anchor.id === id);
  }

  checkpointIndexAtProgress(progress) {
    const distance = this.distanceAtProgress(progress);
    let index = 0;
    while (index + 1 < this.checkpoints.length && this.checkpoints[index + 1].distance <= distance) index += 1;
    return index;
  }

  recoveryProgress(checkpointIndex) {
    const checkpoint = this.checkpoints[Math.max(0, Math.min(this.checkpoints.length - 1, checkpointIndex))];
    return this.progressAtDistance(checkpoint.recoveryDistance);
  }

  fourLaneExpansion(distance) {
    const stop = this.cowStops[0];
    if (!stop || distance <= stop.fourLaneStartDistance || distance >= stop.fourLaneEndDistance) return 0;
    const transition = stop.laneTransitionDistance;
    const entering = THREE.MathUtils.clamp((distance - stop.fourLaneStartDistance) / transition, 0, 1);
    const leaving = THREE.MathUtils.clamp((stop.fourLaneEndDistance - distance) / transition, 0, 1);
    const blend = Math.min(entering, leaving);
    return blend * blend * (3 - 2 * blend);
  }

  roadWidthAtDistance(distance) {
    return GAME.trackWidth + (GAME.trackWidth / 3) * this.fourLaneExpansion(distance);
  }

  roadWidthAtProgress(progress) {
    return this.roadWidthAtDistance(this.distanceAtProgress(progress));
  }

  raceLeftLaneCenter(distance = 0) {
    const laneWidth = GAME.trackWidth / 3;
    return this.roadWidthAtDistance(distance) / 2 - laneWidth / 2;
  }

  isRaceLeftLane(lateral, distance = 0) {
    return lateral > this.roadWidthAtDistance(distance) / 2 - GAME.trackWidth / 3;
  }

  isBusLane(lateral, distance) {
    const laneWidth = GAME.trackWidth / 3;
    const centre = laneWidth - laneWidth * .5 * this.fourLaneExpansion(distance);
    return Math.abs(lateral - centre) <= laneWidth / 2;
  }

  busLaneCenterCanonical(distance, direction) {
    const laneWidth = GAME.trackWidth / 3;
    const centre = laneWidth - laneWidth * .5 * this.fourLaneExpansion(distance);
    return direction === 1 ? centre : -centre;
  }

  canonicalLeftLaneCenter(direction, distance = 0) {
    return direction === 1 ? this.raceLeftLaneCenter(distance) : -this.raceLeftLaneCenter(distance);
  }

  curveForDirection(direction = 1) {
    return direction === -1 ? this.reverseCurve : this.curve;
  }

  canonicalSample(routeProgress, carriagewayDirection = 1) {
    const progress = THREE.MathUtils.clamp(routeProgress, 0, 1);
    const curve = this.curveForDirection(carriagewayDirection);
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return { point, tangent, right, routeProgress: progress, distance: progress * this.length };
  }

  sample(progress, direction = 1) {
    const raceProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const routeProgress = direction === 1 ? raceProgress : 1 - raceProgress;
    const curve = this.curveForDirection(direction);
    const point = curve.getPointAt(routeProgress);
    const tangent = curve.getTangentAt(routeProgress).normalize().multiplyScalar(direction);
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return { point, tangent, right, routeProgress, distance: routeProgress * this.length };
  }

  sampleDistance(distance, direction = 1) {
    return this.sample(this.progressAtDistance(distance), direction);
  }

  nearestProgress(position, hint = 0, direction = 1) {
    const routeHint = direction === 1 ? hint : 1 - hint;
    const center = Math.round(routeHint * this.sampleCount);
    const radius = hint <= 0.01 ? this.sampleCount : 65;
    const samples = direction === -1 ? this.reverseSamples : this.samples;
    let best = center;
    let bestDistance = Infinity;
    for (let i = Math.max(0, center - radius); i <= Math.min(this.sampleCount, center + radius); i += 1) {
      const distance = samples[i].distanceToSquared(position);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    const routeProgress = best / this.sampleCount;
    return direction === 1 ? routeProgress : 1 - routeProgress;
  }

  nearestDistance(position, hint = 0, direction = 1) {
    return this.distanceAtProgress(this.nearestProgress(position, hint / this.length, direction));
  }

  raceObstacleProgress(obstacle, direction) {
    return direction === 1 ? obstacle.progress : 1 - obstacle.progress;
  }

  createRaceObstacles(direction, seed) {
    const random = seededRandom(seed);
    if (direction === 1) {
      return this.obstacles.map((obstacle) => ({
        ...obstacle,
        raceDistance: obstacle.distance,
        cars: obstacle.cars.map((car) => ({ ...car, vehicleType: vehicleTypeForRoll(random()) })),
      }));
    }

    const stopRaceDistance = this.length - (this.cowStops[0]?.distance ?? this.length / 2);
    const intervals = [
      [ACCIDENT_END_CLEARANCE, stopRaceDistance - INTERCHANGE_ACCIDENT_CLEARANCE],
      [stopRaceDistance + INTERCHANGE_ACCIDENT_CLEARANCE, this.length - ACCIDENT_END_CLEARANCE],
    ];
    const totalAvailable = intervals.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
    const firstCount = Math.round(REVERSE_ACCIDENT_COUNT * Math.max(0, intervals[0][1] - intervals[0][0]) / totalAvailable);
    const counts = [firstCount, REVERSE_ACCIDENT_COUNT - firstCount];
    const distances = [];
    intervals.forEach(([start, end], intervalIndex) => {
      const count = counts[intervalIndex];
      const spacing = (end - start) / count;
      const jitter = Math.max(0, (spacing - ACCIDENT_MIN_SPACING) / 2);
      for (let index = 0; index < count; index += 1) {
        distances.push(start + spacing * (index + .5) + (random() * 2 - 1) * jitter);
      }
    });
    return distances.sort((a, b) => a - b).map((raceDistance, index) => {
      const layoutIndex = Math.floor(random() * ACCIDENT_LAYOUTS.length);
      const layout = ACCIDENT_LAYOUTS[layoutIndex];
      return {
        id: `reverse-accident-${String(index + 1).padStart(2, '0')}`,
        type: 'accident',
        raceDistance,
        distance: this.length - raceDistance,
        progress: this.progressAtDistance(this.length - raceDistance),
        layout: layoutIndex,
        avoidLateral: layout.avoidLateral,
        cars: layout.cars.map((car) => ({ ...car, vehicleType: vehicleTypeForRoll(random()) })),
      };
    });
  }

  offsetSegment(index, segments, lateral = 0, overlap = 0) {
    const startSample = this.sample(index / segments, 1);
    const endSample = this.sample((index + 1) / segments, 1);
    const startLateral = typeof lateral === 'function' ? lateral(index / segments) : lateral;
    const endLateral = typeof lateral === 'function' ? lateral((index + 1) / segments) : lateral;
    const start = startSample.point.clone().addScaledVector(startSample.right, startLateral);
    const end = endSample.point.clone().addScaledVector(endSample.right, endLateral);
    const tangent = end.clone().sub(start);
    const length = tangent.length() + overlap;
    tangent.normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const normal = tangent.clone().cross(right).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, tangent),
    );
    return {
      position: start.add(end).multiplyScalar(.5),
      rotation,
      length,
      right,
      tangent,
    };
  }

  carriagewaySegment(direction, index, segments, lateral = 0, overlap = 0) {
    const startProgress = index / segments;
    const endProgress = (index + 1) / segments;
    const startSample = this.canonicalSample(startProgress, direction);
    const endSample = this.canonicalSample(endProgress, direction);
    const startLateral = typeof lateral === 'function' ? lateral(startProgress) : lateral;
    const endLateral = typeof lateral === 'function' ? lateral(endProgress) : lateral;
    const start = startSample.point.clone().addScaledVector(startSample.right, startLateral);
    const end = endSample.point.clone().addScaledVector(endSample.right, endLateral);
    const tangent = end.clone().sub(start);
    const length = tangent.length() + overlap;
    tangent.normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const normal = tangent.clone().cross(right).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, tangent));
    return { position: start.add(end).multiplyScalar(.5), rotation, length, right, tangent };
  }

  makeRoadGeometry(width = GAME.trackWidth, segments = 600, offset = 0, lateral = 0, start = 0, end = 1) {
    return this.makeCarriagewayGeometry(1, width, segments, offset, lateral, start, end);
  }

  makeCarriagewayGeometry(direction, width = GAME.trackWidth, segments = 600, offset = 0, lateral = 0, start = 0, end = 1) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i += 1) {
      const localProgress = i / segments;
      const progress = THREE.MathUtils.lerp(start, end, localProgress);
      const curve = this.curveForDirection(direction);
      const center = curve.getPointAt(progress);
      const tangent = curve.getTangentAt(progress);
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const roadWidth = typeof width === 'function' ? width(progress, localProgress) : width;
      const lateralOffset = typeof lateral === 'function' ? lateral(progress, localProgress) : lateral;
      center.addScaledVector(right, lateralOffset);
      for (const side of [-1, 1]) {
        const vertex = center.clone().addScaledVector(right, side * roadWidth * .5);
        vertex.y += offset;
        positions.push(vertex.x, vertex.y, vertex.z);
        uvs.push(side === -1 ? 0 : 1, localProgress * Math.max(1, (end - start) * 90));
      }
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  minimapPath(width, height, padding = 10) {
    const cacheKey = `${width}x${height}x${padding}`;
    const cached = this.minimapCache.get(cacheKey);
    if (cached) return cached;
    const xs = this.minimapSamples.map((point) => point.x);
    const ys = this.minimapSamples.map((point) => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sourceWidth = Math.max(1, maxX - minX);
    const sourceHeight = Math.max(1, maxY - minY);
    const scale = Math.min((width - padding * 2) / sourceWidth, (height - padding * 2) / sourceHeight);
    const contentWidth = sourceWidth * scale;
    const contentHeight = sourceHeight * scale;
    const offsetX = (width - contentWidth) * .5;
    const offsetY = (height - contentHeight) * .5;
    const path = this.minimapSamples.map((point) => ({
      x: offsetX + (point.x - minX) * scale,
      y: offsetY + (point.y - minY) * scale,
    }));
    this.minimapCache.set(cacheKey, path);
    return path;
  }
}
