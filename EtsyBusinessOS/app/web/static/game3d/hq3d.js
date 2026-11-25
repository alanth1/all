// NEONLOOM HQ 3D prototype - one tower, two levels, real 3D furniture, rigged NPCs, lift, A* walking.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from './vendor/jsm/utils/SkeletonUtils.js';

const Q = new URLSearchParams(location.search);
const AGENTS = (window.AGENTS_META || []).filter(a => ['KAI-07', 'RAZE-11', 'ZERO-1', 'SABLE-6'].includes(a.name));
const PIX = Q.has('nopix') ? 1 : 2;              // pixel-art downscale factor (P toggles)
const W = 12, D = 10, H = 5.2;                   // tower footprint (x along right wall, z along left wall), floor height
const MEZZ = 4.2;                                // upper level depth (L-shaped mezzanine)
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ renderer / camera
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.7;
host.appendChild(renderer.domElement);
renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07061a); scene.fog = new THREE.Fog(0x07061a, 60, 140);
let pix = PIX;
const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
cam.position.set(30, 26, 30); cam.lookAt(W / 2, H * .95, D / 2);
let zoom = 1.75;
function resize() {
  const w = host.clientWidth, h = host.clientHeight; renderer.setPixelRatio(1); renderer.setSize(Math.round(w / pix), Math.round(h / pix), false);
  const view = 13.5 / zoom, a = w / h; cam.left = -view * a; cam.right = view * a; cam.top = view; cam.bottom = -view; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'P') { pix = pix === 1 ? 2 : 1; resize(); } if (e.key === 'Escape') closePanel(); });
host.addEventListener('wheel', e => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? .9 : 1.1), .7, 4); resize(); });
let drag = null;
host.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false, p: cam.position.clone() }; });
addEventListener('pointerup', e => { if (drag && !drag.moved) onClick(e); drag = null; });
addEventListener('pointermove', e => {
  if (!drag || !(e.buttons & 1)) return;
  const dx = (e.clientX - drag.x), dy = (e.clientY - drag.y); if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  const s = (cam.top - cam.bottom) / host.clientHeight, right = new THREE.Vector3(1, 0, -1).normalize(), up = new THREE.Vector3(-1, 2, -1).normalize();
  cam.position.copy(drag.p).addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
});

// ------------------------------------------------------------------ materials & helpers
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, metalness: .1, ...o });
const mats = {
  wall: M(0x2a2a52), wallR: M(0x252f5c), floor: M(0x4a5a8a, { roughness: .35, metalness: .2 }), slab: M(0x1b1a38), trim: M(0x0d0c1f),
  desk: M(0x3d3762), deskTop: M(0x5a5288), metal: M(0x6b7280, { metalness: .6, roughness: .4 }), dark: M(0x15142a), wood: M(0x6b4a34),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: .18, roughness: .05, metalness: 0, depthWrite: false }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x67e8f9 }), purple: new THREE.MeshBasicMaterial({ color: 0xc084fc }), pink: new THREE.MeshBasicMaterial({ color: 0xf472b6 }),
};
function box(w, h, d, mat, x, y, z, parent = scene, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.userData.canvas = c; return t; }

// ------------------------------------------------------------------ lights
scene.add(new THREE.HemisphereLight(0xa8b8ff, 0x2a1840, 1.1));
const key = new THREE.DirectionalLight(0xb8c8ff, .9); key.position.set(18, 30, 10); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 }); key.target.position.set(W / 2, 0, D / 2); scene.add(key, key.target);
for (const [x, y, z, c] of [[3, H - .4, 3, 0x67e8f9], [9, H - .4, 2, 0xc084fc], [3, 2 * H - .4, 2, 0x67e8f9], [8, 2 * H - .4, 2, 0xc084fc], [8, H - .4, 7, 0x22d3ee]]) {
  const l = new THREE.PointLight(c, 40, 12, 1.4); l.position.set(x, y, z); scene.add(l);
}

