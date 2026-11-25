// NEONLOOM TOWER 3D — cyberpunk "ant farm" tower over a living street. Pure Three.js, every model built in code
// (no sprites): procedural cyber-humans, hover cars, VTOL, city, giants. Palette B: rainy blue-grey night + magenta/cyan neon.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const Q = new URLSearchParams(location.search);
const META = Object.fromEntries((window.AGENTS_META || []).map(a => [a.name, a]));
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], now = () => performance.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const rng = seed => { let v = seed; return () => (v = (v * 9301 + 49297) % 233280) / 233280; };
const C = { mag: 0xff3fa4, cyan: 0x3ff0ff, amber: 0xffb347, warm: 0xffcf73, mint: 0x9fffcf, violet: 0xc9a6ff, red: 0xff3344 };
const hex = c => '#' + c.toString(16).padStart(6, '0');

// ====================================================================== renderer, scene, post
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
const scene = new THREE.Scene(); const FOGC = new THREE.Color(0x3a4560); scene.fog = new THREE.Fog(FOGC, 90, 260);
const skyC = document.createElement('canvas'); skyC.width = 64; skyC.height = 256; { const s = skyC.getContext('2d'), gr = s.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#0e1320'); gr.addColorStop(.6, '#2a344b'); gr.addColorStop(1, '#4c5874'); s.fillStyle = gr; s.fillRect(0, 0, 64, 256); }
const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
const cam = new THREE.PerspectiveCamera(30, 1, .5, 900);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .62, .45, .86); composer.addPass(bloom);
const fx = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, glitch: { value: 0 }, flash: { value: 0 }, dark: { value: 0 }, alarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, glitch, flash, dark, alarm; varying vec2 vUv; float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){ vec2 uv = vUv; float b = floor(uv.y*50.); if (glitch > 0. && h(b + floor(time*24.)) < glitch*.45) uv.x += (h(b*3.1+time)-.5)*.04*glitch;
      float ca = .0008 + glitch*.006; vec3 c = vec3(texture2D(tDiffuse, uv+vec2(ca,0.)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv-vec2(ca,0.)).b);
      c *= 1. - dark*.6; c += flash*vec3(.25,.28,.36); c = mix(c, c*vec3(1.5,.5,.55), alarm*(.5+.5*sin(time*8.)));
      vec2 v = vUv-.5; c *= 1. - dot(v,v)*.55; c *= .985 + .015*sin(vUv.y*900.); gl_FragColor = vec4(c,1.); }` });
composer.addPass(fx); composer.addPass(new OutputPass());

// ====================================================================== materials + helpers
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, metalness: .1, ...o });
const E = (c, i = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), fog: true });
const mats = { slab: M(0x161b27, { roughness: .6 }), frame: M(0x1c2230, { metalness: .4, roughness: .5 }), wall: M(0x2a3348), wall2: M(0x252c40), trim: M(0x0d1018, { metalness: .5 }), metal: M(0x7a8498, { metalness: .7, roughness: .3 }),
  dark: M(0x0f131c), desk: M(0x3a4358), deskTop: M(0x4f596e, { roughness: .5 }), floor: M(0x2c3446, { roughness: .35, metalness: .3 }), glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc6ff, transparent: true, opacity: .16, roughness: .05, metalness: .1, depthWrite: false }),
  road: M(0x10141d, { roughness: .16, metalness: .75 }), walk: M(0x2a3142, { roughness: .3, metalness: .4 }), paint: E(0x9a9878, .7) };
let CUR = scene;
const geoCache = {}; const BX = (w, h, d) => geoCache[w + '|' + h + '|' + d] || (geoCache[w + '|' + h + '|' + d] = new THREE.BoxGeometry(w, h, d));
function box(w, h, d, mat, x, y, z, parent = CUR) { const m = new THREE.Mesh(BX(w, h, d), mat); m.position.set(x, y + h / 2, z); parent.add(m); return m; }
function rbox(w, h, d, r, mat, x, y, z, parent = CUR) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat); m.position.set(x, y + h / 2, z); parent.add(m); return m; }
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.c = c; return t; }
function plane(w, h, mat, x, y, z, ry = 0, parent = CUR) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; }
const anim = { screens: [], blink: [], neon: [], spin: [], holo: [], steam: [], lamps: [], tubes: [], scan: [] };

// ====================================================================== world layout
const FH = 3.4, D = 6, LIFT_X = 9;
const FL = [{ y: 0, x0: -18, x1: 32.6, ix0: 10, ix1: 33 }, { y: FH, x0: LIFT_X, x1: 33.6, ix0: 10.5, ix1: 34 }, { y: FH * 2, x0: LIFT_X, x1: 33.2, ix0: 9.8, ix1: 33.6 },
  { y: FH * 3, x0: 2.5, x1: 34.6, ix0: 11, ix1: 35 }, { y: FH * 4, x0: LIFT_X, x1: 31.6, ix0: 11.5, ix1: 32 }, { y: FH * 5, x0: LIFT_X, x1: 33.6, ix0: 10, ix1: 34 }];
const ROOMS = [
  { name: 'SHOP FLOOR', f: 0, x0: 10, x1: 21, agent: 'NYX-21', url: '/approvals', c: C.mag }, { name: 'LOUNGE · PANTRY', f: 0, x0: 21, x1: 33, agent: null, url: null, c: C.violet },
  { name: 'ARCHIVE', f: 1, x0: 10.5, x1: 22, agent: 'SABLE-6', url: '/assets', c: C.amber }, { name: 'FINANCE VAULT', f: 1, x0: 22, x1: 34, agent: 'KADE-12', url: '/accounting', c: C.amber },
  { name: 'WRITERS STUDIO', f: 2, x0: 9.8, x1: 21.5, agent: 'JUNO-X9', url: '/listings', c: C.violet }, { name: 'QA BAY', f: 2, x0: 21.5, x1: 33.6, agent: 'VOLT-3', url: '/approvals', c: C.amber },
  { name: 'RESEARCH LAB', f: 3, x0: 11, x1: 19, agent: 'RAZE-11', url: '/research', c: C.mint }, { name: 'DATA ROOM', f: 3, x0: 19, x1: 27, agent: 'ORIN-88', url: '/analytics', c: C.cyan },
  { name: 'GROWTH STUDIO', f: 3, x0: 27, x1: 35, agent: 'HEX-04', url: '/social', c: C.mag }, { name: 'COMMAND DECK', f: 4, x0: 11.5, x1: 32, agent: 'KAI-07', url: '/dashboard', c: C.cyan },
  { name: 'SERVER ROOM', f: 5, x0: 16, x1: 26, agent: 'ZERO-1', url: '/settings', c: C.mag }];
const SEATS = { 'NYX-21': [0, 14], 'SABLE-6': [1, 15], 'KADE-12': [1, 28], 'JUNO-X9': [2, 14.5], 'VOLT-3': [2, 26.5], 'RAZE-11': [3, 14], 'ORIN-88': [3, 22.5], 'HEX-04': [3, 31], 'KAI-07': [4, 16], 'ZERO-1': [5, 21] };
const SEAT_Z = 2.25, LANE = 3.7, WALK_OUT = 7.6;
const SPOTS = { couch: [0, 24.6, 2.4, 'rest'], coffee: [0, 22.4, 2.6, 'snack'], vend: [0, 31.7, 2.6, 'snack'], arcade: [0, 28.7, 2.6, 'game'], arcade2: [0, 30.1, 2.6, 'game'], dance: [0, 26.8, 4.4, 'dance'],
  ramen: [0, -4.6, 7.2, 'ramen'], ramen2: [0, -3.2, 7.2, 'ramen'], metro: [0, -13, 7.6, 'look'], balcony: [2, 33, 4.6, 'look'], pad: [3, 4.5, 3.5, 'look'], window: [4, 29.5, 1.6, 'look'] };
const MEET = { f: 4, c: [24, 2.4], pts: [[22.5, 2.4], [25.5, 2.4], [24, 3.9], [22.9, 3.5], [25.1, 3.5], [22.9, 1.3], [25.1, 1.3]] };
const LUNCH = { f: 0, c: [-4, 6], pts: [[-6.2, 7.2], [-5, 7.2], [-3.8, 7.2], [-2.6, 7.2], [-1.4, 7.2], [-6, 8.3], [-3.2, 8.3], [-1.8, 8.3]] };
const BOARD = { f: 2, c: [12, .6], pts: [[11, 2.2], [12.3, 2.4], [13.5, 2.2], [11.6, 3.4], [13, 3.4]] };

// ====================================================================== lights
const hemi = new THREE.HemisphereLight(0x9fb2d8, 0x1c2232, 1.25); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xaabbee, .55); moon.position.set(-30, 60, 40); scene.add(moon);
const pLight = (c, i, d, x, y, z, parent = CUR) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); parent.add(l); return l; };

// ====================================================================== animated canvas screens
function screenMat(w = 32, h = 20, type, col) { const t = ctex(w, h, (c) => { c.fillStyle = '#06101c'; c.fillRect(0, 0, w, h); }); t.magFilter = THREE.NearestFilter;
  anim.screens.push({ t, type: type || pick(['code', 'graph', 'radar', 'bars', 'wave', 'code']), col: hex(col || pick([C.cyan, C.mag, C.amber, C.mint])), ph: Math.random() * 9, hist: [] });
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); }
function drawScreen(s, t) { const c = s.t.userData.c.getContext('2d'), w = s.t.userData.c.width, h = s.t.userData.c.height; c.fillStyle = s.col;
  if (s.type === 'code') { c.drawImage(s.t.userData.c, 0, -2); c.fillStyle = '#06101c'; c.fillRect(0, h - 2, w, 2); if (Math.random() < .8) { c.fillStyle = s.col; c.fillRect(2 + (Math.random() * 4 | 0) * 2, h - 2, rnd(4, w - 6), 1); } }
  else if (s.type === 'graph') { s.hist.push(clamp((s.hist.at(-1) ?? h / 2) + rnd(-3, 3), 2, h - 2)); if (s.hist.length > w) s.hist.shift(); c.fillStyle = '#06101c'; c.fillRect(0, 0, w, h); c.strokeStyle = s.col; c.beginPath(); s.hist.forEach((v, i) => i ? c.lineTo(i, v) : c.moveTo(i, v)); c.stroke(); }
  else if (s.type === 'radar') { c.fillStyle = 'rgba(6,16,28,.45)'; c.fillRect(0, 0, w, h); c.strokeStyle = s.col; const a = t * 3 + s.ph, r = Math.min(w, h) / 2 - 1; c.beginPath(); c.arc(w / 2, h / 2, r, 0, 7); c.stroke(); c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); c.stroke(); }
  else if (s.type === 'bars') { c.fillStyle = '#06101c'; c.fillRect(0, 0, w, h); c.fillStyle = s.col; for (let x = 1; x < w - 1; x += 3) { const v = Math.abs(Math.sin(t * 2 + x * .7 + s.ph)) * (h - 3) + 1; c.fillRect(x, h - v, 2, v); } }
  else if (s.type === 'game') { c.fillStyle = '#06101c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb347'; c.fillRect((t * 14 + s.ph * 5) % w, h - 4, 3, 3); c.fillStyle = s.col; c.fillRect(w / 2 + Math.sin(t * 3) * 6, 2 + (t * 8 % (h - 4)), 2, 2); }
  else if (s.type === 'billboard') { c.fillStyle = '#0d1424'; c.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${130 + Math.random() * 100 | 0},140,180,.25)`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    const gl = Math.random() < .08 ? (Math.random() - .5) * 12 : 0; c.textAlign = 'center'; c.font = `bold ${h * .32 | 0}px monospace`; c.fillStyle = '#3ff0ff'; c.shadowColor = '#3ff0ff'; c.shadowBlur = 8; c.fillText(['NEONLOOM', 'HOUSE PLANS', 'DREAM BIG', '24/7 OPEN'][Math.floor(t / 4) % 4], w / 2 + gl, h * .55);
    c.font = `${h * .12 | 0}px monospace`; c.fillStyle = '#ff3fa4'; c.shadowColor = '#ff3fa4'; c.fillText('* DIGITAL DOWNLOAD *', w / 2 - gl, h * .82); c.shadowBlur = 0; if (gl) { c.fillStyle = 'rgba(63,240,255,.4)'; c.fillRect(0, Math.random() * h, w, 3); } }
  else { c.fillStyle = '#06101c'; c.fillRect(0, 0, w, h); c.strokeStyle = s.col; c.beginPath(); for (let x = 0; x < w; x++) c.lineTo(x, h / 2 + Math.sin(x * .5 + t * 6 + s.ph) * Math.sin(t + s.ph) * (h / 2 - 2)); c.stroke(); }
  s.t.needsUpdate = true; }

// ====================================================================== prop library (all modelled in code)
function neonSign(txt, col, x, y, z, size = .45, ry = 0, vertical = false) {
  const chars = vertical ? [...txt] : [txt], cw = vertical ? 64 : Math.max(64, txt.length * 34), ch = vertical ? chars.length * 60 + 8 : 64;
  const t = ctex(cw, ch, c => { c.font = 'bold 46px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.shadowColor = hex(col); c.shadowBlur = 14; chars.forEach((s, i) => c.fillText(s, cw / 2, vertical ? 34 + i * 60 : ch / 2)); });
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, color: new THREE.Color(col).multiplyScalar(2.2), toneMapped: false, depthWrite: false });
  const m = plane(size * cw / 64, size * ch / 64, mat, x, y, z, ry); anim.neon.push({ m, base: mat.color.clone() }); return m; }
