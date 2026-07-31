import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { COWS, GAME } from './config.js';
import { Track } from './track.js';
import { animateCow, createCar, createCow, createDoubleDeckerBus, createTaxi, makeTextSprite } from './visuals.js';

const up = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const COLLISION_GROUP_RACER = 0x0001;
const COLLISION_GROUP_RAIL = 0x0002;
const COLLISION_GROUP_OBSTACLE = 0x0004;
const COLLISION_FILTER_NORMAL = COLLISION_GROUP_RACER | COLLISION_GROUP_RAIL | COLLISION_GROUP_OBSTACLE;
const COLLISION_FILTER_JUMP = COLLISION_GROUP_RACER | COLLISION_GROUP_RAIL;
const interactionGroups = (membership, filter) => (membership << 16) | filter;
const CONTACT_FORCE_THRESHOLD = 40;
const COLLISION_COOLDOWN = .5;
const RAIL_FEEDBACK_COOLDOWN = 1.2;
const RAIL_FEEDBACK_MARGIN = .75;
const GROUND_FOLLOW_DISTANCE = .35;
const GROUND_PENETRATION_LIMIT = 1;
const MOVEMENT_WINDOW = .75;
const MIN_WINDOW_MOVEMENT = 1.5;
const COW_SCALE = 1.6;
const COW_COLLIDER_HALF_WIDTH = .95 * COW_SCALE;
const COW_GROUND_OFFSET = 1.55 * COW_SCALE;
const CAR_SCALE = { x: 1.7, y: 1.4, z: 1.7 };
const BUS_SCALE = { x: 2, y: 1.35, z: 1.65 };
const AI_OBSTACLE_LOOKAHEAD = 390;
const AI_BYPASS_DISTANCE = 72;
const AI_STEER_LOOKAHEAD = 72;
const AI_REVERSE_STEER_LOOKAHEAD = 50;
const REVERSE_RAIL_EXTRA_OFFSET = .4;
const COW_INTERCHANGE_APPROACH_DISTANCE = 140;
const DEFAULT_COW_INTERCHANGE_TRIGGER_HALF_LENGTH = 48;
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const randomSeed = () => {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
};

export function nextRacerSpeed(speed, accelerating, braking, target, acceleration, dt) {
  if (braking) return Math.max(0, speed - GAME.brake * dt);
  if (!accelerating) return Math.max(0, speed - GAME.coastDeceleration * dt);
  return Math.min(target, speed + acceleration * dt);
}

export function isRailContactNearBoundary(lateral, trackWidth = GAME.trackWidth) {
  return Math.abs(lateral) >= trackWidth / 2 - COW_COLLIDER_HALF_WIDTH - RAIL_FEEDBACK_MARGIN;
}

export function shouldFollowGround(airborne, groundGap, verticalSpeed) {
  return !airborne && groundGap <= GROUND_FOLLOW_DISTANCE && groundGap >= -GROUND_PENETRATION_LIMIT && verticalSpeed <= 1;
}

function setRacerCollisionFilter(racer, filter) {
  racer.collider.setCollisionGroups(interactionGroups(COLLISION_GROUP_RACER, filter));
}

