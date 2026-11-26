// NEONLOOM desktop companion: a hyperactive cyber-human that lives on the desktop while the HQ window is minimised.
// In the desktop app the Python side (window.pywebview.api) moves the frameless window across the screen.
import * as THREE from 'three';
import { makeBody } from '/static/tower3d/npcbody.js';
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], now = () => performance.now();
const META = Object.fromEntries((window.AGENTS_META || []).map(a => [a.name, a])), WHO = 'KAI-07';
const API = () => window.pywebview && window.pywebview.api;
// ---------- scene
const cv = document.getElementById('c'), renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); renderer.setClearColor(0, 0); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .1, 50); cam.position.set(0, 1.25, 7.4); cam.lookAt(0, 1.2, 0);
scene.add(new THREE.HemisphereLight(0xb4c6ea, 0x1c2232, 1.6)); const k1 = new THREE.PointLight(0x3ff0ff, 12, 8); k1.position.set(-1.5, 2, 2); scene.add(k1); const k2 = new THREE.PointLight(0xff3fa4, 10, 8); k2.position.set(1.6, 1.4, 1.5); scene.add(k2);
const b = makeBody(META[WHO] || { color: '#3ff0ff' }, 7); scene.add(b.root);
const ring = new THREE.Mesh(new THREE.RingGeometry(.35, .42, 32), new THREE.MeshBasicMaterial({ color: 0x3ff0ff, transparent: true, opacity: .5, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .01; scene.add(ring);
// small holo props
const holo = new THREE.Mesh(new THREE.PlaneGeometry(.7, .42), new THREE.MeshBasicMaterial({ color: 0x3ff0ff, transparent: true, opacity: .25, side: THREE.DoubleSide })); holo.position.set(0, 1.15, .55); holo.visible = false; scene.add(holo);
const zz = []; for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.font = 'bold 26px monospace'; g.fillStyle = '#c9a6ff'; g.fillText('z', 8, 26); return new THREE.CanvasTexture(c); })(), transparent: true })); s.scale.setScalar(.18); s.visible = false; scene.add(s); zz.push(s); }
const confetti = []; function burst() { for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .01), new THREE.MeshBasicMaterial({ color: pick([0xff3fa4, 0x3ff0ff, 0xffb347, 0x9fffcf]) })); m.position.set(0, 1.9, 0); scene.add(m); confetti.push({ m, v: new THREE.Vector3(rnd(-1.4, 1.4), rnd(1, 3), rnd(-.5, .5)), life: 2 }); } }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } addEventListener('resize', resize); resize();
// ---------- speech (bubble + Piper voice with radio FX)
const bub = document.getElementById('bub'), sign = document.getElementById('sign'); let actx = null, bubT = 0;
async function say(text, voice = true) { bub.querySelector('span').textContent = text; bub.classList.add('on'); clearTimeout(bubT); bubT = setTimeout(() => bub.classList.remove('on'), 4500);
  if (!voice || !actx) return; try { const r = await fetch(`/api/tts?agent=${WHO}&text=${encodeURIComponent(text.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''))}`); if (!r.ok) return; const buf = await actx.decodeAudioData(await r.arrayBuffer());
    const s = actx.createBufferSource(); s.buffer = buf; s.playbackRate.value = .98; const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; const g = actx.createGain(); g.gain.value = .9;
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(actx.destination); s.start(); talking = true; s.onended = () => { talking = false; }; } catch (e) { } }
let talking = false;
// ---------- behaviour state machine
let act = 'idle', actUntil = 0, face = 0, faceT = 0, t = 0, jumpV = 0, y = 0, moving = false, dir = 1;
const LINES = { idle: ['Aku jaga toko selagi kamu sibuk 😎', 'Semua antrian aman.', 'Hujan neon malam ini…', 'Butuh bantuan? Klik aku.'], bored: ['Bosan… ada order nggak ya?', 'Main game dulu ah.', 'Kopi lagi?'], wake: ['Eh! Aku nggak tidur kok.', 'Siap kerja lagi!'] };
function choose() { const r = Math.random();
  if (r < .3) { walk(); } else if (r < .4) set('jump', 1200); else if (r < .5) set('dance', rnd(3000, 6000)); else if (r < .58) set('wave', 2200); else if (r < .66) set('coffee', 5000);
  else if (r < .72) set('sit', rnd(5000, 9000)); else if (r < .77) set('sleep', rnd(8000, 14000)); else if (r < .84) set('look', 3500); else if (r < .9) set('type', 5000); else if (r < .95) set('stretch', 3000); else { set('flip', 1100); }
  if (Math.random() < .25) say(pick(act === 'sleep' ? ['Zzz…'] : act === 'dance' || act === 'jump' ? ['Yeah!', 'Woo! 🎶'] : LINES.idle), act !== 'sleep'); }