// ------------------------------------------------------------------ city backdrop (animated canvas behind the windows)
const city = canvasTex(512, 256, () => {}); const cars = [];
function drawCity(t) {
  const c = city.userData.canvas, g = c.getContext('2d'); const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, '#05040f'); sky.addColorStop(1, '#2a1650');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
  let s = 7; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (const [col, lit, base] of [['#16153a', .15, 80], ['#0c0b24', .3, 40]]) for (let x = 0; x < 512;) {
    const bw = 14 + R() * 30, bh = base + R() * 150; g.fillStyle = col; g.fillRect(x, 256 - bh, bw, bh);
    for (let wy = 256 - bh + 4; wy < 252; wy += 6) for (let wx = x + 2; wx < x + bw - 2; wx += 5) if (R() < lit) { g.fillStyle = ['#fde68a', '#67e8f9', '#f9a8d4'][Math.floor(R() * 3)]; g.fillRect(wx, wy, 2, 3); }
    x += bw + 2;
  }
  if (cars.length < 6 && Math.random() < .05) cars.push({ x: Math.random() < .5 ? -20 : 530, y: rnd(30, 170), v: rnd(30, 70) * (Math.random() < .5 ? 1 : -1), c: pick(['#f472b6', '#22d3ee', '#facc15']) });
  for (const k of cars) { k.x += k.v / 30; g.fillStyle = '#0b0b16'; g.fillRect(k.x, k.y, 14, 4); g.fillStyle = k.c; g.fillRect(k.x, k.y + 4, 14, 1); g.fillStyle = '#fff7c2'; g.fillRect(k.v > 0 ? k.x + 13 : k.x, k.y + 1, 2, 2); }
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].x < -40 || cars[i].x > 560) cars.splice(i, 1);
  city.needsUpdate = true;
}
const cityMat = new THREE.MeshBasicMaterial({ map: city });
const backR = new THREE.Mesh(new THREE.PlaneGeometry(26, 2 * H + 4), cityMat); backR.position.set(W / 2, H, -1.5); scene.add(backR);
const backL = new THREE.Mesh(new THREE.PlaneGeometry(26, 2 * H + 4), cityMat); backL.rotation.y = Math.PI / 2; backL.position.set(-1.5, H, D / 2); scene.add(backL);

// ------------------------------------------------------------------ building shell
const T = .3;
box(W + T, .4, D + T, mats.slab, W / 2 - T / 2, -.4, D / 2 - T / 2);                       // ground slab
box(W, .05, D, mats.floor, W / 2, 0, D / 2, scene, false);                                   // lower floor
// upper mezzanine (L-shaped): strip along right wall + strip along left wall
box(W, .35, MEZZ, mats.slab, W / 2, H - .35, MEZZ / 2); box(MEZZ, .35, D - MEZZ, mats.slab, MEZZ / 2, H - .35, MEZZ + (D - MEZZ) / 2);
box(W, .05, MEZZ, mats.floor, W / 2, H, MEZZ / 2, scene, false); box(MEZZ, .05, D - MEZZ, mats.floor, MEZZ / 2, H, MEZZ + (D - MEZZ) / 2, scene, false);
// glass railing along the mezzanine front edges
for (const [w, d, x, z] of [[W - MEZZ, .06, MEZZ + (W - MEZZ) / 2, MEZZ], [.06, D - MEZZ, MEZZ, MEZZ + (D - MEZZ) / 2], [MEZZ, .06, MEZZ / 2, D]]) {
  box(w, .9, d, mats.glass, x, H, z, scene, false); box(w + .02, .06, d + .02, mats.cyan, x, H + .9, z, scene, false);
}
// back walls with window bands (frames + transparent openings)
function wall(alongX) {
  const len = alongX ? W : D;
  for (const [y0, y1] of [[0, H], [H, 2 * H]]) {
    const g = new THREE.Group(); scene.add(g);
    box(alongX ? len : T, .9, alongX ? T : len, alongX ? mats.wallR : mats.wall, alongX ? len / 2 : -T / 2, y0, alongX ? -T / 2 : len / 2, g);
    box(alongX ? len : T, .7, alongX ? T : len, alongX ? mats.wallR : mats.wall, alongX ? len / 2 : -T / 2, y1 - .7, alongX ? -T / 2 : len / 2, g);
    for (let k = 0; k <= len; k += 2) box(alongX ? .12 : T, y1 - y0 - 1.6, alongX ? T : .12, mats.trim, alongX ? k : -T / 2, y0 + .9, alongX ? -T / 2 : k, g);
    box(alongX ? len : T, .08, alongX ? T : len, mats.trim, alongX ? len / 2 : -T / 2, (y0 + y1) / 2 + .2, alongX ? -T / 2 : len / 2, g);
    const neon = box(alongX ? len - .4 : .08, .08, alongX ? .08 : len - .4, alongX ? mats.cyan : mats.purple, alongX ? len / 2 : .05, y1 - .35, alongX ? .05 : len / 2, g, false);
  }
}
wall(true); wall(false);
box(T * 1.4, 2 * H + .5, T * 1.4, mats.trim, -T / 2, 0, -T / 2);                               // corner pillar
box(W + T, .5, T, mats.trim, W / 2 - T / 2, 2 * H, -T / 2); box(T, .5, D + T, mats.trim, -T / 2, 2 * H, D / 2 - T / 2);

