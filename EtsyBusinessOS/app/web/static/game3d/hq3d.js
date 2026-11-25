// NEONLOOM HQ - HD-2D city: 3 towers (different layouts) joined by portals, 10 PixelLab NPCs, office phases, robots, VFX, synth SFX, 3D voxel sky events.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search);
const ASSETS = window.ASSETS || { npc: {}, pets: {} };
const META = Object.fromEntries((window.AGENTS_META || []).map(a => [a.name, a]));
const W = 24, D = 10, H = 5.4, MEZZ = 4.4, S = 12.2;
const OFF = t => new THREE.Vector3(S * t, 0, -S * t);
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], now = () => performance.now();
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const AZ = 33 * Math.PI / 180, EL = 24 * Math.PI / 180, AZ_OFF = 45 - 33;
const RT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ)), BK = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));
const C0 = new THREE.Vector3(W / 2, 0, D / 2);
const at = (u, d, y) => C0.clone().addScaledVector(RT, u).addScaledVector(BK, d).setY(y);

// ====================================================================== renderer + post (sharp: light grade, outline, subtle scanlines, glitch only on events)
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.65;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
const scene = new THREE.Scene();
let HOMEZOOM = 1, userScale = 1, panned = false;
let PIX = Q.has('pix') ? +Q.get('pix') : 1, zoom = HOMEZOOM, rt, shake = 0;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 600);
const camTarget = C0.clone().setY(H * .9);
const camDir = new THREE.Vector3(44 * Math.sin(AZ), 44 * Math.tan(EL), 44 * Math.cos(AZ)); cam.position.copy(camTarget).add(camDir); cam.lookAt(camTarget);
const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, time: { value: 0 }, glitch: { value: 0 }, dark: { value: 0 }, alarm: { value: 0 }, light: { value: 0 }, fogA: { value: .462 }, fogB: { value: .49 }, haze: { value: new THREE.Color(0x56637e) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float time, glitch, dark, alarm, light, fogA, fogB; uniform vec3 haze; varying vec2 vUv;
    float h(float n){ return fract(sin(n) * 43758.5453); }
    float dep(vec2 uv){ return texture2D(tDepth, uv).r; }
    vec3 bright(vec2 uv){ return max(texture2D(tColor, uv).rgb - .62, 0.); }
    void main(){
      vec2 uv = vUv;
      float band = floor(uv.y * 40.); if (glitch > 0. && h(band + floor(time * 20.)) < glitch * .5) uv.x += (h(band * 3.1 + time) - .5) * .05 * glitch;
      float ca = glitch * .006;
      vec3 c = vec3(texture2D(tColor, uv + vec2(ca, 0.)).r, texture2D(tColor, uv).g, texture2D(tColor, uv - vec2(ca, 0.)).b);
      vec2 px = 1. / res; float d0 = dep(uv), e = max(max(abs(dep(uv + vec2(px.x,0.)) - d0), abs(dep(uv - vec2(px.x,0.)) - d0)), max(abs(dep(uv + vec2(0.,px.y)) - d0), abs(dep(uv - vec2(0.,px.y)) - d0)));
      if (e > .0015 && d0 < .9999) c = mix(c, vec3(.03,.035,.06), .5);
      if (d0 < .9999) { float f = smoothstep(fogA, fogB, d0); c = mix(c, haze, f * .82); }
      vec3 b = vec3(0.); for (int i = 0; i < 8; i++) { float a = float(i) * .785398; vec2 o = vec2(cos(a), sin(a)) * px; b += bright(uv + o * 3.) + bright(uv + o * 7.) * .7 + bright(uv + o * 14.) * .45; }
      c += b * .11;
      float L = dot(c, vec3(.299,.587,.114)), sat = length(c - vec3(L)); c = mix(vec3(L) * vec3(.82,.93,1.16), c, clamp(sat * 2.4, .3, 1.));
      float col = floor((uv.x * res.x + uv.y * res.y * .3) / 2.), r1 = h(col), yy = fract(uv.y * 1.2 + time * (1.3 + r1) + r1 * 7.);
      c += step(.94, h(col * 1.7)) * smoothstep(0., .015, yy) * smoothstep(.08, .015, yy) * vec3(.6,.7,.85) * .22;
      c += light * vec3(.22,.25,.32);
      c *= .985 + .015 * sin(uv.y * res.y * 1.5708);
      c *= 1. - .35 * dark; c = mix(c, c * vec3(1.5,.45,.5), alarm * (.5 + .5 * sin(time * 8.)));
      vec2 v = vUv - .5; c *= 1. - dot(v, v) * .4;
      gl_FragColor = vec4(c, 1.);
    }`,
});
const postScene = new THREE.Scene(), postCam = new THREE.Camera(); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const sky = document.createElement('canvas'); sky.width = 320; sky.height = 180; const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
var bdDirty = true, light = 0;
function fit() {   // frame the whole building for any window size / aspect
  cam.lookAt(cam.position.clone().sub(camDir)); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), rt2 = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const x of [-1.2, W + 1.2]) for (const y of [-1.4, 2 * H + 2.4]) for (const z of [-1.2, D + 1.2]) { const p = new THREE.Vector3(x, y, z), a = p.dot(rt2), b = p.dot(up); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
  const asp = host.clientWidth / host.clientHeight, small = host.clientWidth < 900, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2 * (small ? 1.02 : 1.04);
  HOMEZOOM = Math.min(12.2 * asp / hw, 12.2 / hh) * .98; const yOff = small ? 0 : (y1 - y0) * .03;
  camTarget.copy(rt2.multiplyScalar((x0 + x1) / 2)).add(up.multiplyScalar((y0 + y1) / 2 + yOff));
}
function resize() {
  const w = host.clientWidth, h = host.clientHeight, lw = Math.round(w / PIX), lh = Math.round(h / PIX);
  renderer.setPixelRatio(1); renderer.setSize(lw, lh, false);
  rt?.dispose(); rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(lw, lh) });
  rt.texture.colorSpace = THREE.SRGBColorSpace; post.uniforms.tColor.value = rt.texture; post.uniforms.tDepth.value = rt.depthTexture; post.uniforms.res.value.set(lw, lh);
  fit(); zoom = HOMEZOOM * userScale; if (!panned) cam.position.copy(camTarget).add(camDir);
  sky.width = Math.round(w / 2); sky.height = Math.round(h / 2); bdDirty = true; setView();
}
let cineK = 0; const CINE_Z = .68, CINE_UP = 5;
function setView() { const a = host.clientWidth / host.clientHeight, view = 12.2 / (zoom * (1 - (1 - CINE_Z) * cineK)); cam.left = -view * a; cam.right = view * a; cam.top = view; cam.bottom = -view; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'p') { PIX = PIX === 1 ? 2 : 1; resize(); } if (k === 'escape') closePanel(); if (k === 'm') Sound.toggle(); if (k === 'e') SkyEvents.start(); if (k === 'o') Surprises.outage(); if (k === 'r') Phase.start();
  if (e.key === 'Home') { userScale = 1; panned = false; resize(); } if (['1', '2', '3'].includes(e.key)) focusTower(+e.key - 1);
});
function focusTower(t) { userScale = 2.3; panned = true; cam.position.copy(new THREE.Vector3(W * (t + .5) / 3, H, D / 2)).add(camDir); resize(); }
host.addEventListener('wheel', e => { e.preventDefault(); userScale = THREE.MathUtils.clamp(userScale * (e.deltaY > 0 ? .9 : 1.1), .8, 5); zoom = HOMEZOOM * userScale; setView(); }, { passive: false });
new ResizeObserver(() => resize()).observe(host);
let drag = null;
host.addEventListener('pointerdown', e => { Sound.unlock(); drag = { x: e.clientX, y: e.clientY, moved: false, p: cam.position.clone() }; });
addEventListener('pointerup', e => { if (drag && !drag.moved) onClick(e); drag = null; });
addEventListener('pointermove', e => {
  if (!drag || !(e.buttons & 1)) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; panned = true; }
  const s = (cam.top - cam.bottom) / host.clientHeight; cam.position.copy(drag.p).addScaledVector(RT, -dx * s).addScaledVector(new THREE.Vector3(-1, 2, -1).normalize(), dy * s * .9);
});

// ====================================================================== synth sound (no audio files)
const Sound = (() => {
  let ctx = null, master = null, on = !Q.has('mute');
  const unlock = () => { if (ctx || !on) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = .35; master.connect(ctx.destination); ambient(); };
  function ambient() {
    const g = ctx.createGain(); g.gain.value = .06; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.connect(g); g.connect(master);
    for (const fr of [55, 55.4, 82.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); }
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .07; lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    const n = noise(4), ng = ctx.createGain(), nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500; ng.gain.value = .03; n.connect(nf); nf.connect(ng); ng.connect(master); n.loop = true; n.start();
  }
  function noise(sec) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; return s; }
  function tone(freq, dur, type = 'square', vol = .12, slide = 0) { if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur); }
  function burst(dur, vol, lp = 800) { if (!ctx) return; const n = noise(dur), g = ctx.createGain(), f = ctx.createBiquadFilter(), t = ctx.currentTime; f.type = 'lowpass'; f.frequency.value = lp; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); n.connect(f); f.connect(g); g.connect(master); n.start(); }
  return {
    unlock, toggle() { on = !on; if (!on && ctx) { ctx.close(); ctx = null; } else unlock(); toast(on ? '🔊 Suara ON' : '🔇 Suara OFF'); },
    blip: () => tone(rnd(700, 1100), .06, 'square', .05), type: () => tone(rnd(1800, 2600), .015, 'square', .02),
    chime: () => { tone(880, .25, 'triangle', .1); setTimeout(() => tone(1320, .35, 'triangle', .08), 110); }, error: () => tone(140, .4, 'sawtooth', .12, .6),
    ding: () => { tone(1568, .5, 'sine', .08); setTimeout(() => tone(1175, .6, 'sine', .06), 160); }, zap: () => { tone(2400, .12, 'sawtooth', .07, .1); burst(.15, .08, 4000); },
    roar: () => { tone(90, 2.2, 'sawtooth', .2, .5); burst(2, .25, 500); }, boom: () => { tone(60, 1.2, 'sine', .35, .3); burst(1.2, .4, 300); }, step: () => { tone(45, .4, 'sine', .25, .5); burst(.3, .15, 200); },
    whoosh: () => { if (!ctx) return; const n = noise(1.4), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime; f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 1.2); g.gain.value = .15; n.connect(f); f.connect(g); g.connect(master); n.start(); },
    warp: () => { tone(260, .5, 'sine', .1, 5); tone(520, .5, 'triangle', .05, 3); },
    mecha: () => { tone(220, .5, 'square', .1, 2); setTimeout(() => tone(330, .6, 'sawtooth', .1, .5), 300); burst(.6, .12, 1500); }, ufo: () => { for (let i = 0; i < 6; i++) setTimeout(() => tone(600 + i * 120, .25, 'sine', .06, 1.5), i * 120); },
    power: () => tone(320, 1.2, 'sawtooth', .12, .15), thunder: () => { tone(40, 2.5, 'sine', .3, .5); burst(2.8, .35, 260); }, party: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .2, 'square', .06), i * 90)),
  };
})();
let flashA = 0; const flash = a => { flashA = Math.max(flashA, a); };

// ====================================================================== materials / helpers
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o });
const E = c => new THREE.MeshBasicMaterial({ color: c });
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.userData.c = c; return t; }
function tile(base, line) { return ctex(64, 64, g => { g.fillStyle = base; g.fillRect(0, 0, 64, 64); g.strokeStyle = line; for (let k = 0; k <= 64; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.moveTo(0, k); g.lineTo(64, k); g.stroke(); } g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(2, 2, 14, 14); }); }
const floorTex = tile('#3c465c', '#2f374a'); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(W / 2, D / 2);
const wallTex = ctex(32, 64, g => { g.fillStyle = '#4a5672'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#404b66'; for (let y = 6; y < 64; y += 14) g.fillRect(2, y, 28, 10); g.fillStyle = '#4e5a76'; for (let y = 6; y < 64; y += 14) g.fillRect(2, y, 28, 1); }); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(4, 1);
const rackTex = ctex(32, 96, g => { g.fillStyle = '#14132a'; g.fillRect(0, 0, 32, 96); for (let y = 4; y < 92; y += 8) { g.fillStyle = '#23224a'; g.fillRect(2, y, 28, 6); g.fillStyle = '#0a0918'; for (let x = 4; x < 22; x += 3) g.fillRect(x, y + 2, 1, 2); } });
const MT = (map, c = 0xffffff) => new THREE.MeshStandardMaterial({ map, color: c, roughness: .6, metalness: .15 });
const mats = {
  wallL: MT(wallTex), wallR: MT(wallTex, 0xe6ecff), floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: .18, metalness: .55 }), slab: M(0x141925), frame: M(0x1a202e), trim: M(0x0c0f17),
  desk: M(0x353e52), deskTop: M(0x4a5468), metal: M(0x7a8498, { metalness: .6, roughness: .35 }), dark: M(0x0f131c),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xa5d8ff, transparent: true, opacity: .22, roughness: .05, depthWrite: false }), cyan: E(0x67e8f9),
};
let CUR = scene;
function box(w, h, d, mat, x, y, z, parent = CUR, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
const plane = (w, h, t, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(x, y, z); m.rotation.y = ry; CUR.add(m); return m; };
const kitLoader = new THREE.TextureLoader(), kitCache = {};
function painted(name, x, y, z, h, flip = false) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .3 })); sp.center.set(.5, .04); sp.position.set(x, y, z); CUR.add(sp);
  const apply = tx => { sp.material.map = tx; sp.material.needsUpdate = true; const a = tx.image.width / tx.image.height; sp.scale.set((flip ? -1 : 1) * h * a, h, 1); };
  if (kitCache[name]?.image) apply(kitCache[name]); else { const t = kitCache[name] || (kitCache[name] = kitLoader.load(`/static/game/kit/obj/${name}.webp`)); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; const iv = setInterval(() => { if (t.image) { clearInterval(iv); apply(t); } }, 100); }
  return sp;
}

// ====================================================================== lights + animation registries
scene.add(new THREE.HemisphereLight(0xbccaea, 0x34405a, 3.4));
const key = new THREE.DirectionalLight(0xb9c6ff, .8); key.position.set(S + 16, 28, -S + 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -32, right: 32, top: 26, bottom: -26, far: 120 }); key.target.position.copy(C0); scene.add(key, key.target);
const anim = { pulse: [], neon: [], steam: [], screens: [], leds: [], spin: [], holo: [], portals: [], blink: [], bulbs: [] };

// ====================================================================== window city (shared animated texture)
const city = ctex(256, 128, () => {}); const traffic = [];
function drawCity(dt) {
  const g = city.userData.c.getContext('2d'), sk = g.createLinearGradient(0, 0, 0, 128); sk.addColorStop(0, '#1a2131'); sk.addColorStop(1, '#4d5a75'); g.fillStyle = sk; g.fillRect(0, 0, 256, 128);
  let s = 3; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (const [col, lit, base, win] of [['#46536d', .1, 50, 'rgba(255,207,115,.45)'], ['#242c40', .45, 18, '#ffcf73']]) for (let x = 0; x < 256;) { const bw = 10 + R() * 20 | 0, bh = base + R() * 70 | 0; g.fillStyle = col; g.fillRect(x, 128 - bh, bw, bh);
    for (let wy = 128 - bh + 4; wy < 126; wy += 5) { const on = R() < lit * 2; for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (on && R() < .7) { g.fillStyle = win; g.fillRect(wx, wy, 2, 2); } } x += bw + 1; }
  g.fillStyle = '#ff3fa4'; g.fillRect(52, 40, 3, 22); g.fillStyle = '#3ff0ff'; g.fillRect(190, 30, 3, 26);
  if (traffic.length < 6 && Math.random() < .06) traffic.push({ x: Math.random() < .5 ? -12 : 268, y: rnd(14, 80), v: rnd(15, 35) * (Math.random() < .5 ? 1 : -1) });
  for (const k of traffic) { k.x += k.v * dt; g.fillStyle = '#10141f'; g.fillRect(k.x, k.y, 8, 2); g.fillStyle = '#ff4d4d'; g.fillRect(k.v > 0 ? k.x : k.x + 7, k.y, 1, 1); g.fillStyle = '#fff3d0'; g.fillRect(k.v > 0 ? k.x + 7 : k.x, k.y, 1, 1); }
  for (let i = traffic.length - 1; i >= 0; i--) if (traffic[i].x < -20 || traffic[i].x > 280) traffic.splice(i, 1);
  g.strokeStyle = 'rgba(200,215,240,.28)'; for (let i = 0; i < 40; i++) { const x = Math.random() * 256, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 7); g.stroke(); }
  city.needsUpdate = true;
}
const cityMat = new THREE.MeshBasicMaterial({ map: city });
// painted parallax backdrop (palette B: rainy blue-grey night, magenta/cyan neon, warm windows)
const Backdrop = (() => {
  let L = null; const cars = Array.from({ length: 14 }, () => ({ x: Math.random(), y: rnd(.18, .55), v: rnd(.01, .03) * (Math.random() < .5 ? 1 : -1), s: rnd(.6, 1.4) }));
  const beams = [{ a: -.5, s: .23, x: .2 }, { a: .45, s: -.17, x: .66 }, { a: .1, s: .11, x: .9 }]; let bolt = null, nextBolt = now() + rnd(15000, 30000);
  const rng = seed => { let v = seed; return () => (v = (v * 9301 + 49297) % 233280) / 233280; };
  const layer = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
  function build() {
    const w = sky.width, h = sky.height, W2 = w * 2, u = Math.max(1, Math.round(h / 270));
    const far = layer(W2, h, g => { const R = rng(11); for (let x = 0; x < W2;) { const bw = (10 + R() * 26) * u | 0, bh = h * (.3 + R() * .38) | 0; g.fillStyle = '#4a5772'; g.fillRect(x, h - bh, bw, bh);
      if (R() < .35) g.fillRect(x + bw / 2 | 0, h - bh - 14 * u, u, 14 * u); g.fillStyle = 'rgba(255,214,140,.28)'; for (let y = h - bh + 5 * u; y < h; y += 6 * u) if (R() < .4) for (let xx = x + 2 * u; xx < x + bw - 2 * u; xx += 3 * u) if (R() < .5) g.fillRect(xx, y, u, u); x += bw + (R() * 4 * u | 0); } });
    const mid = layer(W2, h, g => { const R = rng(23), signs = []; for (let x = 0; x < W2;) { const bw = (16 + R() * 34) * u | 0, bh = h * (.2 + R() * .32) | 0, top = h - bh; g.fillStyle = '#273047'; g.fillRect(x, top, bw, bh); g.fillStyle = '#36415c'; g.fillRect(x, top, bw, u);
        if (R() < .45) { g.fillStyle = '#273047'; g.fillRect(x + 3 * u, top - 6 * u, 7 * u, 6 * u); } if (R() < .3) { g.fillStyle = '#273047'; g.fillRect(x + bw - 6 * u, top - 18 * u, u, 18 * u); g.fillStyle = '#ff3b3b'; g.fillRect(x + bw - 6 * u, top - 18 * u, u, u); }
        for (let y = top + 5 * u; y < h - 2 * u; y += 5 * u) { const on = R() < .5; for (let xx = x + 3 * u; xx < x + bw - 3 * u; xx += 4 * u) if (on && R() < .65) { g.fillStyle = R() < .9 ? '#ffcf73' : '#a9ecff'; g.fillRect(xx, y, 2 * u, 2 * u); } }
        if (R() < .3) signs.push([x + bw - 7 * u, top + 6 * u + (R() * 20 * u | 0), R() < .55 ? '#ff3fa4' : '#3ff0ff', 3 + (R() * 3 | 0)]); x += bw + (R() * 3 * u | 0); }
      for (const [sx, sy, col, n] of signs) { g.fillStyle = '#0b0e16'; g.fillRect(sx - u, sy - u, 6 * u, n * 6 * u + 2 * u); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 4 * u; for (let i = 0; i < n; i++) { const gy = sy + i * 6 * u; g.fillRect(sx, gy, 4 * u, u); g.fillRect(sx + (i % 2 ? 0 : 3 * u), gy, u, 4 * u); g.fillRect(sx, gy + 3 * u, 4 * u, u); } g.shadowBlur = 0; } });
    const near = layer(W2, h, g => { const R = rng(41); g.fillStyle = '#0c1018'; for (let x = 0; x < W2;) { const bw = (24 + R() * 60) * u | 0, bh = h * (.06 + R() * .16) | 0; g.fillRect(x, h - bh, bw, bh); if (R() < .5) g.fillRect(x + bw * .3 | 0, h - bh - 9 * u, 10 * u, 9 * u); if (R() < .35) g.fillRect(x + bw * .7 | 0, h - bh - 22 * u, u, 22 * u);
        if (R() < .4) { g.fillStyle = '#ffcf73'; g.fillRect(x + 4 * u, h - bh + 4 * u, 2 * u, 2 * u); g.fillStyle = '#0c1018'; } x += bw; }
      g.strokeStyle = '#0c1018'; g.lineWidth = u; for (let x = 0; x < W2; x += (60 + R() * 70) * u) { g.beginPath(); g.moveTo(x, h * .74); g.quadraticCurveTo(x + 45 * u, h * .82, x + 95 * u, h * .72); g.stroke(); } });
    L = { far, mid, near, W2, u }; bdDirty = false;
  }
  const homeCam = () => camTarget.clone().add(camDir);
  function draw(t, dt) {
    if (bdDirty || !L) build(); const g = sky.getContext('2d'), w = sky.width, h = sky.height, u = L.u;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#121826'); gr.addColorStop(.5, '#2a344a'); gr.addColorStop(1, '#5a6782'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(214,224,245,.08)'; g.beginPath(); g.arc(w * .8, h * .2, h * .14, 0, 7); g.fill(); g.fillStyle = 'rgba(214,224,245,.9)'; g.beginPath(); g.arc(w * .8, h * .2, h * .05, 0, 7); g.fill();
    for (let i = 0; i < 6; i++) { const y = h * (.1 + i * .06), x = ((t * 4 * u * (i + 1)) % (w * 1.6)) - w * .3; g.fillStyle = `rgba(30,38,56,${.35 + i * .05})`; g.fillRect(x, y, w * .55, 3 * u); g.fillRect(x + w * .1, y + 3 * u, w * .3, 2 * u); }
    for (const b of beams) { const a = b.a + Math.sin(t * b.s) * .5, x = w * b.x, y = h; g.fillStyle = 'rgba(180,205,255,.06)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a - .06) * h * 1.4, y - Math.cos(a - .06) * h * 1.4); g.lineTo(x + Math.sin(a + .06) * h * 1.4, y - Math.cos(a + .06) * h * 1.4); g.fill(); }
    if (now() > nextBolt) { nextBolt = now() + rnd(18000, 40000); light = 1; const x0 = rnd(.1, .9) * w; bolt = { pts: [[x0, 0]], life: .25 }; let x = x0; for (let y = 0; y < h * .55; y += 8 * u) { x += rnd(-6, 6) * u; bolt.pts.push([x, y]); } setTimeout(() => Sound.thunder(), rnd(400, 1400)); }
    const px = (cam.position.clone().sub(homeCam()).dot(RT)) * (w / (cam.right - cam.left));
    const blit = (c, f, y = 0) => { const ox = ((px * f) % L.W2 + L.W2) % L.W2; g.drawImage(c, -ox, y); g.drawImage(c, L.W2 - ox, y); };
    const haze = (y0, a) => { const hg = g.createLinearGradient(0, h * y0, 0, h); hg.addColorStop(0, 'rgba(90,103,130,0)'); hg.addColorStop(1, `rgba(90,103,130,${a})`); g.fillStyle = hg; g.fillRect(0, h * y0, w, h * (1 - y0)); };
    if (bolt) { bolt.life -= dt; g.strokeStyle = `rgba(230,240,255,${Math.max(0, bolt.life * 4)})`; g.lineWidth = 2 * u; g.beginPath(); bolt.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); if (bolt.life <= 0) bolt = null; }
    blit(L.far, .12, -h * .1); haze(.35, .55);
    for (const c of cars) { c.x = (c.x + c.v * dt + 1) % 1; const x = c.x * w, y = c.y * h, s = c.s * u; g.fillStyle = '#1b2232'; g.fillRect(x, y, 9 * s, 2 * s); g.fillRect(x + 2 * s, y - s, 4 * s, s); g.fillStyle = '#ff4d5e'; g.fillRect(c.v > 0 ? x : x + 8 * s, y, s, s); g.fillStyle = '#fff1c9'; g.fillRect(c.v > 0 ? x + 8 * s : x, y, s, s); }
    blit(L.mid, .3);
    // giant glitching billboard
    const bw = 70 * u, bh = 38 * u, bx = ((w * .46 - px * .3) % (w * 2) + w * 2) % (w * 2) - w * .4, by = h * .42;
    g.fillStyle = '#0b0e16'; g.fillRect(bx - 3 * u, by - 3 * u, bw + 6 * u, bh + 6 * u); g.fillStyle = '#121a2a'; g.fillRect(bx, by, bw, bh);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${120 + Math.random() * 100 | 0},${120 + Math.random() * 100 | 0},160,.25)`; g.fillRect(bx + Math.random() * bw, by + Math.random() * bh, u, u); }
    const gl = Math.random() < .08 ? (Math.random() - .5) * 8 * u : 0; g.font = `bold ${10 * u}px monospace`; g.textAlign = 'center'; g.fillStyle = '#3ff0ff'; g.shadowColor = '#3ff0ff'; g.shadowBlur = 6 * u;
    g.fillText(['NEONLOOM', 'HOUSE PLANS', 'DREAM BIG', '24/7 OPEN'][Math.floor(t / 4) % 4], bx + bw / 2 + gl, by + bh * .48); g.font = `${5 * u}px monospace`; g.fillStyle = '#ff3fa4'; g.shadowColor = '#ff3fa4'; g.fillText('* * *  DIGITAL DOWNLOAD  * * *', bx + bw / 2 - gl, by + bh * .8); g.shadowBlur = 0; g.textAlign = 'left';
    if (gl) { g.fillStyle = 'rgba(63,240,255,.35)'; g.fillRect(bx, by + Math.random() * bh, bw, 2 * u); }
    const ox = bx + bw + 10 * u, on = Math.sin(t * 3) > -.6 || Math.random() < .5; g.fillStyle = '#0b0e16'; g.fillRect(ox, by, 12 * u, 34 * u); g.fillStyle = on ? '#ff3fa4' : '#4a1a33'; g.shadowColor = '#ff3fa4'; g.shadowBlur = on ? 6 * u : 0; g.font = `bold ${7 * u}px monospace`; 'BAR'.split('').forEach((ch, i) => g.fillText(ch, ox + 3 * u, by + (9 + i * 9) * u)); g.shadowBlur = 0;
    haze(.62, .35); blit(L.near, .6);
    skyTex.needsUpdate = true;
  }
  return { draw };
})();

