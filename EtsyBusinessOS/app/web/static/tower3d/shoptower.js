// Brand building left of the HQ. Floor 1 = Buildvero, floor 2 = StudioForgeCo, floor 3 = AvArchID (the owner's 3 Etsy shops).
// Each floor is a glass storefront in its shop colour with a live data wall, product shelves, a rotating holo house
// and a holographic shopkeeper. Orders fire coin bursts and a money packet that travels over the data bridge
// into the HQ's FINANCE VAULT (finance is combined for the owner).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBody } from '/static/tower3d/npcbody.js';

const T = () => window.tower;
const COLS = [0xe0a86a, 0xffa62b, 0xff6a1a];
const BRAND = [{ name: 'Buildvero', logo: 'buildvero', kind: 'house', accent: 0x3ff0ff }, { name: 'StudioForgeCo', logo: 'studioforgeco', kind: 'shed', accent: 0xff3fa4 }, { name: 'AvArchID', logo: 'avarchid', kind: 'modern', accent: 0x9fffcf }];
const texLoader = new THREE.TextureLoader(); const logoTex = {};
function logo(i) { const k = BRAND[i].logo; if (!logoTex[k]) { logoTex[k] = texLoader.load(`/static/tower3d/logos/${k}_mark_holo.png`); logoTex[k].colorSpace = THREE.SRGBColorSpace; logoTex[k].anisotropy = 8; } return logoTex[k]; }
const LOGO_AR = { buildvero: 904 / 190, studioforgeco: 1116 / 230, avarchid: 1059 / 171 };
const LOGO_H = .56;  // every brand wordmark gets the same letter height on the building
// holographic logo material: additive, scanlines, flicker, slight chromatic edge
function holoLogoMat(i, col, side = THREE.FrontSide) { return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side, blending: THREE.AdditiveBlending, toneMapped: false,
  uniforms: { map: { value: logo(i) }, t: { value: 0 }, col: { value: new THREE.Color(col) }, amp: { value: 1 }, ph: { value: i * .37 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D map; uniform float t; uniform vec3 col; uniform float amp; uniform float ph; varying vec2 vUv;
    void main(){ vec2 uv=vUv; float g=step(.985,fract(sin(floor(t*7.)*12.9)*43758.5)); uv.x+=g*.012*sin(uv.y*80.+t*40.);
      vec4 c=texture2D(map,uv); float r=texture2D(map,uv+vec2(.004,0)).a, b=texture2D(map,uv-vec2(.004,0)).a;
      float scan=.72+.28*sin(uv.y*260.-t*9.); float sweep=smoothstep(.0,.06,abs(fract(uv.y*.5-t*.35)-.5));
      float bar=smoothstep(.06,0.,abs(uv.x-fract(t*.22+ph)*1.3+.15)); vec3 rgb=c.rgb*(1.9+bar*2.2)*scan + col*(.35+bar)*c.a + vec3(r-c.a,0.,b-c.a)*.6; float a=c.a*(.82+.18*sweep)*amp;
      gl_FragColor=vec4(rgb*a, a); }` }); }
const X0 = -9.2, X1 = 0.2, ZB = -0.8, ZF = 4.6, SH = 3.3, W = X1 - X0, DP = ZF - ZB, CX = (X0 + X1) / 2, CZ = (ZB + ZF) / 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .7, metalness: .2, ...o });
const E = (c, i = 1, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false, ...o });
function box(w, h, d, mat, x, y, z, p) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); p.add(m); return m; }
function rbox(w, h, d, r, mat, x, y, z, p) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); m.position.set(x, y + h / 2, z); p.add(m); return m; }
function canvasTex(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, t, g: c.getContext('2d') }; }
function textSign(txt, col, h, parent, x, y, z, font = 'bold 120px "JetBrains Mono",monospace') {
  const k = canvasTex(1024, 192); k.g.font = font; const w = Math.min(1000, k.g.measureText(txt).width + 40); const hex = '#' + new THREE.Color(col).getHexString();
  k.g.clearRect(0, 0, 1024, 192); k.g.textAlign = 'center'; k.g.textBaseline = 'middle'; k.g.shadowColor = hex; k.g.shadowBlur = 26; k.g.fillStyle = hex; k.g.fillText(txt, 512, 100); k.g.shadowBlur = 0; k.g.fillStyle = '#ffffff'; k.g.globalAlpha = .55; k.g.fillText(txt, 512, 100); k.t.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 1024 / 192, h), new THREE.MeshBasicMaterial({ map: k.t, transparent: true, toneMapped: false, depthWrite: false })); m.position.set(x, y, z); parent.add(m); m.userData.w = w; return m;
}

const root = new THREE.Group(); root.name = 'shop-tower';
const floors = [], packets = [], coins = [], hits = [];
let bridgeCurve = null, riser = null, built = false, lastOrders = null, DATA = null;

function houseShape(s = 1, kind = 'house') { const sh = new THREE.Shape(), P = kind === 'shed' ? [[-.5, 0], [.5, 0], [.5, .55], [-.5, .9]] : kind === 'modern' ? [[-.55, 0], [.55, 0], [.55, .45], [.15, .45], [.15, .85], [-.55, .85]] : [[-.5, 0], [.5, 0], [.5, .55], [0, .95], [-.5, .55]];
  P.forEach(([x, y], k) => k ? sh.lineTo(x * s, y * s) : sh.moveTo(x * s, y * s)); sh.closePath(); return sh; }
function miniHouse(col, s, p, x, y, z, kind = 'house') {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(houseShape(s, kind), { depth: s * .7, bevelEnabled: true, bevelSize: .02 * s, bevelThickness: .02 * s, bevelSegments: 2 }), M(0xdfe6f2, { roughness: .45, metalness: .05, emissive: new THREE.Color(col).multiplyScalar(.12) }));
  body.position.z = -s * .35; g.add(body);
  if (kind === 'house') { const roof = new THREE.Mesh(new THREE.BoxGeometry(s * .78, s * .05, s * .8), M(0x2a3142)); roof.position.set(-s * .25, s * .76, 0); roof.rotation.z = Math.atan2(.4, .5); g.add(roof);
    const roof2 = roof.clone(); roof2.position.x = s * .25; roof2.rotation.z = -Math.atan2(.4, .5); g.add(roof2); }
  else if (kind === 'shed') { const roof = new THREE.Mesh(new THREE.BoxGeometry(s * 1.15, s * .05, s * .82), M(0x2a3142)); roof.position.set(0, s * .74, 0); roof.rotation.z = Math.atan2(.35, 1); g.add(roof); }
  else { const deck = new THREE.Mesh(new THREE.BoxGeometry(s * 1.2, s * .04, s * .8), M(0x2a3142)); deck.position.set(0, s * .47, 0); g.add(deck); const top = deck.clone(); top.scale.x = .62; top.position.set(-s * .2, s * .87, 0); g.add(top); }
  for (const wx of [-.22, .22]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(s * .16, s * .16), E(0xffd59a, 1.6)); w.position.set(wx * s, s * .3, s * .36); g.add(w); }
  return g;
}
function holoHouse(col, kind = 'house') {
  const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8), wireframe: true, transparent: true, opacity: .75, toneMapped: false, depthWrite: false });
  const fill = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const geo = new THREE.ExtrudeGeometry(houseShape(1.05, kind), { depth: .8, bevelEnabled: false, steps: 2 }); geo.translate(0, 0, -.4);
  g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, fill));
  const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4), toneMapped: false })); g.add(ed);
  return g;
}

function buildFloor(i) {
  const col = COLS[i], y = i * SH, g = new THREE.Group(); root.add(g);
  const F = { i, slot: i + 1, col, y, g, lights: [], neon: [], flash: 0, state: 'demo' };
  // floor plate with emissive grid
  const gt = canvasTex(256, 64); gt.g.fillStyle = '#0a0e17'; gt.g.fillRect(0, 0, 256, 64); gt.g.strokeStyle = '#' + new THREE.Color(col).getHexString() + '40'; gt.g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) { gt.g.beginPath(); gt.g.moveTo(x, 0); gt.g.lineTo(x, 64); gt.g.stroke(); } for (let yy = 0; yy <= 64; yy += 16) { gt.g.beginPath(); gt.g.moveTo(0, yy); gt.g.lineTo(256, yy); gt.g.stroke(); } gt.t.needsUpdate = true;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W - .3, DP - .3), new THREE.MeshStandardMaterial({ map: gt.t, roughness: .25, metalness: .6 })); fl.rotation.x = -Math.PI / 2; fl.position.set(CX, y + .27, CZ); g.add(fl);
  // back wall data screen
  const sc = canvasTex(1024, 384); const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshBasicMaterial({ map: sc.t, toneMapped: false })); scr.position.set(CX - .2, y + 1.7, ZB + .12); g.add(scr);
  box(5.9, 2.4, .1, M(0x0c1018, { metalness: .7, roughness: .3 }), CX - .2, y + .5, ZB + .05, g);
  const fr = E(col, 1.8); for (const [w, h, x, yy] of [[5.9, .05, CX - .2, y + 2.88], [5.9, .05, CX - .2, y + .5], [.05, 2.4, CX - 3.15, y + .5], [.05, 2.4, CX + 2.75, y + .5]]) { box(w, h, .12, fr, x, yy, ZB + .1, g); }
  F.screen = sc;
  // shelves with mini house models (left)
  for (let r = 0; r < 3; r++) { box(1.5, .05, .55, M(0x2a3142, { metalness: .6 }), X0 + 1.1, y + .55 + r * .72, ZB + .9, g); box(1.5, .02, .02, E(col, 2), X0 + 1.1, y + .58 + r * .72, ZB + 1.18, g);
    for (let k = 0; k < 3; k++) { const h = miniHouse(col, .28, g, X0 + .6 + k * .5, y + .6 + r * .72, ZB + .9, BRAND[i].kind); h.rotation.y = rnd(-.4, .4); } }
  for (const x of [X0 + .35, X0 + 1.85]) box(.06, 2.3, .55, M(0x1a1f2c), x, y + .3, ZB + .9, g);
  // centre pedestal + rotating holo house + light cone
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, .5, 32), M(0x141a26, { metalness: .8, roughness: .25 })); ped.position.set(CX + .6, y + .52, CZ + .6); g.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .03, 8, 48), E(col, 2.4)); ring.rotation.x = Math.PI / 2; ring.position.set(CX + .6, y + .78, CZ + .6); g.add(ring);
  const hh = holoHouse(BRAND[i].accent, BRAND[i].kind); hh.position.set(CX + .6, y + 1.05, CZ + .6); hh.scale.setScalar(.75); g.add(hh); F.holo = hh;
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(.15, .6, 1.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); cone.position.set(CX + .6, y + 1.5, CZ + .6); g.add(cone); F.cone = cone;
  // counter + holographic shopkeeper (right)
  rbox(1.8, .95, .7, .08, M(0x1b2131, { metalness: .5, roughness: .35 }), X1 - 1.5, y + .27, CZ + .3, g); box(1.82, .03, .72, E(col, 1.6), X1 - 1.5, y + 1.2, CZ + .3, g);
  const term = new THREE.Mesh(new THREE.PlaneGeometry(.5, .32), E(col, 1.2)); term.position.set(X1 - 1.6, y + 1.42, CZ + .2); term.rotation.x = -.5; g.add(term);
  try { const b = makeBody({ color: '#' + new THREE.Color(col).getHexString() }, 31 + i * 7); b.root.position.set(X1 - 1.5, y + .27, CZ - .45); b.root.scale.setScalar(.92); g.add(b.root); F.body = b;
    b.root.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .9; if (o.material.emissive) o.material.emissive = new THREE.Color(col).multiplyScalar(.18); } }); } catch (e) { console.warn('shopkeeper', e); }
  // ceiling light strip + lights
  box(W - 1, .05, .12, E(0xffffff, 1.2), CX, y + SH - .08, CZ - .8, g); box(W - 1, .05, .12, E(col, 1.6), CX, y + SH - .08, CZ + 1.4, g);
  const pl = new THREE.PointLight(col, 9, 9, 1.6); pl.position.set(CX, y + 2.4, CZ + 1); g.add(pl); F.lights.push(pl);
  const pl2 = new THREE.PointLight(0xfff0e0, 4, 7, 1.8); pl2.position.set(CX + .6, y + 2.6, CZ); g.add(pl2); F.lights.push(pl2);
  // roller shutter (shown when the shop is switched off)
  const st = canvasTex(64, 256); for (let yy = 0; yy < 256; yy += 8) { st.g.fillStyle = yy % 16 ? '#2a3142' : '#1c2230'; st.g.fillRect(0, yy, 64, 8); } st.t.needsUpdate = true;
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W - .3, SH - .4), new THREE.MeshStandardMaterial({ map: st.t, metalness: .6, roughness: .5 })); sh.position.set(CX, y + .27 + (SH - .4) / 2, ZF + .02); sh.scale.y = .001; sh.visible = false; g.add(sh); F.shutter = sh; F.shut = 0;
  // facade: floor number + name blade
  F.num = textSign(String(i + 1).padStart(2, '0'), col, .9, g, X0 + .55, y + 2.4, ZF + .3, 'bold 150px "JetBrains Mono",monospace'); F.num.scale.setScalar(.45);
  { const ar = LOGO_AR[BRAND[i].logo], h = LOGO_H, w = h * ar, fy = y + SH + .06, fx = CX + .6; const fas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), holoLogoMat(i, col)); fas.position.set(fx, fy, ZF + .36); g.add(fas); F.fascia = fas; F.neon.push(fas); F.name = fas;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, h * 1.9), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); halo.position.set(fx, fy, ZF + .34); g.add(halo);
    const ul = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.05, .035), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.6), transparent: true, depthWrite: false, toneMapped: false })); ul.position.set(fx, fy - h * .62, ZF + .37); g.add(ul);
    const n = 40, pos = new Float32Array(n * 3), sp = []; for (let k = 0; k < n; k++) { pos[k * 3] = fx + rnd(-w / 2, w / 2); pos[k * 3 + 1] = fy + rnd(-h / 2, h); pos[k * 3 + 2] = ZF + .4; sp.push(rnd(.2, .6)); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(col).multiplyScalar(2), size: .045, transparent: true, opacity: .85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); g.add(pts);
    F.fx = { halo, ul, pts, sp, fx, fy, w, h }; }
  { // rotating hologram logo, projected from an emitter on a bracket left of the facade
    const ex = X0 - 1.75, ey = y + .55, ez = ZF - .4; const metal2 = M(0x3a4458, { metalness: .85, roughness: .25 });
    box(1.7, .08, .08, metal2, X0 - .85, ey - .05, ez, g); const em = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, .16, 24), metal2); em.position.set(ex, ey + .03, ez); g.add(em);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.18, 24), E(col, 3)); lens.rotation.x = -Math.PI / 2; lens.position.set(ex, ey + .12, ez); g.add(lens);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.25, .16, 2.1, 32, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
    beam.position.set(ex, ey + 1.17, ez); g.add(beam);
    const ar = LOGO_AR[BRAND[i].logo], lh = LOGO_H * 1.05, lw = lh * ar; const lg = new THREE.Group(); lg.position.set(ex, ey + 1.35 + Math.min(.5, lh / 2), ez); g.add(lg);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), holoLogoMat(i, col)); lg.add(front);
    const back = front.clone(); back.material = front.material; back.rotation.y = Math.PI; lg.add(back);
    const rg = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), transparent: true, opacity: .5, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })); rg.rotation.x = Math.PI / 2; rg.position.y = -Math.min(.5, lh / 2) - .2; lg.add(rg);
    const dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 90 }, () => [rnd(-1.2, 1.2), rnd(-1, .9), rnd(-.4, .4)]).flat(), 3)), new THREE.PointsMaterial({ color: col, size: .05, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    lg.add(dots); F.logo = { g: lg, mat: front.material, dots, rg, beam, ph: i * 2.1 }; }
  box(W + .3, .06, .06, E(col, 2.2), CX, y + SH - .3, ZF + .28, g);
  // click target
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, SH, DP), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(CX, y + SH / 2, CZ); hit.userData.slot = i + 1; g.add(hit); hits.push(hit);
  floors.push(F); return F;
}

function build() {
  const t = T(); if (!t || !t.scene) return false;
  t.scene.add(root);
  const conc = M(0x2a303e, { roughness: .85 }), dark = M(0x10141d, { metalness: .6, roughness: .4 }), metal = M(0x3a4458, { metalness: .8, roughness: .3 });
  // structure: slabs, columns, side + back walls, glass front
  for (let i = 0; i <= 3; i++) { box(W + .5, .28, DP + .5, conc, CX, i * SH, CZ, root); if (i) box(W + .5, .05, .05, E(COLS[i - 1], 1.4), CX, i * SH + .28, ZF + .26, root); }
  for (const x of [X0, X1]) for (const z of [ZB, ZF]) rbox(.32, SH * 3, .32, .05, metal, x, 0, z, root);
  box(.12, SH * 3, DP, dark, X0 - .05, 0, CZ, root); box(.12, SH * 3, DP, dark, X1 + .05, 0, CZ, root); box(W, SH * 3, .12, dark, CX, 0, ZB - .06, root);
  for (let k = 1; k < 8; k++) box(.04, SH * 3, .04, M(0x232a38), X0 - .12, 0, ZB + k * DP / 8, root);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd0ff, transparent: true, opacity: .12, roughness: .05, metalness: .1, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) { const gp = new THREE.Mesh(new THREE.PlaneGeometry(W, SH - .3), glass); gp.position.set(CX, i * SH + .28 + (SH - .3) / 2, ZF + .15); root.add(gp);
    for (let k = 1; k < 4; k++) box(.05, SH - .3, .05, metal, X0 + k * W / 4, i * SH + .28, ZF + .16, root); }
  for (let i = 0; i < 3; i++) buildFloor(i);
  // entrance canopy + door on the ground floor
  box(3.4, .1, 1.4, metal, CX + 1, SH - .5, ZF + .8, root); box(3.4, .03, .03, E(COLS[0], 2), CX + 1, SH - .5, ZF + 1.5, root);
  // roof: sign, antenna with beacon, rotating holo ring
  const roofY = SH * 3 + .28;
  box(W - .6, .5, .2, dark, CX, roofY, ZF - .2, root);
  { const pr = new THREE.Group(); pr.position.set(CX - .6, roofY + 1.75, CZ + .4); root.add(pr); const R = 1.25;
    for (let k = 0; k < 3; k++) { const ar = LOGO_AR[BRAND[k].logo], h = LOGO_H * .8, w = h * ar; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), holoLogoMat(k, COLS[k])); const a = k / 3 * Math.PI * 2; m.position.set(Math.sin(a) * R * .5, 0, Math.cos(a) * R * .5); m.rotation.y = a; pr.add(m); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, 1.5, 12), metal); pole.position.set(CX - .6, roofY + .25, CZ + .4); root.add(pole);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.5, .6, .14, 32), metal); disc.position.set(CX - .6, roofY + 1, CZ + .4); root.add(disc);
    const dl = new THREE.Mesh(new THREE.TorusGeometry(.52, .025, 8, 48), E(0xffa62b, 2.5)); dl.rotation.x = Math.PI / 2; dl.position.set(CX - .6, roofY + 1.08, CZ + .4); root.add(dl);
    floors.prism = pr; floors.sign = { material: { opacity: 1 } }; }
  textSign('BUILDVERO · STUDIOFORGECO · AVARCHID', 0xffd9a0, .26, root, CX, roofY + .45, ZF + .02);
  box(.08, 3.2, .08, metal, X0 + 1, roofY, CZ - 1, root); const bc = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), E(0xff2a2a, 3)); bc.position.set(X0 + 1, roofY + 3.25, CZ - 1); root.add(bc); floors.beacon = bc;
  const hr = new THREE.Mesh(new THREE.TorusGeometry(1.4, .03, 8, 64), E(0xffa62b, 2)); hr.position.set(CX - .6, roofY + 1.75, CZ + .4); hr.rotation.x = Math.PI / 2.3; root.add(hr); floors.ring = hr;
  const hr2 = hr.clone(); hr2.material = E(0xff6a1a, 2); hr2.scale.setScalar(.7); root.add(hr2); floors.ring2 = hr2;
  // data riser + bridge into the HQ FINANCE VAULT (floor 1 of the HQ)
  const rx = X1 + .35, rz = ZF - .5;
  riser = new THREE.CatmullRomCurve3([new THREE.Vector3(rx, .6, rz), new THREE.Vector3(rx, SH * 3 - .2, rz)]);
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: .22, roughness: .05, depthWrite: false });
  root.add(new THREE.Mesh(new THREE.TubeGeometry(riser, 8, .14, 12, false), tubeMat));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(riser, 8, .025, 6, false), E(0x9ff6ff, 2.2)));
  const vault = t.ROOMS.find(r => r.name === 'FINANCE VAULT'); const vx = vault ? vault.x0 + .8 : 23, vy = t.FL[1].y + 1.6;
  bridgeCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(rx, SH * 1.5, rz), new THREE.Vector3(rx + 3, SH * 1.5 + 1.2, rz + .4), new THREE.Vector3(9.5, vy + 1, rz), new THREE.Vector3(11.2, vy + .4, rz - .6), new THREE.Vector3(vx, vy, 3.2)]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 64, .16, 12, false), tubeMat));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 64, .03, 6, false), E(0xffd36b, 2)));
  for (let k = 0; k <= 10; k++) { const p = bridgeCurve.getPoint(k / 10); const c = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 20), metal); c.position.copy(p); c.lookAt(bridgeCurve.getPoint(Math.min(1, k / 10 + .01))); root.add(c); }
  try { t.outline && t.outline(root, 0x05070c, .03, 1); } catch (e) {}
  // floating clickable labels (same style as room minis)
  const ov = document.getElementById('overlay');
  for (const F of []) { const d = document.createElement('div'); d.className = 'room-holo'; d.style.setProperty('--c', '#' + new THREE.Color(F.col).getHexString()); d.onclick = e => { e.stopPropagation(); openShop(F.slot); }; ov && ov.appendChild(d); F.label = d; F.lv = new THREE.Vector3(X0 - .4, F.y + SH * .55, ZF + .4); }
  t.FRAME_HOOKS.push(update);
  t.renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  t.renderer.domElement.addEventListener('pointerup', onUp);
  built = true; drawAll(); return true;
}

let downAt = null; const ray = new THREE.Raycaster();
function onUp(e) { if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; const t = T(), r = t.renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), t.cam);
  const h = ray.intersectObjects(hits, false)[0]; if (h) openShop(h.object.userData.slot); }
function openShop(slot) { if (window.HoloDash) window.HoloDash.open('TOKO ' + slot); T().Sound && T().Sound.blip && T().Sound.blip(); }

const nf = new Intl.NumberFormat('id-ID'); const RPs = v => { v = v || 0; const a = Math.abs(v); return 'Rp ' + (a >= 1e9 ? (v / 1e9).toFixed(1).replace('.', ',') + ' M' : a >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' jt' : a >= 1e3 ? Math.round(v / 1e3) + ' rb' : nf.format(v)); };
function shopState(s) { if (!s) return 'demo'; if (!s.enabled) return 'off'; if (DATA && DATA.mode === 'demo') return 'demo'; return s.status === 'connected' ? 'live' : 'wait'; }
function drawScreen(F, t = 0) {
  const s = DATA && DATA.shops ? DATA.shops[F.i] : null, k = F.screen, g = k.g, hex = '#' + new THREE.Color(F.col).getHexString(), st = shopState(s);
  g.fillStyle = '#050a12'; g.fillRect(0, 0, 1024, 384);
  g.fillStyle = hex + '18'; for (let y = 0; y < 384; y += 4) g.fillRect(0, y, 1024, 1);
  g.font = 'bold 44px "JetBrains Mono",monospace'; g.fillStyle = hex; g.shadowColor = hex; g.shadowBlur = 14; g.fillText((s ? s.name : BRAND[F.i].name).slice(0, 26), 28, 62); g.shadowBlur = 0;
  const badge = { live: ['LIVE', '#7dffb5'], demo: ['DEMO', '#b06bff'], wait: ['BELUM TERSAMBUNG', '#ffb347'], off: ['OFFLINE', '#ff5a7a'] }[st];
  g.font = 'bold 26px monospace'; const bw = g.measureText(badge[0]).width + 24; g.strokeStyle = badge[1]; g.lineWidth = 2; g.strokeRect(1000 - bw, 30, bw, 40); g.fillStyle = badge[1]; g.fillText(badge[0], 1012 - bw, 60);
  if (!s || st === 'off') { g.font = '28px monospace'; g.fillStyle = '#9fb0c8'; g.fillText(st === 'off' ? 'Toko nonaktif · aktifkan lewat hologram ' + BRAND[F.i].name : 'memuat data…', 28, 200); k.t.needsUpdate = true; return; }
  const cell = (lbl, val, x, y, c = '#ffffff') => { g.font = '20px monospace'; g.fillStyle = '#8fb6cc'; g.fillText(lbl, x, y); g.font = 'bold 44px "JetBrains Mono",monospace'; g.fillStyle = c; g.fillText(val, x, y + 50); };
  cell('PENDAPATAN 30H', RPs(s.revenue), 28, 120, '#ffffff'); cell('ORDER', nf.format(s.orders), 430, 120, hex); cell('LIVE', nf.format(s.live), 610, 120, '#7dffb5'); cell('APPROVAL', nf.format(s.pending), 790, 120, s.pending ? '#ff3fa4' : '#7dffb5');
  // sparkline
  const ser = s.series || []; const mx = Math.max(1, ...ser.map(p => p.v)); g.strokeStyle = hex; g.lineWidth = 3; g.shadowColor = hex; g.shadowBlur = 8; g.beginPath();
  ser.forEach((p, j) => { const x = 28 + j / Math.max(1, ser.length - 1) * 968, y = 360 - p.v / mx * 120; j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.shadowBlur = 0;
  if (!ser.length) { g.font = '22px monospace'; g.fillStyle = '#6f8aa0'; g.fillText('belum ada penjualan', 28, 330); }
  const sx = (t * 140) % 1024; g.fillStyle = hex + '22'; g.fillRect(sx, 0, 60, 384);
  k.t.needsUpdate = true;
}
function drawAll() { floors.forEach(F => drawScreen(F)); }

function onData(d) {
  DATA = d; if (!built) return;
  const orders = (d.shops || []).map(s => s.orders);
  if (lastOrders) orders.forEach((n, i) => { if (n > lastOrders[i]) sale(i, n - lastOrders[i]); });
  lastOrders = orders;
  for (const F of floors) { const s = (d.shops || [])[F.i]; F.state = shopState(s);  if (F.label && s) F.label.innerHTML = `<small>LANTAI ${F.slot} · ${esc(s.name).slice(0, 18)}</small>${RPs(s.revenue)} · ${s.orders} order`; }
  drawAll();
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function retitle(F, name) { if (F._nm === name) return; F._nm = name; const g = F.name; g.parent.remove(g); g.geometry.dispose(); g.material.map.dispose();
  const ns = textSign(name.toUpperCase().slice(0, 22), F.col, .42, F.g, CX + .4, F.y + SH - .02, ZF + .32); F.neon = [ns]; F.name = ns; }

// a sale: floor flash, coin burst out of the storefront, money packet over the bridge into the vault
function sale(i, n = 1) {
  const F = floors[i]; if (!F) return; const t = T(); F.flash = 1.4;
  for (let k = 0; k < 18 + 6 * Math.min(n, 4); k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .02, 14), new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: .2, emissive: 0x7a5200 }));
    c.position.set(CX + rnd(-2, 2), F.y + 1.2, ZF + .3); root.add(c); coins.push({ m: c, v: new THREE.Vector3(rnd(-1.6, 1.6), rnd(2.5, 4.5), rnd(1, 2.6)), life: rnd(1.4, 2.2), spin: rnd(6, 14) }); }
  try { t.shock && t.shock(CX, F.y + 1.4, ZF + .4, F.col, .6); t.Sound && t.Sound.chime && t.Sound.chime(); t.toast && t.toast(`💰 Order baru di ${(DATA && DATA.shops && DATA.shops[i] && DATA.shops[i].name) || BRAND[i].name} · uang masuk ke FINANCE VAULT`); } catch (e) {}
  for (let k = 0; k < Math.min(n, 5); k++) setTimeout(() => sendPacket(i, true), k * 350);
}
function sendPacket(i, big = false) {
  if (!bridgeCurve) return; const col = COLS[i];
  const m = new THREE.Mesh(new THREE.SphereGeometry(big ? .16 : .08, 14, 10), E(big ? 0xffd36b : col, big ? 3 : 2.2)); root.add(m);
  const tr = new THREE.Mesh(new THREE.SphereGeometry(big ? .28 : .14, 12, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .25, depthWrite: false, toneMapped: false })); m.add(tr);
  packets.push({ m, i, ph: 0, t: 0, big, sp: big ? .55 : .3 });
}

const tmp = new THREE.Vector3();
function update(dt, t) {
  for (const F of floors) {
    F.holo.rotation.y += dt * .6; F.holo.position.y = F.y + 1.05 + Math.sin(t * 1.6 + F.i) * .06; F.holo.visible = F.state === 'off' ? Math.random() > .7 : Math.random() > .015;
    F.cone.material.opacity = .06 + Math.sin(t * 3 + F.i) * .025;
    const want = F.state === 'off' ? 1 : 0; F.shut += (want - F.shut) * Math.min(1, dt * 1.5); F.shutter.visible = F.shut > .01; F.shutter.scale.y = Math.max(.001, F.shut); F.shutter.position.y = F.y + .27 + (SH - .4) * (1 - F.shut / 2);
    const base = F.state === 'off' ? .12 : F.state === 'wait' ? (.5 + Math.sin(t * 4) * .25) : 1; F.flash = Math.max(0, F.flash - dt * 1.2);
    F.lights[0].intensity = 9 * base + F.flash * 30; F.lights[1].intensity = 4 * base;
    if (F.body) { const b = F.body; b.head.rotation.y = Math.sin(t * .7 + F.i) * .5; b.torso.rotation.z = Math.sin(t * 1.3 + F.i) * .03; b.armR.rotation.x = -.5 + Math.sin(t * 2.2 + F.i) * .25 - F.flash * .8; b.armL.rotation.x = -.3 + Math.sin(t * 1.9) * .1; b.root.visible = F.state !== 'off'; }
    F.num.material.opacity = F.state === 'off' ? .25 : (Math.random() > .01 ? 1 : .3); F.fascia.material.uniforms.amp.value = F.state === 'off' ? .2 : 1;
    if (F.state !== 'off' && Math.random() < dt * .25) sendPacket(F.i);
  }
  for (const F of floors) if (F.logo) { const L = F.logo, on = F.state !== 'off'; L.g.rotation.y = t * .55 + L.ph; L.g.position.y += (F.y + .55 + 1.35 + .3 + Math.sin(t * 1.3 + L.ph) * .06 - L.g.position.y) * .1;
    L.mat.uniforms.t.value = t; L.mat.uniforms.amp.value = on ? (Math.random() > .012 ? 1 : .25) + F.flash * .6 : .15; L.dots.rotation.y = -t * .3; L.rg.rotation.z = t; L.beam.material.opacity = on ? .06 + Math.sin(t * 5 + L.ph) * .015 : .015; }
  for (const F of floors) if (F.fascia) { F.fascia.material.uniforms.t.value = t; const X = F.fx, on = F.state !== 'off';
    X.halo.material.opacity = on ? .07 + Math.sin(t * 2.2 + F.i) * .04 + F.flash * .2 : .01; X.ul.scale.x = on ? .75 + .25 * Math.abs(Math.sin(t * 1.1 + F.i)) : .1; X.ul.material.opacity = on ? 1 : .2;
    const a = X.pts.geometry.attributes.position; for (let k = 0; k < a.count; k++) { let yy = a.getY(k) + X.sp[k] * dt; if (yy > X.fy + X.h * 1.4) { yy = X.fy - X.h / 2; a.setX(k, X.fx + rnd(-X.w / 2, X.w / 2)); } a.setY(k, yy); } a.needsUpdate = true; X.pts.visible = on; }
  if (floors.prism) { floors.prism.rotation.y = t * .35; floors.prism.children.forEach(m => { m.material.uniforms.t.value = t; }); }
  if (floors.ring) { floors.ring.rotation.z += dt * .8; floors.ring2.rotation.z -= dt * 1.3; floors.beacon.visible = Math.sin(t * 3) > 0; floors.sign.material.opacity = Math.random() > .008 ? 1 : .35; }
  if (Math.floor(t * 8) !== update._f) { update._f = Math.floor(t * 8); for (const F of floors) if (F.state !== 'off' && DATA) drawScreen(F, t); }
  // packets: floor -> riser -> bridge -> vault
  for (let k = packets.length - 1; k >= 0; k--) { const p = packets[k]; p.t += dt * p.sp;
    const y0 = floors[p.i].y + 1.2, ry = SH * 1.5, rx = X1 + .35, rz = ZF - .5;
    if (p.ph === 0) { const q = Math.min(1, p.t * 2.2); tmp.set(CX + 2 + (rx - CX - 2) * q, y0, rz); if (q >= 1) { p.ph = 1; p.t = 0; } }
    else if (p.ph === 1) { const q = Math.min(1, p.t * 2.5), yy = y0 + (ry - y0) * q; tmp.set(rx, yy, rz); if (q >= 1) { p.ph = 2; p.t = 0; } }
    else { const q = Math.min(1, p.t); bridgeCurve.getPoint(q, tmp); if (q >= 1) { if (p.big) { try { T().shock && T().shock(tmp.x, tmp.y, tmp.z, 0xffd36b, .5); } catch (e) {} } root.remove(p.m); packets.splice(k, 1); continue; } }
    p.m.position.copy(tmp); p.m.scale.setScalar(1 + Math.sin(t * 20) * .12); }
  for (let k = coins.length - 1; k >= 0; k--) { const c = coins[k]; c.life -= dt; c.v.y -= 9 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * .6 * dt;
    if (c.m.position.y < .05) { c.m.position.y = .05; c.v.y *= -.35; c.v.x *= .6; c.v.z *= .6; } if (c.life <= 0) { root.remove(c.m); coins.splice(k, 1); } }
  // labels
  const tw = T(); if (tw && tw.project) for (const F of floors) if (F.label) { const [x, y, vis] = tw.project(F.lv); F.label.style.display = vis && !document.body.classList.contains('hd-open') ? '' : 'none'; F.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-100%,-50%)`; }
}

window.ShopTower = { sale, floors, sendPacket, get data() { return DATA; } };
addEventListener('holodata', e => onData(e.detail));
(function boot() { if (!T() || !T().scene || !T().FRAME_HOOKS) return setTimeout(boot, 250); build(); if (window.HoloDash && window.HoloDash.data) onData(window.HoloDash.data); })();