// ------------------------------------------------------------------ furniture library
const screens = [], leds = [];
function monitor(parent, x, y, z, rotY, w = .9) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g);
  box(.06, .5, w, mats.dark, 0, .12, 0, g); box(.08, .12, .08, mats.metal, .05, 0, 0, g);
  const tex = canvasTex(64, 36, (ctx) => { ctx.fillStyle = '#08142a'; ctx.fillRect(0, 0, 64, 36); });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w * .92, .44), new THREE.MeshBasicMaterial({ map: tex })); scr.rotation.y = Math.PI / 2; scr.position.set(.035, .37, 0); g.add(scr);
  screens.push({ tex, owner: parent.userData.owner }); return g;
}
function desk(x, y, z, rotY, owner, n = 3) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; g.userData.owner = owner; scene.add(g);
  box(.9, .06, 2.6, mats.deskTop, 0, .72, 0, g); for (const [a, b] of [[-.38, -1.2], [.38, -1.2], [-.38, 1.2], [.38, 1.2]]) box(.06, .72, .06, mats.metal, a, 0, b, g);
  for (let i = 0; i < n; i++) monitor(g, -.25, .78, (i - (n - 1) / 2) * .82, 0, .78);
  box(.18, .03, .9, mats.dark, .15, .78, 0, g, false);                                       // keyboard
  box(.12, .14, .12, M(0xf472b6), .25, .78, 1, g); box(.3, .5, .3, mats.dark, -.2, 0, -.9, g);  // mug + PC tower
  const led = new THREE.Mesh(new THREE.BoxGeometry(.02, .3, .02), mats.cyan); led.position.set(-.04, .3, -.9); g.add(led);
  return g;
}
function chair(x, y, z, rotY, color = 0x334155) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g);
  box(.55, .08, .55, M(color), 0, .45, 0, g); box(.08, .7, .55, M(color), .26, .5, 0, g); box(.06, .4, .06, mats.metal, 0, .05, 0, g);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; box(.05, .05, .3, mats.metal, Math.cos(a) * .15, .02, Math.sin(a) * .15, g, false).rotation.y = -a; }
  return g;
}
function rack(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); box(.9, 2.3, .9, mats.dark, 0, 0, 0, g);
  for (let r = 0; r < 10; r++) for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.05, .04, .02), new THREE.MeshBasicMaterial({ color: pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6]) })); l.position.set(-.3 + k * .12, .2 + r * .2, .46); g.add(l); leds.push(l); }
  return g;
}
const shelf = (x, y, z, rotY) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g); box(.4, 2, 1.6, mats.wood, 0, 0, 0, g); for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) box(.3, .35, .18, M(pick([0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7])), .02, .15 + r * .48, -.6 + k * .24, g); return g; };
const cabinet = (x, y, z) => { const g = box(.8, 1.4, .7, M(0x64748b, { metalness: .4 }), x, y, z); for (let r = 0; r < 3; r++) box(.5, .03, .02, mats.dark, x, y + .3 + r * .4, z + .36, scene, false); return g; };
const plant = (x, y, z) => { box(.4, .4, .4, M(0x7c2d12), x, y, z); for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.12, .8, 4), M(0x16a34a)); l.position.set(x + rnd(-.15, .15), y + .75, z + rnd(-.15, .15)); l.rotation.set(rnd(-.5, .5), 0, rnd(-.5, .5)); l.castShadow = true; scene.add(l); } };
const holo = (x, y, z) => { box(1.4, .5, 1.4, mats.dark, x, y, z); const r = new THREE.Mesh(new THREE.TorusGeometry(.5, .03, 6, 24), mats.cyan); r.rotation.x = Math.PI / 2; r.position.set(x, y + .9, z); scene.add(r); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.35, 1), new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true })); s.position.set(x, y + 1.2, z); scene.add(s); spinners.push(s, r); };
const spinners = [];
const whiteboard = (x, y, z) => { box(.08, 1.2, 2, M(0xe5e7eb), x, y + .9, z); const t = canvasTex(64, 40, g => { g.fillStyle = '#e5e7eb'; g.fillRect(0, 0, 64, 40); g.strokeStyle = '#22c55e'; g.beginPath(); g.moveTo(4, 32); g.lineTo(20, 20); g.lineTo(34, 26); g.lineTo(58, 8); g.stroke(); g.fillStyle = '#f472b6'; g.fillRect(8, 6, 8, 6); g.fillStyle = '#facc15'; g.fillRect(40, 30, 8, 6); }); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshBasicMaterial({ map: t })); p.rotation.y = Math.PI / 2; p.position.set(x + .05, y + 1.5, z); scene.add(p); };
const crate = (x, y, z) => { box(.6, .45, .6, M(0xb45309), x, y, z); box(.45, .35, .45, M(0xd97706), x + .05, y + .45, z); };
const beanbag = (x, y, z, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 8), M(c, { roughness: .9 })); m.scale.set(1, .6, 1); m.position.set(x, y + .3, z); m.castShadow = true; scene.add(m); };

