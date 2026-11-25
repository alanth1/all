// NEONLOOM HQ - HD-2D prototype: 3D tower rendered as pixel art (palette + outlines) with PixelLab cyberpunk NPC sprites.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search);
const ASSETS = window.ASSETS || { npc: {} };
const AGENTS = (window.AGENTS_META || []).filter(a => ['KAI-07', 'RAZE-11', 'ZERO-1', 'SABLE-6'].includes(a.name));
const W = 12, D = 10, H = 5.4, MEZZ = 4.4;
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];

// ================================================================== renderer + pixel-art post process
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 2.3;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
const scene = new THREE.Scene();
let PIX = Q.has('pix') ? +Q.get('pix') : 3, zoom = 1.25, rt;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
cam.position.set(30, 25, 30); cam.lookAt(W / 2, H * .92, D / 2);
const PAL = ['#06092a', '#111129', '#162247', '#292c57', '#2d4e7d', '#313969', '#3b5389', '#4073a1', '#4f5791', '#6190ba', '#6376a9', '#8fd0e4',
  '#67e8f9', '#c084fc', '#f472b6', '#e0f2fe', '#4ade80', '#facc15', '#ef4444', '#fb923c', '#f1c27d', '#a16207', '#7c3aed', '#1e1b4b'].map(c => new THREE.Color(c));
