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
const SKIN = [0xf1c7a5, 0xd9a47e, 0xb37a55, 0x8a5a3c, 0xe8b996];
const HAIR = [0x111318, 0x2a1a12, 0xe6e6f0, 0xff3fa4, 0x3ff0ff, 0x6a3cff, 0xffb347];
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
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .7, .45, .86); composer.addPass(bloom);
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
function extrude(pts, depth, mat, parent = CUR, z = 0, bev = .1, off = [0, 0]) { pts = pts.filter((q, i, a) => { const n = a[(i + 1) % a.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > .01; });
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - off[0], y - off[1]))), geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6 }); geo.translate(0, 0, -depth / 2); const m = new THREE.Mesh(geo, mat); m.position.z = z; parent.add(m); return m; }
function smoothPts(pts, n = 5) { const c = new THREE.SplineCurve(pts.map(q => new THREE.Vector2(...q))); return c.getPoints(pts.length * n).map(v => [v.x, v.y]); }
function neonOutline(pts, col, parent, r = .05, z = 0) { const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z)), true); const m = new THREE.Mesh(new THREE.TubeGeometry(c, pts.length * 3, r, 5, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), toneMapped: false })); parent.add(m); return m; }
function neonFill(pts, col, parent, o = .18, z = 0) { const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(q => new THREE.Vector2(...q)))), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide })); m.position.z = z; parent.add(m); return m; }
const anim = { screens: [], blink: [], neon: [], spin: [], holo: [], steam: [], lamps: [], tubes: [], scan: [] };

// ====================================================================== world layout
const FH = 3.4, D = 6, LIFT_X = 21.5, LIFT_Z = 1.05;
const FL = [{ y: 0, x0: -18, x1: 32.6, ix0: 10, ix1: 33 }, { y: FH, x0: 10.8, x1: 33.6, ix0: 10.5, ix1: 34 }, { y: FH * 2, x0: 10.6, x1: 33.2, ix0: 9.8, ix1: 33.6 },
  { y: FH * 3, x0: 2.5, x1: 34.6, ix0: 11, ix1: 35 }, { y: FH * 4, x0: 11.8, x1: 31.6, ix0: 11.5, ix1: 32 }, { y: FH * 5, x0: 10.6, x1: 33.6, ix0: 10, ix1: 34 }];
const ROOMS = [
  { name: 'SHOP FLOOR', f: 0, x0: 10, x1: 21, agent: 'NYX-21', url: '/approvals', c: C.mag }, { name: 'LOUNGE · PANTRY', f: 0, x0: 21, x1: 33, agent: null, url: null, c: C.violet },
  { name: 'ARCHIVE', f: 1, x0: 10.5, x1: 22, agent: 'SABLE-6', url: '/assets', c: C.amber }, { name: 'FINANCE VAULT', f: 1, x0: 22, x1: 34, agent: 'KADE-12', url: '/accounting', c: C.amber },
  { name: 'WRITERS STUDIO', f: 2, x0: 9.8, x1: 21.5, agent: 'JUNO-X9', url: '/listings', c: C.violet }, { name: 'QA BAY', f: 2, x0: 21.5, x1: 33.6, agent: 'VOLT-3', url: '/approvals', c: C.amber },
  { name: 'RESEARCH LAB', f: 3, x0: 11, x1: 19, agent: 'RAZE-11', url: '/research', c: C.mint }, { name: 'DATA ROOM', f: 3, x0: 19, x1: 27, agent: 'ORIN-88', url: '/analytics', c: C.cyan },
  { name: 'GROWTH STUDIO', f: 3, x0: 27, x1: 35, agent: 'HEX-04', url: '/social', c: C.mag }, { name: 'COMMAND DECK', f: 4, x0: 11.5, x1: 32, agent: 'KAI-07', url: '/dashboard', c: C.cyan },
  { name: 'SERVER ROOM', f: 5, x0: 16, x1: 26, agent: 'ZERO-1', url: '/settings', c: C.mag }];
const SEATS = { 'NYX-21': [0, 14], 'SABLE-6': [1, 15], 'KADE-12': [1, 28], 'JUNO-X9': [2, 14.5], 'VOLT-3': [2, 26.5], 'RAZE-11': [3, 14], 'ORIN-88': [3, 24.4], 'HEX-04': [3, 31], 'KAI-07': [4, 16], 'ZERO-1': [5, 24.2] };
const SEAT_Z = 2.25, LANE = 3.7, WALK_OUT = 7.6;
const SPOTS = { smoke1: [0, -9.6, 7.8, 'smoke'], smoke2: [2, 33.1, 4.9, 'smoke'], smoke3: [3, 4.2, 4.6, 'smoke'], couch: [0, 24.6, 2.4, 'rest'], coffee: [0, 23.5, 2.6, 'snack'], vend: [0, 31.7, 2.6, 'snack'], arcade: [0, 28.7, 2.6, 'game'], arcade2: [0, 30.1, 2.6, 'game'], dance: [0, 26.8, 4.4, 'dance'],
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
  else if (s.type === 'ticker') { c.fillStyle = '#0b0d12'; c.fillRect(0, 0, w, h); c.font = 'bold 17px monospace'; c.fillStyle = s.col; c.shadowColor = s.col; c.shadowBlur = 4; const msg = '  ▶ NEONLOOM · DIGITAL HOUSE PLANS · NEW: CYBER CABIN · TINY HOUSE SALE -30% · PINTEREST +18% · '; const off = (t * 60) % (msg.length * 10.2); c.fillText(msg + msg, -off, 17); c.shadowBlur = 0; }
  else if (s.type === 'vad') { const ph = Math.floor(t / 5) % 3; c.fillStyle = ['#1a0b1e', '#081a22', '#1f1408'][ph]; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.font = 'bold 12px monospace'; c.fillStyle = ['#ff3fa4', '#3ff0ff', '#ffb347'][ph]; c.shadowColor = c.fillStyle; c.shadowBlur = 6;
    [...['ネオン', 'PLANS', '新作'][ph]].forEach((ch, i) => c.fillText(ch, w / 2, 22 + i * 18)); c.shadowBlur = 0; for (let y = (t * 30) % 6; y < h; y += 6) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y, w, 1); } c.textAlign = 'left'; }
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
  box(1, 1, .6, M(0x2a3142), 23.5, y, .5); box(.5, .3, .3, mats.metal, 23.5, y + 1, .5); steam(23.5, y + 1.4, .5); plane(2.4, 1.2, screenMat(48, 24, 'wave', C.violet), 26.8, 2.2, .25);
  bean(26.2, y, 2.8, 0x1e3a5f); bean(27.4, y, 3, 0x4a2a5a); plant(32.4, y, 3.6); plant(21.6, y, 4.8, .8);
  // ---- F1 ARCHIVE + FINANCE
  y = FH; for (const x of [11.6, 13.8, 19.2]) shelf(x, y, .4, 2, 2.5, R7); deskUnit(16.2, y, 3, C.amber); chair(16.2, y, SEAT_Z, 0x3a2a1a); for (let k = 0; k < 3; k++) box(.6, .5, .5, M(0xb38b5a), 12 + k * .7, y, 3.3 + (k % 2) * .4);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .3, 24), M(0x5a6478, { metalness: .8, roughness: .3 })); vd.rotation.x = Math.PI / 2; vd.position.set(32.4, y + 1.3, .4); CUR.add(vd);
  const vr = new THREE.Mesh(new THREE.TorusGeometry(.75, .05, 8, 24), E(C.amber, 2)); vr.position.set(32.4, y + 1.3, .58); CUR.add(vr); for (let k = 0; k < 4; k++) box(.08, 1.2, .06, mats.metal, 32.4, y + .7, .6).rotation.z = k * Math.PI / 4;
  deskUnit(28, y, 3, C.amber); chair(28, y, SEAT_Z, 0x3a2a1a); rbox(1, 1, .8, .05, M(0x3a4458, { metalness: .6 }), 24, y, .6); for (let i = 0; i < 6; i++) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .08, 12), M(0xffc94a, { metalness: .9, roughness: .3, emissive: 0x553300 })); cn.position.set(25.2 + (i % 3) * .1, y + .04 + i * .08, 1.2); CUR.add(cn); }
  plane(2.6, 1.3, screenMat(48, 24, 'graph', C.amber), 25.6, y + 2.3, .25);
  // ---- F2 WRITERS STUDIO + QA BAY
  y = FH * 2; box(2.6, 1.5, .08, M(0xd8dee8), 12, y + .9, .3); for (let i = 0; i < 12; i++) box(.24, .24, .02, M(pick([0xffcf73, 0xff9fd0, 0x9fffcf, 0xa9ecff])), 11 + (i % 6) * .38, y + 1.1 + (i / 6 | 0) * .55, .36);
  shelf(18.9, y, .4, 2, 2.5, R7); deskUnit(14.5, y, 2, C.violet); chair(14.5, y, SEAT_Z, 0x2a1a4a); plant(17.8, y, 1, 1.1); bean(18.6, y, 3.2, 0x5a3a6a);
  for (const x of [22.6, 24]) box(.12, 2.6, .12, mats.metal, x, y, 2.4); box(1.5, .12, .12, mats.metal, 23.3, y + 2.6, 2.4); const scan = plane(1.3, .04, E(C.amber, 3), 23.3, y + 1, 2.4); scan.rotation.x = -Math.PI / 2; anim.scan.push({ m: scan, y });
  deskUnit(26.5, y, 3, C.amber); chair(26.5, y, SEAT_Z, 0x1a2a3a); hazard(30.5, y, 3, 4, .3); box(2.6, .8, .7, mats.desk, 30.6, y, .8); for (let k = 0; k < 3; k++) { const tb = plane(.4, .3, screenMat(16, 12, 'bars', C.amber), 29.8 + k * .8, y + .9, .9); tb.rotation.x = -1.1; }
  // ---- F3 LAB + DATA + GROWTH (+ VTOL pad left)
  y = FH * 3; for (let k = 0; k < 3; k++) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1.8, 14), new THREE.MeshPhysicalMaterial({ color: 0x9fffcf, transparent: true, opacity: .35, emissive: 0x1a6050, roughness: .1 })); tube.position.set(11.8 + k * .6, y + .95, .6); CUR.add(tube); box(.5, .12, .5, mats.metal, 11.8 + k * .6, y, .6); box(.5, .12, .5, mats.metal, 11.8 + k * .6, y + 1.85, .6); anim.tubes.push(tube); }
  deskUnit(14.5, y, 2, C.mint); chair(14, y, SEAT_Z, 0x1a3a2a); holoTable(17.6, y, 3.4, .8);
  plane(2.4, 1.2, screenMat(64, 32, 'graph', C.cyan), 24.5, y + 2.4, .25); rackUnit(26.4, y, .5); deskUnit(24.4, y, 3, C.cyan); chair(24.4, y, SEAT_Z, 0x1a2a3a);
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
  for (let k = 16.6; k < 25.6; k += .5) box(.06, 3.1, .08, mats.trim, k, y, .25); for (const x of [17.2, 18, 18.8, 19.6]) rackUnit(x, y, .6, 2.6); deskUnit(24.2, y, 2, C.mag); chair(24.2, y, SEAT_Z, 0x3a1a2a); pLight(C.mag, 6, 7, 21, y + 2.6, 2.5);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 16), M(0x3a4458, { metalness: .6, roughness: .4 })); tank.position.set(12.4, y + 2.1, 2); CUR.add(tank); for (const [dx, dz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) box(.08, 1, .08, mats.trim, 12.4 + dx, y, 2 + dz);
  for (const x of [28, 29.6]) { box(1.3, .9, 1.1, M(0x56627a, { metalness: .4 }), x, y, 2.5); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .03, 12), mats.dark); fan.position.set(x, y + .92, 2.5); CUR.add(fan); box(.75, .02, .08, M(0x8a94a8), 0, .02, 0, fan); anim.spin.push(fan); fan.userData.fast = true; }
  box(.1, 6, .1, mats.dark, 32.6, y, 1.2); for (let k = 1; k < 6; k += 1.2) box(.7, .04, .04, mats.dark, 32.6, y + k, 1.2); { const tip = box(.2, .2, .2, E(C.red, 3), 32.6, y + 6, 1.2); anim.blink.push({ m: tip, ph: 1 }); }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(.8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), M(0xc6cfdf, { side: THREE.DoubleSide })); dish.rotation.x = -2.1; dish.position.set(31, y + 1.2, 4.2); CUR.add(dish);
  const bb = plane(9, 3.6, screenMat(192, 76, 'billboard'), 21, y + 6.2, .3); box(9.4, 4, .2, mats.frame, 21, y + 4.2, .15); for (const x of [17, 25]) box(.2, 4.4, .2, mats.frame, x, y + 3.2, .3);
  // ---- lift shaft (exterior glass) + cabin
  for (const [dx, dz] of [[-.9, 2.1], [.9, 2.1], [-.9, 3.9], [.9, 3.9]]) box(.1, FH * 5 + 3, .1, mats.frame, LIFT_X + dx, 0, LIFT_Z - 3 + dz); box(1.8, FH * 5 + 3, 1.8, mats.glass, LIFT_X, 0, LIFT_Z);
  for (let f = 0; f < 6; f++) { const y = FL[f].y; box(1.9, .12, .12, E(C.cyan, 2), LIFT_X, y + 2.6, LIFT_Z + .95); box(.12, 2.6, .12, mats.frame, LIFT_X - .95, y, LIFT_Z + .95); box(.12, 2.6, .12, mats.frame, LIFT_X + .95, y, LIFT_Z + .95); }
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

