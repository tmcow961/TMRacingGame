import * as THREE from 'three';

const mat = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });

function mesh(geometry, material, cast = true) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = cast;
  result.receiveShadow = true;
  return result;
}

function createPlayerMarker() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.font = '800 64px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 13;
  ctx.strokeText('1P', 96, 55);
  ctx.fillStyle = '#16a34a';
  ctx.fillText('1P', 96, 55);

  ctx.beginPath();
  ctx.moveTo(84, 201);
  ctx.lineTo(108, 201);
  ctx.lineTo(96, 224);
  ctx.closePath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = '#16a34a';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  marker.name = 'player-marker';
  marker.position.set(0, 5.25, 0);
  marker.scale.set(1.8, 2.4, 1);
  marker.renderOrder = 20;
  return marker;
}

export function createCow(appearance, isPlayer = false) {
  const root = new THREE.Group();
  const bodyMat = mat(appearance.color);
  const accentMat = mat(appearance.secondary);
  const dark = mat(0x253035);
  const body = mesh(new THREE.SphereGeometry(1.35, 18, 12), bodyMat);
  body.scale.set(1, 0.72, 1.5); body.position.y = 1.45; root.add(body);
  if (appearance.spotted) {
    for (const [x, y, z, s] of [[.65,1.55,.45,.35],[-.7,1.55,-.15,.4],[.25,1.8,-.8,.3]]) {
      const spot = mesh(new THREE.SphereGeometry(s, 10, 7), accentMat); spot.position.set(x,y,z); spot.scale.set(1,.35,1); root.add(spot);
    }
  }
  const head = mesh(new THREE.SphereGeometry(.82, 16, 10), bodyMat); head.scale.set(.92,.82,1.05); head.position.set(0,1.72,1.72); root.add(head);
  const muzzle = mesh(new THREE.SphereGeometry(.5, 14, 8), mat(0xe9b59e)); muzzle.scale.set(1,.62,.65); muzzle.position.set(0,1.5,2.38); root.add(muzzle);
  for (const side of [-1,1]) {
    const ear = mesh(new THREE.SphereGeometry(.27, 10, 7), accentMat); ear.scale.set(1.4,.45,.8); ear.position.set(side*.73,2.02,1.8); ear.rotation.z = side*.35; root.add(ear);
    const horn = mesh(new THREE.ConeGeometry(.13,.43,8), mat(0xf3dca5)); horn.position.set(side*.48,2.38,1.62); horn.rotation.z = side*-.35; root.add(horn);
    const eye = mesh(new THREE.SphereGeometry(.09,8,6), dark); eye.position.set(side*.36,1.94,2.38); root.add(eye);
  }
  const legs = [];
  for (const x of [-.72,.72]) for (const z of [-.82,.82]) {
    const pivot = new THREE.Group(); pivot.position.set(x,1,z); root.add(pivot);
    const leg = mesh(new THREE.CapsuleGeometry(.18,.72,5,8), bodyMat); leg.position.y = -.48; pivot.add(leg);
    const hoof = mesh(new THREE.SphereGeometry(.22,8,6), dark); hoof.scale.set(1,.65,1.2); hoof.position.set(0,-.91,.06); pivot.add(hoof);
    legs.push(pivot);
  }
  const saddle = mesh(new THREE.BoxGeometry(1.35,.16,1.05), mat(isPlayer ? 0xe6b932 : 0x3f7778)); saddle.position.set(0,2.2,-.05); saddle.rotation.x=.08; root.add(saddle);
  const rider = new THREE.Group(); rider.position.set(0,2.28,-.12); root.add(rider);
  const torso = mesh(new THREE.CapsuleGeometry(.28,.62,5,9), mat(isPlayer ? 0xf05b4f : 0x42a6b2)); torso.position.y=.58; rider.add(torso);
  const riderHead = mesh(new THREE.SphereGeometry(.31,12,9), mat(0xd89d75)); riderHead.position.y=1.27; rider.add(riderHead);
  const helmet = mesh(new THREE.SphereGeometry(.35,12,8,0,Math.PI*2,0,Math.PI*.55), mat(0xf2c94c)); helmet.position.y=1.33; rider.add(helmet);
  const backpack = mesh(new THREE.BoxGeometry(.5,.62,.25), mat(0x244b59)); backpack.position.set(0,.62,-.35); rider.add(backpack);
  if (isPlayer) root.add(createPlayerMarker());
  root.userData = { legs, rider, body, phase: Math.random()*Math.PI*2 };
  return root;
}

