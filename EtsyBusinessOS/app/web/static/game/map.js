// Building layout, furniture placement and grid pathfinding for the living office.
(function () {
  const W = (window.W = window.W || {});
  W.TW = 32; W.TH = 16; W.GW = 32; W.GH = 24; W.WALL_H = 84;

  // Each room: grid rectangle (inclusive), floor tile key, owner agent and the pages it opens.
  W.ROOMS = [
    { id: 'lab', name: 'RESEARCH LAB', x0: 0, y0: 0, x1: 7, y1: 7, floor: 'floor_lab', accent: 0x4ade80, agent: 'RAZE-11',
      pages: [['Riset keyword & kompetitor', '/research']] },
    { id: 'studio', name: 'WRITERS STUDIO', x0: 8, y0: 0, x1: 15, y1: 7, floor: 'floor_studio', accent: 0xc084fc, agent: 'JUNO-X9',
      pages: [['Buat listing', '/listings'], ['Shared Brain', '/brain']] },
    { id: 'command', name: 'COMMAND DECK', x0: 16, y0: 0, x1: 23, y1: 7, floor: 'floor_office', accent: 0x22d3ee, agent: 'KAI-07',
      pages: [['Ringkasan', '/dashboard'], ['Automation', '/automation'], ['Audit log', '/audit'], ['Notifikasi', '/notifications']] },
    { id: 'server', name: 'SERVER ROOM', x0: 24, y0: 0, x1: 31, y1: 7, floor: 'floor_server', accent: 0xfb923c, agent: 'ZERO-1',
      pages: [['Pengaturan', '/settings'], ['Panduan API', '/setup'], ['Diagnostik', '/diagnostics']] },
    { id: 'qa', name: 'QA BAY', x0: 0, y0: 8, x1: 7, y1: 15, floor: 'floor_qa', accent: 0xfacc15, agent: 'VOLT-3',
      pages: [['Approval & validasi', '/approvals']] },
    { id: 'shop', name: 'SHOP FLOOR', x0: 8, y0: 8, x1: 15, y1: 15, floor: 'floor_shop', accent: 0xf472b6, agent: 'NYX-21',
      pages: [['Approval Center', '/approvals'], ['Listing & toko', '/listings']] },
    { id: 'growth', name: 'GROWTH STUDIO', x0: 16, y0: 8, x1: 23, y1: 15, floor: 'floor_growth', accent: 0xfb7185, agent: 'HEX-04',
      pages: [['Social media', '/social']] },
    { id: 'data', name: 'DATA ROOM', x0: 24, y0: 8, x1: 31, y1: 15, floor: 'floor_data', accent: 0x60a5fa, agent: 'ORIN-88',
      pages: [['Analytics & impor Shop Stats', '/analytics']] },
    { id: 'archive', name: 'ARCHIVE', x0: 0, y0: 16, x1: 7, y1: 23, floor: 'floor_archive', accent: 0xd6a76c, agent: 'SABLE-6',
      pages: [['Aset & produk', '/assets']] },
    { id: 'finance', name: 'FINANCE VAULT', x0: 8, y0: 16, x1: 15, y1: 23, floor: 'floor_finance', accent: 0xfbbf24, agent: 'KADE-12',
      pages: [['Akuntansi', '/accounting']] },
    { id: 'lounge', name: 'LOUNGE · PANTRY', x0: 16, y0: 16, x1: 31, y1: 23, floor: 'floor_office', accent: 0xa78bfa, agent: null,
      pages: [] },
  ];
  W.roomById = Object.fromEntries(W.ROOMS.map(r => [r.id, r]));
  W.roomAt = (x, y) => W.ROOMS.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) || null;

  // Doors: gaps in the partition walls (edge between two cells).
  const doorCells = new Set();
  const addDoor = (ax, ay, bx, by) => { doorCells.add(`${ax},${ay}|${bx},${by}`); doorCells.add(`${bx},${by}|${ax},${ay}`); };
  for (const bx of [8, 16, 24]) for (const yy of [3, 4, 11, 12, 19, 20]) addDoor(bx - 1, yy, bx, yy);
  for (const by of [8, 16]) for (const xx of [3, 4, 11, 12, 19, 20, 27, 28]) addDoor(xx, by - 1, xx, by);

  W.edgeBlocked = (ax, ay, bx, by) => {
    const ra = W.roomAt(ax, ay), rb = W.roomAt(bx, by);
    if (!ra || !rb) return true;
    if (ra === rb) return false;
    return !doorCells.has(`${ax},${ay}|${bx},${by}`);
  };
  // Partition segments for drawing: list of {x,y,side} where side 'x' = wall on the +x edge of cell, 'y' = +y edge.
  W.partitions = [];
  for (let x = 0; x < W.GW; x++) for (let y = 0; y < W.GH; y++) {
    if (x + 1 < W.GW && W.roomAt(x, y) !== W.roomAt(x + 1, y)) W.partitions.push({ x, y, side: 'x', door: !W.edgeBlocked(x, y, x + 1, y) });
    if (y + 1 < W.GH && W.roomAt(x, y) !== W.roomAt(x, y + 1)) W.partitions.push({ x, y, side: 'y', door: !W.edgeBlocked(x, y, x, y + 1) });
  }

  // Furniture: {t: type, x, y, a?, b?, room, ...}. a/b = footprint in cells along x / y.
  const F = [];
  const add = (o) => { F.push(o); return o; };
  // desk + chair workstation helper: desk at (x,y) spanning b cells along y, chair at (x+1,y) facing desk (north-west).
  W.WORK = {};
  const station = (agent, x, y, monitors = 2, extra = {}) => {
    add({ t: 'desk', x, y, a: 1, b: 2, monitors, agent, ...extra });
    add({ t: 'chair', x: x + 1, y: y, a: 1, b: 1, walk: true });
    W.WORK[agent] = { x: x + 1, y: y, face: 'north-west' };
  };
  // Research lab
  station('RAZE-11', 2, 3, 3); add({ t: 'holotable', x: 5, y: 1, a: 2, b: 2 }); add({ t: 'whiteboard', wall: 'y', x: 1, y: 0, len: 3 });
  add({ t: 'plant', x: 0, y: 6 }); add({ t: 'shelf', x: 6, y: 5, a: 1, b: 2 });
  // Writers studio
  station('JUNO-X9', 10, 3, 2); add({ t: 'bookshelf', x: 8, y: 0, a: 1, b: 3 }); add({ t: 'beanbag', x: 13, y: 6, color: 0x7c3aed });
  add({ t: 'plant', x: 15, y: 0 }); add({ t: 'lamp', x: 12, y: 1 }); add({ t: 'poster', wall: 'y', x: 12, y: 0, len: 2 });
  // Command deck
  station('KAI-07', 19, 4, 3); add({ t: 'bigscreen', wall: 'y', x: 17, y: 0, len: 5 }); add({ t: 'roundtable', x: 17, y: 2, a: 2, b: 2 });
  add({ t: 'plant', x: 23, y: 7 }); add({ t: 'blackbox', x: 22, y: 1 });
  // Server room
  station('ZERO-1', 27, 5, 2);
  for (let i = 0; i < 4; i++) add({ t: 'rack', x: 24 + i * 2, y: 1, a: 1, b: 1, idx: i });
  add({ t: 'cooler', x: 31, y: 4, a: 1, b: 2 }); add({ t: 'toolbox', x: 25, y: 6 }); add({ t: 'statusboard', wall: 'y', x: 24, y: 0, len: 8 });
  // QA bay
  station('VOLT-3', 2, 11, 2); add({ t: 'scanner', x: 5, y: 9, a: 2, b: 1 }); add({ t: 'crate', x: 0, y: 14 }); add({ t: 'crate', x: 1, y: 14 });
  // Shop floor
  station('NYX-21', 10, 11, 2, { approval: true }); add({ t: 'counter', x: 13, y: 9, a: 1, b: 3 }); add({ t: 'boxes', x: 8, y: 14 });
  add({ t: 'plant', x: 15, y: 15 });
  // Growth studio
  station('HEX-04', 18, 11, 2); add({ t: 'ringlight', x: 21, y: 9 }); add({ t: 'camera', x: 21, y: 12 }); add({ t: 'poster', wall: 'none', x: 0, y: 0 });
  add({ t: 'beanbag', x: 22, y: 14, color: 0xdb2777 });
  // Data room
  station('ORIN-88', 26, 11, 3); add({ t: 'dashwall', x: 30, y: 9, a: 1, b: 4 }); add({ t: 'plant', x: 24, y: 15 });
  // Archive
  station('SABLE-6', 3, 19, 1); for (let i = 0; i < 3; i++) add({ t: 'cabinet', x: 0, y: 16 + i * 2, a: 1, b: 1 });
  add({ t: 'shelf', x: 6, y: 16, a: 1, b: 2 }); add({ t: 'boxes', x: 6, y: 22 });
  // Finance vault
  station('KADE-12', 11, 19, 2); add({ t: 'safe', x: 14, y: 16, a: 2, b: 2 }); add({ t: 'coins', x: 9, y: 22 }); add({ t: 'plant', x: 8, y: 16 });
  // Lounge & pantry
  add({ t: 'vending', x: 16, y: 16, a: 1, b: 1, id: 'vending' }); add({ t: 'coffee', x: 18, y: 16, id: 'coffee' }); add({ t: 'cooler_water', x: 19, y: 16 });
  add({ t: 'arcade', x: 22, y: 16, id: 'arcade' }); add({ t: 'arcade', x: 24, y: 16, id: 'arcade2', variant: 1 });
  add({ t: 'couch', x: 27, y: 17, a: 1, b: 3, id: 'couch' }); add({ t: 'table', x: 25, y: 18, a: 1, b: 1 });
  add({ t: 'beanbag', x: 20, y: 21, color: 0x2563eb, id: 'bean1' }); add({ t: 'beanbag', x: 22, y: 22, color: 0x059669, id: 'bean2' });
  add({ t: 'beanbag', x: 18, y: 22, color: 0x9333ea, id: 'bean3' }); add({ t: 'plant', x: 31, y: 16 }); add({ t: 'plant', x: 16, y: 23 });
  add({ t: 'pingpong', x: 28, y: 21, a: 2, b: 1 });
  W.FURNITURE = F.filter(f => f.t !== 'poster' || f.wall !== 'none');

  // Activity spots (cell where an NPC stands + facing) for idle life.
  W.SPOTS = {
    coffee: { x: 18, y: 17, face: 'north-west' }, vending: { x: 16, y: 17, face: 'north-east' }, water: { x: 19, y: 17, face: 'north-east' },
    arcade: { x: 22, y: 17, face: 'north-east' }, arcade2: { x: 24, y: 17, face: 'north-east' },
    couch1: { x: 26, y: 17, face: 'south-east', sit: true }, couch2: { x: 26, y: 18, face: 'south-east', sit: true }, couch3: { x: 26, y: 19, face: 'south-east', sit: true },
    bean1: { x: 21, y: 21, face: 'north-west', sit: true }, bean2: { x: 23, y: 22, face: 'north-west', sit: true }, bean3: { x: 19, y: 22, face: 'north-west', sit: true },
    chatA: { x: 23, y: 19, face: 'south-east' }, chatB: { x: 24, y: 20, face: 'north-west' },
    chatC: { x: 18, y: 19, face: 'south-east' }, chatD: { x: 19, y: 20, face: 'north-west' },
    pingA: { x: 27, y: 21, face: 'south-east' }, pingB: { x: 30, y: 21, face: 'north-west' },
  };
  // windows to gaze through (cells next to the back walls)
  W.WINDOW_SPOTS = [];
  for (let x = 1; x < W.GW; x += 3) W.WINDOW_SPOTS.push({ x, y: 0, face: 'north-east' });
  for (let y = 1; y < W.GH; y += 3) W.WINDOW_SPOTS.push({ x: 0, y, face: 'north-west' });

  // Blocked cells (furniture) except walkable ones.
  W.blocked = new Set();
  for (const f of W.FURNITURE) {
    if (f.walk || f.wall) continue;
    const a = f.a || 1, b = f.b || 1;
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) W.blocked.add(`${f.x + i},${f.y + j}`);
  }
  // spots must stay free
  for (const s of [...Object.values(W.SPOTS), ...Object.values(W.WORK), ...W.WINDOW_SPOTS]) W.blocked.delete(`${s.x},${s.y}`);

  W.walkable = (x, y) => x >= 0 && y >= 0 && x < W.GW && y < W.GH && !W.blocked.has(`${x},${y}`);

  // BFS pathfinding (4-neighbour, respects partition walls)
  W.findPath = (sx, sy, tx, ty) => {
    if (sx === tx && sy === ty) return [];
    const key = (x, y) => x * 100 + y;
    const prev = new Map([[key(sx, sy), null]]);
    const q = [[sx, sy]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (prev.has(key(nx, ny))) continue;
        if (!(nx === tx && ny === ty) && !W.walkable(nx, ny)) continue;
        if (nx < 0 || ny < 0 || nx >= W.GW || ny >= W.GH) continue;
        if (W.edgeBlocked(x, y, nx, ny)) continue;
        prev.set(key(nx, ny), [x, y]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const path = [];
    let cur = [tx, ty];
    while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
    return path;
  };

  W.randomCellIn = (room, rnd = Math.random) => {
    for (let i = 0; i < 60; i++) {
      const x = room.x0 + Math.floor(rnd() * (room.x1 - room.x0 + 1));
      const y = room.y0 + Math.floor(rnd() * (room.y1 - room.y0 + 1));
      if (W.walkable(x, y)) return { x, y };
    }
    return { x: room.x0 + 1, y: room.y0 + 1 };
  };

  // iso projection; world origin chosen so the whole building is in positive coordinates
  W.OX = W.GH * W.TW / 2 + 40; W.OY = W.WALL_H + 60;
  W.iso = (x, y, z = 0) => ({ x: W.OX + (x - y) * W.TW / 2, y: W.OY + (x + y) * W.TH / 2 - z });
  W.cellCenter = (x, y) => W.iso(x + 0.5, y + 0.5);
  W.WORLD_W = W.OX + W.GW * W.TW / 2 + 40;
  W.WORLD_H = W.OY + (W.GW + W.GH) * W.TH / 2 + 60;
})();