function deskUnit(x, y, mons = 3, col = C.cyan) {
  const g = new THREE.Group(); g.position.set(x, y, .95); CUR.add(g);
  box(2.4, .07, .9, mats.deskTop, 0, .74, 0, g); box(.06, .74, .8, mats.metal, -1.12, 0, 0, g); box(.06, .74, .8, mats.metal, 1.12, 0, 0, g); box(.6, .62, .8, mats.desk, .8, 0, 0, g);
  for (let i = 0; i < mons; i++) { const mx = (i - (mons - 1) / 2) * .74, my = .82 + (i === (mons - 1) / 2 ? .08 : 0), ry = (mons - 1) / 2 - i; const mg = new THREE.Group(); mg.position.set(mx, my, -.2); mg.rotation.y = ry * .18; g.add(mg);
    box(.7, .44, .04, mats.dark, 0, .06, 0, mg); plane(.64, .38, screenMat(32, 20, null, col), 0, .28, .025, 0, mg); box(.06, .1, .06, mats.metal, 0, -.04, -.03, mg); }
  box(.9, .03, .28, mats.dark, 0, .78, .22, g); box(.1, .03, .14, mats.dark, .6, .78, .25, g); rbox(.1, .12, .1, .02, M(pick([C.mag, 0xe5e7eb, C.amber])), -.9, .78, .2, g);
  const lamp = new THREE.Group(); lamp.position.set(-1, .78, -.25); g.add(lamp); box(.14, .03, .14, mats.dark, 0, 0, 0, lamp); box(.03, .42, .03, mats.metal, 0, .03, 0, lamp); box(.2, .08, .12, E(0xffa24d, 2.4), .06, .44, 0, lamp);
  box(.24, .03, .2, M(0xd8dee8), .7, .78, -.1, g); }
function chair(x, y, z, col) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); const cm = M(col, { roughness: .5 });
  rbox(.55, .1, .5, .04, cm, 0, .46, 0, g); rbox(.55, .7, .1, .04, cm, 0, .56, .26, g); box(.56, .04, .02, E(C.cyan, 1.5), 0, 1.2, .3, g); box(.06, .4, .06, mats.metal, 0, .06, 0, g);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; box(.28, .04, .05, mats.dark, Math.cos(a) * .14, .04, Math.sin(a) * .14, g).rotation.y = -a; } return g; }
function rackUnit(x, y, z, h = 2.4) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); box(.7, h, .8, mats.dark, 0, 0, 0, g);
  const t = ctex(16, 64, () => {}); t.magFilter = THREE.NearestFilter; anim.screens.push({ t, type: 'leds', col: '#3ff0ff', ph: 0, hist: [] }); plane(.6, h - .1, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), 0, h / 2, .41, 0, g); }
function shelf(x, y, z, w, h, R2) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); box(w, h, .45, M(0x1c2232), 0, 0, 0, g);
  for (let yy = .3; yy < h - .1; yy += .5) { box(w - .06, .03, .44, mats.metal, 0, yy, .01, g); for (let k = -w / 2 + .1; k < w / 2 - .15;) { const bw = .08 + R2() * .18, bh = .15 + R2() * .25; box(bw, bh, .3, M(pick([C.violet, C.cyan, C.mag, 0xffcf73, 0x7a8498, 0x4a5672, 0xd6a76c]), { roughness: .6 }), k + bw / 2, yy + .03, .03, g); k += bw + .02; } } }
function poster(x, y, z, w, h, col) { const t = ctex(24, 32, c => { c.fillStyle = '#121826'; c.fillRect(0, 0, 24, 32); c.strokeStyle = hex(col); c.lineWidth = 2; c.strokeRect(1, 1, 22, 30); c.fillStyle = hex(col) + '88'; c.fillRect(4, 4, 16, 14); c.fillStyle = hex(col); c.fillRect(4, 22, 12, 2); c.fillRect(4, 26, 8, 2); });
  plane(w, h, new THREE.MeshBasicMaterial({ map: t }), x, y, z); }
function plant(x, y, z, s = 1) { box(.36 * s, .36 * s, .36 * s, M(0x5a3a22), x, y, z); for (let k = 0; k < 10; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.08 * s, .7 * s, 4), M(pick([0x1f6b4a, 0x2f9a66]))); l.position.set(x + rnd(-.2, .2) * s, y + .55 * s + rnd(0, .3) * s, z + rnd(-.2, .2) * s); l.rotation.set(rnd(-.6, .6), 0, rnd(-.6, .6)); CUR.add(l); } }
function vending(x, y, z, col) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); rbox(.9, 1.9, .7, .05, M(0x1d2333), 0, 0, 0, g);
  const t = ctex(24, 40, c => { c.fillStyle = '#0f1522'; c.fillRect(0, 0, 24, 40); for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) { c.fillStyle = pick(['#ff3fa4', '#3ff0ff', '#ffcf73', '#9fffcf']); c.fillRect(2 + k * 5, 3 + r * 6, 4, 4); } });
  plane(.6, 1.1, new THREE.MeshBasicMaterial({ map: t, color: 0xdddddd, toneMapped: false }), -.08, 1.15, .36, 0, g); box(.9, .05, .72, E(col, 2), 0, 1.86, 0, g); box(.15, .3, .02, E(col, 1.4), .32, 1, .36, g); }
function arcade(x, y, z, col) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); box(.75, 1.7, .7, M(0x1b1f30), 0, 0, 0, g); box(.78, .18, .72, E(col, 2), 0, 1.72, 0, g);
  const sc = plane(.55, .42, screenMat(32, 24, 'game', col), 0, 1.25, .36, 0, g); sc.rotation.x = -.15; box(.7, .08, .3, mats.trim, 0, .92, .38, g); box(.06, .06, .06, E(C.red, 2), -.15, 1, .45, g); box(.06, .06, .06, E(C.cyan, 2), .15, 1, .45, g); }
function couch(x, y, z, col = 0x4a2a5a) { const cm = M(col, { roughness: .9 }); rbox(2.2, .45, .9, .1, cm, x, y + .15, z); rbox(2.2, .6, .25, .1, cm, x, y + .3, z - .4); rbox(.25, .5, .9, .08, cm, x - 1.1, y + .15, z); rbox(.25, .5, .9, .08, cm, x + 1.1, y + .15, z); for (const dx of [-.5, .4]) rbox(.6, .35, .15, .07, M(pick([C.cyan, C.mag, C.amber])), x + dx, y + .6, z - .2); }
function bean(x, y, z, col) { const m = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8), M(col, { roughness: .9 })); m.scale.set(1, .6, 1); m.position.set(x, y + .27, z); CUR.add(m); }
function holoTable(x, y, z, big = 1) { box(1.3 * big, .7, 1.3 * big, mats.dark, x, y, z); box(1.32 * big, .04, 1.32 * big, E(C.cyan, 1.5), x, y + .7, z);
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.32 * big, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(1.8), wireframe: true, toneMapped: false })); s.position.set(x, y + 1.25, z); CUR.add(s);
  const r = new THREE.Mesh(new THREE.TorusGeometry(.5 * big, .015, 6, 32), E(C.cyan, 2)); r.rotation.x = Math.PI / 2; r.position.set(x, y + .95, z); CUR.add(r); anim.holo.push(s, r); anim.spin.push(s);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5 * big, .55 * big, .5, 20, 1, true), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false })); beam.position.set(x, y + .97, z); CUR.add(beam); }
function steam(x, y, z) { for (let k = 0; k < 3; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xdfe6f5, transparent: true, opacity: .35, depthWrite: false })); CUR.add(sp); anim.steam.push({ sp, x, y, z, t: k * .8, g: CUR }); } }
function catenary(a, b, sag, n = 24) { const pts = []; for (let i = 0; i <= n; i++) { const k = i / n; pts.push(a.clone().lerp(b, k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * sag, 0))); } return pts; }
function cable(a, b, sag, col = 0x0c0f17, r = .025) { CUR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(catenary(a, b, sag)), 24, r, 4), M(col))); }
function stringLights(a, b, sag) { const pts = catenary(a, b, sag, 30); cable(a, b, sag, 0x0c0f17, .015); const bm = E(0xffd9a0, 2.2); for (let i = 1; i < pts.length - 1; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 4), bm); m.position.copy(pts[i]); CUR.add(m); } }
function hazard(x, y, z, w, d) { const t = ctex(16, 4, c => { for (let i = 0; i < 16; i += 4) { c.fillStyle = '#ffcf3a'; c.fillRect(i, 0, 2, 4); c.fillStyle = '#111'; c.fillRect(i + 2, 0, 2, 4); } }); t.wrapS = THREE.RepeatWrapping; t.repeat.set(w * 2, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t })); m.rotation.x = -Math.PI / 2; m.position.set(x, y + .012, z); CUR.add(m); }