// ------------------------------------------------------------------ layout (matches the walkway plan: tall things on back walls, desks along walls)
const blocked = { l: [], u: [] };   // footprints [x0,z0,x1,z1]
const block = (lv, x0, z0, x1, z1) => blocked[lv].push([x0, z0, x1, z1]);
const SEATS = {};
// UPPER - Command Deck (left strip) + Research Lab (right strip)
desk(.6, H, 6.4, 0, 'KAI-07'); chair(1.6, H, 6.4, 0); block('u', 0, 5, 1.1, 7.8); SEATS['KAI-07'] = { lv: 'u', x: 1.55, z: 6.4, ry: -Math.PI / 2 };
holo(2.2, H, 9.1); block('u', 1.4, 8.3, 3, 9.9); shelf(.3, H, 2.2, 0); block('u', 0, 1.3, .6, 3.1); plant(.5, H, 9.4); block('u', .2, 9.1, .8, 9.7);
desk(6.2, H, .6, -Math.PI / 2, 'RAZE-11'); chair(6.2, H, 1.6, -Math.PI / 2, 0x14532d); block('u', 4.8, 0, 7.6, 1.1); SEATS['RAZE-11'] = { lv: 'u', x: 6.2, z: 1.55, ry: Math.PI };
whiteboard(3.6, H, .2); block('u', 2.6, 0, 4.6, .4); crate(8.4, H, .5); block('u', 8, .1, 8.8, .9);
// LOWER - Server Room (left) + Archive (right)
for (let k = 0; k < 4; k++) { rack(.55, 0, 1 + k * 1); } block('l', 0, .4, 1.1, 4.5);
desk(.6, 0, 6.6, 0, 'ZERO-1'); chair(1.6, 0, 6.6, 0, 0x7c2d12); block('l', 0, 5.2, 1.1, 8); SEATS['ZERO-1'] = { lv: 'l', x: 1.55, z: 6.6, ry: -Math.PI / 2 };
box(.6, .3, .4, M(0xb91c1c), 2.4, 0, 9.4); block('l', 2, 9.1, 2.8, 9.7); plant(.5, 0, 9.4); block('l', .2, 9.1, .8, 9.7);
for (let k = 0; k < 3; k++) cabinet(2.6 + k * .9, 0, .45); block('l', 2.1, 0, 4.9, .9);
desk(6.6, 0, .6, -Math.PI / 2, 'SABLE-6'); chair(6.6, 0, 1.6, -Math.PI / 2, 0x78350f); block('l', 5.2, 0, 8, 1.1); SEATS['SABLE-6'] = { lv: 'l', x: 6.6, z: 1.55, ry: Math.PI };
crate(9.8, 0, 9.2); crate(10.6, 0, 9.3); block('l', 9.3, 8.8, 11, 9.8);
beanbag(5.4, 0, 8.6, 0x2563eb); beanbag(6.6, 0, 9.1, 0x9333ea); block('l', 4.8, 8, 7.2, 9.7);