const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, pal: { value: PAL }, palMix: { value: Q.has("nopal") ? 0 : .35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform vec3 pal[24]; uniform float palMix; varying vec2 vUv;
    float dep(vec2 o){ return texture2D(tDepth, vUv + o / res).r; }
    void main(){
      vec4 c = texture2D(tColor, vUv);
      vec3 best = pal[0]; float bd = 1e9;
      for (int i = 0; i < 24; i++) { vec3 d = c.rgb - pal[i]; float k = dot(d, d); if (k < bd) { bd = k; best = pal[i]; } }
      vec3 col = mix(c.rgb, best, palMix);
      float d0 = dep(vec2(0.)), e = 0.;
      e = max(e, abs(dep(vec2(1.,0.)) - d0)); e = max(e, abs(dep(vec2(-1.,0.)) - d0)); e = max(e, abs(dep(vec2(0.,1.)) - d0)); e = max(e, abs(dep(vec2(0.,-1.)) - d0));
      if (e > .0016 && d0 < .9999) col = mix(col, vec3(.035,.03,.08), .75);
      gl_FragColor = vec4(col, 1.);
    }`,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post), postScene = new THREE.Scene(), postCam = new THREE.Camera(); postScene.add(quad);
function resize() {
  const w = host.clientWidth, h = host.clientHeight, lw = Math.round(w / PIX), lh = Math.round(h / PIX);
  renderer.setPixelRatio(1); renderer.setSize(lw, lh, false);
  rt?.dispose(); rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(lw, lh) });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  post.uniforms.tColor.value = rt.texture; post.uniforms.tDepth.value = rt.depthTexture; post.uniforms.res.value.set(lw, lh);
  const view = 12.2 / zoom, a = w / h; cam.left = -view * a; cam.right = view * a; cam.top = view; cam.bottom = -view; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'P') { PIX = PIX === 1 ? 3 : 1; resize(); } if (e.key === 'Escape') closePanel(); if (e.key === 'Home') { zoom = 1.25; cam.position.set(30, 25, 30); resize(); } });
host.addEventListener('wheel', e => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? .9 : 1.1), .8, 5); resize(); });
let drag = null;
host.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false, p: cam.position.clone() }; });
addEventListener('pointerup', e => { if (drag && !drag.moved) onClick(e); drag = null; });
addEventListener('pointermove', e => {
  if (!drag || !(e.buttons & 1)) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  const s = (cam.top - cam.bottom) / host.clientHeight; cam.position.copy(drag.p).addScaledVector(new THREE.Vector3(1, 0, -1).normalize(), -dx * s).addScaledVector(new THREE.Vector3(-1, 2, -1).normalize(), dy * s * .9);
});
scene.background = new THREE.Color(0x0e0d24);   // plain dark backdrop like the reference

// ================================================================== materials / helpers
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o });
const E = c => new THREE.MeshBasicMaterial({ color: c });
const mats = {
  wallL: M(0x34336a), wallR: M(0x2b3770), floor: M(0x55669e, { roughness: .45, metalness: .25 }), slab: M(0x1c1b3c), frame: M(0x232248), trim: M(0x121126),
  desk: M(0x3a3866), deskTop: M(0x56548c), metal: M(0x7c86a6, { metalness: .5, roughness: .4 }), dark: M(0x161530),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa5d8ff, transparent: true, opacity: .22, roughness: .05, depthWrite: false }),
  cyan: E(0x67e8f9), purple: E(0xc084fc), pink: E(0xf472b6),
};
function box(w, h, d, mat, x, y, z, parent = scene, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.userData.c = c; return t; }
const plane = (w, h, t, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };

// ================================================================== lights
scene.add(new THREE.HemisphereLight(0xb4c2ff, 0x3a2a60, 1.6));
const key = new THREE.DirectionalLight(0xb9c6ff, .7); key.position.set(16, 28, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 }); key.target.position.set(W / 2, 0, D / 2); scene.add(key, key.target);
for (const [x, y, z, c, i] of [[3, H - .6, 2, 0x67e8f9, 30], [8, H - .6, 2, 0xc084fc, 26], [3, 2 * H - .6, 2, 0x67e8f9, 30], [8, 2 * H - .6, 2, 0xc084fc, 26], [8, H - 1, 7, 0x67e8f9, 22], [3, H - 1, 8, 0xa78bfa, 18]]) {
  const l = new THREE.PointLight(c, i, 11, 1.5); l.position.set(x, y, z); scene.add(l);
}

// ================================================================== city seen only through the windows
const city = ctex(256, 128, () => {}); const traffic = [];
function drawCity(dt) {
  const g = city.userData.c.getContext('2d'); const sk = g.createLinearGradient(0, 0, 0, 128); sk.addColorStop(0, '#0a0820'); sk.addColorStop(1, '#2b1d5a'); g.fillStyle = sk; g.fillRect(0, 0, 256, 128);
  let s = 3; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (const [col, lit, base] of [['#1d1c46', .18, 50], ['#121132', .3, 20]]) for (let x = 0; x < 256;) {
    const bw = 8 + R() * 18, bh = base + R() * 80; g.fillStyle = col; g.fillRect(x, 128 - bh, bw, bh);
    for (let wy = 128 - bh + 3; wy < 126; wy += 4) for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (R() < lit) { g.fillStyle = ['#fde68a', '#67e8f9', '#f9a8d4'][Math.floor(R() * 3)]; g.fillRect(wx, wy, 1, 2); }
    x += bw + 1;
  }
  if (traffic.length < 7 && Math.random() < .08) traffic.push({ x: Math.random() < .5 ? -12 : 268, y: rnd(14, 90), v: rnd(15, 40) * (Math.random() < .5 ? 1 : -1), c: pick(['#f472b6', '#22d3ee', '#facc15', '#a78bfa']) });
  for (const k of traffic) { k.x += k.v * dt; g.fillStyle = '#0b0b18'; g.fillRect(k.x, k.y, 9, 3); g.fillStyle = k.c; g.fillRect(k.x, k.y + 3, 9, 1); g.fillStyle = '#fff3b0'; g.fillRect(k.v > 0 ? k.x + 8 : k.x, k.y + 1, 1, 1); }
  for (let i = traffic.length - 1; i >= 0; i--) if (traffic[i].x < -20 || traffic[i].x > 280) traffic.splice(i, 1);
  city.needsUpdate = true;
}
const cityMat = new THREE.MeshBasicMaterial({ map: city });
for (const lv of [0, 1]) {
  const y0 = lv * H;
  const r = new THREE.Mesh(new THREE.PlaneGeometry(W, H), cityMat); r.position.set(W / 2, y0 + H / 2, -.25); scene.add(r);
  const l = new THREE.Mesh(new THREE.PlaneGeometry(D, H), cityMat); l.rotation.y = Math.PI / 2; l.position.set(-.25, y0 + H / 2, D / 2); scene.add(l);
}

// ================================================================== building shell (thick dark frame)
const T = .35;
box(W + 2 * T, .6, D + 2 * T, mats.frame, W / 2 - T / 2, -.6, D / 2 - T / 2);
box(W, .06, D, mats.floor, W / 2, 0, D / 2, scene, false);
box(W, .45, MEZZ, mats.slab, W / 2, H - .45, MEZZ / 2); box(MEZZ, .45, D - MEZZ, mats.slab, MEZZ / 2, H - .45, MEZZ + (D - MEZZ) / 2);
box(W, .06, MEZZ, mats.floor, W / 2, H, MEZZ / 2, scene, false); box(MEZZ, .06, D - MEZZ, mats.floor, MEZZ / 2, H, MEZZ + (D - MEZZ) / 2, scene, false);
for (const [w, d, x, z] of [[W - MEZZ, .07, MEZZ + (W - MEZZ) / 2, MEZZ], [.07, D - MEZZ, MEZZ, MEZZ + (D - MEZZ) / 2], [MEZZ, .07, MEZZ / 2, D], [.07, MEZZ, W, MEZZ / 2]]) {
  box(w, 1, d, mats.glass, x, H, z, scene, false); box(w + .03, .07, d + .03, mats.metal, x, H + 1, z, scene, false);
}
function wall(alongX) {
  const len = alongX ? W : D, mat = alongX ? mats.wallR : mats.wallL;
  const B = (w, h, x, y) => alongX ? box(w, h, T, mat, x, y, -T / 2) : box(T, h, w, mat, -T / 2, y, x);
  for (let lv = 0; lv < 2; lv++) {
    const y0 = lv * H, top = y0 + H;
    if (!alongX) { B(len, 1.4, len / 2, y0); B(len, 1.6, len / 2, top - 1.6); for (let k = 0; k <= len; k += 3.3) B(.4, H - 3, Math.min(len - .2, k + .2), y0 + 1.4); }
    else { B(len, .5, len / 2, y0); B(len, .5, len / 2, top - .5); for (let k = 0; k <= len; k += 2) B(.14, H - 1, Math.min(len - .07, k + .07), y0 + .5); B(len, .1, len / 2, y0 + H * .5); }
    if (alongX) box(len - .4, .1, .1, mats.cyan, len / 2, top - .7, .08, scene, false); else box(.1, .1, len - .4, mats.purple, .08, top - .7, len / 2, scene, false);
  }
}
wall(true); wall(false);
box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, W + T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, D + T / 2);
box(W + 2 * T, .5, T, mats.frame, W / 2, 2 * H, -T / 2); box(T, .5, D + 2 * T, mats.frame, -T / 2, 2 * H, D / 2);
box(W + 2 * T, .45, T, mats.frame, W / 2, -.6, D + T / 2); box(T, .45, D, mats.frame, W + T / 2, -.6, D / 2);

// ================================================================== props
const screens = [], leds = [], spin = [];
function monitor(p, x, y, z, w = .8) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  box(.05, .48, w, mats.dark, 0, .14, 0, g); box(.14, .14, .1, mats.metal, .06, 0, 0, g);
  const t = ctex(32, 20, c => { c.fillStyle = '#0a1a33'; c.fillRect(0, 0, 32, 20); });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w * .9, .42), new THREE.MeshBasicMaterial({ map: t })); s.rotation.y = Math.PI / 2; s.position.set(.03, .38, 0); g.add(s);
  screens.push({ t, owner: p.userData.owner });
}
function deskUnit(x, y, z, ry, owner, mons = 3, len = 2.6) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.owner = owner; scene.add(g);
  box(1, .07, len, mats.deskTop, 0, .72, 0, g); box(.95, .66, .5, mats.desk, -.02, 0, len / 2 - .3, g);
  for (const a of [-.42, .42]) box(.06, .72, .06, mats.metal, a, 0, -len / 2 + .08, g);
  for (let i = 0; i < mons; i++) monitor(g, -.28, .79, (i - (mons - 1) / 2) * .78 - .1, .74);
  box(.2, .03, .8, mats.dark, .15, .79, -.1, g, false); box(.12, .03, .1, mats.dark, .17, .79, .5, g, false);
  box(.11, .13, .11, M(pick([0xf472b6, 0xe5e7eb, 0xfacc15])), .3, .79, -len / 2 + .3, g);
  if (Math.random() < .7) { const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.12, .08, .1, 8), M(0xf5f5f4)); bowl.position.set(.25, .85, .75); g.add(bowl); }
  if (Math.random() < .7) box(.07, .16, .07, M(0xef4444), .1, .79, -.9, g);
  box(.35, .08, .3, M(0xe5e7eb), .15, .79, len / 2 - .35, g); box(.33, .06, .28, M(0xe5e7eb), .15, .87, len / 2 - .35, g);
  box(.32, .55, .45, mats.dark, -.2, 0, -len / 2 + .5, g); box(.02, .45, .02, pick([mats.cyan, mats.pink, mats.purple]), -.03, .05, -len / 2 + .5, g, false);
  return g;
}
function gamingChair(x, y, z, ry, c) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); const cm = M(c);
  box(.55, .1, .55, cm, 0, .45, 0, g); box(.12, .95, .55, cm, .25, .5, 0, g); box(.12, .22, .32, cm, .25, 1.45, 0, g);
  box(.4, .05, .06, mats.dark, 0, .7, .3, g); box(.4, .05, .06, mats.dark, 0, .7, -.3, g);
  box(.06, .4, .06, mats.metal, 0, .05, 0, g); for (let k = 0; k < 5; k++) { const a = k * 1.256; box(.04, .04, .32, mats.metal, Math.cos(a) * .14, .02, Math.sin(a) * .14, g, false).rotation.y = -a; }
}
function rack(x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); box(.85, 2.6, .85, mats.dark, 0, 0, 0, g);
  for (let r = 0; r < 12; r++) { box(.7, .02, .02, mats.trim, 0, .2 + r * .2, .43, g, false); for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, .02), E(pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6, 0xfacc15]))); l.position.set(-.3 + k * .08, .24 + r * .2, .44); g.add(l); leds.push(l); } } }
function plant(x, y, z, big = 1) { box(.36 * big, .38 * big, .36 * big, M(0x9a3412), x, y, z); for (let k = 0; k < 9; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.09 * big, .75 * big, 4), M(pick([0x16a34a, 0x22c55e, 0x15803d]))); l.position.set(x + rnd(-.18, .18) * big, y + .7 * big, z + rnd(-.18, .18) * big); l.rotation.set(rnd(-.6, .6), 0, rnd(-.6, .6)); l.castShadow = true; scene.add(l); } }
function hangingPlant(x, y, z) { for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.07, .6, 4), M(0x22c55e)); l.position.set(x + rnd(-.15, .15), y - rnd(0, .4), z + rnd(-.15, .15)); l.rotation.x = Math.PI + rnd(-.4, .4); scene.add(l); } box(.25, .2, .25, M(0x78350f), x, y, z); }
function bean(x, y, z, c) { const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 12, 9), M(c, { roughness: 1 })); m.scale.set(1, .62, 1); m.position.set(x, y + .32, z); m.castShadow = true; scene.add(m); }
function vending(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); box(.9, 2.1, 1.2, M(0x4c3f9a), 0, 0, 0, g);
  const t = ctex(16, 24, c => { c.fillStyle = '#0f0c29'; c.fillRect(0, 0, 16, 24); for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) { c.fillStyle = pick(['#f472b6', '#facc15', '#4ade80', '#22d3ee', '#fb923c']); c.fillRect(2 + k * 4, 2 + r * 4, 3, 3); } });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(.75, 1.2), new THREE.MeshBasicMaterial({ map: t })); p.rotation.y = Math.PI / 2; p.position.set(.46, 1.2, -.12); g.add(p); }
function cabinet(x, y, z) { box(.8, 1.5, .7, M(0x6b7493, { metalness: .4 }), x, y, z); for (let r = 0; r < 3; r++) box(.5, .03, .02, mats.trim, x, y + .35 + r * .42, z + .36, scene, false); }
function shelfBoxes(x, y, z) { box(1.6, 2, .5, M(0x4b5563), x, y, z); for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) box(.32, .3, .35, M(pick([0xb45309, 0xd97706, 0x92400e, 0x3b82f6])), x - .58 + k * .39, y + .1 + r * .48, z + .05); }
function crate(x, y, z) { box(.6, .45, .6, M(0xb45309), x, y, z); box(.45, .35, .45, M(0xd97706), x + .05, y + .45, z + .03); }
function toolbox(x, y, z) { box(.65, .32, .32, M(0xb91c1c), x, y, z); box(.5, .05, .05, mats.metal, x, y + .38, z, scene, false); }
function cableCoil(x, y, z) { for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.22 + k * .06, .025, 5, 16), M(pick([0x1f2937, 0x3b82f6, 0x9ca3af]))); t.rotation.x = Math.PI / 2; t.position.set(x + k * .05, y + .03, z); scene.add(t); } }
function cableLine(pts, y) { const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y + .03, z))); scene.add(new THREE.Mesh(new THREE.TubeGeometry(c, 30, .025, 4), M(pick([0x111827, 0x1e3a8a, 0x4b5563])))); }
function microwaveFridge(x, y, z) { box(.8, 1.5, .8, M(0xd1d5db, { metalness: .3 }), x, y, z); box(.7, .4, .55, M(0x9ca3af), x, y + 1.5, z); }
function water(x, y, z) { box(.45, 1, .45, M(0xe5e7eb), x, y, z); const b = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .45, 10), new THREE.MeshPhysicalMaterial({ color: 0x60a5fa, transparent: true, opacity: .7 })); b.position.set(x, y + 1.23, z); scene.add(b); }
function wallScreen(y, z, w, h) {
  const t = ctex(48, 28, g => { g.fillStyle = '#071226'; g.fillRect(0, 0, 48, 28); });
  plane(w, h, t, .06, y, z, Math.PI / 2); box(.05, h + .1, w + .1, mats.dark, .02, y - h / 2 - .05, z, scene, false);
  screens.push({ t, kind: 'wall' });
}
function poster(y, z, w, h) {
  const cols = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#4ade80'];
  const t = ctex(12, 16, g => { g.fillStyle = '#1e1b4b'; g.fillRect(0, 0, 12, 16); g.fillStyle = pick(cols); g.fillRect(2, 2, 8, 8); g.fillStyle = pick(cols); g.fillRect(2, 11, 8, 2); });
  plane(w, h, t, .07, y, z, Math.PI / 2);
}

// ================================================================== layout - tower 1
const blocked = { l: [], u: [] }, block = (lv, a, b, c, d) => blocked[lv].push([a, b, c, d]);
const SEATS = {}; const U = H;
// UPPER LEFT - COMMAND DECK
wallScreen(U + 3.4, 1.6, 1.6, .9); wallScreen(U + 3.4, 3.5, 1.6, .9); poster(U + 2.5, 5.6, .5, .7); poster(U + 2.6, 6.4, .5, .7); poster(U + 2.4, 7.2, .5, .7);
wallScreen(U + 2.6, 8.6, 1.1, .65); hangingPlant(.4, U + 3.9, 4.6);
vending(.55, U, 9.2); block('u', 0, 8.5, 1.1, 9.9);
bean(1.9, U, 7.4, 0x2563eb); bean(2.9, U, 8.6, 0x9333ea); bean(1.6, U, 8.8, 0x059669); block('u', 1.2, 6.8, 3.6, 9.4);
deskUnit(.6, U, 3, 0, 'KAI-07', 3); gamingChair(1.65, U, 3, 0, 0x1e3a8a); block('u', 0, 1.6, 1.1, 4.4); SEATS['KAI-07'] = { lv: 'u', x: 1.55, z: 3, face: 'north-west' };
plant(.45, U, .5, 1.1); block('u', .1, .1, .8, .9);
// UPPER RIGHT - RESEARCH LAB
deskUnit(6.1, U, .6, -Math.PI / 2, 'RAZE-11', 3); gamingChair(6.1, U, 1.7, -Math.PI / 2, 0x14532d); block('u', 4.7, 0, 7.5, 1.1); SEATS['RAZE-11'] = { lv: 'u', x: 6.1, z: 1.6, face: 'north-east' };
deskUnit(8.9, U, .6, -Math.PI / 2, null, 2, 2.2); gamingChair(8.9, U, 1.7, -Math.PI / 2, 0x3730a3); block('u', 7.7, 0, 10, 1.1);
crate(4.3, U, .45); block('u', 3.9, .1, 4.7, .8);
// LOWER LEFT - SERVER ROOM
for (let k = 0; k < 4; k++) rack(.5, .6 + k * .95); block('l', 0, .1, 1, 4.1);
rack(1.5, .5); rack(2.45, .5); block('l', 1, 0, 2.9, 1);
toolbox(.6, 0, 5.2); cableCoil(1.6, 0, 4.9); cableLine([[1, 1.6], [1.6, 2.6], [2.2, 3.4], [2.4, 4.6], [3.2, 5.4]], 0); cableLine([[2.2, 1.1], [2.6, 2], [3.6, 2.4]], 0);
block('l', .2, 4.9, 1.1, 5.5);
wallScreen(3.6, 7.2, 1.2, .7); poster(3.4, 8.6, .5, .7);
// LOWER MIDDLE - pantry corner
microwaveFridge(3.7, 0, .5); water(4.6, 0, .45); block('l', 3.2, 0, 4.9, 1);
shelfBoxes(5.9, 0, .3); block('l', 5, 0, 6.8, .6);
// LOWER RIGHT - ARCHIVE + desks
deskUnit(8.1, 0, .6, -Math.PI / 2, 'SABLE-6', 3); gamingChair(8.1, 0, 1.7, -Math.PI / 2, 0x78350f); block('l', 6.8, 0, 9.4, 1.1); SEATS['SABLE-6'] = { lv: 'l', x: 8.1, z: 1.6, face: 'north-east' };
cabinet(10.2, 0, .45); cabinet(11.1, 0, .45); block('l', 9.7, 0, 11.6, .9);
deskUnit(.6, 0, 7.4, 0, 'ZERO-1', 2, 2.4); gamingChair(1.65, 0, 7.4, 0, 0x7c2d12); block('l', 0, 6.1, 1.1, 8.7); SEATS['ZERO-1'] = { lv: 'l', x: 1.55, z: 7.4, face: 'north-west' };
plant(.5, 0, 9.4); block('l', .2, 9.1, .8, 9.7);
crate(10.9, 0, 9.2); crate(10.2, 0, 9.5); block('l', 9.7, 8.8, 11.4, 9.9);
const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), M(0x5b21b6, { roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(6.4, .04, 7.6); rug.receiveShadow = true; scene.add(rug);
bean(5.7, 0, 8.3, 0x0d9488); bean(7.1, 0, 8.6, 0x7c3aed); block('l', 5, 7.6, 7.8, 9.3);

// ================================================================== lift
const LIFT = { x: 11.1, z: 2.4 };
for (const [dx, dz] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) box(.08, 2 * H, .08, mats.trim, LIFT.x + dx, 0, LIFT.z + dz, scene, false);
box(1.6, 2 * H, 1.6, mats.glass, LIFT.x, 0, LIFT.z, scene, false);
const cabin = new THREE.Group(); scene.add(cabin); cabin.position.set(LIFT.x, 0, LIFT.z);
box(1.5, .1, 1.5, mats.metal, 0, 0, 0, cabin); box(1.5, .05, 1.5, mats.cyan, 0, 2.4, 0, cabin, false);
const cabL = new THREE.PointLight(0x67e8f9, 8, 4); cabL.position.set(0, 2, 0); cabin.add(cabL); cabin.userData.busy = false;
block('l', 10.2, 1.5, W, 3.3); block('u', 10.2, 1.5, W, 3.3);
const LIFT_DOOR = { x: LIFT.x - 1.35, z: LIFT.z };

// ================================================================== navigation
const STEP = .25, NX = Math.round(W / STEP) + 1, NZ = Math.round(D / STEP) + 1;
const walkable = (lv, x, z) => { if (x < .2 || z < .2 || x > W - .2 || z > D - .2) return false; if (lv === 'u' && !(z <= MEZZ - .25 || x <= MEZZ - .25)) return false; for (const [a, b, c, d] of blocked[lv]) if (x > a - .18 && x < c + .18 && z > b - .18 && z < d + .18) return false; return true; };
const grid = {}; for (const lv of ['l', 'u']) { grid[lv] = new Uint8Array(NX * NZ); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) grid[lv][i * NZ + j] = walkable(lv, i * STEP, j * STEP) ? 1 : 0; }
const openCell = (lv, x, z) => { grid[lv][Math.round(x / STEP) * NZ + Math.round(z / STEP)] = 1; };
for (const lv of ['l', 'u']) for (let x = LIFT_DOOR.x; x <= LIFT.x + .01; x += STEP) openCell(lv, x, LIFT.z);
for (const s of Object.values(SEATS)) openCell(s.lv, s.x, s.z);
function nearest(lv, x, z) { let b = null, bd = 1e9; for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (grid[lv][i * NZ + j]) { const d = (i * STEP - x) ** 2 + (j * STEP - z) ** 2; if (d < bd) { bd = d; b = [i, j]; } } return b; }
function astar(lv, x0, z0, x1, z1) {
  const g = grid[lv], s = nearest(lv, x0, z0), e = nearest(lv, x1, z1); if (!s || !e) return [];
  const K = (i, j) => i * NZ + j, op = [[0, 0, ...s]], came = new Map(), cost = new Map([[K(...s), 0]]);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (op.length) { op.sort((a, b) => a[0] - b[0]); const [, c, i, j] = op.shift(); if (i === e[0] && j === e[1]) break;
    for (const [di, dj, w] of dirs) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || !g[K(ni, nj)]) continue; if (di && dj && (!g[K(i + di, j)] || !g[K(i, j + dj)])) continue;
      const nc = c + w; if (nc < (cost.get(K(ni, nj)) ?? 1e9)) { cost.set(K(ni, nj), nc); came.set(K(ni, nj), [i, j]); op.push([nc + Math.hypot(ni - e[0], nj - e[1]), nc, ni, nj]); } } }
  const path = []; let cur = e; while (cur && !(cur[0] === s[0] && cur[1] === s[1])) { path.unshift(new THREE.Vector3(cur[0] * STEP, 0, cur[1] * STEP)); cur = came.get(K(...cur)); }
  return path.filter((p, k) => k % 2 === 1 || k === path.length - 1);
}

// ================================================================== NPC sprites (PixelLab cyberpunk characters)
const loader = new THREE.TextureLoader(), texCache = {};
const tex = url => texCache[url] || (texCache[url] = (() => { const t = loader.load(url); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })());
// world direction -> sprite facing for a camera looking from (+x,+z)
const DIR = (dx, dz) => { const a = (Math.atan2(dz, dx) * 180 / Math.PI + 360) % 360; return ['south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east'][Math.round(a / 45) % 8]; };
const overlay = document.getElementById('overlay');
const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; overlay.appendChild(d); return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const npcs = {}; const SIZE = 2.4;
class NPC {
  constructor(meta) {
    this.meta = meta; this.name = meta.name; this.a = ASSETS.npc[meta.name] || {}; this.seat = SEATS[meta.name];
    this.mat = new THREE.SpriteMaterial({ map: tex(this.a.rot?.south || ''), transparent: true, alphaTest: .4 });
    this.spr = new THREE.Sprite(this.mat); this.spr.scale.set(SIZE, SIZE, 1); this.spr.center.set(.5, .1); scene.add(this.spr);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.32, 12), new THREE.MeshBasicMaterial({ color: 0x05040f, transparent: true, opacity: .45 })); this.shadow.rotation.x = -Math.PI / 2; scene.add(this.shadow);
    this.pos = new THREE.Vector3(); this.path = []; this.legs = []; this.mode = 'free'; this.server = { status: 'idle' }; this.next = performance.now() + rnd(5000, 15000); this.history = []; this.anim = null; this.t = 0;
    this.tag = el('npc-tag', `<b>${meta.name}</b>`); this.tag.style.setProperty('--c', meta.color); this.bubble = el('bubble hidden', ''); this.tag.onclick = () => openNPC(this);
    this.sit();
  }
  frames(kind, dir) { const set = kind === 'walk' ? this.a.walk : (this.a.anims || {})[kind]; if (!set) return null; if (set[dir]) return { urls: set[dir], flip: false };
    const m = { 'north-west': 'north-east', 'south-west': 'south-east', west: 'east', 'north-east': 'north-west', 'south-east': 'south-west', north: 'north-east', south: 'south-east' }[dir];
    if (m && set[m]) return { urls: set[m], flip: !['north', 'south'].includes(dir) }; const any = Object.keys(set)[0]; return any ? { urls: set[any], flip: false } : null; }
  setFrame(url, flip) { this.mat.map = tex(url); this.spr.scale.x = flip ? -SIZE : SIZE; this.mat.needsUpdate = true; }
  still(dir) { const u = this.a.rot?.[dir] || this.a.rot?.south; if (u) this.setFrame(u, false); this.anim = null; this.facing = dir; }
  play(kind, dir, fps = 9) { const f = this.frames(kind, dir); if (!f) return this.still(dir); this.anim = { f, fps, i: -1, kind }; this.t = 0; this.facing = dir; }
  sit() { const s = this.seat; this.lv = s.lv; this.pos.set(s.x, 0, s.z); this.sitting = true; this.still(s.face); }
  baseY() { return this.lv === 'u' ? H : 0; }
  goTo(lv, x, z, done) { this.sitting = false; this.legs = []; if (lv !== this.lv) this.legs.push({ lv: this.lv, x: LIFT_DOOR.x, z: LIFT_DOOR.z }, { lift: lv }); this.legs.push({ lv, x, z }); this.done = done; this.nextLeg(); }
  nextLeg() { const L = this.legs.shift(); if (!L) { this.path = []; this.still('south-east'); const d = this.done; this.done = null; d && d(); return; }
    if (L.lift) return this.ride(L.lift); this.path = astar(L.lv, this.pos.x, this.pos.z, L.x, L.z); this.path.push(new THREE.Vector3(L.x, 0, L.z)); }
  ride(to) { const go = () => { if (cabin.userData.busy) return setTimeout(go, 400); cabin.userData.busy = true; this.lift = { phase: 0, from: this.baseY(), to: to === 'u' ? H : 0, toLv: to }; }; go(); }
  update(dt) {
    if (this.lift) { const L = this.lift, sp = 3.2 * dt;
      if (L.phase === 0) { const d = L.from - cabin.position.y; if (Math.abs(d) < sp) { cabin.position.y = L.from; L.phase = 1; this.path = [new THREE.Vector3(LIFT.x, 0, LIFT.z)]; } else cabin.position.y += Math.sign(d) * sp; }
      else if (L.phase === 2) { const d = L.to - cabin.position.y; if (Math.abs(d) < sp) { cabin.position.y = L.to; this.lv = L.toLv; this.lift = null; cabin.userData.busy = false; this.path = [new THREE.Vector3(LIFT_DOOR.x, 0, LIFT_DOOR.z)]; this.after = true; } else cabin.position.y += Math.sign(d) * sp; } }
    if (this.path.length) { const p = this.path[0], dx = p.x - this.pos.x, dz = p.z - this.pos.z, dist = Math.hypot(dx, dz), sp = 1.7 * dt, dir = DIR(dx, dz);
      if (!this.anim || this.anim.kind !== 'walk' || this.facing !== dir) this.play('walk', dir, 10);
      if (dist <= sp) { this.pos.x = p.x; this.pos.z = p.z; this.path.shift(); if (!this.path.length) { if (this.lift && this.lift.phase === 1) { this.lift.phase = 2; this.still('south-west'); } else if (this.after) { this.after = false; this.nextLeg(); } else if (!this.lift) this.nextLeg(); } }
      else { this.pos.x += dx / dist * sp; this.pos.z += dz / dist * sp; } }
    if (this.anim) { this.t += dt; const a = this.anim, n = a.f.urls.length, i = Math.floor(this.t * a.fps) % n; if (i !== a.i) { a.i = i; this.setFrame(a.f.urls[i], a.f.flip); } }
    const y = (this.lift && this.lift.phase === 2) ? cabin.position.y : this.baseY();
    const typing = this.sitting && ['working', 'queued'].includes(this.server.status);
    const bob = this.sitting ? (typing ? Math.abs(Math.sin(performance.now() / 90)) * .04 : 0) - .3 : 0;
    this.spr.position.set(this.pos.x, y + bob + .02, this.pos.z); this.shadow.position.set(this.pos.x, y + .05, this.pos.z); this.shadow.visible = !this.sitting;
  }
  setStatus(a) { const prev = this.server.status; this.server = a; if (prev === a.status) return;
    if (['working', 'queued'].includes(a.status)) { this.mode = 'work'; if (!this.sitting) this.goDesk(); }
    else if (this.mode === 'work') { this.mode = 'free'; this.next = performance.now() + rnd(4000, 9000); } }
  goDesk() { const s = this.seat; this.goTo(s.lv, s.x, s.z, () => { this.sit(); if (this.mode !== 'work') this.mode = 'free'; }); }
  emote(kind, ms = 3200) { if (this.sitting || this.path.length || this.lift) return; this.play(kind, 'south-east', 8); setTimeout(() => { if (this.anim?.kind === kind) this.still('south-east'); }, ms); }
  say(t, ms = 5000, kind = 'say') { const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), ms); this.history.unshift(t); this.history.length = Math.min(this.history.length, 10); }
  life() {
    if (this.mode !== 'free' || performance.now() < this.next) return; this.next = performance.now() + rnd(14000, 28000);
    const r = Math.random();
    if (r < .3) { this.mode = 'busy'; const lv = Math.random() < .6 ? this.lv : (this.lv === 'u' ? 'l' : 'u'); let x = 3, z = 3; for (let k = 0; k < 60; k++) { x = rnd(1, W - 1); z = rnd(1, D - 1); if (walkable(lv, x, z)) break; }
      this.goTo(lv, x, z, () => { this.say(pick(['Peregangan dulu~', 'Lihat kota sebentar…', 'Hmm, ide baru…']), 3500, 'chat'); this.emote(pick(['yawn', 'idle', 'talk'])); setTimeout(() => this.goDesk(), rnd(6000, 10000)); }); }
    else if (r < .45) { this.mode = 'busy'; this.goTo('l', 4.2, 1.7, () => { this.emote('coffee', 5000); this.say('Kopi dulu ☕', 3500, 'chat'); setTimeout(() => this.goDesk(), 7000); }); }
    else if (r < .6) { this.mode = 'busy'; this.goTo('u', 2.4, 6.4, () => { this.say('Rebahan di bean bag…', 3500, 'chat'); this.emote('idle', 6000); setTimeout(() => this.goDesk(), 9000); }); }
  }
}

// ================================================================== live data
let last = 0, first = true;
async function poll() {
  try { const st = await (await fetch(`/api/world?since=${last}`)).json(); last = st.last_event;
    for (const a of st.agents) npcs[a.name]?.setStatus(a);
    if (!first) for (const ev of st.events) { const n = npcs[ev.agent]; if (!n) continue;
      if (ev.kind === 'running') n.say(ev.text, 3500, 'think');
      else if (ev.kind === 'done' || ev.kind === 'published') { n.say(ev.text, 7000); if (n.mode !== 'work') { n.sitting = false; n.emote('celebrate'); } }
      else if (ev.kind === 'failed') { n.say(ev.text, 8000, 'alert'); if (n.mode !== 'work') { n.sitting = false; n.emote('frustrated', 4200); } } }
    first = false; document.querySelector('#hud .sys').textContent = `CPU ${st.system.cpu ?? '-'}% · RAM ${st.system.ram_used_gb ?? '-'}/${st.system.ram_total_gb ?? '-'} GB`;
  } catch (e) { /* offline */ }
}

// ================================================================== click → rooms / NPC cards
const ROOMS = [
  { name: 'COMMAND DECK', lv: 'u', test: x => x < MEZZ, agent: 'KAI-07', url: '/dashboard', c: '#22d3ee' },
  { name: 'RESEARCH LAB', lv: 'u', test: x => x >= MEZZ, agent: 'RAZE-11', url: '/research', c: '#4ade80' },
  { name: 'SERVER ROOM', lv: 'l', test: x => x < 3.2, agent: 'ZERO-1', url: '/settings', c: '#fb923c' },
  { name: 'ARCHIVE', lv: 'l', test: x => x >= 3.2, agent: 'SABLE-6', url: '/assets', c: '#d6a76c' },
];
const ray = new THREE.Raycaster();
function onClick(e) {
  const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
  for (const n of Object.values(npcs)) if (ray.intersectObject(n.spr).length) return openNPC(n);
  for (const lv of ['u', 'l']) { const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(lv === 'u' ? H : 0)), new THREE.Vector3());
    if (hit && hit.x > 0 && hit.z > 0 && hit.x < W && hit.z < D && (lv === 'l' || hit.z <= MEZZ || hit.x <= MEZZ)) { const room = ROOMS.find(q => q.lv === lv && q.test(hit.x, hit.z)); if (room) return openRoom(room); } }
}
function openRoom(room) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', room.c); p.querySelector('.ptitle').innerHTML = `<b>${room.name}</b><span>${room.agent}</span>`; p.querySelector('.ptabs').innerHTML = ''; const f = p.querySelector('iframe'); f.style.display = ''; p.querySelector('.pbody-info').style.display = 'none'; f.src = room.url; }
function openNPC(n) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color); p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)}</span>`; p.querySelector('.ptabs').innerHTML = ''; p.querySelector('iframe').style.display = 'none'; const i = p.querySelector('.pbody-info'); i.style.display = ''; i.innerHTML = `<div class="npc-card"><img src="${n.a.rot?.south || ''}"><div><p>${esc(n.meta.desc)}</p><p>Status: <b>${n.server.status}</b></p></div></div><h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`; }
function closePanel() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; }
document.querySelector('#panel .pclose').onclick = closePanel;