// ====================================================================== the building
const winCity = ctex(256, 96, c => { const gr = c.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, '#1a2131'); gr.addColorStop(1, '#4d5a75'); c.fillStyle = gr; c.fillRect(0, 0, 256, 96); });
function buildFloor(f) {
  const F = FL[f], y = F.y, x0 = F.ix0, x1 = F.ix1, w = x1 - x0, cx = (x0 + x1) / 2;
  box(w + .4, .3, D + .3, mats.slab, cx, y - .3, D / 2); box(w, .02, D, mats.floor, cx, y, D / 2);                                     // floor slab
  box(w + .4, .06, .06, E([C.mag, C.cyan, C.mag, C.cyan, C.amber, C.cyan][f], 1.5), cx, y - .33, D + .17);                            // neon edge
  if (f < 5) { // back wall: glass curtain wall with mullions + spandrels
    box(w, .8, .2, mats.wall2, cx, y, .1); box(w, .5, .2, mats.wall2, cx, y + FH - .8, .1); plane(w, FH - 1.3, mats.glass, cx, y + .8 + (FH - 1.3) / 2, .05);
    for (let k = x0; k <= x1 + .01; k += 1.6) box(.08, FH - .3, .14, mats.frame, Math.min(k, x1), y, .12); box(w, .06, .14, mats.frame, cx, y + 2, .12);
    box(.25, FH - .3, D, mats.wall, x0 + .12, y, D / 2); box(.25, FH - .3, D, mats.wall, x1 - .12, y, D / 2);                            // side walls
    box(w, .3, D, mats.slab, cx, y + FH - .3, D / 2);                                                                                   // ceiling slab
    for (let k = x0 + 2; k < x1 - 1; k += 4) { box(1.2, .05, .3, E(0xdfe8ff, 1.1), k, y + FH - .36, 2.6); }
    for (let k = x0 + 4; k < x1 - 2; k += 8) pLight(0xc9d6f2, 7, 9, k, y + FH - .7, 3);
  }
  if (F.x0 < x0 && f > 0) { box(x0 - F.x0, .12, 1.4, mats.metal, (F.x0 + x0) / 2, y - .12, 3); for (let k = F.x0; k < x0; k += .5) box(.03, 1, .03, mats.metal, k, y, 2.3); box(x0 - F.x0, .04, .04, mats.metal, (F.x0 + x0) / 2, y + 1, 2.3); }
}
const R7 = rng(7);
{ CUR = scene;
  for (let f = 0; f < 6; f++) buildFloor(f);
  // room dividers (glass) + room name signs
  for (const r of ROOMS) { const y = FL[r.f].y; if (r.f < 5 && r.x0 > FL[r.f].ix0 + .2) { box(.08, FH - .3, D * .62, mats.frame, r.x0, y, D * .31); plane(D * .6, FH - .4, mats.glass, r.x0 + .05, y + (FH - .4) / 2, D * .3, Math.PI / 2); }
    neonSign(r.name.split(' ')[0], r.c, (r.x0 + r.x1) / 2, y + FH - .62, .32, .32); }
  // ---- F0 SHOP + LOUNGE (open storefront, awning)
  let y = 0;
  shelf(11.4, y, .4, 2, 2.2, R7); shelf(19.6, y, .4, 2, 2.2, R7); deskUnit(14, y, 2, C.mag); chair(14, y, SEAT_Z, 0x3a1a3a); neonSign('OPEN', C.mag, 10.9, 2.1, 5.2, .5);
  box(11.2, .12, 1.6, M(0x5a1a3a), 15.6, FH - .5, 6.6); for (let k = 10.3; k < 21; k += .7) box(.5, .3, .02, M(k % 1.4 < .7 ? 0xff3fa4 : 0xc42a7c), k, FH - .8, 7.4);
  box(2.4, 1, .7, M(0x2a3142), 17, y, 3.8); box(2.4, .04, .7, E(C.mag, 2), 17, y + 1, 3.8); for (let k = 0; k < 4; k++) rbox(.3, .4, .3, .03, M(pick([0xd6a76c, 0xe2e8f0, C.violet])), 16.2 + k * .5, y + 1.04, 3.8);
  couch(24.6, y, 1, 0x4a2a5a); box(1.2, .4, .6, mats.dark, 24.6, y, 2.3); vending(31.7, y, .6, C.cyan); arcade(28.7, y, .7, C.mag); arcade(30.1, y, .7, C.cyan);
  box(1, 1, .6, M(0x2a3142), 22.4, y, .5); box(.5, .3, .3, mats.metal, 22.4, y + 1, .5); steam(22.4, y + 1.4, .5); plane(2.4, 1.2, screenMat(48, 24, 'wave', C.violet), 26.8, 2.2, .25);
  bean(26.2, y, 2.8, 0x1e3a5f); bean(27.4, y, 3, 0x4a2a5a); plant(32.4, y, 3.6); plant(21.6, y, 4.8, .8);
  // ---- F1 ARCHIVE + FINANCE
  y = FH; for (const x of [11.6, 13.8, 18.6, 20.8]) shelf(x, y, .4, 2, 2.5, R7); deskUnit(16.2, y, 3, C.amber); chair(16.2, y, SEAT_Z, 0x3a2a1a); for (let k = 0; k < 3; k++) box(.6, .5, .5, M(0xb38b5a), 12 + k * .7, y, 3.3 + (k % 2) * .4);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .3, 24), M(0x5a6478, { metalness: .8, roughness: .3 })); vd.rotation.x = Math.PI / 2; vd.position.set(32.4, y + 1.3, .4); CUR.add(vd);
  const vr = new THREE.Mesh(new THREE.TorusGeometry(.75, .05, 8, 24), E(C.amber, 2)); vr.position.set(32.4, y + 1.3, .58); CUR.add(vr); for (let k = 0; k < 4; k++) box(.08, 1.2, .06, mats.metal, 32.4, y + .7, .6).rotation.z = k * Math.PI / 4;
  deskUnit(28, y, 3, C.amber); chair(28, y, SEAT_Z, 0x3a2a1a); rbox(1, 1, .8, .05, M(0x3a4458, { metalness: .6 }), 24, y, .6); for (let i = 0; i < 6; i++) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .08, 12), M(0xffc94a, { metalness: .9, roughness: .3, emissive: 0x553300 })); cn.position.set(25.2 + (i % 3) * .1, y + .04 + i * .08, 1.2); CUR.add(cn); }
  plane(2.6, 1.3, screenMat(48, 24, 'graph', C.amber), 25.6, y + 2.3, .25);
  // ---- F2 WRITERS STUDIO + QA BAY
  y = FH * 2; box(2.6, 1.5, .08, M(0xd8dee8), 12, y + .9, .3); for (let i = 0; i < 12; i++) box(.24, .24, .02, M(pick([0xffcf73, 0xff9fd0, 0x9fffcf, 0xa9ecff])), 11 + (i % 6) * .38, y + 1.1 + (i / 6 | 0) * .55, .36);
  shelf(19.8, y, .4, 2.2, 2.5, R7); deskUnit(14.5, y, 2, C.violet); chair(14.5, y, SEAT_Z, 0x2a1a4a); plant(17.8, y, 1, 1.1); bean(18.6, y, 3.2, 0x5a3a6a);
  for (const x of [22.6, 24]) box(.12, 2.6, .12, mats.metal, x, y, 2.4); box(1.5, .12, .12, mats.metal, 23.3, y + 2.6, 2.4); const scan = plane(1.3, .04, E(C.amber, 3), 23.3, y + 1, 2.4); scan.rotation.x = -Math.PI / 2; anim.scan.push({ m: scan, y });
  deskUnit(26.5, y, 3, C.amber); chair(26.5, y, SEAT_Z, 0x1a2a3a); hazard(30.5, y, 3, 4, .3); box(2.6, .8, .7, mats.desk, 30.6, y, .8); for (let k = 0; k < 3; k++) { const tb = plane(.4, .3, screenMat(16, 12, 'bars', C.amber), 29.8 + k * .8, y + .9, .9); tb.rotation.x = -1.1; }
  // ---- F3 LAB + DATA + GROWTH (+ VTOL pad left)
  y = FH * 3; for (let k = 0; k < 3; k++) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1.8, 14), new THREE.MeshPhysicalMaterial({ color: 0x9fffcf, transparent: true, opacity: .35, emissive: 0x1a6050, roughness: .1 })); tube.position.set(11.8 + k * .6, y + .95, .6); CUR.add(tube); box(.5, .12, .5, mats.metal, 11.8 + k * .6, y, .6); box(.5, .12, .5, mats.metal, 11.8 + k * .6, y + 1.85, .6); anim.tubes.push(tube); }
  deskUnit(14.5, y, 2, C.mint); chair(14, y, SEAT_Z, 0x1a3a2a); holoTable(17.6, y, 3.4, .8);
  plane(3.2, 1.6, screenMat(64, 32, 'graph', C.cyan), 21, y + 2.2, .25); rackUnit(25.8, y, .5); rackUnit(26.6, y, .5); deskUnit(22.5, y, 3, C.cyan); chair(22.5, y, SEAT_Z, 0x1a2a3a);
  box(2.4, 2.2, .06, M(0x1f6b4a, { roughness: .9 }), 29, y + .1, .3); deskUnit(31, y, 2, C.mag); chair(31, y, SEAT_Z, 0x3a1a2a); const ring = new THREE.Mesh(new THREE.TorusGeometry(.35, .05, 8, 24), E(0xffffff, 2.4)); ring.position.set(33.6, y + 1.6, 2.4); ring.rotation.y = -.6; CUR.add(ring); box(.05, 1.6, .05, mats.metal, 33.6, y, 2.4);
  box(.3, .25, .4, mats.dark, 28.4, y + 1.2, 3.2); box(.05, 1.2, .05, mats.metal, 28.4, y, 3.2); box(.06, .06, .06, E(C.red, 3), 28.4, y + 1.36, 3.42); for (let i = 0; i < 4; i++) poster(30 + i * .55, y + 2.4, .22, .45, .6, pick([C.mag, C.cyan, C.amber]));
  box(6.6, .25, 5, mats.slab, 5.7, y - .25, 3); hazard(5.7, y, 3, 6.4, .25); hazard(5.7, y, .6, 6.4, .25); for (const x of [2.8, 5.7, 8.6]) { box(.12, .06, .12, E(C.red, 3), x, y + .02, 5.4); anim.blink.push({ m: CUR.children.at(-1), ph: x }); }
  for (const x of [3, 8.4]) { const s = box(.18, 4.5, .18, mats.frame, x, y - 4.6, 4.6); s.rotation.z = x < 5 ? .35 : -.15; }
  // ---- F4 COMMAND DECK
  y = FH * 4; deskUnit(16, y, 3, C.cyan); chair(16, y, SEAT_Z, 0x1a2a4a); for (let k = 0; k < 3; k++) plane(1.9, 1, screenMat(48, 24, null, pick([C.cyan, C.mag])), 13 + k * 2.1, y + 2.3, .26);
  holoTable(24, y, 2.4, 1.3); vending(30.8, y, .6, C.mag); plant(12.4, y, 4.6); for (let i = 0; i < 4; i++) poster(27 + i * .6, y + 2.3, .22, .5, .65, pick([C.cyan, C.mag, C.amber]));
  // ---- ROOF: server container, water tank, AC, antenna, dish, rooftop billboard
  y = FH * 5; for (let k = 10; k <= 34; k += .6) box(.04, .9, .04, mats.metal, k, y, D - .1); box(24, .05, .05, mats.metal, 22, y + .9, D - .1);
  box(10, .25, D - 1, mats.frame, 21, y + 3.1, (D - 1) / 2); box(.25, 3.1, D - 1, mats.frame, 16.1, y, (D - 1) / 2); box(.25, 3.1, D - 1, mats.frame, 25.9, y, (D - 1) / 2); box(10, 3.1, .2, mats.wall2, 21, y, .1);
  for (let k = 16.6; k < 25.6; k += .5) box(.06, 3.1, .08, mats.trim, k, y, .25); for (const x of [17.2, 18, 18.8, 23.2, 24, 24.8]) rackUnit(x, y, .6, 2.6); deskUnit(21, y, 2, C.mag); chair(21, y, SEAT_Z, 0x3a1a2a); pLight(C.mag, 6, 7, 21, y + 2.6, 2.5);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 16), M(0x3a4458, { metalness: .6, roughness: .4 })); tank.position.set(12.4, y + 2.1, 2); CUR.add(tank); for (const [dx, dz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) box(.08, 1, .08, mats.trim, 12.4 + dx, y, 2 + dz);
  for (const x of [28, 29.6]) { box(1.3, .9, 1.1, M(0x56627a, { metalness: .4 }), x, y, 2.5); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .03, 12), mats.dark); fan.position.set(x, y + .92, 2.5); CUR.add(fan); box(.75, .02, .08, M(0x8a94a8), 0, .02, 0, fan); anim.spin.push(fan); fan.userData.fast = true; }
  box(.1, 6, .1, mats.dark, 32.6, y, 1.2); for (let k = 1; k < 6; k += 1.2) box(.7, .04, .04, mats.dark, 32.6, y + k, 1.2); { const tip = box(.2, .2, .2, E(C.red, 3), 32.6, y + 6, 1.2); anim.blink.push({ m: tip, ph: 1 }); }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), M(0xc6cfdf, { side: THREE.DoubleSide })); dish.rotation.x = -2.1; dish.position.set(31, y + 1.2, 4.2); CUR.add(dish);
  const bb = plane(9, 3.6, screenMat(192, 76, 'billboard'), 21, y + 6.2, .3); box(9.4, 4, .2, mats.frame, 21, y + 4.2, .15); for (const x of [17, 25]) box(.2, 4.4, .2, mats.frame, x, y + 3.2, .3);
  // ---- lift shaft (exterior glass) + cabin
  for (const [dx, dz] of [[-.9, 2.1], [.9, 2.1], [-.9, 3.9], [.9, 3.9]]) box(.1, FH * 5 + 1, .1, mats.frame, LIFT_X + dx, 0, dz); box(1.8, FH * 5 + 1, 1.8, mats.glass, LIFT_X, 0, 3);
  // ---- right exterior: AC units, pipes, vertical kanji sign, fire escape
  for (let f = 1; f < 5; f++) { const yy = FL[f].y; box(.9, .7, .7, M(0x56627a), FL[f].ix1 + .5, yy + .4, 1.2); box(2.4, .1, 1.2, mats.metal, FL[f].ix1 + 1.2, yy - .1, 4.8); for (let k = 0; k < 2.4; k += .3) box(.03, .9, .03, mats.metal, FL[f].ix1 + k, yy, 5.4);
    const st = box(.5, .06, 3.9, mats.metal, FL[f].ix1 + 1.9, yy - 1.7, 4.6); st.rotation.x = .78; }
  neonSign('ネオン織', C.mag, 36.4, FH * 3.2, 3.6, .8, -.35, true); neonSign('OPEN 24H', C.cyan, 35.6, FH * 1.5, 4.8, .45, -.35);
  for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, FH * 5, 8), mats.metal); p.position.set(34.2 + k * .25, FH * 2.5, .5 + k * .3); CUR.add(p); }
  // string lights across the front + hanging cables + vines
  stringLights(new THREE.Vector3(9.6, FH * 3 - .4, D + .3), new THREE.Vector3(35, FH * 3 - .4, D + .3), 1.2); stringLights(new THREE.Vector3(9.6, FH - .5, D + .5), new THREE.Vector3(33, FH - .5, D + .5), .7);
  for (let k = 0; k < 10; k++) { const x = rnd(10, 34), f = 1 + (k % 4); const p0 = new THREE.Vector3(x, FL[f].y - .35, D + .1); cable(p0, p0.clone().add(new THREE.Vector3(rnd(-1, 1), -rnd(.8, 2), .2)), .2); }
  for (let k = 0; k < 30; k++) { const f = 1 + (k % 5), x = rnd(FL[f].ix0, FL[f].ix1); for (let q = 0; q < 4; q++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.06, rnd(.3, .7), 4), M(0x1f5a3a)); l.position.set(x + rnd(-.1, .1), FL[f].y - .4 - q * .3, D + .12); l.rotation.x = Math.PI; CUR.add(l); } }
}

// ====================================================================== the street
{ CUR = scene;
  box(140, .2, 2.2, mats.walk, 10, -.2, 7); box(140, .2, 6, mats.road, 10, -.35, 11.1); box(140, .2, 3, mats.walk, 10, -.2, 15.5); box(140, .12, .2, M(0x4a5468), 10, -.12, 8.1);
  for (let x = -60; x < 80; x += 4) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2, .12), mats.paint); d.rotation.x = -Math.PI / 2; d.position.set(x, -.24, 11.1); CUR.add(d); }
  for (let i = 0; i < 30; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: .02, metalness: 1, transparent: true, opacity: .8 })); p.scale.set(rnd(1, 3.5), rnd(.3, .8), 1); p.rotation.x = -Math.PI / 2; p.position.set(rnd(-40, 50), -.23, rnd(8.6, 13.8)); CUR.add(p); }
  // near-left neighbour block (frames the composition)
  const nb = new THREE.Group(); nb.position.set(-26, 0, 2); CUR.add(nb); box(12, 34, 8, M(0x141a26), 0, 0, 0, nb);
  for (let yy = 1; yy < 33; yy += 3) { box(12.1, .15, 8.1, mats.frame, 0, yy + 2.6, 0, nb); for (let k = -5; k < 5; k += 2.2) { const lit = Math.random() < .45; box(1.6, 1.4, .05, lit ? E(0xffcf73, rnd(.5, 1.2)) : M(0x0d1119), k + .8, yy + .8, 4.03, nb); } box(1.2, .8, .7, M(0x3a4458), 5.4, yy + .4, 4.3, nb); }
  neonSign('ラーメン', C.mag, -19.6, 14, 6.2, .9, 0, true); neonSign('BAR', C.cyan, -19.4, 6, 6.2, .7, 0, true);
  // metro entrance
  box(7, .2, 2.4, mats.frame, -13, 2.6, 6.8); for (const x of [-16.4, -9.6]) box(.15, 2.6, .15, mats.metal, x, 0, 7.9); for (let i = 0; i < 6; i++) box(6 - i * .4, .2, .5, mats.dark, -13, -.2 - i * .18, 6.2 + i * .25); neonSign('METRO', C.cyan, -13, 3.3, 7.9, .5);
  // ramen stall
  box(6, .2, 2.4, M(0x5a1a2a), -4, 2.9, 6.4); for (let k = 0; k < 10; k++) box(.5, .9, .02, M(k % 2 ? 0xb3203f : 0xd4304f), -6.7 + k * .6, 2, 7.6); box(5.6, .9, .8, M(0x6b4a2a), -4, 0, 6);
  box(5.6, .08, .9, M(0x8a6a4a), -4, .9, 6); for (let k = 0; k < 5; k++) { box(.3, .06, .3, M(0x2a1a12), -6 + k * 1.1, .7, 7); box(.06, .7, .06, mats.dark, -6 + k * 1.1, 0, 7); }
  for (const x of [-6.9, -1.1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), E(0xff5a4a, 2.4)); l.scale.y = 1.3; l.position.set(x, 2.5, 7.5); CUR.add(l); } pLight(0xff7a50, 14, 9, -4, 2.2, 7.4); steam(-5.5, 1.1, 6); steam(-2.6, 1.1, 6);
  neonSign('ラーメン', C.mag, -4, 3.5, 7.6, .45);
  vending(1.8, 0, 6.6, C.cyan); vending(2.8, 0, 6.6, C.mag);
  // street lamps + hologram cones
  for (const x of [-9, 5, 26]) { box(.16, 5.4, .16, mats.frame, x, 0, 8.3); box(1.4, .12, .2, mats.frame, x + .6, 5.4, 8.3); box(.6, .06, .2, E(0xe8f0ff, 2.5), x + 1, 5.32, 8.3); pLight(0xd0dcff, 18, 12, x + 1, 5, 8.6);
    const cn = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: .022, depthWrite: false, side: THREE.DoubleSide })); cn.position.set(x + 1, 2.7, 8.5); CUR.add(cn); }
  for (const x of [-1, 7.4]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.3, .9, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a3d).multiplyScalar(1.8), transparent: true, opacity: .55, wireframe: Math.random() < .5, toneMapped: false })); c.position.set(x, .45, 8.9); CUR.add(c); anim.holo.push(c); }
  neonSign('STATION', C.mag, -13, 6.5, -6, 1, 0); neonSign('Recharging', C.amber, -13, 5.6, -6, .5, 0);
}