// extra clutter
const prop = (lv, x, z, f) => { f(x, lv === 'u' ? H : 0, z); };
for (const [lv, x, z] of [['u', 3.2, .5], ['u', 9.3, 3.4], ['l', 4.6, 3.3], ['l', 8.8, 3.3], ['u', .5, 4.4]]) prop(lv, x, z, plant);
box(.5, .05, .4, M(0xe5e7eb), .7, H + .78, 7.3, scene, false); box(.5, .05, .4, M(0xe5e7eb), 6.9, .78, .7, scene, false);   // paper stacks
box(.25, .2, .25, M(0xfacc15), 5.4, H + .78, .7); box(.2, .14, .2, M(0xef4444), 1.0, .78, 5.7);                             // noodle bowl / cans
crate(4.2, 0, 1.5); block('l', 3.8, 1.1, 4.6, 1.9);
const tv = canvasTex(64, 36, g => { g.fillStyle = '#071226'; g.fillRect(0, 0, 64, 36); g.strokeStyle = '#22d3ee'; g.beginPath(); g.moveTo(4, 30); for (let i = 0; i < 8; i++) g.lineTo(6 + i * 7, 30 - Math.random() * 24); g.stroke(); });
for (const [x, y] of [[-.1, H + 2.2], [-.1, 2.4]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ map: tv })); m.rotation.y = Math.PI / 2; m.position.set(.02, y, 3.2); scene.add(m); }
const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(6, .03, 8.6); rug.receiveShadow = true; scene.add(rug);

// ------------------------------------------------------------------ lift (back-right corner, both levels)
const LIFT = { x: 11, z: 1, w: 1.8 };
for (const [x, z] of [[LIFT.x - .9, LIFT.z - .9], [LIFT.x + .9, LIFT.z - .9], [LIFT.x - .9, LIFT.z + .9], [LIFT.x + .9, LIFT.z + .9]]) box(.08, 2 * H, .08, mats.trim, x, 0, z, scene, false);
const shaft = box(LIFT.w, 2 * H, LIFT.w, mats.glass, LIFT.x, 0, LIFT.z, scene, false);
const cabin = new THREE.Group(); scene.add(cabin); cabin.position.set(LIFT.x, 0, LIFT.z);
box(1.7, .1, 1.7, mats.metal, 0, 0, 0, cabin); box(1.7, .06, 1.7, mats.cyan, 0, 2.3, 0, cabin, false);
const cabLight = new THREE.PointLight(0x67e8f9, 6, 4); cabLight.position.set(0, 2, 0); cabin.add(cabLight);
block('l', 10, 0, W, 2); block('u', 10, 0, W, 2);
cabin.userData = { y: 0, busy: false };

// ------------------------------------------------------------------ navigation (0.25 grid, A*)
const STEP = .25, NX = W / STEP + 1, NZ = D / STEP + 1;
const walk = (lv, x, z) => {
  if (x < .15 || z < .15 || x > W - .15 || z > D - .15) return false;
  if (lv === 'u' && !(z <= MEZZ - .2 || x <= MEZZ - .2)) return false;
  for (const [a, b, c, d] of blocked[lv]) if (x > a - .2 && x < c + .2 && z > b - .2 && z < d + .2) return false;
  return true;
};
const grid = {}; for (const lv of ['l', 'u']) { grid[lv] = new Uint8Array(NX * NZ); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) grid[lv][i * NZ + j] = walk(lv, i * STEP, j * STEP) ? 1 : 0; }
const open = (lv, x, z) => { const i = Math.round(x / STEP), j = Math.round(z / STEP); grid[lv][i * NZ + j] = 1; };
const LIFT_DOOR = { x: LIFT.x - .2, z: LIFT.z + 1.4 };
open('l', LIFT_DOOR.x, LIFT_DOOR.z); open('u', LIFT_DOOR.x, LIFT_DOOR.z);
for (const s of Object.values(SEATS)) open(s.lv, s.x, s.z);
function nearest(lv, x, z) { let b = null, bd = 1e9; for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (grid[lv][i * NZ + j]) { const d = (i * STEP - x) ** 2 + (j * STEP - z) ** 2; if (d < bd) { bd = d; b = [i, j]; } } return b; }
function astar(lv, x0, z0, x1, z1) {
  const g = grid[lv], s = nearest(lv, x0, z0), e = nearest(lv, x1, z1); if (!s || !e) return [];
  const K = (i, j) => i * NZ + j, open_ = [[0, 0, ...s]], came = new Map(), cost = new Map([[K(...s), 0]]);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (open_.length) {
    open_.sort((a, b) => a[0] - b[0]); const [, c, i, j] = open_.shift(); if (i === e[0] && j === e[1]) break;
    for (const [di, dj, w] of dirs) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || !g[K(ni, nj)]) continue; if (di && dj && (!g[K(i + di, j)] || !g[K(i, j + dj)])) continue;
      const nc = c + w; if (nc < (cost.get(K(ni, nj)) ?? 1e9)) { cost.set(K(ni, nj), nc); came.set(K(ni, nj), [i, j]); open_.push([nc + Math.hypot(ni - e[0], nj - e[1]), nc, ni, nj]); } }
  }
  const path = []; let cur = e; while (cur && !(cur[0] === s[0] && cur[1] === s[1])) { path.unshift(new THREE.Vector3(cur[0] * STEP, 0, cur[1] * STEP)); cur = came.get(K(...cur)); }
  return path.filter((p, k) => k % 2 === 1 || k === path.length - 1);
}