// ====================================================================== interior dressing for every room (ducts, pendant lamps, rugs, shelves, blinds, bins)
{ CUR = scene; const duct = M(0x6a7488, { metalness: .7, roughness: .35 }), dk = M(0x10141d), wood = M(0x5a4030, { roughness: .7 });
  const rugTex = (c1, c2) => ctex(32, 32, c => { c.fillStyle = c1; c.fillRect(0, 0, 32, 32); c.strokeStyle = c2; c.lineWidth = 2; c.strokeRect(3, 3, 26, 26); for (let i = 6; i < 26; i += 5) { c.fillStyle = c2 + '55'; c.fillRect(i, 6, 2, 20); } });
  for (const r of ROOMS) { if (r.f >= 5) continue; const y = FL[r.f].y, w = r.x1 - r.x0, cx = (r.x0 + r.x1) / 2, col = r.c;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, w - .4, 10), duct); d.rotation.z = Math.PI / 2; d.position.set(cx, y + FH - .62, .7); scene.add(d); for (let k = r.x0 + .8; k < r.x1 - .5; k += 2.2) box(.06, .3, .06, dk, k, y + FH - .62, .7);
    box(w - .4, .05, .35, M(0x2a3142), cx, y + FH - .5, 1.5); for (let k = 0; k < 6; k++) box(w - .5, .015, .015, M(pick([0x0c0f17, 0x1b2a4a, 0x3a1630])), cx, y + FH - .47, 1.36 + k * .05);
    for (const fx of [.3, .7]) { const x = r.x0 + w * fx, z = 3.4; box(.015, .55, .015, dk, x, y + FH - .85, z); const sh = new THREE.Mesh(new THREE.ConeGeometry(.28, .26, 14, 1, true), M(0x1b1f2a, { side: THREE.DoubleSide })); sh.position.set(x, y + FH - .98, z); scene.add(sh); const bl = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), E(0xffcf8a, 3)); bl.position.set(x, y + FH - 1.06, z); scene.add(bl); }
    const rg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.4, w * .45), 1.8), new THREE.MeshStandardMaterial({ map: rugTex(pick(['#2a2240', '#1f2a3a', '#3a2228']), hex(col)), roughness: .95 })); rg.rotation.x = -Math.PI / 2; rg.position.set(cx + (r.agent ? 1.2 : 0), y + .015, 3.6); scene.add(rg);
    box(Math.min(2.4, w * .3), .05, .28, wood, r.x1 - 1.6, y + 2.3, .32); for (let k = 0; k < 5; k++) rbox(.16, .2 + Math.random() * .2, .14, .03, M(pick([0xd6a76c, C.violet, C.cyan, 0xe2e8f0, C.mag])), r.x1 - 2.6 + k * .4, y + 2.35, .32);
    for (let k = r.x0 + .5; k < r.x1 - .4; k += 1.6) if (Math.random() < .45) for (let q = 0; q < 9; q++) box(1.45, .03, .02, M(0x3a4458), k + .8, y + 1.0 + q * .12, .2);
    const clk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .04, 16), M(0xe2e8f0)); clk.rotation.x = Math.PI / 2; clk.position.set(r.x0 + .7, y + 2.6, .25); scene.add(clk); box(.02, .12, .02, dk, r.x0 + .7, y + 2.6, .28);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(.15, .12, .35, 10), M(0x2a3142, { metalness: .5 })); bin.position.set(r.x1 - .5, y + .17, 4.6); scene.add(bin);
    box(.5, .4, .4, M(0xb38b5a), r.x0 + .6, y, 4.8); box(.4, .3, .35, M(0xa07a4a), r.x0 + .62, y + .4, 4.8); plant(r.x1 - .55, y, 5.3, .7);
    box(.6, .06, .4, M(0xc8d0e0), cx - 1, y + FH - .33, 2.6); box(.5, .02, .3, E(0xdfe8ff, 1.2), cx - 1, y + FH - .36, 2.6); }
  // protruding neon box-signs on the facade
  for (const [f, txt, col, x] of [[0, 'カフェ', C.amber, 9.6], [1, 'VAULT', C.amber, 34.6], [2, 'STUDIO', C.violet, 9.3], [3, 'LAB', C.mint, 35.6], [4, 'HQ', C.cyan, 11]]) {
    const y = FL[f].y + 1.8; box(.3, 1.6, .9, M(0x0b0d12), x, y - .8, D + .6); neonSign(txt, col, x + .16, y, D + .6, .32, Math.PI / 2, true); neonSign(txt, col, x - .16, y, D + .6, .32, -Math.PI / 2, true); box(.7, .06, .06, mats.metal, x, y + .7, D + .3); }
  for (const x of [13, 21, 29]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .5, 10), E(0xff5a4a, 2)); l.position.set(x, FH - .9, D + 1.5); scene.add(l); box(.01, .3, .01, mats.dark, x, FH - .6, D + 1.5); }
}
// ====================================================================== the street
{ CUR = scene;
  box(140, .2, 2.2, mats.walk, 10, -.2, 7); box(140, .2, 6, mats.road, 10, -.35, 11.1); box(220, .2, 3, mats.walk, 10, -.2, 15.5); box(220, .3, 80, M(0x1a202c, { roughness: .3, metalness: .5 }), 10, -.5, 57); box(220, .3, 30, M(0x1a202c, { roughness: .3, metalness: .5 }), 10, -.5, -10); box(140, .12, .2, M(0x4a5468), 10, -.12, 8.1);
  for (let x = -60; x < 80; x += 4) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2, .12), mats.paint); d.rotation.x = -Math.PI / 2; d.position.set(x, -.24, 11.1); CUR.add(d); }
  for (let i = 0; i < 30; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: .02, metalness: 1, transparent: true, opacity: .8 })); p.scale.set(rnd(1, 3.5), rnd(.3, .8), 1); p.rotation.x = -Math.PI / 2; p.position.set(rnd(-40, 50), -.23, rnd(8.6, 13.8)); CUR.add(p); }
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

// ====================================================================== building detail: foundation, columns, cladding, facade ads, truss, fire escape
{ CUR = scene; const clad = M(0x2a3346, { roughness: .55, metalness: .35 }), seam = M(0x10141d), steel = M(0x3a4458, { metalness: .7, roughness: .35 });
  box(25.4, .8, D + 1.4, M(0x1a202c, { roughness: .5 }), 21.6, -.8, D / 2 + .2); box(25.6, .06, .06, E(C.cyan, 1.8), 21.6, -.06, D + .92); for (let k = 0; k < 3; k++) box(4, .18, .5, M(0x2a3142), 15.6, -.6 + k * .18 - .2, D + .7 + (2 - k) * .3);
  for (const x of [11.7, 18.5, 25.5, 31.8]) { box(.45, FH * 5 + .3, .45, steel, x, -.3, D + .12); box(.06, FH * 5, .06, E(C.mag, 1.2), x, 0, D + .36); for (let f = 1; f < 6; f++) box(.7, .25, .7, steel, x, FL[f].y - .55, D + .12); }
  for (const side of [0, 1]) for (let f = 0; f < 5; f++) { const F = FL[f], x = side ? F.ix1 + .02 : F.ix0 - .02, y = F.y; box(.3, FH, D + .3, clad, x, y - .3, D / 2);
    for (let k = .6; k < D; k += 1.2) box(.32, FH - .1, .04, seam, x, y - .25, k); box(.32, .05, D + .3, seam, x, y + 1.4, D / 2); box(.33, .06, D + .3, E(side ? C.cyan : C.mag, 1.4), x, y + FH - .55, D / 2);
    if (f > 0 && f < 5) { box(.7, .6, .9, M(0x56627a, { metalness: .4 }), side ? x + .5 : x - .5, y + .5, 1.5 + (f % 2) * 2); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .02, 10), seam); fan.rotation.z = Math.PI / 2; fan.position.set(side ? x + .86 : x - .86, y + .8, 1.5 + (f % 2) * 2); CUR.add(fan); } }
  for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, FH * 5, 8), steel); p.position.set(9.3 - k * .25 + 1.2, FH * 2.5, .4 + k * .3); CUR.add(p); }
  // facade: ledges, glass balconies, hanging planters, LED ticker and vertical ad wall
  for (let f = 1; f < 5; f++) { const F = FL[f]; box(F.ix1 - F.ix0 + .6, .14, .7, steel, (F.ix0 + F.ix1) / 2, F.y - .44, D + .45); if (f % 2) { box(6, .08, 1, steel, F.ix0 + 4, F.y, D + .55); plane(6, .9, mats.glass, F.ix0 + 4, F.y + .45, D + 1.04); box(6, .05, .05, E(C.cyan, 2), F.ix0 + 4, F.y + .9, D + 1.04); }
    for (let k = 0; k < 4; k++) { const x = F.ix0 + 3 + k * 5.5; box(.6, .3, .3, M(0x5a3a22), x, F.y - .75, D + .55); for (let q = 0; q < 5; q++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.07, rnd(.4, .9), 4), M(0x1f6b4a)); l.position.set(x + rnd(-.25, .25), F.y - .9 - q * .1, D + .6); l.rotation.x = Math.PI; CUR.add(l); } } }
  const tick = plane(22, .72, screenMat(640, 22, 'ticker', C.amber), 21.7, FH * 2 - .7, D + .62); box(22.3, .86, .1, M(0x0b0d12), 21.7, FH * 2 - .97, D + .55);
  plane(3, 7.4, screenMat(48, 118, 'vad', C.mag), 36.4, FH * 2.6, D + .6); box(3.3, 7.8, .3, steel, 36.4, FH * 2.6 - 3.9, D + .4); for (const y of [FH * 1.4, FH * 3.8]) box(1.6, .2, .2, steel, 35.4, y, D + .3);
  // VTOL pad: vertical steel truss to the ground
  for (const x of [3, 8.4]) for (const z of [1, 5]) { box(.32, FH * 3 - .25, .32, steel, x, 0, z); for (let y = 1.5; y < FH * 3 - .5; y += 2.4) { const b = box(.1, 2.9, .1, steel, x, y, z); b.rotation.z = (x < 5 ? 1 : -1) * .9; } }
  for (const y of [3, 6.4]) box(5.6, .14, .14, steel, 5.7, y, 1), box(5.6, .14, .14, steel, 5.7, y, 5);
  // fire escape attached to the right wall: columns, landings, stairs
  { const X = 35.3; for (const z of [4.2, 5.6]) box(.12, FH * 4 + .2, .12, steel, X + 1.3, 0, z); for (let f = 1; f < 5; f++) { const y = FL[f].y; box(2.8, .08, 1.5, steel, X, y - .08, 4.9); for (let k = -1.3; k <= 1.3; k += .26) box(.03, .9, .03, steel, X + k, y, 5.62);
    const st = box(Math.hypot(FH, 2.4), .08, .8, steel, X, FL[f - 1].y + FH / 2 - .1, 4.6); st.rotation.z = (f % 2 ? 1 : -1) * Math.atan2(FH, 2.4); for (let k = 0; k < 8; k++) box(.05, .05, .8, M(0x8a94a8, { metalness: .7 }), X - 1.1 + k * .32, FL[f - 1].y + .4 + k * .4, 4.6).visible = false; } }
  // rooftop parapet + neon crown
  box(24.4, .7, .25, clad, 22, FH * 5, D - .1); box(24.4, .06, .08, E(C.cyan, 2), 22, FH * 5 + .7, D + .02); box(.25, .7, D, clad, 9.9, FH * 5, D / 2); box(.25, .7, D, clad, 34.1, FH * 5, D / 2);
}
// ====================================================================== facade v3: cantilever pod, penthouse, pipe bundle, canopies, grilles
{ CUR = scene; const steel = M(0x3a4458, { metalness: .7, roughness: .35 }), clad = M(0x2a3346, { roughness: .5, metalness: .35 }), win = E(0xffcf73, 1.1);
  { const y = FH * 2; box(2.6, FH - .5, D - .6, clad, 8.3, y + .2, (D - .6) / 2 + .3); for (let k = 0; k < 3; k++) box(.05, FH - 1.2, .8, k % 2 ? win : E(C.cyan, .9), 7.05, y + .6, 1.2 + k * 1.5); box(2.7, .06, D - .5, E(C.mag, 2), 8.3, y + FH - .32, (D - .6) / 2 + .3); const br = box(.2, 3.6, .2, steel, 7.6, y - 3.2, 4.8); br.rotation.z = .55; neonSign('BAR', C.cyan, 7, y + 1.7, 3.4, .45, -Math.PI / 2, true); }
  { const y = FH * 5; box(5, 2.6, 4, clad, 31.4, y, 2.2); box(5.1, .12, 4.1, E(C.cyan, 2), 31.4, y + 2.6, 2.2); for (let k = 0; k < 4; k++) box(.9, .7, .04, k % 2 ? win : E(C.mag, 1), 29.6 + k * 1.2, y + 1.1, 4.22); box(5.6, .14, 4.6, steel, 31.4, y + 2.72, 2.2); }
  for (let k = 0; k < 4; k++) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(.11 - k * .015, .11 - k * .015, FH * 5 + .3, 10), k === 1 ? M(0xb34a2a, { metalness: .6 }) : steel); pp.position.set(33.9 + k * .26, FH * 2.5, D + .3 + (k % 2) * .18); scene.add(pp); for (let f = 1; f < 5; f++) box(.6, .08, .5, steel, 34.2, FL[f].y - .7, D + .35); }
  for (const [f, x0, x1] of [[1, 12, 20], [3, 24, 33], [2, 26, 32]]) { const c = box(x1 - x0, .08, 1.5, M(0x2a3142, { metalness: .6 }), (x0 + x1) / 2, FL[f].y + FH - .45, D + .7); c.rotation.x = .22; box(x1 - x0, .05, .05, E(f === 3 ? C.amber : C.cyan, 2), (x0 + x1) / 2, FL[f].y + FH - .58, D + 1.42); for (let x = x0 + .4; x < x1; x += 2) { const t = box(.05, 1, .05, steel, x, FL[f].y + FH - 1.3, D + 1.3); t.rotation.x = -.6; } }
  for (let k = 0; k < 12; k++) box(.08, FH - .6, .08, M(0x1a1f2c, { metalness: .6 }), 26.4 + k * .45, FH * 4 + .2, D + .25);
  for (let f = 1; f < 5; f++) for (const x of [14, 23.5, 30]) { if ((x + f) % 3 > 1) continue; box(.9, .55, .5, M(0x56627a, { metalness: .4 }), x, FL[f].y - 1.05, D + .55); const fn = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .02, 10), M(0x10141d)); fn.rotation.x = Math.PI / 2; fn.position.set(x, FL[f].y - .78, D + .81); scene.add(fn); }
}
// ====================================================================== sky: clouds, lightning, ground fog, wet reflections, splashes
const cloudTex = ctex(256, 96, c => { for (let i = 0; i < 70; i++) { const x = rnd(20, 236), y = rnd(30, 70), r = rnd(10, 30), gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); } });
const clouds = []; for (let i = 0; i < 16; i++) { const m = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(0x46526e) }); const c = plane(rnd(60, 120), rnd(18, 34), m, rnd(-120, 140), rnd(40, 72), -rnd(120, 220), 0, scene); clouds.push({ m: c, base: m.color.clone(), v: rnd(.4, 1.4) }); }
let bolt = null;
function strike() { const x = rnd(-60, 80), z = -rnd(100, 170), pts = []; let px = x; for (let y = 70; y > 0; y -= rnd(3, 7)) { px += rnd(-3, 3); pts.push(new THREE.Vector3(px, y, z)); }
  if (bolt) scene.remove(bolt); bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 60, .35, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(4), fog: false, toneMapped: false })); scene.add(bolt); bolt.userData.life = .28; }