// ====================================================================== prop library
function monitor(p, x, y, z, w, owner) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); box(.05, .58, w, mats.dark, 0, .14, 0, g); box(.14, .14, .1, mats.metal, .06, 0, 0, g);
  const t = ctex(32, 20, c => { c.fillStyle = '#1d5a8a'; c.fillRect(0, 0, 32, 20); }); const s = new THREE.Mesh(new THREE.PlaneGeometry(w * .92, .52), new THREE.MeshBasicMaterial({ map: t })); s.rotation.y = Math.PI / 2; s.position.set(.03, .44, 0); g.add(s); anim.screens.push({ t, owner }); }
function deskUnit(x, y, z, ry, owner, mons = 3, len = 2.6) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; CUR.add(g);
  box(1, .07, len, mats.deskTop, 0, .72, 0, g); box(.95, .66, .5, mats.desk, -.02, 0, len / 2 - .3, g); for (const a of [-.42, .42]) box(.06, .72, .06, mats.metal, a, 0, -len / 2 + .08, g);
  for (let i = 0; i < mons; i++) monitor(g, -.28, .79, (i - (mons - 1) / 2) * .9 - .1, .88, owner);
  box(.2, .03, .8, mats.dark, .15, .79, -.1, g, false); box(.12, .03, .1, mats.dark, .17, .79, .5, g, false); box(.11, .13, .11, M(pick([0xf472b6, 0xe5e7eb, 0xfacc15])), .3, .79, -len / 2 + .3, g);
  if (Math.random() < .7) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.12, .08, .1, 8), M(0xf5f5f4)); b.position.set(.25, .85, .75); g.add(b); }
  if (Math.random() < .7) box(.07, .16, .07, M(0xef4444), .1, .79, -.9, g); box(.35, .14, .3, M(0xe5e7eb), .15, .79, len / 2 - .35, g);
  box(.32, .55, .45, mats.dark, -.2, 0, -len / 2 + .5, g); box(.02, .45, .02, E(pick([0x67e8f9, 0xf472b6, 0xc084fc])), -.03, .05, -len / 2 + .5, g, false);
}
function chair(x, y, z, ry, c) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; CUR.add(g); const cm = M(c);
  box(.55, .1, .55, cm, 0, .45, 0, g); box(.12, .95, .55, cm, .25, .5, 0, g); box(.12, .22, .32, cm, .25, 1.45, 0, g); box(.4, .05, .06, mats.dark, 0, .7, .3, g); box(.4, .05, .06, mats.dark, 0, .7, -.3, g); box(.06, .4, .06, mats.metal, 0, .05, 0, g); }
function rack(x, z, y = 0) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); box(.85, 2.6, .85, mats.dark, 0, 0, 0, g); const fp = new THREE.Mesh(new THREE.PlaneGeometry(.8, 2.5), new THREE.MeshBasicMaterial({ map: rackTex })); fp.position.set(0, 1.3, .43); g.add(fp);
  for (let r = 0; r < 12; r++) for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, .02), E(pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6, 0xfacc15]))); l.position.set(-.3 + k * .08, .24 + r * .2, .44); g.add(l); anim.leds.push(l); } }
function wallScreen(y, z, w, h, side = 'L', x = 0) { const t = ctex(48, 28, g => { g.fillStyle = '#071226'; g.fillRect(0, 0, 48, 28); });
  if (side === 'L') { plane(w, h, t, .06, y, z, Math.PI / 2); box(.05, h + .1, w + .1, mats.dark, .02, y - h / 2 - .05, z, CUR, false); } else { plane(w, h, t, x, y, .06, 0); box(w + .1, h + .1, .05, mats.dark, x, y - h / 2 - .05, .02, CUR, false); }
  anim.screens.push({ t, wall: true }); }
function poster(y, z, w, h) { const cols = ['#ff3fa4', '#3ff0ff', '#ffb347', '#8a96ff']; const t = ctex(12, 16, g => { g.fillStyle = '#121826'; g.fillRect(0, 0, 12, 16); g.fillStyle = pick(cols); g.fillRect(2, 2, 8, 8); g.fillStyle = pick(cols); g.fillRect(2, 11, 8, 2); }); plane(w, h, t, .07, y, z, Math.PI / 2); }
function neonSign(text, y, z, col, side = 'L', x = 0) { const t = ctex(64, 16, g => { g.clearRect(0, 0, 64, 16); g.font = 'bold 11px monospace'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 4; g.fillText(text, 2, 12); });
  const m = side === 'L' ? plane(2.4, .6, t, .08, y, z, Math.PI / 2) : plane(2.4, .6, t, x, y, .08, 0); anim.neon.push({ m, sign: true }); }