// ------------------------------------------------------------------ NPCs (CC0 rigged robot, tinted per agent)
const overlay = document.getElementById('overlay');
const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; overlay.appendChild(d); return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const npcs = {};
class NPC {
  constructor(meta, gltf) {
    this.meta = meta; this.name = meta.name; const seat = SEATS[meta.name]; this.seat = seat;
    this.root = SkeletonUtils.clone(gltf.scene); this.root.scale.setScalar(.33);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); if (o.material.name === 'Main') o.material.color = new THREE.Color(meta.color); } });
    scene.add(this.root); this.mixer = new THREE.AnimationMixer(this.root); this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const n of ['Death', 'Jump', 'Yes', 'No', 'Wave', 'ThumbsUp', 'Punch', 'Standing', 'Sitting']) if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce); this.actions[n].clampWhenFinished = true; }
    this.lv = seat.lv; this.path = []; this.mode = 'free'; this.server = { status: 'idle' }; this.next = performance.now() + rnd(4000, 14000); this.history = [];
    this.tag = el('npc-tag', `<b>${meta.name}</b>`); this.tag.style.setProperty('--c', meta.color); this.bubble = el('bubble hidden', '');
    this.tag.onclick = () => openNPC(this); this.sitAt();
  }
  play(name, fade = .25) { const a = this.actions[name]; if (!a || this.cur === a) return a; a.reset().fadeIn(fade).play(); if (this.cur) this.cur.fadeOut(fade); this.cur = a; return a; }
  y() { return this.lv === 'u' ? H : 0; }
  sitAt() { const s = this.seat; this.lv = s.lv; this.root.position.set(s.x, this.y() + .02, s.z); this.root.rotation.y = s.ry; this.sitting = true; this.play('Sitting', .01); }
  goTo(lv, x, z, done) {
    this.sitting = false; const legs = [];
    if (lv !== this.lv) { legs.push({ lv: this.lv, x: LIFT_DOOR.x, z: LIFT_DOOR.z }, { lift: lv }); }
    legs.push({ lv, x, z }); this.legs = legs; this.done = done; this.nextLeg();
  }
  nextLeg() {
    const leg = this.legs.shift(); if (!leg) { this.path = []; this.play('Idle'); const d = this.done; this.done = null; d && d(); return; }
    if (leg.lift) return this.ride(leg.lift);
    this.path = astar(leg.lv, this.root.position.x, this.root.position.z, leg.x, leg.z); this.path.push(new THREE.Vector3(leg.x, 0, leg.z)); this.play('Walking');
  }
  ride(toLv) {
    const go = () => {
      if (cabin.userData.busy) return setTimeout(go, 500); cabin.userData.busy = true;
      const from = this.y(), to = toLv === 'u' ? H : 0; this.play('Idle');
      this.lift = { phase: 0, from, to };
    }; go();
  }
  update(dt) {
    this.mixer.update(dt);
    if (this.lift) {
      const L = this.lift, cy = cabin.position.y, sp = 3 * dt;
      if (L.phase === 0) { const d = L.from - cy; if (Math.abs(d) < sp) { cabin.position.y = L.from; L.phase = 1; this.path = [new THREE.Vector3(LIFT.x, 0, LIFT.z)]; this.play('Walking'); } else cabin.position.y += Math.sign(d) * sp; }
      else if (L.phase === 2) { const d = L.to - cy; if (Math.abs(d) < sp) { cabin.position.y = L.to; this.root.position.y = L.to + .1; this.lv = L.to > 0 ? 'u' : 'l'; this.lift = null; cabin.userData.busy = false; this.path = [new THREE.Vector3(LIFT_DOOR.x, 0, LIFT_DOOR.z)]; this.afterLift = true; this.play('Walking'); } else { cabin.position.y += Math.sign(d) * sp; this.root.position.y = cabin.position.y + .1; } }
    }
    if (this.path.length) {
      const p = this.path[0], pos = this.root.position, dx = p.x - pos.x, dz = p.z - pos.z, dist = Math.hypot(dx, dz), sp = 1.6 * dt;
      this.root.rotation.y = Math.atan2(dx, dz);
      if (dist <= sp) { pos.x = p.x; pos.z = p.z; this.path.shift();
        if (!this.path.length) { if (this.lift && this.lift.phase === 1) { this.lift.phase = 2; this.play('Idle'); } else if (this.afterLift) { this.afterLift = false; this.nextLeg(); } else if (!this.lift) this.nextLeg(); } }
      else { pos.x += dx / dist * sp; pos.z += dz / dist * sp; }
      if (!this.lift) pos.y = this.y();
    }
  }
  setStatus(a) {
    const prev = this.server.status; this.server = a; if (prev === a.status) return;
    if (['working', 'queued'].includes(a.status)) { this.mode = 'work'; this.goDesk(); }
    else if (this.mode === 'work') { this.mode = 'free'; this.next = performance.now() + rnd(4000, 9000); }
  }
  goDesk(cb) { const s = this.seat; this.mode = this.mode === 'work' ? 'work' : 'busy'; this.goTo(s.lv, s.x + (s.ry === Math.PI ? 0 : .4), s.z + (s.ry === Math.PI ? .4 : 0), () => { this.sitAt(); if (this.mode !== 'work') this.mode = 'free'; cb && cb(); }); }
  emote(name, ms = 2500) { if (this.sitting || this.path.length) return; this.play(name); setTimeout(() => { if (!this.path.length && !this.sitting) this.play('Idle'); }, ms); }
  say(t, ms = 5000, kind = 'say') { const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), ms); this.history.unshift(t); this.history.length = Math.min(this.history.length, 10); }
  life() {
    if (this.mode !== 'free' || performance.now() < this.next) return; this.next = performance.now() + rnd(12000, 26000);
    const r = Math.random();
    if (r < .35) { this.mode = 'busy'; let x, z, lv = Math.random() < .6 ? this.lv : (this.lv === 'u' ? 'l' : 'u'); for (let k = 0; k < 40; k++) { x = rnd(1, W - 1); z = rnd(1, D - 1); if (walk(lv, x, z)) break; }
      this.goTo(lv, x, z, () => { this.say(pick(['Peregangan dulu~', 'Lihat kota sebentar…', 'Hmm, ide baru…']), 3500, 'chat'); this.emote(pick(['Wave', 'Yes', 'Idle']), 2500); setTimeout(() => this.goDesk(), rnd(5000, 9000)); }); }
    else if (r < .5) { this.mode = 'busy'; this.goTo('l', 5.8, 7.6, () => { this.say('Santai di bean bag…', 3500, 'chat'); this.play('Dance'); setTimeout(() => this.goDesk(), rnd(6000, 10000)); }); }
  }
}

