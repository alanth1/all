// NEONLOOM HQ - three painted towers, living overlays, PixelLab NPCs driven by real job state.
(function () {
  const W = window.W;
  const ASSETS = window.ASSETS || { npc: {}, tiles: {} };
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
  const TX = (t, x) => W.towerX(t) + x, TY = (y) => W.TOP + y;
  const floorPt = (fid, x, y) => ({ x: TX(W.FLOORS[fid].t, x), y: TY(y) });
  const NPC_SCALE = 2.6;

  class HQ extends Phaser.Scene {
    constructor() { super('hq'); this.npcs = {}; this.lastEvent = 0; this.state = null; this.occupied = new Set(); this.issueVisits = {}; this.pets = []; }

    preload() {
      W.TOWERS.forEach((t, i) => this.load.image(`tower${i}`, t.img));
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
      this.cameras.main.setBackgroundColor('#05040d');
      this.makeTextures();
      this.buildCity();
      this.buildTowers();
      this.buildFX();
      this.buildNPCs();
      this.buildLabels();
      this.updateSky();
      this.setupCamera();
      this.setupInput();
      if (DEBUG) this.drawDebug();
      this.time.addEvent({ delay: 220, loop: true, callback: () => this.tickFX() });
      this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickLife() });
      this.time.addEvent({ delay: 2600, loop: true, callback: () => this.spawnCar() });
      this.time.addEvent({ delay: 30000, loop: true, callback: () => this.updateSky() });
      this.poll(); this.time.addEvent({ delay: 3000, loop: true, callback: () => this.poll() });
      this.scale.on('resize', () => this.fitCamera());
    }

    // ------------------------------------------------------------ textures
    makeTextures() {
      for (const k of this.textures.getTextureKeys()) if (!k.startsWith('tower') && !k.startsWith('city')) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const mk = (key, w, h, draw) => { if (this.textures.exists(key)) return; const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); this.textures.addCanvas(key, c); };
      mk('px', 2, 2, g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2); });
      mk('rain', 2, 18, g => { const gr = g.createLinearGradient(0, 0, 0, 18); gr.addColorStop(0, 'rgba(170,200,255,0)'); gr.addColorStop(1, 'rgba(200,220,255,.8)'); g.fillStyle = gr; g.fillRect(0, 0, 2, 18); });
      mk('glow', 128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
      mk('puff', 24, 24, g => { const gr = g.createRadialGradient(12, 12, 0, 12, 12, 12); gr.addColorStop(0, 'rgba(235,235,245,.8)'); gr.addColorStop(1, 'rgba(235,235,245,0)'); g.fillStyle = gr; g.fillRect(0, 0, 24, 24); });
      mk('smoke', 48, 48, g => { const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, 'rgba(120,120,135,.7)'); gr.addColorStop(1, 'rgba(120,120,135,0)'); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); });
      mk('spark', 4, 4, g => { g.fillStyle = '#fde047'; g.fillRect(0, 0, 4, 4); });
      mk('car', 24, 8, g => { g.fillStyle = '#111827'; g.fillRect(0, 0, 24, 8); g.fillStyle = '#f472b6'; g.fillRect(0, 6, 24, 2); g.fillStyle = '#fef08a'; g.fillRect(21, 2, 3, 3); });
    }

    // ------------------------------------------------------------ city backdrop (fills the whole screen around the towers)
    buildCity() {
      const w = W.WORLD_W, h = W.WORLD_H;
      this.skyG = this.add.graphics().setDepth(-1000);
      const layer = (key, height, color, lit, seed, scale) => {
        const c = document.createElement('canvas'); c.width = Math.ceil(w / scale); c.height = Math.ceil(height / scale); const g = c.getContext('2d');
        let s = seed; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
        for (let x = 0; x < c.width;) {
          const bw = 12 + Math.floor(R() * 40), bh = c.height * (0.25 + R() * 0.75);
          g.fillStyle = color; g.fillRect(x, c.height - bh, bw, bh);
          if (R() > .55) { g.fillRect(x + bw / 2 - 1, c.height - bh - 14, 2, 14); g.fillStyle = '#ef4444'; g.fillRect(x + bw / 2 - 1, c.height - bh - 15, 2, 2); }
          for (let wy = c.height - bh + 5; wy < c.height - 4; wy += 5) for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (R() < lit) { g.fillStyle = pick(['#fde68a', '#67e8f9', '#f9a8d4', '#c4b5fd']); g.fillRect(wx, wy, 2, 2); }
          if (R() > .8) { g.fillStyle = pick(['#f472b6', '#22d3ee', '#a78bfa']); g.fillRect(x + 2, c.height - bh + 8, bw - 4, 3); }
          x += bw + Math.floor(R() * 6);
        }
        this.textures.addCanvas(key, c);
        return this.add.image(0, h, key).setOrigin(0, 1).setScale(scale).setDepth(-900);
      };
      this.cityFar = layer('city_far', h * .85, '#15143a', .14, 11, 2).setAlpha(.9);
      this.cityMid = layer('city_mid', h * .6, '#0e0d28', .22, 23, 2);
      this.cityNear = layer('city_near', h * .32, '#08071a', .3, 47, 2);
      this.cars = this.add.container(0, 0).setDepth(-850);
      this.carsFront = this.add.container(0, 0).setDepth(-50);
      this.flash = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setDepth(-840);
      this.rain = this.add.particles(0, 0, 'rain', { x: { min: -200, max: w + 200 }, y: -40, lifespan: 2600, speedY: { min: 900, max: 1100 }, speedX: -120, quantity: 6, frequency: 20, alpha: { start: .7, end: .2 }, emitting: false }).setDepth(-845);
      this.snow = this.add.particles(0, 0, 'px', { x: { min: 0, max: w }, y: -20, lifespan: 16000, speedY: { min: 40, max: 80 }, speedX: { min: -20, max: 20 }, scale: { min: 1, max: 2.5 }, quantity: 2, frequency: 60, emitting: false }).setDepth(-845);
      this.updateSky();
    }
    dayPhase() {
      const h = Q.has('hour') ? +Q.get('hour') : new Date().getHours() + new Date().getMinutes() / 60;
      if (h >= 7 && h < 17) return 'day'; if (h >= 17 && h < 19.5) return 'dusk'; if (h >= 5 && h < 7) return 'dawn'; return 'night';
    }
    weatherKind() { return Q.get('weather') || this.state?.weather?.kind || 'clear'; }
    updateSky() {
      const ph = this.dayPhase(), wk = this.weatherKind(), w = W.WORLD_W, h = W.WORLD_H;
      const pal = { day: [0x2b78c9, 0x8fd3f5], dusk: [0x2a0b4d, 0xe0507a], dawn: [0x241a63, 0xf2995e], night: [0x03020b, 0x1c1747] }[ph];
      const grey = ['rain', 'storm', 'cloudy', 'fog'].includes(wk);
      const g = this.skyG; g.clear(); const steps = 40;
      for (let i = 0; i < steps; i++) {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(pal[0]), Phaser.Display.Color.ValueToColor(pal[1]), steps, i);
        let col = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        if (grey) { const gc = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(col), Phaser.Display.Color.ValueToColor(0x3f4655), 10, 6); col = Phaser.Display.Color.GetColor(gc.r, gc.g, gc.b); }
        g.fillStyle(col); g.fillRect(-400, -400 + (h + 800) * i / steps, w + 800, (h + 800) / steps + 2);
      }
      if (ph === 'night' && !grey) for (let i = 0; i < 260; i++) { g.fillStyle(0xffffff, rnd(.2, .9)); g.fillRect(rnd(0, w), rnd(0, h * .45), 2, 2); }
      if (!grey) { g.fillStyle(ph === 'night' ? 0xf5f3ff : 0xfff3c4, 1); g.fillCircle(w * (ph === 'night' ? .86 : .14), 160, ph === 'night' ? 34 : 48); }
      const tint = ph === 'day' ? 0x6f7bb8 : 0xffffff;
      [this.cityFar, this.cityMid, this.cityNear].forEach(l => l.setTint(tint));
      this.rain.emitting = wk === 'rain' || wk === 'storm'; this.snow.emitting = wk === 'snow';
      (this.towerImgs || []).forEach(t => t.setTint(ph === 'day' ? 0xd9def5 : 0xffffff));
      (this.dayWin || []).forEach(g => g.setAlpha({ day: .16, dawn: .08, dusk: .07 }[ph] || 0));
      (this.windowRain || []).forEach(em => { em.emitting = wk === 'rain' || wk === 'storm'; });
    }
    spawnCar() {
      const w = W.WORLD_W, h = W.WORLD_H, n = (ASSETS.cars || []).length;
      const front = Math.random() < .35, dir = Math.random() < .5 ? 1 : -1;
      const y = front ? rnd(140, h * .55) : rnd(100, h * .7);
      const key = n ? `plcar_${Math.floor(Math.random() * n)}` : 'car';
      const car = this.add.image(dir > 0 ? -150 : w + 150, y, key).setFlipX(dir < 0).setScale(front ? rnd(1.6, 2.4) : rnd(.6, 1.1)).setAlpha(front ? 1 : .8);
      (front ? this.carsFront : this.cars).add(car);
      if (front) { const gl = this.add.image(car.x, car.y + 18, 'glow').setTint(0xf472b6).setScale(.8, .25).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.6); this.carsFront.add(gl); this.tweens.add({ targets: gl, x: dir > 0 ? w + 150 : -150, duration: 0, delay: 0 }); car.glow = gl; }
      const dur = front ? rnd(9000, 15000) : rnd(16000, 30000);
      this.tweens.add({ targets: car.glow ? [car, car.glow] : car, x: dir > 0 ? w + 150 : -150, duration: dur, onComplete: () => { car.glow && car.glow.destroy(); car.destroy(); } });
      // traffic visible through the painted windows
      for (const [ti, fx] of W.FX.entries()) for (const r of fx.windows) if (Math.random() < .25) {
        const [x0, y0, x1, y1] = r; const wy = TY(rnd(y0 + 30, y1 - 30));
        const c = this.add.image(dir > 0 ? TX(ti, x0) - 40 : TX(ti, x1) + 40, wy, key).setScale(rnd(.35, .6)).setFlipX(dir < 0).setAlpha(.85).setDepth(5);
        c.setMask(this.windowMasks[ti]);
        this.tweens.add({ targets: c, x: dir > 0 ? TX(ti, x1) + 40 : TX(ti, x0) - 40, duration: rnd(5000, 9000), onComplete: () => c.destroy() });
      }
      if (this.weatherKind() === 'storm' && Math.random() < .3) { this.flash.setAlpha(.55); this.tweens.add({ targets: this.flash, alpha: 0, duration: 500 }); }
    }

    // ------------------------------------------------------------ towers + living overlays
    buildTowers() {
      this.towerImgs = W.TOWERS.map((t, i) => this.add.image(W.towerX(i), W.TOP, `tower${i}`).setOrigin(0).setDepth(0));
      this.windowMasks = W.FX.map((fx, i) => {
        const g = this.make.graphics({ add: false }); g.fillStyle(0xffffff);
        for (const [x0, y0, x1, y1] of fx.windows) g.fillRect(TX(i, x0), TY(y0), x1 - x0, y1 - y0);
        return g.createGeometryMask();
      });
      this.dayWin = W.FX.map((fx, i) => {
        const g = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
        for (const [x0, y0, x1, y1] of fx.windows) { g.fillStyle(0x9fd4ff, 1); g.fillRect(TX(i, x0), TY(y0), x1 - x0, y1 - y0); }
        return g.setAlpha(0);
      });
      this.windowRain = W.FX.map((fx, i) => {
        const em = this.add.particles(0, 0, 'rain', { x: { min: TX(i, 0), max: TX(i, W.TOWER_W) }, y: TY(100), lifespan: 1400, speedY: { min: 700, max: 900 }, speedX: -60, quantity: 2, frequency: 30, alpha: { start: .55, end: .1 }, emitting: false }).setDepth(6);
        em.setMask(this.windowMasks[i]); return em;
      });
    }
    buildFX() {
      this.screenFx = []; this.ledFx = []; this.glowFx = []; this.neonFx = []; this.fanFx = [];
      W.FX.forEach((fx, i) => {
        for (const [x0, y0, x1, y1, big] of fx.screens) {
          const g = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
          this.screenFx.push({ g, x: TX(i, x0), y: TY(y0), w: x1 - x0, h: y1 - y0, big, t: i });
        }
        for (const [x0, y0, x1, y1] of fx.leds) for (let k = 0; k < 70; k++) {
          const r = this.add.rectangle(TX(i, rnd(x0, x1)), TY(rnd(y0, y1)), 4, 3, pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6, 0xfacc15])).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.2);
          this.ledFx.push(r);
        }
        for (const [x, y, col, r] of fx.glows) { const gl = this.add.image(TX(i, x), TY(y), 'glow').setTint(col).setScale(r / 64).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(.35); this.glowFx.push(gl); }
        for (const [x, y, col, kind] of fx.neon) { const gl = this.add.image(TX(i, x), TY(y), 'glow').setTint(col).setScale(kind ? 1.3 : 1.6, kind ? 1.3 : .5).setBlendMode(Phaser.BlendModes.ADD).setDepth(8).setAlpha(.5); this.neonFx.push(gl); }
        for (const [x, y] of fx.fans || []) this.fanFx.push({ g: this.add.graphics().setDepth(7), x: TX(i, x), y: TY(y) });
        for (const [x, y] of fx.steam || []) this.add.particles(TX(i, x), TY(y), 'puff', { lifespan: 2200, speedY: { min: -40, max: -25 }, speedX: { min: -8, max: 8 }, scale: { start: .5, end: 1.6 }, alpha: { start: .55, end: 0 }, frequency: 380 }).setDepth(9);
      });
      // ceiling neon strips pulse a little (cover the painted strips)
      this.dark = this.add.rectangle(0, 0, W.WORLD_W, W.WORLD_H, 0x0a0820, 0).setOrigin(0).setDepth(9000).setBlendMode(Phaser.BlendModes.MULTIPLY);
      // alarm beacons per room
      this.beacons = {};
      for (const r of W.ROOMS) {
        const [x0, y0, x1, y1] = r.rect; const cx = TX(r.t, (x0 + x1) / 2), cy = TY(y0 + 60);
        const halo = this.add.image(cx, cy, 'glow').setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(9500).setVisible(false);
        this.tweens.add({ targets: halo, alpha: { from: 1, to: .15 }, duration: 520, yoyo: true, repeat: -1 });
        const smoke = this.add.particles(TX(r.t, (x0 + x1) / 2), TY((y0 + y1) / 2), 'smoke', { lifespan: 3500, speedY: { min: -40, max: -20 }, speedX: { min: -10, max: 10 }, scale: { start: 1, end: 4 }, alpha: { start: .45, end: 0 }, frequency: 260, emitting: false }).setDepth(9400);
        this.beacons[r.id] = { halo, smoke };
      }
    }
    tickFX() {
      const st = this.state, statusOf = (n) => st?.agents?.find(a => a.name === n)?.status || 'idle';
      const night = this.dayPhase() === 'night';
      for (const s of this.screenFx) {
        const g = s.g; g.clear();
        const lines = s.big ? 14 : 6;
        for (let k = 0; k < lines; k++) {
          if (Math.random() < .5) continue;
          const y = s.y + (k + .5) * s.h / lines, len = rnd(.15, .7) * s.w, x = s.x + rnd(0, s.w - len);
          g.fillStyle(pick([0x22d3ee, 0x4ade80, 0xa78bfa, 0xf472b6]), rnd(.08, .22)); g.fillRect(x, y, len, Math.max(2, s.h / lines * .3));
        }
        if (Math.random() < .2) { g.fillStyle(0x8fd0e4, .07); g.fillRect(s.x, s.y, s.w, s.h); }
      }
      const cpu = (st?.system?.cpu ?? 25) / 100;
      for (const l of this.ledFx) if (Math.random() < .12 + cpu * .6) l.setAlpha(l.alpha > .5 ? .15 : rnd(.6, 1));
      for (const gl of this.glowFx) gl.setAlpha((night ? .4 : .22) + rnd(-.04, .04));
      for (const n of this.neonFx) n.setAlpha(Math.random() < .03 ? .1 : (night ? .5 : .3));
    }
    animate(time) {
      for (const f of this.fanFx) { const g = f.g; g.clear(); g.lineStyle(3, 0x94a3b8, .7); for (let k = 0; k < 4; k++) { const a = time / 90 + k * Math.PI / 2; g.lineBetween(f.x, f.y, f.x + Math.cos(a) * 26, f.y + Math.sin(a) * 26); } }
    }

    // ------------------------------------------------------------ NPCs
    buildNPCs() {
      for (const meta of AGENTS_META) {
        const a = (ASSETS.npc || {})[meta.name]; if (!a || !a.rot) continue;
        const anims = {}, poses = {};
        for (const [dir, urls] of Object.entries(a.walk || {})) { const k = `${meta.name}_walk_${dir}`; if (!this.anims.exists(k)) this.anims.create({ key: k, frames: urls.map((_, i) => ({ key: `${meta.name}_walk_${dir}_${i}` })), frameRate: 10, repeat: -1 }); anims[dir] = k; }
        for (const [anim, dirs] of Object.entries(a.anims || {})) for (const [dir, urls] of Object.entries(dirs)) {
          const k = `${meta.name}_${anim}_${dir}`; const idx = urls.map((_, i) => i).slice(urls.length > 4 ? 1 : 0);
          const rate = { typing: 9, idle: 5, coffee: 6, celebrate: 9, frustrated: 8, talk: 8, yawn: 6 }[anim] || 6;
          if (!this.anims.exists(k)) this.anims.create({ key: k, frames: idx.map(i => ({ key: `${meta.name}_${anim}_${dir}_${i}` })), frameRate: rate, repeat: -1, repeatDelay: anim === 'coffee' ? 1200 : 0 });
          (poses[anim] = poses[anim] || {})[dir] = k;
        }
        const work = W.WORK[meta.name]; if (!work) continue;
        const p = floorPt(work.floor, work.x, work.y);
        const sprite = this.add.sprite(p.x, p.y, `${meta.name}_rot_south-east`).setOrigin(.5, .93).setScale(NPC_SCALE);
        const npc = new NPC(this, meta, sprite, anims, poses, work);
        this.npcs[meta.name] = npc; npc.sitDown();
      }
      for (const [name, a] of Object.entries(ASSETS.pets || {})) if (a.rot && Object.keys(a.rot).length) this.pets.push(new Pet(this, name, a));
    }
    buildLabels() {
      this.roomLabels = {};
      for (const r of W.ROOMS) {
        const d = el('room-label', `<span>${r.name}</span><i class="warn"></i>`); d.style.setProperty('--accent', hex(r.accent));
        d.addEventListener('click', () => UI.openRoom(r.id));
        const [x0, y0, x1] = r.rect; this.roomLabels[r.id] = { d, x: TX(r.t, (x0 + x1) / 2), y: TY(y0 + 20) };
      }
    }
    drawDebug() {
      const g = this.add.graphics().setDepth(99999);
      for (const r of W.ROOMS) { const [x0, y0, x1, y1] = r.rect; g.lineStyle(4, r.accent, .8); g.strokeRect(TX(r.t, x0), TY(y0), x1 - x0, y1 - y0); }
      for (const [fid, f] of Object.entries(W.FLOORS)) { g.fillStyle(0xff0000); g.fillCircle(TX(f.t, f.exit[0]), TY(f.exit[1]), 12); for (const [x, y] of f.wander) { g.fillStyle(0xffff00); g.fillCircle(TX(f.t, x), TY(y), 9); } }
      for (const s of Object.values(W.SPOTS)) { g.fillStyle(0x00ffff); g.fillCircle(floorPt(s.floor, s.x, s.y).x, floorPt(s.floor, s.x, s.y).y, 9); }
      for (const [n, s] of Object.entries(W.WORK)) { const p = floorPt(s.floor, s.x, s.y); g.fillStyle(0xff00ff); g.fillCircle(p.x, p.y, 11); }
      W.FX.forEach((fx, i) => { g.lineStyle(3, 0x00ff00); fx.screens.forEach(([a, b, c, d]) => g.strokeRect(TX(i, a), TY(b), c - a, d - b)); g.lineStyle(3, 0x3399ff); fx.windows.forEach(([a, b, c, d]) => g.strokeRect(TX(i, a), TY(b), c - a, d - b)); });
    }

    // ------------------------------------------------------------ camera & input
    setupCamera() { this.cameras.main.setBounds(-W.WORLD_W, -W.WORLD_H, W.WORLD_W * 3, W.WORLD_H * 3); this.fitCamera(true); }
    fitCamera(first) {
      const cam = this.cameras.main, w = this.scale.width, h = this.scale.height;
      const content = { w: W.WORLD_W - W.MARGIN * 2 + 200, h: W.TOWER_H + 80 };
      const fit = Math.min(w / content.w, h / content.h);
      this.minZoom = fit * .8; this.fitZoom = fit;
      if (first || cam.zoom < this.minZoom) cam.setZoom(fit);
      cam.centerOn(W.WORLD_W / 2, W.TOP + W.TOWER_H / 2 + 10);
    }
    setupInput() {
      const cam = this.cameras.main; let down = null;
      this.input.on('pointerdown', p => { down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false }; });
      this.input.on('pointermove', p => {
        if (down && p.isDown) { const dx = p.x - down.x, dy = p.y - down.y; if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true; cam.setScroll(down.sx - dx / cam.zoom, down.sy - dy / cam.zoom); }
        else this.hover(p);
      });
      this.input.on('pointerup', p => { if (down && !down.moved) this.click(p); down = null; });
      this.input.on('wheel', (p, o, dx, dy) => {
        const nz = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? .88 : 1.14), this.minZoom, this.fitZoom * 6);
        const a = cam.getWorldPoint(p.x, p.y); cam.setZoom(nz); const b = cam.getWorldPoint(p.x, p.y); cam.scrollX += a.x - b.x; cam.scrollY += a.y - b.y;
      });
      this.input.keyboard.on('keydown-HOME', () => this.fitCamera(true));
    }
    roomAt(wp) {
      for (const r of W.ROOMS) { const [x0, y0, x1, y1] = r.rect; if (wp.x >= TX(r.t, x0) && wp.x <= TX(r.t, x1) && wp.y >= TY(y0) && wp.y <= TY(y1)) return r; }
      return null;
    }
    npcAt(wp) {
      let best = null;
      for (const n of [...Object.values(this.npcs), ...this.pets]) { const b = n.sprite.getBounds(); if (Phaser.Geom.Rectangle.Contains(b, wp.x, wp.y)) best = n; }
      return best;
    }
    hover(p) {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y); const r = this.roomAt(wp), n = this.npcAt(wp);
      this.game.canvas.style.cursor = (r || n) ? 'pointer' : 'grab';
      if (r !== this.hoverRoom) {
        this.hoverRoom = r; this.hoverG = this.hoverG || this.add.graphics().setDepth(9600); this.hoverG.clear();
        if (r) { const [x0, y0, x1, y1] = r.rect; this.hoverG.lineStyle(6, r.accent, .7); this.hoverG.strokeRect(TX(r.t, x0), TY(y0), x1 - x0, y1 - y0); }
        UI.tooltip(r ? `${r.name}${r.agent ? ' · ' + r.agent : ''} — klik untuk masuk` : '');
      }
    }
    click(p) {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const n = this.npcAt(wp); if (n) return n instanceof Pet ? n.say(pick(['Meow~', 'Mrrr…', 'Prrr 💜'])) : UI.openNPC(n);
      const r = this.roomAt(wp); if (r) UI.openRoom(r.id);
    }

    // ------------------------------------------------------------ server state
    async poll() {
      try {
        const r = await fetch(`/api/world?since=${this.lastEvent}`); if (!r.ok) throw new Error(r.status);
        const st = await r.json(); const first = !this.state, prevW = this.state?.weather?.kind;
        this.state = st; this.lastEvent = st.last_event;
        for (const a of st.agents) this.npcs[a.name]?.setServerStatus(a);
        if (!first) for (const ev of st.events) this.onEvent(ev);
        this.applyIssues(st.issues);
        if (prevW !== st.weather?.kind) this.updateSky();
        UI.hud(st);
      } catch (e) { UI.hud(null, e); }
    }
    onEvent(ev) {
      const n = this.npcs[ev.agent]; if (!n) return;
      if (ev.kind === 'running') { n.thought = ev.text; n.think(ev.text); return; }
      if (ev.kind === 'done' || ev.kind === 'published') {
        n.thought = null; n.say(ev.text, 7000, 'say'); UI.toast(ev, 'ok');
        if (n.mode !== 'work') n.celebrate();
        if (ev.handoff && this.npcs[ev.handoff] && ev.handoff !== ev.agent) n.deliver(this.npcs[ev.handoff]);
      } else if (ev.kind === 'failed') { n.say(ev.text, 9000, 'alert'); UI.toast(ev, 'err'); if (n.mode !== 'work') n.upset(); }
      else if (ev.kind === 'waiting_approval') { n.say(ev.text, 8000, 'alert'); UI.toast(ev, 'warn'); }
      else if (ev.kind === 'retrying') n.think(ev.text);
      n.log(ev.text);
    }
    applyIssues(list) {
      const byRoom = {}; for (const i of list || []) (byRoom[i.room] = byRoom[i.room] || []).push(i);
      this.issues = byRoom;
      for (const r of W.ROOMS) {
        const b = this.beacons[r.id], iss = byRoom[r.id] || [];
        const err = iss.some(i => i.level === 'error'), warn = iss.some(i => i.level === 'warn'), appr = iss.some(i => i.level === 'approval');
        const on = err || warn || appr, col = err ? 0xef4444 : appr ? 0xf472b6 : 0xfacc15;
        b.halo.setVisible(on).setTint(col); b.smoke.emitting = err && (r.id === 'server' || iss.length > 1);
        const lab = this.roomLabels[r.id].d; lab.classList.toggle('alarm', on); lab.querySelector('.warn').textContent = on ? (appr && !err ? '!' : '⚠') : ''; lab.title = iss.map(i => i.text).join('\n');
      }
    }

    // ------------------------------------------------------------ life
    tickLife() {
      const npcs = Object.values(this.npcs), night = this.dayPhase() === 'night', free = npcs.filter(n => n.isFree());
      for (const n of npcs) n.tick();
      const zero = this.npcs['ZERO-1'];
      if (zero && zero.isFree() && this.issues) {
        const rooms = Object.entries(this.issues).filter(([rid, iss]) => iss.some(i => i.level === 'error' || i.level === 'warn') && (!this.issueVisits[rid] || nowMs() - this.issueVisits[rid] > 120000));
        if (rooms.length) { const [rid, iss] = rooms[0]; this.issueVisits[rid] = nowMs(); zero.service(W.roomById[rid], iss[0]); }
      }
      for (const n of free) {
        if (nowMs() < n.nextDecision || !n.isFree()) continue;
        n.nextDecision = nowMs() + rnd(10000, 24000);
        const r = Math.random();
        if (night && r < .35) n.goSpot(pick(['couch1', 'couch2', 'bean1', 'bean2', 'bean3']), true);
        else if (r < .22) n.wander();
        else if (r < .38) n.goSpot(pick(['coffee', 'vending', 'water']));
        else if (r < .58) { const partner = free.find(m => m !== n && m.isFree() && Math.random() < .6); partner ? this.startChat(n, partner) : n.wander(); }
        else if (r < .70) n.goSpot(pick(['arcade', 'arcade2']));
        else if (r < .82) n.goSpot(pick(['couch1', 'couch2', 'bean1', 'bean2', 'bean3', 'beanS', 'beanG']));
        else if (r < .90) n.goWindow();
        else n.goDesk();
      }
    }
    startChat(a, b) {
      const pairs = [['chatA', 'chatB'], ['pingA', 'pingB']].filter(([p, q]) => !this.occupied.has(p) && !this.occupied.has(q));
      if (!pairs.length) return a.wander();
      const [sa, sb] = pick(pairs); const conv = { a, b, arrived: 0, ping: sa === 'pingA' };
      a.joinChat(conv, sa); b.joinChat(conv, sb);
    }
    async runChat(conv) {
      let lines; try { lines = await (await fetch('/api/world/banter')).json(); } catch (e) { lines = ['Hai!', 'Halo, lagi santai?']; }
      const seq = [[conv.a, lines[0]], [conv.b, lines[1]]]; if (conv.ping) seq.push([conv.a, 'Servis keras! 🏓'], [conv.b, 'Hampir!']);
      let t = 0;
      for (const [who, text] of seq) { this.time.delayedCall(t, () => { if (who.inChat) { who.say(text, 3800, 'chat'); who.emote('talk', 3600); } }); t += 4200; }
      this.time.delayedCall(t + 600, () => { conv.a.endChat(); conv.b.endChat(); });
    }
    update(time, dt) {
      for (const n of Object.values(this.npcs)) n.update(dt);
      for (const p of this.pets) p.update(dt);
      this.animate(time);
      UI.layout(this);
    }
  }

  // ------------------------------------------------------------ NPC
  class NPC {
    constructor(scene, meta, sprite, anims, poses, work) {
      Object.assign(this, { scene, meta, sprite, anims, poses, work });
      this.name = meta.name; this.floor = work.floor; this.target = null; this.speed = 110; this.mode = 'free'; this.server = { status: 'idle' };
      this.nextDecision = nowMs() + rnd(3000, 12000); this.history = []; this.thought = null; this.facing = work.face;
      this.tag = el('npc-tag', `<b>${meta.name}</b>`); this.tag.style.setProperty('--c', meta.color);
      this.icon = el('npc-icon', ''); this.bubble = el('bubble hidden', ''); this.carry = el('npc-carry hidden', '📄'); this.zzz = el('npc-zzz hidden', 'z<small>z</small>');
      this.tag.addEventListener('click', () => UI.openNPC(this)); this.bubble.addEventListener('click', () => UI.openNPC(this));
      this.rot = true;
    }
    log(t) { this.history.unshift({ t, at: new Date().toLocaleTimeString().slice(0, 5) }); this.history = this.history.slice(0, 12); }
    setTex(dir) { const k = `${this.name}_rot_${dir}`; if (this.scene.textures.exists(k)) this.sprite.setTexture(k).setFlipX(false); }
    pose(anim, dir) {
      const p = this.poses[anim]; if (!p) return false;
      const flip = { 'north-east': 'north-west', 'north-west': 'north-east', 'south-west': 'south-east', 'south-east': 'south-west' };
      let k = p[dir], f = false; if (!k && p[flip[dir]]) { k = p[flip[dir]]; f = true; } if (!k) return false;
      this.sprite.setFlipX(f).play(k, true); this.posing = anim; return true;
    }
    endPose() { if (this.posing) { this.posing = null; this.sprite.anims.stop(); this.setTex(this.facing); } }
    emote(anim, ms = 3200) {
      if (this.moving || this.sitting) return false;
      const dir = this.facing.startsWith('south') ? this.facing : 'south-east';
      if (!this.pose(anim, dir)) return false;
      clearTimeout(this._emo); this._emo = setTimeout(() => { if (this.posing === anim) { this.endPose(); this.pose('idle', this.facing.startsWith('south') ? this.facing : 'south-east'); } }, ms);
      return true;
    }
    celebrate() { if (this.sitting) this.standUp(); this.facing = 'south-east'; this.emote('celebrate', 3400); }
    upset() { if (this.sitting) this.standUp(); this.facing = 'south-east'; this.emote('frustrated', 4200); }
    sitDown() {
      this.sitting = true;
      if (this.atWork() && this.pose('typing', this.work.face)) { if (!['working', 'queued'].includes(this.server.status)) this.sprite.anims.pause(); }
    }
    standUp() { this.endPose(); this.sitting = false; }
    atWork() { const p = floorPt(this.work.floor, this.work.x, this.work.y); return this.floor === this.work.floor && Math.hypot(this.sprite.x - p.x, this.sprite.y - p.y) < 6; }
    isFree() { return this.mode === 'free' && !this.inChat && !['working', 'queued'].includes(this.server.status); }
    release() { if (this.spot) { this.scene.occupied.delete(this.spot); this.spot = null; } this.zzz.classList.add('hidden'); }

    // move to (floor, x, y). Different floor -> walk to exit, lift-teleport, walk from exit.
    goTo(floor, x, y, face, cb) {
      this.standUp();
      const legs = [];
      if (floor !== this.floor) { const a = W.FLOORS[this.floor].exit, b = W.FLOORS[floor].exit; legs.push({ floor: this.floor, x: a[0], y: a[1] }, { tp: true, floor, x: b[0], y: b[1] }); }
      legs.push({ floor, x, y });
      this.legs = legs; this.face_ = face; this.cb = cb; this.nextLeg();
    }
    nextLeg() {
      const leg = this.legs.shift();
      if (!leg) { this.moving = false; this.sprite.anims.stop(); if (this.face_) { this.facing = this.face_; this.setTex(this.facing); } if (!this.sitting && this.facing.startsWith('south')) this.pose('idle', this.facing); const cb = this.cb; this.cb = null; cb && cb(true); return; }
      if (leg.tp) {
        this.moving = true; this.sprite.anims.stop();
        const s = this.scene, p = floorPt(leg.floor, leg.x, leg.y);
        const beam = (x, y) => { const g = s.add.image(x, y - 70, 'glow').setTint(0x67e8f9).setScale(.6, 2.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(9700); s.tweens.add({ targets: g, alpha: 0, duration: 700, onComplete: () => g.destroy() }); };
        beam(this.sprite.x, this.sprite.y);
        s.tweens.add({ targets: this.sprite, alpha: 0, duration: 350, onComplete: () => {
          this.sprite.setPosition(p.x, p.y); this.floor = leg.floor; beam(p.x, p.y);
          s.tweens.add({ targets: this.sprite, alpha: 1, duration: 350, onComplete: () => this.nextLeg() });
        } });
        return;
      }
      this.moving = true; this.dest = floorPt(leg.floor, leg.x, leg.y);
    }
    update(dt) {
      if (this.moving && this.dest) {
        const dx = this.dest.x - this.sprite.x, dy = this.dest.y - this.sprite.y, dist = Math.hypot(dx, dy), step = this.speed * dt / 1000;
        const dir = dx >= 0 ? (dy >= 0 ? 'south-east' : 'north-east') : (dy >= 0 ? 'south-west' : 'north-west');
        if (this.posing) this.posing = null;
        const base = dir.startsWith('north') ? 'north-east' : 'south-east', k = this.anims[base];
        if (k) { this.sprite.setFlipX(dir.endsWith('west')); if (this.sprite.anims.currentAnim?.key !== k || !this.sprite.anims.isPlaying) this.sprite.play(k); }
        this.facing = dir;
        if (dist <= step) { this.sprite.setPosition(this.dest.x, this.dest.y); this.dest = null; this.nextLeg(); }
        else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      this.sprite.setDepth(100 + this.sprite.y / 10);
    }
    setServerStatus(a) {
      const prev = this.server.status; this.server = a; if (a.status === prev) return;
      this.icon.className = 'npc-icon ' + (a.status === 'error' ? 'err' : a.status === 'waiting' ? 'wait' : '');
      this.icon.textContent = a.status === 'error' ? '!' : a.status === 'waiting' ? '?' : '';
      if (this.posing === 'typing') { ['working', 'queued'].includes(a.status) ? this.sprite.anims.resume() : this.sprite.anims.pause(); }
      if (a.status === 'working' || a.status === 'queued') { if (this.inChat) this.endChat(true); this.release(); this.mode = 'work'; this.goDesk(true); }
      else if (a.status === 'waiting') { this.say(this.name === 'NYX-21' ? 'Ada listing menunggu approval kamu! Klik aku.' : 'Menunggu keputusan kamu…', 7000, 'alert'); }
      else if (this.mode === 'work') { this.mode = 'free'; this.nextDecision = nowMs() + rnd(3000, 8000); }
    }
    tick() {
      if (this.mode === 'work' && this.sitting && Math.random() < .08) this.think(this.thought || pick(['Fokus…', 'Hampir selesai…', 'Cek ulang datanya…']));
      if (this.server.status === 'waiting' && Math.random() < .03) this.say('Butuh approval kamu 👀', 4000, 'alert');
      if (this.server.status === 'error' && Math.random() < .03) { this.say('Ada yang error, cek ruanganku ya.', 5000, 'alert'); }
      if (this.mode === 'free' && !this.moving && !this.inChat && !this.sitting && !this.posing && Math.random() < (this.scene.dayPhase() === 'night' ? .04 : .012)) { if (this.emote('yawn', 3500)) this.say(pick(['Hoaam… ngantuk.', 'Peregangan dulu~', 'Butuh kopi…']), 3000, 'chat'); }
      if (this.mode === 'free' && !this.moving && !this.inChat && Math.random() < .015) this.think(pick(['Hmm…', 'Ide konten baru…', 'Kopi lagi?', 'Data hari ini menarik.']));
    }
    goDesk(working) { const w = this.work; this.goTo(w.floor, w.x, w.y, w.face, () => { this.sitDown(); if (working) { this.sprite.anims.resume(); this.think(this.thought || 'Mulai kerja…'); } }); }
    wander() { this.mode = 'busy'; const f = Math.random() < .7 ? this.work.floor : 't3l'; const [x, y] = pick(W.FLOORS[f].wander); this.goTo(f, x, y, pick(['south-east', 'south-west']), () => { this.mode = 'free'; }); }
    goSpot(id, sleep) {
      const s = W.SPOTS[id]; if (!s || this.scene.occupied.has(id)) return this.wander();
      this.scene.occupied.add(id); this.spot = id; this.mode = 'busy';
      this.goTo(s.floor, s.x, s.y, s.face, () => {
        if (s.kind === 'snack') { this.facing = 'south-east'; this.pose('coffee', 'south-east'); this.say(pick(['Kopi dulu ☕', 'Snack biar fokus.', 'Segar!']), 3500, 'chat'); }
        else if (s.kind === 'game') this.say(pick(['Satu ronde aja 🎮', 'Highscore baru!', 'Ayo combo!']), 3500, 'chat');
        else if (s.kind === 'rest') { if (sleep) this.zzz.classList.remove('hidden'); else this.say(pick(['Rebahan sebentar…', 'Nyaman banget.', 'Istirahat 5 menit.']), 3500, 'chat'); }
        this.scene.time.delayedCall(s.kind === 'game' ? rnd(14000, 26000) : s.kind === 'rest' ? rnd(15000, 30000) : rnd(6000, 10000), () => { if (this.spot === id) { this.release(); this.mode = 'free'; this.goDesk(); } });
      });
    }
    goWindow() {
      const opts = Object.entries(W.FLOORS).flatMap(([fid, f]) => f.window.map(w => [fid, ...w]));
      if (!opts.length) return this.wander();
      const [fid, x, y, face] = pick(opts); this.mode = 'busy';
      this.goTo(fid, x, y, face, () => {
        const wk = this.scene.weatherKind();
        this.say({ rain: 'Hujan lagi… neon kota memantul cantik.', storm: 'Petirnya keras!', snow: 'Salju?! Langka banget.', fog: 'Kabut tebal di luar.', cloudy: 'Mendung, enak buat kerja.' }[wk] || pick(['Mobil terbang ramai hari ini.', 'Langitnya bagus.']), 4000, 'chat');
        this.scene.time.delayedCall(6000, () => { this.mode = 'free'; });
      });
    }
    joinChat(conv, spot) {
      this.inChat = conv; this.mode = 'busy'; this.spot = spot; this.scene.occupied.add(spot);
      const s = W.SPOTS[spot]; this.goTo(s.floor, s.x, s.y, s.face, () => { conv.arrived++; if (conv.arrived === 2) this.scene.runChat(conv); });
      this.scene.time.delayedCall(60000, () => { if (this.inChat === conv) this.endChat(); });
    }
    endChat(silent) { if (!this.inChat) return; this.inChat = null; this.release(); this.mode = 'free'; if (!silent) this.goDesk(); }
    deliver(target) {
      if (this.mode === 'work') return;
      this.mode = 'busy'; this.carry.classList.remove('hidden');
      const tw = target.work; this.goTo(tw.floor, tw.x + 90, tw.y + 30, 'north-west', () => {
        this.say(`${target.name}, ini hasilnya. Tolong lanjutkan!`, 4000, 'say'); this.facing = 'south-west'; this.emote('talk', 3800);
        this.scene.time.delayedCall(2500, () => target.say(pick(['Siap, aku proses!', 'Oke, langsung aku cek.', 'Mantap, terima kasih!']), 3500, 'say'));
        this.scene.time.delayedCall(4500, () => { this.carry.classList.add('hidden'); this.mode = 'free'; this.goDesk(); });
      });
    }
    service(room, issue) {
      this.mode = 'busy'; this.say(`Menuju ${room.name.toLowerCase()} untuk servis…`, 3500, 'say');
      const f = W.FLOORS[room.floor]; const [x, y] = pick(f.wander);
      this.goTo(room.floor, x, y, 'north-east', () => {
        this.say(`Cek: ${issue.text}`, 6000, 'alert');
        const sp = this.scene.add.particles(this.sprite.x + 30, this.sprite.y - 60, 'spark', { lifespan: 600, speed: { min: 60, max: 160 }, angle: { min: 200, max: 340 }, gravityY: 300, quantity: 3, frequency: 120 }).setDepth(9800);
        this.scene.time.delayedCall(7000, () => { sp.destroy(); this.say('Sudah aku cek. Detail ada di ruangan ini — klik ruangannya.', 5000, 'say'); this.mode = 'free'; this.goDesk(); });
      });
    }
    say(text, ms = 5000, kind = 'say') { this.bubbleShow(text, ms, kind); this.log(text); }
    think(text) { if (!this.bubbleBusy) this.bubbleShow(text, 3500, 'think'); }
    bubbleShow(text, ms, kind) {
      const b = this.bubble; b.className = `bubble ${kind}`; b.innerHTML = `<span class="who">${this.name}</span>${esc(text)}`;
      this.bubbleBusy = kind !== 'think'; clearTimeout(this._bt); this._bt = setTimeout(() => { b.classList.add('hidden'); this.bubbleBusy = false; }, ms);
    }
  }

  // ------------------------------------------------------------ office cat
  class Pet {
    constructor(scene, name, a) {
      this.scene = scene; this.name = name; this.floor = 't3l'; this.dest = null; this.next = 0; this.speed = 70;
      const p = floorPt('t3l', 700, 2250);
      this.sprite = scene.add.sprite(p.x, p.y, `${name}_rot_south-east`).setOrigin(.5, .9).setScale(1.6);
      const mk = (anim, rate) => { const d = (a[anim === 'walk' ? 'walk' : 'anims'] || {}); const set = anim === 'walk' ? d : (d[anim] || {}); const dir = Object.keys(set)[0]; if (!dir) return null; const k = `${name}_${anim}_${dir}`; if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: set[dir].map((_, i) => ({ key: `${name}_${anim}_${dir}_${i}` })).slice(1), frameRate: rate, repeat: -1 }); return k; };
      this.walkKey = mk('walk', 10); this.sleepKey = mk('sleep', 3); this.groomKey = mk('idle', 6);
      this.bubble = el('bubble hidden', '');
    }
    say(t) { const b = this.bubble; b.className = 'bubble chat'; b.innerHTML = `<span class="who">NEKO</span>${esc(t)}`; clearTimeout(this._t); this._t = setTimeout(() => b.classList.add('hidden'), 3000); }
    update(dt) {
      if (!this.dest && nowMs() > this.next) {
        const r = Math.random();
        if (r < .3 && this.sleepKey) { this.sprite.play(this.sleepKey); this.next = nowMs() + rnd(15000, 40000); }
        else if (r < .5 && this.groomKey) { this.sprite.play(this.groomKey); this.next = nowMs() + rnd(5000, 10000); }
        else { const [x, y] = pick(W.FLOORS.t3l.wander); this.dest = floorPt('t3l', x + rnd(-60, 60), y + rnd(-30, 30)); }
      }
      if (this.dest) {
        const dx = this.dest.x - this.sprite.x, dy = this.dest.y - this.sprite.y, dist = Math.hypot(dx, dy), step = this.speed * dt / 1000;
        if (this.walkKey && this.sprite.anims.currentAnim?.key !== this.walkKey) this.sprite.play(this.walkKey);
        this.sprite.setFlipX(dx < 0);
        if (dist <= step) { this.sprite.setPosition(this.dest.x, this.dest.y); this.dest = null; this.sprite.anims.stop(); this.sprite.setTexture(`${this.name}_rot_south-east`); this.next = nowMs() + rnd(3000, 9000); }
        else this.sprite.setPosition(this.sprite.x + dx / dist * step, this.sprite.y + dy / dist * step);
      }
      this.sprite.setDepth(100 + this.sprite.y / 10);
    }
  }

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