function holo(x, y, z, big = 1) { box(1.4 * big, .5, 1.4 * big, mats.dark, x, y, z); const r = new THREE.Mesh(new THREE.TorusGeometry(.5 * big, .03, 6, 24), mats.cyan); r.rotation.x = Math.PI / 2; r.position.set(x, y + .8, z); CUR.add(r); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.38 * big, 1), new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true })); s.position.set(x, y + 1.2 * big, z); CUR.add(s); anim.spin.push(s, r); anim.holo.push(s); }
function hangingPlant(x, y, z) { for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.07, .6, 4), M(0x22c55e)); l.position.set(x + rnd(-.15, .15), y - rnd(0, .4), z + rnd(-.15, .15)); l.rotation.x = Math.PI + rnd(-.4, .4); CUR.add(l); } box(.25, .2, .25, M(0x78350f), x, y, z); }
function cableLine(pts, y) { const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y + .03, z))); CUR.add(new THREE.Mesh(new THREE.TubeGeometry(c, 30, .025, 4), M(pick([0x111827, 0x1e3a8a, 0x4b5563])))); }
function steam(x, y, z) { const mat = new THREE.SpriteMaterial({ color: 0xe9e7ff, transparent: true, opacity: .5, depthWrite: false }); for (let k = 0; k < 3; k++) { const sp = new THREE.Sprite(mat.clone()); sp.scale.set(.12, .12, 1); CUR.add(sp); anim.steam.push({ sp, x, y, z, t: k * .8 }); } }
const portalTex = ctex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.3, '#a5f3fc'); gr.addColorStop(.7, '#7c3aed'); gr.addColorStop(1, 'rgba(76,29,149,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; for (let a = 0; a < 6; a++) { g.beginPath(); for (let r = 2; r < 30; r += 1) { const an = a * 1.047 + r * .18; g.lineTo(32 + Math.cos(an) * r, 32 + Math.sin(an) * r); } g.stroke(); } });
function addPortal(T, x, z, col) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 4; CUR.add(g); box(1.9, .12, .9, mats.dark, 0, 0, 0, g, false); box(1.7, .04, .7, E(col), 0, .12, 0, g, false);
  for (const sx of [-1.05, 1.05]) box(.22, 2.4, .3, mats.trim, sx, 0, 0, g, false);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .09, 8, 32), E(col)); ring.position.y = 1.25; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.88, 32), new THREE.MeshBasicMaterial({ map: portalTex, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false })); disc.position.y = 1.25; g.add(disc);
  const l = new THREE.PointLight(col, 6, 5); l.position.set(0, 1.3, .6); g.add(l);
  T.portal = { x, z, ring, disc, l, fx: 0 }; anim.portals.push(T.portal);
}

// ====================================================================== towers (each a different layout)
const TOWERS = [];
const UP = { L: (x, z) => z <= MEZZ - .25 || x <= MEZZ - .25, back: (x, z) => z <= MEZZ - .25, left: (x, z) => x <= MEZZ - .25 };
function buildShell(t, kind) {
  const T = .35;
  box(W + 2 * T, .6, D + 2 * T, mats.frame, W / 2 - T / 2, -.6, D / 2 - T / 2); box(W, .06, D, mats.floor, W / 2, 0, D / 2, CUR, false);
  const slabs = { L: [[W, MEZZ, W / 2, MEZZ / 2], [MEZZ, D - MEZZ, MEZZ / 2, MEZZ + (D - MEZZ) / 2]], back: [[W, MEZZ, W / 2, MEZZ / 2]], left: [[MEZZ, D, MEZZ / 2, D / 2]] }[kind];
  for (const [w, d, x, z] of slabs) { box(w, .45, d, mats.slab, x, H - .45, z); box(w, .06, d, mats.floor, x, H, z, CUR, false); }
  const rails = { L: [[W - MEZZ, .07, MEZZ + (W - MEZZ) / 2, MEZZ], [.07, D - MEZZ, MEZZ, MEZZ + (D - MEZZ) / 2], [MEZZ, .07, MEZZ / 2, D], [.07, MEZZ, W, MEZZ / 2]],
    back: [[W, .07, W / 2, MEZZ], [.07, MEZZ, W, MEZZ / 2]], left: [[.07, D, MEZZ, D / 2], [MEZZ, .07, MEZZ / 2, D]] }[kind];
  for (const [w, d, x, z] of rails) { box(w, 1, d, mats.glass, x, H, z, CUR, false); box(w + .03, .07, d + .03, mats.metal, x, H + 1, z, CUR, false); }
  const glowEdge = E([0x3ff0ff, 0xff3fa4, 0xffb347][t]); anim.neon.push({ mat: glowEdge, base: glowEdge.color.clone() });
  for (const [w, d, x, z] of rails) box(w, .06, d, glowEdge, x, H - .5, z, CUR, false);
  for (const alongX of [true, false]) {
    const len = alongX ? W : D, mat = alongX ? mats.wallR : mats.wallL, B = (w, h, x, y) => alongX ? box(w, h, T, mat, x, y, -T / 2) : box(T, h, w, mat, -T / 2, y, x);
    for (let lv = 0; lv < 2; lv++) { const y0 = lv * H, top = y0 + H;
      const cp = new THREE.Mesh(new THREE.PlaneGeometry(len, H), cityMat); if (alongX) cp.position.set(len / 2, y0 + H / 2, -.25); else { cp.rotation.y = Math.PI / 2; cp.position.set(-.25, y0 + H / 2, len / 2); } CUR.add(cp);
      if (!alongX) { B(len, 1.4, len / 2, y0); B(len, 1.6, len / 2, top - 1.6); for (let k = 0; k <= len; k += 3.3) B(.4, H - 3, Math.min(len - .2, k + .2), y0 + 1.4); }
      else { B(len, .5, len / 2, y0); B(len, .5, len / 2, top - .5); for (let k = 0; k <= len; k += 2) B(.14, H - 1, Math.min(len - .07, k + .07), y0 + .5); B(len, .1, len / 2, y0 + H * .5); }
      const nm = new THREE.MeshBasicMaterial({ color: [[0x3ff0ff, 0xff3fa4], [0xff3fa4, 0x3ff0ff], [0xffb347, 0xff3fa4]][t][alongX ? 0 : 1] }); anim.neon.push({ mat: nm, base: nm.color.clone() });
      if (alongX) box(len - .4, .1, .1, nm, len / 2, top - .7, .08, CUR, false); else box(.1, .1, len - .4, nm, .08, top - .7, len / 2, CUR, false);
    }
  }
  box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, W + T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, D + T / 2);
  box(W + 2 * T, .5, T, mats.frame, W / 2, 2 * H, -T / 2); box(T, .5, D + 2 * T, mats.frame, -T / 2, 2 * H, D / 2);
  // roof sign
  const name = ['NEON//OPS', 'NEON//MAKE', 'NEON//GROW'][t], col = ['#3ff0ff', '#ff3fa4', '#ffb347'][t];
  const rs = ctex(96, 20, g => { g.font = 'bold 15px monospace'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6; g.fillText(name, 4, 15); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rs, transparent: true })); sp.scale.set(6, 1.25, 1); sp.position.set(2, 2 * H + 1.4, 2); CUR.add(sp); anim.neon.push({ m: sp, sign: true });
  const LIGHTS = []; for (let x = 3; x < W; x += 6) { const c = (x / 6 | 0) % 2 ? 0xff3fa4 : 0x3ff0ff; LIGHTS.push([x, H - .6, 2, c, 30], [x, 2 * H - .6, 2, c ^ 0, 30], [x, H - 1, 7.4, x > 6 ? 0xffb066 : 0xff3fa4, 26]); } LIGHTS.push([2.2, 2 * H - .8, 7, 0x3ff0ff, 26]);
  for (const [x, y, z, c, i] of LIGHTS) {
    const l = new THREE.PointLight(new THREE.Color(c).lerp(new THREE.Color(0xc8d2ec), .45), i * .9, 12, 1.4); l.position.set(x, y, z); CUR.add(l); anim.pulse.push({ l, base: l.intensity, ph: Math.random() * 6 });
  }
}
function newTower(t, kind) {
  const g = new THREE.Group(); g.position.copy(OFF(t)); scene.add(g); CUR = g;
  const T = { t, g, kind, up: UP[kind], blocked: { l: [], u: [] }, seats: {}, spots: {}, rooms: [], view: { x: W - 1.6, z: D - 2 } };
  T.block = (lv, a, b, c, d) => T.blocked[lv].push([a, b, c, d]);
  T.desk = (lv, kind2, agent, mons, pos) => {
    const y = lv === 'u' ? H : 0, cc = pick([0x1e3a8a, 0x14532d, 0x3730a3, 0x78350f, 0x7c2d12, 0x4c1d95]);
    if (kind2 === 'L') { const z = pos ?? (lv === 'u' ? 3 : 7.4); deskUnit(.6, y, z, 0, agent, mons || 3); chair(1.65, y, z, 0, cc); T.block(lv, 0, z - 1.4, 1.1, z + 1.4); if (agent) T.seats[agent] = { lv, x: 1.55, z, face: 'north-west' }; }
    if (kind2 === 'R') { const x = pos ?? (lv === 'u' ? 6.1 : 8.1); deskUnit(x, y, .6, -Math.PI / 2, agent, mons || 3); chair(x, y, 1.7, -Math.PI / 2, cc); T.block(lv, x - 1.4, 0, x + 1.4, 1.1); if (agent) T.seats[agent] = { lv, x, z: 1.6, face: 'north-east' }; }
    if (kind2 === 'R2') { const x = pos ?? (lv === 'u' ? 8.9 : 5.4); deskUnit(x, y, .6, -Math.PI / 2, agent, 2, 2.2); chair(x, y, 1.7, -Math.PI / 2, cc); T.block(lv, x - 1.2, 0, x + 1.2, 1.1); }
  };
  buildShell(t, kind);
  return T;
}
function addLift(T, x = 11.1, z = 2.4, ddx = -1.35) {
  for (const [dx, dz] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) box(.08, 2 * H, .08, mats.trim, x + dx, 0, z + dz, CUR, false);
  box(1.6, 2 * H, 1.6, mats.glass, x, 0, z, CUR, false);
  const cabin = new THREE.Group(); CUR.add(cabin); cabin.position.set(x, 0, z); box(1.5, .1, 1.5, mats.metal, 0, 0, 0, cabin); box(1.5, .05, 1.5, mats.cyan, 0, 2.4, 0, cabin, false);
  const cl = new THREE.PointLight(0x67e8f9, 8, 4); cl.position.set(0, 2, 0); cabin.add(cl); cabin.userData.busy = false;
  T.block('l', x - .9, z - .9, x + .9, z + .9); T.block('u', x - .9, z - .9, x + .9, z + .9); T.lift = { x, z, door: { x: x + ddx, z }, cabin };
}