// ====================================================================== the city (3D, fogged)
{ CUR = scene; const winTex = ctex(32, 64, c => { c.fillStyle = '#000'; c.fillRect(0, 0, 32, 64); for (let y = 3; y < 64; y += 8) for (let x = 1; x < 32; x += 8) if (Math.random() < .32) { c.fillStyle = Math.random() < .85 ? '#ffcf73' : '#a9ecff'; c.globalAlpha = rnd(.5, 1); c.fillRect(x, y, 6, 4); c.globalAlpha = 1; } });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.magFilter = THREE.NearestFilter;
  const mats2 = [0x1c2233, 0x222a3d, 0x181d2b].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: .5, roughness: .9 }));
  const R2 = rng(99);
  for (let i = 0; i < 160; i++) { const x = -120 + R2() * 260, z = -50 - R2() * 130, w = 4 + R2() * 10, d = 4 + R2() * 10, h = 10 + R2() * (z < -60 ? 90 : 45); if (x > -2 && x < 42 && z > -20) continue;
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / 8, uv.getY(q) * h / 10);
    const m = new THREE.Mesh(geo, mats2[i % 3]); m.position.set(x, h / 2 - 2, z); CUR.add(m);
    if (R2() < .25) { const col = pick([C.mag, C.cyan, C.amber]); box(w * .9, .25, .25, E(col, 2), x, h - 2.1, z + d / 2 + .1); }
    if (R2() < .18) neonSign(pick(['バー', 'ホテル', '電脳', 'クラブ', '24H']), pick([C.mag, C.cyan]), x + w / 2 + .3, h * .5, z + d / 2, 1.2, 0, true);
    if (R2() < .12) { box(.3, 8, .3, mats.dark, x, h - 2, z); const tip = box(.6, .6, .6, E(C.red, 3), x, h + 6, z); anim.blink.push({ m: tip, ph: R2() * 6 }); } }
  // giant billboard tower mid-distance + searchlights
  box(14, 60, 10, M(0x161b28), -48, -2, -46); plane(12, 7, screenMat(192, 112, 'billboard'), -48, 30, -40.9);
  for (const [x, z] of [[-60, -80], [20, -110], [70, -70]]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(.5, 6, 140, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide })); sl.geometry.translate(0, 70, 0); sl.position.set(x, 0, z); CUR.add(sl); anim.spin.push({ search: sl, ph: Math.random() * 6 }); }
  const moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(64, 64, c => { const gr = c.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(235,240,255,1)'); gr.addColorStop(.25, 'rgba(220,228,250,.9)'); gr.addColorStop(.3, 'rgba(200,210,240,.25)'); gr.addColorStop(1, 'rgba(200,210,240,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }), fog: false, depthWrite: false }));
  moonS.scale.set(60, 60, 1); moonS.position.set(-90, 120, -300); scene.add(moonS);
}

// ====================================================================== procedural cyber-humans (no sprites)
const SKIN = [0xf1c7a5, 0xd9a47e, 0xb37a55, 0x8a5a3c, 0xe8b996];
const HAIR = [0x111318, 0x2a1a12, 0xe6e6f0, 0xff3fa4, 0x3ff0ff, 0x6a3cff, 0xffb347];
function makeBody(meta, seed) {
  const R2 = rng(seed * 97 + 13), acc = new THREE.Color(meta.color || '#3ff0ff'), accHex = acc.getHex();
  const skin = M(SKIN[(R2() * SKIN.length) | 0], { roughness: .6 }), jacket = M(new THREE.Color(accHex).lerp(new THREE.Color(0x141a26), .72).getHex(), { roughness: .5, metalness: .2 });
  const pants = M(pick([0x1b2232, 0x23283a, 0x2a2236]), { roughness: .8 }), boots = M(0x0b0d12, { roughness: .4 }), glow = E(accHex, 2.6), hairM = M(HAIR[(R2() * HAIR.length) | 0], { roughness: .5 });
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = .92; root.add(hips);
  const leg = s => { const p = new THREE.Group(); p.position.set(s * .11, 0, 0); hips.add(p); rbox(.17, .82, .19, .05, pants, 0, -.84, 0, p); rbox(.2, .14, .3, .04, boots, 0, -.94, .04, p); box(.18, .03, .2, glow, 0, -.5, 0, p); return p; };
  const legL = leg(-1), legR = leg(1);
  const torso = new THREE.Group(); hips.add(torso); rbox(.46, .64, .27, .07, jacket, 0, 0, 0, torso); box(.47, .035, .28, glow, 0, .12, 0, torso); rbox(.3, .14, .29, .04, jacket, 0, .58, 0, torso);
  if (R2() < .6) rbox(.32, .4, .14, .04, M(0x10141d), 0, .14, -.2, torso); if (R2() < .5) box(.04, .3, .01, glow, .12, .22, .14, torso);
  const head = new THREE.Group(); head.position.y = .7; torso.add(head); rbox(.11, .1, .11, .03, skin, 0, -.04, 0, head); rbox(.3, .32, .3, .08, skin, 0, .04, 0, head);
  const style = R2(); if (style < .4) { rbox(.33, .14, .33, .06, hairM, 0, .27, -.01, head); rbox(.33, .22, .08, .04, hairM, 0, .12, -.14, head); } else if (style < .7) { box(.1, .16, .3, hairM, 0, .36, 0, head); rbox(.31, .06, .31, .03, hairM, 0, .3, 0, head); } else { rbox(.34, .36, .34, .1, hairM, 0, .1, -.03, head); }
  if (R2() < .55) box(.28, .06, .04, glow, 0, .18, .15, head); else { box(.06, .04, .02, E(0x0b0d12), -.07, .18, .155, head); box(.06, .04, .02, glow, .07, .18, .155, head); }
  const arm = s => { const p = new THREE.Group(); p.position.set(s * .3, .5, 0); torso.add(p); rbox(.13, .56, .14, .05, jacket, 0, -.56, 0, p); box(.14, .03, .15, glow, 0, -.46, 0, p); rbox(.11, .12, .12, .03, skin, 0, -.66, 0, p); return p; };
  const armL = arm(-1), armR = arm(1);
  const cup = new THREE.Group(); armR.add(cup); cup.position.set(0, -.72, .06); box(.09, .12, .09, M(0xe8e8e8), 0, 0, 0, cup); cup.visible = false;
  const pick2 = []; root.traverse(o => { if (o.isMesh) pick2.push(o); });
  return { root, hips, legL, legR, torso, head, armL, armR, cup, meshes: pick2 };
}

// ====================================================================== sound (synth, no files)
const Sound = (() => {
  let ctx = null, master = null, on = !Q.has('mute');
  const unlock = () => { if (ctx || !on) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = .35; master.connect(ctx.destination); ambient(); };
  function noise(sec) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; }
  function ambient() { const gg = ctx.createGain(); gg.gain.value = .05; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.connect(gg); gg.connect(master); for (const fr of [55, 55.4, 82.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); }
    const n = noise(4), ng = ctx.createGain(), nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = .4; ng.gain.value = .05; n.connect(nf); nf.connect(ng); ng.connect(master); n.loop = true; n.start(); }
  function tone(freq, dur, type = 'square', vol = .12, slide = 0) { if (!ctx) return; const o = ctx.createOscillator(), gg = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur); gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(gg); gg.connect(master); o.start(t); o.stop(t + dur); }
  function burst(dur, vol, lp = 800, type = 'lowpass') { if (!ctx) return; const n = noise(dur), gg = ctx.createGain(), f = ctx.createBiquadFilter(), t = ctx.currentTime; f.type = type; f.frequency.value = lp; gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(.0001, t + dur); n.connect(f); f.connect(gg); gg.connect(master); n.start(); }
  return { unlock, toggle() { on = !on; if (!on && ctx) { ctx.close(); ctx = null; } else unlock(); toast(on ? '🔊 Suara ON' : '🔇 Suara OFF'); },
    blip: () => tone(rnd(700, 1100), .06, 'square', .04), type: () => tone(rnd(1800, 2600), .012, 'square', .015), chime: () => { tone(880, .25, 'triangle', .1); setTimeout(() => tone(1320, .35, 'triangle', .08), 110); },
    error: () => tone(140, .4, 'sawtooth', .12, .6), ding: () => { tone(1568, .4, 'sine', .07); setTimeout(() => tone(1175, .5, 'sine', .05), 150); }, zap: () => { tone(2400, .12, 'sawtooth', .06, .1); burst(.15, .08, 4000); },
    roar: () => { tone(90, 2.2, 'sawtooth', .2, .5); burst(2, .25, 500); }, boom: () => { tone(60, 1.2, 'sine', .35, .3); burst(1.2, .4, 300); }, step: () => { tone(45, .4, 'sine', .25, .5); burst(.3, .15, 200); },
    car: () => burst(1.2, .05, 700, 'bandpass'), thunder: () => { tone(40, 2.5, 'sine', .3, .5); burst(2.8, .35, 260); }, vtol: () => { tone(110, 3, 'sawtooth', .07, 1.6); burst(3, .1, 600); }, whoosh: () => burst(1.4, .12, 1800, 'bandpass'),
    mecha: () => { tone(220, .5, 'square', .1, 2); setTimeout(() => tone(330, .6, 'sawtooth', .1, .5), 300); burst(.6, .12, 1500); }, ufo: () => { for (let i = 0; i < 6; i++) setTimeout(() => tone(600 + i * 120, .25, 'sine', .06, 1.5), i * 120); },
    power: () => tone(320, 1.2, 'sawtooth', .12, .15), party: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .2, 'square', .05), i * 90)) };
})();