// ------------------------------------------------------------------ server state (same API as the 2D HQ)
let lastEvent = 0, first = true;
async function poll() {
  try {
    const st = await (await fetch(`/api/world?since=${lastEvent}`)).json(); lastEvent = st.last_event;
    for (const a of st.agents) npcs[a.name]?.setStatus(a);
    if (!first) for (const ev of st.events) { const n = npcs[ev.agent]; if (!n) continue;
      if (ev.kind === 'running') n.say(ev.text, 3500, 'think');
      else if (ev.kind === 'done' || ev.kind === 'published') { n.say(ev.text, 7000, 'say'); if (!n.sitting) n.emote('ThumbsUp'); }
      else if (ev.kind === 'failed') { n.say(ev.text, 8000, 'alert'); if (!n.sitting) n.emote('No'); } }
    first = false;
    document.querySelector('#hud .sys').textContent = `CPU ${st.system.cpu ?? '-'}% · RAM ${st.system.ram_used_gb ?? '-'}/${st.system.ram_total_gb ?? '-'} GB`;
  } catch (e) { /* server offline */ }
}

// ------------------------------------------------------------------ click → room panel
const ROOMS = [
  { name: 'COMMAND DECK', lv: 'u', test: (x, z) => x < MEZZ, agent: 'KAI-07', url: '/dashboard', c: '#22d3ee' },
  { name: 'RESEARCH LAB', lv: 'u', test: (x, z) => x >= MEZZ, agent: 'RAZE-11', url: '/research', c: '#4ade80' },
  { name: 'SERVER ROOM', lv: 'l', test: (x, z) => x < 5, agent: 'ZERO-1', url: '/settings', c: '#fb923c' },
  { name: 'ARCHIVE', lv: 'l', test: (x, z) => x >= 5, agent: 'SABLE-6', url: '/assets', c: '#d6a76c' },
];
const ray = new THREE.Raycaster();
function onClick(e) {
  const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
  for (const n of Object.values(npcs)) if (ray.intersectObject(n.root, true).length) return openNPC(n);
  for (const lv of ['u', 'l']) { const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(lv === 'u' ? H : 0)), new THREE.Vector3());
    if (hit && hit.x > 0 && hit.z > 0 && hit.x < W && hit.z < D && (lv === 'l' || hit.z <= MEZZ || hit.x <= MEZZ)) { const room = ROOMS.find(q => q.lv === lv && q.test(hit.x, hit.z)); if (room) return openRoom(room); } }
}
function openRoom(room) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', room.c); p.querySelector('.ptitle').innerHTML = `<b>${room.name}</b><span>${room.agent}</span>`; p.querySelector('.ptabs').innerHTML = ''; const f = p.querySelector('iframe'); f.style.display = ''; p.querySelector('.pbody-info').style.display = 'none'; f.src = room.url; }
function openNPC(n) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color); p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)}</span>`; p.querySelector('.ptabs').innerHTML = ''; p.querySelector('iframe').style.display = 'none'; const i = p.querySelector('.pbody-info'); i.style.display = ''; i.innerHTML = `<p>${esc(n.meta.desc)}</p><p>Status: <b>${n.server.status}</b></p><h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`; }
function closePanel() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; }
document.querySelector('#panel .pclose').onclick = closePanel;

// ------------------------------------------------------------------ boot
new GLTFLoader().load('/static/game3d/models/robot.glb', gltf => {
  for (const meta of AGENTS) if (SEATS[meta.name]) npcs[meta.name] = new NPC(meta, gltf);
  window.hq3d = { npcs, cabin, scene };
  poll(); setInterval(poll, 3000); setInterval(() => Object.values(npcs).forEach(n => n.life()), 1000);
});
const clock = new THREE.Clock(); let cityT = 0, fxT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(.1, clock.getDelta()); cityT += dt; fxT += dt;
  if (cityT > .1) { drawCity(); cityT = 0; }
  if (fxT > .2) { fxT = 0;
    for (const s of screens) { const c = s.tex.userData.canvas, g = c.getContext('2d'), busy = !s.owner || ['working', 'queued'].includes(npcs[s.owner]?.server.status); g.fillStyle = '#08142a'; g.fillRect(0, 0, 64, 36); for (let k = 0; k < 6; k++) { if (Math.random() < (busy ? .2 : .6)) continue; g.fillStyle = pick(['#22d3ee', '#4ade80', '#a78bfa']); g.fillRect(4, 4 + k * 5, rnd(10, 54), 2); } s.tex.needsUpdate = true; }
    for (const l of leds) l.visible = Math.random() > .25;
  }
  for (const s of spinners) s.rotation.y += dt * .8;
  for (const n of Object.values(npcs)) n.update(dt);
  renderer.render(scene, cam);
  // DOM labels / bubbles
  const w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3();
  for (const n of Object.values(npcs)) { v.copy(n.root.position); v.y += 1.0; v.project(cam); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    n.tag.style.transform = `translate(${x}px, ${y + 70}px) translate(-50%,0)`; n.bubble.style.transform = `translate(${x}px, ${y - 4}px) translate(-50%,-100%)`; }
});