// ---------------------------------------------------------------- ONE BUILDING: upper = Command Deck wing + 5-room studio balcony, lower = 4 back rooms + lounge & pantry
{ const T = newTower(0, 'L'), U = H; TOWERS.push(T);
  const glassWall = (lv, x, z1, hgt, col) => { const y = lv === 'u' ? U : 0; box(.06, hgt, z1, mats.glass, x, y, z1 / 2, CUR, false); box(.08, .05, z1, E(col), x, y + hgt, z1 / 2, CUR, false); box(.08, hgt, .08, mats.trim, x, y, z1, CUR, false); T.block(lv, x - .12, 0, x + .12, z1 + .1); };
  // ===== UPPER: Command Deck wing (x 0-4.4)
  wallScreen(U + 3.4, 1.6, 1.6, .9); wallScreen(U + 3.4, 3.5, 1.6, .9); for (let k = 0; k < 6; k++) poster(U + 1.9 + (k % 2) * .8, 5.2 + k * .5, .42, .55);
  neonSign('KAI//OPS', U + 2.4, 1.6, '#3ff0ff'); hangingPlant(.4, U + 3.9, 4.6); painted('vending', .75, U, 9.3, 2.3); T.block('u', 0, 8.5, 1.1, 9.9);
  holo(2.2, U, 6.6); T.block('u', 1.4, 5.8, 3, 7.4); T.desk('u', 'L', 'KAI-07'); painted('plant_big', .45, U, .5, 1.3); T.block('u', .1, .1, .8, .9);
  T.meet = { pts: [[3.6, 6.6], [3.5, 5.1], [2.2, 5.05], [1, 5.2], [1, 7.9], [3.6, 7.8], [2.2, 7.85]], focus: [2.2, 6.6] };
  // ===== UPPER: studio balcony rooms
  const rooms = [['RESEARCH LAB', 'RAZE-11', 6.4, '#9fffcf', 3], ['WRITERS STUDIO', 'JUNO-X9', 10.4, '#c9a6ff', 2], ['QA BAY', 'VOLT-3', 14.4, '#ffb347', 3], ['GROWTH STUDIO', 'HEX-04', 18.4, '#ff3fa4', 2], ['DATA ROOM', 'ORIN-88', 22.2, '#3ff0ff', 3]];
  for (const [nm, ag, x, c, mons] of rooms) { T.desk('u', 'R', ag, mons, x); wallScreen(U + 3.3, 0, 1.3, .75, 'R', x - .9); wallScreen(U + 3.3, 0, 1.1, .75, 'R', x + .9); neonSign(nm.split(' ')[0], U + 4.35, 0, c, 'R', x); }
  for (const x of [8.4, 12.4, 16.4, 20.4]) glassWall('u', x, 1.3, 2.4, 0x3ff0ff);
  painted('bookshelf', 8.95, U, 3.9, 1.9); T.block('u', 8.5, 3.5, 9.4, 4.4); painted('scanner', 12.95, U, 3.85, 1.6); T.block('u', 12.5, 3.3, 13.4, 4.4);
  painted('ringlight', 19.6, U, 3.75, 1.8); painted('camera', 17.2, U, 3.85, 1.4); T.block('u', 19.2, 3.3, 20, 4.4); T.block('u', 16.9, 3.4, 17.6, 4.4);
  painted('papers', 4.9, U, 3.8, .6); rack(23.5, 3.7, U); T.block('u', 23, 3.2, W, 4.4); painted('bean_purple', 11.4, U, 3.9, .9); T.block('u', 10.9, 3.5, 11.9, 4.4);
  // ===== LOWER back rooms: SERVER | ARCHIVE | SHOP | FINANCE
  for (let k = 0; k < 4; k++) rack(.5, .6 + k * .95); rack(1.5, .5); rack(2.45, .5); rack(3.4, .5); T.block('l', 0, .1, 1, 4.1); T.block('l', 1, 0, 3.9, 1);
  box(.65, .32, .32, M(0xb91c1c), .6, 0, 5.2); T.block('l', .2, 4.9, 1.1, 5.5); cableLine([[1, 1.6], [1.6, 2.6], [2.2, 3.4], [2.4, 4.6], [3.2, 5.4]], 0); cableLine([[2.2, 1.1], [2.6, 2], [3.6, 2.4], [5, 2.2]], 0);
  wallScreen(3.6, 7.2, 1.2, .7); neonSign('SERVER', 3.3, 3.6, '#ff3fa4'); T.desk('l', 'L', 'ZERO-1', 2); painted('trash', 3.1, 0, 5.8, .55); painted('boxes', 4.6, 0, 3.6, .9); T.block('l', 4.2, 3.2, 5, 4);
  for (const x of [6, 11, 17]) glassWall('l', x, 3.2, 2.6, 0xff3fa4);
  T.desk('l', 'R', 'SABLE-6', 3, 8.5); painted('cabinet', 6.7, 0, .6, 1.7); painted('cabinet', 10.4, 0, .6, 1.7); T.block('l', 6.2, 0, 7.1, .9); T.block('l', 9.9, 0, 10.8, .9); painted('boxes', 7, 0, 3.2, .9); T.block('l', 6.6, 2.8, 7.5, 3.6);
  T.desk('l', 'R', 'NYX-21', 2, 13.6); painted('counter', 16, 0, 1.6, 1.5); T.block('l', 15.1, .6, 16.9, 2.6); painted('packing', 12.1, 0, 3.7, 1.4); T.block('l', 11.2, 3.1, 13, 4.3); painted('boxes', 16.2, 0, 3.7, 1); T.block('l', 15.6, 3.2, 16.8, 4.2);
  T.desk('l', 'R', 'KADE-12', 3, 19.6); painted('vault_door', 23.1, 0, .45, 2.2); T.block('l', 22.3, 0, W, .9); painted('safe', 23.3, 0, 3.6, 1.3); painted('coins', 22.3, 0, 3.9, .7); T.block('l', 21.8, 3, W, 4.3);
  for (const [nm, x, c] of [['ARCHIVE', 8.5, '#ffb347'], ['SHOP', 14, '#ff3fa4'], ['VAULT', 20.5, '#ffb347']]) neonSign(nm, 4.2, 0, c, 'R', x);
  for (let k = 0; k < 3; k++) wallScreen(3.3, 0, 1, .6, 'R', 12 + k * 1.5);
  // ===== LOWER front: LOUNGE & PANTRY
  painted('vending', 17.6, 0, 5.6, 2.3); painted('coffee', 18.8, 0, 5.6, 1.2); painted('water', 19.7, 0, 5.6, 1.4); painted('fridge', 20.8, 0, 5.7, 2.1); painted('snack_shelf', 22.2, 0, 5.6, 1.4); T.block('l', 17, 5.1, 22.9, 6.2); steam(18.8, 1.3, 5.6);
  painted('arcade_blue', 7, 0, 5.8, 2.1); painted('arcade_pink', 8.3, 0, 5.8, 2.1); T.block('l', 6.4, 5.3, 9, 6.3);
  holo(8.6, 0, 8, 1.1); T.block('l', 7.8, 7.2, 9.4, 8.8); T.board = { pts: [[7.2, 8], [8.6, 6.9], [10, 8], [8.6, 9.3], [7.2, 9.2]], focus: [8.6, 8] };
  painted('couch', 11.6, 0, 8.7, 1.4); painted('coffee_table', 11.7, 0, 7.2, .8); T.block('l', 10.4, 8.1, 12.9, 9.5); T.block('l', 11.1, 6.8, 12.3, 7.6);
  painted('pingpong', 15, 0, 8.2, 1.6); T.block('l', 13.7, 7.3, 16.3, 9.1); painted('bean_teal', 19, 0, 8.7, 1); painted('bean_blue', 20.4, 0, 9.2, 1); painted('bean_purple', 21.8, 0, 8.5, 1); T.block('l', 18.4, 8, 22.4, 9.8);
  painted('plant_big', 23.4, 0, 9.4, 1.4); T.block('l', 23, 9, W, 9.9); painted('lamp', 9.8, 0, 9.5, 1.9); painted('plant_big', 6.4, 0, 9.4, 1.3); T.block('l', 6, 9, 6.8, 9.8);
  neonSign('LOUNGE', 3.6, 6.8, '#c9a6ff'); hangingPlant(.4, 3.9, 6);
  const fan = new THREE.Group(); fan.position.set(14, H - .5, 7.5); CUR.add(fan); for (let k = 0; k < 4; k++) { const b = box(1.4, .03, .2, mats.dark, 0, 0, 0, fan, false); b.geometry.translate(.7, 0, 0); b.rotation.y = k * Math.PI / 2; } anim.spin.push(fan); fan.userData.fast = true;
  T.spots = { coffee: { lv: 'l', x: 18.8, z: 6.7, kind: 'snack' }, vend: { lv: 'l', x: 17.6, z: 6.7, kind: 'snack' }, arcade: { lv: 'l', x: 7, z: 6.8, kind: 'game' }, arcade2: { lv: 'l', x: 8.3, z: 6.8, kind: 'game' },
    couch: { lv: 'l', x: 10, z: 9.2, kind: 'rest' }, bean: { lv: 'l', x: 20.4, z: 7.5, kind: 'rest' }, ping: { lv: 'l', x: 15, z: 6.8, kind: 'game' }, dance: { lv: 'l', x: 17, z: 9.3, kind: 'dance' } };
  T.view = { x: 23, z: 7 };
  addLift(T, 3.4, 9, -1.35);
  T.rooms = [{ name: 'COMMAND DECK', lv: 'u', r: [0, 0, 4.4, 10], agent: 'KAI-07', url: '/dashboard', c: '#3ff0ff' }, { name: 'RESEARCH LAB', lv: 'u', r: [4.4, 0, 8.4, 4.4], agent: 'RAZE-11', url: '/research', c: '#9fffcf' },
    { name: 'WRITERS STUDIO', lv: 'u', r: [8.4, 0, 12.4, 4.4], agent: 'JUNO-X9', url: '/listings', c: '#c9a6ff' }, { name: 'QA BAY', lv: 'u', r: [12.4, 0, 16.4, 4.4], agent: 'VOLT-3', url: '/approvals', c: '#ffb347' },
    { name: 'GROWTH STUDIO', lv: 'u', r: [16.4, 0, 20.4, 4.4], agent: 'HEX-04', url: '/social', c: '#ff3fa4' }, { name: 'DATA ROOM', lv: 'u', r: [20.4, 0, 24, 4.4], agent: 'ORIN-88', url: '/analytics', c: '#3ff0ff' },
    { name: 'SERVER ROOM', lv: 'l', r: [0, 0, 6, 10], agent: 'ZERO-1', url: '/settings', c: '#ff3fa4' }, { name: 'ARCHIVE', lv: 'l', r: [6, 0, 11, 5], agent: 'SABLE-6', url: '/assets', c: '#ffb347' },
    { name: 'SHOP FLOOR', lv: 'l', r: [11, 0, 17, 5], agent: 'NYX-21', url: '/approvals', c: '#ff3fa4' }, { name: 'FINANCE VAULT', lv: 'l', r: [17, 0, 24, 5], agent: 'KADE-12', url: '/accounting', c: '#ffb347' },
    { name: 'LOUNGE · PANTRY', lv: 'l', r: [6, 5, 24, 10], agent: null, url: null, c: '#c9a6ff' }];
}
CUR = scene;

// ====================================================================== tower exteriors (roof gear, hanging signs, string lights, cables, vines, base pipes)
const NEON = [0x3ff0ff, 0xff3fa4, 0xffb347];
function kanjiTex(col) { return ctex(16, 72, g => { g.fillStyle = '#0b0e16'; g.fillRect(0, 0, 16, 72); g.strokeStyle = col; g.strokeRect(1.5, 1.5, 13, 69); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 3;
  for (let i = 0; i < 5; i++) { const y = 5 + i * 13; g.fillRect(4, y, 8, 1); g.fillRect(7, y, 1, 10); g.fillRect(4, y + 5, 8, 1); if (i % 2) g.fillRect(4, y + 2, 1, 6); else g.fillRect(11, y + 3, 1, 6); g.fillRect(5, y + 9, 6, 1); } }); }
function catenary(a, b, sag, n = 24) { const pts = []; for (let i = 0; i <= n; i++) { const k = i / n; pts.push(a.clone().lerp(b, k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * sag, 0))); } return pts; }
function exterior(T) {
  CUR = T.g; const top = 2 * H + .5, col = NEON[T.t], cs = '#' + col.toString(16).padStart(6, '0');
  const tank = (x, z) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, 1.7, 12), M(0x3a4358, { metalness: .5, roughness: .4 })); c.position.set(x, top + 1.4, z); CUR.add(c); const lid = new THREE.Mesh(new THREE.ConeGeometry(.8, .4, 12), M(0x2a3142)); lid.position.set(x, top + 2.45, z); CUR.add(lid);
    for (const [dx, dz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) box(.07, .55, .07, mats.trim, x + dx, top, z + dz, CUR, false); box(1.6, .07, 1.6, mats.trim, x, top + .5, z, CUR, false); };
  const ac = (x, z) => { box(1, .7, .9, M(0x56627a, { metalness: .3 }), x, top, z); const f = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .04, 10), mats.dark); f.position.set(x, top + .72, z); CUR.add(f); const bl = box(.6, .02, .08, M(0x8a94a8), 0, 0, 0, f, false); anim.spin.push(f); f.userData.fast = true; };
  const mast = (x, z, hgt) => { box(.08, hgt, .08, mats.dark, x, top, z, CUR, false); for (let k = 1; k < hgt; k += 1.2) box(.5, .04, .04, mats.dark, x, top + k, z, CUR, false); const tip = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), E(0xff3333)); tip.position.set(x, top + hgt, z); CUR.add(tip); anim.blink.push({ m: tip, ph: Math.random() * 6 }); };
  const dish = (x, z) => { const d = new THREE.Mesh(new THREE.SphereGeometry(.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), M(0xc6cfdf, { side: THREE.DoubleSide })); d.rotation.x = -2.2; d.rotation.z = .5; d.position.set(x, top + .9, z); CUR.add(d); box(.08, .8, .08, mats.dark, x, top, z, CUR, false); };
  tank(3 + T.t * 2, -.2); ac(7.5, -.2); ac(9, -.2); mast(W - .3, -.3, 4 + T.t); dish(-.2, 4); ac(-.2, 7.5); if (T.t !== 1) tank(-.2, 1.5);
  // vertical kanji sign hanging off the front-left post + a second on right post
  for (const [x, z, c] of [[-.75, D + .2, cs], [W + .2, -.75, T.t === 1 ? '#3ff0ff' : '#ff3fa4']]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 4.5), new THREE.MeshBasicMaterial({ map: kanjiTex(c), transparent: true })); m.position.set(x, H + 2.6, z); m.rotation.y = AZ; CUR.add(m); anim.neon.push({ m, sign: true });
    box(.5, .06, .06, mats.dark, x + .25, H + 4.9, z - .25, CUR, false); const gl = new THREE.PointLight(new THREE.Color(c), 6, 6); gl.position.set(x + .6, H + 2.6, z + .6); CUR.add(gl); }
  // warm string lights across the front opening
  const bulbMat = E(0xffd9a0), bulbs = [];
  for (const [a, b, sag] of [[new THREE.Vector3(-.35, 2 * H, D + .35), new THREE.Vector3(W + .35, 2 * H, -.35), 1.4], [new THREE.Vector3(-.35, H + 1.5, D + .35), new THREE.Vector3(W + .35, H + 1.5, -.35), .7]]) {
    const pts = catenary(a, b, sag); CUR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .015, 3), mats.dark));
    for (let i = 1; i < pts.length - 1; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), bulbMat); m.position.copy(pts[i]); CUR.add(m); bulbs.push(m); } }
  anim.bulbs.push(...bulbs); for (let i = 4; i < bulbs.length; i += 9) { const l = new THREE.PointLight(0xffb066, 2.5, 4); l.position.copy(bulbs[i].position); CUR.add(l); }
  // sagging cables from roof edge and vines
  for (let k = 0; k < 4; k++) { const z = rnd(.5, D - .5); CUR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(catenary(new THREE.Vector3(-.2, 2 * H, z), new THREE.Vector3(rnd(1, 4), 2 * H, z + rnd(-1, 1)), rnd(.6, 1.4))), 20, .02, 3), mats.dark)); }
  for (let k = 0; k < 14; k++) { const alongX = Math.random() < .5, p = alongX ? new THREE.Vector3(rnd(.3, W), 2 * H + .1, -.3) : new THREE.Vector3(-.3, 2 * H + .1, rnd(.3, D)); for (let q = 0; q < 4; q++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.08, rnd(.5, 1.4), 4), M(0x1f4d3a)); l.position.copy(p).add(new THREE.Vector3(rnd(-.15, .15), -q * .45 - .3, rnd(-.15, .15))); l.rotation.x = Math.PI; CUR.add(l); } }
  // base: pipes and neon under-glow, dangling cables
  const pipeM = M(0x4a556c, { metalness: .6, roughness: .3 });
  for (const [a, b] of [[[0, D + .45], [W, D + .45]], [[W + .45, 0], [W + .45, D]]]) for (const y of [-.35, -.55]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 12, 8), pipeM); p.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); p.rotation.set(a[1] === b[1] ? 0 : Math.PI / 2, 0, a[1] === b[1] ? Math.PI / 2 : 0); p.scale.y = (a[1] === b[1] ? W : D) / 12; CUR.add(p); }
  box(W + .7, .06, .06, E(col), W / 2 - .17, -.66, D + .4, CUR, false); box(.06, .06, D + .7, E(col), W + .4, -.66, D / 2 - .17, CUR, false);
  for (let k = 0; k < 5; k++) { const x = rnd(1, W - 1); CUR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, -.6, D + .3), new THREE.Vector3(x + .2, -1.6 - Math.random(), D + .4), new THREE.Vector3(x + .5, -2.4 - Math.random() * 1.5, D + .5)]), 10, .02, 3), mats.dark)); }
  const ug = new THREE.PointLight(col, 10, 7); ug.position.set(W * .6, -1.2, D * .6); CUR.add(ug);
}
// ====================================================================== room clutter: monitor walls, ceiling cables, desk lamps, litter
function miniScreen(x, y, z, w, h, ry) { const t = ctex(20, 14, g => { g.fillStyle = '#06101c'; g.fillRect(0, 0, 20, 14); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.position.set(x, y, z); m.rotation.y = ry; CUR.add(m);
  if (ry) box(.04, h + .06, w + .06, mats.dark, x - .03, y - h / 2 - .03, z, CUR, false); else box(w + .06, h + .06, .04, mats.dark, x, y - h / 2 - .03, z - .03, CUR, false);
  anim.screens.push({ t, mini: pick(['code', 'graph', 'radar', 'bars', 'code', 'wave']), col: pick(['#3ff0ff', '#ff3fa4', '#ffb347', '#9fffcf']), ph: Math.random() * 9, hist: [] }); }
function clutter(T) {
  CUR = T.g;
  for (const lv of ['l', 'u']) { const y0 = lv === 'u' ? H : 0;
    for (let z = .45; z < D - .45;) { const w = rnd(.5, .85), hh = rnd(.34, .5); if (Math.random() > .12) { miniScreen(.09, y0 + 4.35, z + w / 2, w, hh, Math.PI / 2); if (lv === 'u' && Math.random() < .6) miniScreen(.09, y0 + 4.9, z + w / 2, w * .9, hh * .9, Math.PI / 2); } z += w + rnd(.06, .2); }
    for (let x = .6; x < W - 1.4;) { const w = rnd(.5, .8); if (Math.random() < .55) miniScreen(x + w / 2, y0 + 4.75 + (lv === 'u' ? .2 : 0), .09, w, .36, 0); x += w + rnd(.3, 1.2); }
    for (let k = 0; k < 4; k++) { const a = new THREE.Vector3(.1, y0 + H - .55, rnd(.5, D - .5)), b = new THREE.Vector3(rnd(2, W - 1), y0 + H - .55, .1); CUR.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(catenary(a, b, rnd(.3, .8))), 24, .02, 3), M(pick([0x0c0f17, 0x1b2a4a, 0x3a1630])))); }
    for (let k = 0; k < 14; k++) { const x = rnd(.5, W - .5), z = rnd(.5, D - .5); if (!T.walk(lv, x, z)) continue; if (Math.random() < .7) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.22, .3), E(pick([0xd6dbe6, 0xb8c0d0, 0xf0e2c0]))); p.rotation.set(-Math.PI / 2, 0, rnd(0, 3)); p.position.set(x, y0 + .07, z); CUR.add(p); }
      else { const c = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .13, 8), E(pick([0xff3fa4, 0x3ff0ff, 0xd0d6e0]))); c.position.set(x, y0 + .1, z); if (Math.random() < .5) { c.rotation.z = Math.PI / 2; c.position.y = y0 + .09; } CUR.add(c); } } }
  for (const s of Object.values(T.seats)) { const y = s.lv === 'u' ? H : 0, L = s.face === 'north-west', lx = L ? .35 : s.x + 1.05, lz = L ? s.z - 1.05 : .35;
    box(.14, .03, .14, mats.dark, lx, y + .79, lz, CUR, false); box(.03, .4, .03, mats.metal, lx, y + .82, lz, CUR, false); const hd = box(.18, .1, .12, M(0xff9f43, { emissive: 0xff8a2a, emissiveIntensity: .8 }), lx + .05, y + 1.2, lz, CUR, false);
    const l = new THREE.PointLight(0xffa24d, 4, 3.2, 1.6); l.position.set(lx + .1, y + 1.1, lz); CUR.add(l); }
}
anim.blink = anim.blink || []; anim.bulbs = anim.bulbs || [];

