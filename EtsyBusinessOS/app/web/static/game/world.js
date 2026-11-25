// Living office scene (Phaser 3). Server state drives the NPCs; idle time is simulated life.
(function () {
  const W = window.W;
  const { TW, TH, GW, GH, WALL_H, iso } = W;
  const ASSETS = window.ASSETS || { npc: {}, tiles: {} };
  const AGENTS_META = window.AGENTS_META || [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nowMs = () => performance.now();

  // ------------------------------------------------------------------ DOM overlay helpers
  const overlay = document.getElementById('overlay');
  function el(cls, html = '', parent = overlay) { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ Scene
  class Office extends Phaser.Scene {
    constructor() { super('office'); this.npcs = {}; this.lastEvent = 0; this.state = null; this.occupied = new Set(); this.issueVisits = {}; }

    preload() {
      for (const [name, a] of Object.entries(ASSETS.npc)) {
        for (const [dir, url] of Object.entries(a.rot || {})) this.load.image(`${name}_rot_${dir}`, url);
        for (const [dir, urls] of Object.entries(a.walk || {})) urls.forEach((u, i) => this.load.image(`${name}_walk_${dir}_${i}`, u));
      }
      for (const [k, url] of Object.entries(ASSETS.tiles)) this.load.image(`tile_${k}`, url);
      const loadAnims = (name, a) => { for (const [anim, dirs] of Object.entries(a.anims || {})) for (const [dir, urls] of Object.entries(dirs)) urls.forEach((u, i) => this.load.image(`${name}_${anim}_${dir}_${i}`, u)); };
      for (const [name, a] of Object.entries(ASSETS.npc)) loadAnims(name, a);
      for (const [name, a] of Object.entries(ASSETS.pets || {})) {
        for (const [dir, url] of Object.entries(a.rot || {})) this.load.image(`${name}_rot_${dir}`, url);
        for (const [dir, urls] of Object.entries(a.walk || {})) urls.forEach((u, i) => this.load.image(`${name}_walk_${dir}_${i}`, u));
        loadAnims(name, a);
      }
      (ASSETS.cars || []).forEach((u, i) => this.load.image(`plcar_${i}`, u));
    }

    create() {
      this.cameras.main.setBackgroundColor('#07060f');
      this.makeBasicTextures();
      this.buildSky();
      this.buildWalls();
      this.buildFloors();
      this.buildPartitions();
      this.buildFurniture();
      this.buildLighting();
      this.buildNPCs();
      this.buildRoomLabels();
      this.setupCamera();
      this.setupInput();
      this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickScreens() });
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickLife() });
      this.time.addEvent({ delay: 30000, loop: true, callback: () => this.updateSky() });
      this.time.addEvent({ delay: 3500, loop: true, callback: () => this.spawnCar() });
      this.poll();
      this.time.addEvent({ delay: 3000, loop: true, callback: () => this.poll() });
      window.addEventListener('resize', () => this.fitCamera());
    }

    // ---------------------------------------------------------------- textures
    makeBasicTextures() {
      const mk = (key, w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); this.textures.addCanvas(key, c); };
      mk('px', 1, 1, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); });
      mk('rain', 1, 6, g => { const gr = g.createLinearGradient(0, 0, 0, 6); gr.addColorStop(0, 'rgba(170,200,255,0)'); gr.addColorStop(1, 'rgba(190,215,255,.9)'); g.fillStyle = gr; g.fillRect(0, 0, 1, 6); });
      mk('glow', 64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
      mk('puff', 8, 8, g => { g.fillStyle = 'rgba(230,230,240,.8)'; g.beginPath(); g.arc(4, 4, 3.5, 0, 7); g.fill(); });
      mk('spark', 2, 2, g => { g.fillStyle = '#fde047'; g.fillRect(0, 0, 2, 2); });
      mk('smoke', 16, 16, g => { const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(120,120,130,.7)'); gr.addColorStop(1, 'rgba(120,120,130,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); });
      mk('car', 8, 3, g => { g.fillStyle = '#111827'; g.fillRect(0, 0, 8, 3); g.fillStyle = '#f472b6'; g.fillRect(0, 2, 8, 1); g.fillStyle = '#fef08a'; g.fillRect(7, 1, 1, 1); });
      mk('cloud', 48, 18, g => { g.fillStyle = 'rgba(200,205,230,.55)'; for (const [x, y, r] of [[12, 11, 7], [22, 8, 9], [33, 10, 8], [40, 12, 6]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } });
      // plant leaves
      mk('leaves', 22, 26, g => { const cs = ['#166534', '#15803d', '#22c55e', '#4ade80']; for (let i = 0; i < 26; i++) { g.fillStyle = cs[i % 4]; const a = i / 26 * Math.PI * 2; g.fillRect(11 + Math.cos(a) * (3 + i % 7), 14 + Math.sin(a) * (4 + i % 8) - i % 5, 3, 2); } });
      // fallback floor tiles per room
      for (const r of W.ROOMS) {
        if (this.textures.exists(`tile_${r.floor}`)) continue;
        const key = `tile_${r.floor}`; if (this.textures.exists(key)) continue;
        mk(key, 32, 20, g => {
          const base = '#' + (0x1b1f33).toString(16);
          g.fillStyle = '#1a1d2e'; g.beginPath(); g.moveTo(16, 0); g.lineTo(32, 8); g.lineTo(16, 16); g.lineTo(0, 8); g.closePath(); g.fill();
          g.strokeStyle = W.hex(r.accent) + '33'; g.stroke();
          g.fillStyle = '#10121d'; g.beginPath(); g.moveTo(0, 8); g.lineTo(16, 16); g.lineTo(16, 19); g.lineTo(0, 11); g.fill();
          g.fillStyle = '#0b0d16'; g.beginPath(); g.moveTo(32, 8); g.lineTo(16, 16); g.lineTo(16, 19); g.lineTo(32, 11); g.fill();
        });
      }
      // PixelLab tiles: measure where the diamond top sits (centre column) so tiles line up on the grid
      this.tileTop = {};
      for (const r of W.ROOMS) {
        const key = `tile_${r.floor}`; if (this.tileTop[key] !== undefined) continue;
        const src = this.textures.get(key).getSourceImage();
        const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let top = 0;
        const cx = Math.floor(c.width / 2) - 1;
        outer: for (let y = 0; y < c.height; y++) for (const x of [cx, cx + 1]) if (d[(y * c.width + x) * 4 + 3] > 40) { top = y; break outer; }
        this.tileTop[key] = { top, scale: TW / c.width };
      }
    }

    // ---------------------------------------------------------------- sky, skyline, weather
    windowPolys() {
      const polys = [];
      const z0 = 24, z1 = WALL_H - 10;
      for (let x = 0; x < GW; x += 4) polys.push([iso(x + 0.6, 0, z0), iso(x + 3.4, 0, z0), iso(x + 3.4, 0, z1), iso(x + 0.6, 0, z1)]);
      for (let y = 0; y < GH; y += 4) polys.push([iso(0, y + 0.6, z0), iso(0, y + 3.4, z0), iso(0, y + 3.4, z1), iso(0, y + 0.6, z1)]);
      return polys;
    }
    buildSky() {
      const left = iso(0, GH).x - 10, right = iso(GW, 0).x + 10, top = W.OY - WALL_H - 30, bottom = iso(0, GH).y + 10;
      this.skyBounds = { left, right, top, bottom };
      this.sky = this.add.container(0, 0).setDepth(-200000);
      this.skyG = this.add.graphics(); this.sky.add(this.skyG);
      // skyline layers
      const mkSkyline = (key, h, color, lit, seed) => {
        const w = Math.ceil(right - left), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        let s = seed; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
        for (let x = 0; x < w;) {
          const bw = 10 + Math.floor(R() * 26), bh = h * (0.35 + R() * 0.65);
          g.fillStyle = color; g.fillRect(x, h - bh, bw, bh);
          if (R() > 0.6) { g.fillStyle = color; g.fillRect(x + bw / 2 - 1, h - bh - 8, 2, 8); g.fillStyle = '#ef4444'; g.fillRect(x + bw / 2 - 1, h - bh - 9, 2, 1); }
          for (let wy = h - bh + 4; wy < h - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (R() < lit) { g.fillStyle = pick(['#fde68a', '#67e8f9', '#f9a8d4', '#c4b5fd']); g.fillRect(wx, wy, 1, 2); }
          if (R() > 0.85) { g.fillStyle = pick(['#f472b6', '#22d3ee', '#a78bfa']); g.fillRect(x + 2, h - bh + 6, bw - 4, 2); }
          x += bw + Math.floor(R() * 4);
        }
        this.textures.addCanvas(key, c);
      };
      mkSkyline('sky_far', 150, '#141331', 0.18, 7); mkSkyline('sky_near', 110, '#0b0a1d', 0.28, 31);
      this.skyFar = this.add.image(left, bottom - 40, 'sky_far').setOrigin(0, 1); this.skyNear = this.add.image(left, bottom, 'sky_near').setOrigin(0, 1);
      this.sky.add([this.skyFar, this.skyNear]);
      this.cars = this.add.container(0, 0); this.sky.add(this.cars);
      this.clouds = this.add.container(0, 0); this.sky.add(this.clouds);
      for (let i = 0; i < 6; i++) { const c = this.add.image(rnd(left, right), rnd(top + 5, top + 60), 'cloud').setAlpha(0); this.clouds.add(c); c.speed = rnd(3, 8); }
      this.flash = this.add.rectangle(left, top, right - left, bottom - top, 0xffffff, 0).setOrigin(0); this.sky.add(this.flash);
      // mask = windows
      const mg = this.make.graphics({ add: false });
      mg.fillStyle(0xffffff);
      for (const p of this.windowPolys()) mg.fillPoints(p.map(q => new Phaser.Geom.Point(q.x, q.y)), true);
      this.windowMask = mg.createGeometryMask();
      this.sky.setMask(this.windowMask);
      // weather particles (masked to windows)
      const zone = { x: { min: left, max: right }, y: top };
      this.rain = this.add.particles(0, 0, 'rain', { ...zone, lifespan: 900, speedY: { min: 260, max: 340 }, speedX: -30, quantity: 3, frequency: 16, alpha: { start: .9, end: .2 }, emitting: false }).setDepth(-199000);
      this.snow = this.add.particles(0, 0, 'px', { ...zone, lifespan: 6000, speedY: { min: 14, max: 30 }, speedX: { min: -8, max: 8 }, scale: { min: 1, max: 2 }, quantity: 1, frequency: 60, emitting: false }).setDepth(-199000);
      this.rain.setMask(this.windowMask); this.snow.setMask(this.windowMask);
      this.updateSky();
    }
    dayPhase() {
      const q = new URLSearchParams(location.search);
      const h = q.has('hour') ? +q.get('hour') : new Date().getHours() + new Date().getMinutes() / 60;
      if (h >= 7 && h < 17) return 'day'; if (h >= 17 && h < 19.5) return 'dusk'; if (h >= 5 && h < 7) return 'dawn'; return 'night';
    }
    updateSky() {
      const ph = this.dayPhase(), wk = new URLSearchParams(location.search).get('weather') || (this.state && this.state.weather && this.state.weather.kind) || 'clear';
      const { left, right, top, bottom } = this.skyBounds;
      const pal = { day: [0x3aa0e8, 0x9fe4ff], dusk: [0x3b0f5c, 0xf0567a], dawn: [0x2b1f6b, 0xf59e6b], night: [0x05040f, 0x1e1b4b] }[ph];
      const grey = (wk === 'rain' || wk === 'storm' || wk === 'cloudy' || wk === 'fog');
      const g = this.skyG; g.clear();
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        let c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(pal[0]), Phaser.Display.Color.ValueToColor(pal[1]), steps, i);
        let col = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        if (grey) { const gc = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(col), Phaser.Display.Color.ValueToColor(0x4b5563), 10, 6); col = Phaser.Display.Color.GetColor(gc.r, gc.g, gc.b); }
        g.fillStyle(col); g.fillRect(left, top + (bottom - top) * i / steps, right - left, (bottom - top) / steps + 1);
      }
      if (ph === 'night' && !grey) for (let i = 0; i < 70; i++) { g.fillStyle(0xffffff, rnd(.3, 1)); g.fillRect(rnd(left, right), rnd(top, top + 90), 1, 1); }
      if (!grey) { const cx = left + (right - left) * (ph === 'night' ? .75 : .3), cy = top + 30; g.fillStyle(ph === 'night' ? 0xf5f3ff : 0xfff7c2, 1); g.fillCircle(cx, cy, ph === 'night' ? 7 : 10); }
      this.skyNear.setTint(ph === 'day' ? 0x2a2950 : 0xffffff); this.skyFar.setTint(ph === 'day' ? 0x5a5f9a : 0xffffff);
      this.clouds.list.forEach(c => c.setAlpha(grey ? .8 : (ph === 'day' ? .45 : .15)));
      this.rain.emitting = (wk === 'rain' || wk === 'storm');
      this.snow.emitting = (wk === 'snow');
      this.setDarkness(ph);
    }
    spawnCar() {
      const { left, right, top } = this.skyBounds;
      const dir = Math.random() < .5 ? 1 : -1, y = rnd(top + 25, top + 95);
      const n = (ASSETS.cars || []).length;
      const car = n ? this.add.image(dir > 0 ? left - 20 : right + 20, y, `plcar_${Math.floor(Math.random() * n)}`).setScale(rnd(.28, .42)).setFlipX(dir < 0)
                    : this.add.image(dir > 0 ? left - 10 : right + 10, y, 'car').setFlipX(dir < 0).setTint(pick([0xffffff, 0x67e8f9, 0xf9a8d4]));
      this.cars.add(car);
      this.tweens.add({ targets: car, x: dir > 0 ? right + 10 : left - 10, duration: rnd(7000, 14000), onComplete: () => car.destroy() });
      if ((this.state?.weather?.kind) === 'storm' && Math.random() < .25) { this.flash.setAlpha(.7); this.tweens.add({ targets: this.flash, alpha: 0, duration: 400 }); }
    }

    // ---------------------------------------------------------------- walls
    buildWalls() {
      const g = this.add.graphics().setDepth(-150000);
      const wallCol = 0x1b1830, wallLeft = 0x221d3d, trim = 0x0e0c1c;
      const pts = (arr) => arr.map(p => new Phaser.Geom.Point(p.x, p.y));
      const z0 = 24, z1 = WALL_H - 10;
      // wall A (y=0), face toward +y
      const wallStrip = (alongX, a0, a1, za, zb, col) => {
        const P = (t, z) => alongX ? iso(t, 0, z) : iso(0, t, z);
        g.fillStyle(col); g.fillPoints(pts([P(a0, za), P(a1, za), P(a1, zb), P(a0, zb)]), true);
      };
      for (const [alongX, len, col] of [[true, GW, wallCol], [false, GH, wallLeft]]) {
        wallStrip(alongX, 0, len, 0, z0, col); wallStrip(alongX, 0, len, z1, WALL_H, col);
        for (let t = 0; t < len; t += 4) { wallStrip(alongX, t, t + 0.6, z0, z1, col); wallStrip(alongX, t + 3.4, t + 4, z0, z1, col); }
        // baseboard & top trim neon
        const P = (t, z) => alongX ? iso(t, 0, z) : iso(0, t, z);
        g.lineStyle(1, 0x2e2a55); g.lineBetween(P(0, 4).x, P(0, 4).y, P(len, 4).x, P(len, 4).y);
        g.lineStyle(2, 0x0b0a16); g.lineBetween(P(0, WALL_H).x, P(0, WALL_H).y, P(len, WALL_H).x, P(len, WALL_H).y);
      }
      // window frames + glass tint
      for (const p of this.windowPolys()) {
        g.fillStyle(0x7dd3fc, 0.06); g.fillPoints(pts(p), true);
        g.lineStyle(1, 0x3b3a6b); g.strokePoints(pts(p), true);
        const m1 = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, m2 = { x: (p[2].x + p[3].x) / 2, y: (p[2].y + p[3].y) / 2 };
        g.lineBetween(m1.x, m1.y, m2.x, m2.y);
      }
      // neon strip lights on the ceiling edge (like the reference)
      this.ceilingLights = this.add.graphics().setDepth(-149000);
      const cl = this.ceilingLights;
      cl.lineStyle(2, 0x67e8f9, .9); cl.lineBetween(iso(1, 0, WALL_H - 4).x, iso(1, 0, WALL_H - 4).y, iso(GW - 1, 0, WALL_H - 4).x, iso(GW - 1, 0, WALL_H - 4).y);
      cl.lineStyle(2, 0xc084fc, .9); cl.lineBetween(iso(0, 1, WALL_H - 4).x, iso(0, 1, WALL_H - 4).y, iso(0, GH - 1, WALL_H - 4).x, iso(0, GH - 1, WALL_H - 4).y);
      // corner pillar
      g.fillStyle(0x0e0c1c); g.fillPoints(pts([iso(0, 0, 0), iso(0.25, 0, 0), iso(0.25, 0, WALL_H), iso(0, 0, WALL_H)]), true);
      // room dividers continue up the back wall as thin neon lines
      for (const r of W.ROOMS) {
        if (r.y0 === 0 && r.x0 > 0) { const a = iso(r.x0, 0, 0), b = iso(r.x0, 0, WALL_H); g.lineStyle(1, r.accent, .5); g.lineBetween(a.x, a.y, b.x, b.y); }
        if (r.x0 === 0 && r.y0 > 0) { const a = iso(0, r.y0, 0), b = iso(0, r.y0, WALL_H); g.lineStyle(1, r.accent, .5); g.lineBetween(a.x, a.y, b.x, b.y); }
      }
      // wall-mounted items
      this.wallItems = this.add.graphics().setDepth(-148000);
      for (const f of W.FURNITURE.filter(f => f.wall)) this.drawWallItem(f);
    }
    drawWallItem(f) {
      const g = this.wallItems, pts = (arr) => arr.map(p => new Phaser.Geom.Point(p.x, p.y));
      const quad = (x0, x1, za, zb) => [iso(x0, 0.02, za), iso(x1, 0.02, za), iso(x1, 0.02, zb), iso(x0, 0.02, zb)];
      if (f.t === 'whiteboard') { g.fillStyle(0xe5e7eb); g.fillPoints(pts(quad(f.x + .2, f.x + f.len - .2, 30, 58)), true); g.lineStyle(1, 0x4ade80); for (let k = 0; k < 5; k++) { const a = iso(f.x + .5 + k * .45, .02, 36 + (k % 3) * 5), b = iso(f.x + .8 + k * .45, .02, 40 + (k % 2) * 8); g.lineBetween(a.x, a.y, b.x, b.y); } }
      if (f.t === 'poster') { g.fillStyle(0xdb2777); g.fillPoints(pts(quad(f.x + .2, f.x + f.len - .2, 34, 60)), true); g.fillStyle(0x22d3ee); g.fillPoints(pts(quad(f.x + .5, f.x + f.len - .5, 42, 52)), true); }
      if (f.t === 'bigscreen' || f.t === 'statusboard') {
        g.fillStyle(0x05060c); g.fillPoints(pts(quad(f.x + .2, f.x + f.len - .2, 28, 64)), true);
        g.lineStyle(1, f.t === 'bigscreen' ? 0x22d3ee : 0xfb923c); g.strokePoints(pts(quad(f.x + .2, f.x + f.len - .2, 28, 64)), true);
        (this.wallScreens = this.wallScreens || []).push({ f, quad: quad(f.x + .35, f.x + f.len - .35, 31, 61) });
      }
    }

    // ---------------------------------------------------------------- floors & partitions
    buildFloors() {
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
        const r = W.roomAt(x, y); const p = iso(x, y);
        const k = `tile_${r.floor}`, tt = this.tileTop[k]; this.add.image(p.x - TW / 2, p.y - tt.top * tt.scale, k).setOrigin(0, 0).setScale(tt.scale).setDepth(-100000 + x + y);
      }
      // subtle rugs in some rooms
      const rug = this.add.graphics().setDepth(-90000);
      const rugQ = (x0, y0, x1, y1, c) => { rug.fillStyle(c, .35); rug.fillPoints([iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(p => new Phaser.Geom.Point(p.x, p.y)), true); };
      rugQ(19, 18, 25, 23, 0x7c3aed); rugQ(17, 2, 20, 5, 0x0e7490); rugQ(9, 2, 13, 6, 0x6d28d9);
      this.hoverG = this.add.graphics().setDepth(-80000);
    }
    buildPartitions() {
      const H = 22;
      for (const s of W.partitions) {
        const r = W.roomAt(s.x, s.y);
        let a, b;
        if (s.side === 'x') { a = [s.x + 1, s.y]; b = [s.x + 1, s.y + 1]; } else { a = [s.x, s.y + 1]; b = [s.x + 1, s.y + 1]; }
        const g = this.add.graphics().setDepth(iso(b[0], b[1]).y - 0.5);
        const A0 = iso(a[0], a[1]), B0 = iso(b[0], b[1]), A1 = iso(a[0], a[1], H), B1 = iso(b[0], b[1], H);
        if (s.door) { g.fillStyle(0x0b0a16); g.fillRect(A0.x - 1, A1.y, 2, H); continue; }
        g.fillStyle(0x93c5fd, 0.10); g.fillPoints([A0, B0, B1, A1].map(p => new Phaser.Geom.Point(p.x, p.y)), true);
        g.lineStyle(1, r ? r.accent : 0x64748b, 0.7); g.lineBetween(A1.x, A1.y, B1.x, B1.y);
        g.lineStyle(1, 0x0b0a16, 0.9); g.lineBetween(A0.x, A0.y, B0.x, B0.y);
        g.fillStyle(0x1f1b38); g.fillRect(A0.x - 1, A1.y, 2, H);
      }
    }

    // ---------------------------------------------------------------- furniture & animated overlays
    buildFurniture() {
      this.screens = []; this.leds = []; this.fans = []; this.glows = []; this.holos = []; this.arcades = []; this.dashes = []; this.beams = []; this.recs = [];
      for (const f of W.FURNITURE) {
        if (f.wall) continue;
        const { tex, meta } = W.buildFurniture(this, f);
        const base = iso(f.x, f.y);
        const a = f.a || 1, b = f.b || 1;
        const depth = f.t === 'chair' ? iso(f.x, f.y).y + 1 : iso(f.x + a, f.y + b).y - 1;
        const img = this.add.image(base.x - tex.ox, base.y - tex.oy, tex.key).setOrigin(0, 0).setDepth(depth);
        f.sprite = img;
        const off = (pt) => ({ x: base.x - tex.ox + pt[0], y: base.y - tex.oy + pt[1] });
        for (const o of meta.overlays) {
          if (o.kind === 'screen') this.screens.push({ g: this.add.graphics().setDepth(depth + 0.2), pts: o.pts.map(off), owner: f.agent, big: o.big, room: W.roomAt(f.x, f.y) });
          else if (o.kind === 'led') { const p = off(o.pt); this.leds.push({ r: this.add.rectangle(p.x, p.y, 1, 1, Phaser.Display.Color.HexStringToColor(o.color).color).setDepth(depth + 0.3), slow: o.slow, rack: f.idx }); }
          else if (o.kind === 'fan') { const p = off(o.pt); this.fans.push({ g: this.add.graphics().setDepth(depth + 0.3), p }); }
          else if (o.kind === 'glow') { const p = off(o.pt); this.glows.push(this.add.image(p.x, p.y, 'glow').setTint(o.color).setScale((o.r || 24) / 32).setBlendMode(Phaser.BlendModes.ADD).setDepth(900010).setAlpha(.35)); }
          else if (o.kind === 'holo') { const c = iso(f.x + a / 2, f.y + b / 2, 18); this.holos.push({ g: this.add.graphics().setDepth(depth + 0.5).setBlendMode(Phaser.BlendModes.ADD), c, color: o.color }); }
          else if (o.kind === 'arcade') this.arcades.push({ g: this.add.graphics().setDepth(depth + 0.2), pts: o.pts.map(off), id: f.id });
          else if (o.kind === 'dash') this.dashes.push({ g: this.add.graphics().setDepth(depth + 0.2), pts: o.pts.map(off) });
          else if (o.kind === 'beam') this.beams.push({ g: this.add.graphics().setDepth(depth + 0.4).setBlendMode(Phaser.BlendModes.ADD), p1: off(o.p1), p2: off(o.p2) });
          else if (o.kind === 'rec') { const p = off(o.pt); const r = this.add.rectangle(p.x, p.y, 2, 2, 0xef4444).setDepth(depth + .3); this.tweens.add({ targets: r, alpha: 0, duration: 600, yoyo: true, repeat: -1 }); }
          else if (o.kind === 'steam') { const p = off(o.pt); this.add.particles(p.x, p.y, 'puff', { lifespan: 1600, speedY: { min: -14, max: -8 }, speedX: { min: -3, max: 3 }, scale: { start: .4, end: 1.1 }, alpha: { start: .6, end: 0 }, frequency: 420 }).setDepth(depth + 1); }
          else if (o.kind === 'plant') { const p = iso(f.x + .5, f.y + .5, 9); const lv = this.add.image(p.x, p.y + 2, 'leaves').setOrigin(.5, 1).setDepth(depth + .1); this.tweens.add({ targets: lv, angle: { from: -3, to: 3 }, duration: rnd(1800, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }
        }
      }
    }
    tickScreens() {
      const st = this.state; const statusOf = (n) => st?.agents?.find(a => a.name === n)?.status || 'idle';
      const night = this.dayPhase() === 'night';
      const sysm = st?.system || {};
      for (const s of this.screens) {
        const g = s.g; g.clear();
        const working = s.owner ? ['working', 'queued'].includes(statusOf(s.owner)) : true;
        const [a, b, c, d] = s.pts; // a=bottom-left, b=bottom-right, c=top-right, d=top-left (parallelogram)
        const base = working ? 0x0b1a2e : 0x0a0d18;
        g.fillStyle(base, 1); g.fillPoints([a, b, c, d].map(p => new Phaser.Geom.Point(p.x, p.y)), true);
        const lines = s.big ? 10 : 5;
        for (let i = 0; i < lines; i++) {
          if (!working && i > 1) break;
          const t0 = (i + 0.6) / (lines + 0.5);
          const len = working ? rnd(.25, .9) : .3;
          const P = (u, v) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * v, y: a.y + (b.y - a.y) * u + (d.y - a.y) * v });
          const p1 = P(.1, 1 - t0), p2 = P(.1 + len * .8, 1 - t0);
          g.lineStyle(1, working ? Phaser.Display.Color.HexStringToColor(pick(W.SCREEN_COLORS)).color : 0x1e3a5f, working ? .95 : .6);
          g.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }
      }
      for (const s of this.arcades) {
        const g = s.g; g.clear(); const [a, b, c, d] = s.pts; const busy = this.occupied.has(s.id);
        g.fillStyle(busy ? pick([0x1d4ed8, 0x7c3aed, 0xbe185d]) : 0x111827); g.fillPoints([a, b, c, d].map(p => new Phaser.Geom.Point(p.x, p.y)), true);
        for (let k = 0; k < (busy ? 5 : 2); k++) { const u = Math.random(), v = Math.random(); g.fillStyle(pick([0xfacc15, 0x4ade80, 0xf472b6, 0xffffff])); g.fillRect(a.x + (b.x - a.x) * u + (d.x - a.x) * v, a.y + (b.y - a.y) * u + (d.y - a.y) * v, 1, 1); }
      }
      for (const s of this.dashes) {
        const g = s.g; g.clear(); const [a, b, c, d] = s.pts; const P = (u, v) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * v, y: a.y + (b.y - a.y) * u + (d.y - a.y) * v });
        g.fillStyle(0x07101f); g.fillPoints([a, b, c, d].map(p => new Phaser.Geom.Point(p.x, p.y)), true);
        for (let k = 0; k < 6; k++) { const h = rnd(.2, .85), u = .1 + k * .14; const p0 = P(u, .1), p1 = P(u, .1 + h * .8); g.lineStyle(2, [0x60a5fa, 0x22d3ee, 0xa78bfa][k % 3]); g.lineBetween(p0.x, p0.y, p1.x, p1.y); }
      }
      const cpu = (sysm.cpu ?? 20) / 100;
      for (const l of this.leds) { if (Math.random() < (l.slow ? .15 : .25 + cpu * .7)) l.r.setAlpha(l.r.alpha > .5 ? .15 : 1); }
      for (const gl of this.glows) gl.setAlpha((night ? .55 : .25) + rnd(-.03, .03));
      for (const bm of this.beams) { const g = bm.g; g.clear(); const u = (Math.sin(nowMs() / 500) + 1) / 2; g.lineStyle(1, 0xfacc15, .8); g.lineBetween(bm.p1.x + (bm.p2.x - bm.p1.x) * u, bm.p1.y + (bm.p2.y - bm.p1.y) * u, bm.p1.x + (bm.p2.x - bm.p1.x) * u, bm.p1.y + (bm.p2.y - bm.p1.y) * u + 10); }
      this.updateWallScreens();
    }
    updateWallScreens() {
      for (const w of this.wallScreens || []) {
        if (!w.g) w.g = this.add.graphics().setDepth(-147000);
        const g = w.g; g.clear();
        const [a, b, c, d] = w.quad;
        const P = (u, v) => ({ x: a.x + (b.x - a.x) * u + (d.x - a.x) * v, y: a.y + (b.y - a.y) * u + (d.y - a.y) * v });
        if (w.f.t === 'statusboard') {
          const s = this.state?.system || {}; const gpu = s.gpu || {};
          const bars = [['CPU', (s.cpu ?? 0) / 100, 0x22d3ee], ['RAM', s.ram_total_gb ? s.ram_used_gb / s.ram_total_gb : 0, 0xa78bfa],
            ['GPU', (gpu.util ?? 0) / 100, 0x4ade80], ['VRAM', gpu.vram_total_mb ? gpu.vram_used_mb / gpu.vram_total_mb : 0, 0xf472b6], ['TEMP', (gpu.temp ?? 0) / 100, 0xfb923c]];
          bars.forEach(([_, v, col], i) => {
            const u0 = .06 + i * .19, u1 = u0 + .13;
            const q = [P(u0, .08), P(u1, .08), P(u1, .08 + .84 * Math.min(1, v)), P(u0, .08 + .84 * Math.min(1, v))];
            g.fillStyle(col, .25); g.fillPoints([P(u0, .08), P(u1, .08), P(u1, .92), P(u0, .92)].map(p => new Phaser.Geom.Point(p.x, p.y)), true);
            g.fillStyle(v > .85 ? 0xef4444 : col, .95); g.fillPoints(q.map(p => new Phaser.Geom.Point(p.x, p.y)), true);
          });
        } else {
          const j = this.state?.jobs || {}; const vals = [j.RUNNING || 0, j.QUEUED || 0, j.WAITING_APPROVAL || 0, j.FAILED || 0, (j.DONE || 0) % 20];
          const cols = [0x22d3ee, 0xa78bfa, 0xf472b6, 0xef4444, 0x4ade80];
          vals.forEach((v, i) => { const u0 = .05 + i * .19, u1 = u0 + .14, h = Math.min(1, .1 + v / 10); g.fillStyle(cols[i], .9); g.fillPoints([P(u0, .1), P(u1, .1), P(u1, .1 + .8 * h), P(u0, .1 + .8 * h)].map(p => new Phaser.Geom.Point(p.x, p.y)), true); });
          const t = (nowMs() / 1000) % 1; g.lineStyle(1, 0x22d3ee, .4); const s0 = P(0, t), s1 = P(1, t); g.lineBetween(s0.x, s0.y, s1.x, s1.y);
        }
      }
    }
    animateFrame(time) {
      for (const fan of this.fans) { const g = fan.g; g.clear(); const a = time / 120; g.lineStyle(1, 0x94a3b8); for (let k = 0; k < 4; k++) { const ang = a + k * Math.PI / 2; g.lineBetween(fan.p.x, fan.p.y, fan.p.x + Math.cos(ang) * 4, fan.p.y + Math.sin(ang) * 2.5); } }
      for (const h of this.holos) {
        const g = h.g; g.clear(); const t = time / 900;
        g.lineStyle(1, h.color, .8);
        for (let k = 0; k < 3; k++) { const r = 6 + k * 3, y = h.c.y - k * 4 + Math.sin(t + k) * 1.5; g.strokeEllipse(h.c.x, y, r * 2, r); }
        const tip = { x: h.c.x, y: h.c.y - 16 + Math.sin(t * 2) * 2 };
        for (let k = 0; k < 3; k++) { const ang = t + k * 2.09; g.lineBetween(tip.x, tip.y, h.c.x + Math.cos(ang) * 7, h.c.y - 4 + Math.sin(ang) * 3); }
      }
      this.clouds.list.forEach(c => { c.x += c.speed / 60; if (c.x > this.skyBounds.right + 30) c.x = this.skyBounds.left - 30; });
    }

    // ---------------------------------------------------------------- lighting
    buildLighting() {
      const { left, right, top, bottom } = this.skyBounds;
      this.dark = this.add.rectangle(0, 0, W.WORLD_W * 2, W.WORLD_H * 2, 0x0a0820, 0).setOrigin(0).setDepth(900000).setBlendMode(Phaser.BlendModes.MULTIPLY);
      // ceiling light pools
      this.pools = [];
      for (const r of W.ROOMS) {
        const c = iso((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2);
        this.pools.push(this.add.image(c.x, c.y, 'glow').setTint(r.accent).setScale(4, 2).setAlpha(.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(900005));
      }
      // alarm beacons per room (shown when the room has an issue)
      this.beacons = {};
      for (const r of W.ROOMS) {
        const p = r.y0 === 0 ? iso(r.x0 + 1, 0.05, WALL_H - 14) : (r.x0 === 0 ? iso(0.05, r.y0 + 1, WALL_H - 14) : iso(r.x0 + .6, r.y0 + .6, 34));
        const bulb = this.add.circle(p.x, p.y, 2, 0xef4444).setDepth(900020).setVisible(false);
        const halo = this.add.image(p.x, p.y, 'glow').setTint(0xef4444).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(900021).setVisible(false);
        this.tweens.add({ targets: halo, alpha: { from: .9, to: .1 }, duration: 500, yoyo: true, repeat: -1 });
        const smokeAt = iso((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 20);
        const smoke = this.add.particles(smokeAt.x, smokeAt.y, 'smoke', { lifespan: 3000, speedY: { min: -12, max: -6 }, speedX: { min: -4, max: 4 }, scale: { start: .6, end: 2.4 }, alpha: { start: .5, end: 0 }, frequency: 260, emitting: false }).setDepth(900030);
        this.beacons[r.id] = { bulb, halo, smoke };
      }
    }
    setDarkness(ph) {
      const a = { day: 0, dawn: .25, dusk: .3, night: .5 }[ph];
      this.tweens.add({ targets: this.dark, fillAlpha: a, duration: 2000 });
      this.pools?.forEach(p => p.setAlpha(ph === 'day' ? .08 : .22));
    }

    // ---------------------------------------------------------------- NPCs
    buildNPCs() {
      const names = AGENTS_META.map(a => a.name);
      for (const meta of AGENTS_META) {
        const a = ASSETS.npc[meta.name] || {};
        const hasPL = a.rot && Object.keys(a.rot).length;
        const anims = {};
        if (hasPL && a.walk) {
          for (const [dir, urls] of Object.entries(a.walk)) {
            const k = `${meta.name}_walk_${dir}`;
            if (!this.anims.exists(k)) this.anims.create({ key: k, frames: urls.map((_, i) => ({ key: `${meta.name}_walk_${dir}_${i}` })), frameRate: 10, repeat: -1 });
            anims[dir] = k;
          }
        }
        const poses = {};
        for (const [anim, dirs] of Object.entries(a.anims || {})) for (const [dir, urls] of Object.entries(dirs)) {
          const k = `${meta.name}_${anim}_${dir}`; const idx = urls.map((_, i) => i).slice(urls.length > 4 ? 1 : 0); // frame 0 = input pose
          const rate = { typing: 9, idle: 5, coffee: 6, sleep: 3 }[anim] || 6;
          if (!this.anims.exists(k)) this.anims.create({ key: k, frames: idx.map(i => ({ key: `${meta.name}_${anim}_${dir}_${i}` })), frameRate: rate, repeat: -1, repeatDelay: anim === 'coffee' ? 1200 : 0 });
          (poses[anim] = poses[anim] || {})[dir] = k;
        }
        let fb = null;
        if (!hasPL) {
          W.fallbackNPC(this, meta.name, meta.color);
          for (const dir of ['south-east', 'north-east']) {
            const k = `fb_${meta.name}_walk_${dir}`;
            if (!this.anims.exists(k)) this.anims.create({ key: k, frames: [0, 1, 2, 3].map(i => ({ key: `fb_${meta.name}_${dir}_${i}` })), frameRate: 8, repeat: -1 });
            anims[dir] = k;
          }
          fb = true;
        }
        const work = W.WORK[meta.name] || { x: 20, y: 20, face: 'south-east' };
        const start = iso(work.x + .5, work.y + .5);
        const firstKey = hasPL ? `${meta.name}_rot_${a.rot['south-east'] ? 'south-east' : Object.keys(a.rot)[0]}` : `fb_${meta.name}_south-east_0`;
        const sprite = this.add.sprite(start.x, start.y, firstKey).setOrigin(.5, .93);
        const frameH = sprite.height;
        sprite.setScale(Math.min(1, 46 / frameH));
        const npc = new NPC(this, meta, sprite, anims, hasPL ? a.rot : null, fb, work);
        npc.poses = poses;
        npc.chair = W.FURNITURE.find(f => f.t === 'chair' && f.x === work.x && f.y === work.y);
        npc.sitDown();
        this.npcs[meta.name] = npc;
      }
      this.pets = [];
      for (const [name, a] of Object.entries(ASSETS.pets || {})) if (a.rot && Object.keys(a.rot).length) this.pets.push(new Pet(this, name, a));
    }

    // ---------------------------------------------------------------- labels
    buildRoomLabels() {
      this.roomLabels = {};
      for (const r of W.ROOMS) {
        const d = el('room-label', `<span>${r.name}</span><i class="warn"></i>`);
        d.style.setProperty('--accent', W.hex(r.accent));
        d.addEventListener('click', () => UI.openRoom(r.id));
        const anchor = r.y0 === 0 ? iso((r.x0 + r.x1 + 1) / 2, 0, WALL_H + 8) : (r.x0 === 0 ? iso(0, (r.y0 + r.y1 + 1) / 2, WALL_H + 8) : iso((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2, 46));
        this.roomLabels[r.id] = { d, anchor };
      }
    }

    // ---------------------------------------------------------------- camera & input
    setupCamera() {
      const cam = this.cameras.main;
      cam.setBounds(-200, -200, W.WORLD_W + 400, W.WORLD_H + 400);
      this.fitCamera(true);
    }
    fitCamera(first) {
      const cam = this.cameras.main, w = this.scale.width, h = this.scale.height;
      const fit = Math.min(w / (W.WORLD_W - 120), (h - 30) / (W.WORLD_H - 90));
      this.minZoom = Math.max(.4, fit * .7);
      if (first || cam.zoom < this.minZoom) cam.setZoom(fit);
      cam.centerOn(W.WORLD_W / 2, W.WORLD_H / 2 - 10);
    }
    setupInput() {
      const cam = this.cameras.main;
      let down = null;
      this.input.on('pointerdown', p => { down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false }; });
      this.input.on('pointermove', p => {
        if (down && p.isDown) {
          const dx = p.x - down.x, dy = p.y - down.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
          cam.setScroll(down.sx - dx / cam.zoom, down.sy - dy / cam.zoom);
        } else this.hover(p);
      });
      this.input.on('pointerup', p => { if (down && !down.moved) this.click(p); down = null; });
      this.input.on('wheel', (p, objs, dx, dy) => {
        const old = cam.zoom, nz = Phaser.Math.Clamp(old * (dy > 0 ? .9 : 1.1), this.minZoom || .5, 5);
        const wp = cam.getWorldPoint(p.x, p.y); cam.setZoom(nz);
        const wp2 = cam.getWorldPoint(p.x, p.y); cam.scrollX += wp.x - wp2.x; cam.scrollY += wp.y - wp2.y;
      });
    }
    cellAt(p) {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const u = (wp.x - W.OX) / (TW / 2), v = (wp.y - W.OY) / (TH / 2);
      return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2), wp };
    }
    npcAt(wp) {
      let best = null, bd = 1e9;
      for (const n of Object.values(this.npcs)) { const b = n.sprite.getBounds(); if (Phaser.Geom.Rectangle.Contains(b, wp.x, wp.y)) { const d = Math.abs(wp.y - n.sprite.y); if (d < bd) { bd = d; best = n; } } }
      return best;
    }
    hover(p) {
      const c = this.cellAt(p); const r = W.roomAt(c.x, c.y);
      const n = this.npcAt(c.wp);
      this.game.canvas.style.cursor = (r || n) ? 'pointer' : 'grab';
      if (r !== this.hoverRoom) {
        this.hoverRoom = r; const g = this.hoverG; g.clear();
        if (r) { g.lineStyle(1, r.accent, .9); g.fillStyle(r.accent, .07); const q = [iso(r.x0, r.y0), iso(r.x1 + 1, r.y0), iso(r.x1 + 1, r.y1 + 1), iso(r.x0, r.y1 + 1)].map(p => new Phaser.Geom.Point(p.x, p.y)); g.fillPoints(q, true); g.strokePoints(q, true); }
        UI.tooltip(r ? `${r.name}${r.agent ? ' · ' + r.agent : ''} — klik untuk masuk` : '');
      }
    }
    click(p) {
      const c = this.cellAt(p);
      const n = this.npcAt(c.wp);
      if (n) return UI.openNPC(n);
      const r = W.roomAt(c.x, c.y);
      if (r) UI.openRoom(r.id);
    }

    // ---------------------------------------------------------------- server state
    async poll() {
      try {
        const r = await fetch(`/api/world?since=${this.lastEvent}`); if (!r.ok) throw new Error(r.status);
        const st = await r.json(); const first = !this.state;
        const prevWeather = this.state?.weather?.kind;
        this.state = st; this.lastEvent = st.last_event;
        for (const a of st.agents) this.npcs[a.name]?.setServerStatus(a);
        if (!first) for (const ev of st.events) this.onEvent(ev);
        this.applyIssues(st.issues);
        if (prevWeather !== st.weather?.kind) this.updateSky();
        UI.hud(st);
      } catch (e) { UI.hud(null, e); }
    }
    onEvent(ev) {
      const n = this.npcs[ev.agent]; if (!n) return;
      if (ev.kind === 'running') { n.thought = ev.text; n.think(ev.text); return; }
      if (ev.kind === 'done' || ev.kind === 'published') {
        n.thought = null; n.say(ev.text, 7000, 'say'); UI.toast(ev, 'ok');
        if (ev.handoff && this.npcs[ev.handoff] && ev.handoff !== ev.agent) n.deliver(this.npcs[ev.handoff]);
      } else if (ev.kind === 'failed') { n.say(ev.text, 9000, 'alert'); UI.toast(ev, 'err'); }
      else if (ev.kind === 'waiting_approval') { n.say(ev.text, 8000, 'alert'); UI.toast(ev, 'warn'); }
      else if (ev.kind === 'retrying') n.think(ev.text);
      n.log(ev.text);
    }
    applyIssues(list) {
      const byRoom = {};
      for (const i of list || []) (byRoom[i.room] = byRoom[i.room] || []).push(i);
      this.issues = byRoom;
      for (const r of W.ROOMS) {
        const b = this.beacons[r.id], iss = byRoom[r.id] || [];
        const err = iss.some(i => i.level === 'error'), warn = iss.some(i => i.level === 'warn'), appr = iss.some(i => i.level === 'approval');
        const on = err || warn || appr;
        const col = err ? 0xef4444 : appr ? 0xf472b6 : 0xfacc15;
        b.bulb.setVisible(on).setFillStyle(col); b.halo.setVisible(on).setTint(col);
        b.smoke.emitting = err && (r.id === 'server' || iss.length > 1);
        const lab = this.roomLabels[r.id].d; lab.classList.toggle('alarm', on); lab.querySelector('.warn').textContent = on ? (appr && !err ? '!' : '⚠') : '';
        lab.title = iss.map(i => i.text).join('\n');
      }
    }

    // ---------------------------------------------------------------- life simulation
    tickLife() {
      const npcs = Object.values(this.npcs);
      const night = this.dayPhase() === 'night';
      const free = npcs.filter(n => n.isFree());
      for (const n of npcs) n.tick();
      // ZERO-1 services rooms with problems
      const zero = this.npcs['ZERO-1'];
      if (zero && zero.isFree() && this.issues) {
        const rooms = Object.entries(this.issues).filter(([rid, iss]) => iss.some(i => i.level === 'error' || i.level === 'warn') && (!this.issueVisits[rid] || nowMs() - this.issueVisits[rid] > 120000));
        if (rooms.length) { const [rid, iss] = rooms[0]; this.issueVisits[rid] = nowMs(); zero.service(W.roomById[rid], iss[0]); }
      }
      for (const n of free) {
        if (nowMs() < n.nextDecision || !n.isFree()) continue;
        n.nextDecision = nowMs() + rnd(9000, 22000);
        const roll = Math.random();
        if (night && roll < .35) { n.goRest(true); continue; }
        if (roll < .22) n.wander();
        else if (roll < .38) n.goSpot(pick(['coffee', 'vending', 'water']), 'snack');
        else if (roll < .58) { const partner = free.find(m => m !== n && m.isFree() && Math.random() < .6); if (partner) this.startChat(n, partner); else n.wander(); }
        else if (roll < .70) { const id = pick(['arcade', 'arcade2']); if (!this.occupied.has(id)) n.goSpot(id, 'game'); else n.wander(); }
        else if (roll < .80) n.goRest(false);
        else if (roll < .90) n.goWindow();
        else n.goDesk('tidy');
      }
    }
    startChat(a, b) {
      const pairs = [['chatA', 'chatB'], ['chatC', 'chatD'], ['pingA', 'pingB']].filter(([p, q]) => !this.occupied.has(p) && !this.occupied.has(q));
      if (!pairs.length) return a.wander();
      const [sa, sb] = pick(pairs);
      const conv = { a, b, arrived: 0, spots: [sa, sb], ping: sa === 'pingA' };
      a.joinChat(conv, sa); b.joinChat(conv, sb);
    }
    async runChat(conv) {
      let lines;
      try { lines = await (await fetch('/api/world/banter')).json(); } catch (e) { lines = ['Hai!', 'Halo, lagi santai?']; }
      const seq = [[conv.a, lines[0]], [conv.b, lines[1]]];
      if (conv.ping) seq.push([conv.a, 'Servis keras! 🏓'], [conv.b, 'Hampir!']);
      let t = 0;
      for (const [who, text] of seq) { this.time.delayedCall(t, () => who.inChat && who.say(text, 3800, 'chat')); t += 4200; }
      this.time.delayedCall(t + 600, () => { conv.a.endChat(); conv.b.endChat(); });
    }

    update(time, dt) {
      for (const n of Object.values(this.npcs)) n.update(dt);
      for (const p of this.pets || []) p.update(dt);
      this.animateFrame(time);
      UI.layout(this);
    }
  }

  // ------------------------------------------------------------------ NPC
  const DIRS = { '1,0': 'south-east', '0,1': 'south-west', '-1,0': 'north-west', '0,-1': 'north-east' };
  class NPC {
    constructor(scene, meta, sprite, anims, rot, fallback, work) {
      Object.assign(this, { scene, meta, sprite, anims, rot, fallback, work });
      this.name = meta.name; this.cell = { x: work.x, y: work.y }; this.path = []; this.speed = 34;
      this.mode = 'free'; this.server = { status: 'idle' }; this.nextDecision = nowMs() + rnd(2000, 9000);
      this.history = []; this.thought = null; this.face(work.face || 'south-east');
      this.tag = el('npc-tag', `<b>${meta.name}</b>`); this.tag.style.setProperty('--c', meta.color);
      this.icon = el('npc-icon', '');
      this.bubble = el('bubble hidden', '');
      this.carry = el('npc-carry hidden', '📄');
      this.zzz = el('npc-zzz hidden', 'z<small>z</small>');
      this.tag.addEventListener('click', () => UI.openNPC(this));
      this.bubble.addEventListener('click', () => UI.openNPC(this));
      this.sitting = false;
    }
    log(t) { this.history.unshift({ t, at: new Date().toLocaleTimeString().slice(0, 5) }); this.history = this.history.slice(0, 12); }
    face(dir) {
      this.facing = dir;
      if (this.path.length) return;
      this.sprite.anims.stop();
      if (this.rot) {
        const k = `${this.name}_rot_${dir}`;
        if (this.scene.textures.exists(k)) { this.sprite.setTexture(k).setFlipX(false); return; }
      }
      const base = dir.startsWith('north') ? 'north-east' : 'south-east';
      const flip = dir.endsWith('west');
      this.sprite.setTexture(this.fallback ? `fb_${this.name}_${base}_0` : (this.anims[base] ? `${this.name}_walk_${base}_0` : this.sprite.texture.key)).setFlipX(flip);
    }
    walkAnim(dir) {
      if (this.posing) { this.posing = null; }
      const base = dir.startsWith('north') ? 'north-east' : 'south-east';
      const flip = dir.endsWith('west');
      const k = this.anims[base] || this.anims['south-east'];
      if (k) { this.sprite.setFlipX(flip); if (this.sprite.anims.currentAnim?.key !== k || !this.sprite.anims.isPlaying) this.sprite.play(k); this.noAnim = false; }
      else if (this.rot) { const t = `${this.name}_rot_${dir}`; if (this.sprite.texture.key !== t && this.scene.textures.exists(t)) this.sprite.setTexture(t).setFlipX(false); this.noAnim = true; }
    }
    goTo(x, y, face, onArrive) {
      this.standUp();
      const path = W.findPath(this.cell.x, this.cell.y, x, y);
      if (path === null) { onArrive && onArrive(false); return; }
      this.path = path; this.arriveFace = face; this.onArrive = onArrive;
      if (!path.length) { this.arrive(); }
    }
    arrive() {
      this.sprite.anims.stop(); this.path = [];
      if (this.arriveFace) this.face(this.arriveFace);
      if (!this.sitting && this.facing && this.facing.startsWith('south')) this.pose('idle', this.facing);
      const cb = this.onArrive; this.onArrive = null; cb && cb(true);
    }
    update(dt) {
      if (this.path.length) {
        const [nx, ny] = this.path[0];
        const target = iso(nx + .5, ny + .5);
        const dx = target.x - this.sprite.x, dy = target.y - this.sprite.y, dist = Math.hypot(dx, dy);
        const dir = DIRS[`${nx - this.cell.x},${ny - this.cell.y}`] || this.facing;
        this.walkAnim(dir); this.facing = dir;
        const step = this.speed * dt / 1000;
        if (dist <= step) { this.sprite.setPosition(target.x, target.y); this.cell = { x: nx, y: ny }; this.path.shift(); if (!this.path.length) this.arrive(); }
        else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      const walking = this.path.length > 0;
      const bob = walking && this.noAnim ? -Math.abs(Math.sin(nowMs() / 90)) * 2 : (this.sitting && !this.posing && this.server.status === 'working' ? Math.round(Math.sin(nowMs() / 110)) * .5 : 0);
      this.sprite.y += bob - (this._bob || 0); this._bob = bob;
      this.sprite.setDepth(this.sprite.y + (this.sitting ? 6 : 2));
    }
    pose(anim, dir) {
      const p = this.poses && this.poses[anim]; if (!p) return false;
      const flipMap = { 'north-east': 'north-west', 'north-west': 'north-east', 'south-west': 'south-east', 'south-east': 'south-west' };
      let k = p[dir], flip = false;
      if (!k && p[flipMap[dir]]) { k = p[flipMap[dir]]; flip = true; }
      if (!k) return false;
      this.sprite.setFlipX(flip); this.sprite.play(k, true); this.posing = anim; return true;
    }
    endPose() { if (this.posing) { this.posing = null; this.sprite.anims.stop(); this.face(this.facing); } if (this.chair && this.chair.sprite) this.chair.sprite.setVisible(true); }
    standUp() { this.endPose(); if (this.sitting) { this.sitting = false; this.sprite.y += this.seatShift || 0; this.seatShift = 0; } }
    sitDown() {
      if (this.sitting) return;
      this.sitting = true;
      const atDesk = this.cell.x === this.work.x && this.cell.y === this.work.y;
      if (atDesk && this.pose('typing', this.work.face)) {
        if (this.chair && this.chair.sprite) this.chair.sprite.setVisible(false);  // the typing sprite brings its own chair
        if (!['working', 'queued'].includes(this.server.status)) this.sprite.anims.pause();
        this.seatShift = 0;
      } else { this.seatShift = 3; this.sprite.y -= 3; }
    }
    isFree() { return this.mode === 'free' && !this.inChat && this.server.status !== 'working' && this.server.status !== 'queued'; }
    release() { if (this.spot) { this.scene.occupied.delete(this.spot); this.spot = null; } this.zzz.classList.add('hidden'); }

    setServerStatus(a) {
      const prev = this.server.status; this.server = a;
      if (a.status === prev) return;
      this.icon.className = 'npc-icon ' + (a.status === 'error' ? 'err' : a.status === 'waiting' ? 'wait' : '');
      this.icon.textContent = a.status === 'error' ? '!' : a.status === 'waiting' ? '?' : '';
      if (this.posing === 'typing') { if (['working', 'queued'].includes(a.status)) this.sprite.anims.resume(); else this.sprite.anims.pause(); }
      if (a.status === 'working' || a.status === 'queued') {
        if (this.inChat) this.endChat(true);
        this.release(); this.mode = 'work';
        this.goDesk('work');
      } else if (a.status === 'waiting') {
        this.mode = 'free'; this.say(this.name === 'NYX-21' ? 'Ada listing menunggu approval kamu! Klik aku.' : 'Menunggu keputusan kamu…', 7000, 'alert');
      } else { if (this.mode === 'work') { this.mode = 'free'; this.nextDecision = nowMs() + rnd(3000, 8000); } }
    }
    tick() {
      if (this.mode === 'work' && this.sitting && Math.random() < .08) this.think(this.thought || pick(['Fokus…', 'Hampir selesai…', 'Cek ulang datanya…', 'Validasi dulu biar aman.']));
      if (this.server.status === 'waiting' && Math.random() < .03) this.say('Butuh approval kamu 👀', 4000, 'alert');
      if (this.server.status === 'error' && Math.random() < .03) this.say('Ada yang error di pekerjaanku, cek ruanganku ya.', 5000, 'alert');
      if (this.mode === 'free' && !this.path.length && !this.inChat && Math.random() < .015) this.think(pick(['Hmm…', 'Ide konten baru…', 'Kopi lagi?', 'Data hari ini menarik.', '…']));
    }
    goDesk(reason) {
      this.goTo(this.work.x, this.work.y, this.work.face, (ok) => { if (ok) this.sitDown(); if (reason === 'work') this.think(this.thought || 'Mulai kerja…'); });
    }
    wander() {
      const room = W.roomAt(this.work.x, this.work.y) || W.roomById.lounge;
      const c = W.randomCellIn(Math.random() < .7 ? room : W.roomById.lounge);
      this.mode = 'busy';
      this.goTo(c.x, c.y, pick(['south-east', 'south-west', 'north-east', 'north-west']), () => { this.mode = 'free'; });
    }
    goSpot(id, kind) {
      const s = W.SPOTS[id]; if (!s || this.scene.occupied.has(id)) return this.wander();
      this.scene.occupied.add(id); this.spot = id; this.mode = 'busy';
      this.goTo(s.x, s.y, s.face, (ok) => {
        if (!ok) { this.release(); this.mode = 'free'; return; }
        if (s.sit) this.sitDown();
        if (kind === 'snack') { this.face('south-east'); this.pose('coffee', 'south-east'); }
        const lines = { snack: ['Kopi dulu ☕', 'Snack biar fokus.', 'Air putih, sehat!'], game: ['Satu ronde aja 🎮', 'Highscore baru!', 'Ayo combo!'] }[kind] || ['…'];
        this.say(pick(lines), 3500, 'chat');
        this.scene.time.delayedCall(kind === 'game' ? rnd(14000, 26000) : rnd(6000, 10000), () => { if (this.spot === id) { this.release(); this.mode = 'free'; this.goDesk('back'); } });
      });
    }
    goRest(sleep) {
      const id = pick(['couch1', 'couch2', 'couch3', 'bean1', 'bean2', 'bean3'].filter(s => !this.scene.occupied.has(s)));
      if (!id) return this.wander();
      const s = W.SPOTS[id]; this.scene.occupied.add(id); this.spot = id; this.mode = 'busy';
      this.goTo(s.x, s.y, s.face, (ok) => {
        if (!ok) { this.release(); this.mode = 'free'; return; }
        this.sitDown();
        if (sleep) this.zzz.classList.remove('hidden'); else this.say(pick(['Rebahan sebentar…', 'Nyaman banget bean bag ini.', 'Istirahat 5 menit.']), 3500, 'chat');
        this.scene.time.delayedCall(rnd(15000, 30000), () => { if (this.spot === id) { this.release(); this.mode = 'free'; this.goDesk('back'); } });
      });
    }
    goWindow() {
      const room = W.roomAt(this.work.x, this.work.y);
      const spots = W.WINDOW_SPOTS.filter(s => W.roomAt(s.x, s.y) === room);
      const s = spots.length ? pick(spots) : pick(W.WINDOW_SPOTS);
      this.mode = 'busy';
      this.goTo(s.x, s.y, s.face, () => {
        const wk = this.scene.state?.weather?.kind;
        this.say({ rain: 'Hujan lagi… neon kota memantul cantik.', storm: 'Petirnya keras!', snow: 'Salju?! Langka banget.', fog: 'Kabut tebal di luar.', cloudy: 'Mendung, enak buat kerja.' }[wk] || pick(['Mobil terbang ramai hari ini.', 'Langitnya bagus.']), 4000, 'chat');
        this.scene.time.delayedCall(6000, () => { this.mode = 'free'; });
      });
    }
    joinChat(conv, spot) {
      this.inChat = conv; this.mode = 'busy'; this.spot = spot; this.scene.occupied.add(spot);
      const s = W.SPOTS[spot];
      this.goTo(s.x, s.y, s.face, () => { conv.arrived++; if (conv.arrived === 2) this.scene.runChat(conv); });
      this.scene.time.delayedCall(40000, () => { if (this.inChat === conv) this.endChat(); });
    }
    endChat(silent) { if (!this.inChat) return; this.inChat = null; this.release(); this.mode = 'free'; if (!silent) this.goDesk('back'); }
    deliver(target) {
      if (this.mode === 'work' && this.server.status === 'working') return;
      this.mode = 'busy'; this.carry.classList.remove('hidden');
      const t = target.cell; const near = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).find(c => W.walkable(c.x, c.y)) || t;
      this.goTo(near.x, near.y, null, () => {
        this.say(`${target.name}, ini hasilnya. Tolong lanjutkan!`, 4000, 'say');
        this.scene.time.delayedCall(2500, () => target.say(pick(['Siap, aku proses!', 'Oke, langsung aku cek.', 'Mantap, terima kasih!']), 3500, 'say'));
        this.scene.time.delayedCall(4500, () => { this.carry.classList.add('hidden'); this.mode = 'free'; this.goDesk('back'); });
      });
    }
    service(room, issue) {
      this.mode = 'busy'; const c = W.randomCellIn(room);
      this.say(`Menuju ${room.name.toLowerCase()} untuk servis…`, 3500, 'say');
      this.goTo(c.x, c.y, 'north-east', () => {
        this.say(`Cek: ${issue.text}`, 6000, 'alert');
        const p = iso(c.x + .5, c.y + .5, 14);
        const sp = this.scene.add.particles(p.x, p.y, 'spark', { lifespan: 500, speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 }, gravityY: 120, quantity: 2, frequency: 120 }).setDepth(900040);
        this.scene.time.delayedCall(7000, () => { sp.destroy(); this.say(issue.level === 'approval' ? 'Ini butuh keputusan kamu.' : 'Sudah aku cek. Detail ada di ruangan ini — klik ruangannya.', 5000, 'say'); this.mode = 'free'; this.goDesk('back'); });
      });
    }
    say(text, ms = 5000, kind = 'say') { this.bubbleShow(text, ms, kind); this.log(text); }
    think(text) { if (!this.bubbleBusy) this.bubbleShow(text, 3500, 'think'); }
    bubbleShow(text, ms, kind) {
      const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(text)}`;
      this.bubbleBusy = kind !== 'think'; clearTimeout(this._bt);
      this._bt = setTimeout(() => { b.classList.add('hidden'); this.bubbleBusy = false; }, ms);
    }
  }

  // ------------------------------------------------------------------ Pet (office cat)
  class Pet {
    constructor(scene, name, a) {
      this.scene = scene; this.name = name; this.cell = { x: 21, y: 20 }; this.path = []; this.speed = 22; this.next = 0;
      const p = iso(this.cell.x + .5, this.cell.y + .5);
      this.sprite = scene.add.sprite(p.x, p.y, `${name}_rot_south-east`).setOrigin(.5, .9);
      this.sprite.setScale(Math.min(1, 26 / this.sprite.height));
      this.walk = {};
      for (const [dir, urls] of Object.entries(a.walk || {})) { const k = `${name}_walk_${dir}`; if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: urls.map((_, i) => ({ key: `${name}_walk_${dir}_${i}` })), frameRate: 9, repeat: -1 }); this.walk[dir] = k; }
      const sl = (a.anims || {}).sleep || {}; const sd = Object.keys(sl)[0];
      if (sd) { this.sleepKey = `${name}_sleep_${sd}`; if (!scene.anims.exists(this.sleepKey)) scene.anims.create({ key: this.sleepKey, frames: sl[sd].map((_, i) => ({ key: `${name}_sleep_${sd}_${i}` })).slice(1), frameRate: 3, repeat: -1 }); }
      this.bubble = el('bubble hidden', ''); this.sprite.setInteractive({ useHandCursor: true });
      this.sprite.on('pointerup', () => this.say(pick(['Meow~', 'Mrrr…', 'Prrr 💜', 'Meow? (minta snack)'])));
    }
    say(t) { const b = this.bubble; b.className = 'bubble chat'; b.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), 3000); }
    update(dt) {
      if (!this.path.length && nowMs() > this.next) {
        this.sprite.anims.stop();
        if (Math.random() < .35 && this.sleepKey) { this.sprite.setFlipX(false).play(this.sleepKey); this.next = nowMs() + rnd(15000, 40000); }
        else {
          const room = Math.random() < .7 ? W.roomById.lounge : pick(W.ROOMS);
          const c = W.randomCellIn(room); const path = W.findPath(this.cell.x, this.cell.y, c.x, c.y);
          if (path && path.length) this.path = path; this.next = nowMs() + rnd(4000, 12000);
        }
      }
      if (this.path.length) {
        const [nx, ny] = this.path[0]; const t = iso(nx + .5, ny + .5);
        const dx = t.x - this.sprite.x, dy = t.y - this.sprite.y, dist = Math.hypot(dx, dy);
        const dir = DIRS[`${nx - this.cell.x},${ny - this.cell.y}`] || 'south-east';
        const base = dir.startsWith('north') ? 'north-east' : 'south-east', k = this.walk[base];
        if (k) { this.sprite.setFlipX(dir.endsWith('west')); if (this.sprite.anims.currentAnim?.key !== k || !this.sprite.anims.isPlaying) this.sprite.play(k); }
        const step = this.speed * dt / 1000;
        if (dist <= step) { this.sprite.setPosition(t.x, t.y); this.cell = { x: nx, y: ny }; this.path.shift(); if (!this.path.length) { this.sprite.anims.stop(); this.sprite.setTexture(`${this.name}_rot_${dir}`).setFlipX(false); } }
        else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      this.sprite.setDepth(this.sprite.y + 1);
      const cam = this.scene.cameras.main, z = cam.zoom;
      this.bubble.style.transform = `translate(${(this.sprite.x - cam.worldView.x) * z}px, ${(this.sprite.y - 24 - cam.worldView.y) * z}px) translate(-50%, -100%)`;
    }
  }

  // ------------------------------------------------------------------ UI (DOM)
  const UI = (W.UI = {
    layout(scene) {
      const cam = scene.cameras.main, z = cam.zoom, vx = cam.worldView.x, vy = cam.worldView.y;
      const toS = (x, y) => [(x - vx) * z, (y - vy) * z];
      const k = Math.min(1.7, Math.max(.85, z / 2.1));
      for (const n of Object.values(scene.npcs)) {
        const top = n.sprite.y - n.sprite.displayHeight * .93;
        const [sx, sy] = toS(n.sprite.x, top), [fx, fy] = toS(n.sprite.x, n.sprite.y);
        n.tag.style.transform = `translate(${fx}px, ${fy + 2}px) translate(-50%, 0) scale(${k})`;
        n.icon.style.transform = `translate(${sx}px, ${sy - 4}px) translate(-50%, -100%)`;
        n.bubble.style.transform = `translate(${sx}px, ${sy - (n.icon.textContent ? 22 : 6) * k}px) translate(-50%, -100%) scale(${k})`;
        n.carry.style.transform = `translate(${sx + 12}px, ${sy + 10}px)`;
        n.zzz.style.transform = `translate(${sx + 8}px, ${sy - 6}px)`;
        n.tag.style.display = z < .9 ? 'none' : '';
      }
      for (const [id, l] of Object.entries(scene.roomLabels)) { const [x, y] = toS(l.anchor.x, l.anchor.y); l.d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${Math.min(1.8, Math.max(.9, z * .75))})`; }
    },
    tooltip(t) { const d = document.getElementById('tip'); d.textContent = t; d.style.opacity = t ? 1 : 0; },
    hud(st, err) {
      const d = document.getElementById('hud');
      const now = new Date();
      if (!st) { d.querySelector('.conn').textContent = 'Server tidak terhubung…'; return; }
      const w = st.weather || {}; const icon = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' }[w.kind] || '☁️';
      const g = st.system?.gpu;
      d.querySelector('.clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      d.querySelector('.date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
      d.querySelector('.weather').textContent = `${icon} ${w.temp != null ? Math.round(w.temp) + '°C ' : ''}${w.city || ''}`;
      d.querySelector('.mode').textContent = st.mode === 'demo' ? 'DEMO' : 'LIVE'; d.querySelector('.mode').className = 'mode ' + st.mode;
      d.querySelector('.ai').innerHTML = `🧠 ${st.mode === 'demo' ? 'demo AI' : esc(st.ai.model)} ${st.ai.busy ? '<b class="busy">berpikir…</b>' : ''}`;
      d.querySelector('.sys').textContent = `CPU ${st.system.cpu ?? '-'}% · RAM ${st.system.ram_used_gb ?? '-'}/${st.system.ram_total_gb ?? '-'} GB${g ? ` · GPU ${g.util}% · VRAM ${(g.vram_used_mb / 1024).toFixed(1)}/${(g.vram_total_mb / 1024).toFixed(0)} GB · ${g.temp}°C` : ''}`;
      d.querySelector('.conn').textContent = '';
    },
    toast(ev, kind) {
      const box = document.getElementById('toasts');
      const meta = AGENTS_META.find(a => a.name === ev.agent) || {};
      const t = el(`toast ${kind}`, `<i style="background:${meta.color}"></i><div><b>${esc(ev.agent)}</b><span>${esc(ev.text)}</span></div>`, box);
      t.addEventListener('click', () => UI.openRoom(meta.room_id));
      setTimeout(() => t.classList.add('out'), 9000); setTimeout(() => t.remove(), 9800);
      while (box.children.length > 5) box.firstChild.remove();
    },
    openRoom(id, pageIdx = 0) {
      const r = W.roomById[id]; if (!r) return;
      const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', W.hex(r.accent));
      const meta = AGENTS_META.find(a => a.name === r.agent);
      const tabs = r.pages.map(([label, url], i) => `<button data-i="${i}" class="${i === pageIdx ? 'on' : ''}">${esc(label)}</button>`).join('');
      p.querySelector('.ptitle').innerHTML = `<b>${r.name}</b>${meta ? `<span>${meta.name} · ${esc(meta.role)}</span>` : '<span>Tempat istirahat, ngopi & main game</span>'}`;
      p.querySelector('.ptabs').innerHTML = tabs;
      const frame = p.querySelector('iframe');
      if (r.pages.length) { frame.style.display = ''; p.querySelector('.pbody-info').style.display = 'none'; frame.src = r.pages[pageIdx][1]; }
      else { frame.style.display = 'none'; const info = p.querySelector('.pbody-info'); info.style.display = ''; info.innerHTML = UI.loungeInfo(); }
      p.querySelectorAll('.ptabs button').forEach(b => b.onclick = () => UI.openRoom(id, +b.dataset.i));
    },
    loungeInfo() {
      const sc = window.office; const st = sc?.state || {};
      const people = Object.values(sc?.npcs || {}).map(n => `<li><i style="background:${n.meta.color}"></i><b>${n.name}</b> — ${n.inChat ? 'ngobrol' : n.zzz.classList.contains('hidden') ? (n.spot ? 'santai di ' + n.spot : n.mode === 'work' ? 'bekerja' : 'jalan-jalan') : 'tidur 💤'}</li>`).join('');
      return `<div class="lounge"><h3>Siapa di mana</h3><ul>${people}</ul><p class="muted">Cuaca: ${st.weather?.kind || '-'} (${st.weather?.source || ''}). Tim bekerja saat ada tugas, dan hidup santai saat tidak ada.</p></div>`;
    },
    openNPC(n) {
      const p = document.getElementById('panel'); p.className = 'open'; p.style.setProperty('--accent', n.meta.color);
      const room = W.roomById[n.meta.room_id];
      p.querySelector('.ptitle').innerHTML = `<b>${n.name}</b><span>${esc(n.meta.role)} · ${room ? room.name : ''}</span>`;
      p.querySelector('.ptabs').innerHTML = room && room.pages.length ? `<button class="on" data-room="1">Masuk ${esc(room.name.toLowerCase())}</button>` : '';
      const frame = p.querySelector('iframe'); frame.style.display = 'none';
      const info = p.querySelector('.pbody-info'); info.style.display = '';
      const st = n.server || {};
      const portrait = n.rot ? `/static/game/pl/${encodeURIComponent(n.name)}/rot_south.png` : '';
      info.innerHTML = `<div class="npc-card">${portrait ? `<img src="${portrait}" alt="">` : `<div class="avatar" style="background:${n.meta.color}"></div>`}
        <div><p>${esc(n.meta.desc)}</p><p>Status: <b class="st ${st.status}">${st.status || 'idle'}</b> ${st.current ? '· ' + esc(st.current) : ''} ${st.queued ? '· antrean ' + st.queued : ''} ${st.waiting ? '· menunggu approval ' + st.waiting : ''}</p>
        <p class="thought">💭 ${esc(n.thought || 'Tidak sedang memikirkan tugas.')}</p></div></div>
        <h3>Ucapan terakhir</h3><ul class="hist">${n.history.map(h => `<li><span>${h.at}</span>${esc(h.t)}</li>`).join('') || '<li class="muted">belum ada</li>'}</ul>`;
      const b = p.querySelector('[data-room]'); if (b) b.onclick = () => UI.openRoom(room.id);
    },
    close() { const p = document.getElementById('panel'); p.className = ''; p.querySelector('iframe').src = 'about:blank'; },
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') UI.close();
    if (e.key === '`' || e.key === '~') location.href = '/dashboard';
  });
  document.querySelector('#panel .pclose').addEventListener('click', UI.close);
  document.getElementById('panel').addEventListener('click', (e) => { if (e.target.id === 'panel') UI.close(); });
  document.querySelector('#panel iframe').addEventListener('load', (e) => {
    try { e.target.contentWindow.document.addEventListener('keydown', (k) => { if (k.key === 'Escape') UI.close(); }); } catch (err) { /* cross-origin page */ }
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#07060f', pixelArt: true, roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    fps: { target: 60, limit: 45 },
    scene: [Office],
  });
  game.events.on('ready', () => { window.office = game.scene.getScene('office'); });
  setTimeout(() => { window.office = game.scene.getScene('office'); }, 1500);
})();
