import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const TARGET_LENGTH = 6000;
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/113.9782,22.3895;114.1110,22.3742?overview=full&geometries=geojson&steps=true';
const REVERSE_CARRIAGEWAY_OFFSET = 44;
const REVERSE_CARRIAGEWAY_SAMPLE_SPACING = 60;

const anchors = [
  { id: 'tuen-mun', labelEn: 'Tuen Mun', labelZh: '屯門', type: 'terminus', lon: 113.97822, lat: 22.38951, side: -1 },
  { id: 'castle-peak-bay', labelEn: 'Castle Peak Bay', labelZh: '青山灣', type: 'coast', lon: 113.9804, lat: 22.3833, side: 1 },
  { id: 'siu-lam', labelEn: 'Siu Lam', labelZh: '小欖', type: 'district', lon: 114.0018, lat: 22.3672, side: 1 },
  { id: 'tai-lam-chung', labelEn: 'Tai Lam Chung', labelZh: '大欖涌', type: 'bridge', lon: 114.0168, lat: 22.3609, side: 1 },
  { id: 'tsing-lung-tau', labelEn: 'Tsing Lung Tau', labelZh: '青龍頭', type: 'district', lon: 114.0453, lat: 22.3658, side: 1 },
  { id: 'sham-tseng', labelEn: 'Sham Tseng', labelZh: '深井', type: 'urban', lon: 114.0586, lat: 22.3682, side: -1 },
  { id: 'ting-kau', labelEn: 'Ting Kau Bridge', labelZh: '汀九橋', type: 'bridge-view', lon: 114.0795, lat: 22.3717, side: 1 },
  { id: 'yau-kom-tau', labelEn: 'Yau Kom Tau', labelZh: '油柑頭', type: 'viaduct', lon: 114.0941, lat: 22.3700, side: 1 },
  { id: 'tsuen-wan', labelEn: 'Tsuen Wan', labelZh: '荃灣', type: 'terminus', lon: 114.10202, lat: 22.37399, side: -1 },
];

const cowStops = [
  {
    id: 'tuen-mun-road-cow-interchange',
    labelEn: 'Tuen Mun Road Cow Interchange',
    labelZh: '\u5c6f\u9580\u516c\u8def\u8f49\u725b\u7ad9',
    lon: 114.019451,
    lat: 22.357906,
    osmElement: 'way/439181307',
    fourLaneStartOffset: -280,
    fourLaneEndOffset: 280,
    laneTransitionDistance: 80,
    triggerHalfLength: 48,
  },
];

const distance2 = (a, b) => {
  const x = (a[0] - b[0]) * 111320 * Math.cos(((a[1] + b[1]) * .5) * Math.PI / 180);
  const y = (a[1] - b[1]) * 110540;
  return x * x + y * y;
};

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.sqrt(distance2(point, start));
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const projected = [start[0] + t * dx, start[1] + t * dy];
  return Math.sqrt(distance2(point, projected));
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let split = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i], points[0], points.at(-1));
    if (d > maxDistance) { maxDistance = d; split = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}

function cumulativeDistances(points) {
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) distances.push(distances[i - 1] + Math.sqrt(distance2(points[i - 1], points[i])));
  return distances;
}

function resampleByDistance(points, distances, count) {
  const result = [];
  let segment = 1;
  for (let i = 0; i < count; i += 1) {
    const target = distances.at(-1) * i / (count - 1);
    while (segment < distances.length - 1 && distances[segment] < target) segment += 1;
    const startDistance = distances[segment - 1];
    const endDistance = distances[segment];
    const mix = (target - startDistance) / Math.max(.001, endDistance - startDistance);
    result.push([
      THREE.MathUtils.lerp(points[segment - 1][0], points[segment][0], mix),
      THREE.MathUtils.lerp(points[segment - 1][1], points[segment][1], mix),
    ]);
  }
  return result;
}

async function fetchElevations(points) {
  const elevations = [];
  for (let start = 0; start < points.length; start += 80) {
    const chunk = points.slice(start, start + 80);
    const latitude = chunk.map((point) => point[1].toFixed(6)).join(',');
    const longitude = chunk.map((point) => point[0].toFixed(6)).join(',');
    const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
    if (!response.ok) throw new Error(`Elevation service returned ${response.status}`);
    elevations.push(...(await response.json()).elevation);
  }
  let result = elevations.map((value) => Number.isFinite(value) ? value : 0);
  for (let pass = 0; pass < 4; pass += 1) {
    result = result.map((value, i, values) => i === 0 || i === values.length - 1
      ? value
      : values[i - 1] * .25 + value * .5 + values[i + 1] * .25);
  }
  return result;
}