// ====================================================================== sky events: 3D voxel giants (original designs) walking through the city
const SkyEvents = (() => {
  let ev = null, nextAt = now() + rnd(30000, 50000);
  const LINES = {
    kaiju: ['KAIJU!! Lihat di luar!', 'Monster raksasa?!', 'Simpan semua data, cepat!'], mecha: ['Mecha raksasa lewat!', 'Keren banget thrusternya!', 'Dia patroli kota lagi.'],
    transformer: ['Truk itu... berubah jadi robot?!', 'Mereka nyata!', 'Aku mau satu buat kurir paket.'], meteors: ['Hujan meteor!', 'Buat permohonan! Penjualan naik!', 'Wow, cantik banget.'],
    ufo: ['UFO! Rekam rekam!', 'Mereka mau beli house plan?', 'Lampunya berkedip…'], whale: ['Paus hologram iklan kita!', 'Iklan NEONLOOM di langit 😎', 'Marketing level dewa.'] };
  const TITLE = { kaiju: 'Kaiju terlihat di distrik timur', mecha: 'Mecha raksasa melintas', transformer: 'Kendaraan berubah wujud!', meteors: 'Hujan meteor!', ufo: 'Objek tak dikenal di langit', whale: 'Iklan hologram raksasa' };
  const rim = (g, c = 0xa78bfa) => { const l = new THREE.PointLight(c, 5, 60, 0); l.position.set(8, 16, 10); g.add(l); return l; };
  function robot(cA, cB, cC) {
    const g = new THREE.Group(), A = M(cA, { metalness: .35, roughness: .5, emissive: new THREE.Color(cA).multiplyScalar(.3) }), B = M(cB, { emissive: new THREE.Color(cB).multiplyScalar(.35) }), C = M(cC, { emissive: new THREE.Color(cC).multiplyScalar(.35) }), Y = E(0xfacc15), G = E(0x67e8f9); const legs = [];
    for (const z of [-1.2, 1.2]) { const p = new THREE.Group(); p.position.set(0, 6, z); g.add(p); box(1.8, 6, 1.8, A, 0, -6, 0, p, false); box(2.4, .9, 2, B, .3, -6, 0, p, false); legs.push(p); }
    box(2.4, 1.2, 4, C, 0, 6, 0, g, false); box(3, 4, 5, B, 0, 7.2, 0, g, false); box(.3, 1.2, 3, Y, 1.55, 8.6, 0, g, false);
    const arms = []; for (const z of [-3.4, 3.4]) { box(2.4, 2, 2, A, 0, 9.6, z, g, false); const p = new THREE.Group(); p.position.set(0, 9.8, z); g.add(p); box(1.4, 4.6, 1.4, A, 0, -4.6, 0, p, false); arms.push(p); }
    box(1.4, 3, 3, A, -2, 8, 0, g, false); box(1.8, 1.8, 1.8, A, 0, 11.2, 0, g, false); box(.2, .4, 1.4, G, .95, 12.1, 0, g, false);
    for (const s of [-1, 1]) { const a = box(.2, 1.6, .2, Y, .9, 12.6, s * .5, g, false); a.rotation.x = s * .5; }
    return { g, legs, arms };
  }
  function kaiju() {
    const g = new THREE.Group(), sk = M(0x3d6b78, { roughness: .85, emissive: 0x1d3f52 }), bel = M(0x6a9aa6, { emissive: 0x2a5566 }), glow = E(0x67e8f9), eye = E(0xff3355); const legs = [];
    for (const z of [-1.4, 1.4]) { const p = new THREE.Group(); p.position.set(0, 5, z); g.add(p); box(2.2, 5, 1.8, sk, 0, -5, 0, p, false); box(2.8, .8, 2, sk, .4, -5, 0, p, false); legs.push(p); }
    box(6, 6.5, 4, sk, 0, 4.5, 0, g, false); box(1, 4.5, 3, bel, 3, 5, 0, g, false); box(3.4, 2.6, 2.6, sk, 3.8, 10.2, 0, g, false); box(2.2, 1.3, 2, sk, 6, 10.6, 0, g, false); box(2, .6, 1.8, bel, 5.8, 10, 0, g, false);
    for (const z of [-.9, .9]) box(.3, .4, .4, eye, 5.2, 11.8, z, g, false);
    for (const z of [-2.2, 2.2]) box(2.2, .8, .8, sk, 3.6, 8, z, g, false);
    [[-4.2, 3.6, 3, 2.4], [-7.2, 2.2, 2.4, 1.8], [-9.8, 1, 2, 1.3], [-12, .4, 1.6, .9]].forEach(([x, y, w, h]) => box(3.2, h, w, sk, x, y, 0, g, false));
    const spikes = []; for (let i = 0; i < 9; i++) spikes.push(box(.7, 1.2 + (i % 3) * .5, .5, glow, -8 + i * 1.4, i < 4 ? 4.4 - (3 - i) * .9 : 10.8, 0, g, false));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, .9, 40, 10), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .8 })); beam.rotation.z = -Math.PI / 2; beam.position.set(27, 11, 0); beam.visible = false; g.add(beam);
    const bl = new THREE.PointLight(0x67e8f9, 0, 80, 0); bl.position.set(8, 11, 0); g.add(bl); rim(g);
    g.scale.setScalar(2); g.rotation.y = AZ; let lastStep = 0;
    return { g, dur: 30000, update(k, t) { const u = -46 + k * 92; g.position.copy(at(u, 30, -15 + Math.abs(Math.sin(t * 3)) * .4)); legs[0].rotation.z = Math.sin(t * 3) * .45; legs[1].rotation.z = -Math.sin(t * 3) * .45;
      const st = Math.floor(t * 3 / Math.PI); if (st !== lastStep) { lastStep = st; shake = Math.max(shake, .35); Sound.step(); }
      const fire = (k > .3 && k < .4) || (k > .78 && k < .86); beam.visible = fire; bl.intensity = fire ? 6 : 0; if (fire && !this.fired) { this.fired = 1; Sound.zap(); Sound.roar(); flash(.3); }
      for (const s of spikes) s.material.color.setHSL(.52, 1, .45 + .25 * Math.sin(t * 6)); } };
  }
  function mecha() {
    const r = robot(0xe5e7eb, 0x1d4ed8, 0xdc2626), g = r.g; const flames = [];
    for (const z of [-1.2, 1.2]) { const f = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .85 })); f.rotation.x = Math.PI; f.position.set(0, -1.6, z); g.add(f); flames.push(f); }
    const fl = new THREE.PointLight(0x67e8f9, 4, 30, 0); fl.position.set(0, -2, 0); g.add(fl); rim(g); g.scale.setScalar(1.8); g.rotation.y = AZ - Math.PI / 2;
    return { g, dur: 22000, update(k, t) { g.position.copy(at(-42 + k * 84, 30, -11 + Math.sin(t * 1.5) * 1.2)); for (const f of flames) f.scale.y = .8 + Math.random() * .6; r.arms[0].rotation.z = Math.sin(t) * .3; if (k > .5 && k < .6) r.arms[1].rotation.z = -1.6; else r.arms[1].rotation.z = 0; } };
  }
  function transformer() {
    const g = new THREE.Group(), truck = new THREE.Group(); g.add(truck);
    box(8, 3, 2.6, M(0x334155), -2, .8, 0, truck, false); box(2.6, 3.2, 2.6, M(0xb91c1c), 3.4, .8, 0, truck, false); box(.1, 1.2, 2.2, E(0x93c5fd), 4.75, 2.4, 0, truck, false);
    for (const x of [-4.5, -1, 3.4]) for (const z of [-1.35, 1.35]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .4, 10), M(0x0f0f17)); w.rotation.x = Math.PI / 2; w.position.set(x, .8, z); truck.add(w); }
    box(.1, .4, .4, E(0xfde68a), 4.75, 1.2, -.9, truck, false); box(.1, .4, .4, E(0xfde68a), 4.75, 1.2, .9, truck, false);
    const r = robot(0xb91c1c, 0x1e40af, 0x94a3b8); r.g.scale.setScalar(.01); g.add(r.g); rim(g, 0xf472b6); g.rotation.y = AZ;
    return { g, dur: 20000, update(k, t) { const u = k < .35 ? -46 + k / .35 * 37.4 : k < .7 ? -8.6 : -8.6 + (k - .7) / .3 * 50; g.position.copy(at(u, 28, -13)); g.scale.setScalar(1.5);
      const m = THREE.MathUtils.clamp((k - .35) / .1, 0, 1); truck.scale.set(1, 1 - m * .99, 1 - m * .5); r.g.scale.setScalar(.01 + m * 1.25); if (m > 0 && !this.tf) { this.tf = 1; Sound.mecha(); flash(.2); }
      if (k > .7) { r.legs[0].rotation.z = Math.sin(t * 3) * .4; r.legs[1].rotation.z = -Math.sin(t * 3) * .4; } r.arms[0].rotation.z = k > .45 && k < .7 ? -2.6 + Math.sin(t * 6) * .3 : 0; } };
  }
  function ufo() {
    const g = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.8, .9, 24), M(0x64748b, { metalness: .7, roughness: .3 })); g.add(disc);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .7 })); dome.position.y = .4; g.add(dome);
    const ring = new THREE.Group(); g.add(ring); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const l = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .4), E(i % 2 ? 0xf472b6 : 0x4ade80)); l.position.set(Math.cos(a) * 4.5, -.2, Math.sin(a) * 4.5); ring.add(l); }
    const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 26, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = -13.4; beam.visible = false; g.add(beam);
    rim(g, 0x67e8f9);
    return { g, dur: 20000, update(k, t) { g.position.copy(at(-40 + k * 80, 28, 3 + Math.sin(t * 2))); g.scale.setScalar(1.3); ring.rotation.y += .05; beam.visible = k > .4 && k < .7; g.rotation.z = Math.sin(t * 1.5) * .08; } };
  }
  function whale() {
    const g = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: 0x67e8f9, wireframe: true, transparent: true, opacity: .55 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), wm); body.scale.set(10, 3.2, 3.4); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 6), wm); tail.rotation.z = Math.PI / 2; tail.position.x = -11.5; g.add(tail);
    for (const z of [-3, 3]) { const f = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 4), wm); f.rotation.x = z > 0 ? 1.2 : -1.2; f.position.set(2, -2, z); g.add(f); }
    const txt = ctex(128, 20, c => { c.font = 'bold 14px monospace'; c.fillStyle = '#f472b6'; c.fillText('NEONLOOM PLANS', 4, 15); }); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: txt, transparent: true })); sp.scale.set(14, 2.2, 1); sp.position.y = -5; g.add(sp);
    g.rotation.y = AZ + Math.PI;
    return { g, dur: 24000, update(k, t) { g.position.copy(at(45 - k * 90, 28, 2 + Math.sin(t) * 1.2)); g.scale.setScalar(1.3); tail.rotation.y = Math.sin(t * 2) * .4; wm.opacity = Math.random() < .05 ? .15 : .5 + .1 * Math.sin(t * 8); } };
  }
  function meteors() {
    const g = new THREE.Group(), list = [], booms = []; let spawned = 0;
    return { g, dur: 11000, update(k, t, dt) {
      if (spawned < 20 && k * 14 > spawned) { spawned++; const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), E(0xffd27a)); const trail = []; for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.9 - i * .12, .9 - i * .12, .9 - i * .12), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: .8 - i * .12 })); g.add(s); trail.push(s); }
        m.position.copy(at(rnd(-45, 45), rnd(16, 40), 34)); g.add(m); list.push({ m, trail, v: RT.clone().multiplyScalar(rnd(-8, 8)).add(new THREE.Vector3(0, -24, 0)), big: spawned % 5 === 0 }); }
      for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; o.m.position.addScaledVector(o.v, dt); o.m.rotation.x += dt * 5; o.trail.forEach((s, j) => s.position.copy(o.m.position).addScaledVector(o.v, -.05 * (j + 1)));
        if (o.m.position.y < -24) { g.remove(o.m); o.trail.forEach(s => g.remove(s)); list.splice(i, 1);
          if (o.big) { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: .9 })); b.position.copy(o.m.position); g.add(b); const l = new THREE.PointLight(0xff9f43, 8, 60, 0); l.position.copy(b.position); g.add(l); booms.push({ b, l, t: 0 }); flash(.5); Sound.boom(); shake = .6; } } }
      for (let i = booms.length - 1; i >= 0; i--) { const o = booms[i]; o.t += dt; o.b.scale.setScalar(1 + o.t * 12); o.b.material.opacity = Math.max(0, .9 - o.t); o.l.intensity = Math.max(0, 8 - o.t * 8); if (o.t > 1) { g.remove(o.b); g.remove(o.l); booms.splice(i, 1); } } } };
  }
  const MAKE = { kaiju, mecha, transformer, ufo, whale, meteors };
  function start(kind) {
    if (ev) { scene.remove(ev.g); ev = null; } kind = kind || pick(Object.keys(MAKE)); ev = MAKE[kind](); ev.kind = kind; ev.t0 = now(); scene.add(ev.g); ev.dy = 0;
    if (kind !== 'meteors') { ev.update(.5, now() / 1000, 0); ev.g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(ev.g), c = bb.getCenter(new THREE.Vector3()); c.y = bb.max.y;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), view = 12.2 / (HOMEZOOM * CINE_Z), centre = camTarget.clone().addScaledVector(up, CINE_UP);
      const want = { kaiju: .78, mecha: .86, transformer: .8, ufo: .78, whale: .72 }[kind]; ev.dy = (want * view - c.sub(centre).dot(up)) / up.y; }
    ev.update(0, now() / 1000, 0); ev.g.position.y += ev.dy;
    if (kind === 'kaiju') Sound.roar(); if (kind === 'ufo') Sound.ufo(); if (kind === 'mecha') Sound.mecha(); if (kind === 'whale') Sound.chime(); if (kind === 'meteors') Sound.whoosh();
    toast('⚠ ' + TITLE[kind]); reactToEvent(LINES[kind], kind === 'kaiju' || kind === 'meteors');
  }
  function update(dt) {
    if (ev) { const k = (now() - ev.t0) / ev.dur; if (k > 1) { scene.remove(ev.g); ev = null; nextAt = now() + rnd(55000, 100000); } else { ev.update(k, now() / 1000, dt); ev.g.position.y += ev.dy; } }
    else if (now() > nextAt && !Q.has('noevents')) start();
  }
  return { start, update, get ev() { return ev; } };
})();