// ================================================================== boot + loop
for (const meta of AGENTS) if (SEATS[meta.name] && ASSETS.npc[meta.name]) npcs[meta.name] = new NPC(meta);
window.hq3d = { npcs, cabin, scene };
poll(); setInterval(poll, 3000); setInterval(() => Object.values(npcs).forEach(n => n.life()), 1000);
const clock = new THREE.Clock(); let ct = 0, ft = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(.1, clock.getDelta()); ct += dt; ft += dt;
  if (ct > .1) { drawCity(ct); ct = 0; }
  if (ft > .18) { ft = 0;
    for (const s of screens) { const c = s.t.userData.c, g = c.getContext('2d'), w = c.width, h = c.height, busy = s.kind || !s.owner || ['working', 'queued'].includes(npcs[s.owner]?.server.status);
      g.fillStyle = '#0a1a33'; g.fillRect(0, 0, w, h); for (let k = 0; k < Math.floor(h / 4); k++) { if (Math.random() < (busy ? .25 : .7)) continue; g.fillStyle = pick(['#67e8f9', '#4ade80', '#a78bfa', '#8fd0e4']); g.fillRect(2, 2 + k * 4, rnd(4, w - 4), 2); } s.t.needsUpdate = true; }
    for (const l of leds) l.visible = Math.random() > .25; }
  for (const s of spin) s.rotation.y += dt * .8;
  for (const n of Object.values(npcs)) n.update(dt);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  const w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3();
  for (const n of Object.values(npcs)) { v.copy(n.spr.position); v.y += SIZE * .95; v.project(cam); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    const f = n.spr.position.clone().project(cam), fy = (1 - f.y) / 2 * h;
    n.tag.style.transform = `translate(${x}px, ${fy + 4}px) translate(-50%,0)`; n.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%)`; }
});
