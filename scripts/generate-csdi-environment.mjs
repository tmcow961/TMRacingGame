import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACK_PATH = path.join(ROOT, 'src', 'data', 'tuen-mun-road.track.json');
const SOURCE_PATH = path.join(ROOT, 'src', 'data', 'tuen-mun-road.source.geojson');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'tuen-mun-road.environment.json');
const DTM_WMS = 'https://portal.csdi.gov.hk/server/services/common/landsd_rcd_1638158088368_93806/MapServer/WMSServer';
const BUILDING_QUERY = 'https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637211194312_35158/MapServer/0/query';
const PROFILE_SPACING = 80;
const TERRAIN_OFFSETS = [-520, -250, -90, 0, 90, 220, 420];
const BUILDING_CORRIDOR_METRES = 520;
const BUILDINGS_PER_BUCKET = 18;

const round = (value, places = 3) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function metrePoint([lon, lat], latitude) {
  return {
    x: lon * 111320 * Math.cos(latitude * Math.PI / 180),
    y: lat * 110540,
  };
}

function buildRoute(coordinates) {
  const latitude = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;
  const metres = coordinates.map((coordinate) => metrePoint(coordinate, latitude));
  const distances = [0];
  for (let index = 1; index < metres.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(metres[index].x - metres[index - 1].x, metres[index].y - metres[index - 1].y));
  }
  return { coordinates, metres, distances, length: distances.at(-1), latitude };
}