export function animateCow(cow, time, speed, steer, airborne, braking) {
  const { legs, rider, body, phase } = cow.userData;
  const gait = time * (5 + speed * .24) + phase;
  legs.forEach((leg, i) => { leg.rotation.x = airborne ? -.45 : Math.sin(gait + (i % 2 ? Math.PI : 0)) * Math.min(.7, speed/24); });
  body.position.y = 1.45 + (airborne ? 0 : Math.abs(Math.sin(gait*2))*.07);
  cow.rotation.z = THREE.MathUtils.lerp(cow.rotation.z, -steer*.16, .14);
  rider.rotation.z = THREE.MathUtils.lerp(rider.rotation.z, -steer*.22, .12);
  rider.rotation.x = THREE.MathUtils.lerp(rider.rotation.x, braking ? -.22 : airborne ? -.12 : .04, .12);
}

export function createCar(color = 0xe4554b) {
  const group = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3.2,1.05,5.5), mat(color)); body.position.y=.9; group.add(body);
  const cabin = mesh(new THREE.BoxGeometry(2.65,1.05,2.7), mat(0xb7dce2)); cabin.position.set(0,1.75,-.25); group.add(cabin);
  for (const x of [-1.55,1.55]) for (const z of [-1.7,1.7]) { const wheel=mesh(new THREE.CylinderGeometry(.45,.45,.3,12),mat(0x202426)); wheel.rotation.z=Math.PI/2; wheel.position.set(x,.5,z); group.add(wheel); }
  return group;
}

export function createTaxi() {
  const group = createCar(0xc9362b);
  const roof = mesh(new THREE.BoxGeometry(2.5, .12, 2.45), mat(0xd8d8d2));
  roof.position.set(0, 2.31, -.25); group.add(roof);
  const sign = mesh(new THREE.BoxGeometry(.7, .24, .32), mat(0xf4f0d4));
  sign.position.set(0, 2.52, -.25); group.add(sign);
  return group;
}

export function createDoubleDeckerBus() {
  const group = new THREE.Group();
  const red = mat(0xb51f28);
  const darkRed = mat(0x8e1821);
  const glass = mat(0x9ed1d8, .35);
  const lower = mesh(new THREE.BoxGeometry(3.7, 1.6, 8.8), red); lower.position.y = 1.15; group.add(lower);
  const upper = mesh(new THREE.BoxGeometry(3.55, 2.25, 8.1), darkRed); upper.position.y = 3.05; group.add(upper);
  for (const side of [-1, 1]) {
    for (const z of [-2.85, -.95, .95, 2.85]) {
      const window = mesh(new THREE.BoxGeometry(.08, .75, 1.25), glass, false);
      window.position.set(side * 1.8, 3.15, z); group.add(window);
    }
  }
  const frontWindow = mesh(new THREE.BoxGeometry(2.7, .78, .08), glass, false);
  frontWindow.position.set(0, 3.16, 4.08); group.add(frontWindow);
  for (const x of [-1.35, 1.35]) {
    const wheel = mesh(new THREE.CylinderGeometry(.55, .55, .34, 14), mat(0x202426));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .55, 2.55); group.add(wheel);
    const rearWheel = wheel.clone(); rearWheel.position.z = -2.55; group.add(rearWheel);
  }
  return group;
}

export function makeTextSprite(text, color = '#ffffff', background = '#176854') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.strokeRect(7, 7, 498, 146);
  ctx.fillStyle = color;
  let fontSize = 38;
  do {
    ctx.font = `bold ${fontSize}px Segoe UI, Microsoft JhengHei`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > 472 && fontSize >= 18);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.scale.set(12.8, 4, 1);
  return sprite;
}
