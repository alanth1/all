// NEONLOOM HQ engine: empty tower shells + depth-sorted furniture sprites on an isometric grid,
// A* walking around furniture, a working lift between levels and glass bridges between towers.
(function () {
  const W = window.W;
  const ASSETS = window.ASSETS || { npc: {} };
  const AGENTS_META = window.AGENTS_META || [];
  const Q = new URLSearchParams(location.search);
  const DEBUG = Q.has('debug');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nowMs = () => performance.now();
  const overlay = document.getElementById('overlay');
  const el = (cls, html = '', parent = overlay) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  W.hex = hex;

  // ---------------------------------------------------------------- geometry
  const F = W.FLOORS;
  const plane = (fid) => W.PLANES[F[fid].lv];
  const P = (fid, u, v) => { const t = F[fid].t, B = plane(fid).B; return { x: W.towerX(t) + B[0] + u * W.UX[0] + v * W.VX[0], y: W.TOP + B[1] + u * W.UX[1] + v * W.VX[1] }; };
  const inv = (fid, x, y) => {
    const t = F[fid].t, B = plane(fid).B; const dx = x - W.towerX(t) - B[0], dy = y - W.TOP - B[1];
    const det = W.UX[0] * W.VX[1] - W.VX[0] * W.UX[1];
    return { u: (dx * W.VX[1] - W.VX[0] * dy) / det, v: (W.UX[0] * dy - dx * W.UX[1]) / det };
  };
  const depthOf = (fid, y) => (F[fid].lv === 'u' ? 6000 : 1000) + y / 10;
  W.P = P; W.inv = inv;

  // ---------------------------------------------------------------- navigation grid (0.5 unit cells)
  const R = 2, N = 10 * R + 1;
  const grids = {};
  function buildGrids() {
    for (const fid of Object.keys(F)) {
      const lv = F[fid].lv, g = new Uint8Array(N * N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) g[i * N + j] = W.walkLevel[lv](i / R, j / R) ? 1 : 0;
      for (const it of W.LAYOUT[fid] || []) {
        const d = W.OBJ[it.o]; if (!d || d.wall || it.z) continue;
        const a = it.f ? d.b : d.a, b = it.f ? d.a : d.b;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const u = i / R, v = j / R; if (u > it.u - .15 && u < it.u + a + .15 && v > it.v - .15 && v < it.v + b + .15) g[i * N + j] = 0; }
      }
      grids[fid] = g;
    }
  }
  const free = (fid, u, v) => { const i = Math.round(u * R), j = Math.round(v * R); return i >= 0 && j >= 0 && i < N && j < N && grids[fid][i * N + j] === 1; };
  function nearestFree(fid, u, v) {
    let best = null, bd = 1e9;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (grids[fid][i * N + j]) { const d = (i / R - u) ** 2 + (j / R - v) ** 2; if (d < bd) { bd = d; best = [i, j]; } }
    return best;
  }
  function astar(fid, u0, v0, u1, v1) {
    const g = grids[fid], s = nearestFree(fid, u0, v0), e = nearestFree(fid, u1, v1);
    if (!s || !e) return null;
    const key = (i, j) => i * N + j, h = (i, j) => Math.hypot(i - e[0], j - e[1]);
    const open = [[h(...s), 0, s[0], s[1]]], came = new Map(), cost = new Map([[key(...s), 0]]);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.42], [1, -1, 1.42], [-1, 1, 1.42], [-1, -1, 1.42]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [, c, i, j] = open.shift();
      if (i === e[0] && j === e[1]) break;
      for (const [di, dj, w] of dirs) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N || !g[key(ni, nj)]) continue;
        if (di && dj && (!g[key(i + di, j)] || !g[key(i, j + dj)])) continue;   // no corner cutting
        const nc = c + w; if (nc < (cost.get(key(ni, nj)) ?? 1e9)) { cost.set(key(ni, nj), nc); came.set(key(ni, nj), [i, j]); open.push([nc + h(ni, nj), nc, ni, nj]); }
      }
    }
    if (!cost.has(key(...e))) return null;
    const path = []; let cur = e; while (cur && !(cur[0] === s[0] && cur[1] === s[1])) { path.unshift([cur[0] / R, cur[1] / R]); cur = came.get(key(...cur)); }
    // string-pull: drop points on straight lines
    const out = []; for (let k = 0; k < path.length; k++) { if (k > 0 && k < path.length - 1) { const [a, b, c] = [path[k - 1], path[k], path[k + 1]]; if ((b[0] - a[0]) === (c[0] - b[0]) && (b[1] - a[1]) === (c[1] - b[1])) continue; } out.push(path[k]); }
    return out;
  }
  // floor graph: lift inside tower, bridges between neighbouring lower floors
  const EDGES = { t1u: ['t1l'], t1l: ['t1u', 't2l'], t2u: ['t2l'], t2l: ['t2u', 't1l', 't3l'], t3u: ['t3l'], t3l: ['t3u', 't2l'] };
  function floorRoute(a, b) {
    const prev = { [a]: null }, q = [a];
    while (q.length) { const f = q.shift(); if (f === b) break; for (const n of EDGES[f]) if (!(n in prev)) { prev[n] = f; q.push(n); } }
    const r = []; let c = b; while (c) { r.unshift(c); c = prev[c]; } return r;
  }

  // ---------------------------------------------------------------- scene
  class HQ extends Phaser.Scene {
    constructor() { super('hq'); this.npcs = {}; this.pets = []; this.lastEvent = 0; this.state = null; this.occupied = new Set(); this.issueVisits = {}; this.furn = []; }
    preload() {
      this.load.image('shell', W.SHELL.img);
      for (const name of Object.keys(W.OBJ)) this.load.image(`obj_${name}`, `/static/game/kit/obj/${name}.webp`);
      const loadSet = (name, a) => {
        for (const [dir, url] of Object.entries(a.rot || {})) this.load.image(`${name}_rot_${dir}`, url);
        for (const [dir, urls] of Object.entries(a.walk || {})) urls.forEach((u, i) => this.load.image(`${name}_walk_${dir}_${i}`, u));
        for (const [anim, dirs] of Object.entries(a.anims || {})) for (const [dir, urls] of Object.entries(dirs)) urls.forEach((u, i) => this.load.image(`${name}_${anim}_${dir}_${i}`, u));
      };
      for (const [n, a] of Object.entries(ASSETS.npc || {})) loadSet(n, a);
      for (const [n, a] of Object.entries(ASSETS.pets || {})) loadSet(n, a);
      (ASSETS.cars || []).forEach((u, i) => this.load.image(`plcar_${i}`, u));
    }
    create() {
      for (const k of this.textures.getTextureKeys()) if (/_(rot|walk|typing|idle|coffee|celebrate|frustrated|talk|yawn|sleep)_|^plcar_/.test(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.cameras.main.setBackgroundColor('#05040d');
      buildGrids();
      this.makeTextures(); this.buildCity(); this.buildTowers(); this.buildFurniture(); this.buildBridges(); this.buildLift();
      this.buildNPCs(); this.buildLabels(); this.updateSky(); this.setupCamera(); this.setupInput();
      if (DEBUG) this.drawDebug();
      this.time.addEvent({ delay: 220, loop: true, callback: () => this.tickFX() });
      this.time.addEvent({ delay: 2600, loop: true, callback: () => this.spawnCar() });
      setInterval(() => this.tickLife(), 1000); setInterval(() => this.updateSky(), 30000);
      this.poll(); setInterval(() => this.poll(), 3000);
      this.scale.on('resize', () => this.fitCamera());
    }
    makeTextures() {
      const mk = (key, w, h, draw) => { if (this.textures.exists(key)) return; const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); this.textures.addCanvas(key, c); };
      mk('px', 2, 2, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2); });
      mk('rain', 2, 18, g => { const gr = g.createLinearGradient(0, 0, 0, 18); gr.addColorStop(0, 'rgba(170,200,255,0)'); gr.addColorStop(1, 'rgba(200,220,255,.8)'); g.fillStyle = gr; g.fillRect(0, 0, 2, 18); });
      mk('glow', 128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      mk('shadow', 64, 32, g => { const gr = g.createRadialGradient(32, 16, 0, 32, 16, 32); gr.addColorStop(0, 'rgba(0,0,10,.55)'); gr.addColorStop(1, 'rgba(0,0,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 32); });
      mk('puff', 24, 24, g => { const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12); gr.addColorStop(0, 'rgba(235,235,245,.8)'); gr.addColorStop(1, 'rgba(235,235,245,0)'); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); });
      mk('smoke', 48, 48, g => { const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, 'rgba(120,120,135,.7)'); gr.addColorStop(1, 'rgba(120,120,135,0)'); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); });
      mk('spark', 4, 4, g => { g.fillStyle = '#fde047'; g.fillRect(0, 0, 4, 4); });
      mk('car', 24, 8, g => { g.fillStyle = '#111827'; g.fillRect(0, 0, 24, 8); g.fillStyle = '#f472b6'; g.fillRect(0, 6, 24, 2); });
    }

    // ---------------------------------------------------------- city
    buildCity() {
      const w = W.WORLD_W, h = W.WORLD_H;
      this.skyG = this.add.graphics().setDepth(-1000);
      const layer = (key, height, color, lit, seed, scale) => {
        const c = document.createElement('canvas'); c.width = Math.ceil(w / scale); c.height = Math.ceil(height / scale); const g = c.getContext('2d');
        let s = seed; const Rn = () => (s = (s * 9301 + 49297) % 233280) / 233280;
        for (let x = 0; x < c.width;) {
          const bw = 12 + Math.floor(Rn() * 40), bh = c.height * (0.25 + Rn() * 0.75);
          g.fillStyle = color; g.fillRect(x, c.height - bh, bw, bh);
          for (let wy = c.height - bh + 5; wy < c.height - 4; wy += 5) for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (Rn() < lit) { g.fillStyle = pick(['#fde68a', '#67e8f9', '#f9a8d4', '#c4b5fd']); g.fillRect(wx, wy, 2, 2); }
          if (Rn() > .8) { g.fillStyle = pick(['#f472b6', '#22d3ee', '#a78bfa']); g.fillRect(x + 2, c.height - bh + 8, bw - 4, 3); }
          x += bw + Math.floor(Rn() * 6);
        }
        this.textures.addCanvas(key, c);
        return this.add.image(0, h, key).setOrigin(0, 1).setScale(scale).setDepth(-900);
      };
      this.cityLayers = [layer('city_far', h * .85, '#15143a', .14, 11, 2), layer('city_mid', h * .6, '#0e0d28', .22, 23, 2), layer('city_near', h * .32, '#08071a', .3, 47, 2)];
      this.cars = this.add.container(0, 0).setDepth(-850); this.carsFront = this.add.container(0, 0).setDepth(9500);
      this.flash = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setDepth(-840);
      this.rain = this.add.particles(0, 0, 'rain', { x: { min: -200, max: w + 200 }, y: -40, lifespan: 2600, speedY: { min: 900, max: 1100 }, speedX: -120, quantity: 6, frequency: 20, alpha: { start: .7, end: .2 }, emitting: false }).setDepth(-845);
      this.snow = this.add.particles(0, 0, 'px', { x: { min: 0, max: w }, y: -20, lifespan: 16000, speedY: { min: 40, max: 80 }, speedX: { min: -20, max: 20 }, scale: { min: 1, max: 2.5 }, quantity: 2, frequency: 60, emitting: false }).setDepth(-845);
    }
    dayPhase() { const h = Q.has('hour') ? +Q.get('hour') : new Date().getHours() + new Date().getMinutes() / 60; return h >= 7 && h < 17 ? 'day' : h >= 17 && h < 19.5 ? 'dusk' : h >= 5 && h < 7 ? 'dawn' : 'night'; }
    weatherKind() { return Q.get('weather') || this.state?.weather?.kind || 'clear'; }
    updateSky() {
      const ph = this.dayPhase(), wk = this.weatherKind(), w = W.WORLD_W, h = W.WORLD_H;
      const pal = { day: [0x2b78c9, 0x8fd3f5], dusk: [0x2a0b4d, 0xe0507a], dawn: [0x241a63, 0xf2995e], night: [0x03020b, 0x1c1747] }[ph];
      const grey = ['rain', 'storm', 'cloudy', 'fog'].includes(wk), g = this.skyG; g.clear();
      for (let i = 0; i < 40; i++) {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(pal[0]), Phaser.Display.Color.ValueToColor(pal[1]), 40, i);
        let col = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        if (grey) { const gc = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(col), Phaser.Display.Color.ValueToColor(0x3f4655), 10, 6); col = Phaser.Display.Color.GetColor(gc.r, gc.g, gc.b); }
        g.fillStyle(col); g.fillRect(-400, -400 + (h + 800) * i / 40, w + 800, (h + 800) / 40 + 2);
      }
      if (ph === 'night' && !grey) for (let i = 0; i < 260; i++) { g.fillStyle(0xffffff, rnd(.2, .9)); g.fillRect(rnd(0, w), rnd(0, h * .45), 2, 2); }
      if (!grey) { g.fillStyle(ph === 'night' ? 0xf5f3ff : 0xfff3c4, 1); g.fillCircle(w * (ph === 'night' ? .9 : .1), 150, ph === 'night' ? 34 : 48); }
      this.cityLayers.forEach(l => l.setTint(ph === 'day' ? 0x6f7bb8 : 0xffffff));
      this.rain.emitting = wk === 'rain' || wk === 'storm'; this.snow.emitting = wk === 'snow';
      (this.winRain || []).forEach(em => { em.emitting = wk === 'rain' || wk === 'storm'; });
      (this.dayWin || []).forEach(o => o.setAlpha({ day: .16, dawn: .08, dusk: .07 }[ph] || 0));
      this.nightDim && this.nightDim.forEach(o => o.setAlpha(ph === 'night' ? .18 : 0));
    }
    spawnCar() {
      const w = W.WORLD_W, h = W.WORLD_H, n = (ASSETS.cars || []).length, dir = Math.random() < .5 ? 1 : -1, front = Math.random() < .3;
      const key = n ? `plcar_${Math.floor(Math.random() * n)}` : 'car';
      const car = this.add.image(dir > 0 ? -150 : w + 150, front ? rnd(60, 260) : rnd(80, h * .7), key).setFlipX(dir < 0).setScale(front ? rnd(1.6, 2.2) : rnd(.6, 1.1)).setAlpha(front ? 1 : .8);
      (front ? this.carsFront : this.cars).add(car);
      this.tweens.add({ targets: car, x: dir > 0 ? w + 150 : -150, duration: front ? rnd(9000, 15000) : rnd(16000, 30000), onComplete: () => car.destroy() });
      W.TOWERS_WIN && [0, 1, 2].forEach(t => W.TOWERS_WIN.forEach(([x0, y0, x1, y1]) => {
        if (Math.random() > .25) return;
        const c = this.add.image(dir > 0 ? W.towerX(t) + x0 - 40 : W.towerX(t) + x1 + 40, W.TOP + rnd(y0 + 30, y1 - 30), key).setScale(rnd(.35, .6)).setFlipX(dir < 0).setAlpha(.85).setDepth(5).setMask(this.winMask[t]);
        this.tweens.add({ targets: c, x: dir > 0 ? W.towerX(t) + x1 + 40 : W.towerX(t) + x0 - 40, duration: rnd(5000, 9000), onComplete: () => c.destroy() });
      }));
      if (this.weatherKind() === 'storm' && Math.random() < .3) { this.flash.setAlpha(.55); this.tweens.add({ targets: this.flash, alpha: 0, duration: 500 }); }
    }

    // ---------------------------------------------------------- towers, mezzanine overlay, windows
    buildTowers() {
      W.TOWERS_WIN = [[600, 110, 1075, 600], [150, 250, 430, 555], [600, 1190, 830, 1320]];
      const NEON = [0x22d3ee, 0xc084fc, 0xf472b6];
      this.shells = []; this.winMask = []; this.winRain = []; this.dayWin = []; this.nightDim = [];
      for (let t = 0; t < 3; t++) {
        const x = W.towerX(t), y = W.TOP;
        this.shells.push(this.add.image(x, y, 'shell').setOrigin(0).setDepth(0));
        // windows mask (traffic + rain behind glass)
        const mg = this.make.graphics({ add: false }); mg.fillStyle(0xffffff); W.TOWERS_WIN.forEach(([a, b, c, d]) => mg.fillRect(x + a, y + b, c - a, d - b));
        this.winMask.push(mg.createGeometryMask());
        const em = this.add.particles(0, 0, 'rain', { x: { min: x, max: x + W.SHELL.w }, y: y + 80, lifespan: 1600, speedY: { min: 700, max: 900 }, speedX: -60, quantity: 2, frequency: 30, alpha: { start: .55, end: .1 }, emitting: false }).setDepth(6);
        em.setMask(this.winMask[t]); this.winRain.push(em);
        const dw = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD); W.TOWERS_WIN.forEach(([a, b, c, d]) => { dw.fillStyle(0x9fd4ff, 1); dw.fillRect(x + a, y + b, c - a, d - b); }); dw.setAlpha(0); this.dayWin.push(dw);
        // tower colour identity: tinted glow on the ceiling neon strips
        for (const [sx, sy, sw] of [[280, 170, 520], [840, 70, 520], [560, 1215, 1000]]) this.add.image(x + sx, y + sy, 'glow').setTint(NEON[t]).setScale(sw / 64, .5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.35).setDepth(7);
        // mezzanine overlay: the upper slab + glass railing are drawn above everything on the lower level
        const ov = this.add.image(x, y, 'shell').setOrigin(0).setDepth(5000);
        const og = this.make.graphics({ add: false }); og.fillStyle(0xffffff);
        const outline = [[0, 0], [10, 0], [10, 3.55], [4.45, 3.55], [4.45, 10], [0, 10]].map(([u, v]) => P(`t${t + 1}u`, u, v));
        for (let dy = -70; dy <= 95; dy += 4) og.fillPoints(outline.map(p => new Phaser.Geom.Point(p.x, p.y + dy)), true);
        ov.setMask(og.createGeometryMask());
      }
    }

    // ---------------------------------------------------------- furniture
    buildFurniture() {
      this.screens = []; this.leds = []; this.glows = [];
      for (const fid of Object.keys(W.LAYOUT)) for (const it of W.LAYOUT[fid]) {
        const d = W.OBJ[it.o]; if (!d) continue;
        const a = it.f ? d.b : d.a, b = it.f ? d.a : d.b;
        const front = P(fid, it.u + a, it.v + b);
        const img = this.add.image(front.x, front.y - (it.z || 0), `obj_${it.o}`).setScale(d.s).setFlipX(!!it.f);
        img.setOrigin(b / (a + b), 1);
        img.setDepth(depthOf(fid, front.y) - (it.z ? 30 : 0));
        if (!it.z && !d.wall) { const sh = this.add.image(front.x - (b - a) * 12, front.y - 6, 'shadow').setScale((a + b) * .9, (a + b) * .5).setDepth(depthOf(fid, front.y) - 1).setAlpha(.6); }
        it.sprite = img; it.fid = fid; this.furn.push(it);
        const bb = img.getBounds();
        if (/^desk/.test(it.o)) this.screens.push({ g: this.add.graphics().setDepth(img.depth + .1).setBlendMode(Phaser.BlendModes.ADD), x: bb.x + bb.width * .12, y: bb.y + bb.height * .04, w: bb.width * .76, h: bb.height * .32, agent: it.agent });
        if (it.o === 'rack') for (let k = 0; k < 26; k++) this.leds.push(this.add.rectangle(rnd(bb.x + bb.width * .25, bb.x + bb.width * .7), rnd(bb.y + bb.height * .15, bb.y + bb.height * .85), 4, 3, pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6])).setDepth(img.depth + .1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.2));
        const glow = { vending: 0xa78bfa, arcade_blue: 0x60a5fa, arcade_pink: 0xf472b6, lamp: 0xfde68a, holo: 0x67e8f9, ringlight: 0xfdf4ff, tv_chart: 0x8fd0e4, scanner: 0x4ade80 }[it.o];
        if (glow) this.glows.push(this.add.image(bb.centerX, bb.y + bb.height * .35, 'glow').setTint(glow).setScale(Math.max(bb.width, bb.height) / 90).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.3).setDepth(img.depth + .2));
        if (it.o === 'coffee') this.add.particles(bb.x + bb.width * .55, bb.y + bb.height * .25, 'puff', { lifespan: 2200, speedY: { min: -40, max: -25 }, speedX: { min: -8, max: 8 }, scale: { start: .5, end: 1.5 }, alpha: { start: .5, end: 0 }, frequency: 380 }).setDepth(img.depth + .3);
      }
      this.dark = this.add.rectangle(0, 0, W.WORLD_W, W.WORLD_H, 0x0a0820, 0).setOrigin(0).setDepth(9400).setBlendMode(Phaser.BlendModes.MULTIPLY);
      // per-room alarm beacons
      this.beacons = {};
      for (const r of W.ROOMS) {
        const c = this.roomCenter(r); const halo = this.add.image(c.x, c.y - 330, 'glow').setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(9450).setVisible(false);
        this.tweens.add({ targets: halo, alpha: { from: 1, to: .15 }, duration: 520, yoyo: true, repeat: -1 });
        const smoke = this.add.particles(c.x, c.y - 120, 'smoke', { lifespan: 3500, speedY: { min: -40, max: -20 }, speedX: { min: -10, max: 10 }, scale: { start: 1, end: 4 }, alpha: { start: .45, end: 0 }, frequency: 260, emitting: false }).setDepth(9440);
        this.beacons[r.id] = { halo, smoke };
      }
    }
    roomCenter(r) { const lv = F[r.floor].lv; const [u, v] = r.side === '*' ? [5, 6] : r.side === 'L' ? (lv === 'u' ? [2.2, 6.5] : [2.5, 6.5]) : (lv === 'u' ? [5.8, 1.8] : [7.5, 6.8]); return P(r.floor, u, v); }

    // ---------------------------------------------------------- bridges + lift
    buildBridges() {
      this.bridges = [];
      for (let t = 0; t < 2; t++) {
        const a = P(`t${t + 1}l`, ...W.BRIDGE.out), b = P(`t${t + 2}l`, ...W.BRIDGE.in);
        const g = this.add.graphics().setDepth(8800);
        const th = 34;
        g.fillStyle(0x0e1230, .92); g.fillPoints([new Phaser.Geom.Point(a.x - 20, a.y - 6), new Phaser.Geom.Point(b.x + 20, b.y - 6), new Phaser.Geom.Point(b.x + 20, b.y + th), new Phaser.Geom.Point(a.x - 20, a.y + th)], true);
        g.lineStyle(3, 0x22d3ee, .9); g.lineBetween(a.x - 20, a.y - 6, b.x + 20, b.y - 6); g.lineStyle(3, 0xc084fc, .8); g.lineBetween(a.x - 20, a.y + th, b.x + 20, b.y + th);
        g.fillStyle(0x93c5fd, .08); g.fillPoints([new Phaser.Geom.Point(a.x - 20, a.y - 6), new Phaser.Geom.Point(b.x + 20, b.y - 6), new Phaser.Geom.Point(b.x + 20, b.y - 150), new Phaser.Geom.Point(a.x - 20, a.y - 150)], true);
        g.lineStyle(2, 0x67e8f9, .35); g.lineBetween(a.x - 20, a.y - 150, b.x + 20, b.y - 150);
        for (let k = 0; k <= 6; k++) { const x = a.x - 20 + (b.x - a.x + 40) * k / 6, y0 = a.y - 6 + (b.y - a.y) * k / 6; g.lineStyle(2, 0x67e8f9, .25); g.lineBetween(x, y0, x, y0 - 144); }
        // doorways cut in the tower sides
        for (const p of [a, b]) { g.fillStyle(0x0b1026, .55); g.fillRect(p.x - 30, p.y - 165, 60, 160); g.lineStyle(3, 0x22d3ee, .85); g.strokeRect(p.x - 30, p.y - 165, 60, 160); g.fillStyle(0x22d3ee, .9); g.fillRect(p.x - 30, p.y - 165, 60, 5); }
        this.bridges.push({ a, b });
      }
    }
    buildLift() {
      this.cabs = [0, 1, 2].map(t => {
        const p = P(`t${t + 1}l`, ...W.LIFT.cab);
        const g = this.add.graphics().setDepth(8900); g.fillStyle(0x8fd0e4, .05); g.fillRect(-55, -220, 110, 220); g.lineStyle(2, 0x67e8f9, .35); g.strokeRect(-55, -220, 110, 220); g.fillStyle(0x67e8f9, .45); g.fillRect(-55, -4, 110, 5); g.fillStyle(0x67e8f9, .35); g.fillRect(-55, -220, 110, 4);
        g.setPosition(p.x, p.y); g.lowerY = p.y; g.upperY = P(`t${t + 1}u`, ...W.LIFT.cab).y; g.busy = false; return g;
      });
    }

    // ---------------------------------------------------------- NPCs & labels
    buildNPCs() {
      for (const meta of AGENTS_META) {
        const a = (ASSETS.npc || {})[meta.name]; if (!a || !a.rot) continue;
        const desk = this.furn.find(f => f.agent === meta.name); if (!desk) continue;
        const anims = {}, poses = {};
        for (const [dir, urls] of Object.entries(a.walk || {})) { const k = `${meta.name}_walk_${dir}`; if (!this.anims.exists(k)) this.anims.create({ key: k, frames: urls.map((_, i) => ({ key: `${meta.name}_walk_${dir}_${i}` })), frameRate: 10, repeat: -1 }); anims[dir] = k; }
        for (const [anim, dirs] of Object.entries(a.anims || {})) for (const [dir, urls] of Object.entries(dirs)) {
          const k = `${meta.name}_${anim}_${dir}`; const idx = urls.map((_, i) => i).slice(urls.length > 4 ? 1 : 0);
          if (!this.anims.exists(k)) this.anims.create({ key: k, frames: idx.map(i => ({ key: `${meta.name}_${anim}_${dir}_${i}` })), frameRate: { typing: 9, idle: 5, coffee: 6, celebrate: 9, frustrated: 8, talk: 8, yawn: 6 }[anim] || 6, repeat: -1, repeatDelay: anim === 'coffee' ? 1200 : 0 });
          (poses[anim] = poses[anim] || {})[dir] = k;
        }
        const work = { floor: desk.fid, u: desk.seat[0], v: desk.seat[1], face: desk.seat[2] };
        grids[work.floor][Math.round(work.u * R) * N + Math.round(work.v * R)] = 1;
        const p = P(work.floor, work.u, work.v);
        const sprite = this.add.sprite(p.x, p.y, `${meta.name}_rot_south-east`).setOrigin(.5, .93).setScale(W.NPC_SCALE);
        const npc = new NPC(this, meta, sprite, anims, poses, work); this.npcs[meta.name] = npc; npc.sitDown();
      }
      for (const s of Object.values(W.SPOTS)) grids[s.floor][Math.round(s.u * R) * N + Math.round(s.v * R)] = 1;
      for (const [name, a] of Object.entries(ASSETS.pets || {})) if (a.rot && Object.keys(a.rot).length) this.pets.push(new Pet(this, name, a));
    }
    buildLabels() {
      this.roomLabels = {};
      for (const r of W.ROOMS) {
        const d = el('room-label', `<span>${r.name}</span><i class="warn"></i>`); d.style.setProperty('--accent', hex(r.accent));
        d.addEventListener('click', () => UI.openRoom(r.id));
        const c = this.roomCenter(r); this.roomLabels[r.id] = { d, x: c.x, y: c.y - (F[r.floor].lv === 'u' ? 360 : 330) };
      }
    }
    drawDebug() {
      const g = this.add.graphics().setDepth(99999);
      for (const fid of Object.keys(F)) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const p = P(fid, i / R, j / R); g.fillStyle(grids[fid][i * N + j] ? 0x22ff88 : 0xff3344, .8); g.fillCircle(p.x, p.y, 4); }
    }

    // ---------------------------------------------------------- camera & input
    setupCamera() { this.cameras.main.setBounds(-W.WORLD_W, -W.WORLD_H, W.WORLD_W * 3, W.WORLD_H * 3); this.fitCamera(true); }
    fitCamera(first) {
      const cam = this.cameras.main, w = this.scale.width, h = this.scale.height;
      const fit = Math.min(w / (W.WORLD_W - W.MARGIN * 2 + 160), h / (W.SHELL.h + 60));
      this.minZoom = fit * .8; this.fitZoom = fit;
      if (first || cam.zoom < this.minZoom) cam.setZoom(fit);
      cam.centerOn(W.WORLD_W / 2, W.TOP + W.SHELL.h / 2);
    }
    setupInput() {
      const cam = this.cameras.main; let down = null;
      this.input.on('pointerdown', p => { down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false }; });
      this.input.on('pointermove', p => { if (down && p.isDown) { const dx = p.x - down.x, dy = p.y - down.y; if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true; cam.setScroll(down.sx - dx / cam.zoom, down.sy - dy / cam.zoom); } else this.hover(p); });
      this.input.on('pointerup', p => { if (down && !down.moved) this.click(p); down = null; });
      this.input.on('wheel', (p, o, dx, dy) => { const nz = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? .88 : 1.14), this.minZoom, this.fitZoom * 6); const a = cam.getWorldPoint(p.x, p.y); cam.setZoom(nz); const b = cam.getWorldPoint(p.x, p.y); cam.scrollX += a.x - b.x; cam.scrollY += a.y - b.y; });
      this.input.keyboard.on('keydown-HOME', () => this.fitCamera(true));
    }
    roomAt(wp) {
      for (const lv of ['u', 'l']) for (let t = 0; t < 3; t++) {
        const fid = `t${t + 1}${lv}`, { u, v } = inv(fid, wp.x, wp.y + (lv === 'u' ? 40 : 0));
        const raised = inv(fid, wp.x, wp.y + 240);   // clicks on furniture / walls above the floor
        for (const c of [{ u, v }, raised]) if (W.walkLevel[lv](Math.min(9.99, Math.max(0, c.u)), Math.min(9.99, Math.max(0, c.v))) && c.u >= -.3 && c.v >= -.3 && c.u <= 10.3 && c.v <= 10.3) return W.roomOf(fid, c.u);
      }
      return null;
    }
    npcAt(wp) { let best = null; for (const n of [...Object.values(this.npcs), ...this.pets]) if (Phaser.Geom.Rectangle.Contains(n.sprite.getBounds(), wp.x, wp.y)) best = n; return best; }
    hover(p) {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y), r = this.npcAt(wp) ? null : this.roomAt(wp);
      this.game.canvas.style.cursor = (r || this.npcAt(wp)) ? 'pointer' : 'grab';
      if (r !== this.hoverRoom) { this.hoverRoom = r; UI.tooltip(r ? `${r.name}${r.agent ? ' · ' + r.agent : ''} — klik untuk masuk` : ''); }
    }
    click(p) { const wp = this.cameras.main.getWorldPoint(p.x, p.y), n = this.npcAt(wp); if (n) return n instanceof Pet ? n.say(pick(['Meow~', 'Mrrr…', 'Prrr 💜'])) : UI.openNPC(n); const r = this.roomAt(wp); if (r) UI.openRoom(r.id); }

    // ---------------------------------------------------------- fx tick
    tickFX() {
      const st = this.state, statusOf = (n) => st?.agents?.find(a => a.name === n)?.status || 'idle', night = this.dayPhase() === 'night';
      for (const s of this.screens) {
        const g = s.g; g.clear(); const working = !s.agent || ['working', 'queued'].includes(statusOf(s.agent));
        for (let k = 0; k < 7; k++) { if (Math.random() < (working ? .35 : .8)) continue; const y = s.y + (k + .5) * s.h / 7, len = rnd(.1, .35) * s.w, x = s.x + rnd(0, s.w - len); g.fillStyle(pick([0x22d3ee, 0x4ade80, 0xa78bfa]), working ? .3 : .12); g.fillRect(x, y, len, 3); }
      }
      const cpu = (st?.system?.cpu ?? 25) / 100;
      for (const l of this.leds) if (Math.random() < .12 + cpu * .6) l.setAlpha(l.alpha > .5 ? .15 : rnd(.6, 1));
      for (const gl of this.glows) gl.setAlpha((night ? .4 : .22) + rnd(-.04, .04));
    }

    // ---------------------------------------------------------- server state
    async poll() {
      try {
        const r = await fetch(`/api/world?since=${this.lastEvent}`); if (!r.ok) throw new Error(r.status);
        const st = await r.json(), first = !this.state, prevW = this.state?.weather?.kind; this.state = st; this.lastEvent = st.last_event;
        for (const a of st.agents) this.npcs[a.name]?.setServerStatus(a);
        if (!first) for (const ev of st.events) this.onEvent(ev);
        this.applyIssues(st.issues); if (prevW !== st.weather?.kind) this.updateSky(); UI.hud(st);
      } catch (e) { UI.hud(null, e); }
    }
    onEvent(ev) {
      const n = this.npcs[ev.agent]; if (!n) return;
      if (ev.kind === 'running') { n.thought = ev.text; n.think(ev.text); return; }
      if (ev.kind === 'done' || ev.kind === 'published') { n.thought = null; n.say(ev.text, 7000, 'say'); UI.toast(ev, 'ok'); if (n.mode !== 'work') n.celebrate(); if (ev.handoff && this.npcs[ev.handoff] && ev.handoff !== ev.agent) n.deliver(this.npcs[ev.handoff]); }
      else if (ev.kind === 'failed') { n.say(ev.text, 9000, 'alert'); UI.toast(ev, 'err'); if (n.mode !== 'work') n.upset(); }
      else if (ev.kind === 'waiting_approval') { n.say(ev.text, 8000, 'alert'); UI.toast(ev, 'warn'); }
      else if (ev.kind === 'retrying') n.think(ev.text);
      n.log(ev.text);
    }
    applyIssues(list) {
      const byRoom = {}; for (const i of list || []) (byRoom[i.room] = byRoom[i.room] || []).push(i); this.issues = byRoom;
      for (const r of W.ROOMS) {
        const b = this.beacons[r.id], iss = byRoom[r.id] || [], err = iss.some(i => i.level === 'error'), warn = iss.some(i => i.level === 'warn'), appr = iss.some(i => i.level === 'approval');
        const on = err || warn || appr; b.halo.setVisible(on).setTint(err ? 0xef4444 : appr ? 0xf472b6 : 0xfacc15); b.smoke.emitting = err && (r.id === 'server' || iss.length > 1);
        const lab = this.roomLabels[r.id].d; lab.classList.toggle('alarm', on); lab.querySelector('.warn').textContent = on ? (appr && !err ? '!' : '⚠') : ''; lab.title = iss.map(i => i.text).join('\n');
      }
    }

    // ---------------------------------------------------------- life
    tickLife() {
      const npcs = Object.values(this.npcs), night = this.dayPhase() === 'night', freeN = npcs.filter(n => n.isFree());
      for (const n of npcs) n.tick();
      const zero = this.npcs['ZERO-1'];
      if (zero && zero.isFree() && this.issues) {
        const rooms = Object.entries(this.issues).filter(([rid, iss]) => iss.some(i => i.level === 'error' || i.level === 'warn') && (!this.issueVisits[rid] || nowMs() - this.issueVisits[rid] > 120000));
        if (rooms.length) { const [rid, iss] = rooms[0]; this.issueVisits[rid] = nowMs(); zero.service(W.roomById[rid], iss[0]); }
      }
      for (const n of freeN) {
        if (nowMs() < n.nextDecision || !n.isFree()) continue;
        n.nextDecision = nowMs() + rnd(14000, 30000); const r = Math.random();
        if (night && r < .35) n.goSpot(pick(['couch1', 'couch2', 'bean1', 'bean2', 'bean3']), true);
        else if (r < .25) n.wander();
        else if (r < .4) n.goSpot(pick(['coffee', 'vending', 'water']));
        else if (r < .58) { const partner = freeN.find(m => m !== n && m.isFree() && Math.random() < .6); partner ? this.startChat(n, partner) : n.wander(); }
        else if (r < .7) n.goSpot(pick(['arcade', 'arcade2']));
        else if (r < .82) n.goSpot(pick(['couch1', 'couch2', 'bean1', 'bean2', 'bean3']));
        else n.goDesk();
      }
    }
    startChat(a, b) {
      const pairs = [['chatA', 'chatB'], ['pingA', 'pingB']].filter(([p, q]) => !this.occupied.has(p) && !this.occupied.has(q)); if (!pairs.length) return a.wander();
      const [sa, sb] = pick(pairs), conv = { a, b, arrived: 0, ping: sa === 'pingA' }; a.joinChat(conv, sa); b.joinChat(conv, sb);
    }
    async runChat(conv) {
      let lines; try { lines = await (await fetch('/api/world/banter')).json(); } catch (e) { lines = ['Hai!', 'Halo, lagi santai?']; }
      const seq = [[conv.a, lines[0]], [conv.b, lines[1]]]; if (conv.ping) seq.push([conv.a, 'Servis keras! 🏓'], [conv.b, 'Hampir!']);
      let t = 0; for (const [who, text] of seq) { setTimeout(() => { if (who.inChat) { who.say(text, 3800, 'chat'); who.emote('talk', 3600); } }, t); t += 4200; }
      setTimeout(() => { conv.a.endChat(); conv.b.endChat(); }, t + 600);
    }
    update() {
      const t = performance.now(), dt = Math.min(120, t - (this._last || t)); this._last = t;   // real time, independent of fps
      for (const n of Object.values(this.npcs)) n.update(dt); for (const p of this.pets) p.update(dt); UI.layout(this);
    }
  }

  // ---------------------------------------------------------------- NPC
  class NPC {
    constructor(scene, meta, sprite, anims, poses, work) {
      Object.assign(this, { scene, meta, sprite, anims, poses, work });
      this.name = meta.name; this.floor = work.floor; this.u = work.u; this.v = work.v; this.speed = 130; this.mode = 'free'; this.server = { status: 'idle' };
      this.nextDecision = nowMs() + rnd(4000, 15000); this.history = []; this.thought = null; this.facing = work.face; this.legs = [];
      this.shadow = scene.add.image(sprite.x, sprite.y, 'shadow').setScale(1.6, .9).setAlpha(.7);
      sprite.setTint(0xd6dcff);   // blend with the cool interior light
      this.tag = el('npc-tag', `<b>${meta.name}</b>`); this.tag.style.setProperty('--c', meta.color);
      this.icon = el('npc-icon', ''); this.bubble = el('bubble hidden', ''); this.carry = el('npc-carry hidden', '📄'); this.zzz = el('npc-zzz hidden', 'z<small>z</small>');
      this.tag.addEventListener('click', () => UI.openNPC(this)); this.bubble.addEventListener('click', () => UI.openNPC(this)); this.rot = true;
    }
    log(t) { this.history.unshift({ t, at: new Date().toLocaleTimeString().slice(0, 5) }); this.history = this.history.slice(0, 12); }
    setTex(dir) { const k = `${this.name}_rot_${dir}`; if (this.scene.textures.exists(k)) this.sprite.setTexture(k).setFlipX(false); }
    pose(anim, dir) {
      const p = this.poses[anim]; if (!p) return false; const flip = { 'north-east': 'north-west', 'north-west': 'north-east', 'south-west': 'south-east', 'south-east': 'south-west' };
      let k = p[dir], f = false; if (!k && p[flip[dir]]) { k = p[flip[dir]]; f = true; } if (!k) return false; this.sprite.setFlipX(f).play(k, true); this.posing = anim; return true;
    }
    endPose() { if (this.posing) { this.posing = null; this.sprite.anims.stop(); this.setTex(this.facing); } }
    emote(anim, ms = 3200) {
      if (this.moving || this.sitting) return false; const dir = this.facing.startsWith('south') ? this.facing : 'south-east'; if (!this.pose(anim, dir)) return false;
      clearTimeout(this._emo); this._emo = setTimeout(() => { if (this.posing === anim) { this.endPose(); this.pose('idle', this.facing.startsWith('south') ? this.facing : 'south-east'); } }, ms); return true;
    }
    celebrate() { if (this.sitting) this.standUp(); this.facing = 'south-east'; this.emote('celebrate', 3400); }
    upset() { if (this.sitting) this.standUp(); this.facing = 'south-east'; this.emote('frustrated', 4200); }
    atWork() { return this.floor === this.work.floor && Math.hypot(this.u - this.work.u, this.v - this.work.v) < .3; }
    sitDown() { this.sitting = true; if (this.atWork() && this.pose('typing', this.work.face)) { if (!['working', 'queued'].includes(this.server.status)) this.sprite.anims.pause(); } }
    standUp() { this.endPose(); this.sitting = false; }
    isFree() { return this.mode === 'free' && !this.inChat && !['working', 'queued'].includes(this.server.status); }
    release() { if (this.spot) { this.scene.occupied.delete(this.spot); this.spot = null; } this.zzz.classList.add('hidden'); }

    // plan a route across floors: A* on each floor, lift rides and bridge walks in between
    goTo(floor, u, v, face, cb) {
      this.standUp(); const route = floorRoute(this.floor, floor), legs = []; let cf = this.floor, cu = this.u, cv = this.v;
      for (let k = 1; k < route.length; k++) {
        const nf = route[k], same = F[nf].t === F[cf].t;
        if (same) { const exitPt = W.LIFT[F[cf].lv]; legs.push({ walk: cf, u0: cu, v0: cv, u1: exitPt[0], v1: exitPt[1] }); legs.push({ lift: true, from: cf, to: nf }); [cu, cv] = W.LIFT[F[nf].lv]; }
        else { const outPt = F[nf].t > F[cf].t ? W.BRIDGE.out : W.BRIDGE.in, inPt = F[nf].t > F[cf].t ? W.BRIDGE.in : W.BRIDGE.out; legs.push({ walk: cf, u0: cu, v0: cv, u1: outPt[0], v1: outPt[1] }); legs.push({ bridge: true, from: cf, to: nf, u: inPt[0], v: inPt[1] }); [cu, cv] = inPt; }
        cf = nf;
      }
      legs.push({ walk: floor, u0: cu, v0: cv, u1: u, v1: v });
      this.legs = legs; this.face_ = face; this.cb = cb; this.nextLeg();
    }
    nextLeg() {
      const leg = this.legs.shift();
      if (!leg) { this.moving = false; this.sprite.anims.stop(); if (this.face_) { this.facing = this.face_; this.setTex(this.facing); } if (!this.sitting && this.facing.startsWith('south')) this.pose('idle', this.facing); const cb = this.cb; this.cb = null; cb && cb(true); return; }
      if (leg.walk) { const path = astar(leg.walk, leg.u0, leg.v0, leg.u1, leg.v1) || []; path.push([leg.u1, leg.v1]); this.wps = path.map(([u, v]) => ({ fid: leg.walk, u, v })); this.moving = true; return; }
      if (leg.lift) return this.rideLift(leg);
      if (leg.bridge) { const p = P(leg.to, leg.u, leg.v); this.wps = [{ fid: leg.to, u: leg.u, v: leg.v, raw: p, bridge: true }]; this.moving = true; return; }
    }
    rideLift(leg) {
      const t = F[leg.from].t, cab = this.scene.cabs[t];
      const inCab = P(leg.from, ...W.LIFT.cab);
      const start = () => {
        if (cab.busy) return setTimeout(start, 500);
        cab.busy = true; this.moving = false; this.sprite.anims.stop(); this.setTex('south-west');
        const toUp = F[leg.to].lv === 'u';
        // phase 1: cabin comes to this level, phase 2: ride with the passenger
        this.lift = { cab, leg, phase: 1, y1: toUp ? cab.lowerY : cab.upperY, y2: toUp ? cab.upperY : cab.lowerY };
      };
      this.wps = [{ fid: leg.from, u: W.LIFT.cab[0], v: W.LIFT.cab[1], raw: inCab, then: start }]; this.moving = true;
    }
    liftStep(dt) {
      const L = this.lift, cab = L.cab, speed = 320 * dt / 1000, target = L.phase === 1 ? L.y1 : L.y2;
      const d = target - cab.y;
      if (Math.abs(d) <= speed) {
        cab.y = target;
        if (L.phase === 1) { L.phase = 2; this.riding = true; const p = P(L.leg.from, ...W.LIFT.cab); this.sprite.setPosition(p.x, p.y); return; }
        this.lift = null; this.riding = false; cab.busy = false; this.floor = L.leg.to; [this.u, this.v] = W.LIFT.cab;
        const p = P(L.leg.to, ...W.LIFT.cab); this.sprite.setPosition(p.x, p.y); this.nextLeg(); return;
      }
      cab.y += Math.sign(d) * speed; if (L.phase === 2) this.sprite.y = cab.y;
    }
    update(dt) {
      if (this.lift) this.liftStep(dt);
      if (this.moving && this.wps && this.wps.length) {
        const wp = this.wps[0], tgt = wp.raw || P(wp.fid, wp.u, wp.v);
        const dx = tgt.x - this.sprite.x, dy = tgt.y - this.sprite.y, dist = Math.hypot(dx, dy), step = this.speed * dt / 1000;
        const dir = dx >= 0 ? (dy >= 0 ? 'south-east' : 'north-east') : (dy >= 0 ? 'south-west' : 'north-west');
        this.posing = null; const base = dir.startsWith('north') ? 'north-east' : 'south-east', k = this.anims[base];
        if (k) { this.sprite.setFlipX(dir.endsWith('west')); if (this.sprite.anims.currentAnim?.key !== k || !this.sprite.anims.isPlaying) this.sprite.play(k); }
        this.facing = dir; this.onBridge = !!wp.bridge;
        if (dist <= step) {
          this.sprite.setPosition(tgt.x, tgt.y); this.wps.shift(); this.floor = wp.fid; this.u = wp.u; this.v = wp.v;
          if (wp.then) { this.wps = []; this.moving = false; wp.then(); return; }
          if (!this.wps.length) { this.moving = false; this.onBridge = false; this.nextLeg(); }
        } else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      const d = this.riding || this.onBridge ? 9000 + this.sprite.y / 10 : depthOf(this.floor, this.sprite.y) + .5;
      this.sprite.setDepth(d); this.shadow.setPosition(this.sprite.x, this.sprite.y - 4).setDepth(d - .2).setVisible(!this.sitting && !this.riding);
    }
    setServerStatus(a) {
      const prev = this.server.status; this.server = a; if (a.status === prev) return;
      this.icon.className = 'npc-icon ' + (a.status === 'error' ? 'err' : a.status === 'waiting' ? 'wait' : ''); this.icon.textContent = a.status === 'error' ? '!' : a.status === 'waiting' ? '?' : '';
      if (this.posing === 'typing') ['working', 'queued'].includes(a.status) ? this.sprite.anims.resume() : this.sprite.anims.pause();
      if (a.status === 'working' || a.status === 'queued') { if (this.inChat) this.endChat(true); this.release(); this.mode = 'work'; this.goDesk(true); }
      else if (a.status === 'waiting') this.say(this.name === 'NYX-21' ? 'Ada listing menunggu approval kamu! Klik aku.' : 'Menunggu keputusan kamu…', 7000, 'alert');
      else if (this.mode === 'work') { this.mode = 'free'; this.nextDecision = nowMs() + rnd(4000, 9000); }
    }
    tick() {
      if (this.mode === 'work' && this.sitting && Math.random() < .08) this.think(this.thought || pick(['Fokus…', 'Hampir selesai…', 'Cek ulang datanya…']));
      if (this.server.status === 'waiting' && Math.random() < .03) this.say('Butuh approval kamu 👀', 4000, 'alert');
      if (this.server.status === 'error' && Math.random() < .03) this.say('Ada yang error, cek ruanganku ya.', 5000, 'alert');
      if (this.mode === 'free' && !this.moving && !this.inChat && !this.sitting && !this.posing && Math.random() < (this.scene.dayPhase() === 'night' ? .04 : .012)) { if (this.emote('yawn', 3500)) this.say(pick(['Hoaam… ngantuk.', 'Peregangan dulu~', 'Butuh kopi…']), 3000, 'chat'); }
      if (this.mode === 'free' && !this.moving && !this.inChat && Math.random() < .015) this.think(pick(['Hmm…', 'Ide konten baru…', 'Kopi lagi?', 'Data hari ini menarik.']));
    }
    goDesk(working) { const w = this.work; this.goTo(w.floor, w.u, w.v, w.face, () => { this.sitDown(); if (working) { this.sprite.anims.resume(); this.think(this.thought || 'Mulai kerja…'); } }); }
    wander() { this.mode = 'busy'; const fid = Math.random() < .75 ? this.work.floor : pick(Object.keys(F)); let c = null; for (let k = 0; k < 30 && !c; k++) { const u = rnd(0, 10), v = rnd(0, 10); if (free(fid, u, v)) c = [u, v]; } if (!c) { this.mode = 'free'; return; } this.goTo(fid, c[0], c[1], pick(['south-east', 'south-west']), () => { this.mode = 'free'; }); }
    goSpot(id, sleep) {
      const s = W.SPOTS[id]; if (!s || this.scene.occupied.has(id)) return this.wander(); this.scene.occupied.add(id); this.spot = id; this.mode = 'busy';
      this.goTo(s.floor, s.u, s.v, s.face, () => {
        if (s.kind === 'snack') { this.facing = 'south-east'; this.pose('coffee', 'south-east'); this.say(pick(['Kopi dulu ☕', 'Snack biar fokus.', 'Segar!']), 3500, 'chat'); }
        else if (s.kind === 'game') this.say(pick(['Satu ronde aja 🎮', 'Highscore baru!', 'Ayo combo!']), 3500, 'chat');
        else if (s.kind === 'rest') { if (sleep) this.zzz.classList.remove('hidden'); else this.say(pick(['Rebahan sebentar…', 'Nyaman banget.', 'Istirahat 5 menit.']), 3500, 'chat'); }
        setTimeout(() => { if (this.spot === id) { this.release(); this.mode = 'free'; this.goDesk(); } }, s.kind === 'game' ? rnd(14000, 26000) : s.kind === 'rest' ? rnd(15000, 30000) : rnd(6000, 10000));
      });
    }
    joinChat(conv, spot) { this.inChat = conv; this.mode = 'busy'; this.spot = spot; this.scene.occupied.add(spot); const s = W.SPOTS[spot]; this.goTo(s.floor, s.u, s.v, s.face, () => { conv.arrived++; if (conv.arrived === 2) this.scene.runChat(conv); }); setTimeout(() => { if (this.inChat === conv) this.endChat(); }, 90000); }
    endChat(silent) { if (!this.inChat) return; this.inChat = null; this.release(); this.mode = 'free'; if (!silent) this.goDesk(); }
    deliver(target) {
      if (this.mode === 'work') return; this.mode = 'busy'; this.carry.classList.remove('hidden');
      const tw = target.work, near = nearestFree(tw.floor, tw.u + .9, tw.v + .9) || [tw.u, tw.v];
      this.goTo(tw.floor, near[0] / R, near[1] / R, 'north-west', () => {
        this.say(`${target.name}, ini hasilnya. Tolong lanjutkan!`, 4000, 'say'); this.facing = 'south-west'; this.emote('talk', 3800);
        setTimeout(() => target.say(pick(['Siap, aku proses!', 'Oke, langsung aku cek.', 'Mantap, terima kasih!']), 3500, 'say'), 2500);
        setTimeout(() => { this.carry.classList.add('hidden'); this.mode = 'free'; this.goDesk(); }, 4500);
      });
    }
    service(room, issue) {
      this.mode = 'busy'; this.say(`Menuju ${room.name.toLowerCase()} untuk servis…`, 3500, 'say');
      const c = this.scene.roomCenter(room), uv = inv(room.floor, c.x, c.y), n = nearestFree(room.floor, uv.u, uv.v) || [10, 10];
      this.goTo(room.floor, n[0] / R, n[1] / R, 'north-east', () => {
        this.say(`Cek: ${issue.text}`, 6000, 'alert');
        const sp = this.scene.add.particles(this.sprite.x + 30, this.sprite.y - 90, 'spark', { lifespan: 600, speed: { min: 60, max: 160 }, angle: { min: 200, max: 340 }, gravityY: 300, quantity: 3, frequency: 120 }).setDepth(9800);
        setTimeout(() => { sp.destroy(); this.say('Sudah aku cek. Detail ada di ruangan ini — klik ruangannya.', 5000, 'say'); this.mode = 'free'; this.goDesk(); }, 7000);
      });
    }
    say(text, ms = 5000, kind = 'say') { this.bubbleShow(text, ms, kind); this.log(text); }
    think(text) { if (!this.bubbleBusy) this.bubbleShow(text, 3500, 'think'); }
    bubbleShow(text, ms, kind) { const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(text)}`; this.bubbleBusy = kind !== 'think'; clearTimeout(this._bt); this._bt = setTimeout(() => { b.classList.add('hidden'); this.bubbleBusy = false; }, ms); }
  }

  // ---------------------------------------------------------------- office cat (lounge, walks on the grid)
  class Pet {
    constructor(scene, name, a) {
      this.scene = scene; this.name = name; this.floor = 't3l'; this.wps = []; this.next = 0; this.speed = 80;
      const p = P('t3l', 6, 9.5); this.u = 6; this.v = 9.5;
      this.sprite = scene.add.sprite(p.x, p.y, `${name}_rot_south-east`).setOrigin(.5, .9).setScale(2.2).setTint(0xd6dcff);
      const mk = (anim, rate) => { const set = anim === 'walk' ? (a.walk || {}) : ((a.anims || {})[anim] || {}); const dir = Object.keys(set)[0]; if (!dir) return null; const k = `${name}_${anim}_${dir}`; if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: set[dir].map((_, i) => ({ key: `${name}_${anim}_${dir}_${i}` })).slice(1), frameRate: rate, repeat: -1 }); return k; };
      this.walkKey = mk('walk', 10); this.sleepKey = mk('sleep', 3); this.groomKey = mk('idle', 6); this.bubble = el('bubble hidden', '');
    }
    say(t) { const b = this.bubble; b.className = 'bubble chat'; b.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), 3000); }
    update(dt) {
      if (!this.wps.length && nowMs() > this.next) {
        const r = Math.random();
        if (r < .3 && this.sleepKey) { this.sprite.play(this.sleepKey); this.next = nowMs() + rnd(15000, 40000); }
        else if (r < .5 && this.groomKey) { this.sprite.play(this.groomKey); this.next = nowMs() + rnd(5000, 10000); }
        else { let c = null; for (let k = 0; k < 30 && !c; k++) { const u = rnd(0, 10), v = rnd(0, 10); if (free('t3l', u, v)) c = [u, v]; } if (c) this.wps = (astar('t3l', this.u, this.v, c[0], c[1]) || []); this.next = nowMs() + rnd(4000, 10000); }
      }
      if (this.wps.length) {
        const [u, v] = this.wps[0], t = P('t3l', u, v), dx = t.x - this.sprite.x, dy = t.y - this.sprite.y, dist = Math.hypot(dx, dy), step = this.speed * dt / 1000;
        if (this.walkKey && this.sprite.anims.currentAnim?.key !== this.walkKey) this.sprite.play(this.walkKey); this.sprite.setFlipX(dx < 0);
        if (dist <= step) { this.sprite.setPosition(t.x, t.y); this.u = u; this.v = v; this.wps.shift(); if (!this.wps.length) { this.sprite.anims.stop(); this.sprite.setTexture(`${this.name}_rot_south-east`); } }
        else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      this.sprite.setDepth(depthOf('t3l', this.sprite.y) + .4);
    }
  }
  W.HQ = HQ; W.Pet = Pet;
  // ------------------------------------------------------------ UI (DOM overlay)
  const UI = (W.UI = {
    layout(scene) {
      const cam = scene.cameras.main, z = cam.zoom, vx = cam.worldView.x, vy = cam.worldView.y;
      const toS = (x, y) => [(x - vx) * z, (y - vy) * z];
      const k = Math.min(1.6, Math.max(.75, z * 1.6));
      for (const n of Object.values(scene.npcs)) {
        const top = n.sprite.y - n.sprite.displayHeight * .8;
        const [sx, sy] = toS(n.sprite.x, top), [fx, fy] = toS(n.sprite.x, n.sprite.y);
        n.tag.style.transform = `translate(${fx}px, ${fy + 2}px) translate(-50%, 0) scale(${k})`;
        n.icon.style.transform = `translate(${sx}px, ${sy - 4}px) translate(-50%, -100%)`;
        n.bubble.style.transform = `translate(${sx}px, ${sy - (n.icon.textContent ? 22 : 6) * k}px) translate(-50%, -100%) scale(${k})`;
        n.carry.style.transform = `translate(${sx + 14}px, ${sy + 10}px)`; n.zzz.style.transform = `translate(${sx + 10}px, ${sy - 6}px)`;
        n.tag.style.display = z < .28 ? 'none' : ''; n.tag.style.opacity = n.sprite.alpha;
      }
      for (const p of scene.pets) { const [x, y] = toS(p.sprite.x, p.sprite.y - 50); p.bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; }
      for (const l of Object.values(scene.roomLabels)) { const [x, y] = toS(l.x, l.y); l.d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${Math.min(1.6, Math.max(.8, z * 1.8))})`; }
    },
    tooltip(t) { const d = document.getElementById('tip'); d.textContent = t; d.style.opacity = t ? 1 : 0; },
    hud(st) {
      const d = document.getElementById('hud'), now = new Date();
      if (!st) { d.querySelector('.conn').textContent = 'Server tidak terhubung…'; return; }
      const w = st.weather || {}; const icon = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' }[w.kind] || '☁️';
      const g = st.system?.gpu;
      d.querySelector('.clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      d.querySelector('.date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
      d.querySelector('.weather').textContent = `${icon} ${w.temp != null ? Math.round(w.temp) + '°C ' : ''}${w.city || ''}`;
      const m = d.querySelector('.mode'); m.textContent = st.mode === 'demo' ? 'DEMO' : 'LIVE'; m.className = 'mode ' + st.mode;
      d.querySelector('.ai').innerHTML = `🧠 ${st.mode === 'demo' ? 'demo AI' : esc(st.ai.model)} ${st.ai.busy ? '<b class="busy">berpikir…</b>' : ''}`;
      d.querySelector('.sys').textContent = `CPU ${st.system.cpu ?? '-'}% · RAM ${st.system.ram_used_gb ?? '-'}/${st.system.ram_total_gb ?? '-'} GB${g ? ` · GPU ${g.util}% · VRAM ${(g.vram_used_mb / 1024).toFixed(1)}/${(g.vram_total_mb / 1024).toFixed(0)} GB · ${g.temp}°C` : ''}`;
      d.querySelector('.conn').textContent = '';
    },
    toast(ev, kind) {
      const box = document.getElementById('toasts'), meta = AGENTS_META.find(a => a.name === ev.agent) || {};
      const t = el(`toast ${kind}`, `<i style="background:${meta.color}"></i><div><b>${esc(ev.agent)}</b><span>${esc(ev.text)}</span></div>`, box);
      t.addEventListener('click', () => UI.openRoom(meta.room_id)); setTimeout(() => t.classList.add('out'), 9000); setTimeout(() => t.remove(), 9800);
      while (box.children.length > 5) box.firstChild.remove();
    },
    openRoom(id, pageIdx = 0) {
      const r = W.roomById[id]; if (!r) return;
      const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', hex(r.accent));
      const meta = AGENTS_META.find(a => a.name === r.agent);
      p.querySelector('.ptitle').innerHTML = `<b>${r.name}</b>${meta ? `<span>${meta.name} · ${esc(meta.role)}</span>` : '<span>Tempat istirahat, ngopi & main game</span>'}`;
      p.querySelector('.ptabs').innerHTML = r.pages.map(([label], i) => `<button data-i="${i}" class="${i === pageIdx ? 'on' : ''}">${esc(label)}</button>`).join('');
      const frame = p.querySelector('iframe'), info = p.querySelector('.pbody-info');
      if (r.pages.length) { frame.style.display = ''; info.style.display = 'none'; frame.src = r.pages[pageIdx][1]; }
      else { frame.style.display = 'none'; info.style.display = ''; info.innerHTML = UI.loungeInfo(); }
      p.querySelectorAll('.ptabs button').forEach(b => b.onclick = () => UI.openRoom(id, +b.dataset.i));
    },
    loungeInfo() {
      const sc = window.office; const st = sc?.state || {};
      const people = Object.values(sc?.npcs || {}).map(n => `<li><i style="background:${n.meta.color}"></i><b>${n.name}</b> — ${n.inChat ? 'ngobrol' : !n.zzz.classList.contains('hidden') ? 'tidur 💤' : n.spot ? 'santai (' + n.spot + ')' : n.mode === 'work' ? 'bekerja' : n.sitting ? 'di mejanya' : 'jalan-jalan'}</li>`).join('');
      return `<div class="lounge"><h3>Siapa di mana</h3><ul>${people}</ul><p class="muted">Cuaca: ${st.weather?.kind || '-'} (${st.weather?.source || ''}). Tim bekerja saat ada tugas, dan hidup santai saat tidak ada.</p></div>`;
    },
    openNPC(n) {
      const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color);
      const room = W.roomById[n.meta.room_id];
      p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)} · ${room ? room.name : ''}</span>`;
      p.querySelector('.ptabs').innerHTML = room && room.pages.length ? `<button class="on" data-room="1">Masuk ${esc(room.name.toLowerCase())}</button>` : '';
      p.querySelector('iframe').style.display = 'none';
      const info = p.querySelector('.pbody-info'); info.style.display = ''; const st = n.server || {};
      info.innerHTML = `<div class="npc-card"><img src="/static/game/pl/${encodeURIComponent(n.name)}/rot_south.png" alt="">
        <div><p>${esc(n.meta.desc)}</p><p>Status: <b class="st ${st.status}">${st.status || 'idle'}</b> ${st.current ? '· ' + esc(st.current) : ''} ${st.queued ? '· antrean ' + st.queued : ''} ${st.waiting ? '· menunggu approval ' + st.waiting : ''}</p>
        <p class="thought">💭 ${esc(n.thought || 'Tidak sedang memikirkan tugas.')}</p></div></div>
        <h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li><span>${h.at}</span>${esc(h.t)}</li>`).join('') || '<li class="muted">belum ada</li>'}</ul>`;
      const b = p.querySelector('[data-room]'); if (b) b.onclick = () => UI.openRoom(room.id);
    },
    close() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; },
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') UI.close(); if (e.key === '`' || e.key === '~') location.href = '/dashboard'; });
  document.querySelector('#panel .pclose').addEventListener('click', UI.close);
  document.getElementById('panel').addEventListener('click', (e) => { if (e.target.id === 'panel') UI.close(); });
  document.querySelector('#panel iframe').addEventListener('load', (e) => { try { e.target.contentWindow.document.addEventListener('keydown', (k) => { if (k.key === 'Escape') UI.close(); }); } catch (err) { /* noop */ } });

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#05040d', antialias: true, roundPixels: false,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    fps: { target: 60, limit: 45 }, scene: [HQ],
  });
  setTimeout(() => { window.office = game.scene.getScene('hq'); }, 800);
})();