function routeSample(route, sourceDistance) {
  const target = Math.max(0, Math.min(route.length, sourceDistance));
  let low = 1;
  let high = route.distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (route.distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const index = low;
  const startDistance = route.distances[index - 1];
  const endDistance = route.distances[index];
  const mix = (target - startDistance) / Math.max(.001, endDistance - startDistance);
  const start = route.metres[index - 1];
  const end = route.metres[index];
  const point = {
    x: start.x + (end.x - start.x) * mix,
    y: start.y + (end.y - start.y) * mix,
  };
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const tangent = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const right = { x: tangent.y, y: -tangent.x };
  return { point, tangent, right, index };
}

function coordinateFromMetres(point, latitude) {
  return [
    point.x / (111320 * Math.cos(latitude * Math.PI / 180)),
    point.y / 110540,
  ];
}

function nearestRoute(route, coordinate) {
  const point = metrePoint(coordinate, route.latitude);
  let best = null;
  for (let index = 1; index < route.metres.length; index += 1) {
    const start = route.metres[index - 1];
    const end = route.metres[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const mix = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / Math.max(.001, lengthSquared)));
    const projected = { x: start.x + dx * mix, y: start.y + dy * mix };
    const offset = { x: point.x - projected.x, y: point.y - projected.y };
    const distance = Math.hypot(offset.x, offset.y);
    if (!best || distance < best.distance) {
      const segmentLength = Math.sqrt(lengthSquared) || 1;
      const right = { x: dy / segmentLength, y: -dx / segmentLength };
      best = {
        distance,
        signedDistance: offset.x * right.x + offset.y * right.y,
        sourceDistance: route.distances[index - 1] + segmentLength * mix,
        tangent: { x: dx / segmentLength, y: dy / segmentLength },
        right,
      };
    }
  }
  return best;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

async function fetchJson(url, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'TuenMunCowRacing/1.0 geographic-authoring' } });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = error.status === 403 || error.status === 429 ? attempt * 2000 : attempt * 400;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function fetchElevation([lon, lat]) {
  const longitudeSpan = .00012;
  const latitudeSpan = .00012;
  const parameters = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
    layers: 'Digital_Terrain_Model2183', query_layers: 'Digital_Terrain_Model2183', styles: '',
    crs: 'CRS:84', bbox: `${lon - longitudeSpan},${lat - latitudeSpan},${lon + longitudeSpan},${lat + latitudeSpan}`,
    width: '3', height: '3', i: '1', j: '1', info_format: 'application/geo+json',
  });
  try {
    const result = await fetchJson(`${DTM_WMS}?${parameters}`);
    const raw = result.features?.[0]?.properties?.['Stretch.Pixel Value'];
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

async function fetchTerrain(route, trackLength) {
  const scale = trackLength / route.length;
  const profileCount = Math.ceil(trackLength / PROFILE_SPACING) + 1;
  const requests = [];
  for (let profileIndex = 0; profileIndex < profileCount; profileIndex += 1) {
    const distance = trackLength * profileIndex / (profileCount - 1);
    const sample = routeSample(route, distance / scale);
    for (const offset of TERRAIN_OFFSETS) {
      // The game camera displays positive world lateral on the player's left.
      const sourceOffsetMetres = -offset / scale;
      const point = {
        x: sample.point.x + sample.right.x * sourceOffsetMetres,
        y: sample.point.y + sample.right.y * sourceOffsetMetres,
      };
      requests.push({ profileIndex, distance, offset, coordinate: coordinateFromMetres(point, route.latitude) });
    }
  }
  const elevations = await runPool(requests, 18, async (request, index) => {
    if (index % 70 === 0) console.log(`Terrain samples ${index}/${requests.length}`);
    return { ...request, elevation: await fetchElevation(request.coordinate) };
  });
  const profiles = Array.from({ length: profileCount }, (_, profileIndex) => ({
    distance: trackLength * profileIndex / (profileCount - 1),
    raw: TERRAIN_OFFSETS.map((offset) => elevations.find((sample) => sample.profileIndex === profileIndex && sample.offset === offset)?.elevation ?? null),
  }));
  return { scale, profiles };
}

function smooth(values, passes = 2) {
  let result = [...values];
  for (let pass = 0; pass < passes; pass += 1) {
    result = result.map((value, index) => index === 0 || index === result.length - 1
      ? value
      : result[index - 1] * .2 + value * .6 + result[index + 1] * .2);
  }
  return result;
}

function fillMissing(values) {
  const result = [...values];
  for (let index = 0; index < result.length; index += 1) {
    if (result[index] !== null) continue;
    let before = index - 1;
    let after = index + 1;
    while (before >= 0 && result[before] === null) before -= 1;
    while (after < result.length && result[after] === null) after += 1;
    if (before >= 0 && after < result.length) result[index] = result[before] + (result[after] - result[before]) * (index - before) / (after - before);
    else if (before >= 0) result[index] = result[before];
    else if (after < result.length) result[index] = result[after];
    else result[index] = 0;
  }
  return result;
}

function normalizeTerrain(rawProfiles, scale) {
  const roadRaw = smooth(fillMissing(rawProfiles.map((profile) => profile.raw[TERRAIN_OFFSETS.indexOf(0)])), 2);
  const roadMinimum = Math.min(...roadRaw);
  const roadHeights = roadRaw.map((elevation) => 6 + (elevation - roadMinimum) * scale);
  for (let index = 1; index < roadHeights.length; index += 1) {
    const spacing = rawProfiles[index].distance - rawProfiles[index - 1].distance;
    const maximumChange = spacing * .06;
    roadHeights[index] = Math.max(roadHeights[index - 1] - maximumChange, Math.min(roadHeights[index - 1] + maximumChange, roadHeights[index]));
  }
  for (let index = roadHeights.length - 2; index >= 0; index -= 1) {
    const spacing = rawProfiles[index + 1].distance - rawProfiles[index].distance;
    const maximumChange = spacing * .06;
    roadHeights[index] = Math.max(roadHeights[index + 1] - maximumChange, Math.min(roadHeights[index + 1] + maximumChange, roadHeights[index]));
  }
  const seaLevel = 6 - roadMinimum * scale;
  const profiles = rawProfiles.map((profile, profileIndex) => ({
    distance: round(profile.distance),
    elevations: profile.raw.map((value, offsetIndex) => {
      if (TERRAIN_OFFSETS[offsetIndex] === 0) return round(roadHeights[profileIndex]);
      return value === null || value <= 0 ? null : round(6 + (value - roadMinimum) * scale);
    }),
  }));
  return {
    seaLevel: round(seaLevel),
    roadElevationSamples: rawProfiles.map((profile, index) => ({ distance: round(profile.distance), height: round(roadHeights[index]) })),
    terrainProfiles: { sourceId: 'csdi-dtm-5m', offsets: TERRAIN_OFFSETS, profiles },
    sourceRoadElevations: roadRaw,
    roadMinimum,
  };
}

async function fetchBuildingWindows(route) {
  const windows = [];
  const windowSize = 34;
  const bufferLon = BUILDING_CORRIDOR_METRES / (111320 * Math.cos(route.latitude * Math.PI / 180));
  const bufferLat = BUILDING_CORRIDOR_METRES / 110540;
  for (let start = 0; start < route.coordinates.length - 1; start += windowSize - 1) {
    const coordinates = route.coordinates.slice(start, Math.min(route.coordinates.length, start + windowSize));
    windows.push({
      minLon: Math.min(...coordinates.map((point) => point[0])) - bufferLon,
      maxLon: Math.max(...coordinates.map((point) => point[0])) + bufferLon,
      minLat: Math.min(...coordinates.map((point) => point[1])) - bufferLat,
      maxLat: Math.max(...coordinates.map((point) => point[1])) + bufferLat,
    });
  }
  const collections = await runPool(windows, 2, async (window, index) => {
    console.log(`Building windows ${index + 1}/${windows.length}`);
    const parameters = new URLSearchParams({
      where: '1=1', geometry: `${window.minLon},${window.minLat},${window.maxLon},${window.maxLat}`,
      geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'OBJECTID,BuildingNameEN,BuildingNameTC,BaseHeight,TopHeight,Storeys,BuildingBlockType',
      returnGeometry: 'true', outSR: '4326', f: 'geojson', resultRecordCount: '3000',
    });
    return fetchJson(`${BUILDING_QUERY}?${parameters}`);
  });
  const features = new Map();
  for (const collection of collections) {
    for (const feature of collection.features ?? []) features.set(feature.properties.OBJECTID, feature);
  }
  return [...features.values()];
}

function polygonCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
}