const fogTex = ctex(256, 32, c => { for (let i = 0; i < 60; i++) { const x = Math.random() * 256, r = rnd(10, 30), gr = c.createRadialGradient(x, 20, 0, x, 20, r); gr.addColorStop(0, 'rgba(190,205,235,.25)'); gr.addColorStop(1, 'rgba(190,205,235,0)'); c.fillStyle = gr; c.fillRect(x - r, 0, r * 2, 32); } }); fogTex.wrapS = THREE.RepeatWrapping; fogTex.repeat.set(3, 1);
const fogs = []; for (const [z, y, o, h] of [[9.5, .1, .12, 1.2], [14, .1, .1, 1.4], [-8, .4, .22, 3], [-30, 1, .3, 5]]) { const m = new THREE.MeshBasicMaterial({ map: fogTex.clone(), transparent: true, opacity: o, depthWrite: false }); m.map.needsUpdate = true; fogs.push({ m: plane(160, h, m, 10, y + h / 2, z, 0, scene), v: rnd(.004, .012) }); }
{ const refl = ctex(16, 64, c => { const gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; for (let y = 0; y < 64; y += 2) c.fillRect(4 + Math.sin(y) * 2, y, 8, 1); });
  for (const [x, col, w] of [[-4, 0xff5a4a, 3], [1.8, C.cyan, .8], [2.8, C.mag, .8], [-13, C.cyan, 1.4], [-8, 0xd0dcff, 1], [6, 0xd0dcff, 1], [27, 0xd0dcff, 1], [10.9, C.mag, 1], [16, C.mag, 2.5], [24, C.violet, 2], [30, C.cyan, 2], [36.4, C.mag, 2.4], [21.7, C.amber, 6]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 7), new THREE.MeshBasicMaterial({ map: refl, color: new THREE.Color(col).multiplyScalar(.9), transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, -.22, 11.6); scene.add(m); anim.holo.push(m); } }
const SPL_N = 500, splGeo = new THREE.BufferGeometry(), splPos = new Float32Array(SPL_N * 3); for (let i = 0; i < SPL_N; i++) splPos.set([rnd(-30, 50), -.2, rnd(6, 17)], i * 3); splGeo.setAttribute('position', new THREE.BufferAttribute(splPos, 3));
scene.add(new THREE.Points(splGeo, new THREE.PointsMaterial({ color: 0xc8d6f5, size: .09, transparent: true, opacity: .7, depthWrite: false })));

// ====================================================================== MECH-KAIJU (permanent, left foreground), holo shark, holo koi, face posters, roof gear, street life
const MK = (() => { const g = new THREE.Group(); scene.add(g);
  const plate = M(0x3c4864, { metalness: .7, roughness: .34, emissive: 0x16213a }), plate2 = M(0x56638a, { metalness: .65, roughness: .3, emissive: 0x1c2a48 }), dark = M(0x0c1018, { metalness: .6, roughness: .5 }),
    cy = E(C.cyan, 1.7), mg = E(C.mag, 1.5), tooth = M(0xd6deea, { metalness: .9, roughness: .2, emissive: 0x262c36 });
  // extrude a hand-drawn side silhouette (world coords) into a bevelled armour piece
  const ext = (pts, depth, mat, parent = g, z = 0, bev = .22, off = [0, 0]) => { pts = pts.filter((q, i, a) => { const n = a[(i + 1) % a.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > .02; }); const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - off[0], y - off[1])));
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 }); geo.translate(0, 0, -depth / 2); const m = new THREE.Mesh(geo, mat); m.position.z = z; parent.add(m); return m; };
  const smooth = (pts, n = 6) => { const c = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(...p))); c.closed = true; return c.getPoints(pts.length * n).map(v => [v.x, v.y]); };
  const ring = (r, x, y, z, p = g, col = cy) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, .07, 8, 28), col); o.position.set(x, y, z); p.add(o); const d = new THREE.Mesh(new THREE.CylinderGeometry(r * .8, r * .8, .3, 20), plate2); d.rotation.x = Math.PI / 2; d.position.set(x, y, z - .1 * Math.sign(z)); p.add(d); };
  const spikesAlong = (pts, sizes, p = g, z = 0) => pts.forEach(([x, y, a], i) => { const h = sizes[i]; ext([[x - h * .35, y], [x + h * .25, y + h], [x + h * .35, y]], .35, plate2, p, z, .06); box(.12, .12, .12, i % 3 ? cy : mg, x + .05, y + h * .9, z + .2, p); });
  // ---- torso, belly ribs, chest panel
  const torso = smooth([[-3, 7.4], [-2.2, 9.6], [0, 10.9], [2.6, 12.1], [4.3, 12.4], [5.1, 11.5], [4.7, 9.7], [3.6, 8.2], [2, 6.9], [0, 6.3], [-2, 6.5]]);
  ext(torso, 3.4, plate); ext(smooth([[-1.6, 7.6], [0, 9.6], [2.4, 11], [4, 11.4], [4.5, 10.3], [3.5, 8.5], [1.8, 7.2], [0, 6.8]]), 3.9, plate2);
  for (let k = 0; k < 6; k++) ext([[.4 + k * .6, 6.6 + k * .25], [.75 + k * .6, 6.6 + k * .25], [1.4 + k * .6, 8.6 + k * .4], [1.05 + k * .6, 8.6 + k * .4]], 4.1, dark, g, 0, .04);
  for (const z of [2.15, -2.15]) { for (let k = 0; k < 4; k++) box(1.7, .1, .06, cy, 2.4, 9.3 + k * .38, z); box(2, 1.8, .05, dark, 2.4, 9.1, z * .99); ring(.75, 3.6, 10.8, z * 1.03); ring(.85, .4, 8.4, z * 1.03); }
  // ---- neck with pistons
  ext(smooth([[3.9, 11.3], [5.2, 13.3], [6.5, 14.5], [7.4, 14], [6.5, 12.4], [5.3, 10.6]]), 2.2, plate); for (let k = 0; k < 4; k++) ext([[4.6 + k * .6, 11 + k * .75], [5.1 + k * .6, 11.4 + k * .75], [5.6 + k * .6, 10.9 + k * .75], [5.1 + k * .6, 10.5 + k * .75]], 2.5, plate2, g, 0, .05);
  for (const z of [-.9, .9]) { const pi = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 3.2, 8), mats.metal); pi.position.set(5.6, 12.3, z); pi.rotation.z = -.85; g.add(pi); }
  // ---- head (skull + crest + jaw) on a pivot
  const head = new THREE.Group(); head.position.set(7.2, 13.6, 0); g.add(head); const o = [7.2, 13.6];
  ext(smooth([[6.8, 14.2], [7.6, 15.4], [9.2, 15.9], [11.6, 15.3], [12.7, 14.6], [12.4, 14.05], [10, 13.95], [8, 13.55]], 5), 1.9, plate, head, 0, .2, o);
  ext([[7.6, 15.3], [8.6, 16.6], [9.4, 15.9]], .5, plate2, head, 0, .08, o); ext([[8.9, 15.8], [10.2, 16.9], [10.6, 15.7]], .5, plate2, head, 0, .08, o); ext([[10.2, 15.6], [11.2, 16.2], [11.5, 15.4]], .5, plate2, head, 0, .08, o);
  for (const z of [.98, -.98]) { ext([[9, 14.85], [9.7, 15.1], [10.1, 14.8], [9.5, 14.6]], .1, cy, head, z, .02, o); box(1.6, .06, .05, cy, 3, 1.05, z * 1.02, head); }
  for (let k = 0; k < 10; k++) { const x = 8.2 + k * .44; ext([[x, 14.05], [x + .18, 13.45], [x + .36, 14.05]], 1.5, tooth, head, 0, .02, o); }
  const jaw = new THREE.Group(); jaw.position.set(.3, -.15, 0); head.add(jaw); const oj = [7.5, 13.45];
  ext(smooth([[7.4, 13.5], [9, 13.55], [12, 13.25], [12.3, 12.85], [9.5, 12.5], [7.6, 12.8]], 5), 1.6, plate, jaw, 0, .15, oj); for (let k = 0; k < 9; k++) { const x = 8.4 + k * .42; ext([[x, 13.3], [x + .17, 13.9], [x + .34, 13.3]], 1.3, tooth, jaw, 0, .02, oj); }
  const mouth = box(4.2, .06, 1.2, cy, 2.4, -.05, 0, jaw); const mouthLight = pLight(C.cyan, 0, 10, 3, -.3, 0, head);
  // ---- legs (thigh pivot -> shin/foot), arms, tail, spikes
  const legs = []; for (const z of [-1.8, 1.8]) { const p = new THREE.Group(); p.position.set(.4, 9, z); g.add(p); const oh = [.4, 9];
    ext(smooth([[-.8, 9.2], [1.6, 9.6], [2.4, 7.4], [1.5, 4.9], [-.4, 5.1], [-1.3, 7.2]]), 1.9, plate, p, 0, .22, oh); ext(smooth([[-.2, 8.6], [1.4, 8.8], [1.8, 7.2], [1.1, 5.8], [-.2, 6.2]]), 2.2, plate2, p, 0, .1, oh); ring(.6, .9, -2, z > 0 ? 1.15 : -1.15, p);
    ext(smooth([[.2, 5.5], [1.4, 5.2], [.3, 2], [-.8, 1.1], [-1.5, 1.8]]), 1.4, plate, p, 0, .15, oh); ext([[-1.6, 1.5], [-.3, 1.75], [2.6, .65], [2.9, 0], [-1.7, 0]], 1.6, plate2, p, 0, .15, oh);
    for (const dz of [-.55, 0, .55]) ext([[2.6, .55], [3.5, .05], [2.6, .05]], .25, tooth, p, dz, .03, oh); const pi = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 3, 8), mats.metal); pi.position.set(-.2, -2.6, z > 0 ? .9 : -.9); pi.rotation.z = .5; p.add(pi); legs.push(p); }
  for (const z of [-2.1, 2.1]) { ext([[3.6, 10], [4.5, 10.4], [5.3, 8.4], [4.6, 8.2]], .7, plate, g, z, .1); ext([[4.6, 8.5], [5.3, 8.7], [6.8, 7.8], [6.5, 7.4]], .6, plate2, g, z, .08); for (const dy of [0, .25, .5]) ext([[6.5, 7.4 + dy * .4], [7.2, 7.1 + dy * .4], [6.7, 7.6 + dy * .4]], .15, tooth, g, z, .02); }
  const tail = new THREE.Group(); tail.position.set(-2.4, 8.4, 0); g.add(tail); const ot = [-2.4, 8.4];
  ext(smooth([[-2.4, 9.6], [-6, 9.1], [-10, 8.1], [-14, 6.5], [-17.4, 4.9], [-14, 5.7], [-10, 6.6], [-6, 7.3], [-2.4, 7]], 5), 2.1, plate, tail, 0, .2, ot);
  for (let k = 0; k < 9; k++) { const x = -3.4 - k * 1.55, top = 9.3 - k * .5, bot = 7.1 - k * .25; ext([[x, bot], [x + .35, bot], [x + .35, top], [x, top]], 2.4 - k * .14, plate2, tail, 0, .04, ot); box(.6, .07, .05, cy, x + .17 - ot[0], (top + bot) / 2 - ot[1], 1.22 - k * .07, tail); }
  spikesAlong([[-2, 9.7], [-.8, 10.5], [.6, 11.1], [1.9, 11.8], [3.1, 12.4], [4.4, 12.6], [5.6, 13.7], [6.5, 14.4]], [1.1, 1.6, 2, 2.2, 2.1, 1.7, 1.3, 1]);
  spikesAlong([[-4, 9.3 - 8.4 + 8.4], [-6, 8.9], [-8, 8.4], [-10, 7.8], [-12, 7], [-14, 6.2]].map(([x, y]) => [x + 2.4, y - 8.4]), [1.2, 1.1, 1, .85, .7, .55], tail);
  pLight(C.mag, 320, 46, -2, 22, 10, scene); pLight(0x6a8cff, 220, 40, -30, 14, 8, scene); pLight(C.cyan, 200, 30, -10, 8, 8, scene); const core = pLight(C.cyan, 12, 10, 2.4, 9, 3.5, g);
  g.position.set(-16.5, 0, -5); g.scale.setScalar(1.05);
  let nextRoar = now() + rnd(9000, 14000), roarT = -1;
  let st = 'away', stT = 0, awaySince = now() - 20000, X = -52; g.visible = false;
  return { g, get here() { return st !== 'away'; }, update(dt, t) { const br = Math.sin(t * 1.3); stT += dt;
      if (st === 'away') { if (!SkyEvents.ev && now() - awaySince > 15000 && !Q.has('noevents')) { st = 'in'; stT = 0; g.visible = true; X = -52; g.rotation.y = 0; toast('⚠ Kaiju mekanik mendekat dari distrik barat'); Sound.step(); } }
      else if (st === 'in') { X += 4.2 * dt; if (X >= -16.5) { X = -16.5; st = 'stay'; stT = 0; nextRoar = now() + 1500; } }
      else if (st === 'stay') { if (stT > rnd(38, 40)) { st = 'out'; stT = 0; g.rotation.y = Math.PI; } }
      else if (st === 'out') { X -= 4.2 * dt; if (X < -60) { st = 'away'; g.visible = false; awaySince = now(); } }
      const walking = st === 'in' || st === 'out'; if (walking && Math.floor(t * 1.4) !== this._s) { this._s = Math.floor(t * 1.4); shake = Math.max(shake, .3); Sound.step(); } head.rotation.z = Math.sin(t * .7) * .04 + (roarT >= 0 ? .2 : 0); tail.rotation.y = Math.sin(t * .8) * .08; tail.rotation.z = Math.sin(t * .6) * .03;
      const sw = walking ? .38 : .05, sp2 = walking ? 2.2 : .5; legs[0].rotation.z = Math.sin(t * sp2 * 2) * sw; legs[1].rotation.z = -Math.sin(t * sp2 * 2) * sw; g.position.x = X; g.position.y = br * .04 + (walking ? Math.abs(Math.sin(t * sp2 * 2)) * .3 : 0);
      if (st === 'stay' && now() > nextRoar && !Q.has('noevents')) { nextRoar = now() + rnd(16000, 26000); roarT = 0; Sound.roar(); shake = .4; }
      if (roarT >= 0) { roarT += dt; const op = Math.min(1, roarT * 3) * (roarT > 2.4 ? Math.max(0, 1 - (roarT - 2.4) * 3) : 1); jaw.rotation.z = -.55 * op; mouthLight.intensity = 30 * op; mouth.visible = op > .2; if (roarT > 2.8) roarT = -1; }
      else { jaw.rotation.z = -.04 - Math.max(0, Math.sin(t * .6)) * .07; mouthLight.intensity = 0; mouth.visible = false; } core.intensity = 12 + Math.sin(t * 3) * 4; } };
})();
// holographic shark (bites over the street) + koi swimming in the sky + face posters + left billboard
const holoMat = (c, o = .55) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, opacity: o, wireframe: true, toneMapped: false, depthWrite: false });
// roof gear:// roof gear: big dishes, AC unit, antenna mast, cables to billboard, patrol drones with spotlights, kanji sign
{ CUR = scene; const yR = FH * 5; for (const [x, z, r, ry] of [[27.2, 3.6, 1.6, .5], [31.6, 2.4, 1.3, -.4]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), M(0x252b38, { side: THREE.DoubleSide, metalness: .6, roughness: .4 })); d.rotation.set(-2.2, ry, .3); d.position.set(x, yR + 2.4, z); scene.add(d); box(.14, 2.2, .14, mats.metal, x, yR, z); cone2(x, yR + 2.6, z); }
  function cone2(x, y, z) { box(.06, .9, .06, mats.metal, x + .4, y, z + .3); box(.14, .14, .14, E(C.red, 3), x + .4, y + .9, z + .3); }
  box(2.2, 1.4, 1.2, M(0xc8ced8, { metalness: .3 }), 13.4, yR, 4.4); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .04, 16), mats.dark); fan.rotation.x = Math.PI / 2; fan.position.set(13.8, yR + .7, 5.02); scene.add(fan); anim.spin.push(fan); fan.userData.fast = true;
  for (const [a, b, sag] of [[[17, yR + 3.2, .3], [10.5, yR + .7, 5.8], 1.6], [[25, yR + 3.2, .3], [34, yR + .7, 5.6], 1.8], [[21, yR + 4.2, .3], [27.2, yR + 2.4, 3.6], 1], [[19, yR + 4.6, .3], [12.4, yR + 2, 2], 1.2], [[33, yR, 4], [36.4, FH * 3.8, 6.4], 2.2]]) cable(new THREE.Vector3(...a), new THREE.Vector3(...b), sag, 0x0c0f17, .05);
  neonSign('岸戸電脳館', C.mag, 9.2, FH * 3.3, D + .7, .7, 0, true); neonSign('蘭店', C.mag, 15.2, yR + 1.3, D + .1, .55); }