function makeRouteStrip(track, rows, segments = 320) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const progress = i / segments;
    const sample = track.sample(progress, 1);
    rows.forEach((row, rowIndex) => {
      const position = sample.point.clone().addScaledVector(sample.right, row.offset);
      position.y = row.absoluteY ?? sample.point.y + (typeof row.height === 'function' ? row.height(progress) : row.height);
      positions.push(position.x, position.y, position.z);
      uvs.push(rowIndex / Math.max(1, rows.length - 1), progress * 70);
    });
    if (i < segments) {
      const rowCount = rows.length;
      for (let row = 0; row < rowCount - 1; row += 1) {
        const a = i * rowCount + row;
        const b = a + rowCount;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function setRouteTransform(object, sample, position, scale = new THREE.Vector3(1, 1, 1)) {
  const normal = sample.tangent.clone().cross(sample.right).normalize();
  const rotation = new THREE.Matrix4().makeBasis(sample.right, normal, sample.tangent);
  object.compose(position, new THREE.Quaternion().setFromRotationMatrix(rotation), scale);
}

function createBeam(start, end, radius, material) {
  const midpoint = start.clone().add(end).multiplyScalar(.5);
  const length = start.distanceTo(end);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  beam.position.copy(midpoint);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  beam.castShadow = true;
  return beam;
}

export class GameWorld {
  constructor(container, settings, audio) {
    this.container = container;
    this.settings = settings;
    this.audio = audio;
    this.track = new Track();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x80c9dc);
    this.scene.fog = new THREE.Fog(0x9ad4de, 400, 1500);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1800);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.container.prepend(this.renderer.domElement);
    this.clockTime = 0;
    this.racers = [];
    this.direction = 1;
    this.mode = 'menu';
    this.onPlayerFinish = null;
    this.onCollision = null;
    this.onRecovery = null;
    this.onBusLaneGameOver = null;
    this.onObstacleGameOver = null;
    this.onPlayerLifeLost = null;
    this.onCowInterchangeApproach = null;
    this.onCowInterchange = null;
    this.busLaneActive = false;
    this.busLaneViolationTime = 0;
    this.busLaneGameOverTriggered = false;
    this.obstacleGameOverTriggered = false;
    this.playerLives = GAME.playerLives;
    this.raceElapsed = 0;
    this.colliderMetadata = new Map();
    this.activePlayerContacts = new Map();
    this.collisionCooldowns = new Map();
    this.collisionTypeCooldowns = new Map();
    this.lastCollision = null;
    this.lastRecovery = null;
    this.cowInterchangeAnnounced = false;
    this.cowInterchangeVisited = false;
    this.activeObstacles = [];
    this.obstacleObjects = [];
    this.obstacleColliders = [];
    this.obstacleSeed = null;
    this.forwardObstacleSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.railColliders = [];
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
  }

  async init(onProgress = () => {}) {
    onProgress(.15);
    await RAPIER.init();
    this.physics = new RAPIER.World({ x: 0, y: GAME.gravity, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    onProgress(.35);
    this.buildLighting();
    this.buildEnvironment();
    this.buildRoadAndColliders();
    this.buildLandmarks();
    this.setPreviewCow(COWS[0]);
    this.applyQuality();
    this.resize();
    onProgress(1);
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xdff9ff, 0x446643, 2.25));
    const sun = new THREE.DirectionalLight(0xfff4d2, 3.2);
    sun.position.set(-220, 340, -180); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -100; sun.shadow.camera.right = 100; sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100; sun.shadow.camera.far = 800;
    this.sun = sun; this.scene.add(sun);
  }

  buildEnvironment() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3600, 7200),
      new THREE.MeshStandardMaterial({ color: 0x557c50, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(400, -10, 2850);
    ground.receiveShadow = true;
    ground.name = 'distant-ground';
    this.scene.add(ground);

    const hillside = new THREE.Mesh(
      makeRouteStrip(this.track, [
        { offset: 20, height: -.6 },
        { offset: 55, height: (p) => 8 + Math.sin(p * 52) * 3 },
        { offset: 115, height: (p) => 30 + Math.sin(p * 31) * 9 },
        { offset: 210, height: (p) => 62 + Math.sin(p * 23) * 15 },
      ]),
      new THREE.MeshStandardMaterial({ color: 0x3f7547, roughness: 1, flatShading: true }),
    );
    hillside.receiveShadow = true;
    hillside.name = 'tuen-mun-road-hillside';
    this.scene.add(hillside);

    const coast = new THREE.Mesh(
      makeRouteStrip(this.track, [
        { offset: -19, height: -.45 },
        { offset: -42, height: -2.5 },
        { offset: -78, height: -6 },
        { offset: -105, absoluteY: -1.7 },
      ]),
      new THREE.MeshStandardMaterial({ color: 0x65785b, roughness: 1, flatShading: true }),
    );
    coast.receiveShadow = true;
    coast.name = 'coastal-slope';
    this.scene.add(coast);

    const sea = new THREE.Mesh(
      makeRouteStrip(this.track, [
        { offset: -100, absoluteY: -1.8 },
        { offset: -270, absoluteY: -1.9 },
        { offset: -520, absoluteY: -2 },
      ]),
      new THREE.MeshStandardMaterial({ color: 0x278ba5, roughness: .3, metalness: .08 }),
    );
    sea.name = 'coastal-water';
    this.scene.add(sea);

    const matrix = new THREE.Matrix4();
    const cloudGeo = new THREE.SphereGeometry(1, 10, 7);
    const clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .78 }), 30);
    for (let i = 0; i < 30; i += 1) {
      const sample = this.track.sample((i + .37) / 30, 1);
      const position = sample.point.clone().addScaledVector(sample.right, -320 + (i % 5) * 150);
      position.y = 170 + (i % 7) * 13;
      matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(22 + (i % 4) * 9, 7 + (i % 3) * 3, 14 + (i % 5) * 4));
      clouds.setMatrixAt(i, matrix);
    }
    clouds.name = 'clouds';
    this.scene.add(clouds);
  }

  buildRoadAndColliders() {
    const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c5b2, roughness: 1 });
    const asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0x333b3d, roughness: .92 });
    const companionMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4243, roughness: .95 });
    const shoulder = new THREE.Mesh(this.track.makeRoadGeometry((progress) => this.track.roadWidthAtProgress(progress) + 5, 800, -.18), shoulderMaterial);
    const road = new THREE.Mesh(this.track.makeRoadGeometry((progress) => this.track.roadWidthAtProgress(progress), 800, 0), asphaltMaterial);
    shoulder.receiveShadow = true;
    road.receiveShadow = true;
    shoulder.name = 'playable-road-shoulder';
    road.name = 'playable-road';
    this.scene.add(shoulder, road);

    const companionShoulder = new THREE.Mesh(this.track.makeCarriagewayGeometry(-1, (progress) => this.track.roadWidthAtProgress(progress) + 5, 800, -.18), shoulderMaterial);
    const companionRoad = new THREE.Mesh(this.track.makeCarriagewayGeometry(-1, (progress) => this.track.roadWidthAtProgress(progress), 800, 0), companionMaterial);
    companionShoulder.receiveShadow = true;
    companionRoad.receiveShadow = true;
    companionRoad.name = 'opposite-carriageway';
    this.scene.add(companionShoulder, companionRoad);

    for (const anchorId of ['siu-lam', 'sham-tseng', 'yau-kom-tau']) {
      const anchor = this.track.getAnchor(anchorId);
      const start = Math.max(0, anchor.progress - .018);
      const end = Math.min(1, anchor.progress + .024);
      const ramp = new THREE.Mesh(
        this.track.makeCarriagewayGeometry(-1, 8, 70, -.28, (_progress, local) => -Math.sin(local * Math.PI) * 48, start, end),
        companionMaterial,
      );
      ramp.name = `scenery-ramp-${anchorId}`;
      ramp.receiveShadow = true;
      this.scene.add(ramp);
    }

    const laneWidth = GAME.trackWidth / 3;
    const busLaneMaterial = new THREE.MeshStandardMaterial({ color: 0xc9282d, roughness: .88, transparent: true, opacity: .9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.busLaneMeshes = {
      positive: new THREE.Mesh(this.track.makeRoadGeometry(laneWidth, 800, .035, (progress) => this.track.busLaneCenterCanonical(progress * this.track.length, 1)), busLaneMaterial),
    };
    this.busLaneMeshes.positive.visible = false;
    this.busLaneMeshes.positive.receiveShadow = true;
    this.scene.add(this.busLaneMeshes.positive);

    const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f0d4, roughness: .8 });
    const dashGeo = new THREE.BoxGeometry(.28, .08, 5.5);
    const dashCount = 260;
    const dashes = new THREE.InstancedMesh(dashGeo, dashMaterial, dashCount * 6);
    const matrix = new THREE.Matrix4();
    let dashIndex = 0;
    for (const carriagewayDirection of [1, -1]) {
      for (let i = 0; i < dashCount; i += 1) {
        const progress = (i + .5) / dashCount;
        const sample = this.track.canonicalSample(progress, carriagewayDirection);
        const expansion = this.track.fourLaneExpansion(sample.distance);
        const outerMarking = laneWidth / 2 + expansion * laneWidth / 2;
        const offsets = [-outerMarking, outerMarking];
        if (expansion >= .5) offsets.push(0);
        for (const offset of offsets) {
          const position = sample.point.clone().addScaledVector(sample.right, offset);
          position.y += .12;
          setRouteTransform(matrix, sample, position);
          dashes.setMatrixAt(dashIndex++, matrix);
        }
      }
    }
    dashes.count = dashIndex;
    dashes.name = 'playable-lane-markings';
    this.scene.add(dashes);

    const railSegments = GAME.railSegments;
    const railOverlap = GAME.railSegmentOverlap;
    const railGeo = new THREE.BoxGeometry(.4, 1.15, 1);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0xdbe4df, metalness: .25, roughness: .6 });
    const rails = new THREE.InstancedMesh(railGeo, railMaterial, railSegments * 4);
    let railIndex = 0;
    for (const carriagewayDirection of [1, -1]) {
      for (let i = 0; i < railSegments; i += 1) {
        for (const side of [-1, 1]) {
          const segment = this.track.carriagewaySegment(carriagewayDirection, i, railSegments, (progress) => side * (this.track.roadWidthAtProgress(progress) / 2 + GAME.railShoulderOffset + (carriagewayDirection === -1 ? REVERSE_RAIL_EXTRA_OFFSET : 0)), railOverlap);
          const position = segment.position.clone();
          position.y += .6;
          matrix.compose(position, segment.rotation, new THREE.Vector3(1, 1, segment.length));
          rails.setMatrixAt(railIndex++, matrix);
        }
      }
    }
    rails.name = 'road-safety-barriers';
    this.scene.add(rails);

    for (const carriagewayDirection of [1, -1]) {
      for (let i = 0; i < railSegments; i += 1) {
        for (const side of [-1, 1]) {
          const segment = this.track.carriagewaySegment(carriagewayDirection, i, railSegments, (progress) => side * (this.track.roadWidthAtProgress(progress) / 2 + GAME.railShoulderOffset + (carriagewayDirection === -1 ? REVERSE_RAIL_EXTRA_OFFSET : 0)), railOverlap);
          const position = segment.position.clone();
          position.y += GAME.railColliderHalfHeight;
          const railCollider = this.createCollider(
            RAPIER.ColliderDesc.cuboid(GAME.railColliderHalfWidth, GAME.railColliderHalfHeight, segment.length / 2).setTranslation(position.x, position.y, position.z).setRotation(segment.rotation).setRestitution(.55).setCollisionGroups(interactionGroups(COLLISION_GROUP_RAIL, COLLISION_GROUP_RACER)),
            { type: 'rail', id: `rail-${carriagewayDirection}-${i}-${side}` },
          );
          this.railColliders.push({ direction: carriagewayDirection, collider: railCollider });
        }
      }
    }

    const lampCount = 150;
    const lamps = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.12, .18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x87918d, metalness: .4, roughness: .55 }),
      lampCount * 2,
    );
    let lampIndex = 0;
    for (const carriagewayDirection of [1, -1]) {
      for (let i = 0; i < lampCount; i += 1) {
        const sample = this.track.canonicalSample((i + .5) / lampCount, carriagewayDirection);
        const side = i % 2 ? 1 : -1;
        const position = sample.point.clone().addScaledVector(sample.right, side * (this.track.roadWidthAtDistance(sample.distance) / 2 + 3.6));
        position.y += 4;
        setRouteTransform(matrix, sample, position);
        lamps.setMatrixAt(lampIndex++, matrix);
      }
    }
    lamps.name = 'route-lamp-posts';
    lamps.userData.hideOnLow = true;
    this.scene.add(lamps);

    const wallCount = 110;
    const retainingWalls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 5, 1),
      new THREE.MeshStandardMaterial({ color: 0x899285, roughness: 1 }),
      wallCount,
    );
    for (let i = 0; i < wallCount; i += 1) {
      const progress = (i + .5) / wallCount;
      const sample = this.track.sample(progress, 1);
      const next = this.track.sample(Math.min(1, progress + 1 / wallCount), 1);
      const position = sample.point.clone().addScaledVector(sample.right, this.track.roadWidthAtDistance(sample.distance) / 2 + 6.5);
      position.y += 1.7;
      setRouteTransform(matrix, sample, position, new THREE.Vector3(1, 1, sample.point.distanceTo(next.point) + 2));
      retainingWalls.setMatrixAt(i, matrix);
    }
    retainingWalls.name = 'hillside-retaining-walls';
    this.scene.add(retainingWalls);
  }

  buildLandmarks() {
    this.buildBuildingCluster('tuen-mun', -1, 18, 0xd9c8ad);
    this.buildBuildingCluster('sham-tseng', -1, 24, 0xe3d4b9);
    this.buildBuildingCluster('tsuen-wan', -1, 22, 0xc9d0ca);
    this.buildTingKauBridge();
    this.buildCoveredSections();
    this.buildCowInterchange();

    for (const anchorId of ['castle-peak-bay', 'siu-lam', 'sham-tseng', 'ting-kau', 'tsuen-wan']) {
      const anchor = this.track.getAnchor(anchorId);
      const sample = this.track.sample(anchor.progress, 1);
      const sign = makeTextSprite(`${anchor.labelZh}  ${anchor.labelEn}`);
      sign.position.copy(sample.point).addScaledVector(sample.right, anchor.side * (this.track.roadWidthAtDistance(anchor.distance) / 2 + 8));
      sign.position.y += 8;
      sign.name = `location-sign-${anchor.id}`;
      this.scene.add(sign);
    }
  }

  buildCowInterchange() {
    const stop = this.track.cowStops[0];
    if (!stop) return;

    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c6b8, roughness: .96 });
    const green = new THREE.MeshStandardMaterial({ color: 0x16835f, roughness: .72, metalness: .08 });
    const darkGreen = new THREE.MeshStandardMaterial({ color: 0x0e5f49, roughness: .78 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xcbd2cd, roughness: .9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xaed7d3, transparent: true, opacity: .42, depthWrite: false });
    const matrix = new THREE.Matrix4();
    const moduleCount = 9;
    const moduleLength = 10;
    const sides = [
      { direction: 1, outerSide: 1, name: 'tuen-mun-to-tsuen-wan' },
      { direction: -1, outerSide: -1, name: 'tsuen-wan-to-tuen-mun' },
    ];

    for (const side of sides) {
      const platform = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), platformMaterial, moduleCount);
      const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), green, moduleCount);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), darkGreen, moduleCount * 2);
      const screens = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glass, moduleCount);
      let postIndex = 0;
      for (let i = 0; i < moduleCount; i += 1) {
        const distance = stop.distance + (i - (moduleCount - 1) / 2) * moduleLength;
        const progress = this.track.progressAtDistance(distance);
        const sample = this.track.canonicalSample(progress, side.direction);
        const lateral = side.outerSide * (this.track.roadWidthAtDistance(distance) / 2 + 6.5);
        const position = sample.point.clone().addScaledVector(sample.right, lateral);
        position.y += .18;
        setRouteTransform(matrix, sample, position, new THREE.Vector3(8.2, .35, moduleLength + .35));
        platform.setMatrixAt(i, matrix);

        const roofPosition = position.clone();
        roofPosition.y += 5.25;
        setRouteTransform(matrix, sample, roofPosition, new THREE.Vector3(8.7, .35, moduleLength + .65));
        roofs.setMatrixAt(i, matrix);

        for (const postSide of [-1, 1]) {
          const postPosition = position.clone().addScaledVector(sample.right, postSide * 3.4);
          postPosition.y += 2.65;
          setRouteTransform(matrix, sample, postPosition, new THREE.Vector3(.28, 5.3, .34));
          posts.setMatrixAt(postIndex++, matrix);
        }

        const screenPosition = position.clone().addScaledVector(sample.right, side.outerSide * 3.05);
        screenPosition.y += 2.45;
        setRouteTransform(matrix, sample, screenPosition, new THREE.Vector3(.16, 3.7, moduleLength * .72));
        screens.setMatrixAt(i, matrix);
      }
      platform.receiveShadow = true;
      roofs.castShadow = true;
      posts.castShadow = true;
      platform.name = `cow-interchange-${side.name}-platform`;
      roofs.name = `cow-interchange-${side.name}-green-canopy`;
      posts.name = `cow-interchange-${side.name}-posts`;
      screens.name = `cow-interchange-${side.name}-screens`;
      this.scene.add(platform, roofs, posts, screens);
    }

    const bridgeDistance = stop.distance + 52;
    const bridgeProgress = this.track.progressAtDistance(bridgeDistance);
    const bridgeSample = this.track.canonicalSample(bridgeProgress, 1);
    const reverseBridgeSample = this.track.canonicalSample(bridgeProgress, -1);
    const forwardPillar = bridgeSample.point.clone().addScaledVector(bridgeSample.right, this.track.roadWidthAtDistance(bridgeDistance) / 2 + 6);
    const reversePillar = reverseBridgeSample.point.clone().addScaledVector(reverseBridgeSample.right, -(this.track.roadWidthAtDistance(bridgeDistance) / 2 + 6));
    const bridgePosition = forwardPillar.clone().add(reversePillar).multiplyScalar(.5);
    bridgePosition.y += 10.5;
    const footbridge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), concrete);
    setRouteTransform(footbridge.matrix, bridgeSample, bridgePosition, new THREE.Vector3(forwardPillar.distanceTo(reversePillar) + 8, 2.2, 5.2));
    footbridge.matrixAutoUpdate = false;
    footbridge.castShadow = true;
    footbridge.name = 'cow-interchange-footbridge';
    this.scene.add(footbridge);
    for (const base of [forwardPillar, reversePillar]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10.5, 2.2), concrete);
      pillar.position.copy(base);
      pillar.position.y += 5.25;
      pillar.castShadow = true;
      this.scene.add(pillar);
    }

    const stopSample = this.track.sampleDistance(stop.distance, 1);
    const sign = makeTextSprite(`${stop.labelZh}  ${stop.labelEn}`, '#ffffff', '#08785a');
    sign.position.copy(stopSample.point).addScaledVector(stopSample.right, 27);
    sign.position.y += 8.5;
    sign.scale.set(14.4, 4.5, 1);
    sign.name = 'tuen-mun-road-cow-interchange-sign';
    this.scene.add(sign);

    COWS.forEach((appearance, index) => {
      const distance = stop.distance - 28 + index * 14;
      const sample = this.track.sampleDistance(distance, 1);
      const waitingCow = createCow(appearance, false);
      waitingCow.scale.setScalar(.72);
      waitingCow.position.copy(sample.point).addScaledVector(sample.right, 29);
      waitingCow.position.y += .35;
      waitingCow.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI / 2;
      waitingCow.name = `cow-interchange-waiting-${appearance.id}`;
      this.scene.add(waitingCow);
    });
  }

  buildBuildingCluster(anchorId, side, count, color) {
    const anchor = this.track.getAnchor(anchorId);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9 });
    const buildings = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      const progress = THREE.MathUtils.clamp(anchor.progress + (i - count / 2) * .0018, 0, 1);
      const sample = side < 0 ? this.track.canonicalSample(progress, -1) : this.track.canonicalSample(progress, 1);
      const width = 9 + (i % 4) * 2.5;
      const depth = 10 + (i % 3) * 3;
      const height = 22 + (i % 7) * 7;
      const roadHalfWidth = this.track.roadWidthAtDistance(sample.distance) / 2;
      const lateral = side * (roadHalfWidth + 10 + width / 2 + (i % 4) * 19);
      const position = sample.point.clone().addScaledVector(sample.right, lateral);
      position.y += height / 2 - 2;
      setRouteTransform(matrix, sample, position, new THREE.Vector3(width, height, depth));
      buildings.setMatrixAt(i, matrix);
    }
    buildings.castShadow = true;
    buildings.receiveShadow = true;
    buildings.name = `${anchorId}-residential-cluster`;
    this.scene.add(buildings);
  }

  buildTingKauBridge() {
    const anchor = this.track.getAnchor('ting-kau');
    const sample = this.track.sample(anchor.progress, 1);
    const bridge = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xd7dfdc, roughness: .68 });
    const cable = new THREE.MeshStandardMaterial({ color: 0xc9d1cf, roughness: .55, metalness: .25 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(220, 3, 8), concrete);
    deck.position.y = 20;
    deck.castShadow = true;
    bridge.add(deck);
    for (const x of [-70, 0, 70]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 82, 6), concrete);
      tower.position.set(x, 41, 0);
      tower.castShadow = true;
      bridge.add(tower);
      for (const direction of [-1, 1]) {
        for (let section = 1; section <= 4; section += 1) {
          const deckX = x + direction * section * 14;
          if (Math.abs(deckX) > 105) continue;
          bridge.add(createBeam(new THREE.Vector3(x, 76, 0), new THREE.Vector3(deckX, 22, 0), .24, cable));
        }
      }
    }
    bridge.position.copy(sample.point).addScaledVector(sample.right, 255);
    bridge.position.y = -2;
    bridge.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    bridge.name = 'ting-kau-bridge-landmark';
    this.scene.add(bridge);
  }

  buildCoveredSections() {
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x82908b,
      roughness: 1,
      transparent: true,
      opacity: .48,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const interior = new THREE.MeshStandardMaterial({
      color: 0x596460,
      roughness: 1,
      transparent: true,
      opacity: .34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffe9ad, emissive: 0xffd77a, emissiveIntensity: 2 });
    for (const section of this.track.coveredSections) {
      const sectionLength = section.endDistance - section.startDistance;
      const count = Math.max(4, Math.ceil(sectionLength / 13));
      const matrix = new THREE.Matrix4();
      for (const carriagewayDirection of [1, -1]) {
        const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), interior, count);
        const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, count * 2);
        const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lightMaterial, count * 2);
        let wallIndex = 0;
        let lightIndex = 0;
        for (let i = 0; i < count; i += 1) {
          const distance = THREE.MathUtils.lerp(section.startDistance, section.endDistance, (i + .5) / count);
          const sample = this.track.canonicalSample(this.track.progressAtDistance(distance), carriagewayDirection);
          const segmentLength = sectionLength / count + 1.5;
          const roofPosition = sample.point.clone();
          roofPosition.y += 9.3;
          setRouteTransform(matrix, sample, roofPosition, new THREE.Vector3(GAME.trackWidth + 5, 1.2, segmentLength));
          roof.setMatrixAt(i, matrix);
          for (const side of [-1, 1]) {
            const wallPosition = sample.point.clone().addScaledVector(sample.right, side * (GAME.trackWidth / 2 + 1.6));
            wallPosition.y += 4.4;
            setRouteTransform(matrix, sample, wallPosition, new THREE.Vector3(1.5, 8.8, segmentLength));
            walls.setMatrixAt(wallIndex++, matrix);
            const lightPosition = sample.point.clone().addScaledVector(sample.right, side * 7);
            lightPosition.y += 8.45;
            setRouteTransform(matrix, sample, lightPosition, new THREE.Vector3(.3, .18, segmentLength * .55));
            lights.setMatrixAt(lightIndex++, matrix);
          }
        }
        roof.name = `${section.id}-${carriagewayDirection === -1 ? 'reverse' : 'forward'}-roof`;
        walls.name = `${section.id}-${carriagewayDirection === -1 ? 'reverse' : 'forward'}-walls`;
        lights.name = `${section.id}-${carriagewayDirection === -1 ? 'reverse' : 'forward'}-lights`;
        roof.userData.hideOnLow = carriagewayDirection === -1;
        walls.userData.hideOnLow = carriagewayDirection === -1;
        lights.userData.hideOnLow = carriagewayDirection === -1;
        roof.renderOrder = 2;
        walls.renderOrder = 2;
        this.scene.add(roof, walls, lights);
      }
    }
  }

  clearObstacleScenes() {
    for (const object of this.obstacleObjects) this.scene.remove(object);
    for (const collider of this.obstacleColliders) {
      this.colliderMetadata.delete(collider.handle);
      this.physics.removeCollider(collider, true);
    }
    this.obstacleObjects = [];
    this.obstacleColliders = [];
    this.activeObstacles = [];
  }

  buildObstacleScenes(direction, seed) {
    this.clearObstacleScenes();
    this.activeObstacles = this.track.createRaceObstacles(direction, seed);
    const colors = [0xd84e48, 0xe0a832, 0x4388a8, 0xede7db, 0x59636c];
    this.activeObstacles.forEach((obstacle, sceneIndex) => {
      const sceneSample = this.track.sampleDistance(obstacle.raceDistance, direction);
      const baseYaw = Math.atan2(sceneSample.tangent.x, sceneSample.tangent.z);
      obstacle.cars.forEach((item, itemIndex) => {
        const vehicleType = item.vehicleType;
        const object = vehicleType === 'bus'
          ? createDoubleDeckerBus()
          : vehicleType === 'taxi'
            ? createTaxi()
            : createCar(colors[(sceneIndex + itemIndex) % colors.length]);
        object.position.copy(sceneSample.point)
          .addScaledVector(sceneSample.right, item.lateral)
          .addScaledVector(sceneSample.tangent, item.longitudinal);
        object.rotation.y = baseYaw + item.yaw;
        if (vehicleType === 'bus') object.scale.set(BUS_SCALE.x, BUS_SCALE.y, BUS_SCALE.z);
        else object.scale.set(CAR_SCALE.x, CAR_SCALE.y, CAR_SCALE.z);
        object.userData.vehicleType = vehicleType;
        this.scene.add(object);
        this.obstacleObjects.push(object);

        const rotation = new THREE.Quaternion().setFromAxisAngle(up, object.rotation.y);
        const colliderSize = vehicleType === 'bus'
          ? { x: 3.9, y: 2.85, z: 7.43, centerY: 2.85 }
          : { x: 2.89, y: 1.68, z: 4.76, centerY: 1.68 };
        const collider = this.createCollider(
          RAPIER.ColliderDesc.cuboid(colliderSize.x, colliderSize.y, colliderSize.z)
            .setTranslation(object.position.x, object.position.y + colliderSize.centerY, object.position.z)
            .setRotation(rotation)
            .setRestitution(.7)
            .setCollisionGroups(interactionGroups(COLLISION_GROUP_OBSTACLE, COLLISION_GROUP_RACER)),
          { type: 'obstacle', id: `${obstacle.type}-${sceneIndex}-${itemIndex}`, obstacleType: obstacle.type, vehicleType },
        );
        this.obstacleColliders.push(collider);
      });
    });
  }

  setPreviewCow(appearance) {
    if(this.previewCow)this.scene.remove(this.previewCow);
    this.previewCow=createCow(appearance,true);this.previewCow.scale.setScalar(COW_SCALE);const s=this.track.sample(.025,1);this.previewCow.position.copy(s.point);this.previewCow.position.y+=.15;this.previewCow.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);this.scene.add(this.previewCow);
    const cameraPosition=s.point.clone().addScaledVector(s.right,10).addScaledVector(s.tangent,-11).add(new THREE.Vector3(0,6.5,0));
    this.camera.position.copy(cameraPosition);this.camera.lookAt(s.point.clone().addScaledVector(s.right,7).add(new THREE.Vector3(0,2.4,0)));
  }

  createCollider(desc, metadata, body) {
    const collider = this.physics.createCollider(desc, body);
    this.colliderMetadata.set(collider.handle, metadata);
    return collider;
  }

  clearRace() {
    this.raceRunning = false;
    this.events?.clear();
    this.racers.forEach((r)=>{this.scene.remove(r.visual);this.colliderMetadata.delete(r.collider.handle);this.physics.removeRigidBody(r.body);}); this.racers=[];
    this.events?.clear();
    this.activePlayerContacts.clear();this.collisionCooldowns.clear();this.collisionTypeCooldowns.clear();this.lastCollision=null;this.lastRecovery=null;
  }

  startRace(direction, appearance) {
    this.clearRace(); this.direction=direction; this.mode='race'; if(this.previewCow)this.previewCow.visible=false;
    this.busLaneActive=false;this.busLaneViolationTime=0;this.busLaneGameOverTriggered=false;this.obstacleGameOverTriggered=false;this.playerLives=GAME.playerLives;this.raceElapsed=0;this.cowInterchangeAnnounced=false;this.cowInterchangeVisited=false;this.setBusLaneVisual(false);
    this.obstacleSeed=direction===-1?randomSeed():this.forwardObstacleSeed;this.setActiveCarriagewayCollision(direction);this.buildObstacleScenes(direction,this.obstacleSeed);
    const choices=[appearance,...COWS.filter((c)=>c.id!==appearance.id)];
    const laneOffset=GAME.trackWidth/3;const lanes=[-laneOffset,0,laneOffset,-laneOffset,0,laneOffset];
    for(let i=0;i<6;i+=1){const progress=i<3?.004:0;const s=this.track.sample(progress,direction);const pos=s.point.clone().addScaledVector(s.right,lanes[i]);pos.y+=COW_GROUND_OFFSET;const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x,pos.y,pos.z).setLinearDamping(.25).lockRotations().setCcdEnabled(true));const events=RAPIER.ActiveEvents.COLLISION_EVENTS|RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS;const collider=this.createCollider(RAPIER.ColliderDesc.cuboid(COW_COLLIDER_HALF_WIDTH,.85*COW_SCALE,1.42*COW_SCALE).setRestitution(.72).setFriction(.25).setActiveEvents(events).setContactForceEventThreshold(0).setCollisionGroups(interactionGroups(COLLISION_GROUP_RACER,COLLISION_FILTER_NORMAL)),{type:'racer',id:i},body);const visual=createCow(choices[i%choices.length],i===0);visual.scale.setScalar(COW_SCALE);visual.position.set(pos.x,pos.y-COW_GROUND_OFFSET,pos.z);this.scene.add(visual);this.racers.push({id:i,body,collider,visual,isPlayer:i===0,progress,checkpoint:0,speed:0,heading:Math.atan2(s.tangent.x,s.tangent.z),turnSpeedFactor:1,lateral:lanes[i],grounded:true,jumpCooldown:0,airborne:false,jumpPhasing:false,finished:false,finishTime:null,stuck:0,lastProgress:0,protection:0,steer:0,accelerating:i!==0,braking:false,lane:lanes[i],aiAvoidLateral:lanes[i],aiObstacleDistance:null,busLaneViolationTime:0,mistake:Math.random()*6,lastPosition:pos.clone(),movementWindow:0,forwardMovement:0,windowForwardMovement:0,actualForwardSpeed:0});}
  }

  setRaceRunning(running){this.raceRunning=running;}

  setActiveCarriagewayCollision(direction) {
    for (const entry of this.railColliders) {
      entry.collider.setCollisionGroups(interactionGroups(COLLISION_GROUP_RAIL, entry.direction === direction ? COLLISION_GROUP_RACER : 0));
    }
  }

  update(dt, elapsed, input) {
    this.clockTime+=dt;
    if(this.mode==='menu'){this.updateMenuCamera(dt);return;}
    if(this.mode!=='race')return;
    if(this.raceRunning){
      this.updateBusLaneState(elapsed);
      for(const racer of this.racers)this.updateRacer(racer,dt,elapsed,input);
      this.checkCowInterchange();
      this.checkBusLaneViolations(dt);
      this.physics.timestep=dt;this.physics.step(this.events);
      this.drainPhysicsEvents();
    }
    this.racers.forEach((r)=>this.syncRacer(r,dt));
    this.updateRaceCamera(dt);
  }

  checkCowInterchange() {
    const stop = this.track.cowStops[0];
    const player = this.racers[0];
    if (!stop || !player || player.finished || this.cowInterchangeVisited) return;
    const raceDistance = player.progress * this.track.length;
    const canonicalDistance = this.direction === 1 ? raceDistance : this.track.length - raceDistance;
    const forwardDistance = (stop.distance - canonicalDistance) * this.direction;
    const triggerHalfLength = stop.triggerHalfLength ?? DEFAULT_COW_INTERCHANGE_TRIGGER_HALF_LENGTH;
    const leftmostRequired = this.direction === 1;
    if (!this.cowInterchangeAnnounced && forwardDistance > 0 && forwardDistance <= COW_INTERCHANGE_APPROACH_DISTANCE) {
      this.cowInterchangeAnnounced = true;
      this.onCowInterchangeApproach?.(stop, { leftmostRequired });
    }
    if (forwardDistance < -triggerHalfLength) {
      this.cowInterchangeVisited = true;
      return;
    }
    if (Math.abs(forwardDistance) > triggerHalfLength) return;
    if (leftmostRequired && !this.track.isRaceLeftLane(player.lateral, canonicalDistance)) return;
    this.cowInterchangeVisited = true;
    this.raceRunning = false;
    player.speed = 0;
    player.actualForwardSpeed = 0;
    const velocity = player.body.linvel();
    player.body.setLinvel({ x: 0, y: velocity.y, z: 0 }, true);
    this.onCowInterchange?.(stop);
  }

  changePlayerCow(appearance) {
    const player = this.racers[0];
    if (!player || !appearance) return;
    this.scene.remove(player.visual);
    const visual = createCow(appearance, true);
    visual.scale.setScalar(COW_SCALE);
    const position = player.body.translation();
    visual.position.set(position.x, position.y - COW_GROUND_OFFSET, position.z);
    visual.rotation.y = player.heading;
    player.visual = visual;
    player.appearance = appearance;
    this.scene.add(visual);
  }

  updateRacer(racer,dt,elapsed,input){
    if(racer.finished)return;
    const position=racer.body.translation();const pos=new THREE.Vector3(position.x,position.y,position.z);racer.progress=this.track.nearestProgress(pos,racer.progress,this.direction);const s=this.track.sample(racer.progress,this.direction);racer.lateral=tmp.copy(pos).sub(s.point).dot(s.right);const forwardStep=tmp.copy(pos).sub(racer.lastPosition).dot(s.tangent);racer.actualForwardSpeed=THREE.MathUtils.lerp(racer.actualForwardSpeed,forwardStep/dt,Math.min(1,dt*8));racer.lastPosition.copy(pos);
    let steer=0;let accelerating=!racer.isPlayer;let braking=false;let jump=false;
    if(racer.isPlayer){steer=input.steer;accelerating=input.accelerating;braking=input.braking;jump=input.consumeJump();}
    else {
      let desired=racer.lane+Math.sin(elapsed*.7+racer.mistake)*.65;
      let nearestDistance=Infinity;
      const racerDistance = racer.progress * this.track.length;
      const canonicalDistance = this.direction === 1 ? racerDistance : this.track.length - racerDistance;
      const roadHalfWidth = this.track.roadWidthAtDistance(canonicalDistance) / 2;
      racer.aiObstacleDistance=null;
      for(const obstacle of this.activeObstacles){const obstacleDistance=obstacle.raceDistance;const delta=obstacleDistance-racerDistance;if(delta>0&&delta<AI_OBSTACLE_LOOKAHEAD&&delta<nearestDistance){nearestDistance=delta;racer.aiObstacleDistance=obstacleDistance;const laneSpread=((racer.id-1)%3-1)*1.1;desired=THREE.MathUtils.clamp(obstacle.avoidLateral+laneSpread,-roadHalfWidth+2.5,roadHalfWidth-2.5);}}
      if(this.direction===1&&this.busLaneActive)desired=Math.min(desired,-1.1-((racer.id-1)%3)*2.2);
      const edgeCorrection=roadHalfWidth-7;
      if(racer.lateral<-edgeCorrection)desired=Math.max(desired,7);else if(racer.lateral>edgeCorrection)desired=Math.min(desired,-7);
      const lateralResponse=Math.abs(racer.lateral)>edgeCorrection?11:1.3;
      racer.aiAvoidLateral=THREE.MathUtils.lerp(racer.aiAvoidLateral,desired,Math.min(1,dt*lateralResponse));
       const aim=this.track.sampleDistance(Math.min(this.track.length-18,racerDistance+(this.direction===-1?AI_REVERSE_STEER_LOOKAHEAD:AI_STEER_LOOKAHEAD)),this.direction);
      const aimPoint=aim.point.clone().addScaledVector(aim.right,racer.aiAvoidLateral);
      const desiredHeading=Math.atan2(aimPoint.x-pos.x,aimPoint.z-pos.z);
      const headingError=normalizeAngle(desiredHeading-racer.heading);
      steer=THREE.MathUtils.clamp(headingError/.35,-1,1);
    }
    racer.steer=THREE.MathUtils.lerp(racer.steer,steer,Math.min(1,dt*7));racer.accelerating=accelerating;racer.braking=braking;
    const isTurning=Math.abs(racer.steer)>=GAME.turnSteerThreshold;
    const wasRecovering=!isTurning&&racer.turnSpeedFactor<1;
    if(isTurning)racer.turnSpeedFactor=GAME.turnSpeedMultiplier;
    else {racer.turnSpeedFactor=Math.min(1,racer.turnSpeedFactor+((1-GAME.turnSpeedMultiplier)/GAME.turnRecoveryTime)*dt);if(1-racer.turnSpeedFactor<1e-6)racer.turnSpeedFactor=1;}
    const fullTarget=racer.isPlayer?GAME.targetSpeed:GAME.aiBaseSpeed;
    const target=fullTarget*racer.turnSpeedFactor;
    const recoveryAcceleration=fullTarget*(1-GAME.turnSpeedMultiplier)/GAME.turnRecoveryTime;
    const acceleration=wasRecovering?Math.max(GAME.acceleration,recoveryAcceleration):GAME.acceleration;
    racer.speed=nextRacerSpeed(racer.speed,accelerating,braking,target,acceleration,dt);
    racer.jumpCooldown=Math.max(0,racer.jumpCooldown-dt);racer.protection=Math.max(0,racer.protection-dt);if(racer.protection<=0&&!racer.jumpPhasing)setRacerCollisionFilter(racer,COLLISION_FILTER_NORMAL);
    const groundY=s.point.y+COW_GROUND_OFFSET;const vertical=racer.body.linvel().y;
    const groundGap=pos.y-groundY;
    racer.grounded=shouldFollowGround(racer.airborne,groundGap,vertical);
    let didJump=false;
    if(racer.grounded){
      racer.airborne=false;
      if(Math.abs(groundGap)>.001){racer.body.setTranslation({x:pos.x,y:groundY,z:pos.z},true);pos.y=groundY;}
      if(vertical!==0){const velocity=racer.body.linvel();racer.body.setLinvel({x:velocity.x,y:0,z:velocity.z},true);}
      if(jump&&racer.jumpCooldown<=0){racer.body.setLinvel({x:0,y:GAME.jumpVelocity,z:0},true);racer.grounded=false;racer.airborne=true;racer.jumpPhasing=true;didJump=true;setRacerCollisionFilter(racer,COLLISION_FILTER_JUMP);this.audio.play('jump');}
    }else if(!racer.airborne&&groundGap>GROUND_FOLLOW_DISTANCE)racer.airborne=true;
    const landingPosition=racer.body.translation();const landingVertical=racer.body.linvel().y;
    if(!didJump&&racer.airborne&&landingVertical<0&&landingPosition.y<=groundY+.18){racer.body.setTranslation({x:landingPosition.x,y:groundY,z:landingPosition.z},true);racer.body.setLinvel({x:0,y:0,z:0},true);racer.grounded=true;racer.airborne=false;racer.jumpPhasing=false;racer.jumpCooldown=GAME.jumpCooldown;if(racer.protection<=0)setRacerCollisionFilter(racer,COLLISION_FILTER_NORMAL);if(racer.isPlayer)this.audio.play('land');}
    const headingTurnRate=GAME.steerRate*(racer.airborne?.45:1);
    racer.heading=normalizeAngle(racer.heading+racer.steer*headingTurnRate*dt);
    const velocity=tmp.set(Math.sin(racer.heading),0,Math.cos(racer.heading)).multiplyScalar(racer.speed);
    racer.body.setLinvel({x:velocity.x,y:racer.body.linvel().y,z:velocity.z},true);
    if(accelerating&&racer.grounded&&racer.speed>=16){racer.movementWindow+=dt;racer.forwardMovement+=Math.max(0,forwardStep);if(racer.movementWindow>=MOVEMENT_WINDOW){racer.windowForwardMovement=racer.forwardMovement;if(racer.forwardMovement<MIN_WINDOW_MOVEMENT)racer.stuck+=racer.movementWindow;else racer.stuck=0;racer.movementWindow=0;racer.forwardMovement=0;}}else{racer.movementWindow=0;racer.forwardMovement=0;racer.stuck=0;}
    racer.lastProgress=racer.progress;
    const roadHalfWidth=this.track.roadWidthAtDistance(s.distance)/2;
    if(Math.abs(racer.lateral)>roadHalfWidth+6)this.recover(racer,'off-track');else if(pos.y<s.point.y-12)this.recover(racer,'fallen');else if(!racer.isPlayer&&racer.stuck>=GAME.aiObstacleResetDelay)this.bypassAiObstacle(racer);else if(racer.stuck>=3)this.recover(racer,'stuck');
    racer.checkpoint=Math.max(racer.checkpoint,this.track.checkpointIndexAtProgress(racer.progress));
    if(racer.progress>=.997){racer.finished=true;racer.finishTime=elapsed;racer.speed=0;if(racer.isPlayer)this.onPlayerFinish?.();}
  }

  recover(racer,reason,notify=true){const progress=this.track.recoveryProgress(racer.checkpoint);const s=this.track.sample(progress,this.direction);const p=s.point.clone().addScaledVector(s.right,racer.lane*.6);p.y+=COW_GROUND_OFFSET+.1;racer.body.setTranslation(p,true);racer.body.setLinvel({x:0,y:0,z:0},true);racer.progress=progress;racer.lastProgress=progress;racer.heading=Math.atan2(s.tangent.x,s.tangent.z);racer.stuck=0;racer.speed=15;racer.protection=1.5;racer.airborne=false;racer.jumpPhasing=false;racer.movementWindow=0;racer.forwardMovement=0;racer.windowForwardMovement=0;racer.actualForwardSpeed=0;racer.lastPosition.copy(p);setRacerCollisionFilter(racer,0);if(racer.isPlayer&&notify){this.lastRecovery={reason,time:this.clockTime};this.onRecovery?.(reason);}}

  bypassAiObstacle(racer){const currentDistance=racer.progress*this.track.length;const distance=Math.min(this.track.length*.99,Math.max(currentDistance+AI_BYPASS_DISTANCE,(racer.aiObstacleDistance??currentDistance)+AI_BYPASS_DISTANCE));const progress=distance/this.track.length;const s=this.track.sample(progress,this.direction);const roadHalfWidth=this.track.roadWidthAtDistance(s.distance)/2;const lateral=THREE.MathUtils.clamp(racer.aiAvoidLateral??racer.lane,-roadHalfWidth+2.5,roadHalfWidth-2.5);const p=s.point.clone().addScaledVector(s.right,lateral);p.y+=COW_GROUND_OFFSET+.1;racer.body.setTranslation(p,true);racer.body.setLinvel({x:0,y:0,z:0},true);racer.progress=progress;racer.lastProgress=progress;racer.heading=Math.atan2(s.tangent.x,s.tangent.z);racer.lateral=lateral;racer.lane=lateral;racer.stuck=0;racer.speed=GAME.aiBaseSpeed*GAME.turnSpeedMultiplier;racer.turnSpeedFactor=GAME.turnSpeedMultiplier;racer.protection=1.25;racer.movementWindow=0;racer.forwardMovement=0;racer.windowForwardMovement=0;racer.actualForwardSpeed=0;racer.lastPosition.copy(p);setRacerCollisionFilter(racer,0);}

  hasBusLane(){return this.direction===1;}

  updateBusLaneState(elapsed){this.raceElapsed=elapsed;const minutes=(elapsed/GAME.clockDayDuration*1440)%1440;const active=this.hasBusLane()&&minutes>=GAME.busLaneStartMinutes&&minutes<GAME.busLaneEndMinutes;if(active===this.busLaneActive)return;this.busLaneActive=active;this.busLaneViolationTime=0;this.busLaneGameOverTriggered=false;for(const racer of this.racers)racer.busLaneViolationTime=0;this.setBusLaneVisual(active);}

  setBusLaneVisual(active){if(!this.busLaneMeshes)return;this.busLaneMeshes.positive.visible=active&&this.hasBusLane();}

  checkBusLaneViolations(dt){if(!this.hasBusLane()){this.busLaneActive=false;this.busLaneViolationTime=0;for(const racer of this.racers)racer.busLaneViolationTime=0;return;}for(const racer of this.racers){const raceDistance=racer.progress*this.track.length;const trackDistance=this.direction===1?raceDistance:this.track.length-raceDistance;if(!this.busLaneActive||racer.finished||!this.track.isBusLane(racer.lateral,trackDistance)){racer.busLaneViolationTime=0;continue;}racer.busLaneViolationTime+=dt;if(racer.busLaneViolationTime+1e-6<GAME.busLaneGraceTime)continue;if(racer.isPlayer){if(!this.busLaneGameOverTriggered){this.busLaneGameOverTriggered=true;this.onBusLaneGameOver?.();}}else this.moveAiOutOfBusLane(racer);}const player=this.racers[0];this.busLaneViolationTime=player?.busLaneViolationTime??0;}

  moveAiOutOfBusLane(racer){const lateral=-2.2-((racer.id-1)%3)*2.2;const s=this.track.sample(racer.progress,this.direction);const p=s.point.clone().addScaledVector(s.right,lateral);p.y+=COW_GROUND_OFFSET+.1;racer.body.setTranslation(p,true);racer.body.setLinvel({x:0,y:0,z:0},true);racer.heading=Math.atan2(s.tangent.x,s.tangent.z);racer.lateral=lateral;racer.aiAvoidLateral=lateral;racer.busLaneViolationTime=0;racer.protection=.75;racer.lastPosition.copy(p);setRacerCollisionFilter(racer,0);}

  getBusLaneStatus(){const simulatedMinutes=(this.raceElapsed/GAME.clockDayDuration*1440)%1440;const player=this.racers[0];const raceDistance=(player?.progress??0)*this.track.length;const trackDistance=this.direction===1?raceDistance:this.track.length-raceDistance;const enabled=this.hasBusLane();return{simulatedMinutes,enabled,active:Boolean(enabled&&this.busLaneActive),playerInBusLane:Boolean(enabled&&this.busLaneActive&&player&&this.track.isBusLane(player.lateral,trackDistance)),violationTime:enabled?(player?.busLaneViolationTime??0):0,graceTime:GAME.busLaneGraceTime};}

  takePlayerLife(details){const player=this.racers[0];if(!player||player.protection>0||player.airborne||this.obstacleGameOverTriggered)return;this.playerLives=Math.max(0,this.playerLives-1);if(this.playerLives<=0){this.obstacleGameOverTriggered=true;this.onObstacleGameOver?.(details);return;}this.onPlayerLifeLost?.({...details,remaining:this.playerLives,total:GAME.playerLives});this.activePlayerContacts.clear();this.recover(player,'obstacle',false);}

  drainPhysicsEvents() {
    const player = this.racers[0];
    if (!player) return;
    const playerHandle = player.collider.handle;
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (h1 !== playerHandle && h2 !== playerHandle) return;
      const otherHandle = h1 === playerHandle ? h2 : h1;
      const metadata = this.colliderMetadata.get(otherHandle);
      if (!metadata || metadata.type === 'road') return;
      if (started) {
        this.activePlayerContacts.set(otherHandle, { notified: false });
        if (metadata.type === 'obstacle') this.takePlayerLife({ type: metadata.obstacleType ?? 'obstacle', otherId: metadata.id, vehicleType: metadata.vehicleType ?? null });
      } else this.activePlayerContacts.delete(otherHandle);
    });
    this.events.drainContactForceEvents((event) => {
      const h1 = event.collider1(), h2 = event.collider2();
      if (h1 !== playerHandle && h2 !== playerHandle) return;
      const otherHandle = h1 === playerHandle ? h2 : h1;
      const metadata = this.colliderMetadata.get(otherHandle);
      if (!metadata || metadata.type === 'road' || metadata.type === 'obstacle' && player.protection > 0) return;
      const force = event.maxForceMagnitude();
      const contact = this.activePlayerContacts.get(otherHandle) ?? { notified: false };
      this.activePlayerContacts.set(otherHandle, contact);
      const lastAt = this.collisionCooldowns.get(otherHandle) ?? -Infinity;
      const lastTypeAt = this.collisionTypeCooldowns.get(metadata.type) ?? -Infinity;
      const raceDistance = player.progress * this.track.length;
      const trackDistance = this.direction === 1 ? raceDistance : this.track.length - raceDistance;
      if (force < CONTACT_FORCE_THRESHOLD || contact.notified || this.clockTime - lastAt < COLLISION_COOLDOWN) return;
      if (metadata.type === 'rail' && (!isRailContactNearBoundary(player.lateral, this.track.roadWidthAtDistance(trackDistance)) || this.clockTime - lastTypeAt < RAIL_FEEDBACK_COOLDOWN)) return;

      contact.notified = true;
      this.collisionCooldowns.set(otherHandle, this.clockTime);
      this.collisionTypeCooldowns.set(metadata.type, this.clockTime);
      const position = player.body.translation();
      this.lastCollision = {
        type: metadata.type,
        force,
        otherId: metadata.id,
        time: this.clockTime,
        trackDistance,
        lateral: player.lateral,
        localPosition: { x: position.x, y: position.y, z: position.z },
      };
      this.audio.play('hit');
      this.onCollision?.({ type: metadata.type, force, otherId: metadata.id });
    });
  }

  getDiagnostics(){const player=this.racers[0];if(!player)return null;const velocity=player.body.linvel();const position=player.body.translation();const bodyForwardSpeed=Math.hypot(velocity.x,velocity.z);const raceDistance=player.progress*this.track.length;const trackDistance=this.direction===1?raceDistance:this.track.length-raceDistance;return{requestedSpeed:player.speed,actualForwardSpeed:player.actualForwardSpeed,bodyForwardSpeed,activeContacts:this.activePlayerContacts.size,forwardMovement:player.windowForwardMovement,stuckTimer:player.stuck,lateral:player.lateral,trackLimit:this.track.roadWidthAtDistance(trackDistance)/2,lives:this.playerLives,raceDistance,trackDistance,trackLength:this.track.length,carriageway:this.direction===1?'TM -> TW':'TW -> TM (left)',obstacleSeed:this.obstacleSeed,localPosition:{x:position.x,y:position.y,z:position.z},clockTime:this.clockTime,lastCollision:this.lastCollision,lastRecovery:this.lastRecovery};}

  syncRacer(racer){const p=racer.body.translation();racer.visual.position.set(p.x,p.y-COW_GROUND_OFFSET,p.z);racer.visual.rotation.y=racer.heading;animateCow(racer.visual,this.clockTime,racer.speed,racer.steer,racer.airborne,racer.braking);}

  updateMenuCamera(){if(this.previewCow){this.previewCow.visible=true;animateCow(this.previewCow,this.clockTime,5,Math.sin(this.clockTime)*.2,false,false);}const s=this.track.sample(.025,1);const desired=s.point.clone().addScaledVector(s.right,10+Math.sin(this.clockTime*.25)*.35).addScaledVector(s.tangent,-11).add(new THREE.Vector3(0,6.5,0));this.camera.position.lerp(desired,.035);this.camera.lookAt(s.point.clone().addScaledVector(s.right,7).add(new THREE.Vector3(0,2.4,0)));}
  updateRaceCamera(dt){const player=this.racers[0];if(!player)return;const p=player.body.translation();const heading=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading));const desired=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(heading,-15).add(new THREE.Vector3(0,8.2,0));const alpha=this.settings.reducedMotion?Math.min(1,dt*5):Math.min(1,dt*3.4);this.camera.position.lerp(desired,alpha);this.camera.lookAt(new THREE.Vector3(p.x,p.y+1.2,p.z).addScaledVector(heading,18));const fov=this.settings.reducedMotion?58:58+player.speed/18;this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,dt*2);this.camera.updateProjectionMatrix();this.sun.position.set(p.x-180,p.y+300,p.z-120);this.sun.target.position.set(p.x,p.y,p.z);}
  getStandings(){return [...this.racers].sort((a,b)=>{if(a.finished&&b.finished)return a.finishTime-b.finishTime;if(a.finished!==b.finished)return a.finished?-1:1;return b.progress-a.progress;});}
  applyQuality(){const q=this.settings.quality;const ratio=q==='low'?Math.min(devicePixelRatio,.75):q==='medium'?Math.min(devicePixelRatio,1.4):Math.min(devicePixelRatio,2);this.renderer.setPixelRatio(ratio);this.renderer.shadowMap.enabled=q!=='low';this.scene.fog.far=q==='low'?850:q==='medium'?1200:1500;this.scene.traverse((object)=>{if(object.userData.hideOnLow)object.visible=q!=='low';});this.resize();}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight,false);}
  render(){this.renderer.render(this.scene,this.camera);}
}