function interpolateRoadHeight(samples, distance) {
  const index = Math.min(samples.length - 2, Math.max(0, Math.floor(distance / (samples.at(-1).distance / (samples.length - 1)))));
  const start = samples[index];
  const end = samples[index + 1];
  const mix = (distance - start.distance) / Math.max(.001, end.distance - start.distance);
  return start.height + (end.height - start.height) * Math.max(0, Math.min(1, mix));
}

function clearedBuildingLateral(lateral, width, depth) {
  const footprintRadius = Math.hypot(width / 2, depth / 2);
  const minimumPositive = 35 + footprintRadius;
  const minimumNegative = 190 + footprintRadius;
  return lateral >= 0
    ? Math.max(minimumPositive, lateral)
    : Math.min(-minimumNegative, lateral);
}

function normalizeBuildings(features, route, trackLength, terrain) {
  const scale = trackLength / route.length;
  const buildings = [];
  for (const feature of features) {
    const coordinates = polygonCoordinates(feature.geometry);
    if (coordinates.length < 3) continue;
    const centroid = coordinates.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]).map((value) => value / coordinates.length);
    const nearest = nearestRoute(route, centroid);
    if (!nearest || nearest.distance > BUILDING_CORRIDOR_METRES) continue;
    const projected = coordinates.map((coordinate) => metrePoint(coordinate, route.latitude)).map((point) => ({
      tangent: point.x * nearest.tangent.x + point.y * nearest.tangent.y,
      lateral: point.x * nearest.right.x + point.y * nearest.right.y,
    }));
    const widthMetres = Math.max(...projected.map((point) => point.lateral)) - Math.min(...projected.map((point) => point.lateral));
    const depthMetres = Math.max(...projected.map((point) => point.tangent)) - Math.min(...projected.map((point) => point.tangent));
    const properties = feature.properties;
    const rawHeight = Number(properties.TopHeight) - Number(properties.BaseHeight);
    const inferredHeight = Number(properties.Storeys) > 0 ? Number(properties.Storeys) * 3.2 : 8;
    const heightMetres = Number.isFinite(rawHeight) && rawHeight > 2 ? rawHeight : inferredHeight;
    const distance = nearest.sourceDistance * scale;
    const width = Math.max(4.5, Math.min(24, widthMetres * scale));
    const depth = Math.max(4.5, Math.min(28, depthMetres * scale));
    const height = Math.max(4, Math.min(76, heightMetres * scale));
    const lateral = clearedBuildingLateral(-nearest.signedDistance * scale, width, depth);
    const sourceBase = Number(properties.BaseHeight);
    const roadHeight = interpolateRoadHeight(terrain.roadElevationSamples, distance);
    const baseHeight = Number.isFinite(sourceBase)
      ? 6 + (sourceBase - terrain.roadMinimum) * scale
      : roadHeight;
    const name = properties.BuildingNameEN || properties.BuildingNameTC || null;
    const category = height >= 28 ? 'tower' : height >= 14 ? 'midrise' : 'lowrise';
    buildings.push({
      id: `csdi-building-${properties.OBJECTID}`,
      sourceId: 'csdi-building',
      distance: round(distance), lateral: round(lateral), width: round(width), depth: round(depth),
      height: round(height), baseHeight: round(Math.max(terrain.seaLevel, baseHeight)), category,
      name, blockType: properties.BuildingBlockType || null,
      score: height * 2.2 - nearest.distance * .025 + (name ? 22 : 0),
    });
  }
  const bucketSize = 300;
  const buckets = new Map();
  for (const building of buildings) {
    const key = Math.floor(building.distance / bucketSize);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(building);
  }
  return [...buckets.values()].flatMap((bucket) => bucket
    .sort((left, right) => right.score - left.score)
    .slice(0, BUILDINGS_PER_BUCKET))
    .sort((left, right) => left.distance - right.distance)
    .map(({ score, ...building }) => building);
}