const patrol = []; for (let i = 0; i < 2; i++) { const g = new THREE.Group(); scene.add(g); rbox(1.4, .35, .9, .1, M(0x1a1f2c, { metalness: .7 }), 0, 0, 0, g); box(1.5, .06, .06, E(C.amber, 2.6), 0, .02, .46, g); const sp = new THREE.Mesh(new THREE.ConeGeometry(.9, 6, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: .025, depthWrite: false, side: THREE.DoubleSide })); sp.position.y = -3; g.add(sp); patrol.push({ g, sp, ph: i * 3, x: i ? 30 : 12 }); }
// street life: umbrella pedestrians, ramen cook + flames
const peds3 = []; for (let i = 0; i < 7; i++) { const b = makeBody({ color: pick(['#ff3fa4', '#3ff0ff', '#ffb347', '#c9a6ff', '#9fffcf']) }, 200 + i); scene.add(b.root); const um = new THREE.Group(); b.root.add(um); um.position.set(.1, 2.25, 0);
  const can = new THREE.Mesh(new THREE.ConeGeometry(.6, .32, 12, 1, true), M(pick([0x1b2232, 0x2a2236, 0x0e2a33]), { side: THREE.DoubleSide })); can.position.y = .16; um.add(can); const rim = new THREE.Mesh(new THREE.TorusGeometry(.6, .02, 4, 20), E(pick([C.cyan, C.mag, C.amber]), 2.6)); rim.rotation.x = Math.PI / 2; um.add(rim); box(.02, .7, .02, mats.dark, 0, -.6, 0, um);
  if (Math.random() < .25) um.visible = false; peds3.push({ b, x: rnd(-34, 42), v: rnd(.9, 1.4) * (Math.random() < .5 ? 1 : -1), z: pick([7.3, 15.4, 16.2]), ph: Math.random() * 6 }); }
const cook = makeBody({ color: '#ff5a4a' }, 321); scene.add(cook.root); cook.root.position.set(-4, 0, 5.15); { const hat = new THREE.Mesh(new THREE.CylinderGeometry(.17, .15, .2, 10), M(0xf0f0f0)); hat.position.y = .42; cook.head.add(hat); }
const flames = []; for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.18, .6, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(k ? 0xffa040 : 0xff5020).multiplyScalar(2.4), transparent: true, opacity: .85, toneMapped: false, depthWrite: false })); f.position.set(-5.4 + k * .22, 1.2, 5.7); scene.add(f); flames.push(f); }
const fireL = pLight(0xff7a30, 20, 7, -5.2, 1.6, 6.2, scene);

// ====================================================================== the city (3D, fogged)
{ CUR = scene; const winTex = ctex(32, 64, c => { c.fillStyle = '#000'; c.fillRect(0, 0, 32, 64); for (let y = 3; y < 64; y += 8) for (let x = 1; x < 32; x += 8) if (Math.random() < .18) { c.fillStyle = Math.random() < .85 ? '#ffcf73' : '#a9ecff'; c.globalAlpha = rnd(.5, 1); c.fillRect(x, y, 6, 4); c.globalAlpha = 1; } });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.magFilter = THREE.NearestFilter;
  const mats2 = [0x1c2233, 0x222a3d, 0x181d2b].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: .5, roughness: .9 }));
  const R2 = rng(99);
  for (let i = 0; i < 62; i++) { const x = -120 + (i / 62) * 260 + R2() * 6, z = -55 - R2() * 120, w = 5 + R2() * 12, d = 4 + R2() * 10, h = 8 + R2() * (z < -120 ? 46 : z < -80 ? 32 : 22); if (x > -2 && x < 42 && z > -20) continue;
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / 8, uv.getY(q) * h / 10);
    const m = new THREE.Mesh(geo, mats2[i % 3]); m.position.set(x, h / 2 - 2, z); CUR.add(m);
    if (R2() < .25) { const col = pick([C.mag, C.cyan, C.amber]); box(w * .9, .25, .25, E(col, 2), x, h - 2.1, z + d / 2 + .1); }
    if (R2() < .18) neonSign(pick(['バー', 'ホテル', '電脳', 'クラブ', '24H']), pick([C.mag, C.cyan]), x + w / 2 + .3, h * .5, z + d / 2, 1.2, 0, true);
    if (R2() < .12) { box(.3, 8, .3, mats.dark, x, h - 2, z); const tip = box(.6, .6, .6, E(C.red, 3), x, h + 6, z); anim.blink.push({ m: tip, ph: R2() * 6 }); } }
  // giant billboard tower mid-distance + searchlights
  box(14, 30, 10, M(0x161b28), -48, -2, -56); plane(12, 7, screenMat(192, 112, 'billboard'), -48, 22, -50.9);
  for (const [x, z] of [[-60, -80], [20, -110], [70, -70]]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(.5, 6, 140, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide })); sl.geometry.translate(0, 70, 0); sl.position.set(x, 0, z); CUR.add(sl); anim.spin.push({ search: sl, ph: Math.random() * 6 }); }
  const moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(64, 64, c => { const gr = c.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(235,240,255,1)'); gr.addColorStop(.25, 'rgba(220,228,250,.9)'); gr.addColorStop(.3, 'rgba(200,210,240,.25)'); gr.addColorStop(1, 'rgba(200,210,240,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }), fog: false, depthWrite: false }));
  moonS.scale.set(30, 30, 1); moonS.position.set(-6, 64, -170); moonS.material.opacity = .75; scene.add(moonS);
}

