// NEONLOOM HQ - HD-2D city: 3 towers (different layouts) joined by portals, 10 PixelLab NPCs, office phases, robots, VFX, synth SFX, 3D voxel sky events.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search);
const ASSETS = window.ASSETS || { npc: {}, pets: {} };
const META = Object.fromEntries((window.AGENTS_META || []).map(a => [a.name, a]));
const W = 12, D = 10, H = 5.4, MEZZ = 4.4, S = 12.2;
const OFF = t => new THREE.Vector3(S * t, 0, -S * t);
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], now = () => performance.now();
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const RT = new THREE.Vector3(1, 0, -1).normalize(), BK = new THREE.Vector3(-1, 0, -1).normalize();
const C0 = OFF(1).add(new THREE.Vector3(W / 2, 0, D / 2));
const at = (u, d, y) => C0.clone().addScaledVector(RT, u).addScaledVector(BK, d).setY(y);

// ====================================================================== renderer + post (sharp: light grade, outline, subtle scanlines, glitch only on events)
const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
const scene = new THREE.Scene();
const HOMEZOOM = .86;
let PIX = Q.has('pix') ? +Q.get('pix') : 1, zoom = HOMEZOOM, rt, shake = 0;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -400, 600);
const camTarget = C0.clone().setY(H * .9);
const camDir = new THREE.Vector3(30, 25, 30); cam.position.copy(camTarget).add(camDir); cam.lookAt(camTarget);
const post = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, time: { value: 0 }, glitch: { value: 0 }, dark: { value: 0 }, alarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float time, glitch, dark, alarm; varying vec2 vUv;
    float h(float n){ return fract(sin(n) * 43758.5453); }
    float dep(vec2 uv){ return texture2D(tDepth, uv).r; }
    void main(){
      vec2 uv = vUv;
      float band = floor(uv.y * 40.); if (glitch > 0. && h(band + floor(time * 20.)) < glitch * .5) uv.x += (h(band * 3.1 + time) - .5) * .05 * glitch;
      float ca = glitch * .006;
      vec3 c = vec3(texture2D(tColor, uv + vec2(ca, 0.)).r, texture2D(tColor, uv).g, texture2D(tColor, uv - vec2(ca, 0.)).b);
      float L = dot(c, vec3(.299,.587,.114)); c = mix(c, vec3(L), .12); c = c * vec3(.97,.95,1.04) + vec3(.03,.025,.06);
      vec2 px = 1. / res; float d0 = dep(uv), e = max(max(abs(dep(uv + vec2(px.x,0.)) - d0), abs(dep(uv - vec2(px.x,0.)) - d0)), max(abs(dep(uv + vec2(0.,px.y)) - d0), abs(dep(uv - vec2(0.,px.y)) - d0)));
      if (e > .0015 && d0 < .9999) c = mix(c, vec3(.035,.03,.08), .55);
      c *= .985 + .015 * sin(uv.y * res.y * 1.5708);
      c *= 1. - .35 * dark; c = mix(c, c * vec3(1.5,.45,.5), alarm * (.5 + .5 * sin(time * 8.)));
      vec2 v = vUv - .5; c *= 1. - dot(v, v) * .3;
      gl_FragColor = vec4(c, 1.);
    }`,
});
const postScene = new THREE.Scene(), postCam = new THREE.Camera(); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const sky = document.createElement('canvas'); sky.width = 320; sky.height = 180; const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
function resize() {
  const w = host.clientWidth, h = host.clientHeight, lw = Math.round(w / PIX), lh = Math.round(h / PIX);
  renderer.setPixelRatio(1); renderer.setSize(lw, lh, false);
  rt?.dispose(); rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(lw, lh) });
  rt.texture.colorSpace = THREE.SRGBColorSpace; post.uniforms.tColor.value = rt.texture; post.uniforms.tDepth.value = rt.depthTexture; post.uniforms.res.value.set(lw, lh);
  setView();
}
let cineK = 0; const CINE_Z = .68, CINE_UP = 5;
function setView() { const a = host.clientWidth / host.clientHeight, view = 12.2 / (zoom * (1 - (1 - CINE_Z) * cineK)); cam.left = -view * a; cam.right = view * a; cam.top = view; cam.bottom = -view; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'p') { PIX = PIX === 1 ? 2 : 1; resize(); } if (k === 'escape') closePanel(); if (k === 'm') Sound.toggle(); if (k === 'e') SkyEvents.start(); if (k === 'o') Surprises.outage(); if (k === 'r') Phase.start();
  if (e.key === 'Home') { zoom = HOMEZOOM; cam.position.copy(camTarget).add(camDir); resize(); } if (['1', '2', '3'].includes(e.key)) focusTower(+e.key - 1);
});
function focusTower(t) { zoom = 1.8; cam.position.copy(OFF(t)).add(new THREE.Vector3(W / 2, H, D / 2)).add(camDir); resize(); }
host.addEventListener('wheel', e => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? .9 : 1.1), .45, 5); resize(); });
let drag = null;
host.addEventListener('pointerdown', e => { Sound.unlock(); drag = { x: e.clientX, y: e.clientY, moved: false, p: cam.position.clone() }; });
addEventListener('pointerup', e => { if (drag && !drag.moved) onClick(e); drag = null; });
addEventListener('pointermove', e => {
  if (!drag || !(e.buttons & 1)) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
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
    const n = noise(4), ng = ctx.createGain(), nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500; ng.gain.value = .012; n.connect(nf); nf.connect(ng); ng.connect(master); n.loop = true; n.start();
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
    power: () => tone(320, 1.2, 'sawtooth', .12, .15), party: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .2, 'square', .06), i * 90)),
  };
})();
let flashA = 0; const flash = a => { flashA = Math.max(flashA, a); };

// ====================================================================== materials / helpers
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o });
const E = c => new THREE.MeshBasicMaterial({ color: c });
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.userData.c = c; return t; }
function tile(base, line) { return ctex(64, 64, g => { g.fillStyle = base; g.fillRect(0, 0, 64, 64); g.strokeStyle = line; for (let k = 0; k <= 64; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.moveTo(0, k); g.lineTo(64, k); g.stroke(); } g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(2, 2, 14, 14); }); }
const floorTex = tile('#8f97c4', '#6f77a8'); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 5);
const wallTex = ctex(32, 64, g => { g.fillStyle = '#6b6aa6'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#5d5c98'; for (let y = 6; y < 64; y += 14) g.fillRect(2, y, 28, 10); g.fillStyle = '#7a79b6'; for (let y = 6; y < 64; y += 14) g.fillRect(2, y, 28, 1); }); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(4, 1);
const rackTex = ctex(32, 96, g => { g.fillStyle = '#14132a'; g.fillRect(0, 0, 32, 96); for (let y = 4; y < 92; y += 8) { g.fillStyle = '#23224a'; g.fillRect(2, y, 28, 6); g.fillStyle = '#0a0918'; for (let x = 4; x < 22; x += 3) g.fillRect(x, y + 2, 1, 2); } });
const MT = (map, c = 0xffffff) => new THREE.MeshStandardMaterial({ map, color: c, roughness: .6, metalness: .15 });
const mats = {
  wallL: MT(wallTex), wallR: MT(wallTex, 0xdde2ff), floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: .3, metalness: .25 }), slab: M(0x1c1b3c), frame: M(0x232248), trim: M(0x121126),
  desk: M(0x55528e), deskTop: M(0x7a76b4), metal: M(0x7c86a6, { metalness: .5, roughness: .4 }), dark: M(0x161530),
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
scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x5a4a90, 2.4));
const key = new THREE.DirectionalLight(0xb9c6ff, .8); key.position.set(S + 16, 28, -S + 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -32, right: 32, top: 26, bottom: -26, far: 120 }); key.target.position.copy(C0); scene.add(key, key.target);
const anim = { pulse: [], neon: [], steam: [], screens: [], leds: [], spin: [], holo: [], portals: [] };

// ====================================================================== window city (shared animated texture)
const city = ctex(256, 128, () => {}); const traffic = [];
function drawCity(dt) {
  const g = city.userData.c.getContext('2d'); const sk = g.createLinearGradient(0, 0, 0, 128); sk.addColorStop(0, '#0a0820'); sk.addColorStop(1, '#2b1d5a'); g.fillStyle = sk; g.fillRect(0, 0, 256, 128);
  let s = 3; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (const [col, lit, base] of [['#1d1c46', .18, 50], ['#121132', .3, 20]]) for (let x = 0; x < 256;) { const bw = 8 + R() * 18, bh = base + R() * 80; g.fillStyle = col; g.fillRect(x, 128 - bh, bw, bh);
    for (let wy = 128 - bh + 3; wy < 126; wy += 4) for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (R() < lit) { g.fillStyle = ['#fde68a', '#67e8f9', '#f9a8d4'][Math.floor(R() * 3)]; g.fillRect(wx, wy, 1, 2); } x += bw + 1; }
  g.fillStyle = 'rgba(244,114,182,.8)'; g.fillRect(40, 30, 22, 6); g.fillStyle = 'rgba(103,232,249,.8)'; g.fillRect(180, 22, 18, 8);
  if (traffic.length < 8 && Math.random() < .09) traffic.push({ x: Math.random() < .5 ? -12 : 268, y: rnd(14, 90), v: rnd(15, 40) * (Math.random() < .5 ? 1 : -1), c: pick(['#f472b6', '#22d3ee', '#facc15', '#a78bfa']) });
  for (const k of traffic) { k.x += k.v * dt; g.fillStyle = '#0b0b18'; g.fillRect(k.x, k.y, 9, 3); g.fillStyle = k.c; g.fillRect(k.x, k.y + 3, 9, 1); g.fillStyle = '#fff3b0'; g.fillRect(k.v > 0 ? k.x + 8 : k.x, k.y + 1, 1, 1); }
  for (let i = traffic.length - 1; i >= 0; i--) if (traffic[i].x < -20 || traffic[i].x > 280) traffic.splice(i, 1);
  g.strokeStyle = 'rgba(190,210,255,.25)'; for (let i = 0; i < 30; i++) { const x = Math.random() * 256, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 6); g.stroke(); }
  city.needsUpdate = true;
}
const cityMat = new THREE.MeshBasicMaterial({ map: city });
const stars = Array.from({ length: 110 }, () => [Math.random(), Math.random() * .7, Math.random()]);
function drawSky() {
  const g = sky.getContext('2d'), w = sky.width, h = sky.height, t = now() / 1000; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#070616'); gr.addColorStop(.6, '#161340'); gr.addColorStop(1, '#3a1d5e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (const [x, y, p] of stars) { g.fillStyle = `rgba(255,255,255,${.3 + .5 * Math.abs(Math.sin(t + p * 9))})`; g.fillRect(x * w, y * h, 1, 1); }
  g.fillStyle = 'rgba(245,243,255,.12)'; g.beginPath(); g.arc(w * .9, h * .12, 16, 0, 7); g.fill(); g.fillStyle = '#f5f3ff'; g.beginPath(); g.arc(w * .9, h * .12, 7, 0, 7); g.fill();
  skyTex.needsUpdate = true;
}

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
  const l = new THREE.PointLight(0xbfe9ff, 3, 3, 1.5); l.position.set(-.1, 1.3, 0); g.add(l); anim.pulse.push({ l, base: 3, ph: Math.random() * 6, owner, screen: true });
}
function chair(x, y, z, ry, c) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; CUR.add(g); const cm = M(c);
  box(.55, .1, .55, cm, 0, .45, 0, g); box(.12, .95, .55, cm, .25, .5, 0, g); box(.12, .22, .32, cm, .25, 1.45, 0, g); box(.4, .05, .06, mats.dark, 0, .7, .3, g); box(.4, .05, .06, mats.dark, 0, .7, -.3, g); box(.06, .4, .06, mats.metal, 0, .05, 0, g); }
function rack(x, z, y = 0) { const g = new THREE.Group(); g.position.set(x, y, z); CUR.add(g); box(.85, 2.6, .85, mats.dark, 0, 0, 0, g); const fp = new THREE.Mesh(new THREE.PlaneGeometry(.8, 2.5), new THREE.MeshBasicMaterial({ map: rackTex })); fp.position.set(0, 1.3, .43); g.add(fp);
  for (let r = 0; r < 12; r++) for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, .02), E(pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6, 0xfacc15]))); l.position.set(-.3 + k * .08, .24 + r * .2, .44); g.add(l); anim.leds.push(l); } }
function wallScreen(y, z, w, h, side = 'L', x = 0) { const t = ctex(48, 28, g => { g.fillStyle = '#071226'; g.fillRect(0, 0, 48, 28); });
  if (side === 'L') { plane(w, h, t, .06, y, z, Math.PI / 2); box(.05, h + .1, w + .1, mats.dark, .02, y - h / 2 - .05, z, CUR, false); } else { plane(w, h, t, x, y, .06, 0); box(w + .1, h + .1, .05, mats.dark, x, y - h / 2 - .05, .02, CUR, false); }
  anim.screens.push({ t, wall: true }); }
function poster(y, z, w, h) { const cols = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#4ade80']; const t = ctex(12, 16, g => { g.fillStyle = '#1e1b4b'; g.fillRect(0, 0, 12, 16); g.fillStyle = pick(cols); g.fillRect(2, 2, 8, 8); g.fillStyle = pick(cols); g.fillRect(2, 11, 8, 2); }); plane(w, h, t, .07, y, z, Math.PI / 2); }
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
  const glowEdge = E([0x67e8f9, 0xf472b6, 0x4ade80][t]); anim.neon.push({ mat: glowEdge, base: glowEdge.color.clone() });
  for (const [w, d, x, z] of rails) box(w, .06, d, glowEdge, x, H - .5, z, CUR, false);
  for (const alongX of [true, false]) {
    const len = alongX ? W : D, mat = alongX ? mats.wallR : mats.wallL, B = (w, h, x, y) => alongX ? box(w, h, T, mat, x, y, -T / 2) : box(T, h, w, mat, -T / 2, y, x);
    for (let lv = 0; lv < 2; lv++) { const y0 = lv * H, top = y0 + H;
      const cp = new THREE.Mesh(new THREE.PlaneGeometry(len, H), cityMat); if (alongX) cp.position.set(len / 2, y0 + H / 2, -.25); else { cp.rotation.y = Math.PI / 2; cp.position.set(-.25, y0 + H / 2, len / 2); } CUR.add(cp);
      if (!alongX) { B(len, 1.4, len / 2, y0); B(len, 1.6, len / 2, top - 1.6); for (let k = 0; k <= len; k += 3.3) B(.4, H - 3, Math.min(len - .2, k + .2), y0 + 1.4); }
      else { B(len, .5, len / 2, y0); B(len, .5, len / 2, top - .5); for (let k = 0; k <= len; k += 2) B(.14, H - 1, Math.min(len - .07, k + .07), y0 + .5); B(len, .1, len / 2, y0 + H * .5); }
      const nm = new THREE.MeshBasicMaterial({ color: [[0x67e8f9, 0xc084fc], [0xf472b6, 0x67e8f9], [0xc084fc, 0x4ade80]][t][alongX ? 0 : 1] }); anim.neon.push({ mat: nm, base: nm.color.clone() });
      if (alongX) box(len - .4, .1, .1, nm, len / 2, top - .7, .08, CUR, false); else box(.1, .1, len - .4, nm, .08, top - .7, len / 2, CUR, false);
    }
  }
  box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, W + T / 2, -.6, -T / 2); box(T, 2 * H + .6, T, mats.frame, -T / 2, -.6, D + T / 2);
  box(W + 2 * T, .5, T, mats.frame, W / 2, 2 * H, -T / 2); box(T, .5, D + 2 * T, mats.frame, -T / 2, 2 * H, D / 2);
  // roof sign
  const name = ['NEON//OPS', 'NEON//MAKE', 'NEON//GROW'][t], col = ['#67e8f9', '#f472b6', '#4ade80'][t];
  const rs = ctex(96, 20, g => { g.font = 'bold 15px monospace'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6; g.fillText(name, 4, 15); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rs, transparent: true })); sp.scale.set(6, 1.25, 1); sp.position.set(2, 2 * H + 1.4, 2); CUR.add(sp); anim.neon.push({ m: sp, sign: true });
  for (const [x, y, z, c, i] of [[3, H - .6, 2, 0x67e8f9, 30], [8, H - .6, 2, 0xc084fc, 26], [3, 2 * H - .6, 2, 0x67e8f9, 30], [8, 2 * H - .6, 2, 0xc084fc, 26], [8, H - 1, 7, 0x67e8f9, 24], [3, H - 1, 8, 0xa78bfa, 20]]) {
    const l = new THREE.PointLight(new THREE.Color(c).lerp(new THREE.Color(0xd8dcff), .55), i * .8, 11, 1.5); l.position.set(x, y, z); CUR.add(l); anim.pulse.push({ l, base: l.intensity, ph: Math.random() * 6 });
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

// ---------------------------------------------------------------- TOWER 1 (L-mezzanine): Command Deck / Research Lab / Server Room / Archive
{ const T = newTower(0, 'L'), U = H; TOWERS.push(T);
  wallScreen(U + 3.4, 1.6, 1.6, .9); wallScreen(U + 3.4, 3.5, 1.6, .9); wallScreen(U + 3.4, 5.6, 1.4, .8); for (let k = 0; k < 6; k++) poster(U + 1.9 + (k % 2) * .8, 5.2 + k * .55, .42, .55);
  neonSign('KAI//OPS', U + 2.4, 1.6, '#67e8f9'); hangingPlant(.4, U + 3.9, 4.6); hangingPlant(.4, U + 3.9, 9.4);
  painted('vending', .75, U, 9.3, 2.3); T.block('u', 0, 8.5, 1.1, 9.9); holo(2.2, U, 6.9); T.block('u', 1.4, 6.1, 3, 7.7);
  painted('bean_blue', 1.9, U, 9.1, .95); painted('bean_purple', 3.1, U, 9.3, .95); T.block('u', 1.4, 8.6, 3.6, 9.8);
  T.desk('u', 'L', 'KAI-07'); T.desk('u', 'R', 'RAZE-11'); T.desk('u', 'R2'); painted('plant_big', .45, U, .5, 1.3); T.block('u', .1, .1, .8, .9); painted('papers', 3.7, U, 2.3, .6);
  for (let k = 0; k < 4; k++) rack(.5, .6 + k * .95); rack(1.5, .5); rack(2.45, .5); T.block('l', 0, .1, 1, 4.1); T.block('l', 1, 0, 2.9, 1);
  box(.65, .32, .32, M(0xb91c1c), .6, 0, 5.2); T.block('l', .2, 4.9, 1.1, 5.5); cableLine([[1, 1.6], [1.6, 2.6], [2.2, 3.4], [2.4, 4.6], [3.2, 5.4]], 0); cableLine([[2.2, 1.1], [2.6, 2], [3.6, 2.4]], 0);
  wallScreen(3.6, 7.2, 1.2, .7); neonSign('SERVER', 3.3, 3.6, '#fb923c');
  painted('fridge', 3.85, 0, .65, 2.1); painted('water', 4.7, 0, .55, 1.45); T.block('l', 3.2, 0, 4.9, 1); steam(4.7, 1.5, .6);
  painted('cabinet', 6.2, 0, .6, 1.7); painted('cabinet', 6.95, 0, .6, 1.7); T.block('l', 5.7, 0, 7.4, .9);
  T.desk('l', 'R', 'SABLE-6'); painted('cabinet', 10.2, 0, .65, 1.7); T.block('l', 9.7, 0, 10.6, .9);
  T.desk('l', 'L', 'ZERO-1', 2); painted('plant_big', .5, 0, 9.4, 1.3); T.block('l', .2, 9.1, .8, 9.7);
  for (const [z, ry] of [[4.6, -Math.PI / 2], [6.4, Math.PI / 2]]) for (const x of [6.6, 9.2]) { deskUnit(x, 0, z, ry, null, 2, 2.4); chair(x, 0, z === 4.6 ? 3.5 : 7.5, z === 4.6 ? Math.PI / 2 : -Math.PI / 2, pick([0x3730a3, 0x1e3a8a])); }
  T.block('l', 5.3, 4.05, 10.5, 6.95); painted('boxes', 3.4, 0, 3.4, .9); T.block('l', 3.1, 3.1, 3.7, 3.7); painted('trash', 3.1, 0, 5.8, .55);
  addLift(T); addPortal(T, 11, 8.6, 0x67e8f9);
  T.spots.meet = { pts: [[3.6, 6.9], [3.5, 5.4], [2.2, 5.4], [1, 5.5], [1, 8.1], [3.6, 8.1], [2.2, 8.3]], focus: [2.2, 6.9] };
  T.rooms = [{ name: 'COMMAND DECK', lv: 'u', r: [0, 0, 4.4, 10], agent: 'KAI-07', url: '/dashboard', c: '#22d3ee' }, { name: 'RESEARCH LAB', lv: 'u', r: [4.4, 0, 12, 4.4], agent: 'RAZE-11', url: '/research', c: '#4ade80' },
    { name: 'SERVER ROOM', lv: 'l', r: [0, 0, 4.8, 10], agent: 'ZERO-1', url: '/settings', c: '#fb923c' }, { name: 'ARCHIVE', lv: 'l', r: [4.8, 0, 12, 10], agent: 'SABLE-6', url: '/assets', c: '#d6a76c' }];
}
// ---------------------------------------------------------------- TOWER 2 (back balcony + double-height shop): Writers Studio / QA Bay / Shop Floor / Finance Vault
{ const T = newTower(1, 'back'), U = H; TOWERS.push(T);
  T.desk('u', 'L', 'JUNO-X9', 2); T.desk('u', 'R', 'VOLT-3'); painted('scanner', 9.4, U, .8, 1.8); T.block('u', 8.4, 0, 10.2, 1.4);
  painted('bookshelf', 3.6, U, .55, 2.2); T.block('u', 3, 0, 4.3, 1); painted('lamp', 2.3, U, .5, 1.8); T.block('u', 1.9, 0, 2.7, .9); painted('bean_purple', 8.6, U, 3.6, 1); T.block('u', 8, 3.1, 9.2, 4.2);
  for (let k = 0; k < 4; k++) poster(U + 2.6 + (k % 2) * .8, 1 + k * .7, .45, .6); neonSign('WRITE.EXE', U + 3.6, 6.8, '#c084fc'); neonSign('QA PASS ✓', U + 3.9, 0, '#facc15', 'R', 7);
  const hz = ctex(16, 4, g => { for (let i = 0; i < 16; i += 4) { g.fillStyle = '#facc15'; g.fillRect(i, 0, 2, 4); g.fillStyle = '#111'; g.fillRect(i + 2, 0, 2, 4); } }); hz.wrapS = THREE.RepeatWrapping; hz.repeat.set(6, 1);
  const hzm = new THREE.Mesh(new THREE.PlaneGeometry(5, .2), new THREE.MeshBasicMaterial({ map: hz })); hzm.rotation.x = -Math.PI / 2; hzm.position.set(7, U + .07, 3.6); CUR.add(hzm);
  for (let k = 0; k < 3; k++) wallScreen(H + 2.4, 5.6 + k * 1.5, 1.3, .8); hangingPlant(.4, 2 * H - 1, 8.6);
  painted('counter', 1.2, 0, 3, 1.6); T.block('l', 0, 1.8, 2.4, 4.2); painted('packing', 3.6, 0, 8.8, 1.5); T.block('l', 2.6, 8.2, 4.6, 9.6); painted('boxes', .7, 0, .8, 1); painted('boxes', 1.7, 0, .6, 1); T.block('l', .2, .2, 2.3, 1.2);
  neonSign('SHOP', 3, 6.4, '#f472b6'); wallScreen(3.4, 8.5, 1.3, .7);
  T.desk('l', 'L', 'NYX-21', 2); T.desk('l', 'R', 'KADE-12');
  painted('vault_door', 10.6, 0, .4, 2.2); painted('safe', 11, 0, 5, 1.3); painted('coins', 9.8, 0, 5.2, .7); T.block('l', 9.4, 4.4, W, 5.8); T.block('l', 9.6, 0, W, .9);
  painted('plant_big', 6.5, 0, .6, 1.3); T.block('l', 6.1, .2, 6.9, 1); holo(5.8, 0, 3.4, 1.4); T.block('l', 4.9, 2.5, 6.7, 4.3);
  for (const x of [5.6, 8.2]) { deskUnit(x, 0, 6.6, Math.PI / 2, null, 2, 2.4); chair(x, 0, 7.6, -Math.PI / 2, 0x4c1d95); } T.block('l', 4.3, 6, 9.5, 7.1);
  painted('whiteboard', 7.2, 0, 9.5, 2); T.block('l', 6.4, 9.1, 8, 9.9);
  addLift(T); addPortal(T, 11, 8.6, 0xf472b6);
  T.spots.board = { pts: [[6, 8.3], [7.2, 8.2], [8.4, 8.3], [9.6, 8.6], [5.2, 8.6]], focus: [7.2, 9.5] };
  T.rooms = [{ name: 'WRITERS STUDIO', lv: 'u', r: [0, 0, 4.4, 4.4], agent: 'JUNO-X9', url: '/listings', c: '#c084fc' }, { name: 'QA BAY', lv: 'u', r: [4.4, 0, 12, 4.4], agent: 'VOLT-3', url: '/approvals', c: '#facc15' },
    { name: 'SHOP FLOOR', lv: 'l', r: [0, 0, 4.8, 10], agent: 'NYX-21', url: '/approvals', c: '#f472b6' }, { name: 'FINANCE VAULT', lv: 'l', r: [4.8, 0, 12, 10], agent: 'KADE-12', url: '/accounting', c: '#fbbf24' }];
}
// ---------------------------------------------------------------- TOWER 3 (left-wing mezzanine + big lounge): Data Room / Growth Studio / Lounge & Pantry
{ const T = newTower(2, 'left'), U = H; TOWERS.push(T);
  T.desk('u', 'L', 'ORIN-88', 3); T.desk('u', 'L', 'HEX-04', 2, 7.4);
  wallScreen(U + 3.4, 1.6, 1.6, .9); wallScreen(U + 3.4, 3.5, 1.6, .9); for (let k = 0; k < 3; k++) wallScreen(U + 3.3, 0, 1.2, .7, 'R', 1 + k * 1.4); rack(3.6, .6, U); T.block('u', 3.1, .1, 4.2, 1.1);
  painted('ringlight', 3.2, U, 7.1, 1.9); painted('camera', 3.4, U, 5.8, 1.5); T.block('u', 2.6, 5.2, 4.2, 7.8); for (let k = 0; k < 4; k++) poster(U + 2.4 + (k % 2) * .8, 5.4 + k * .6, .45, .6);
  neonSign('GROWTH++', U + 3.6, 8.2, '#fb7185'); neonSign('DATA', U + 2.2, 5.2, '#60a5fa');
  painted('vending', .75, 0, .8, 2.3); painted('coffee', .7, 0, 2.3, 1.2); painted('water', .6, 0, 3.3, 1.4); painted('fridge', .75, 0, 4.4, 2.1); T.block('l', 0, 0, 1.2, 5); steam(.7, 1.3, 2.3);
  painted('snack_shelf', 2.4, 0, .5, 1.4); painted('arcade_blue', 4.3, 0, .8, 2.1); painted('arcade_pink', 5.6, 0, .8, 2.1); T.block('l', 1.6, 0, 6.4, 1.2);
  painted('couch', 3.2, 0, 5.4, 1.4); painted('coffee_table', 3.4, 0, 6.9, .8); T.block('l', 2, 4.6, 4.6, 7.6);
  painted('bean_teal', 6.4, 0, 6.6, 1); painted('bean_blue', 7.6, 0, 7.4, 1); painted('bean_purple', 9.4, 0, 8.4, 1); T.block('l', 5.8, 6, 8.3, 8.1); T.block('l', 8.8, 7.8, 10, 9);
  painted('pingpong', 8.4, 0, 4.4, 1.6); T.block('l', 7, 3.4, 9.8, 5.4); painted('plant_big', 10.8, 0, 9.4, 1.4); painted('lamp', .4, 0, 6.2, 1.9); T.block('l', 10.4, 9, W, 9.9);
  painted('side_table', 10.6, 0, .7, .9); painted('plant_big', 11.3, 0, .6, 1.3); T.block('l', 10, 0, W, 1.2);
  neonSign('LOUNGE', 3.5, 7, '#a78bfa'); neonSign('PLAY', 3.2, 0, '#f472b6', 'R', 5); wallScreen(3.4, 9, 1.2, .7); hangingPlant(.4, 3.9, 6); holo(10.6, 0, 2.6); T.block('l', 9.8, 1.8, 11.4, 3.4);
  const fan = new THREE.Group(); fan.position.set(7, 2 * H - .5, 6.5); CUR.add(fan); for (let k = 0; k < 4; k++) { const b = box(1.4, .03, .2, mats.dark, 0, 0, 0, fan, false); b.geometry.translate(.7, 0, 0); b.rotation.y = k * Math.PI / 2; } anim.spin.push(fan); fan.userData.fast = true;
  T.spots = { coffee: { lv: 'l', x: 1.9, z: 2.4, kind: 'snack' }, vend: { lv: 'l', x: 1.9, z: 1.6, kind: 'snack' }, arcade: { lv: 'l', x: 4.4, z: 1.9, kind: 'game' }, arcade2: { lv: 'l', x: 5.7, z: 1.9, kind: 'game' },
    couch: { lv: 'l', x: 3.4, z: 8, kind: 'rest' }, bean: { lv: 'l', x: 7, z: 8.6, kind: 'rest' }, ping: { lv: 'l', x: 8.4, z: 6, kind: 'game' }, dance: { lv: 'l', x: 6.5, z: 9.2, kind: 'dance' } };
  T.view = { x: 10.4, z: 7.4 };
  addLift(T, 3.5, 9, -1.35); addPortal(T, 11, 8, 0x4ade80);
  T.rooms = [{ name: 'DATA ROOM', lv: 'u', r: [0, 0, 4.4, 5], agent: 'ORIN-88', url: '/analytics', c: '#60a5fa' }, { name: 'GROWTH STUDIO', lv: 'u', r: [0, 5, 4.4, 10], agent: 'HEX-04', url: '/social', c: '#fb7185' },
    { name: 'LOUNGE · PANTRY', lv: 'l', r: [0, 0, 12, 10], agent: null, url: null, c: '#a78bfa' }];
}
CUR = scene;

// ====================================================================== background: 3D voxel city + flying cars
const winTex = ctex(16, 32, g => { g.fillStyle = '#000'; g.fillRect(0, 0, 16, 32); for (let y = 1; y < 32; y += 3) for (let x = 1; x < 16; x += 3) if (Math.random() < .2) { g.fillStyle = pick(['#fde68a', '#67e8f9', '#f9a8d4', '#c4b5fd']); g.fillRect(x, y, 1, 2); } });
winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
const bgMats = [0x15143a, 0x1b1846, 0x111033].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: .6, roughness: .9 }));
for (let i = 0; i < 170; i++) {
  const u = rnd(-60, 60), d = rnd(13, 50), h = rnd(6, 22), w = rnd(2.5, 6), p = at(u, d, -30 + h / 2);
  const geo = new THREE.BoxGeometry(w, h, w), uv = geo.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * w / 3, uv.getY(q) * h / 4); const m = new THREE.Mesh(geo, pick(bgMats)); m.position.copy(p); scene.add(m);
  if (Math.random() < .3) { const cap = new THREE.Mesh(new THREE.BoxGeometry(w * .8, .3, .3), E(pick([0xf472b6, 0x67e8f9, 0xa78bfa, 0xfacc15]))); cap.position.copy(p).setY(-30 + h + .2); scene.add(cap); anim.neon.push({ mat: cap.material, base: cap.material.color.clone() }); }
  if (Math.random() < .12) { const ant = new THREE.Mesh(new THREE.BoxGeometry(.2, 4, .2), mats.dark); ant.position.copy(p).setY(-30 + h + 2); scene.add(ant); const tip = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), E(0xff3355)); tip.position.copy(p).setY(-30 + h + 4.2); scene.add(tip); anim.holo.push(tip); }
}
const cars = [];
for (let i = 0; i < 18; i++) {
  const g = new THREE.Group(); const c = pick([0xf472b6, 0x22d3ee, 0xfacc15, 0xa78bfa]); box(1.2, .35, .55, M(0x1e1b4b), 0, 0, 0, g, false); box(1.2, .08, .58, E(c), 0, -.02, 0, g, false); box(.1, .15, .3, E(0xfff3b0), .62, .1, 0, g, false);
  scene.add(g); cars.push({ g, u: rnd(-60, 60), d: rnd(8, 30), y: rnd(-12, 9), v: rnd(4, 9) * (Math.random() < .5 ? 1 : -1) });
}

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
    g.scale.setScalar(2); g.rotation.y = Math.PI / 4; let lastStep = 0;
    return { g, dur: 30000, update(k, t) { const u = -46 + k * 92; g.position.copy(at(u, 30, -15 + Math.abs(Math.sin(t * 3)) * .4)); legs[0].rotation.z = Math.sin(t * 3) * .45; legs[1].rotation.z = -Math.sin(t * 3) * .45;
      const st = Math.floor(t * 3 / Math.PI); if (st !== lastStep) { lastStep = st; shake = Math.max(shake, .35); Sound.step(); }
      const fire = (k > .3 && k < .4) || (k > .78 && k < .86); beam.visible = fire; bl.intensity = fire ? 6 : 0; if (fire && !this.fired) { this.fired = 1; Sound.zap(); Sound.roar(); flash(.3); }
      for (const s of spikes) s.material.color.setHSL(.52, 1, .45 + .25 * Math.sin(t * 6)); } };
  }
  function mecha() {
    const r = robot(0xe5e7eb, 0x1d4ed8, 0xdc2626), g = r.g; const flames = [];
    for (const z of [-1.2, 1.2]) { const f = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .85 })); f.rotation.x = Math.PI; f.position.set(0, -1.6, z); g.add(f); flames.push(f); }
    const fl = new THREE.PointLight(0x67e8f9, 4, 30, 0); fl.position.set(0, -2, 0); g.add(fl); rim(g); g.scale.setScalar(1.8); g.rotation.y = -Math.PI / 4;
    return { g, dur: 22000, update(k, t) { g.position.copy(at(-42 + k * 84, 30, -11 + Math.sin(t * 1.5) * 1.2)); for (const f of flames) f.scale.y = .8 + Math.random() * .6; r.arms[0].rotation.z = Math.sin(t) * .3; if (k > .5 && k < .6) r.arms[1].rotation.z = -1.6; else r.arms[1].rotation.z = 0; } };
  }
  function transformer() {
    const g = new THREE.Group(), truck = new THREE.Group(); g.add(truck);
    box(8, 3, 2.6, M(0x334155), -2, .8, 0, truck, false); box(2.6, 3.2, 2.6, M(0xb91c1c), 3.4, .8, 0, truck, false); box(.1, 1.2, 2.2, E(0x93c5fd), 4.75, 2.4, 0, truck, false);
    for (const x of [-4.5, -1, 3.4]) for (const z of [-1.35, 1.35]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .4, 10), M(0x0f0f17)); w.rotation.x = Math.PI / 2; w.position.set(x, .8, z); truck.add(w); }
    box(.1, .4, .4, E(0xfde68a), 4.75, 1.2, -.9, truck, false); box(.1, .4, .4, E(0xfde68a), 4.75, 1.2, .9, truck, false);
    const r = robot(0xb91c1c, 0x1e40af, 0x94a3b8); r.g.scale.setScalar(.01); g.add(r.g); rim(g, 0xf472b6); g.rotation.y = Math.PI / 4;
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
    g.rotation.y = Math.PI / 4 + Math.PI;
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
  T.open('l', T.portal.x, T.portal.z);
}
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
const DIR = (dx, dz) => { const a = (Math.atan2(dz, dx) * 180 / Math.PI + 360) % 360; return ['south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east'][Math.round(a / 45) % 8]; };
const SIZE = 2.4, npcs = {};
const isWork = n => ['working', 'queued'].includes(n.server.status);
class NPC {
  constructor(name, T) {
    this.name = name; this.meta = META[name] || { name, color: '#fff', role: '', desc: '' }; this.a = ASSETS.npc[name] || {}; this.home = T; this.T = T; this.seat = T.seats[name];
    this.mat = new THREE.SpriteMaterial({ map: tex(this.a.rot?.south || ''), transparent: true, alphaTest: .4 }); this.spr = new THREE.Sprite(this.mat); this.spr.scale.set(SIZE, SIZE, 1); this.spr.center.set(.5, .1); scene.add(this.spr);
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
    this.spr.scale.set((this.flip ? -1 : 1) * SIZE * Math.max(.02, sc), SIZE * (sc < 1 ? 1 + (1 - sc) * .6 : 1), 1);
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
    const r = Math.random(), lounge = TOWERS[2], others = Object.values(npcs).filter(n => n !== this && !n.busy());
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
  start(kind) { if (this.cur) return; kind = kind || pick(['meeting', 'lunch', 'brainstorm', 'cheer', 'meeting']); const T0 = TOWERS[0], T1 = TOWERS[1], T2 = TOWERS[2];
    if (kind === 'meeting') gather('meeting', T0, 'u', T0.spots.meet.pts, T0.spots.meet.focus, '📋 Stand-up meeting di COMMAND DECK', 'Stand-up dimulai! Update cepat ya.', MEET, 'Oke, bubar! Semangat 👏');
    else if (kind === 'lunch') gather('lunch', T2, 'l', Object.values(T2.spots).map(s => [s.x, s.z]).concat([[5.2, 3.4], [9.8, 6.4]]), [5, 5], '🍜 Jam makan siang di LOUNGE', 'Makan siang dulu semua!', LUNCH, 'Kenyang! Balik kerja 💪');
    else if (kind === 'brainstorm') gather('brainstorm', T1, 'l', T1.spots.board.pts, T1.spots.board.focus, '💡 Brainstorm di papan tulis SHOP FLOOR', 'Brainstorm produk baru, lempar ide!', IDEAS, 'Ide bagus semua! Aku catat ✍️');
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
  cat = { pos: new THREE.Vector3(6, 0, 9), path: [], spr, mat, next: 0, t: 0, frames: null, bubble: el('bubble hidden', ''),
    say(t) { this.bubble.className = 'bubble chat'; this.bubble.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => this.bubble.classList.add('hidden'), 3000); },
    update(dt) { const T = TOWERS[2];
      if (!this.path.length && now() > this.next) { const r = Math.random();
        if (r < .3) { this.frames = set('sleep'); this.next = now() + rnd(15000, 30000); } else if (r < .5) { this.frames = set('idle'); this.next = now() + rnd(4000, 8000); }
        else { const [x, z] = free(T, 'l'); this.path = astar(T, 'l', this.pos.x, this.pos.z, x, z); this.frames = set('walk'); this.next = now() + rnd(3000, 8000); } }
      if (this.path.length) { const [px, pz] = this.path[0], dx = px - this.pos.x, dz = pz - this.pos.z, d = Math.hypot(dx, dz), sp = 1.1 * dt; this.spr.scale.x = (dx - dz) < 0 ? -1.3 : 1.3;
        if (d <= sp) { this.pos.x = px; this.pos.z = pz; this.path.shift(); if (!this.path.length) this.frames = null; } else { this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; } }
      if (this.frames) { this.t += dt; const u = this.frames[Math.floor(this.t * 8) % this.frames.length]; this.mat.map = tex(u); } else this.mat.map = tex(a.rot['south-east']);
      const w = this.pos.clone().add(OFF(2)); this.spr.position.set(w.x, .02, w.z); } };
} }
const drones = [];
for (let t = 0; t < 3; t++) for (let k = 0; k < 3; k++) {
  const g = new THREE.Group(); scene.add(g); box(.35, .08, .35, mats.dark, 0, 0, 0, g, false); for (const [x, z] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) box(.14, .02, .14, mats.metal, x, .08, z, g, false);
  const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .06), E(pick([0xf472b6, 0x67e8f9, 0x4ade80]))); l.position.y = -.05; g.add(l); if (k === 2) box(.2, .2, .2, M(0xd6a76c), 0, -.3, 0, g, false);
  const light = new THREE.PointLight(l.material.color, 2, 2.5); g.add(light); drones.push({ g, l, t, ph: Math.random() * 6, r: rnd(1.5, 3), sp: rnd(.4, .9), c: new THREE.Vector3(rnd(4, 9), rnd(2.6, 4.2), rnd(4, 8)) });
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
  labels.push({ d, v: new THREE.Vector3((r.r[0] + r.r[2]) / 2, (r.lv === 'u' ? 2 * H - .5 : 3.6), Math.min(r.r[3], 4) / 2 + r.r[1] / 2).add(OFF(T.t)) }); }

// ====================================================================== boot + main loop
for (const T of TOWERS) for (const name of Object.keys(T.seats)) if (ASSETS.npc[name]) npcs[name] = new NPC(name, T);
window.hq3d = { npcs, TOWERS, cat, SkyEvents, Surprises, Phase };
poll(); setInterval(poll, 3000); setInterval(() => { Object.values(npcs).forEach(n => n.life()); Phase.tick(); }, 1000);
const clock = new THREE.Clock(); let ct = 0, ft = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(.1, clock.getDelta()), tt = now() / 1000; ct += dt; ft += dt;
  if (ct > .1) { drawCity(ct); drawSky(); ct = 0; }
  SkyEvents.update(dt);
  if (ft > .18) { ft = 0;
    for (const s of anim.screens) { const c = s.t.userData.c, g = c.getContext('2d'), w = c.width, h = c.height, busy = s.wall || !s.owner || isWork(npcs[s.owner] || { server: {} });
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
  for (const c of cars) { c.u += c.v * dt; if (c.u > 65) c.u = -65; if (c.u < -65) c.u = 65; c.g.position.copy(at(c.u, c.d, c.y)); c.g.rotation.y = c.v > 0 ? Math.PI / 4 : Math.PI / 4 + Math.PI; }
  for (const b of bots) { if (!b.path.length && now() > b.next) { const [x, z] = free(b.T, 'l'); b.path = astar(b.T, 'l', b.pos.x, b.pos.z, x, z); b.next = now() + rnd(2000, 6000); }
    if (b.path.length) { const [px, pz] = b.path[0], dx = px - b.pos.x, dz = pz - b.pos.z, d = Math.hypot(dx, dz), sp = .9 * dt; if (d <= sp) { b.pos.x = px; b.pos.z = pz; b.path.shift(); } else { b.pos.x += dx / d * sp; b.pos.z += dz / d * sp; } }
    b.g.position.copy(b.pos).add(OFF(b.T.t)); b.led.visible = Math.sin(tt * 6) > -.3; }
  for (let i = sparkPool.length - 1; i >= 0; i--) { const p = sparkPool[i]; p.v.y -= p.gr * dt; p.s.position.addScaledVector(p.v, dt); if (p.spin) { p.s.rotation.x += dt * 6; p.s.rotation.y += dt * 4; } p.life -= dt; if (p.life <= 0) { scene.remove(p.s); sparkPool.splice(i, 1); } }
  for (const n of Object.values(npcs)) n.update(dt); cat?.update(dt);
  post.uniforms.time.value = tt; post.uniforms.glitch.value = now() < glitchUntil ? .6 + Math.random() * .4 : 0; post.uniforms.alarm.value = Object.values(npcs).some(n => n.server.status === 'error') ? .25 : 0;
  flashA *= .9; renderer.toneMappingExposure = 1.6 + flashA * 2;
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