function structures(track) {
  const anchor = (id) => track.anchors.find((entry) => entry.id === id).distance;
  return [
    { id: 'tuen-mun-approach-flyover', type: 'viaduct', startDistance: 80, endDistance: 360, sourceId: 'csdi-3d-nontextured' },
    { id: 'tai-lam-chung-bridge-deck', type: 'viaduct', startDistance: anchor('tai-lam-chung') - 115, endDistance: anchor('tai-lam-chung') + 145, sourceId: 'csdi-3d-nontextured' },
    { id: 'sham-tseng-cut-slope', type: 'cut-slope', startDistance: anchor('tsing-lung-tau') + 80, endDistance: anchor('sham-tseng') + 190, side: 1, sourceId: 'csdi-dtm-5m' },
    { id: 'ting-kau-bridge-view', type: 'bridge-view', startDistance: anchor('ting-kau') - 180, endDistance: anchor('ting-kau') + 210, side: -1, sourceId: 'csdi-3d-nontextured' },
    { id: 'yau-kom-tau-elevated-road', type: 'viaduct', startDistance: anchor('yau-kom-tau') - 170, endDistance: anchor('yau-kom-tau') + 230, sourceId: 'csdi-3d-nontextured' },
    { id: 'tsuen-wan-retaining-wall', type: 'retaining-wall', startDistance: anchor('yau-kom-tau') + 210, endDistance: track.targetLength - 120, side: 1, sourceId: 'csdi-dtm-5m' },
  ].map((entry) => ({ ...entry, startDistance: round(Math.max(0, entry.startDistance)), endDistance: round(Math.min(track.targetLength, entry.endDistance)) }));
}