function progressForCoordinate(coordinate, route, distances) {
  let best = 0;
  let bestDistance = Infinity;
  route.forEach((point, index) => {
    const d = distance2(coordinate, point);
    if (d < bestDistance) { bestDistance = d; best = index; }
  });
  return distances[best] / distances.at(-1);
}

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function fourLaneExpansion(distance, stop) {
  if (!stop || distance <= stop.fourLaneStartDistance || distance >= stop.fourLaneEndDistance) return 0;
  const entering = THREE.MathUtils.clamp((distance - stop.fourLaneStartDistance) / stop.laneTransitionDistance, 0, 1);
  const leaving = THREE.MathUtils.clamp((stop.fourLaneEndDistance - distance) / stop.laneTransitionDistance, 0, 1);
  const blend = Math.min(entering, leaving);
  return blend * blend * (3 - 2 * blend);
}

function makeReverseRoutePoints(curve, stop) {
  const result = [];
  for (let distance = 0; distance < curve.getLength() - REVERSE_CARRIAGEWAY_SAMPLE_SPACING * .5; distance += REVERSE_CARRIAGEWAY_SAMPLE_SPACING) {
    const progress = distance / curve.getLength();
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const separation = REVERSE_CARRIAGEWAY_OFFSET + 11 * fourLaneExpansion(distance, stop);
    result.push(point.addScaledVector(right, -separation));
  }
  const point = curve.getPointAt(1);
  const tangent = curve.getTangentAt(1).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  result.push(point.addScaledVector(right, -REVERSE_CARRIAGEWAY_OFFSET));
  return result.map((entry) => [round(entry.x), round(entry.y), round(entry.z)]);
}

