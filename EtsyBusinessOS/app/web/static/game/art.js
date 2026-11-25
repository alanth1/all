// Procedural isometric pixel-art textures (furniture, walls, screens, fallback NPCs).
// Drawn once into canvases at 1px = 1 world px; the camera zooms with nearest-neighbour filtering.
(function () {
  const W = window.W;
  const TW = W.TW, TH = W.TH;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const shade = (c, f) => { // c: '#rrggbb', f: -1..1
    const n = parseInt(c.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  };
  W.shade = shade; W.hex = hex;

  function poly(ctx, pts, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(Math.round(pts[0][0]) + .5, Math.round(pts[0][1]) + .5);
    for (const p of pts.slice(1)) ctx.lineTo(Math.round(p[0]) + .5, Math.round(p[1]) + .5);
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // iso box inside a texture. Footprint a x b cells, height h px. (ox,oy) = texture coords of base corner P(0,0).
  function box(ctx, ox, oy, a, b, h, color, opt = {}) {
    const P = (i, j, z) => [ox + (i - j) * TW / 2, oy + (i + j) * TH / 2 - z];
    const top = opt.top || shade(color, 0.18), left = opt.left || color, right = opt.right || shade(color, -0.28);
    const line = opt.line || shade(color, -0.55);
    poly(ctx, [P(0, b, 0), P(a, b, 0), P(a, b, h), P(0, b, h)], left, line);          // front-left face (+y)
    poly(ctx, [P(a, 0, 0), P(a, b, 0), P(a, b, h), P(a, 0, h)], right, line);        // front-right face (+x)
    poly(ctx, [P(0, 0, h), P(a, 0, h), P(a, b, h), P(0, b, h)], top, line);          // top
    if (opt.rim) { ctx.strokeStyle = opt.rim; ctx.beginPath(); ctx.moveTo(...P(0, b, h)); ctx.lineTo(...P(a, b, h)); ctx.lineTo(...P(a, 0, h)); ctx.stroke(); }
    return P;
  }
  W.drawBox = box;

  // Create a texture sized for a footprint (a x b) with max height h; draw(ctx, P, ox, oy)
  function tex(scene, key, a, b, h, draw, pad = 2) {
    const w = Math.ceil((a + b) * TW / 2) + pad * 2, hh = Math.ceil((a + b) * TH / 2 + h) + pad * 2;
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const ox = pad + b * TW / 2, oy = pad + h;
    draw(ctx, ox, oy);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, c);
    return { key, ox, oy, w, h: hh };
  }
  W.makeTex = tex;

  // A parallelogram on the +x face of a box (monitor screens), returns corner points
  function faceX(P, a, j0, j1, z0, z1) { return [P(a, j0, z0), P(a, j1, z0), P(a, j1, z1), P(a, j0, z1)]; }
  function faceY(P, b, i0, i1, z0, z1) { return [P(i0, b, z0), P(i1, b, z0), P(i1, b, z1), P(i0, b, z1)]; }
  W.faceX = faceX; W.faceY = faceY;

  const NEON = ['#22d3ee', '#f472b6', '#a78bfa', '#4ade80', '#facc15', '#fb923c'];

  W.buildFurniture = function (scene, f) {
    const key = `f_${f.t}_${f.x}_${f.y}`;
    const a = f.a || 1, b = f.b || 1;
    const meta = { overlays: [] };
    let t;
    switch (f.t) {
      case 'desk': t = tex(scene, key, a, b, 30, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a, b, 12, '#3b3552', { rim: '#7c6fb0' });
        // legs shadow strip
        // monitors on the desk, screens face +x (towards the chair)
        const n = f.monitors || 1;
        for (let m = 0; m < n; m++) {
          const j0 = 0.15 + m * (1.7 / n), j1 = j0 + 1.5 / n;
          const Q = (i, j, z) => P(i, j, z);
          poly(ctx, [Q(0.35, j0, 13), Q(0.35, j1, 13), Q(0.35, j1, 27), Q(0.35, j0, 27)], '#16131f', '#000');
          poly(ctx, [Q(0.45, j0, 13), Q(0.45, j1, 13), Q(0.45, j1, 27), Q(0.45, j0, 27)], '#0b0a12', '#2b2640');
          meta.overlays.push({ kind: 'screen', pts: [Q(0.47, j0 + .06, 15), Q(0.47, j1 - .06, 15), Q(0.47, j1 - .06, 26), Q(0.47, j0 + .06, 26)] });
        }
        // keyboard + mug
        poly(ctx, [P(0.7, 0.6, 12.5), P(0.9, 0.6, 12.5), P(0.9, 1.3, 12.5), P(0.7, 1.3, 12.5)], '#24203a', '#4b4470');
        const mug = P(0.75, 1.65, 12); ctx.fillStyle = NEON[(f.x + f.y) % NEON.length]; ctx.fillRect(mug[0] - 1, mug[1] - 4, 3, 4);
        if (f.approval) { const l = P(0.2, 1.9, 13); ctx.fillStyle = '#f472b6'; ctx.fillRect(l[0] - 1, l[1] - 10, 2, 10); }
      }); break;
      case 'chair': t = tex(scene, key, 1, 1, 22, (ctx, ox, oy) => {
        const P = box(ctx, ox + 4, oy + 3, 0.55, 0.55, 8, '#1f2937', { rim: '#4b5563' });
        box(ctx, ox + 9, oy - 2, 0.15, 0.55, 20, '#111827');
      }); break;
      case 'rack': t = tex(scene, key, a, b, 52, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .9, b * .9, 50, '#151826', { rim: '#334155' });
        // vents on front-left face
        for (let z = 6; z < 48; z += 5) poly(ctx, faceY(P, b * .9, 0.1, 0.8, z, z + 2), '#0b0d15');
        for (let z = 6; z < 48; z += 5) for (let k = 0; k < 4; k++) meta.overlays.push({ kind: 'led', pt: P(0.15 + k * 0.17, b * .9, z + 1), color: NEON[(k + z) % 4] });
      }); break;
      case 'cooler': t = tex(scene, key, a, b, 34, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .8, b, 32, '#1e293b', { rim: '#64748b' });
        const c1 = P(.4, b * .3, 22), c2 = P(.4, b * .75, 22);
        meta.overlays.push({ kind: 'fan', pt: P(a * .8, b * .3, 18) }, { kind: 'fan', pt: P(a * .8, b * .75, 18) });
      }); break;
      case 'holotable': t = tex(scene, key, a, b, 16, (ctx, ox, oy) => {
        box(ctx, ox, oy, a, b, 10, '#1e3a3a', { rim: '#4ade80' });
      }); meta.overlays.push({ kind: 'holo', color: 0x4ade80 }); break;
      case 'roundtable': t = tex(scene, key, a, b, 14, (ctx, ox, oy) => {
        box(ctx, ox + 4, oy + 2, a * .8, b * .8, 10, '#273449', { rim: '#22d3ee' });
      }); meta.overlays.push({ kind: 'holo', color: 0x22d3ee }); break;
      case 'shelf': case 'bookshelf': t = tex(scene, key, a, b, 44, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .6, b, 42, '#4a3428', { rim: '#8b5e3c' });
        for (let z = 6; z < 40; z += 9) {
          poly(ctx, faceX(P, a * .6, 0.05, b - 0.05, z, z + 1), '#2a1c14');
          for (let j = 0.1; j < b - 0.15; j += 0.18) {
            const col = f.t === 'bookshelf' ? NEON[Math.floor(j * 13 + z) % NEON.length] : ['#a16207', '#78716c', '#57534e'][Math.floor(j * 7 + z) % 3];
            poly(ctx, faceX(P, a * .6, j, j + 0.12, z + 1, z + 7), shade(col, -0.25));
          }
        }
      }); break;
      case 'cabinet': t = tex(scene, key, 1, 1, 36, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, .7, .9, 34, '#57534e', { rim: '#a8a29e' });
        for (let z = 4; z < 34; z += 10) { poly(ctx, faceX(P, .7, 0.15, 0.75, z, z + 8), '#44403c', '#292524'); const h = P(.7, .45, z + 5); ctx.fillStyle = '#d6d3d1'; ctx.fillRect(h[0], h[1], 2, 1); }
      }); break;
      case 'vending': t = tex(scene, key, 1, 1, 46, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, .9, .9, 44, '#312e81', { rim: '#a78bfa' });
        poly(ctx, faceY(P, .9, 0.08, 0.6, 8, 40), '#0f0c29', '#a78bfa');
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) { const p = P(0.13 + c * 0.15, .9, 12 + r * 6); ctx.fillStyle = NEON[(r * 3 + c) % NEON.length]; ctx.fillRect(p[0] - 1, p[1] - 3, 3, 3); }
        meta.overlays.push({ kind: 'glow', pt: P(.35, .9, 24), color: 0xa78bfa, r: 22 });
      }); break;
      case 'coffee': t = tex(scene, key, 1, 1, 28, (ctx, ox, oy) => {
        box(ctx, ox, oy, .9, .9, 14, '#44403c', { rim: '#78716c' });
        const P = box(ctx, ox + 3, oy - 14, .5, .5, 12, '#18181b', { rim: '#ef4444' });
        meta.overlays.push({ kind: 'steam', pt: P(.25, .25, 13) });
      }); break;
      case 'cooler_water': t = tex(scene, key, 1, 1, 34, (ctx, ox, oy) => {
        box(ctx, ox + 3, oy, .6, .6, 18, '#e5e7eb');
        box(ctx, ox + 4, oy - 18, .45, .45, 12, '#7dd3fc', { top: '#bae6fd', line: '#0369a1' });
      }); break;
      case 'arcade': t = tex(scene, key, 1, 1, 50, (ctx, ox, oy) => {
        const col = f.variant ? '#831843' : '#1e3a8a';
        const P = box(ctx, ox, oy, .8, .8, 46, col, { rim: f.variant ? '#f472b6' : '#22d3ee' });
        poly(ctx, faceY(P, .8, 0.08, 0.72, 26, 40), '#000', '#111');
        meta.overlays.push({ kind: 'arcade', pts: faceY(P, .8, 0.12, 0.68, 28, 38) });
        poly(ctx, faceY(P, .8, 0.05, 0.75, 18, 22), shade(col, 0.3));
        const k = P(.3, .8, 20); ctx.fillStyle = '#ef4444'; ctx.fillRect(k[0], k[1] - 1, 2, 2); ctx.fillStyle = '#facc15'; ctx.fillRect(k[0] + 4, k[1] + 1, 2, 2);
        poly(ctx, faceY(P, .8, 0.0, 0.8, 42, 46), f.variant ? '#f472b6' : '#22d3ee');
      }); break;
      case 'couch': t = tex(scene, key, a, b, 22, (ctx, ox, oy) => {
        box(ctx, ox, oy, a * .8, b, 8, '#4c1d95', { rim: '#a78bfa' });
        box(ctx, ox, oy, a * .25, b, 18, '#5b21b6');
        box(ctx, ox, oy, a * .8, .25, 13, '#5b21b6'); box(ctx, ox + (b - .25) * -TW / 2, oy + (b - .25) * TH / 2, a * .8, .25, 13, '#5b21b6');
      }); break;
      case 'table': t = tex(scene, key, 1, 1, 14, (ctx, ox, oy) => {
        box(ctx, ox + 3, oy + 2, .7, .7, 9, '#334155', { rim: '#22d3ee' });
        const P = (i, j, z) => [ox + 3 + (i - j) * TW / 2, oy + 2 + (i + j) * TH / 2 - z];
        const p = P(.3, .3, 10); ctx.fillStyle = '#f472b6'; ctx.fillRect(p[0], p[1] - 3, 2, 3);
      }); break;
      case 'beanbag': t = tex(scene, key, 1, 1, 14, (ctx, ox, oy) => {
        const c = hex(f.color || 0x7c3aed);
        const cx = ox, cy = oy + TH / 2;
        ctx.fillStyle = shade(c, -0.4); ctx.beginPath(); ctx.ellipse(cx, cy + 1, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(c, 0.25); ctx.beginPath(); ctx.ellipse(cx - 3, cy - 5, 5, 3, -0.3, 0, Math.PI * 2); ctx.fill();
      }); break;
      case 'plant': t = tex(scene, key, 1, 1, 34, (ctx, ox, oy) => {
        box(ctx, ox + 5, oy + 2, .45, .45, 9, '#7c2d12', { rim: '#c2410c' });
      }); meta.overlays.push({ kind: 'plant' }); break;
      case 'lamp': t = tex(scene, key, 1, 1, 40, (ctx, ox, oy) => {
        const p = [ox, oy + TH / 2]; ctx.fillStyle = '#18181b'; ctx.fillRect(p[0] - 3, p[1] - 2, 7, 2); ctx.fillRect(p[0], p[1] - 34, 1, 32);
        ctx.fillStyle = '#fde68a'; ctx.fillRect(p[0] - 4, p[1] - 38, 9, 5);
        meta.overlays.push({ kind: 'glow', pt: [p[0], p[1] - 35], color: 0xfde68a, r: 26 });
      }); break;
      case 'scanner': t = tex(scene, key, a, b, 26, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a, b * .8, 12, '#3f3f46', { rim: '#facc15' });
        box(ctx, ox, oy - 12, .2, b * .8, 12, '#27272a'); box(ctx, ox + (a - .2) * TW / 2, oy - 12 + (a - .2) * TH / 2, .2, b * .8, 12, '#27272a');
        meta.overlays.push({ kind: 'beam', p1: P(0.1, 0.4, 24), p2: P(a - 0.1, 0.4, 24) });
      }); break;
      case 'crate': t = tex(scene, key, 1, 1, 18, (ctx, ox, oy) => { box(ctx, ox + 2, oy + 1, .8, .8, 14, '#a16207', { rim: '#facc15' }); }); break;
      case 'boxes': t = tex(scene, key, 1, 1, 26, (ctx, ox, oy) => {
        box(ctx, ox + 2, oy + 1, .7, .7, 10, '#b45309'); box(ctx, ox + 4, oy - 9, .5, .5, 8, '#d97706'); box(ctx, ox - 2, oy + 5, .4, .4, 6, '#92400e');
      }); break;
      case 'counter': t = tex(scene, key, a, b, 26, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .7, b, 16, '#831843', { rim: '#f472b6' });
        const reg = P(.35, .6, 16); box(ctx, reg[0] - ox + ox - 4, reg[1], .3, .4, 7, '#111827', { rim: '#22d3ee' });
        meta.overlays.push({ kind: 'glow', pt: P(.35, b / 2, 10), color: 0xf472b6, r: 30 });
      }); break;
      case 'ringlight': t = tex(scene, key, 1, 1, 46, (ctx, ox, oy) => {
        const p = [ox, oy + TH / 2]; ctx.fillStyle = '#27272a'; ctx.fillRect(p[0], p[1] - 30, 1, 30); ctx.fillRect(p[0] - 4, p[1] - 1, 9, 1);
        ctx.strokeStyle = '#fdf4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1] - 36, 7, 0, Math.PI * 2); ctx.stroke();
        meta.overlays.push({ kind: 'glow', pt: [p[0], p[1] - 36], color: 0xfdf4ff, r: 24 });
      }); break;
      case 'camera': t = tex(scene, key, 1, 1, 34, (ctx, ox, oy) => {
        const p = [ox, oy + TH / 2]; ctx.fillStyle = '#3f3f46';
        ctx.fillRect(p[0] - 5, p[1] - 1, 1, 1); ctx.fillRect(p[0] + 5, p[1] - 1, 1, 1);
        ctx.beginPath(); ctx.moveTo(p[0] - 5, p[1]); ctx.lineTo(p[0], p[1] - 22); ctx.lineTo(p[0] + 5, p[1]); ctx.strokeStyle = '#52525b'; ctx.stroke();
        ctx.fillStyle = '#18181b'; ctx.fillRect(p[0] - 5, p[1] - 29, 10, 7); ctx.fillStyle = '#3b82f6'; ctx.fillRect(p[0] - 8, p[1] - 27, 3, 3);
        meta.overlays.push({ kind: 'rec', pt: [p[0] + 3, p[1] - 28] });
      }); break;
      case 'dashwall': t = tex(scene, key, a, b, 48, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .3, b, 46, '#0f172a', { rim: '#60a5fa' });
        meta.overlays.push({ kind: 'dash', pts: faceY(P, b, 0.02, a * .28, 6, 42), side: P });
        meta.overlays.push({ kind: 'screen', pts: faceX(P, a * .3, 0.15, b - 0.15, 8, 42), big: true });
      }); break;
      case 'safe': t = tex(scene, key, a, b, 40, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a * .9, b * .9, 36, '#3f3f46', { rim: '#fbbf24' });
        const c = P(a * .9, b * .45, 18); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c[0], c[1], 5, 8, -0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fde68a'; ctx.fillRect(c[0] - 1, c[1] - 1, 2, 2);
      }); break;
      case 'coins': t = tex(scene, key, 1, 1, 16, (ctx, ox, oy) => {
        for (let k = 0; k < 4; k++) { const x = ox - 6 + k * 4, y = oy + 8 - (k % 2) * 2; for (let s = 0; s < 3 + k; s++) { ctx.fillStyle = s % 2 ? '#f59e0b' : '#fcd34d'; ctx.fillRect(x, y - s * 2, 4, 2); } }
      }); break;
      case 'toolbox': t = tex(scene, key, 1, 1, 14, (ctx, ox, oy) => { box(ctx, ox + 3, oy + 2, .6, .35, 8, '#b91c1c', { rim: '#f87171' }); }); break;
      case 'blackbox': t = tex(scene, key, 1, 1, 22, (ctx, ox, oy) => {
        const P = box(ctx, ox + 3, oy + 1, .6, .6, 18, '#0b0b0f', { rim: '#22d3ee' });
        meta.overlays.push({ kind: 'led', pt: P(.3, .6, 12), color: '#ef4444', slow: true });
      }); break;
      case 'pingpong': t = tex(scene, key, a, b, 16, (ctx, ox, oy) => {
        const P = box(ctx, ox, oy, a, b * .9, 10, '#065f46', { rim: '#d1fae5' });
        poly(ctx, [P(a / 2, 0, 10), P(a / 2, b * .9, 10), P(a / 2, b * .9, 14), P(a / 2, 0, 14)], 'rgba(255,255,255,.6)');
      }); break;
      default: t = tex(scene, key, a, b, 20, (ctx, ox, oy) => box(ctx, ox, oy, a, b, 12, '#334155'));
    }
    return { tex: t, meta };
  };

  // Screen frames (code/text scrolling) - parallelogram-agnostic small rectangles, skewed at draw time.
  W.SCREEN_COLORS = ['#22d3ee', '#4ade80', '#f472b6', '#facc15', '#a78bfa'];

  // Fallback chibi NPC (used until PixelLab sprites are present)
  W.fallbackNPC = function (scene, name, color) {
    const frames = [];
    for (const dir of ['south-east', 'north-east']) for (let f = 0; f < 4; f++) {
      const key = `fb_${name}_${dir}_${f}`; frames.push(key);
      const c = document.createElement('canvas'); c.width = 32; c.height = 40; const ctx = c.getContext('2d');
      const back = dir.startsWith('north');
      const bob = f % 2 ? 1 : 0;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(16, 37, 8, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1f2937'; ctx.fillRect(12 + (f === 1 ? 1 : 0), 30, 3, 6 - (f === 1 ? 1 : 0)); ctx.fillRect(17 - (f === 3 ? 1 : 0), 30, 3, 6 - (f === 3 ? 1 : 0));
      ctx.fillStyle = color; ctx.fillRect(10, 19 - bob, 12, 12);
      ctx.fillStyle = shade(color, -0.3); ctx.fillRect(10, 27 - bob, 12, 4);
      ctx.fillStyle = '#f1c27d'; ctx.fillRect(11, 8 - bob, 10, 11);
      ctx.fillStyle = shade(color, -0.5); ctx.fillRect(10, 6 - bob, 12, back ? 12 : 5);
      if (!back) { ctx.fillStyle = '#111'; ctx.fillRect(13, 13 - bob, 2, 2); ctx.fillRect(18, 13 - bob, 2, 2); }
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, c);
    }
    return frames;
  };
})();