async function main() {
  const track = JSON.parse(await readFile(TRACK_PATH, 'utf8'));
  const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
  const route = buildRoute(source.features[0].geometry.coordinates);
  const terrainRaw = await fetchTerrain(route, track.targetLength);
  const terrain = normalizeTerrain(terrainRaw.profiles, terrainRaw.scale);
  const buildingFeatures = await fetchBuildingWindows(route);
  const buildings = normalizeBuildings(buildingFeatures, route, track.targetLength, terrain);
  const output = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    coordinateSystem: 'Source data EPSG:4326; normalized placements use canonical route distance and lateral game units',
    lateralOrientation: 'visual-left-positive',
    compressionScale: round(terrainRaw.scale, 6),
    sources: ['csdi-dtm-5m', 'csdi-building', 'csdi-3d-nontextured', 'csdi-3d-individualised', 'openstreetmap-route'],
    seaLevel: terrain.seaLevel,
    roadElevationSourceId: 'csdi-dtm-5m',
    roadElevationSamples: terrain.roadElevationSamples,
    terrainProfiles: terrain.terrainProfiles,
    coastlineSegments: track.environmentZones.filter((zone) => zone.type.includes('coast') || zone.type === 'bridge-view').map((zone) => ({
      id: `${zone.id}-coastline`, startDistance: zone.startDistance, endDistance: zone.endDistance, side: zone.seaSide, sourceId: 'csdi-3d-individualised',
    })),
    structures: structures(track),
    buildingSourceId: 'csdi-building',
    buildings,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated ${output.roadElevationSamples.length} road elevations, ${output.terrainProfiles.profiles.length} terrain profiles and ${buildings.length} buildings.`);
}

async function reclampExisting() {
  const environment = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  const samples = environment.roadElevationSamples;
  for (let index = 1; index < samples.length; index += 1) {
    const maximumChange = (samples[index].distance - samples[index - 1].distance) * .06;
    samples[index].height = Math.max(samples[index - 1].height - maximumChange, Math.min(samples[index - 1].height + maximumChange, samples[index].height));
  }
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const maximumChange = (samples[index + 1].distance - samples[index].distance) * .06;
    samples[index].height = round(Math.max(samples[index + 1].height - maximumChange, Math.min(samples[index + 1].height + maximumChange, samples[index].height)));
  }
  const centreIndex = environment.terrainProfiles.offsets.indexOf(0);
  environment.terrainProfiles.profiles.forEach((profile, index) => {
    profile.elevations[centreIndex] = samples[index].height;
  });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(environment, null, 2)}\n`);
  console.log(`Reclamped ${samples.length} road elevations for spline-safe grades.`);
}

function interpolateTerrainOffset(offsets, elevations, target) {
  const clamped = Math.max(offsets[0], Math.min(offsets.at(-1), target));
  let index = 1;
  while (index < offsets.length - 1 && offsets[index] < clamped) index += 1;
  const startOffset = offsets[index - 1];
  const endOffset = offsets[index];
  const startHeight = elevations[index - 1];
  const endHeight = elevations[index];
  if (startHeight === null && endHeight === null) return null;
  if (startHeight === null) return endHeight;
  if (endHeight === null) return startHeight;
  return startHeight + (endHeight - startHeight) * (clamped - startOffset) / Math.max(.001, endOffset - startOffset);
}

async function reorientExisting() {
  const environment = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  if (environment.lateralOrientation === 'visual-left-positive') {
    console.log('Environment lateral orientation is already current.');
    return;
  }
  const offsets = environment.terrainProfiles.offsets;
  for (const profile of environment.terrainProfiles.profiles) {
    const sourceElevations = [...profile.elevations];
    profile.elevations = offsets.map((offset) => {
      const height = interpolateTerrainOffset(offsets, sourceElevations, -offset);
      return height === null ? null : round(height);
    });
  }
  environment.buildings = environment.buildings.map((building) => ({
    ...building,
    lateral: round(clearedBuildingLateral(-building.lateral, building.width, building.depth)),
  }));
  environment.lateralOrientation = 'visual-left-positive';
  await writeFile(OUTPUT_PATH, `${JSON.stringify(environment, null, 2)}\n`);
  console.log(`Reoriented ${environment.terrainProfiles.profiles.length} terrain profiles and ${environment.buildings.length} buildings.`);
}

async function reclearExistingBuildings() {
  const environment = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  environment.buildings = environment.buildings.map((building) => ({
    ...building,
    lateral: round(clearedBuildingLateral(building.lateral, building.width, building.depth)),
  }));
  await writeFile(OUTPUT_PATH, `${JSON.stringify(environment, null, 2)}\n`);
  console.log(`Recleared ${environment.buildings.length} buildings for both carriageways.`);
}

if (process.argv.includes('--reclear')) await reclearExistingBuildings();
else if (process.argv.includes('--reorient')) await reorientExisting();
else if (process.argv.includes('--reclamp')) await reclampExisting();
else await main();