function set(a, ms) { act = a; actUntil = now() + ms; if (a === 'jump' || a === 'flip') jumpV = a === 'flip' ? 5.2 : 4; faceT = 0; }
async function walk() { const api = API(); act = 'walk'; actUntil = now() + 12000; if (api) { const st = await api.state(); const target = Math.max(0, Math.min(st.max, st.x + rnd(-1, 1) * rnd(200, 700))); dir = target > st.x ? 1 : -1; faceT = dir * Math.PI / 2; moving = true; api.walk_to(target, Math.random() < .3 ? 380 : 170); }
  else { dir = Math.random() < .5 ? -1 : 1; faceT = dir * Math.PI / 2; moving = true; setTimeout(() => { moving = false; }, rnd(2000, 4000)); } }
setInterval(async () => { const api = API(); if (act === 'walk' && api) { const st = await api.state(); if (!st.moving) { moving = false; act = 'idle'; actUntil = now() + rnd(800, 2500); } } else if (act === 'walk' && !moving) { act = 'idle'; actUntil = now() + 1500; } }, 250);
// ---------- data reactions
let last = 0, first = true, pend = 0;
async function poll() { try { const st = await (await fetch(`/api/world?since=${last}`)).json(); last = st.last_event;
    if (!first) for (const ev of st.events) { if (ev.kind === 'published') { set('celebrate', 3500); burst(); say('Listing LIVE di Etsy! ✅'); } else if (ev.kind === 'failed') { set('panic', 3500); say(`Ada error: ${ev.text}`.slice(0, 120)); } else if (ev.kind === 'done' && /sync/.test(ev.type || '')) { set('wave', 2000); say(ev.text, false); } }
    first = false; const sh = await (await fetch('/api/world/showcase')).json(); const p = sh.pending || 0; sign.style.display = p ? 'block' : 'none'; sign.textContent = `📝 ${p} APPROVAL`;
    if (p > pend) { set('alarm', 4000); say(`Owner, ada ${p} listing menunggu persetujuan.`); } pend = p; } catch (e) { } }