// ====================================================================== navigation (per tower, per level)
const STEP = .25, NX = Math.round(W / STEP) + 1, NZ = Math.round(D / STEP) + 1;
for (const T of TOWERS) {
  T.walk = (lv, x, z) => { if (x < .2 || z < .2 || x > W - .2 || z > D - .2) return false; if (lv === 'u' && !T.up(x, z)) return false; for (const [a, b, c, d] of T.blocked[lv]) if (x > a - .18 && x < c + .18 && z > b - .18 && z < d + .18) return false; return true; };
  T.grid = {}; for (const lv of ['l', 'u']) { const gr = T.grid[lv] = new Uint8Array(NX * NZ); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) gr[i * NZ + j] = T.walk(lv, i * STEP, j * STEP) ? 1 : 0; }
  T.open = (lv, x, z) => { const i = Math.round(x / STEP), j = Math.round(z / STEP); if (i >= 0 && j >= 0 && i < NX && j < NZ) T.grid[lv][i * NZ + j] = 1; };
  for (const lv of ['l', 'u']) for (let x = T.lift.door.x; x <= T.lift.x + .01; x += STEP) T.open(lv, x, T.lift.z);
  for (const s of Object.values(T.seats)) T.open(s.lv, s.x, s.z); for (const s of Object.values(T.spots)) if (s.x !== undefined) T.open(s.lv, s.x, s.z);
  if (T.portal) T.open('l', T.portal.x, T.portal.z);
}
for (const T of TOWERS) { exterior(T); clutter(T); }
CUR = scene;
function nearest(T, lv, x, z) { let b = null, bd = 1e9; const g = T.grid[lv]; for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (g[i * NZ + j]) { const d = (i * STEP - x) ** 2 + (j * STEP - z) ** 2; if (d < bd) { bd = d; b = [i, j]; } } return b; }
function astar(T, lv, x0, z0, x1, z1) {
  const g = T.grid[lv], s = nearest(T, lv, x0, z0), e = nearest(T, lv, x1, z1); if (!s || !e) return [];
  const K = (i, j) => i * NZ + j, op = [[0, 0, ...s]], came = new Map(), cost = new Map([[K(...s), 0]]);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (op.length) { op.sort((a, b) => a[0] - b[0]); const [, c, i, j] = op.shift(); if (i === e[0] && j === e[1]) break;
    for (const [di, dj, w] of dirs) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || !g[K(ni, nj)]) continue; if (di && dj && (!g[K(i + di, j)] || !g[K(i, j + dj)])) continue;
      const nc = c + w; if (nc < (cost.get(K(ni, nj)) ?? 1e9)) { cost.set(K(ni, nj), nc); came.set(K(ni, nj), [i, j]); op.push([nc + Math.hypot(ni - e[0], nj - e[1]), nc, ni, nj]); } } }
  const path = []; let cur = e; while (cur && !(cur[0] === s[0] && cur[1] === s[1])) { path.unshift([cur[0] * STEP, cur[1] * STEP]); cur = came.get(K(...cur)); }
  return path.filter((p, k) => k % 2 === 1 || k === path.length - 1);
}
const free = (T, lv) => { for (let k = 0; k < 120; k++) { const x = rnd(1, W - 1), z = rnd(1, D - 1); if (T.walk(lv, x, z)) return [x, z]; } return [T.view.x, T.view.z]; };