// ====================================================================== overlay helpers
const overlay = document.getElementById('overlay');
const el = (cls, html = '', parent = overlay) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(text) { const bx = document.getElementById('toasts'); if (!bx) return; const t = el('toast warn', `<i style="background:#ff3fa4"></i><div><b>NEONLOOM CITY</b><span>${esc(text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 6000); setTimeout(() => t.remove(), 6800); }
const project = v => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * host.clientWidth, (1 - p.y) / 2 * host.clientHeight, p.z < 1]; };

// ====================================================================== NPCs
const npcs = {}, isWork = n => ['working', 'queued'].includes(n.server.status);
const laneZ = (f, x) => f === 0 && x < 10.4 ? WALK_OUT : LANE;
let seedN = 1;
class NPC {
  constructor(name) {
    this.name = name; this.meta = META[name] || { name, color: '#3ff0ff', role: '', desc: '' }; [this.sf, this.sx] = SEATS[name];
    this.b = makeBody(this.meta, seedN++); scene.add(this.b.root); for (const m of this.b.meshes) m.userData.npc = this;
    this.f = this.sf; this.x = this.sx; this.z = SEAT_Z; this.y = FL[this.f].y; this.way = []; this.legs = []; this.mode = 'free'; this.server = { status: 'idle' }; this.next = now() + rnd(3000, 12000); this.history = []; this.act = 'sit'; this.actUntil = 0; this.t = Math.random() * 9; this.face = Math.PI; this.faceT = Math.PI;
    this.tag = el('npc-tag', `<b>${name}</b>`); this.tag.style.setProperty('--c', this.meta.color); this.tag.onclick = () => openNPC(this); this.bubble = el('bubble hidden', ''); this.icon = el('npc-icon', ''); this.carry = el('npc-carry hidden', '📦');
    this.sit();
  }
  sit() { this.f = this.sf; this.x = this.sx; this.z = SEAT_Z; this.y = FL[this.f].y; this.sitting = true; this.act = 'sit'; this.faceT = Math.PI; }
  moving() { return this.way.length || this.lift || this.legs.length; }
  goTo(f, x, z, done) { this.sitting = false; this.act = 'walk'; x = clamp(x, FL[f].x0 + .3, FL[f].x1 - .3); if (z === undefined) z = laneZ(f, x);
    const legs = []; if (this.f !== f) legs.push({ f: this.f, x: LIFT_X, z: 3 }, { lift: f }); legs.push({ f, x, z }); this.legs = legs; this.done = done; if (!this.lift) this.nextLeg(); }
  nextLeg() { const L = this.legs.shift(); if (!L) { this.way = []; this.act = 'idle'; const d = this.done; this.done = null; d && d(); return; }
    if (L.lift !== undefined) { this.lift = { to: L.lift }; this.way = []; return; }
    const w = [], cl = laneZ(this.f, this.x), tl = laneZ(L.f, L.x); w.push([this.x, cl]);
    if (cl !== tl) { if (this.x >= 10.4) w.push([10.8, LANE], [10.8, WALK_OUT]); else w.push([10.8, WALK_OUT], [10.8, LANE]); }
    w.push([L.x, tl], [L.x, L.z]); this.way = w; }
  update(dt) {
    const b = this.b; this.t += dt;
    if (this.lift) { const ty = FL[this.lift.to].y, d = ty - this.y, sp = 2.6 * dt; this.act = 'ride'; this.faceT = 0;
      if (Math.abs(d) <= sp) { this.y = ty; this.f = this.lift.to; this.lift = null; Sound.ding(); liftCab.position.y = ty; this.nextLeg(); } else { this.y += Math.sign(d) * sp; liftCab.position.y = this.y; } }
    else if (this.way.length) { const [px, pz] = this.way[0], dx = px - this.x, dz = pz - this.z, dist = Math.hypot(dx, dz), sp = (this.running ? 3.4 : 1.6) * dt;
      if (dist > .02) this.faceT = Math.atan2(dx, dz); this.act = this.running ? 'run' : 'walk'; if (dist <= sp) { this.x = px; this.z = pz; this.way.shift(); if (!this.way.length) this.nextLeg(); } else { this.x += dx / dist * sp; this.z += dz / dist * sp; } this.y = FL[this.f].y; }
    else if (!this.sitting && this.actUntil && now() > this.actUntil) { this.act = 'idle'; this.actUntil = 0; b.cup.visible = false; }
    // turn smoothly
    let da = this.faceT - this.face; da = Math.atan2(Math.sin(da), Math.cos(da)); this.face += da * Math.min(1, dt * 10);
    b.root.position.set(this.x, this.y, this.z); b.root.rotation.y = this.face; this.pose(dt);
    if (this.sitting && isWork(this) && Math.random() < .03) Sound.type();
  }
  pose() { const b = this.b, t = this.t, A = this.act; let hy = .92, lL = 0, lR = 0, aL = 0, aR = 0, aLz = 0, aRz = 0, hx = 0, hyw = 0, ty = 0, lean = 0;
    if (A === 'walk' || A === 'run') { const s = Math.sin(t * (A === 'run' ? 13 : 8.5)), k = A === 'run' ? .9 : .55; lL = s * k; lR = -s * k; aL = -s * k * .8; aR = s * k * .8; hy = .92 + Math.abs(Math.cos(t * (A === 'run' ? 13 : 8.5))) * .04; lean = A === 'run' ? .15 : .03; }
    else if (A === 'sit') { hy = .5; lL = lR = -1.45; const typing = isWork(this); aL = aR = typing ? -1.15 + Math.sin(t * 18) * .08 : -.6; aRz = aLz = 0; if (typing) { aR += Math.sin(t * 17 + 1) * .08; hx = .12 + Math.sin(t * 2) * .03; } else { hyw = Math.sin(t * .6) * .4; hx = -.05; } }
    else if (A === 'talk') { aR = -.7 + Math.sin(t * 5) * .35; aRz = .2; hx = Math.sin(t * 6) * .08; hyw = Math.sin(t * 1.5) * .2; aL = -.1; }
    else if (A === 'celebrate') { aLz = -2.7 + Math.sin(t * 10) * .2; aRz = 2.7 - Math.sin(t * 10) * .2; hy = .92 + Math.abs(Math.sin(t * 7)) * .18; hx = -.15; }
    else if (A === 'dance') { aLz = -1.4 + Math.sin(t * 6) * .8; aRz = 1.4 + Math.sin(t * 6 + 1) * .8; hy = .9 + Math.abs(Math.sin(t * 6)) * .1; lL = Math.sin(t * 6) * .4; lR = -Math.sin(t * 6) * .4; ty = Math.sin(t * 3) * .4; hyw = Math.sin(t * 3) * .4; }
    else if (A === 'coffee') { this.b.cup.visible = true; aR = -2.2 + Math.max(0, Math.sin(t * 1.2)) * .5; aRz = .3; hx = -.05; }
    else if (A === 'frustrated') { aLz = -2.2; aRz = 2.2; aL = aR = -.6; hx = .3 + Math.sin(t * 12) * .05; hyw = Math.sin(t * 8) * .3; }
    else if (A === 'game') { aL = aR = -1.1 + Math.sin(t * 20) * .12; hx = .15; }
    else if (A === 'yawn') { aRz = 2.6; aLz = -.2; hx = -.35; }
    else if (A === 'ride') { hyw = Math.sin(t * .8) * .3; }
    else { hyw = Math.sin(t * .5) * .5; hx = Math.sin(t * .7) * .05; aL = Math.sin(t * 1.4) * .04; aR = -aL; hy = .92 + Math.sin(t * 2) * .006; }
    b.hips.position.y = hy; b.legL.rotation.x = lL; b.legR.rotation.x = lR; b.armL.rotation.set(aL, 0, aLz); b.armR.rotation.set(aR, 0, aRz); b.head.rotation.set(hx, hyw, 0); b.torso.rotation.set(lean, ty, 0); }
  busy() { return this.mode !== 'free' || this.inChat || isWork(this); }
  setStatus(a) { const prev = this.server.status; this.server = a; if (prev === a.status) return;
    this.icon.className = 'npc-icon ' + (a.status === 'error' ? 'err' : a.status === 'waiting' ? 'wait' : ''); this.icon.textContent = a.status === 'error' ? '!' : a.status === 'waiting' ? '?' : '';
    if (isWork(this)) { this.mode = 'work'; this.inChat = null; this.carry.classList.add('hidden'); if (!this.sitting) this.goDesk(); } else if (this.mode === 'work') { this.mode = 'free'; this.next = now() + rnd(3000, 7000); } }
  goDesk(cb) { this.b.cup.visible = false; this.goTo(this.sf, this.sx, SEAT_Z, () => { this.sit(); this.running = false; if (this.mode !== 'work') this.mode = 'free'; cb && cb(); }); }
  emote(kind, ms = 3200, face) { if (this.sitting || this.moving()) return; this.act = kind; this.actUntil = now() + ms; if (face !== undefined) this.faceT = face; }
  lookAt(x, z) { this.faceT = Math.atan2(x - this.x, z - this.z); }
  say(t, ms = 5000, kind = 'say') { const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), ms); this.history.unshift(t); this.history.length = Math.min(this.history.length, 12); Sound.blip(); }
  pop(e) { if (['error', 'waiting'].includes(this.server.status)) return; this.icon.className = 'npc-icon pop'; this.icon.textContent = e; clearTimeout(this._p); this._p = setTimeout(() => { if (this.icon.textContent === e) { this.icon.className = 'npc-icon'; this.icon.textContent = ''; } }, 2200); }
  life() {
    if (this.sitting && Math.random() < .035) this.pop(isWork(this) ? pick(['⌨️', '🧠', '📊', '⚡', '💾', '🔍']) : pick(['💡', '☕', '🎧', '💭', '😴', '📈', '🎵', '😎']));
    if (this.busy() || now() < this.next || Phase.cur) return; this.next = now() + rnd(9000, 20000);
    const r = Math.random(), others = Object.values(npcs).filter(n => n !== this && !n.busy());
    const at = (key, msgs, emo, ms = 10000) => { const [f, x, z, kind] = SPOTS[key]; this.mode = 'busy'; this.goTo(f, x + rnd(-.3, .3), z, () => {
      this.say(pick(msgs), 3500, 'chat'); this.faceT = kind === 'look' ? (key === 'metro' || key === 'ramen' || key === 'ramen2' ? Math.PI : key === 'pad' ? -Math.PI / 2 : 0) : (kind === 'game' || kind === 'snack' || kind === 'ramen' ? Math.PI : 0);
      this.emote(emo, ms * .8); if (kind === 'game') { this.pop('🎮'); setTimeout(() => Sound.party(), 1800); } setTimeout(() => this.goDesk(), ms); }); };
    if (r < .14) at(pick(['couch', 'coffee', 'vend']), ['Kopi dulu ☕', 'Snack biar fokus.', 'Rebahan bentar…', 'Vending ini macet lagi…'], pick(['coffee', 'idle', 'yawn']));
    else if (r < .24) at(pick(['arcade', 'arcade2']), ['Satu ronde aja 🎮', 'Highscore baru!', 'Combo x12!'], 'game');
    else if (r < .3) at('dance', ['Lagu ini enak 🎶', 'Dance break!'], 'dance');
    else if (r < .4) at(pick(['balcony', 'pad', 'window', 'metro']), ['Kota ini nggak pernah tidur.', 'Hujan neon lagi…', 'Lihat VTOL itu!', 'Mobil terbang makin ramai.'], 'idle', 8000);
    else if (r < .47) at(pick(['ramen', 'ramen2']), ['Ramen dulu 🍜', 'Satu mangkok pedas, paman!', 'Laper banget…'], 'coffee', 12000);
    else if (r < .6) { const o = others.find(n => n.sf === this.sf) || others[0]; if (o) startChat(this, o); }
    else if (r < .68 && others.length) { const o = pick(others); this.mode = 'busy'; this.goTo(o.sf, o.sx + .9, 3, () => { this.lookAt(o.sx, SEAT_Z); this.say(pick([`${o.name}, boleh diskusi sebentar?`, `Data ini cocok buat kamu, ${o.name}.`, 'Cek draft ini dong.']), 3800, 'chat'); this.emote('talk', 3500); setTimeout(() => o.say(pick(['Boleh, kirim ke aku.', 'Oke, aku lihat!', 'Siap 👍']), 3000), 2600); setTimeout(() => this.goDesk(), 6000); }); }
    else if (r < .73 && cat) { this.mode = 'busy'; this.goTo(0, cat.x + .8, cat.z, () => { this.lookAt(cat.x, cat.z); this.say(pick(['Neko lucu banget 🐱', 'Pus pus~']), 4000, 'chat'); this.emote('talk', 3000); cat.say('Mrrr 💜'); setTimeout(() => this.goDesk(), 6000); }); }
    else if (r < .78 && this.name !== 'ZERO-1') { const z = npcs['ZERO-1']; if (z && !z.busy()) serviceCall(this, z); }
  }
}
const liftCab = new THREE.Group(); scene.add(liftCab); liftCab.position.set(LIFT_X, 0, 3); box(1.7, .08, 1.7, mats.metal, 0, 0, 0, liftCab); box(1.7, .05, 1.7, E(C.cyan, 2.2), 0, 2.4, 0, liftCab); pLight(C.cyan, 4, 4, 0, 2, 0, liftCab);
function startChat(a, b) { a.mode = b.mode = 'busy'; a.inChat = b.inChat = true; const f = a.sf, R0 = ROOMS.find(r => r.f === f), x = clamp(a.sx + rnd(-2, 2), FL[f].ix0 + 1, FL[f].ix1 - 2); let n = 0;
  a.goTo(f, x, 3.6, arrived); b.goTo(f, x + .9, 3.6, arrived);
  async function arrived() { if (++n < 2) return; a.lookAt(b.x, b.z); b.lookAt(a.x, a.z); let lines; try { lines = await (await fetch('/api/world/banter')).json(); } catch (e) { lines = null; } if (!Array.isArray(lines) || lines.length < 2) lines = ['Hai, gimana progresnya?', 'Lancar, tinggal finishing!'];
    a.say(lines[0], 4000, 'chat'); a.emote('talk', 3800); setTimeout(() => { b.say(lines[1], 4000, 'chat'); b.emote('talk', 3800); }, 4200);
    setTimeout(() => { if (Math.random() < .4) { a.emote('celebrate', 2000); b.emote('celebrate', 2000); a.say('High five! ✋', 2000, 'chat'); } }, 8600); setTimeout(() => { a.inChat = b.inChat = false; a.goDesk(); b.goDesk(); }, 11000); } }
function serviceCall(asker, z) { asker.say(pick(['PC-ku nge-hang lagi…', 'Monitor kedip-kedip!', 'ZERO, tolong dong!']), 3500, 'alert'); asker.pop('🛠️'); z.mode = 'busy';
  z.goTo(asker.sf, asker.sx + .8, 1.9, () => { z.lookAt(asker.sx, 1); z.say('Tenang, aku perbaiki 🔧', 3000); z.emote('game', 3000); sparks(asker.sx, FL[asker.sf].y + 1.2, 1.1); setTimeout(() => { asker.say('Makasih ZERO! 🙏', 3000); z.goDesk(); }, 4000); }); }
function reactToEvent(lines, scary) { Object.values(npcs).forEach((n, i) => setTimeout(() => {
  if (n.busy() || n.moving()) { n.say(pick(lines), 4000, 'alert'); return; } n.mode = 'busy'; n.running = scary; const f = n.sf, x = clamp(n.sx + rnd(-1.5, 1.5), FL[f].ix0 + 1, FL[f].ix1 - 1);
  n.goTo(f, x, .8, () => { n.faceT = Math.PI; n.say(pick(lines), 4500, scary ? 'alert' : 'chat'); n.emote(scary ? 'frustrated' : 'celebrate', 4000, Math.PI); setTimeout(() => n.goDesk(), 7000); }); }, i * 250)); }
function deliver(from, to) { from.mode = 'busy'; from.carry.classList.remove('hidden'); from.goTo(to.sf, to.sx + .9, 3, () => { from.lookAt(to.sx, SEAT_Z); from.say(`${to.name}, ini hasilnya. Lanjut ya!`, 4000); from.emote('talk', 3500); setTimeout(() => to.say(pick(['Siap, aku proses!', 'Oke, langsung aku cek.', 'Mantap!']), 3500), 2200); setTimeout(() => { from.carry.classList.add('hidden'); from.goDesk(); }, 4500); }); }

// ====================================================================== office phases
const MEETL = ['Kemarin: 3 listing baru siap.', 'Hari ini riset keyword "modern farmhouse".', 'Blocker: nunggu approval owner.', 'QA lolos 12 file, 1 revisi.', 'Pin Pinterest naik 18%.', 'Kas aman, laporan siap.', 'Server sehat, GPU 61°C.', 'Video YouTube tayang besok.', 'Arsip aset sudah rapi.'];
const LUNCHL = ['Ramen sintetis lagi? 🍜', 'Paman, extra telur!', 'Kuahnya mantap.', 'Hujan + ramen = sempurna.', 'Lapar banget!'];
const IDEAS = ['Ide: bundle 3 denah + mood board.', 'Tema cyberpunk cabin?', 'Thumbnail pink-cyan!', 'Seri "tiny house" laku keras.', 'Tambah video walkthrough 3D!'];
const Phase = {
  cur: null, next: now() + rnd(45000, 70000),
  tick() { if (Q.has('noevents') || this.cur || now() < this.next) return; this.start(); },
  start(kind) { if (this.cur) return; kind = kind || pick(['meeting', 'lunch', 'brainstorm', 'cheer', 'meeting']);
    if (kind === 'meeting') gather('meeting', MEET, '📋 Stand-up meeting di COMMAND DECK', 'Stand-up dimulai! Update cepat ya.', MEETL, 'Oke, bubar! Semangat 👏', 'talk');
    else if (kind === 'lunch') gather('lunch', LUNCH, '🍜 Makan siang bareng di kedai ramen', 'Ayo makan dulu semua!', LUNCHL, 'Kenyang! Balik kerja 💪', 'coffee');
    else if (kind === 'brainstorm') gather('brainstorm', BOARD, '💡 Brainstorm di papan WRITERS STUDIO', 'Brainstorm produk baru, lempar ide!', IDEAS, 'Ide bagus semua! ✍️', 'talk');
    else { this.cur = 'cheer'; toast('🎉 Target penjualan minggu ini tercapai!'); Sound.party(); flash = .25; confetti(); for (const n of Object.values(npcs)) { n.pop('🎉'); n.emote('celebrate', 3000); } setTimeout(() => npcs['KAI-07']?.say('Kerja bagus tim! 🎉', 4000), 600); setTimeout(() => { this.cur = null; this.next = now() + rnd(60000, 100000); }, 6000); } },
};
function gather(kind, P, title, open, pool, end, emo) {
  let ppl = Object.values(npcs).filter(n => !isWork(n) && !n.inChat && !n.lift); ppl.sort((a, b) => (b.name === 'KAI-07') - (a.name === 'KAI-07')); ppl = ppl.slice(0, P.pts.length);
  if (ppl.length < 2) { Phase.next = now() + 20000; return; } Phase.cur = kind; toast(title); Sound.chime(); let arrived = 0, talked = false;
  ppl.forEach((n, i) => { n.mode = 'busy'; n.running = false; const [x, z] = P.pts[i]; n.say(pick(['Otw!', 'Siap, ke sana.', 'Oke!']), 2000, 'chat'); n.goTo(P.f, x, z, () => { n.lookAt(P.c[0], P.c[1]); if (++arrived >= ppl.length) talk(); }); });
  const fallback = setTimeout(talk, 60000);
  function talk() { if (talked) return; talked = true; clearTimeout(fallback); const here = ppl.filter(n => n.mode === 'busy' && n.f === P.f && !n.moving()); if (!here.length) return finish();
    const lines = [open, ...shuffle(pool).slice(0, Math.min(pool.length, here.length + 1))]; let i = 0;
    const step = () => { if (i < lines.length) { const n = here[i % here.length]; if (n.mode === 'busy') { n.say(lines[i], 3600, 'chat'); n.emote(emo, 3200); } here.forEach(o => o !== n && o.mode === 'busy' && !o.actUntil && (o.act = kind === 'lunch' ? 'coffee' : 'idle')); i++; setTimeout(step, 3900); }
      else { here.forEach(n => n.mode === 'busy' && n.emote('celebrate', 2200)); here[0].say(end, 2500, 'chat'); Sound.chime(); setTimeout(finish, 2600); } }; step(); }
  function finish() { ppl.forEach(n => { if (n.mode === 'busy') n.goDesk(); }); Phase.cur = null; Phase.next = now() + rnd(60000, 110000); }
}

// ====================================================================== office cat (modelled), drones, VTOL, traffic, particles
let cat = null;
{ const g = new THREE.Group(); scene.add(g); const fur = M(0x1a1d26, { roughness: .9 });
  rbox(.5, .22, .22, .08, fur, 0, .18, 0, g); rbox(.2, .2, .2, .06, fur, .3, .32, 0, g); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 4), fur); e.position.set(.32, .46, s * .06); g.add(e); box(.03, .03, .01, E(C.amber, 3), .41, .35, s * .05, g); }
  const tail = new THREE.Group(); tail.position.set(-.24, .28, 0); g.add(tail); rbox(.05, .35, .05, .02, fur, 0, 0, 0, tail); tail.rotation.z = .6; const legs = []; for (const [x, z] of [[.18, .08], [.18, -.08], [-.18, .08], [-.18, -.08]]) { const l = new THREE.Group(); l.position.set(x, .16, z); g.add(l); box(.06, .16, .06, fur, 0, -.16, 0, l); legs.push(l); }
  cat = { g, x: 27, z: 4.6, tx: null, next: 0, sleep: false, tail, legs, bubble: el('bubble hidden', ''),
    say(t) { this.bubble.className = 'bubble chat'; this.bubble.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => this.bubble.classList.add('hidden'), 3000); },
    update(dt, t) { if (this.tx === null && now() > this.next) { const r = Math.random(); if (r < .35) { this.sleep = true; this.next = now() + rnd(15000, 30000); } else { this.sleep = false; this.tx = [rnd(11, 32.5), rnd(3, 5.4)]; this.next = now() + rnd(3000, 8000); } }
      if (this.tx) { const dx = this.tx[0] - this.x, dz = this.tx[1] - this.z, d = Math.hypot(dx, dz), sp = 1 * dt; g.rotation.y = Math.atan2(-dz, dx); if (d <= sp) this.tx = null; else { this.x += dx / d * sp; this.z += dz / d * sp; } this.legs.forEach((l, i) => l.rotation.z = Math.sin(t * 12 + i * 1.6) * .5); }
      else this.legs.forEach(l => l.rotation.z = 0);
      this.tail.rotation.x = Math.sin(t * 2) * .4; g.position.set(this.x, 0, this.z); g.scale.y = this.sleep ? .7 : 1; } }; }
const drones = Array.from({ length: 6 }, (_, i) => { const g = new THREE.Group(); scene.add(g); box(.4, .08, .4, mats.dark, 0, 0, 0, g); for (const [x, z] of [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .01, 8), M(0x8a94a8)); p.position.set(x, .08, z); g.add(p); }
  const led = box(.06, .06, .06, E(pick([C.cyan, C.mag, C.mint]), 3), 0, -.06, 0, g); if (i % 2) box(.2, .2, .2, M(0xb38b5a), 0, -.3, 0, g); const f = 1 + (i % 4); return { g, led, f, x: rnd(FL[f].ix0 + 1, FL[f].ix1 - 1), v: rnd(.6, 1.2) * (Math.random() < .5 ? 1 : -1), ph: Math.random() * 6 }; });
// hover cars (code-built, 4 shapes)
function makeCar(kind, col) { const g = new THREE.Group(), body = M(pick([0x1b2232, 0x2a2236, 0x3a3f4f, 0x5a1a2a, 0xd8dde8, 0xffcf3a]), { metalness: .7, roughness: .25 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x18304a, roughness: .05, metalness: .4, transparent: true, opacity: .85 });
  const L = kind === 'truck' ? 4.2 : kind === 'bike' ? 1.8 : kind === 'van' ? 3.4 : 3.1, Hh = kind === 'truck' ? 1.7 : kind === 'van' ? 1.3 : kind === 'bike' ? .5 : .75;
  rbox(L, Hh * .55, kind === 'bike' ? .4 : 1.5, .15, body, 0, .3, 0, g);
  if (kind === 'sedan') { rbox(L * .5, .45, 1.3, .18, glass, -.1, .3 + Hh * .55 - .05, 0, g); } else if (kind === 'van' || kind === 'truck') { rbox(L * .9, Hh * .6, 1.45, .12, body, -.1, .3 + Hh * .5, 0, g); rbox(.7, Hh * .45, 1.35, .1, glass, L * .4, .3 + Hh * .5, 0, g); if (kind === 'truck') box(L * .55, .05, 1.46, E(col, 2), -.6, .3 + Hh * 1.05, 0, g); }
  else { rbox(.6, .3, .3, .1, glass, .2, .7, 0, g); }
  box(L * .95, .05, kind === 'bike' ? .3 : 1.4, E(col, 2.6), 0, .22, 0, g); box(.05, .1, kind === 'bike' ? .2 : 1.1, E(0xfff1d0, 3), L / 2, .45, 0, g); box(.05, .1, kind === 'bike' ? .2 : 1.2, E(0xff2240, 3), -L / 2, .45, 0, g);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: .03, depthWrite: false, side: THREE.DoubleSide })); beam.rotation.z = Math.PI / 2; beam.position.set(L / 2 + 3.5, .4, 0); g.add(beam); return g; }
const traffic = [], skyTraffic = [];
function spawnCar(lane) { const dir = lane ? -1 : 1, kind = pick(['sedan', 'sedan', 'van', 'bike', 'truck']), g = makeCar(kind, pick([C.cyan, C.mag, C.amber])); g.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(g);
  traffic.push({ g, lane, x: dir > 0 ? -60 : 75, v: rnd(9, 18) * dir * (kind === 'bike' ? 1.4 : 1), ph: Math.random() * 6, z: lane ? 12.4 : 9.8 }); }
for (let i = 0; i < 26; i++) { const g = makeCar(pick(['sedan', 'van', 'bike']), pick([C.cyan, C.mag, C.amber])); const v = rnd(6, 14) * (Math.random() < .5 ? 1 : -1); g.rotation.y = v > 0 ? 0 : Math.PI; g.scale.setScalar(rnd(.8, 1.3)); scene.add(g); skyTraffic.push({ g, x: rnd(-140, 160), y: [16, 24, 32, 44][i % 4] + rnd(-1, 1), z: -rnd(18, 110), v }); }
const Vtol = (() => { const g = new THREE.Group(); scene.add(g); const hull = M(0x1a1f2c, { metalness: .6, roughness: .35 });
  rbox(4.2, 1.2, 2, .4, hull, 0, .4, 0, g); rbox(1.6, .7, 1.6, .3, new THREE.MeshPhysicalMaterial({ color: 0xffb347, emissive: 0x6a3a00, transparent: true, opacity: .9, roughness: .1 }), 1.3, .9, 0, g); rbox(2, .5, 1.5, .2, hull, -1.6, .9, 0, g);
  const pods = []; for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(-.2, .7, s * 1.6); g.add(p); rbox(1.6, .6, .7, .25, hull, 0, -.3, 0, p); const fl = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.4, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(2), transparent: true, opacity: .8, toneMapped: false })); fl.rotation.x = Math.PI; fl.position.y = -1; p.add(fl); pods.push({ p, fl }); }
  for (const [x, z] of [[-1.4, .8], [1.2, .8], [-1.4, -.8], [1.2, -.8]]) box(.08, .5, .08, mats.trim, x, -.4, z, g); const nav1 = box(.12, .12, .12, E(C.red, 3), -2.1, .8, 0, g), nav2 = box(.12, .12, .12, E(0x3bff6a, 3), 2.1, .8, 0, g);
  const P = new THREE.Vector3(5.7, FH * 3 + .5, 3); g.position.copy(P);
  return { g, st: 'park', t: 0, nextAt: now() + rnd(40000, 70000), go() { if (this.st === 'park') { this.st = 'up'; this.t = 0; Sound.vtol(); toast('🛸 VTOL kurir lepas landas membawa pesanan'); } },
    update(dt, t) { this.t += dt; if (this.st === 'park' && now() > this.nextAt && !Q.has('noevents')) this.go(); const fly = this.st !== 'park';
      if (this.st === 'up') { g.position.y = P.y + this.t * 1.4; if (this.t > 2.5) { this.st = 'away'; this.t = 0; } }
      else if (this.st === 'away') { g.position.set(P.x - this.t * this.t * 2.2, P.y + 3.5 + this.t * 2, P.z - this.t * 4); g.rotation.z = .12; if (this.t > 7) { this.st = 'back'; this.t = 0; } }
      else if (this.st === 'back') { const k = Math.min(1, this.t / 8); g.position.set(-80 + (P.x + 80) * k, P.y + 16 * (1 - k * k), -30 * (1 - k) + P.z * k); g.rotation.z = -.08 * (1 - k); if (k >= 1) { this.st = 'park'; g.position.copy(P); g.rotation.z = 0; this.nextAt = now() + rnd(60000, 110000); Sound.ding(); } }
      for (const p of pods) { p.fl.visible = fly; p.fl.scale.y = .8 + Math.random() * .5; p.p.rotation.z = this.st === 'away' ? -.5 : 0; } nav1.visible = Math.sin(t * 4) > 0; nav2.visible = Math.sin(t * 4 + 1) > 0; } }; })();
const parts = [];
const partGeo = new THREE.BoxGeometry(.07, .07, .07);
function sparks(x, y, z) { for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(partGeo, E(pick([0xfde047, 0xfb923c, 0xffffff]), 3)); m.position.set(x, y, z); scene.add(m); parts.push({ m, v: new THREE.Vector3(rnd(-2, 2), rnd(1, 3.5), rnd(-1, 2)), life: rnd(.4, 1), gr: 9 }); } Sound.zap(); }
function confetti() { for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .02), E(pick([C.mag, C.cyan, C.amber, C.mint, C.violet]), 2)); m.position.set(rnd(10, 34), rnd(FH * 4, FH * 6), rnd(0, 6)); scene.add(m); parts.push({ m, v: new THREE.Vector3(rnd(-.5, .5), rnd(-.5, 0), rnd(-.5, .5)), life: rnd(4, 6), gr: 1.2, spin: 1 }); } }
// rain
const RAIN_N = 2600, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RAIN_N * 6), rainV = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) { const x = rnd(-40, 60), y = rnd(-1, 40), z = rnd(-10, 20); rainPos.set([x, y, z, x - .08, y - .7, z], i * 6); rainV[i] = rnd(16, 24); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3)); scene.add(new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb2d8, transparent: true, opacity: .2, fog: true })));
let flash = 0, dark = 0, glitchUntil = 0, shake = 0, nextBolt = now() + rnd(15000, 30000); const glitchFor = s => { glitchUntil = now() + s * 1000; };
const Surprises = {
  outage() { Sound.power(); dark = 1; toast('⚡ Listrik padam di HQ!'); const z = npcs['ZERO-1'];
    if (z && !isWork(z) && !z.moving()) { z.mode = 'busy'; z.running = true; z.say('Listrik padam! Aku cek panel!', 4000, 'alert'); z.goTo(5, 18, 1.8, () => { z.faceT = Math.PI; z.emote('frustrated', 2500); sparks(18, FH * 5 + 1.4, 1); setTimeout(() => { Surprises.restore(); z.say('Sudah normal lagi ✅', 4000); z.emote('celebrate', 2500); setTimeout(() => z.goDesk(), 3500); }, 3500); }); }
    else setTimeout(() => Surprises.restore(), 6000);
    Object.values(npcs).filter(n => n.name !== 'ZERO-1').slice(0, 5).forEach((n, i) => setTimeout(() => n.say(pick(['Eh, gelap!', 'Siapa matikan lampu?!', 'Untung sudah save…']), 3000, 'alert'), 400 + i * 300)); },
  restore() { dark = 0; Sound.zap(); glitchFor(.6); }, glitch() { glitchFor(1.2); Sound.zap(); toast('▓ Glitch jaringan kota'); } };
setInterval(() => { if (Q.has('noevents')) return; const r = Math.random(); if (r < .25) Surprises.glitch(); else if (r < .38) Surprises.outage(); }, 95000);

// ====================================================================== sky events: big voxel giants walking through the fogged city
const SkyEvents = (() => {
  let ev = null, nextAt = now() + rnd(35000, 60000);
  const LINES = { kaiju: ['KAIJU!! Lihat di luar!', 'Monster raksasa?!', 'Simpan semua data, cepat!'], mecha: ['Mecha raksasa lewat!', 'Thrusternya keren!', 'Dia patroli kota lagi.'], transformer: ['Truk itu berubah jadi robot?!', 'Mereka nyata!', 'Aku mau satu buat kurir.'],
    meteors: ['Hujan meteor!', 'Buat permohonan! Penjualan naik!', 'Cantik banget.'], ufo: ['UFO! Rekam rekam!', 'Mereka mau beli house plan?', 'Lampunya berkedip…'], whale: ['Paus hologram iklan kita!', 'Iklan NEONLOOM di langit 😎', 'Marketing level dewa.'] };
  const TITLE = { kaiju: 'Kaiju terlihat di distrik timur', mecha: 'Mecha raksasa melintas', transformer: 'Kendaraan berubah wujud!', meteors: 'Hujan meteor!', ufo: 'Objek tak dikenal di langit', whale: 'Iklan hologram raksasa' };
  const rim = (g, c = 0xa78bfa) => { const l = new THREE.PointLight(c, 220, 45, 1.5); l.position.set(8, 20, 14); g.add(l); };
  function robot(cA, cB, cC) { const g = new THREE.Group(), A = M(cA, { metalness: .4, roughness: .45, emissive: new THREE.Color(cA).multiplyScalar(.14) }), B = M(cB, { emissive: new THREE.Color(cB).multiplyScalar(.2) }), Cm = M(cC), Y = E(0xfacc15, 3), G = E(C.cyan, 3); const legs = [], arms = [];
    for (const z of [-1.2, 1.2]) { const p = new THREE.Group(); p.position.set(0, 6, z); g.add(p); box(1.8, 6, 1.8, A, 0, -6, 0, p); box(2.4, .9, 2, B, .3, -6, 0, p); legs.push(p); }
    box(2.4, 1.2, 4, Cm, 0, 6, 0, g); box(3, 4, 5, B, 0, 7.2, 0, g); box(.3, 1.2, 3, Y, 1.55, 8.6, 0, g);
    for (const z of [-3.4, 3.4]) { box(2.4, 2, 2, A, 0, 9.6, z, g); const p = new THREE.Group(); p.position.set(0, 9.8, z); g.add(p); box(1.4, 4.6, 1.4, A, 0, -4.6, 0, p); arms.push(p); }
    box(1.4, 3, 3, A, -2, 8, 0, g); box(1.8, 1.8, 1.8, A, 0, 11.2, 0, g); box(.2, .4, 1.4, G, .95, 12.1, 0, g); for (const s of [-1, 1]) box(.2, 1.6, .2, Y, .9, 12.6, s * .5, g).rotation.x = s * .5; return { g, legs, arms }; }
  const MAKE = {
    kaiju() { const g = new THREE.Group(), sk = M(0x4a7080, { roughness: .8, emissive: 0x1a4458 }), bel = M(0x6a96a6, { emissive: 0x22546a }), glow = E(C.cyan, 3), eye = E(C.red, 4); const legs = [];
      for (const z of [-1.4, 1.4]) { const p = new THREE.Group(); p.position.set(0, 5, z); g.add(p); box(2.2, 5, 1.8, sk, 0, -5, 0, p); box(2.8, .8, 2, sk, .4, -5, 0, p); legs.push(p); }
      box(6, 6.5, 4, sk, 0, 4.5, 0, g); box(1, 4.5, 3, bel, 3, 5, 0, g); box(3.4, 2.6, 2.6, sk, 3.8, 10.2, 0, g); box(2.2, 1.3, 2, sk, 6, 10.6, 0, g); for (const z of [-.9, .9]) box(.3, .4, .4, eye, 5.2, 11.8, z, g);
      [[-4.2, 3.6, 3, 2.4], [-7.2, 2.2, 2.4, 1.8], [-9.8, 1, 2, 1.3], [-12, .4, 1.6, .9]].forEach(([x, y, w, h]) => box(3.2, h, w, sk, x, y, 0, g)); for (let i = 0; i < 9; i++) box(.7, 1.2 + (i % 3) * .5, .5, glow, -8 + i * 1.4, i < 4 ? 4.4 - (3 - i) * .9 : 10.8, 0, g);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.2, 60, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(3), transparent: true, opacity: .85, toneMapped: false })); beam.rotation.z = -Math.PI / 2; beam.position.set(37, 11, 0); beam.visible = false; g.add(beam); rim(g); g.scale.setScalar(1.55);
      let st = 0; return { g, dur: 32000, update(k, t) { g.position.set(-74 + k * 86, -6 + Math.abs(Math.sin(t * 2.2)) * .5, -28); legs[0].rotation.z = Math.sin(t * 2.2) * .45; legs[1].rotation.z = -Math.sin(t * 2.2) * .45; const s = Math.floor(t * 2.2 / Math.PI); if (s !== st) { st = s; shake = Math.max(shake, .35); Sound.step(); }
        const fire = (k > .3 && k < .38) || (k > .7 && k < .78); beam.visible = fire; beam.rotation.y = .5; if (fire && !this.f) { this.f = 1; Sound.zap(); Sound.roar(); flash = .3; } if (!fire) this.f = 0; } }; },
    mecha() { const r = robot(0xe5e7eb, 0x1d4ed8, 0xdc2626), g = r.g, flames = []; for (const z of [-1.2, 1.2]) { const f = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.2, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(2.5), transparent: true, opacity: .85, toneMapped: false })); f.rotation.x = Math.PI; f.position.set(0, -1.6, z); g.add(f); flames.push(f); }
      rim(g); g.scale.setScalar(1.45); g.rotation.y = -Math.PI / 2 + .3; return { g, dur: 24000, update(k, t) { g.position.set(-66 + k * 60, 1 + Math.sin(t * 1.4) * 1.5, -30); for (const f of flames) f.scale.y = .8 + Math.random() * .6; r.arms[1].rotation.z = k > .5 && k < .6 ? -1.6 : 0; } }; },
    transformer() { const g = new THREE.Group(), truck = new THREE.Group(); g.add(truck); box(8, 3, 2.6, M(0x334155), -2, .8, 0, truck); box(2.6, 3.2, 2.6, M(0xb91c1c), 3.4, .8, 0, truck); box(.1, 1.2, 2.2, E(0x93c5fd, 2), 4.75, 2.4, 0, truck); box(.1, .4, 2, E(0xfde68a, 3), 4.75, 1.2, 0, truck);
      const r = robot(0xb91c1c, 0x1e40af, 0x94a3b8); r.g.scale.setScalar(.01); g.add(r.g); rim(g, C.mag); g.scale.setScalar(1.45);
      return { g, dur: 22000, update(k, t) { const x = k < .35 ? -80 + k / .35 * 56 : k < .7 ? -24 : -24 + (k - .7) / .3 * 60; g.position.set(x, -2, -28); const m = clamp((k - .35) / .1, 0, 1); truck.scale.set(1, 1 - m * .99, 1 - m * .5); r.g.scale.setScalar(.01 + m * 1.2); if (m > 0 && !this.tf) { this.tf = 1; Sound.mecha(); flash = .2; }
        if (k > .7) { r.legs[0].rotation.z = Math.sin(t * 3) * .4; r.legs[1].rotation.z = -Math.sin(t * 3) * .4; } r.arms[0].rotation.z = k > .45 && k < .7 ? -2.6 + Math.sin(t * 6) * .3 : 0; } }; },
    ufo() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4.8, .9, 24), M(0x64748b, { metalness: .8, roughness: .3 }))); const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .7 })); dome.position.y = .4; g.add(dome);
      const ring = new THREE.Group(); g.add(ring); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const l = new THREE.Mesh(BX(.4, .3, .4), E(i % 2 ? C.mag : C.mint, 3)); l.position.set(Math.cos(a) * 4.5, -.2, Math.sin(a) * 4.5); ring.add(l); }
      const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = -20.4; beam.visible = false; g.add(beam); rim(g, C.cyan); g.scale.setScalar(1.8);
      return { g, dur: 22000, update(k, t) { g.position.set(-70 + k * 60, 21 + Math.sin(t * 2) * 2, -36); ring.rotation.y += .05; beam.visible = k > .4 && k < .7; g.rotation.z = Math.sin(t * 1.5) * .08; } }; },
    whale() { const g = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(1.8), wireframe: true, transparent: true, opacity: .55, toneMapped: false });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), wm); body.scale.set(10, 3.2, 3.4); g.add(body); const tail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 6), wm); tail.rotation.z = Math.PI / 2; tail.position.x = -11.5; g.add(tail);
      for (const z of [-3, 3]) { const f = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 4), wm); f.rotation.x = z > 0 ? 1.2 : -1.2; f.position.set(2, -2, z); g.add(f); } g.scale.setScalar(1.3); g.rotation.y = Math.PI;
      return { g, dur: 26000, update(k, t) { g.position.set(10 - k * 90, 19 + Math.sin(t) * 2, -40); tail.rotation.y = Math.sin(t * 2) * .4; wm.opacity = Math.random() < .05 ? .15 : .5 + .1 * Math.sin(t * 8); } }; },
    meteors() { const g = new THREE.Group(), list = [], booms = []; let spawned = 0;
      return { g, dur: 11000, update(k, t, dt) { if (spawned < 22 && k * 16 > spawned) { spawned++; const m = new THREE.Mesh(BX(1.6, 1.6, 1.6), E(0xffd27a, 3)); m.position.set(rnd(-80, 100), rnd(70, 110), rnd(-120, -60)); g.add(m); const tr = new THREE.Mesh(new THREE.CylinderGeometry(.1, .9, 14, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3d).multiplyScalar(2), transparent: true, opacity: .6, toneMapped: false })); g.add(tr); list.push({ m, tr, v: new THREE.Vector3(rnd(-10, 10), -38, rnd(-4, 4)), big: spawned % 5 === 0 }); }
        for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; o.m.position.addScaledVector(o.v, dt); o.tr.position.copy(o.m.position).addScaledVector(o.v.clone().normalize(), -7); o.tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o.v.clone().normalize().negate());
          if (o.m.position.y < -4) { g.remove(o.m); g.remove(o.tr); list.splice(i, 1); if (o.big) { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9f43).multiplyScalar(3), transparent: true, opacity: .9, toneMapped: false })); b.position.copy(o.m.position); g.add(b); booms.push({ b, t: 0 }); flash = .5; Sound.boom(); shake = .6; } } }
        for (let i = booms.length - 1; i >= 0; i--) { const o = booms[i]; o.t += dt; o.b.scale.setScalar(1 + o.t * 26); o.b.material.opacity = Math.max(0, .9 - o.t); if (o.t > 1) { g.remove(o.b); booms.splice(i, 1); } } } }; },
  };
  function start(kind) { if (ev) scene.remove(ev.g); kind = kind || pick(Object.keys(MAKE)); ev = MAKE[kind](); ev.kind = kind; ev.t0 = now(); scene.add(ev.g); ev.update(0, now() / 1000, 0);
    if (kind === 'kaiju') Sound.roar(); if (kind === 'ufo') Sound.ufo(); if (kind === 'mecha') Sound.mecha(); if (kind === 'whale') Sound.chime(); if (kind === 'meteors') Sound.whoosh();
    toast('⚠ ' + TITLE[kind]); reactToEvent(LINES[kind], kind === 'kaiju' || kind === 'meteors'); }
  function update(dt) { if (ev) { const k = (now() - ev.t0) / ev.dur; if (k > 1) { scene.remove(ev.g); ev = null; nextAt = now() + rnd(55000, 100000); } else ev.update(k, now() / 1000, dt); } else if (now() > nextAt && !Q.has('noevents')) start(); }
  return { start, update, get ev() { return ev; } };
})();

// ====================================================================== live data
let last = 0, first = true, cpuLoad = .2;
async function poll() {
  try { const st = await (await fetch(`/api/world?since=${last}`)).json(); last = st.last_event;
    for (const a of st.agents) npcs[a.name]?.setStatus(a);
    if (!first) for (const ev of st.events) { const n = npcs[ev.agent]; if (!n) continue;
      if (ev.kind === 'running') { n.say(ev.text, 3500, 'think'); n.pop('🧠'); }
      else if (ev.kind === 'done' || ev.kind === 'published') { n.say(ev.text, 7000); Sound.chime(); toastJob(ev, 'ok'); n.pop('✅'); if (ev.kind === 'published' || n.name === 'NYX-21') Vtol.go();
        if (n.mode !== 'work') n.emote('celebrate'); if (ev.handoff && npcs[ev.handoff] && ev.handoff !== ev.agent && n.mode !== 'work') deliver(n, npcs[ev.handoff]); }
      else if (ev.kind === 'failed') { n.say(ev.text, 8000, 'alert'); Sound.error(); glitchFor(.5); toastJob(ev, 'err'); if (n.mode !== 'work') n.emote('frustrated', 4200); } }
    first = false; const sys = st.system || {}, gp = sys.gpu;
    const hs = document.querySelector('#hud .sys'); if (hs) hs.textContent = `CPU ${sys.cpu ?? '-'}% · RAM ${sys.ram_used_gb ?? '-'}/${sys.ram_total_gb ?? '-'} GB${gp ? ` · GPU ${gp.util}% · ${gp.temp}°C` : ''}`;
    const ha = document.querySelector('#hud .ai'); if (ha) ha.textContent = `🧠 ${st.mode === 'demo' ? 'demo AI' : st.ai.model}${st.ai.busy ? ' · berpikir…' : ''}`;
    cpuLoad = (sys.cpu ?? 20) / 100;
  } catch (e) { /* offline */ }
}
function toastJob(ev, kind) { const bx = document.getElementById('toasts'), m = META[ev.agent] || {}; if (!bx) return; const t = el(`toast ${kind}`, `<i style="background:${m.color}"></i><div><b>${esc(ev.agent)}</b><span>${esc(ev.text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 8000); setTimeout(() => t.remove(), 8800); }

// ====================================================================== camera: auto-fit, pan, zoom, floor focus
const VIEW = { cx: 13, cy: 10.5, w: 56, h: 29 };   // framed region: neighbour+street on the left, tower on the right
const camDir = new THREE.Vector3(.17, .1, 1).normalize();
const camState = { tx: VIEW.cx, ty: VIEW.cy, tz: 3, zoom: 1, cur: new THREE.Vector3(VIEW.cx, VIEW.cy, 3), dist: 60 };
function fitDist() { const a = host.clientWidth / host.clientHeight, t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); return Math.max(VIEW.h / 2 / t, VIEW.w / 2 / (t * a)) * 1.0; }
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w / 2, h / 2); cam.aspect = w / h; cam.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host); addEventListener('resize', resize); resize();
host.addEventListener('wheel', e => { e.preventDefault(); camState.zoom = clamp(camState.zoom * (e.deltaY > 0 ? .9 : 1.12), 1, 5); }, { passive: false });
let drag = null;
host.addEventListener('pointerdown', e => { Sound.unlock(); drag = { x: e.clientX, y: e.clientY, tx: camState.tx, ty: camState.ty, moved: false }; });
addEventListener('pointermove', e => { if (!drag || !(e.buttons & 1)) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  const s = camState.dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2 / host.clientHeight; camState.tx = clamp(drag.tx - dx * s, -30, 40); camState.ty = clamp(drag.ty + dy * s, 1, 26); });
addEventListener('pointerup', e => { if (drag && !drag.moved) onClick(e); drag = null; });
addEventListener('keydown', e => { const k = e.key.toLowerCase();
  if (k === 'escape') closePanel(); if (k === 'm') Sound.toggle(); if (k === 'e') SkyEvents.start(); if (k === 'o') Surprises.outage(); if (k === 'r') Phase.start(); if (k === 'v') Vtol.go();
  if (e.key === 'Home') { camState.zoom = 1; camState.tx = VIEW.cx; camState.ty = VIEW.cy; }
  const f = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }[e.key]; if (f !== undefined) { camState.zoom = 2.6; camState.tx = 22; camState.ty = FL[f].y + 1.8; } });