// ====================================================================== procedural cyber-humans (no sprites)
function makeBody(meta, seed) {
  const R2 = rng(seed * 97 + 13), accHex = new THREE.Color(meta.color || '#3ff0ff').getHex();
  const skin = M(SKIN[(R2() * SKIN.length) | 0], { roughness: .55 }), jacket = M(new THREE.Color(accHex).lerp(new THREE.Color(0x141a26), .7).getHex(), { roughness: .42, metalness: .25 }), jacket2 = M(new THREE.Color(accHex).lerp(new THREE.Color(0x0b0e16), .5).getHex(), { roughness: .38, metalness: .3 });
  const pants = M(pick([0x1b2232, 0x23283a, 0x2a2236, 0x1d1d24]), { roughness: .75 }), boots = M(0x0b0d12, { roughness: .3, metalness: .35 }), glow = E(accHex, 2.4), hairM = M(HAIR[(R2() * HAIR.length) | 0], { roughness: .45 }), dark = M(0x0b0d12), metal = M(0x8a94a8, { metalness: .85, roughness: .25 });
  const cap = (r, l, m, x, y, z, p, rz = 0) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), m); o.position.set(x, y, z); o.rotation.z = rz; p.add(o); return o; };
  const sph = (r, m, x, y, z, p, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); p.add(o); return o; };
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = .92; root.add(hips);
  const leg = s => { const p = new THREE.Group(); p.position.set(s * .1, 0, 0); hips.add(p); cap(.085, .3, pants, 0, -.22, 0, p); sph(.07, metal, 0, -.46, .04, p, 1, .8, .6); cap(.07, .3, pants, 0, -.66, 0, p);
    const bt = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .14, 4, 10), boots); bt.rotation.x = Math.PI / 2; bt.position.set(0, -.88, .05); p.add(bt); box(.16, .025, .27, glow, 0, -.95, .05, p); return p; };
  const legL = leg(-1), legR = leg(1);
  const torso = new THREE.Group(); hips.add(torso); const pel = cap(.13, .14, pants, 0, .02, 0, torso, Math.PI / 2); pel.scale.z = .9;
  const prof = [[0, -.04], [.17, -.04], [.19, .12], [.215, .34], [.2, .48], [.12, .58], [.05, .62], [0, .62]].map(([x, y]) => new THREE.Vector2(x, y));
  const jk = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), jacket); jk.scale.z = .66; torso.add(jk); const belt = new THREE.Mesh(new THREE.TorusGeometry(.175, .02, 6, 20), dark); belt.rotation.x = Math.PI / 2; belt.scale.y = .66; belt.position.y = .02; torso.add(belt);
  const bl = new THREE.Mesh(new THREE.TorusGeometry(.2, .012, 4, 22), glow); bl.rotation.x = Math.PI / 2; bl.scale.y = .66; bl.position.y = .36; torso.add(bl);
  box(.01, .44, .01, glow, 0, .12, .138, torso); const col = new THREE.Mesh(new THREE.TorusGeometry(.1, .04, 8, 16), jacket2); col.rotation.x = Math.PI / 2; col.position.y = .6; torso.add(col);
  const style2 = R2(); if (style2 < .4) { const bp = cap(.12, .18, dark, 0, .26, -.17, torso); bp.scale.z = .6; box(.015, .26, .01, glow, .06, .26, -.25, torso); }
  else if (style2 < .7) { const coat = new THREE.Mesh(new THREE.CylinderGeometry(.2, .27, .5, 16, 1, true, Math.PI * .6, Math.PI * 1.8), M(new THREE.Color(accHex).lerp(new THREE.Color(0x10141d), .8).getHex(), { side: THREE.DoubleSide, roughness: .6 })); coat.scale.z = .7; coat.position.y = -.2; torso.add(coat); }
  const head = new THREE.Group(); head.position.y = .64; torso.add(head); cap(.055, .05, skin, 0, .03, 0, head); const skull = sph(.145, skin, 0, .2, .005, head, .92, 1.08, 1); sph(.04, skin, 0, .16, .135, head, .8, 1, .9);
  for (const sx of [-.055, .055]) { sph(.022, M(0xffffff), sx, .21, .125, head); sph(.013, E(R2() < .5 ? accHex : 0x101418, 1.2), sx, .21, .14, head); } box(.05, .01, .01, M(0x8a4a4a), 0, .11, .133, head);
  const style = R2(); const hx = new THREE.Mesh(new THREE.SphereGeometry(.158, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), hairM); hx.position.set(0, .22, -.005); hx.scale.set(.95, 1.05, 1.04); head.add(hx);
  if (style < .3) { cap(.12, .14, hairM, 0, .12, -.07, head).scale.z = .6; } else if (style < .55) { for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(.04, .16, 5), hairM); sp.position.set(0, .37 - k * .01, -.1 + k * .045); sp.rotation.x = -.3 + k * .1; head.add(sp); } }
  else if (style < .8) { cap(.06, .32, hairM, 0, .02, -.12, head); } else { const bun = sph(.07, hairM, 0, .3, -.12, head); }
  if (R2() < .5) { const vz = new THREE.Mesh(new THREE.TorusGeometry(.15, .022, 6, 20, Math.PI * .8), glow); vz.rotation.set(0, 0, Math.PI * .1); vz.position.set(0, .21, .01); vz.rotation.x = Math.PI / 2; vz.rotation.z = Math.PI * 1.1; head.add(vz); } else sph(.03, E(C.cyan, 3), -.15, .2, .04, head);
  if (R2() < .35) { const mask = sph(.11, dark, 0, .1, .06, head, 1, .5, .9); }
  const arm = s => { const p = new THREE.Group(); p.position.set(s * .27, .5, 0); torso.add(p); sph(.09, jacket2, 0, -.01, 0, p, 1, .9, 1); cap(.06, .24, jacket, 0, -.2, 0, p); const cf = new THREE.Mesh(new THREE.TorusGeometry(.058, .012, 4, 14), glow); cf.rotation.x = Math.PI / 2; cf.position.y = -.4; p.add(cf);
    cap(.055, .2, jacket, 0, -.5, 0, p); sph(.052, R2() < .4 ? dark : skin, 0, -.68, 0, p, .9, 1.1, .8); return p; };
  const armL = arm(-1), armR = arm(1);
  const cup = new THREE.Group(); armR.add(cup); cup.position.set(0, -.74, .06); const cu = new THREE.Mesh(new THREE.CylinderGeometry(.045, .038, .12, 12), M(0xe8e8e8)); cup.add(cu); cup.visible = false;
  const cig = new THREE.Group(); armR.add(cig); cig.position.set(.02, -.72, .07); box(.02, .02, .12, M(0xeeeeee), 0, 0, .04, cig); const ember = box(.025, .025, .025, E(0xff5a2a, 4), 0, 0, .11, cig); cig.visible = false;
  const phone = new THREE.Group(); armL.add(phone); phone.position.set(0, -.74, .08); box(.08, .14, .015, M(0x0b0d12), 0, 0, 0, phone); box(.07, .12, .005, E(C.cyan, 1.8), 0, .01, .01, phone); phone.visible = false;
  const pick2 = []; root.traverse(o => { if (o.isMesh) pick2.push(o); });
  return { root, hips, legL, legR, torso, head, armL, armR, cup, cig, ember, phone, meshes: pick2 };
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
function toast(text) { const bx = document.getElementById('toasts'); if (!bx) return; while (bx.children.length > 3) bx.firstChild.remove(); const t = el('toast warn', `<i style="background:#ff3fa4"></i><div><b>NEONLOOM CITY</b><span>${esc(text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 6000); setTimeout(() => t.remove(), 6800); }
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
    const legs = []; if (this.f !== f) legs.push({ f: this.f, x: LIFT_X + rnd(-.3, .3), z: 2.75 }, { lift: f }); legs.push({ f, x, z }); this.legs = legs; this.done = done; if (!this.lift) this.nextLeg(); }
  nextLeg() { const L = this.legs.shift(); if (!L) { this.way = []; this.act = 'idle'; const d = this.done; this.done = null; d && d(); return; }
    if (L.lift !== undefined) { this.lift = { to: L.lift, ph: -1, t: 0 }; this.way = []; this.pop('🛗'); return; }
    const w = [], cl = laneZ(this.f, this.x), tl = laneZ(L.f, L.x); w.push([this.x, cl]);
    if (cl !== tl) { if (this.x >= 10.4) w.push([10.8, LANE], [10.8, WALK_OUT]); else w.push([10.8, WALK_OUT], [10.8, LANE]); }
    w.push([L.x, tl], [L.x, L.z]); this.way = w; }
  update(dt) {
    const b = this.b; this.t += dt;
    if (this.lift) { const L = this.lift, cab = liftCab.position; L.t += dt;
      if (L.ph === -1) { this.act = 'idle'; this.faceT = Math.PI; if (!liftOwner || liftOwner === this) { liftOwner = this; L.ph = 0; L.t = 0; } }
      else if (L.ph === 0) { liftWant = 0; const d = this.y - cab.y, sp = 4 * dt; if (Math.abs(d) <= sp) { cab.y = this.y; L.ph = 1; L.t = 0; Sound.ding(); } else cab.y += Math.sign(d) * sp; setLiftNum(String(Math.round(cab.y / FH) || 'L')); }
      else if (L.ph === 1) { liftWant = 1; if (L.t < .5) { this.act = 'idle'; } else { const dx = LIFT_X - this.x, dz = LIFT_Z - this.z, dd = Math.hypot(dx, dz); this.act = dd > .04 ? 'walk' : 'ride'; this.faceT = dd > .04 ? Math.atan2(dx, dz) : 0; if (dd > .04) { const st = Math.min(dd, 1.5 * dt); this.x += dx / dd * st; this.z += dz / dd * st; } else if (L.t > 1.6) { L.ph = 2; L.t = 0; } } }
      else if (L.ph === 2) { liftWant = 0; this.act = 'ride'; if (L.t > .5) { const ty = FL[L.to].y, d = ty - this.y, sp = 2.4 * dt; if (Math.abs(d) <= sp) { this.y = ty; cab.y = ty; this.f = L.to; L.ph = 3; L.t = 0; Sound.ding(); } else { this.y += Math.sign(d) * sp; cab.y = this.y; } setLiftNum(String(Math.round(this.y / FH) || 'L')); } }
      else if (L.ph === 3) { liftWant = 1; if (L.t > .7) { this.lift = null; liftOwner = null; this.nextLeg(); } } }
    else if (this.way.length) { const [px, pz] = this.way[0], dx = px - this.x, dz = pz - this.z, dist = Math.hypot(dx, dz), sp = (this.running ? 3.4 : 1.6) * dt;
      if (dist > .02) this.faceT = Math.atan2(dx, dz); this.act = this.running ? 'run' : 'walk'; if (dist <= sp) { this.x = px; this.z = pz; this.way.shift(); if (!this.way.length) this.nextLeg(); } else { this.x += dx / dist * sp; this.z += dz / dist * sp; } this.y = FL[this.f].y; }
    else if (!this.sitting && this.actUntil && now() > this.actUntil) { this.act = 'idle'; this.actUntil = 0; b.cup.visible = false; b.cig.visible = false; b.phone.visible = false; }
    if (this.act === 'walk' || this.act === 'run') { b.cig.visible = false; b.phone.visible = false; b.cup.visible = false; } if (this.sitting && !(this.sitMood === 'phone' && !isWork(this))) b.phone.visible = false;
    // turn smoothly
    let da = this.faceT - this.face; da = Math.atan2(Math.sin(da), Math.cos(da)); this.face += da * Math.min(1, dt * 10);
    b.root.position.set(this.x, this.y, this.z); b.root.rotation.y = this.face; this.pose(dt);
    if (this.sitting && isWork(this) && Math.random() < .03) Sound.type();
  }
  pose() { if (this.lift && this.lift.ph === 1 && this.act === 'walk') { /* boarding */ } const b = this.b, t = this.t, A = this.act; let hy = .92, lL = 0, lR = 0, aL = 0, aR = 0, aLz = 0, aRz = 0, hx = 0, hyw = 0, ty = 0, lean = 0;
    if (A === 'walk' || A === 'run') { const s = Math.sin(t * (A === 'run' ? 13 : 8.5)), k = A === 'run' ? .9 : .55; lL = s * k; lR = -s * k; aL = -s * k * .8; aR = s * k * .8; hy = .92 + Math.abs(Math.cos(t * (A === 'run' ? 13 : 8.5))) * .04; lean = A === 'run' ? .15 : .03; }
    else if (A === 'sit') { hy = .5; lL = lR = -1.45; const typing = isWork(this), m = typing ? null : this.sitMood; aL = aR = typing ? -1.15 + Math.sin(t * 18) * .08 : -.6; aRz = aLz = 0;
      if (typing) { aR += Math.sin(t * 17 + 1) * .08; hx = .12 + Math.sin(t * 2) * .03; }
      else if (m === 'sleep') { hx = .85; lean = .5; aL = aR = -1.7; aLz = -.3; aRz = .3; hy = .5 + Math.sin(t * 1.2) * .01; }
      else if (m === 'tired') { hx = .3 + Math.sin(t * .4) * .05; lean = .12; aR = -2.4; aRz = .45; aL = -.4; }
      else if (m === 'think') { hx = -.25; hyw = Math.sin(t * .3) * .5; aR = -2.5; aRz = .6; aL = -.7; }
      else if (m === 'stretch') { const k = Math.min(1, (Math.sin(t * .8) + 1)); aLz = -2.6 * k; aRz = 2.6 * k; lean = -.2 * k; hx = -.3 * k; }
      else if (m === 'phone') { this.b.phone.visible = true; aL = -1.5; aLz = -.35; hx = .45; aR = -.5; }
      else { hyw = Math.sin(t * .6) * .4; hx = -.05; } }
    else if (A === 'talk') { aR = -.7 + Math.sin(t * 5) * .35; aRz = .2; hx = Math.sin(t * 6) * .08; hyw = Math.sin(t * 1.5) * .2; aL = -.1; }
    else if (A === 'celebrate') { aLz = -2.7 + Math.sin(t * 10) * .2; aRz = 2.7 - Math.sin(t * 10) * .2; hy = .92 + Math.abs(Math.sin(t * 7)) * .18; hx = -.15; }
    else if (A === 'dance') { aLz = -1.4 + Math.sin(t * 6) * .8; aRz = 1.4 + Math.sin(t * 6 + 1) * .8; hy = .9 + Math.abs(Math.sin(t * 6)) * .1; lL = Math.sin(t * 6) * .4; lR = -Math.sin(t * 6) * .4; ty = Math.sin(t * 3) * .4; hyw = Math.sin(t * 3) * .4; }
    else if (A === 'coffee') { this.b.cup.visible = true; aR = -2.2 + Math.max(0, Math.sin(t * 1.2)) * .5; aRz = .3; hx = -.05; }
    else if (A === 'frustrated') { aLz = -2.2; aRz = 2.2; aL = aR = -.6; hx = .3 + Math.sin(t * 12) * .05; hyw = Math.sin(t * 8) * .3; }
    else if (A === 'game') { aL = aR = -1.1 + Math.sin(t * 20) * .12; hx = .15; }
    else if (A === 'yawn') { aRz = 2.6; aLz = -.2; hx = -.35; }
    else if (A === 'ride') { hyw = Math.sin(t * .8) * .3; hx = -.1; aL = aR = .05; }
    else if (A === 'smoke') { const puff = Math.sin(t * .9) > .55; this.b.cig.visible = true; aR = puff ? -2.55 : -.6; aRz = puff ? .62 : .22; aL = -.15; aLz = -.1; hx = puff ? -.18 : .06; hyw = puff ? 0 : Math.sin(t * .25) * .5; lean = .03;
      this.b.ember.material.color.setScalar(puff ? 6 : 2.5).multiply(new THREE.Color(0xff5a2a)); if (this._puff && !puff) smokePuff(this); this._puff = puff; }
    else if (A === 'phone') { this.b.phone.visible = true; aL = -1.35; aLz = -.35; hx = .5; aR = -.1; hyw = Math.sin(t * .4) * .1; lean = .06; }
    else if (A === 'stretch') { const k = Math.abs(Math.sin(t * .9)); aLz = -2.9 * k; aRz = 2.9 * k; lean = -.18 * k; hx = -.35 * k; hy = .92 + k * .03; }
    else if (A === 'slump') { hx = .55 + Math.sin(t * .5) * .05; lean = .2; aL = .05; aR = .05; hy = .89 + Math.sin(t * 1.1) * .01; }
    else if (A === 'daydream') { hx = -.4; hyw = .5 + Math.sin(t * .22) * .35; aR = -.15; aL = .1; hy = .92 + Math.sin(t * .9) * .008; }
    else if (A === 'lean') { lean = .42; aL = aR = -.95; aLz = -.1; aRz = .1; hx = -.1 + Math.sin(t * .3) * .1; hyw = Math.sin(t * .2) * .4; hy = .9; }
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
    if (this.sitting && !isWork(this) && Math.random() < .06) { this.sitMood = pick([null, null, 'tired', 'think', 'stretch', 'phone', 'sleep']); if (this.sitMood === 'sleep') this.pop('💤'); if (this.sitMood === 'tired') this.pop('😮‍💨'); } if (isWork(this)) this.sitMood = null;
    if (this.sitting && Math.random() < .035) this.pop(isWork(this) ? pick(['⌨️', '🧠', '📊', '⚡', '💾', '🔍']) : pick(['💡', '☕', '🎧', '💭', '😴', '📈', '🎵', '😎']));
    if (this.busy() || now() < this.next || Phase.cur) return; this.next = now() + rnd(9000, 20000);
    const r = Math.random(), others = Object.values(npcs).filter(n => n !== this && !n.busy());
    const at = (key, msgs, emo, ms = 10000) => { const [f, x, z, kind] = SPOTS[key]; this.mode = 'busy'; this.goTo(f, x + rnd(-.3, .3), z, () => {
      this.say(pick(msgs), 3500, 'chat'); this.faceT = kind === 'smoke' ? (key === 'smoke3' ? -Math.PI / 2 : 0) : kind === 'look' ? (key === 'metro' || key === 'ramen' || key === 'ramen2' ? Math.PI : key === 'pad' ? -Math.PI / 2 : 0) : (kind === 'game' || kind === 'snack' || kind === 'ramen' ? Math.PI : 0);
      this.emote(emo, ms * .8); if (kind === 'game') { this.pop('🎮'); setTimeout(() => Sound.party(), 1800); } setTimeout(() => this.goDesk(), ms); }); };
    if (r < .08) at(pick(['smoke1', 'smoke2', 'smoke3']), ['Sebat dulu bentar…', 'Capek banget hari ini…', 'Hujan terus ya…', 'Lima menit aja.'], 'smoke', 14000);
    else if (r < .12) at(pick(['window', 'balcony', 'pad']), ['…', 'Mikirin hidup.', 'Kapan liburan ya…', 'Lampu kota indah juga.'], pick(['daydream', 'lean']), 12000);
    else if (r < .16) { this.mode = 'busy'; this.goTo(this.sf, clamp(this.sx + rnd(-2, 2), FL[this.sf].ix0 + 1, FL[this.sf].ix1 - 1), 3.6, () => { this.faceT = 0; this.emote(pick(['phone', 'stretch', 'slump']), 8000); this.say(pick(['Cek notif dulu…', 'Pegal semua…', 'Ngantuk…', 'Chat dari owner nih.']), 3500, 'chat'); setTimeout(() => this.goDesk(), 9000); }); }
    else if (r < .21) at(pick(['couch', 'coffee', 'vend']), ['Kopi dulu ☕', 'Snack biar fokus.', 'Rebahan bentar…', 'Vending ini macet lagi…'], pick(['coffee', 'idle', 'yawn']));
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
const liftCab = new THREE.Group(); scene.add(liftCab); liftCab.position.set(LIFT_X, 0, LIFT_Z); liftCab.rotation.y = -Math.PI / 2;
{ const fr = M(0x3a4458, { metalness: .7, roughness: .3 }); box(1.7, .1, 1.7, fr, 0, 0, 0, liftCab); box(1.7, .1, 1.7, fr, 0, 2.5, 0, liftCab); box(1.66, .04, 1.66, E(C.cyan, 2), 0, 2.46, 0, liftCab);
  for (const [x, z] of [[-.83, -.83], [-.83, .83], [.83, -.83], [.83, .83]]) box(.08, 2.5, .08, fr, x, 0, z, liftCab); plane(1.6, 2.4, mats.glass, -.84, 1.25, 0, Math.PI / 2, liftCab); plane(1.6, 2.4, mats.glass, 0, 1.25, -.84, 0, liftCab); plane(1.6, 2.4, mats.glass, 0, 1.25, .84, 0, liftCab);
  box(.04, .05, 1.5, E(C.cyan, 2), -.8, 1, 0, liftCab); pLight(C.cyan, 4, 4, 0, 2, 0, liftCab); }
const liftDoorL = box(.06, 2.3, .8, new THREE.MeshPhysicalMaterial({ color: 0x9fc6ff, transparent: true, opacity: .35, metalness: .6, roughness: .1 }), .86, .1, -.42, liftCab), liftDoorR = liftDoorL.clone(); liftDoorR.position.z = .42; liftCab.add(liftDoorR);
const liftNum = ctex(32, 16, () => {}); plane(.6, .3, new THREE.MeshBasicMaterial({ map: liftNum, toneMapped: false }), .9, 2.72, 0, Math.PI / 2, liftCab); box(.06, .36, .7, mats.dark, .87, 2.55, 0, liftCab);
let liftOwner = null, liftOpen = 0, liftWant = 0;
function setLiftNum(txt) { const c = liftNum.userData.c.getContext('2d'); c.fillStyle = '#05080e'; c.fillRect(0, 0, 32, 16); c.fillStyle = '#3ff0ff'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(txt, 16, 12); liftNum.needsUpdate = true; } setLiftNum('L');
for (let f = 0; f < 6; f++) { neonSign(f === 0 ? 'LIFT ⇅' : 'LIFT ' + f, C.cyan, LIFT_X, FL[f].y + 2.95, LIFT_Z + 1, .26); box(.2, .25, .1, E(C.mag, 2), LIFT_X + 1.15, FL[f].y + 1.2, LIFT_Z + 1); }
for (const x of [-.5, .5]) box(.03, FH * 5 + 3, .03, mats.dark, LIFT_X + x, 0, LIFT_Z - .7);

const smokeSprites = []; const smokeMat = new THREE.SpriteMaterial({ color: 0xc8d0e0, transparent: true, opacity: .4, depthWrite: false });
function smokePuff(n) { const p = n.b.head.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(smokeMat.clone()); sp.position.copy(p).add(new THREE.Vector3(rnd(-.05, .05), .05, .2)); sp.scale.setScalar(.15); scene.add(sp); smokeSprites.push({ sp, t: i * .15, v: new THREE.Vector3(rnd(-.1, .1), .35, rnd(0, .1)) }); } }
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
const CAR_SHAPES = {
  sedan: { L: 3.6, d: 1.55, body: [[-1.8, .2], [-1.85, .55], [-1.35, .7], [-.65, 1.15], [.55, 1.18], [1.2, .78], [1.8, .62], [1.88, .32], [1.5, .12], [-1.45, .12]], glass: [[-.55, .78], [-.45, 1.06], [.5, 1.08], [1.02, .78]] },
  van: { L: 3.8, d: 1.6, body: [[-1.9, .15], [-1.92, 1.5], [-1.7, 1.62], [.8, 1.62], [1.55, 1], [1.9, .75], [1.92, .2], [1.6, .1], [-1.6, .1]], glass: [[.82, 1.5], [.85, 1.02], [1.5, .98], [1.02, 1.5]] },
  truck: { L: 4.6, d: 1.7, body: [[-2.3, .15], [-2.3, 1.85], [.9, 1.85], [1.1, 1.3], [1.9, 1.2], [2.35, .8], [2.35, .2], [-2.2, .1]], glass: [[1.15, 1.25], [1.2, 1.7], [1.5, 1.7], [1.95, 1.2]] },
  bike: { L: 2.1, d: .45, body: [[-1.05, .3], [-.85, .65], [-.1, .75], [.55, .95], [1.05, .68], [1.1, .38], [.1, .22]], glass: [[.35, .9], [.55, 1.1], [.85, .92]] } };
function makeCar(kind, col) {
  const g = new THREE.Group(), S = CAR_SHAPES[kind], body = M(pick([0x1b2232, 0x2a2236, 0x3a3f4f, 0x5a1a2a, 0xd8dde8, 0xffcf3a, 0x1e3a5f]), { metalness: .85, roughness: .2 }), trim = M(0x0b0d12, { metalness: .6, roughness: .3 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x14283e, roughness: .04, metalness: .6, transparent: true, opacity: .9 }), neon = E(col, 2.6);
  extrude(smoothPts(S.body, 3), S.d, body, g, 0, .08); extrude(S.glass, S.d + .06, glass, g, 0, .03); extrude(S.body.filter(q => q[1] < .4).concat([[S.L / 2 - .2, .42], [-S.L / 2 + .2, .42]]).slice(0, 3).length > 2 ? [[-S.L / 2 + .1, .18], [S.L / 2 - .1, .18], [S.L / 2 - .2, .3], [-S.L / 2 + .2, .3]] : [[0, 0], [1, 0], [1, 1]], S.d + .1, trim, g, 0, .02);
  for (const z of [S.d / 2 + .06, -S.d / 2 - .06]) { box(S.L * .8, .03, .02, neon, 0, .32, z, g); if (kind !== 'bike') box(.02, .3, .01, trim, -.1, .45, z, g); }
  if (kind === 'bike') { for (const x of [-.75, .75]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.24, .05, 6, 18), neon); r.position.set(x, .3, 0); g.add(r); } }
  else for (const x of [-S.L / 2 + .7, S.L / 2 - .7]) for (const sg of [-1, 1]) { const pod = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, .16, 14), trim); pod.position.set(x, .08, sg * (S.d / 2 - .1)); g.add(pod); const ring = new THREE.Mesh(new THREE.TorusGeometry(.24, .03, 6, 16), neon); ring.rotation.x = Math.PI / 2; ring.position.set(x, .02, sg * (S.d / 2 - .1)); g.add(ring); }
  if (kind === 'truck') { extrude([[-2.1, .5], [.6, .5], [.6, 1.6], [-2.1, 1.6]], S.d + .04, E(col, 1.3), g, 0, 0); }
  box(S.L * .85, .04, S.d * .85, E(col, 2), 0, .06, 0, g); box(.05, .1, kind === 'bike' ? .2 : S.d * .75, E(0xfff1d0, 3.4), S.L / 2 + .02, .48, 0, g); box(.05, .08, kind === 'bike' ? .2 : S.d * .85, E(0xff2240, 3.4), -S.L / 2 - .02, .5, 0, g);
  const ex = new THREE.Mesh(new THREE.ConeGeometry(.12, .5, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(2), transparent: true, opacity: .7, toneMapped: false })); ex.rotation.z = Math.PI / 2; ex.position.set(-S.L / 2 - .25, .35, 0); g.add(ex);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: .03, depthWrite: false, side: THREE.DoubleSide })); beam.rotation.z = Math.PI / 2; beam.position.set(S.L / 2 + 3.5, .45, 0); g.add(beam); return g; }
const traffic = [], skyTraffic = [];
function spawnCar(lane) { const dir = lane ? -1 : 1, kind = pick(['sedan', 'sedan', 'van', 'bike', 'truck']), g = makeCar(kind, pick([C.cyan, C.mag, C.amber])); g.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(g);
  traffic.push({ g, lane, x: dir > 0 ? -60 : 75, v: rnd(9, 18) * dir * (kind === 'bike' ? 1.4 : 1), ph: Math.random() * 6, z: lane ? 12.4 : 9.8 }); }
for (let i = 0; i < 26; i++) { const g = makeCar(pick(['sedan', 'van', 'bike']), pick([C.cyan, C.mag, C.amber])); const v = rnd(6, 14) * (Math.random() < .5 ? 1 : -1); g.rotation.y = v > 0 ? 0 : Math.PI; g.scale.setScalar(rnd(.8, 1.3)); scene.add(g); skyTraffic.push({ g, x: rnd(-140, 160), y: [16, 24, 32, 44][i % 4] + rnd(-1, 1), z: -rnd(18, 110), v }); }
const Vtol = (() => { const g = new THREE.Group(); scene.add(g); const hull = M(0x1a1f2c, { metalness: .6, roughness: .35 });
  extrude(smoothPts([[-2.6, .3], [-2.9, .9], [-2.2, 1.35], [-.6, 1.5], [.9, 1.55], [2.1, 1.2], [2.8, .65], [2.6, .25], [1.4, -.05], [-1.6, -.05]], 4), 1.9, hull, g, 0, .12);
  extrude(smoothPts([[.9, 1.45], [1.25, 1.85], [2.05, 1.6], [2.5, 1.05], [1.7, 1.15]], 3), 1.5, new THREE.MeshPhysicalMaterial({ color: 0xffb347, emissive: 0x7a4200, transparent: true, opacity: .92, roughness: .08 }), g, 0, .05);
  extrude([[-2.6, 1.25], [-3.3, 2.3], [-2.9, 2.35], [-1.9, 1.4]], .2, hull, g, 0, .04); for (const z of [-.97, .97]) { box(3.6, .05, .03, E(C.amber, 2.4), -.2, .7, z, g); for (let k = 0; k < 5; k++) box(.03, .5, .03, M(0x0b0d12), -1.6 + k * .6, .6, z, g); }
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
const RAIN_N = 4200, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RAIN_N * 6), rainV = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) { const x = rnd(-40, 60), y = rnd(-1, 40), z = rnd(-10, 20); rainPos.set([x, y, z, x - .08, y - .7, z], i * 6); rainV[i] = rnd(16, 24); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3)); scene.add(new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xb4c6ea, transparent: true, opacity: .3, fog: true })));
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
  function robot(cA, cB, cC) {   // original "real robot" design: tapered armour, skirts, V-fin, shield, rifle, backpack
    const g = new THREE.Group(), Wm = M(cA, { metalness: .35, roughness: .38, emissive: new THREE.Color(cA).multiplyScalar(.1) }), Dk = M(cB, { metalness: .55, roughness: .4, emissive: new THREE.Color(cB).multiplyScalar(.15) }), Ac = M(cC, { metalness: .4, roughness: .4, emissive: new THREE.Color(cC).multiplyScalar(.22) }), J = M(0x3a3f4a, { metalness: .75, roughness: .3 }), Y = E(0xfacc15, 1.5), G = E(C.cyan, 1.8);
    const tb = (wt, wb, h, d, mat, x, y, z, p = g) => { const geo = new THREE.CylinderGeometry(wt * .7071, wb * .7071, h, 4, 1); geo.rotateY(Math.PI / 4); const m = new THREE.Mesh(geo, mat); m.scale.z = d / ((wt + wb) / 2); m.position.set(x, y + h / 2, z); p.add(m); return m; };
    const legs = [], arms = [];
    for (const s of [-1, 1]) { const z = s * 1.15, p = new THREE.Group(); p.position.set(0, 9.2, z); g.add(p);
      tb(1.4, 1.2, 3.4, 1.4, J, 0, -3.6, 0, p); tb(1.5, 1.3, 2.6, .5, Wm, .55, -3.2, 0, p);
      tb(1.5, 2.1, 3.8, 2, Wm, 0, -7.8, 0, p); tb(.7, 1.6, 1.5, .5, Wm, .85, -4.6, 0, p); for (let k = 0; k < 3; k++) box(.1, .22, .9, Y, -1.05, -6.6 + k * .4, 0, p); box(.1, 2, .3, Ac, 1.03, -7.4, 0, p);
      box(1.1, .5, 1.1, J, 0, -8.3, 0, p); rbox(3.2, .7, 1.8, .2, Dk, .5, -9.2, 0, p); tb(.6, 1.6, .5, 1.7, Wm, 1.9, -9.2, 0, p); box(.6, .5, 1.6, Ac, -1, -9.2, 0, p); legs.push(p); }
    box(1.6, 1, 2.4, J, 0, 9, 0); tb(1.4, 1.8, 1.3, .3, Wm, 1, 7.7, .65).rotation.z = .25; tb(1.4, 1.8, 1.3, .3, Wm, 1, 7.7, -.65).rotation.z = .25; box(.4, .5, .4, Ac, 1.1, 8.9, 0);
    for (const s of [-1, 1]) { const sk = box(.3, 2, 1.6, Wm, 0, 7.2, s * 2.05); sk.rotation.x = -s * .15; box(.32, .3, 1.62, Ac, 0, 8.6, s * 2.05); } box(1, 1.8, 2, Dk, -1, 7.6, 0);
    tb(2, 1.7, 1.4, 2.4, Dk, 0, 9.9, 0); for (let k = 0; k < 3; k++) box(.1, .15, 1.6, J, 1, 10.1 + k * .35, 0);
    tb(2.6, 3.4, 2.8, 4.6, Dk, 0, 11.2, 0); tb(3.6, 2.6, .8, 4.8, Wm, 0, 13.6, 0);
    for (const s of [-1, 1]) { const v = box(.2, 1.2, 1.1, Y, 1.75, 11.8, s * 1.2); for (let k = 0; k < 3; k++) box(.22, .1, 1, J, 1.77, 11.95 + k * .3, s * 1.2); }
    box(.9, .9, 1.2, Ac, 1.6, 12.6, 0); const core = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8), E(C.cyan, 2)); core.position.set(2.05, 13, 0); g.add(core);
    for (const s of [-1, 1]) { const z = s * 3.05; const sh = rbox(2.4, 2.1, 2.2, .5, Wm, 0, 12.4, z); box(2.45, .3, .1, Ac, 0, 13.6, z + s * 1.11); box(2.45, .12, .1, Y, 0, 13.25, z + s * 1.11); const jt = new THREE.Mesh(new THREE.SphereGeometry(.6, 10, 8), J); jt.position.set(0, 12.8, s * 2.2); g.add(jt);
      const p = new THREE.Group(); p.position.set(0, 12.6, z); g.add(p); tb(1, .9, 2.4, 1, J, 0, -2.8, 0, p); const el = new THREE.Mesh(new THREE.SphereGeometry(.55, 10, 8), J); el.position.y = -3; p.add(el);
      const f = new THREE.Group(); f.position.set(0, -3, 0); p.add(f); tb(1.2, 1.6, 2.8, 1.6, Wm, 0, -3, 0, f); box(1.65, .35, 1.65, Ac, 0, -3.2, 0, f); rbox(.9, .9, .9, .2, Dk, 0, -3.9, 0, f); for (let k = 0; k < 3; k++) box(.25, .55, .18, Dk, .4, -4.4, -.3 + k * .3, f);
      if (s < 0) { const shd = new THREE.Group(); shd.position.set(.3, -1.6, -1.1); f.add(shd); tb(2.6, 1.4, 4.4, .25, Ac, 0, -2.4, 0, shd); tb(2.2, 1.1, 3.8, .28, Wm, 0, -2.1, -.03, shd); box(.5, .5, .32, Y, 0, .4, -.05, shd); }
      else { rbox(4.6, .55, .55, .12, J, 1.8, -3.7, 0, f); box(1.2, .8, .45, Dk, 1, -3.4, 0, f); box(.8, .3, .3, J, 1.2, -3, .1, f); box(.3, .32, .32, G, 4.1, -3.56, 0, f); } arms.push(p); }
    rbox(1.8, 3.2, 3, .3, Dk, -2.2, 10.8, 0); for (const s of [-1, 1]) { const th = new THREE.Mesh(new THREE.CylinderGeometry(.5, .7, 1.4, 12), J); th.position.set(-2.6, 10.2, s * .9); g.add(th); const sb = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1.4, 8), Wm); sb.position.set(-2.2, 14.6, s * .8); sb.rotation.z = .45; g.add(sb); box(.1, .3, .1, E(C.mag, 3), -2.5, 15.2, s * .8); }
    const head = new THREE.Group(); head.position.set(.15, 14.4, 0); g.add(head); rbox(1.3, 1.2, 1.25, .3, Wm, 0, 0, 0, head); box(.5, .55, 1, Wm, .5, .05, 0, head); box(.1, .14, .5, G, .72, .62, -.2, head); box(.1, .14, .5, G, .72, .62, .2, head); box(.35, .25, .4, Ac, .62, .05, 0, head);
    box(.3, .3, .2, Ac, .5, 1.05, 0, head); for (const s of [-1, 1]) { const v = box(.12, 1.6, .14, Y, .58, 1.1, s * .38, head); v.rotation.x = s * .9; box(.25, .5, .25, J, -.1, .55, s * .65, head); }
    return { g, legs, arms }; }
  const MAKE = {
    kaiju() { const g = new THREE.Group(), sk = M(0x3f6476, { roughness: .7, metalness: .1, emissive: 0x143546 }), dk = M(0x26394a, { roughness: .75, emissive: 0x0b1f2c }), bel = M(0x86a8b2, { roughness: .55, emissive: 0x23505e }), glow = E(C.cyan, 2.6), eye = E(C.red, 4.5), bone = M(0xe0d8c4, { emissive: 0x24201a });
      const cap = (r, len, mat, x, y, z, rz = 0, p = g, sx = 1) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat); m.position.set(x, y, z); m.rotation.z = rz; m.scale.z = sx; p.add(m); return m; };
      const cone = (r, h, mat, x, y, z, rz = 0, p = g, rx = 0) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); p.add(m); return m; };
      cap(2.7, 3.4, sk, 0, 7.2, 0, -.95); cap(2.1, 2.8, bel, .8, 6.9, 0, -.95, g, .9); for (let i = 0; i < 6; i++) { const b = cap(.3, 3.6 - Math.abs(i - 2.5) * .4, dk, -.8 + i * .55, 7 + i * .35, 0, -.95); b.scale.set(.6, 1, 2.6 * .9); }
      for (let i = 0; i < 26; i++) { const sc = new THREE.Mesh(new THREE.SphereGeometry(rnd(.25, .45), 6, 4), dk); const a = rnd(0, Math.PI * 2); sc.position.set(rnd(-2.2, 2), rnd(5.4, 9.6), Math.sin(a) > 0 ? 2.45 : -2.45); sc.scale.z = .4; g.add(sc); }
      for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-2 + i * .7, 5, 2.55), new THREE.Vector3(-1.6 + i * .7, 7, 2.62), new THREE.Vector3(-2 + i * .8, 9.2, 2.4)]), 10, .05, 4), glow); g.add(v); }
      cap(1.5, 2.4, sk, 3.3, 10.3, 0, -.55); for (let i = 0; i < 4; i++) cap(.35, 2.2, dk, 3.1 + i * .3, 10.4 + i * .3, 0, -.55).scale.set(.6, 1, 3.6);
      const head = new THREE.Group(); head.position.set(5, 11.8, 0); g.add(head); cap(1.15, 1.7, sk, 0, 0, 0, -Math.PI / 2); cap(.8, 1.5, sk, 1.5, -.15, 0, -Math.PI / 2); cap(.35, 1.9, dk, .3, .85, 0, -Math.PI / 2).scale.set(1, 1, 2.2);
      for (const z of [-.8, .8]) { box(.45, .28, .25, eye, .9, .45, z * 1.05, head); cone(.22, 1.7, bone, -1.1, 1.1, z * .7, .95, head); cone(.12, .8, bone, -.6, .95, z * .9, .6, head); } for (let k = 0; k < 7; k++) cone(.08, .36, bone, 1.1 + k * .32, -.6, .5 * (k % 2 ? 1 : -1), Math.PI, head);
      const jaw = new THREE.Group(); jaw.position.set(.4, -.55, 0); head.add(jaw); cap(.55, 2, dk, 1.2, -.3, 0, -Math.PI / 2); jaw.add(head.children.at(-1)); for (let k = 0; k < 7; k++) cone(.08, .36, bone, .5 + k * .32, .15, .42 * (k % 2 ? 1 : -1), 0, jaw); const mouthGlow = box(2.2, .08, .8, glow, 1.2, .02, 0, jaw);
      const legs = []; for (const z of [-1.9, 1.9]) { const p = new THREE.Group(); p.position.set(0, 6.8, z); g.add(p); cap(1.5, 2.2, sk, .3, -2, 0, .25, p); const kn = new THREE.Group(); kn.position.set(.8, -3.6, 0); p.add(kn); cap(1, 1.8, dk, -.2, -1.5, 0, -.2, kn); rbox(2.6, .8, 2, .35, dk, .5, -3.4, 0, kn); for (const dz of [-.6, 0, .6]) cone(.18, .7, bone, 1.9, -3.05, dz, -Math.PI / 2, kn); legs.push(p); }
      for (const z of [-2.5, 2.5]) { const a = new THREE.Group(); a.position.set(2.8, 8.6, z); g.add(a); cap(.45, 1.4, sk, 0, -1, 0, 0, a); const fa = new THREE.Group(); fa.position.set(0, -1.9, 0); a.add(fa); cap(.38, 1.2, dk, .5, -.4, 0, -1.2, fa); a.rotation.z = -.6; for (const dz of [-.22, 0, .22]) cone(.08, .45, bone, 1.4, -.75, dz, -Math.PI / 2 - .3, fa); }
      const tail = []; let par = g; for (let i = 0; i < 8; i++) { const t = new THREE.Group(); t.position.set(i ? -2.1 : -2.4, i ? -.12 : 4.4, 0); par.add(t); const sz = 1 - i * .11; cap(1.25 * sz, 1.4, i % 2 ? dk : sk, -1.05, 0, 0, Math.PI / 2, t); cone(.28 * sz, 1.2 * sz, glow, -1, 1.15 * sz, 0, -.3, t); tail.push(t); par = t; }
      for (let i = 0; i < 13; i++) { const k = i / 12, x = -2.6 + k * 6, y = 9.6 + k * 2.6 + Math.sin(k * Math.PI) * .5, h2 = .8 + Math.sin(k * Math.PI) * 1.8; cone(.3 + h2 * .12, h2, glow, x, y, 0, .35); }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, 1.4, 60, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(3.2), transparent: true, opacity: .85, toneMapped: false })); beam.rotation.z = -Math.PI / 2; beam.position.set(38, 11.4, 0); beam.visible = false; g.add(beam);
      const bl = new THREE.PointLight(C.cyan, 0, 60, 1.2); bl.position.set(9, 11.5, 2); g.add(bl); rim(g); g.scale.setScalar(1.5);
      let st = 0; return { g, dur: 32000, update(k, t) { g.position.set(-74 + k * 86, -5.5 + Math.abs(Math.sin(t * 2.2)) * .4, -28); legs[0].rotation.z = Math.sin(t * 2.2) * .4; legs[1].rotation.z = -Math.sin(t * 2.2) * .4; tail.forEach((s2, i) => { s2.rotation.y = Math.sin(t * 1.6 - i * .5) * .16; s2.rotation.z = Math.sin(t * 1.1 - i * .4) * .05; }); head.rotation.z = Math.sin(t * 1.1) * .06;
        const s = Math.floor(t * 2.2 / Math.PI); if (s !== st) { st = s; shake = Math.max(shake, .35); Sound.step(); }
        const fire = (k > .3 && k < .38) || (k > .7 && k < .78); beam.visible = fire; bl.intensity = fire ? 400 : 0; jaw.rotation.z = fire ? -.5 : -.05 - Math.max(0, Math.sin(t * .8)) * .12; mouthGlow.visible = fire; beam.rotation.y = .5; if (fire && !this.f) { this.f = 1; Sound.zap(); Sound.roar(); flash = .3; } if (!fire) this.f = 0; } }; },
    mecha() { const r = robot(0xe8ebf2, 0x2b303d, 0xe0407a), g = r.g, flames = []; for (const z of [-1.2, 1.2]) { const f = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.2, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(1.4), transparent: true, opacity: .55, toneMapped: false })); f.rotation.x = Math.PI; f.position.set(0, -.9, z); g.add(f); flames.push(f); }
      rim(g); g.scale.setScalar(1.2); g.rotation.y = -Math.PI / 2 + .3; return { g, dur: 24000, update(k, t) { g.position.set(-66 + k * 60, 1 + Math.sin(t * 1.4) * 1.5, -30); for (const f of flames) f.scale.y = .8 + Math.random() * .6; r.arms[1].rotation.z = k > .5 && k < .6 ? -1.6 : 0; } }; },
    transformer() { const g = new THREE.Group(), truck = new THREE.Group(); g.add(truck); box(8, 3, 2.6, M(0x334155), -2, .8, 0, truck); box(2.6, 3.2, 2.6, M(0xb91c1c), 3.4, .8, 0, truck); box(.1, 1.2, 2.2, E(0x93c5fd, 2), 4.75, 2.4, 0, truck); box(.1, .4, 2, E(0xfde68a, 3), 4.75, 1.2, 0, truck);
      const r = robot(0xc23a4a, 0x263045, 0x9aa6bc); r.g.scale.setScalar(.01); g.add(r.g); rim(g, C.mag); g.scale.setScalar(1.45);
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
  function start(kind) { if (ev) scene.remove(ev.g); kind = kind || pick(Object.keys(MAKE).filter(k2 => k2 !== 'kaiju')); ev = MAKE[kind](); ev.kind = kind; ev.t0 = now(); scene.add(ev.g); ev.update(0, now() / 1000, 0);
    if (kind === 'kaiju') Sound.roar(); if (kind === 'ufo') Sound.ufo(); if (kind === 'mecha') Sound.mecha(); if (kind === 'whale') Sound.chime(); if (kind === 'meteors') Sound.whoosh();
    toast('⚠ ' + TITLE[kind]); reactToEvent(LINES[kind], kind === 'kaiju' || kind === 'meteors'); }
  function update(dt) { if (ev) { const k = (now() - ev.t0) / ev.dur; if (k > 1) { scene.remove(ev.g); ev = null; nextAt = now() + rnd(20000, 35000); } else ev.update(k, now() / 1000, dt); } else if (now() > nextAt && !MK.here && !Q.has('noevents')) start(); }
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
function toastJob(ev, kind) { const bx = document.getElementById('toasts'), m = META[ev.agent] || {}; if (!bx) return; while (bx.children.length > 3) bx.firstChild.remove(); const t = el(`toast ${kind}`, `<i style="background:${m.color}"></i><div><b>${esc(ev.agent)}</b><span>${esc(ev.text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 8000); setTimeout(() => t.remove(), 8800); }

// ====================================================================== camera: auto-fit, pan, zoom, floor focus
const VIEW = { cx: 9.5, cy: 12.2, w: 58, h: 28 };   // framed region: neighbour+street on the left, tower on the right
const camDir = new THREE.Vector3(0, -.035, 1).normalize();
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
  if (k === 'escape') closePanel(); if (k === 'm') Sound.toggle(); 
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
  for (let i = smokeSprites.length - 1; i >= 0; i--) { const s2 = smokeSprites[i]; s2.t += dt; s2.sp.position.addScaledVector(s2.v, dt); s2.sp.scale.setScalar(.15 + s2.t * .5); s2.sp.material.opacity = Math.max(0, .4 - s2.t * .18); if (s2.t > 2.2) { scene.remove(s2.sp); smokeSprites.splice(i, 1); } }
  liftOpen += (liftWant - liftOpen) * Math.min(1, dt * 6); liftDoorL.position.z = -.42 - liftOpen * .4; liftDoorR.position.z = .42 + liftOpen * .4;
  for (const s of anim.steam) { s.t += dt; const k = (s.t % 2.4) / 2.4; s.sp.position.set(s.x + Math.sin(s.t * 3) * .05, s.y + k * .9, s.z); s.sp.material.opacity = .35 * (1 - k); s.sp.scale.setScalar(.15 + k * .4); }
  for (const tb of anim.tubes) tb.material.emissiveIntensity = 1 + Math.sin(t * 3 + tb.position.x) * .5;
  for (const d of drones) { d.x += d.v * dt; const F = FL[d.f]; if (d.x < F.ix0 + 1 || d.x > F.ix1 - 1) d.v *= -1; d.g.position.set(d.x, F.y + 2.5 + Math.sin(t * 2 + d.ph) * .15, 4 + Math.sin(t * .7 + d.ph)); d.led.visible = Math.sin(t * 8 + d.ph) > 0; }
  if (Math.random() < dt * .7) { spawnCar(Math.random() < .5 ? 0 : 1); if (Math.random() < .3) Sound.car(); }
  for (let i = traffic.length - 1; i >= 0; i--) { const c = traffic[i]; c.x += c.v * dt; c.g.position.set(c.x, .35 + Math.sin(t * 3 + c.ph) * .06, c.z); if (c.x < -70 || c.x > 85) { scene.remove(c.g); traffic.splice(i, 1); } }
  for (const c of skyTraffic) { c.x += c.v * dt; if (c.x > 170) c.x = -150; if (c.x < -150) c.x = 170; c.g.position.set(c.x, c.y + Math.sin(t + c.x) * .3, c.z); }
  MK.update(dt, t);
  for (const p of patrol) { p.g.position.set(p.x + Math.sin(t * .3 + p.ph) * 6, 25 + Math.sin(t + p.ph) * .5, 3 + Math.cos(t * .25 + p.ph) * 2); p.sp.rotation.z = Math.sin(t * .6 + p.ph) * .25; }
  for (const p of peds3) { p.x += p.v * dt; if (p.x > 44) p.x = -36; if (p.x < -36) p.x = 44; const b = p.b, s2 = Math.sin(t * 7 + p.ph); b.root.position.set(p.x, 0, p.z); b.root.rotation.y = p.v > 0 ? Math.PI / 2 : -Math.PI / 2; b.legL.rotation.x = s2 * .5; b.legR.rotation.x = -s2 * .5; b.armL.rotation.x = -s2 * .4; b.armR.rotation.set(-1.9, 0, .2); b.hips.position.y = .92 + Math.abs(Math.cos(t * 7 + p.ph)) * .03; }
  cook.armR.rotation.set(-1.2 + Math.sin(t * 6) * .3, 0, .2); cook.armL.rotation.set(-1 + Math.sin(t * 5 + 1) * .2, 0, -.1); cook.head.rotation.x = .25;
  for (const f of flames) { f.scale.set(1, .7 + Math.random() * .7, 1); } fireL.intensity = 16 + Math.random() * 10;
  Vtol.update(dt, t); SkyEvents.update(dt); cat?.update(dt, t);
  for (const n of Object.values(npcs)) n.update(dt);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.v.y -= p.gr * dt; p.m.position.addScaledVector(p.v, dt); if (p.spin) { p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 4; } p.life -= dt; if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
  const pa = rainGeo.attributes.position.array; for (let i = 0; i < RAIN_N; i++) { const o = i * 6, dy = rainV[i] * dt; pa[o + 1] -= dy; pa[o + 4] -= dy; pa[o] -= dy * .1; pa[o + 3] -= dy * .1; if (pa[o + 4] < -.3) { const x = camState.cur.x + rnd(-45, 45), y = rnd(30, 42), z = rnd(-10, 20); pa[o] = x; pa[o + 1] = y; pa[o + 2] = z; pa[o + 3] = x - .08; pa[o + 4] = y - .7; pa[o + 5] = z; } } rainGeo.attributes.position.needsUpdate = true;
  if (now() > nextBolt && !Q.has('noevents')) { nextBolt = now() + rnd(14000, 30000); flash = 1; strike(); setTimeout(() => Sound.thunder(), rnd(400, 1400)); }
  if (bolt) { bolt.userData.life -= dt; bolt.visible = Math.random() > .25; if (bolt.userData.life <= 0) { scene.remove(bolt); bolt = null; } }
  for (const c of clouds) { c.m.position.x += c.v * dt; if (c.m.position.x > 170) c.m.position.x = -150; c.m.material.color.copy(c.base).multiplyScalar(1 + flash * 3.5); }
  for (const f of fogs) f.m.material.map.offset.x += f.v * dt;
  { const sp = splGeo.attributes.position.array; for (let i = 0; i < 40; i++) { const j = (Math.random() * SPL_N | 0) * 3; sp[j] = camState.cur.x + rnd(-35, 35); sp[j + 2] = rnd(6, 17); } splGeo.attributes.position.needsUpdate = true; }
  flash = Math.max(0, flash - dt * 3) * (Math.random() < .15 ? .3 : 1); hemi.intensity = (dark ? .35 : .95) + flash * 3;
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