// ====================================================================== overlay helpers
const overlay = document.getElementById('overlay');
const el = (cls, html = '', parent = overlay) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(text) { const bx = document.getElementById('toasts'); if (!bx) return; const t = el('toast warn', `<i style="background:#f472b6"></i><div><b>NEONLOOM CITY</b><span>${esc(text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 6000); setTimeout(() => t.remove(), 6800); }
const project = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * host.clientWidth, (1 - p.y) / 2 * host.clientHeight]; };

// ====================================================================== NPCs
const loader = new THREE.TextureLoader(), texCache = {};
const tex = url => texCache[url] || (texCache[url] = (() => { const t = loader.load(url); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })());
const DIR = (dx, dz) => { const a = (Math.atan2(dz, dx) * 180 / Math.PI - AZ_OFF + 720) % 360; return ['south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east'][Math.round(a / 45) % 8]; };
const SIZE = 2.4, npcs = {};
const isWork = n => ['working', 'queued'].includes(n.server.status);
class NPC {
  constructor(name, T) {
    this.name = name; this.meta = META[name] || { name, color: '#fff', role: '', desc: '' }; this.a = ASSETS.npc[name] || {}; this.home = T; this.T = T; this.seat = T.seats[name];
    this.mat = new THREE.SpriteMaterial({ map: tex(this.a.rot?.south || ''), transparent: true, alphaTest: .4, color: 0xdfe6ff }); this.spr = new THREE.Sprite(this.mat); this.spr.scale.set(SIZE, SIZE, 1); this.spr.center.set(.5, .1); scene.add(this.spr);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.32, 12), new THREE.MeshBasicMaterial({ color: 0x05040f, transparent: true, opacity: .45 })); this.shadow.rotation.x = -Math.PI / 2; scene.add(this.shadow);
    this.pos = new THREE.Vector3(); this.path = []; this.legs = []; this.mode = 'free'; this.server = { status: 'idle' }; this.next = now() + rnd(3000, 12000); this.history = []; this.anim = null; this.t = 0; this.flip = false;
    this.tag = el('npc-tag', `<b>${name}</b>`); this.tag.style.setProperty('--c', this.meta.color); this.bubble = el('bubble hidden', ''); this.icon = el('npc-icon', ''); this.carry = el('npc-carry hidden', '📄');
    this.tag.onclick = () => openNPC(this); this.sit();
  }
  frames(kind, dir) { const set = kind === 'walk' ? this.a.walk : (this.a.anims || {})[kind]; if (!set) return null; if (set[dir]) return { urls: set[dir], flip: false };
    const m = { 'north-west': 'north-east', 'south-west': 'south-east', west: 'east', 'north-east': 'north-west', 'south-east': 'south-west', north: 'north-east', south: 'south-east' }[dir];
    if (m && set[m]) return { urls: set[m], flip: !['north', 'south'].includes(dir) }; const any = Object.keys(set)[0]; return any ? { urls: set[any], flip: false } : null; }
  setFrame(url, flip) { this.mat.map = tex(url); this.flip = flip; this.mat.needsUpdate = true; }
  still(dir) { const u = this.a.rot?.[dir] || this.a.rot?.south; if (u) this.setFrame(u, false); this.anim = null; this.facing = dir; }
  play(kind, dir, fps = 9) { const f = this.frames(kind, dir); if (!f) return this.still(dir); this.anim = { f, fps, i: -1, kind }; this.t = 0; this.facing = dir; }
  sit() { const s = this.seat; this.T = this.home; this.lv = s.lv; this.pos.set(s.x, 0, s.z); this.sitting = true; this.still(s.face); }
  y() { return this.lv === 'u' ? H : 0; }
  moving() { return this.path.length || this.lift || this.warp || this.legs.length; }
  goTo(T2, lv, x, z, done) {
    this.sitting = false; const legs = []; let t = this.T.t, l = this.lv;
    if (t !== T2.t) { if (l !== 'l') { legs.push({ t, lv: l, x: TOWERS[t].lift.door.x, z: TOWERS[t].lift.door.z }, { lift: 'l', t }); l = 'l'; }
      const P = TOWERS[t].portal; legs.push({ t, lv: 'l', x: P.x, z: P.z }, { warp: T2.t }); t = T2.t; }
    if (l !== lv) legs.push({ t, lv: l, x: T2.lift.door.x, z: T2.lift.door.z }, { lift: lv, t });
    legs.push({ t: T2.t, lv, x, z }); this.legs = legs; this.done = done; if (!this.lift && !this.warp) { this.path = []; this.nextLeg(); }
  }
  nextLeg() {
    const L = this.legs.shift(); if (!L) { this.path = []; this.still('south-east'); const d = this.done; this.done = null; d && d(); return; }
    if (L.lift) return this.ride(L);
    if (L.warp !== undefined) { this.warp = { t: 0, to: L.warp }; this.path = []; Sound.warp(); this.T.portal.fx = 1; return; }
    this.T = TOWERS[L.t]; this.lv = L.lv; this.path = astar(this.T, L.lv, this.pos.x, this.pos.z, L.x, L.z); this.path.push([L.x, L.z]);
  }
  ride(L) { const T = TOWERS[L.t], cab = T.lift.cabin; this.lift = { T, cab, phase: 0, y: this.y(), from: this.y(), to: L.lift === 'u' ? H : 0, toLv: L.lift }; }
  update(dt) {
    if (this.lift) { const L = this.lift, cab = L.cab, sp = 3.2 * dt;
      if (L.phase === 0) { const d = L.from - cab.position.y; if (Math.abs(d) < sp) { cab.position.y = L.from; L.phase = 1; this.path = [[L.T.lift.x, L.T.lift.z]]; } else cab.position.y += Math.sign(d) * sp; }
      else if (L.phase === 2) { const d = L.to - L.y; if (Math.abs(d) < sp) { L.y = cab.position.y = L.to; this.lv = L.toLv; this.lift = null; Sound.ding(); this.path = [[L.T.lift.door.x, L.T.lift.door.z]]; this.after = true; } else { L.y += Math.sign(d) * sp; cab.position.y = L.y; } } }
    let sc = 1;
    if (this.warp) { const w = this.warp; w.t += dt; sc = w.t < .45 ? 1 - w.t / .45 : Math.min(1, (w.t - .45) / .45);
      if (!w.sw && w.t >= .45) { w.sw = true; this.T = TOWERS[w.to]; this.lv = 'l'; const P = this.T.portal; this.pos.set(P.x, 0, P.z); P.fx = 1; }
      if (w.t >= .9) { this.warp = null; sc = 1; this.nextLeg(); } }
    if (this.path.length && !this.warp) { const [px, pz] = this.path[0], dx = px - this.pos.x, dz = pz - this.pos.z, dist = Math.hypot(dx, dz), sp = (this.running ? 3.2 : 1.8) * dt, dir = DIR(dx, dz);
      if (!this.anim || this.anim.kind !== 'walk' || this.facing !== dir) this.play('walk', dir, this.running ? 16 : 10);
      if (dist <= sp) { this.pos.x = px; this.pos.z = pz; this.path.shift(); if (!this.path.length) { if (this.lift && this.lift.phase === 1) { this.lift.phase = 2; this.still('south-west'); } else if (this.after) { this.after = false; this.nextLeg(); } else if (!this.lift) this.nextLeg(); } }
      else { this.pos.x += dx / dist * sp; this.pos.z += dz / dist * sp; } }
    if (this.anim) { this.t += dt; const a = this.anim, n = a.f.urls.length, i = Math.floor(this.t * a.fps) % n; if (i !== a.i) { a.i = i; this.setFrame(a.f.urls[i], a.f.flip); } }
    const y = this.lift && this.lift.phase === 2 ? this.lift.y : this.y();
    const typing = this.sitting && isWork(this);
    const bob = this.sitting ? (typing ? Math.abs(Math.sin(now() / 90)) * .04 : 0) - .3 : (this.dancing ? Math.abs(Math.sin(now() / 160)) * .15 : 0);
    const w = this.pos.clone().add(OFF(this.T.t)); this.spr.position.set(w.x, y + bob + .02, w.z); this.shadow.position.set(w.x, y + .05, w.z); this.shadow.visible = !this.sitting && sc > .5;
    const br = !this.anim && !this.sitting ? 1 + Math.sin(now() / 500 + this.pos.x) * .012 : 1; this.spr.scale.set((this.flip ? -1 : 1) * SIZE * Math.max(.02, sc), SIZE * br * (sc < 1 ? 1 + (1 - sc) * .6 : 1), 1);
    if (typing && Math.random() < .03) Sound.type();
  }
  busy() { return this.mode !== 'free' || this.inChat || isWork(this); }
  setStatus(a) { const prev = this.server.status; this.server = a; if (prev === a.status) return;
    this.icon.className = 'npc-icon ' + (a.status === 'error' ? 'err' : a.status === 'waiting' ? 'wait' : ''); this.icon.textContent = a.status === 'error' ? '!' : a.status === 'waiting' ? '?' : '';
    if (isWork(this)) { this.mode = 'work'; this.inChat = null; this.carry.classList.add('hidden'); if (!this.sitting) this.goDesk(); }
    else if (this.mode === 'work') { this.mode = 'free'; this.next = now() + rnd(3000, 7000); } }
  goDesk(cb) { const s = this.seat; this.dancing = false; this.goTo(this.home, s.lv, s.x, s.z, () => { this.sit(); this.running = false; if (this.mode !== 'work') this.mode = 'free'; cb && cb(); }); }
  emote(kind, ms = 3200, dir = 'south-east') { if (this.sitting || this.moving()) return; this.play(kind, dir, 8); clearTimeout(this._e); this._e = setTimeout(() => { if (this.anim?.kind === kind) this.still(dir); }, ms); }
  say(t, ms = 5000, kind = 'say') { const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), ms); this.history.unshift(t); this.history.length = Math.min(this.history.length, 12); Sound.blip(); }
  pop(e) { if (['error', 'waiting'].includes(this.server.status)) return; this.icon.className = 'npc-icon pop'; this.icon.textContent = e; clearTimeout(this._p); this._p = setTimeout(() => { if (this.icon.textContent === e) { this.icon.className = 'npc-icon'; this.icon.textContent = ''; } }, 2200); }
  life() {
    if (this.sitting && Math.random() < .035) this.pop(isWork(this) ? pick(['⌨️', '🧠', '📊', '⚡', '💾', '🔍']) : pick(['💡', '☕', '🎧', '💭', '😴', '📈', '🎵', '😎']));
    if (this.busy() || now() < this.next || Phase.cur) return; this.next = now() + rnd(9000, 20000);
    const r = Math.random(), lounge = TOWERS[0], others = Object.values(npcs).filter(n => n !== this && !n.busy());
    if (r < .16) { this.mode = 'busy'; const lv = pick(['l', 'u']), [x, z] = free(this.home, lv); this.goTo(this.home, lv, x, z, () => { this.say(pick(['Peregangan dulu~', 'Lihat kota sebentar…', 'Hmm, ide baru…', 'Neon malam ini cantik.', 'Cek drone pengantar.']), 3500, 'chat'); this.emote(pick(['yawn', 'idle', 'talk'])); setTimeout(() => this.goDesk(), rnd(5000, 9000)); }); }
    else if (r < .36) { const sp = pick(Object.values(lounge.spots)); this.mode = 'busy'; this.goTo(lounge, sp.lv, sp.x, sp.z, () => {
      const msg = { snack: ['Kopi dulu ☕', 'Snack biar fokus.', 'Vending ini selalu macet…'], game: ['Satu ronde aja 🎮', 'Highscore baru!', 'Combo x12!'], rest: ['Rebahan sebentar…', 'Nyaman banget.', 'Power nap 5 menit.'], dance: ['Lagu ini enak 🎶', 'Dance break!', 'Ayo ikut!'] }[sp.kind];
      this.say(pick(msg), 3500, 'chat'); if (sp.kind === 'dance') this.dancing = true; this.emote(sp.kind === 'snack' ? 'coffee' : sp.kind === 'dance' ? 'celebrate' : sp.kind === 'game' ? 'talk' : 'idle', 7000, sp.kind === 'game' ? 'north-west' : 'south-east');
      if (sp.kind === 'game') { this.pop('🎮'); setTimeout(() => Sound.party(), 1800); }
      setTimeout(() => this.goDesk(), rnd(8000, 14000)); }); }
    else if (r < .52) { const other = others.find(n => n.home === this.home) || others[0]; if (other) startChat(this, other); }
    else if (r < .6 && others.length) { const o = pick(others); this.mode = 'busy'; const s = o.seat; this.goTo(o.home, s.lv, Math.min(W - .6, s.x + .9), Math.min(D - .6, s.z + .9), () => {
      this.say(pick([`${o.name}, boleh diskusi sebentar?`, `Data ini cocok buat kamu, ${o.name}.`, 'Cek draft ini dong.']), 3800, 'chat'); this.emote('talk', 3500, 'north-west'); setTimeout(() => o.say(pick(['Boleh, kirim ke aku.', 'Oke, aku lihat!', 'Siap 👍']), 3000), 2600); setTimeout(() => this.goDesk(), 6000); }); }
    else if (r < .66 && cat) { this.mode = 'busy'; const c = cat.pos; this.goTo(lounge, 'l', c.x, c.z, () => { this.say(pick(['Neko lucu banget 🐱', 'Siapa yang kasih makan Neko?', 'Pus pus~']), 4000, 'chat'); this.emote('talk', 3000, 'south-west'); cat.say('Mrrr 💜'); setTimeout(() => this.goDesk(), 6000); }); }
    else if (r < .71 && this.name !== 'ZERO-1') { const z = npcs['ZERO-1']; if (z && !z.busy()) serviceCall(this, z); }
    else if (r < .78) { this.mode = 'busy'; this.goTo(this.home, 'l', this.home.view.x, this.home.view.z, () => { this.say(pick(['Kota ini nggak pernah tidur.', 'Mobil terbang makin ramai…', 'Hujan neon lagi.']), 3500, 'chat'); this.emote('yawn', 3000, 'south-east'); setTimeout(() => this.goDesk(), 6000); }); }
  }
}
function startChat(a, b) {
  a.mode = b.mode = 'busy'; a.inChat = b.inChat = true; const T = a.home, [x, z] = free(T, 'l');
  let n = 0; a.goTo(T, 'l', x, z, arrived); b.goTo(T, 'l', Math.min(W - 1, x + .9), z, arrived);
  async function arrived() { if (++n < 2) return; a.still('south-east'); b.still('north-west');
    let lines; try { lines = await (await fetch('/api/world/banter')).json(); } catch (e) { lines = null; } if (!Array.isArray(lines) || lines.length < 2) lines = ['Hai, gimana progresnya?', 'Lancar, tinggal finishing!'];
    a.say(lines[0], 4000, 'chat'); a.emote('talk', 3800, 'south-east'); setTimeout(() => { b.say(lines[1], 4000, 'chat'); b.emote('talk', 3800, 'north-west'); }, 4200);
    setTimeout(() => { if (Math.random() < .4) { a.emote('celebrate', 2000); b.emote('celebrate', 2000); a.say('High five! ✋', 2000, 'chat'); } }, 8600);
    setTimeout(() => { a.inChat = b.inChat = false; a.goDesk(); b.goDesk(); }, 11000); }
}
function serviceCall(asker, z) {
  asker.say(pick(['PC-ku nge-hang lagi…', 'Monitor kedip-kedip!', 'ZERO, tolong dong!']), 3500, 'alert'); asker.pop('🛠️'); z.mode = 'busy'; const s = asker.seat;
  z.goTo(asker.home, s.lv, Math.min(W - .6, s.x + .9), Math.min(D - .6, s.z + .9), () => { z.say('Tenang, aku perbaiki 🔧', 3000); z.emote('talk', 3000, 'north-west'); sparks(asker.home, s.x, (s.lv === 'u' ? H : 0) + 1.2, s.z - .8);
    setTimeout(() => { asker.say('Makasih ZERO! 🙏', 3000); z.goDesk(); }, 4000); });
}
function reactToEvent(lines, scary) {
  Object.values(npcs).forEach((n, i) => setTimeout(() => {
    if (n.busy() || n.moving()) { n.say(pick(lines), 4000, 'alert'); return; }
    n.mode = 'busy'; n.running = scary; n.goTo(n.home, 'l', n.home.view.x + rnd(-.4, .4), n.home.view.z + rnd(-.4, .4), () => { n.say(pick(lines), 4500, scary ? 'alert' : 'chat'); n.emote(scary ? 'frustrated' : 'celebrate', 4000, 'north-east'); setTimeout(() => n.goDesk(), 7000); });
  }, i * 250));
}

// ====================================================================== office phases: stand-up meeting, lunch, brainstorm, celebration
const MEET = ['Kemarin: 3 listing baru siap.', 'Hari ini riset keyword "modern farmhouse".', 'Blocker: nunggu approval owner.', 'QA lolos 12 file, 1 revisi.', 'Pin Pinterest naik 18%.', 'Kas aman, laporan siap.', 'Server sehat, GPU 61°C.', 'Video YouTube baru tayang besok.', 'Arsip aset sudah rapi.'];
const LUNCH = ['Ramen sintetis lagi? 🍜', 'Aku pesan drone-sushi.', 'Kopi ketiga hari ini…', 'Ada yang mau donat neon?', 'Lapar banget!'];
const IDEAS = ['Ide: bundle 3 denah + mood board.', 'Gimana kalau tema cyberpunk cabin?', 'Thumbnail pakai warna pink-cyan!', 'Seri "tiny house" laku keras.', 'Tambah video walkthrough 3D!'];
const Phase = {
  cur: null, next: now() + rnd(45000, 70000),
  tick() { if (Q.has('noevents') || this.cur || now() < this.next) return; this.start(); },
  start(kind) { if (this.cur) return; kind = kind || pick(['meeting', 'lunch', 'brainstorm', 'cheer', 'meeting']); const T0 = TOWERS[0], T1 = TOWERS[0], T2 = TOWERS[0];
    if (kind === 'meeting') gather('meeting', T0, 'u', T0.meet.pts, T0.meet.focus, '📋 Stand-up meeting di COMMAND DECK', 'Stand-up dimulai! Update cepat ya.', MEET, 'Oke, bubar! Semangat 👏');
    else if (kind === 'lunch') gather('lunch', T2, 'l', Object.values(T2.spots).map(s => [s.x, s.z]).concat([[13, 6.2], [23, 6.8]]), [14, 7.5], '🍜 Jam makan siang di LOUNGE', 'Makan siang dulu semua!', LUNCH, 'Kenyang! Balik kerja 💪');
    else if (kind === 'brainstorm') gather('brainstorm', T1, 'l', T1.board.pts, T1.board.focus, '💡 Brainstorm di meja hologram LOUNGE', 'Brainstorm produk baru, lempar ide!', IDEAS, 'Ide bagus semua! Aku catat ✍️');
    else { this.cur = 'cheer'; toast('🎉 Target penjualan minggu ini tercapai!'); Sound.party(); flash(.15); for (const T of TOWERS) confetti(T);
      for (const n of Object.values(npcs)) { n.pop('🎉'); if (!n.sitting && !n.moving()) n.emote('celebrate', 3000); } setTimeout(() => npcs['KAI-07']?.say('Kerja bagus tim! 🎉', 4000), 600);
      setTimeout(() => { this.cur = null; this.next = now() + rnd(60000, 100000); }, 6000); }
  },
};
function gather(kind, T, lv, pts, focus, title, open, pool, end) {
  let ppl = Object.values(npcs).filter(n => !isWork(n) && !n.inChat && !n.lift && !n.warp && !(n.mode === 'busy' && n.carry.classList.contains('hidden') === false)); ppl.sort((a, b) => (b.name === 'KAI-07') - (a.name === 'KAI-07')); ppl = ppl.slice(0, pts.length);
  if (ppl.length < 2) { Phase.next = now() + 20000; return; }
  Phase.cur = kind; toast(title); Sound.chime(); let arrived = 0, talked = false;
  ppl.forEach((n, i) => { n.mode = 'busy'; n.running = false; const [x, z] = pts[i]; n.say(pick(['Otw!', 'Siap, ke sana.', 'Oke!']), 2000, 'chat');
    n.goTo(T, lv, x, z, () => { n.facing = DIR(focus[0] - x, focus[1] - z); n.still(n.facing); if (++arrived >= ppl.length) talk(); }); });
  const fallback = setTimeout(talk, 50000);
  function talk() { if (talked) return; talked = true; clearTimeout(fallback); const here = ppl.filter(n => n.mode === 'busy' && n.T === T && !n.moving()); if (!here.length) return finish([]);
    const lines = [open, ...shuffle(pool).slice(0, Math.min(pool.length, here.length + 1))]; let i = 0;
    const step = () => { if (i < lines.length) { const n = here[i % here.length]; if (n.mode === 'busy') { n.say(lines[i], 3600, 'chat'); n.emote('talk', 3200, n.facing); } i++; setTimeout(step, 3900); }
      else { here.forEach(n => { if (n.mode === 'busy') n.emote('celebrate', 2200, n.facing); }); here[0].say(end, 2500, 'chat'); Sound.chime(); setTimeout(() => finish(here), 2600); } };
    step(); }
  function finish(here) { ppl.forEach(n => { if (n.mode === 'busy') n.goDesk(); }); Phase.cur = null; Phase.next = now() + rnd(60000, 110000); }
}

// ====================================================================== office cat + drones + cleaning robots
let cat = null;
{ const a = (ASSETS.pets || {}).CAT; if (a) {
  const mat = new THREE.SpriteMaterial({ map: tex(a.rot['south-east']), transparent: true, alphaTest: .4 }), spr = new THREE.Sprite(mat); spr.scale.set(1.3, 1.3, 1); spr.center.set(.5, .1); scene.add(spr);
  const set = k => { const s = k === 'walk' ? a.walk : (a.anims || {})[k]; const d = s && Object.keys(s)[0]; return d ? s[d] : null; };
  cat = { pos: new THREE.Vector3(13, 0, 6.4), path: [], spr, mat, next: 0, t: 0, frames: null, bubble: el('bubble hidden', ''),
    say(t) { this.bubble.className = 'bubble chat'; this.bubble.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => this.bubble.classList.add('hidden'), 3000); },
    update(dt) { const T = TOWERS[0];
      if (!this.path.length && now() > this.next) { const r = Math.random();
        if (r < .3) { this.frames = set('sleep'); this.next = now() + rnd(15000, 30000); } else if (r < .5) { this.frames = set('idle'); this.next = now() + rnd(4000, 8000); }
        else { const [x, z] = free(T, 'l'); this.path = astar(T, 'l', this.pos.x, this.pos.z, x, z); this.frames = set('walk'); this.next = now() + rnd(3000, 8000); } }
      if (this.path.length) { const [px, pz] = this.path[0], dx = px - this.pos.x, dz = pz - this.pos.z, d = Math.hypot(dx, dz), sp = 1.1 * dt; this.spr.scale.x = (dx - dz) < 0 ? -1.3 : 1.3;
        if (d <= sp) { this.pos.x = px; this.pos.z = pz; this.path.shift(); if (!this.path.length) this.frames = null; } else { this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; } }
      if (this.frames) { this.t += dt; const u = this.frames[Math.floor(this.t * 8) % this.frames.length]; this.mat.map = tex(u); } else this.mat.map = tex(a.rot['south-east']);
      const w = this.pos.clone().add(OFF(0)); this.spr.position.set(w.x, .02, w.z); } };
} }
const drones = [];
for (let t = 0; t < 1; t++) for (let k = 0; k < 6; k++) {
  const g = new THREE.Group(); scene.add(g); box(.35, .08, .35, mats.dark, 0, 0, 0, g, false); for (const [x, z] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) box(.14, .02, .14, mats.metal, x, .08, z, g, false);
  const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .06), E(pick([0xf472b6, 0x67e8f9, 0x4ade80]))); l.position.y = -.05; g.add(l); if (k === 2) box(.2, .2, .2, M(0xd6a76c), 0, -.3, 0, g, false);
  drones.push({ g, l, t, ph: Math.random() * 6, r: rnd(1.5, 3), sp: rnd(.4, .9), c: new THREE.Vector3(rnd(5, W - 4), rnd(2.6, 4.2), rnd(5, 8)) });
}
const bots = [];
for (const T of TOWERS) for (let k = 0; k < 2; k++) {
  const g = new THREE.Group(); scene.add(g); const b = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, .16, 14), M(0xd4d4d8, { metalness: .4, roughness: .4 })); b.position.y = .1; g.add(b);
  const led = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, .12), E(k ? 0x4ade80 : 0x67e8f9)); led.position.y = .2; g.add(led); const [x, z] = free(T, 'l');
  bots.push({ g, led, T, pos: new THREE.Vector3(x, 0, z), path: [], next: 0 });
}

// ====================================================================== surprises inside the HQ
let glitchUntil = 0; const glitchFor = s => { glitchUntil = now() + s * 1000; };
const sparkPool = [];
function sparks(T, x, y, z) { for (let i = 0; i < 26; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .05), E(pick([0xfde047, 0xfb923c, 0xffffff]))); s.position.copy(new THREE.Vector3(x, y, z).add(OFF(T.t))); scene.add(s); sparkPool.push({ s, v: new THREE.Vector3(rnd(-2, 2), rnd(1, 3.5), rnd(-2, 2)), life: rnd(.5, 1.1), gr: 9 }); } Sound.zap(); }
function confetti(T) { for (let i = 0; i < 70; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .02), E(pick([0xf472b6, 0x67e8f9, 0xfacc15, 0x4ade80, 0xa78bfa]))); s.position.copy(new THREE.Vector3(rnd(1, W - 1), rnd(7, 10), rnd(1, D - 1)).add(OFF(T.t))); scene.add(s); sparkPool.push({ s, v: new THREE.Vector3(rnd(-.5, .5), rnd(-.5, .5), rnd(-.5, .5)), life: rnd(3, 5), gr: 1.2, spin: true }); } }
const Surprises = {
  outage() { Sound.power(); post.uniforms.dark.value = 1; for (const p of anim.pulse) p.l.visible = false; toast('⚡ Listrik padam di HQ!');
    const z = npcs['ZERO-1']; if (z && !isWork(z) && !z.moving()) { z.mode = 'busy'; z.running = true; z.say('Listrik padam! Aku cek panel!', 4000, 'alert'); z.goTo(TOWERS[0], 'l', 2.2, 2, () => { z.emote('frustrated', 2500); sparks(TOWERS[0], 1.2, 2.2, 1.2); setTimeout(() => { Surprises.restore(); z.say('Sudah normal lagi ✅', 4000); z.emote('celebrate', 2500); setTimeout(() => z.goDesk(), 3500); }, 3500); }); }
    else setTimeout(() => Surprises.restore(), 6000);
    Object.values(npcs).filter(n => n.name !== 'ZERO-1').slice(0, 5).forEach((n, i) => setTimeout(() => n.say(pick(['Eh, gelap!', 'Siapa matikan lampu?!', 'Untung sudah save…']), 3000, 'alert'), 400 + i * 300)); },
  restore() { post.uniforms.dark.value = 0; for (const p of anim.pulse) p.l.visible = true; Sound.zap(); glitchFor(.6); },
  glitch() { glitchFor(1.2); Sound.zap(); toast('▓ Glitch jaringan kota'); },
};
setInterval(() => { if (Q.has('noevents')) return; const r = Math.random(); if (r < .25) Surprises.glitch(); else if (r < .38) Surprises.outage(); }, 95000);

// ====================================================================== live data
let last = 0, first = true, cpuLoad = .2;
async function poll() {
  try { const st = await (await fetch(`/api/world?since=${last}`)).json(); last = st.last_event;
    for (const a of st.agents) npcs[a.name]?.setStatus(a);
    if (!first) for (const ev of st.events) { const n = npcs[ev.agent]; if (!n) continue;
      if (ev.kind === 'running') { n.say(ev.text, 3500, 'think'); n.pop('🧠'); }
      else if (ev.kind === 'done' || ev.kind === 'published') { n.say(ev.text, 7000); Sound.chime(); toastJob(ev, 'ok'); n.pop('✅'); if (n.mode !== 'work') { n.sitting = false; n.emote('celebrate'); }
        if (ev.handoff && npcs[ev.handoff] && ev.handoff !== ev.agent && n.mode !== 'work') deliver(n, npcs[ev.handoff]); }
      else if (ev.kind === 'failed') { n.say(ev.text, 8000, 'alert'); Sound.error(); glitchFor(.5); toastJob(ev, 'err'); if (n.mode !== 'work') { n.sitting = false; n.emote('frustrated', 4200); } } }
    first = false; const sys = st.system || {}, g = sys.gpu;
    const hs = document.querySelector('#hud .sys'); if (hs) hs.textContent = `CPU ${sys.cpu ?? '-'}% · RAM ${sys.ram_used_gb ?? '-'}/${sys.ram_total_gb ?? '-'} GB${g ? ` · GPU ${g.util}% · ${g.temp}°C` : ''}`;
    const ha = document.querySelector('#hud .ai'); if (ha) ha.textContent = `🧠 ${st.mode === 'demo' ? 'demo AI' : st.ai.model}${st.ai.busy ? ' · berpikir…' : ''}`;
    cpuLoad = (sys.cpu ?? 20) / 100;
  } catch (e) { /* offline */ }
}
function toastJob(ev, kind) { const bx = document.getElementById('toasts'), m = META[ev.agent] || {}; if (!bx) return; const t = el(`toast ${kind}`, `<i style="background:${m.color}"></i><div><b>${esc(ev.agent)}</b><span>${esc(ev.text)}</span></div>`, bx); setTimeout(() => t.classList.add('out'), 8000); setTimeout(() => t.remove(), 8800); }
function deliver(from, to) { from.mode = 'busy'; from.carry.classList.remove('hidden'); const s = to.seat; from.goTo(to.home, s.lv, Math.min(W - .6, s.x + 1), Math.min(D - .6, s.z + 1), () => {
  from.say(`${to.name}, ini hasilnya. Lanjut ya!`, 4000); from.emote('talk', 3500, 'north-west'); setTimeout(() => to.say(pick(['Siap, aku proses!', 'Oke, langsung aku cek.', 'Mantap!']), 3500), 2200);
  setTimeout(() => { from.carry.classList.add('hidden'); from.goDesk(); }, 4500); }); }

// ====================================================================== click → rooms / NPC cards
const ray = new THREE.Raycaster();
const inRect = (r, p) => p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3];
function onClick(e) {
  const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
  for (const n of Object.values(npcs)) if (ray.intersectObject(n.spr).length) { Sound.blip(); return openNPC(n); }
  if (cat && ray.intersectObject(cat.spr).length) { cat.say(pick(['Meow~', 'Prrr 💜', 'Meow? (minta snack)'])); return; }
  for (const T of TOWERS) for (const lv of ['u', 'l']) { const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(lv === 'u' ? H : 0)), new THREE.Vector3()); if (!hit) continue;
    const p = hit.sub(OFF(T.t)); if (p.x > 0 && p.z > 0 && p.x < W && p.z < D && (lv === 'l' || T.up(p.x, p.z))) { const room = T.rooms.find(q => q.lv === lv && inRect(q.r, p)); if (room) { Sound.blip(); return openRoom(room); } } }
}
function openRoom(room) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', room.c); p.querySelector('.ptitle').innerHTML = `<b>${room.name}</b><span>${room.agent || 'Tempat santai semua agen'}</span>`; p.querySelector('.ptabs').innerHTML = '';
  const f = p.querySelector('iframe'), info = p.querySelector('.pbody-info');
  if (room.url) { f.style.display = ''; info.style.display = 'none'; f.src = room.url; } else { f.style.display = 'none'; info.style.display = ''; info.innerHTML = `<h3>Status agen</h3><ul class="hist">${Object.values(npcs).map(n => `<li><b>${n.name}</b> — ${n.sitting ? 'di mejanya' : n.inChat ? 'ngobrol' : Phase.cur && n.mode === 'busy' ? Phase.cur : 'jalan-jalan'}</li>`).join('')}</ul><p class="muted">E = kejadian langit · R = rapat/acara kantor · O = uji listrik padam · M = suara · 1/2/3 = fokus menara · Home = semua.</p>`; } }
function openNPC(n) { const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color); p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)}</span>`; p.querySelector('.ptabs').innerHTML = ''; p.querySelector('iframe').style.display = 'none'; const i = p.querySelector('.pbody-info'); i.style.display = '';
  i.innerHTML = `<div class="npc-card"><img src="${n.a.rot?.south || ''}"><div><p>${esc(n.meta.desc)}</p><p>Status: <b class="st ${n.server.status}">${n.server.status}</b> ${n.server.current ? '· ' + esc(n.server.current) : ''}</p></div></div><h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li>${esc(h)}</li>`).join('') || '<li class="muted">belum ada</li>'}</ul>`; }
function closePanel() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; }
document.querySelector('#panel .pclose').onclick = closePanel; document.getElementById('panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });

// ====================================================================== room labels
const labels = []; for (const T of TOWERS) for (const r of T.rooms) { const d = el('room-label', `<span>${r.name}</span>`); d.style.setProperty('--accent', r.c); d.onclick = () => openRoom(r);
  labels.push({ d, v: new THREE.Vector3((r.r[0] + r.r[2]) / 2, (r.lv === 'u' ? 2 * H - .5 : 3.6), (r.r[1] + r.r[3]) / 2).add(OFF(T.t)) }); }

// ====================================================================== boot + main loop
for (const T of TOWERS) for (const name of Object.keys(T.seats)) if (ASSETS.npc[name]) npcs[name] = new NPC(name, T);
window.hq3d = { npcs, TOWERS, cat, SkyEvents, Surprises, Phase };
poll(); setInterval(poll, 3000); setInterval(() => { Object.values(npcs).forEach(n => n.life()); Phase.tick(); }, 1000);
function drawMini(s, tt) {
  const c = s.t.userData.c, g = c.getContext('2d'), w = c.width, h = c.height; g.fillStyle = s.col;
  if (s.mini === 'code') { g.drawImage(c, 0, -2); g.fillStyle = '#06101c'; g.fillRect(0, h - 2, w, 2); g.fillStyle = s.col; g.fillRect(1 + (Math.random() * 3 | 0) * 2, h - 2, rnd(3, w - 4), 1); }
  else if (s.mini === 'graph') { s.hist.push(Math.max(1, Math.min(h - 2, (s.hist.at(-1) ?? h / 2) + rnd(-3, 3)))); if (s.hist.length > w) s.hist.shift(); g.fillStyle = '#06101c'; g.fillRect(0, 0, w, h); g.strokeStyle = s.col; g.beginPath(); s.hist.forEach((v, i) => i ? g.lineTo(i, v) : g.moveTo(i, v)); g.stroke(); }
  else if (s.mini === 'radar') { g.fillStyle = 'rgba(6,16,28,.5)'; g.fillRect(0, 0, w, h); g.strokeStyle = s.col; g.beginPath(); g.arc(w / 2, h / 2, h / 2 - 1, 0, 7); g.stroke(); const a = tt * 3 + s.ph; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * h / 2, h / 2 + Math.sin(a) * h / 2); g.stroke(); if (Math.random() < .3) g.fillRect(rnd(4, w - 4), rnd(3, h - 3), 1, 1); }
  else if (s.mini === 'bars') { g.fillStyle = '#06101c'; g.fillRect(0, 0, w, h); g.fillStyle = s.col; for (let x = 1; x < w - 1; x += 3) { const v = Math.abs(Math.sin(tt * 2 + x * .7 + s.ph)) * (h - 3) + 1; g.fillRect(x, h - v, 2, v); } }
  else { g.fillStyle = '#06101c'; g.fillRect(0, 0, w, h); g.strokeStyle = s.col; g.beginPath(); for (let x = 0; x < w; x++) g.lineTo(x, h / 2 + Math.sin(x * .6 + tt * 6 + s.ph) * Math.sin(tt + s.ph) * (h / 2 - 2)); g.stroke(); }
  s.t.needsUpdate = true;
}
const clock = new THREE.Clock(); let ct = 0, ft = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(.1, clock.getDelta()), tt = now() / 1000; ct += dt; ft += dt;
  if (ct > .1) { drawCity(ct); Backdrop.draw(tt, ct); ct = 0; }
  SkyEvents.update(dt);
  if (ft > .18) { ft = 0;
    for (const s of anim.screens) { if (s.mini) { if (Math.random() < .55) drawMini(s, tt); continue; } const c = s.t.userData.c, g = c.getContext('2d'), w = c.width, h = c.height, busy = s.wall || !s.owner || isWork(npcs[s.owner] || { server: {} });
      if (!busy && Math.random() < .7) continue; g.drawImage(c, 0, -3); g.fillStyle = s.wall ? '#071226' : '#2a6ea0'; g.fillRect(0, h - 3, w, 3);
      if (Math.random() < .85) { g.fillStyle = pick(['#e0f7ff', '#a5f3fc', '#c4b5fd', '#bbf7d0', '#fde68a', '#f9a8d4']); g.fillRect(2 + Math.floor(rnd(0, 4)) * 2, h - 3, rnd(4, w - 6), 2); }
      if (s.wall && Math.random() < .05) { g.fillStyle = '#071226'; g.fillRect(0, 0, w, h); g.strokeStyle = pick(['#67e8f9', '#f472b6', '#4ade80']); g.beginPath(); g.moveTo(2, h - 4); for (let i = 0; i < 8; i++) g.lineTo(4 + i * (w / 8), h - 4 - Math.random() * (h - 8)); g.stroke(); }
      s.t.needsUpdate = true; }
    for (const l of anim.leds) l.visible = Math.random() > .12 + (1 - cpuLoad) * .2; }
  for (const s of anim.spin) s.rotation.y += dt * (s.userData.fast ? 3 : .8);
  for (const p of anim.pulse) { const busy = p.owner && npcs[p.owner] && isWork(npcs[p.owner]);
    p.l.intensity = p.screen ? p.base * (busy ? .9 + Math.random() * .5 : .55) : p.base * (.85 + .15 * Math.sin(tt * 1.3 + p.ph)) * (Math.random() < .004 ? .3 : 1); }
  for (const n of anim.neon) { if (n.mat) n.mat.color.copy(n.base).multiplyScalar(.85 + .15 * Math.sin(tt * 2.1) + (Math.random() < .01 ? -.5 : 0)); else if (n.m) n.m.material.opacity = Math.random() < .02 ? .2 : .95; }
  for (const s of anim.steam) { s.t += dt; const k = (s.t % 2.4) / 2.4; s.sp.position.set(s.x + Math.sin(s.t * 3) * .04, s.y + k * .6, s.z); s.sp.material.opacity = .5 * (1 - k); s.sp.scale.setScalar(.08 + k * .18); }
  for (const h of anim.holo) { h.scale.setScalar(1 + .06 * Math.sin(tt * 4)); h.visible = Math.random() > .02; }
  for (const p of anim.portals) { p.disc.rotation.z -= dt * 2.5; p.fx = Math.max(0, p.fx - dt * 1.5); p.ring.scale.setScalar(1 + .04 * Math.sin(tt * 3) + p.fx * .35); p.l.intensity = 6 + 4 * Math.sin(tt * 3) + p.fx * 30; p.disc.material.opacity = .75 + p.fx * .25; }
  for (const d of drones) { d.ph += dt * d.sp; d.g.position.copy(d.c).add(new THREE.Vector3(Math.cos(d.ph) * d.r, Math.sin(d.ph * 2) * .3, Math.sin(d.ph) * d.r)).add(OFF(d.t)); d.l.visible = Math.sin(tt * 8 + d.ph) > 0; }
  for (const b of anim.blink) b.m.visible = Math.sin(tt * 2.5 + b.ph) > .3;
  for (let i = 0; i < anim.bulbs.length; i += 7) anim.bulbs[i].visible = Math.random() > .01;
  for (const b of bots) { if (!b.path.length && now() > b.next) { const [x, z] = free(b.T, 'l'); b.path = astar(b.T, 'l', b.pos.x, b.pos.z, x, z); b.next = now() + rnd(2000, 6000); }
    if (b.path.length) { const [px, pz] = b.path[0], dx = px - b.pos.x, dz = pz - b.pos.z, d = Math.hypot(dx, dz), sp = .9 * dt; if (d <= sp) { b.pos.x = px; b.pos.z = pz; b.path.shift(); } else { b.pos.x += dx / d * sp; b.pos.z += dz / d * sp; } }
    b.g.position.copy(b.pos).add(OFF(b.T.t)); b.led.visible = Math.sin(tt * 6) > -.3; }
  for (let i = sparkPool.length - 1; i >= 0; i--) { const p = sparkPool[i]; p.v.y -= p.gr * dt; p.s.position.addScaledVector(p.v, dt); if (p.spin) { p.s.rotation.x += dt * 6; p.s.rotation.y += dt * 4; } p.life -= dt; if (p.life <= 0) { scene.remove(p.s); sparkPool.splice(i, 1); } }
  for (const n of Object.values(npcs)) n.update(dt); cat?.update(dt);
  post.uniforms.time.value = tt; post.uniforms.glitch.value = now() < glitchUntil ? .6 + Math.random() * .4 : 0; post.uniforms.alarm.value = Object.values(npcs).some(n => n.server.status === 'error') ? .25 : 0;
  flashA *= .9; renderer.toneMappingExposure = 1.65 + flashA * 2; light = Math.max(0, light - dt * 3) * (Math.random() < .15 ? .3 : 1); post.uniforms.light.value = light;
  const ct2 = SkyEvents.ev && SkyEvents.ev.kind !== 'meteors' ? 1 : 0; if (Math.abs(ct2 - cineK) > .001) { cineK += (ct2 - cineK) * Math.min(1, dt * 1.2); setView(); }
  shake *= .9; const j = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), 0).multiplyScalar(shake * .25).add(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(CINE_UP * cineK)); cam.position.add(j);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam); cam.position.sub(j);
  const k = Math.min(1.5, Math.max(.8, zoom * 1.15));
  for (const n of Object.values(npcs)) { const top = n.spr.position.clone(); top.y += SIZE * .95; const [x, y] = project(top), [, fy] = project(n.spr.position);
    n.tag.style.transform = `translate(${x}px, ${fy + 4}px) translate(-50%,0) scale(${k})`; n.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%) scale(${k})`;
    n.icon.style.transform = `translate(${x}px, ${y - 4}px) translate(-50%,-100%)`; n.carry.style.transform = `translate(${x + 12}px, ${y + 10}px)`; n.tag.style.display = zoom < .5 ? 'none' : ''; }
  if (cat) { const v = cat.spr.position.clone(); v.y += 1.2; const [x, y] = project(v); cat.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%)`; }
  for (const l of labels) { const [x, y] = project(l.v); l.d.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%) scale(${k})`; }
});