// ====================================================================== click → rooms / NPC cards
const ray = new THREE.Raycaster(), npcMeshes = [];
function onClick(e) { const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
  const hit = ray.intersectObjects(npcMeshes, false)[0]; if (hit) { Sound.blip(); return openNPC(hit.object.userData.npc); }
  for (const rm of ROOMS) { const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -1), new THREE.Vector3()); if (!p) break; const y = FL[rm.f].y; if (p.x >= rm.x0 && p.x <= rm.x1 && p.y >= y && p.y <= y + FH - .2) { Sound.blip(); return openRoom(rm); } }
  const vp = ray.ray.distanceToPoint(Vtol.g.position); if (vp < 3) Vtol.go(); }
function openRoom(room) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', hex(room.c)); p.querySelector('.ptitle').innerHTML = `<b>${room.name}</b><span>${room.agent || 'Tempat santai semua agen'}</span>`; p.querySelector('.ptabs').innerHTML = '';
  const f = p.querySelector('iframe'), info = p.querySelector('.pbody-info');
  if (room.url) { f.style.display = ''; info.style.display = 'none'; f.src = room.url; } else { f.style.display = 'none'; info.style.display = ''; info.innerHTML = `<h3>Status agen</h3><ul class="hist">${Object.values(npcs).map(n => `<li><b>${n.name}</b> — ${n.sitting ? 'di mejanya' : n.inChat ? 'ngobrol' : Phase.cur && n.mode === 'busy' ? Phase.cur : 'jalan-jalan'}</li>`).join('')}</ul><p class="muted">E = kejadian langit · R = acara kantor · V = VTOL · O = listrik padam · M = suara · 1–6 = zoom lantai · Home = semua.</p>`; } }