async function updateExistingReverseRoute() {
  const trackPath = path.join(DATA_DIR, 'tuen-mun-road.track.json');
  const trackData = JSON.parse(await readFile(trackPath, 'utf8'));
  const curve = new THREE.CatmullRomCurve3(trackData.routePoints.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  trackData.reverseRoutePoints = makeReverseRoutePoints(curve, trackData.cowStops?.[0]);
  trackData.reverseGeneratedLength = round(new THREE.CatmullRomCurve3(trackData.reverseRoutePoints.map((point) => new THREE.Vector3(...point)), false, 'centripetal').getLength());
  await writeFile(trackPath, `${JSON.stringify(trackData, null, 2)}\n`);
  console.log(`Added ${trackData.reverseRoutePoints.length} reverse-carriageway points to the existing track data.`);
}

async function main() {
  const routeResponse = await fetch(OSRM_URL, { headers: { 'User-Agent': 'TuenMunCowRacing/1.0 local-development' } });
  if (!routeResponse.ok) throw new Error(`OSRM returned ${routeResponse.status}`);
  const routeResult = await routeResponse.json();
  if (routeResult.code !== 'Ok') throw new Error(`OSRM route failed: ${routeResult.code}`);
  const routeStep = routeResult.routes[0].legs[0].steps.find((step) => step.name.includes('Tuen Mun Road'));
  if (!routeStep) throw new Error('The routed result did not contain a Tuen Mun Road step');
  const sourceCoordinates = routeStep.geometry.coordinates;
  const sourceDistances = cumulativeDistances(sourceCoordinates);
  const simplified = simplify(sourceCoordinates, 25);
  const elevations = await fetchElevations(simplified);

  const origin = simplified[0];
  const latitudeScale = 110540;
  const longitudeScale = 111320 * Math.cos(origin[1] * Math.PI / 180);
  const local = simplified.map(([lon, lat]) => ({ east: (lon - origin[0]) * longitudeScale, north: (lat - origin[1]) * latitudeScale }));
  const minimapPoints = resampleByDistance(sourceCoordinates, sourceDistances, 161).map(([lon, lat]) => [
    round((lon - origin[0]) * longitudeScale),
    round((lat - origin[1]) * latitudeScale),
  ]);
  const end = local.at(-1);
  const forwardLength = Math.hypot(end.east, end.north);
  const forward = { east: end.east / forwardLength, north: end.north / forwardLength };
  const projected = local.map(({ east, north }, i) => ({
    x: east * forward.north - north * forward.east,
    y: 6 + Math.max(0, elevations[i] - Math.min(...elevations)) * .18,
    z: east * forward.east + north * forward.north,
  }));

  const playableAlignment = projected;
  let horizontalScale = TARGET_LENGTH / sourceDistances.at(-1);
  let points;
  let curve;
  for (let pass = 0; pass < 4; pass += 1) {
    points = playableAlignment.map((point) => new THREE.Vector3(point.x * horizontalScale, point.y, point.z * horizontalScale));
    curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    horizontalScale *= TARGET_LENGTH / curve.getLength();
  }
  points = playableAlignment.map((point) => new THREE.Vector3(point.x * horizontalScale, point.y, point.z * horizontalScale));
  curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');

  const normalizedAnchors = anchors.map((anchor) => {
    const progress = progressForCoordinate([anchor.lon, anchor.lat], sourceCoordinates, sourceDistances);
    return { ...anchor, distance: round(progress * curve.getLength()), progress: round(progress, 6) };
  });
  const normalizedCowStops = cowStops.map((stop) => {
    const progress = progressForCoordinate([stop.lon, stop.lat], sourceCoordinates, sourceDistances);
    const distance = round(progress * curve.getLength());
    return {
      ...stop,
      distance,
      progress: round(progress, 6),
      fourLaneStartDistance: round(distance + stop.fourLaneStartOffset),
      fourLaneEndDistance: round(distance + stop.fourLaneEndOffset),
    };
  });
  const anchorDistance = (id) => normalizedAnchors.find((anchor) => anchor.id === id).distance;
  const coveredSections = [
    { id: 'tuen-mun-covered-road', type: 'covered-road', startDistance: 120, endDistance: 260 },
    { id: 'sham-tseng-gallery', type: 'rock-gallery', startDistance: anchorDistance('sham-tseng') - 90, endDistance: anchorDistance('sham-tseng') + 75 },
    { id: 'tsuen-wan-covered-road', type: 'covered-road', startDistance: anchorDistance('tsuen-wan') - 185, endDistance: anchorDistance('tsuen-wan') - 45 },
  ];
  const environmentZones = [
    { id: 'tuen-mun-urban', type: 'urban', startDistance: 0, endDistance: anchorDistance('castle-peak-bay') + 100, seaSide: -1 },
    { id: 'western-coast', type: 'coast', startDistance: anchorDistance('castle-peak-bay'), endDistance: anchorDistance('tsing-lung-tau'), seaSide: -1 },
    { id: 'sham-tseng', type: 'urban-coast', startDistance: anchorDistance('tsing-lung-tau'), endDistance: anchorDistance('ting-kau'), seaSide: -1 },
    { id: 'ting-kau', type: 'bridge-view', startDistance: anchorDistance('ting-kau') - 160, endDistance: anchorDistance('yau-kom-tau') + 120, seaSide: -1 },
    { id: 'tsuen-wan-urban', type: 'urban', startDistance: anchorDistance('yau-kom-tau'), endDistance: round(curve.getLength()), seaSide: -1 },
  ];
  const accidentScenes = Array.from({ length: 27 }, (_, index) => ({
    id: `accident-${String(index + 1).padStart(2, '0')}`,
    type: 'accident',
    distance: round(curve.getLength() * (.04 + (index / 26) * .92)),
    layout: index % 5,
  }));
  const obstacles = accidentScenes;
  const checkpoints = Array.from({ length: 17 }, (_, index) => {
    const distance = curve.getLength() * index / 16;
    return {
      id: `checkpoint-${String(index).padStart(2, '0')}`,
      distance: round(distance),
      recoveryDistance: round(Math.max(0, distance - 90)),
    };
  });

  const geojson = {
    type: 'FeatureCollection',
    name: 'Tuen Mun Road source alignment',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: [{
      type: 'Feature',
      properties: {
        name: 'Tuen Mun Road: Tuen Mun to Tsuen Wan',
        source: 'OpenStreetMap contributors via OSRM',
        sourceDistanceMetres: routeStep.distance,
        retrieved: new Date().toISOString().slice(0, 10),
      },
      geometry: { type: 'LineString', coordinates: sourceCoordinates },
    }],
  };
  const trackData = {
    version: 1,
    id: 'tuen-mun-road',
    canonicalDirection: 'tuen-mun-to-tsuen-wan',
    targetLength: TARGET_LENGTH,
    generatedLength: round(curve.getLength()),
    originWgs84: origin,
    projection: 'Local tangent plane, rotated to canonical route direction',
    elevation: 'Copernicus DEM-derived terrain profile, smoothed and vertically compressed for gameplay',
    routePoints: points.map((point) => [round(point.x), round(point.y), round(point.z)]),
    reverseRoutePoints: makeReverseRoutePoints(curve, normalizedCowStops[0]),
    minimapPoints,
    anchors: normalizedAnchors.map(({ lon, lat, ...anchor }) => anchor),
    cowStops: normalizedCowStops.map(({ lon, lat, fourLaneStartOffset, fourLaneEndOffset, ...stop }) => ({
      ...stop,
      sourceWgs84: [lon, lat],
    })),
    coveredSections,
    environmentZones,
    startFinish: {
      canonicalStartDistance: 0,
      canonicalFinishDistance: round(curve.getLength()),
    },
    checkpoints,
    obstacles,
  };
  trackData.reverseGeneratedLength = round(new THREE.CatmullRomCurve3(trackData.reverseRoutePoints.map((point) => new THREE.Vector3(...point)), false, 'centripetal').getLength());
  const sources = {
    updated: new Date().toISOString().slice(0, 10),
    sources: [
      {
        id: 'openstreetmap-route',
        title: 'OpenStreetMap road network',
        url: 'https://www.openstreetmap.org/copyright',
        author: 'OpenStreetMap contributors',
        license: 'Open Database License 1.0 (ODbL)',
        use: 'Tuen Mun Road route alignment and road context, routed with OSRM',
        modified: 'Simplified, rotated, distance-compressed, and converted to local game coordinates',
        attribution: 'Map data © OpenStreetMap contributors',
      },
      {
        id: 'copernicus-dem',
        title: 'Copernicus DEM GLO-90 elevation through Open-Meteo',
        url: 'https://open-meteo.com/en/docs/elevation-api',
        author: 'European Union, Copernicus programme; Open-Meteo API',
        license: 'Copernicus data terms; Open-Meteo attribution requested',
        use: 'Preliminary elevation character along the route',
        modified: 'Smoothed and vertically compressed; not survey-grade road elevation',
        attribution: 'Elevation data: Copernicus DEM via Open-Meteo',
      },
      {
        id: 'openstreetmap-tuen-mun-road-interchange',
        title: 'Tuen Mun Road Interchange on OpenStreetMap',
        url: 'https://www.openstreetmap.org/way/439181307',
        author: 'OpenStreetMap contributors',
        license: 'Open Database License 1.0 (ODbL)',
        use: 'Cow interchange location and surrounding road context',
        modified: 'Placed on the distance-compressed game route at its source-aligned position',
        attribution: 'Interchange location: OpenStreetMap contributors',
      },
      {
        id: 'wikimedia-tuen-mun-road-interchange-photo',
        title: 'Tuen Mun Road Interchange, Tuen Mun direction (2013)',
        url: 'https://commons.wikimedia.org/wiki/File:Tuen_Mun_Road_Interchange_Tuen_Mun_Direction_201309.jpg',
        author: 'Wing1990hk / Wpcpey',
        license: 'Creative Commons Attribution 3.0 Unported',
        use: 'Visual reference for the green shelters, platforms, lighting and flyover setting',
        modified: 'Recreated as original low-poly procedural geometry; the photograph is not included',
        attribution: 'Reference photo by Wing1990hk / Wpcpey, CC BY 3.0',
      },
    ],
  };

  try {
    const existing = JSON.parse(await readFile(path.join(DATA_DIR, 'sources.json'), 'utf8'));
    const generatedIds = new Set(sources.sources.map((source) => source.id));
    sources.sources.push(...existing.sources.filter((source) => !generatedIds.has(source.id)));
  } catch {
    // A first-time generation has no existing supplemental source manifest.
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'tuen-mun-road.source.geojson'), `${JSON.stringify(geojson, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, 'tuen-mun-road.track.json'), `${JSON.stringify(trackData, null, 2)}\n`);
  await writeFile(path.join(DATA_DIR, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Generated ${points.length} route points, ${curve.getLength().toFixed(1)} game units, from ${sourceCoordinates.length} OSM route points.`);
}

if (process.argv.includes('--reverse-only')) await updateExistingReverseRoute();
else await main();
