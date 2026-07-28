import * as THREE from 'three';
import { GAME } from './config.js';
import trackData from './data/tuen-mun-road.track.json' with { type: 'json' };

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

export class Track {
  constructor() {
    this.data = trackData;
    this.curve = new THREE.CatmullRomCurve3(
      trackData.routePoints.map((point) => new THREE.Vector3(...point)),
      false,
      'centripetal',
    );
    this.length = this.curve.getLength();
    this.sampleCount = 1600;
    this.samples = Array.from({ length: this.sampleCount + 1 }, (_, i) => this.curve.getPointAt(i / this.sampleCount));
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

  raceLeftLaneCenter() {
    return GAME.trackWidth / 3;
  }

  isRaceLeftLane(lateral) {
    return lateral > GAME.trackWidth / 6;
  }

  canonicalLeftLaneCenter(direction) {
    return direction === 1 ? this.raceLeftLaneCenter() : -this.raceLeftLaneCenter();
  }

  sample(progress, direction = 1) {
    const raceProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const routeProgress = direction === 1 ? raceProgress : 1 - raceProgress;
    const point = this.curve.getPointAt(routeProgress);
    const tangent = this.curve.getTangentAt(routeProgress).normalize().multiplyScalar(direction);
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
    let best = center;
    let bestDistance = Infinity;
    for (let i = Math.max(0, center - radius); i <= Math.min(this.sampleCount, center + radius); i += 1) {
      const distance = this.samples[i].distanceToSquared(position);
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

  offsetSegment(index, segments, lateral = 0, overlap = 0) {
    const startSample = this.sample(index / segments, 1);
    const endSample = this.sample((index + 1) / segments, 1);
    const start = startSample.point.clone().addScaledVector(startSample.right, lateral);
    const end = endSample.point.clone().addScaledVector(endSample.right, lateral);
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

  makeRoadGeometry(width = GAME.trackWidth, segments = 600, offset = 0, lateral = 0, start = 0, end = 1) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i += 1) {
      const localProgress = i / segments;
      const progress = THREE.MathUtils.lerp(start, end, localProgress);
      const center = this.curve.getPointAt(progress);
      const tangent = this.curve.getTangentAt(progress);
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const lateralOffset = typeof lateral === 'function' ? lateral(progress, localProgress) : lateral;
      center.addScaledVector(right, lateralOffset);
      for (const side of [-1, 1]) {
        const vertex = center.clone().addScaledVector(right, side * width * .5);
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
