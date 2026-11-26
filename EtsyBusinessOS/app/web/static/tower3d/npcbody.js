// Shared procedural cyber-human (used by the companion window). Same model as the HQ NPCs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const pick = a => a[Math.floor(Math.random() * a.length)];
const rng = seed => { let v = seed; return () => (v = (v * 9301 + 49297) % 233280) / 233280; };
const C = { mag: 0xff3fa4, cyan: 0x3ff0ff, amber: 0xffb347, mint: 0x9fffcf };
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, metalness: .1, ...o });
const E = (c, i = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false });
function box(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); parent.add(m); return m; }
function rbox(w, h, d, r, mat, x, y, z, parent) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat); m.position.set(x, y + h / 2, z); parent.add(m); return m; }
const SKIN = [0xf1c7a5, 0xd9a47e, 0xb37a55, 0x8a5a3c, 0xe8b996];
const HAIR = [0x111318, 0x2a1a12, 0xe6e6f0, 0xff3fa4, 0x3ff0ff, 0x6a3cff, 0xffb347];
export function makeBody(meta, seed) {
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