function openNPC(n) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color); p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)}</span>`; p.querySelector('.ptabs').innerHTML = ''; p.querySelector('iframe').style.display = 'none'; const i = p.querySelector('.pbody-info'); i.style.display = '';
  i.innerHTML = `<div class="npc-card"><div style="width:64px;height:64px;border-radius:10px;background:${n.meta.color};box-shadow:0 0 18px ${n.meta.color}"></div><div><p>${esc(n.meta.desc)}</p><p>Status: <b class="st ${n.server.status}">${n.server.status}</b> ${n.server.current ? '· ' + esc(n.server.current) : ''}</p></div></div><h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li>${esc(h)}</li>`).join('') || '<li class="muted">belum ada</li>'}</ul>`; }
function closePanel() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; }
document.querySelector('#panel .pclose').onclick = closePanel; document.getElementById('panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });
const labels = ROOMS.map(r => { const d = el('room-label', `<span>${r.name}</span>`); d.style.setProperty('--accent', hex(r.c)); d.onclick = () => openRoom(r); return { d, v: new THREE.Vector3((r.x0 + r.x1) / 2, FL[r.f].y + FH - .1, D) }; });

// ====================================================================== boot + main loop
for (const name of Object.keys(SEATS)) { npcs[name] = new NPC(name); npcMeshes.push(...npcs[name].b.meshes); }
window.tower = { npcs, Phase, SkyEvents, Surprises, Vtol, camState, cam, THREE };
poll(); setInterval(poll, 3000); setInterval(() => { Object.values(npcs).forEach(n => n.life()); Phase.tick(); }, 1000);
for (let i = 0; i < 6; i++) spawnCar(i % 2);
const clock = new THREE.Clock(); let ft = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(.1, clock.getDelta()), t = now() / 1000; ft += dt;
  if (ft > .12) { ft = 0; for (const s of anim.screens) { if (s.type === 'leds') { const c = s.t.userData.c.getContext('2d'); c.fillStyle = '#10141f'; c.fillRect(0, 0, 16, 64); for (let y = 2; y < 64; y += 4) { c.fillStyle = '#1c2232'; c.fillRect(1, y, 14, 3); for (let k = 0; k < 3; k++) if (Math.random() > .25 + (1 - cpuLoad) * .3) { c.fillStyle = pick(['#3ff0ff', '#9fffcf', '#ff3fa4', '#ffcf73']); c.fillRect(2 + k * 4, y + 1, 2, 1); } } s.t.needsUpdate = true; } else if (Math.random() < .6) drawScreen(s, t); } }
  // camera ease
  const dist = fitDist() / camState.zoom; camState.dist += (dist - camState.dist) * Math.min(1, dt * 5); camState.cur.lerp(new THREE.Vector3(camState.tx, camState.ty, camState.tz), Math.min(1, dt * 5));
  scene.fog.near = camState.dist + 8; scene.fog.far = camState.dist + 120;
  shake *= .9; cam.position.copy(camState.cur).addScaledVector(camDir, camState.dist).add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), 0).multiplyScalar(shake)); cam.lookAt(camState.cur);
  // world animation
  for (const s of anim.spin) { if (s.search) { s.search.rotation.z = Math.sin(t * .2 + s.ph) * .35; s.search.rotation.x = Math.cos(t * .17 + s.ph) * .2; } else s.rotation.y += dt * (s.userData.fast ? 8 : .8); }
  for (const h of anim.holo) { h.visible = Math.random() > .02; }
  for (const b of anim.blink) b.m.visible = Math.sin(t * 2.5 + b.ph) > .2;
  for (const n of anim.neon) { const f = Math.random() < .012 ? .15 : 1; n.m.material.color.copy(n.base).multiplyScalar(f * (dark ? .3 : 1)); }
  for (const s of anim.scan) s.m.position.y = s.y + .2 + (Math.sin(t * 2) * .5 + .5) * 2.2;
  for (const s of anim.steam) { s.t += dt; const k = (s.t % 2.4) / 2.4; s.sp.position.set(s.x + Math.sin(s.t * 3) * .05, s.y + k * .9, s.z); s.sp.material.opacity = .35 * (1 - k); s.sp.scale.setScalar(.15 + k * .4); }
  for (const tb of anim.tubes) tb.material.emissiveIntensity = 1 + Math.sin(t * 3 + tb.position.x) * .5;
  for (const d of drones) { d.x += d.v * dt; const F = FL[d.f]; if (d.x < F.ix0 + 1 || d.x > F.ix1 - 1) d.v *= -1; d.g.position.set(d.x, F.y + 2.5 + Math.sin(t * 2 + d.ph) * .15, 4 + Math.sin(t * .7 + d.ph)); d.led.visible = Math.sin(t * 8 + d.ph) > 0; }
  if (Math.random() < dt * .7) { spawnCar(Math.random() < .5 ? 0 : 1); if (Math.random() < .3) Sound.car(); }
  for (let i = traffic.length - 1; i >= 0; i--) { const c = traffic[i]; c.x += c.v * dt; c.g.position.set(c.x, .35 + Math.sin(t * 3 + c.ph) * .06, c.z); if (c.x < -70 || c.x > 85) { scene.remove(c.g); traffic.splice(i, 1); } }
  for (const c of skyTraffic) { c.x += c.v * dt; if (c.x > 170) c.x = -150; if (c.x < -150) c.x = 170; c.g.position.set(c.x, c.y + Math.sin(t + c.x) * .3, c.z); }
  Vtol.update(dt, t); SkyEvents.update(dt); cat?.update(dt, t);
  for (const n of Object.values(npcs)) n.update(dt);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.v.y -= p.gr * dt; p.m.position.addScaledVector(p.v, dt); if (p.spin) { p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 4; } p.life -= dt; if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
  const pa = rainGeo.attributes.position.array; for (let i = 0; i < RAIN_N; i++) { const o = i * 6, dy = rainV[i] * dt; pa[o + 1] -= dy; pa[o + 4] -= dy; pa[o] -= dy * .1; pa[o + 3] -= dy * .1; if (pa[o + 4] < -.3) { const x = camState.cur.x + rnd(-45, 45), y = rnd(30, 42), z = rnd(-10, 20); pa[o] = x; pa[o + 1] = y; pa[o + 2] = z; pa[o + 3] = x - .08; pa[o + 4] = y - .7; pa[o + 5] = z; } } rainGeo.attributes.position.needsUpdate = true;
  if (now() > nextBolt && !Q.has('noevents')) { nextBolt = now() + rnd(18000, 40000); flash = 1; setTimeout(() => Sound.thunder(), rnd(400, 1400)); }
  flash = Math.max(0, flash - dt * 3) * (Math.random() < .15 ? .3 : 1); hemi.intensity = (dark ? .45 : 1.25) + flash * 3;
  fx.uniforms.time.value = t; fx.uniforms.glitch.value = now() < glitchUntil ? .6 + Math.random() * .4 : (Math.random() < .002 ? .35 : 0); fx.uniforms.flash.value = flash; fx.uniforms.dark.value = dark; fx.uniforms.alarm.value = Object.values(npcs).some(n => n.server.status === 'error') ? .25 : 0;
  composer.render();
  // DOM overlays
  const k = clamp(camState.zoom * .85, .8, 1.6);
  for (const n of Object.values(npcs)) { const top = n.b.root.position.clone(); top.y += n.sitting ? 1.55 : 2.05; const [x, y] = project(top), [, fy] = project(n.b.root.position);
    n.tag.style.transform = `translate(${x}px, ${fy + 2}px) translate(-50%,0) scale(${k})`; n.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%) scale(${k})`;
    n.icon.style.transform = `translate(${x}px, ${y - 4}px) translate(-50%,-100%)`; n.carry.style.transform = `translate(${x + 10}px, ${y + 14}px)`; }
  if (cat) { const [x, y] = project(new THREE.Vector3(cat.x, .8, cat.z)); cat.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%)`; }
  for (const l of labels) { const [x, y] = project(l.v); l.d.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%) scale(${k * .9})`; }
});