setInterval(poll, 4000); poll();
// ---------- interaction
cv.addEventListener('pointerdown', () => { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); });
cv.addEventListener('dblclick', () => { const api = API(); if (api) api.restore(); else say('Buka HQ dari jendela utama ya.'); });
cv.addEventListener('click', () => { if (act === 'sleep') { set('jump', 1000); say(pick(LINES.wake)); } else if (Math.random() < .5) { set('wave', 1800); say(pick(['Hai! Klik dua kali untuk buka HQ.', 'Ada yang bisa aku bantu?', 'Aku di sini 😄'])); } else set('flip', 1100); });
// ---------- pose + loop
function pose(dt) { let hy = .92, lL = 0, lR = 0, aL = 0, aR = 0, aLz = 0, aRz = 0, hx = 0, hyw = 0, ty = 0, lean = 0, rz = 0; b.cup.visible = act === 'coffee'; b.phone.visible = act === 'look'; holo.visible = act === 'type'; zz.forEach(z => z.visible = act === 'sleep');
  if (act === 'walk') { const sp = 9, s = Math.sin(t * sp); lL = s * .6; lR = -s * .6; aL = -s * .5; aR = s * .5; hy += Math.abs(Math.cos(t * sp)) * .04; }
  else if (act === 'dance') { aLz = -1.4 + Math.sin(t * 7) * .8; aRz = 1.4 + Math.sin(t * 7 + 1) * .8; lL = Math.sin(t * 7) * .4; lR = -lL; ty = Math.sin(t * 3.5) * .5; hy += Math.abs(Math.sin(t * 7)) * .08; hyw = Math.sin(t * 3.5) * .4; }
  else if (act === 'wave') { aRz = 2.6; aR = Math.sin(t * 12) * .35; hyw = .2; }
  else if (act === 'coffee') { aR = -2.2 + Math.max(0, Math.sin(t * 1.3)) * .5; aRz = .3; hx = -.05; }
  else if (act === 'sit') { hy = .45; lL = lR = -1.5; aL = aR = -.5; hyw = Math.sin(t * .5) * .4; }
  else if (act === 'sleep') { hy = .45; lL = lR = -1.5; hx = .7; lean = .3; aL = aR = -.2; zz.forEach((z, i) => { const k = (t * .5 + i / 3) % 1; z.position.set(.25 + k * .3, 1.4 + k * .6, 0); z.material.opacity = 1 - k; }); }
  else if (act === 'look') { aL = -1.35; aLz = -.35; hx = .5; }
  else if (act === 'type') { aL = aR = -1.2 + Math.sin(t * 20) * .1; hx = .2; }
  else if (act === 'stretch') { const k = Math.abs(Math.sin(t * 1.5)); aLz = -2.9 * k; aRz = 2.9 * k; lean = -.2 * k; }
  else if (act === 'celebrate') { aLz = -2.7 + Math.sin(t * 10) * .2; aRz = 2.7 - Math.sin(t * 10) * .2; hx = -.15; }
  else if (act === 'panic' || act === 'alarm') { aLz = -2.2; aRz = 2.2; aL = aR = -.6; hx = .2 + Math.sin(t * 14) * .08; hyw = Math.sin(t * 9) * .4; }
  else if (act === 'jump' || act === 'flip') { lL = lR = -.4; aLz = -1.2; aRz = 1.2; if (act === 'flip') rz = Math.min(1, Math.max(0, (now() - (actUntil - 1100)) / 900)) * Math.PI * 2; }
  else { hyw = Math.sin(t * .6) * .5; hx = Math.sin(t * .8) * .05; aL = Math.sin(t * 1.4) * .05; aR = -aL; hy += Math.sin(t * 2) * .006; }
  if (talking) { hx += Math.sin(t * 14) * .05; aR -= .3 + Math.sin(t * 7) * .2; }
  b.hips.position.y = hy; b.legL.rotation.x = lL; b.legR.rotation.x = lR; b.armL.rotation.set(aL, 0, aLz); b.armR.rotation.set(aR, 0, aRz); b.head.rotation.set(hx, hyw, 0); b.torso.rotation.set(lean, ty, 0); b.root.rotation.x = rz; }
let lastT = now();
function frame() { const tn = now(), dt = Math.min(.05, (tn - lastT) / 1000); lastT = tn; t += dt;
  if (act !== 'walk' && now() > actUntil) { act = 'idle'; actUntil = now() + rnd(1500, 4000); if (Math.random() < .85) setTimeout(() => { if (act === 'idle') choose(); }, rnd(300, 1500)); }
  if (act !== 'walk') faceT = Math.sin(t * .3) * .4; face += (faceT - face) * Math.min(1, dt * 8); b.root.rotation.y = face;
  jumpV -= 12 * dt; y = Math.max(0, y + jumpV * dt); if (y === 0) jumpV = 0; b.root.position.y = y; ring.scale.setScalar(1 - y * .25); ring.material.opacity = .5 - y * .2 + Math.sin(t * 3) * .1;
  pose(dt); holo.material.opacity = .2 + Math.random() * .1;
  for (let i = confetti.length - 1; i >= 0; i--) { const c = confetti[i]; c.v.y -= 6 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += dt * 9; c.life -= dt; if (c.life <= 0) { scene.remove(c.m); confetti.splice(i, 1); } }
  renderer.render(scene, cam); requestAnimationFrame(frame); }
requestAnimationFrame(frame); setTimeout(() => say('Aku jaga desktop-mu. Klik dua kali untuk buka HQ!', false), 800);
window.companion = { set, say, walk };
