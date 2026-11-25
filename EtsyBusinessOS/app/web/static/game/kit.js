// Modular HQ: one empty tower shell + separate furniture sprites on an isometric grid.
// Grid units: u runs along the right (window) wall, v along the left wall; 10 x 10 units per floor (1 unit = half a floor tile).
(function () {
  const W = (window.W = window.W || {});
  W.SHELL = { img: '/static/game/kit/shell.webp', w: 1116, h: 2000 };
  W.GAP = 70; W.MARGIN = 220; W.TOP = 80;
  W.towerX = (i) => W.MARGIN + i * (W.SHELL.w + W.GAP);
  W.WORLD_W = W.MARGIN * 2 + 3 * W.SHELL.w + 2 * W.GAP;
  W.WORLD_H = W.SHELL.h + 160;
  // floor planes measured from the shell tiles: back corner + unit vectors (shell px)
  W.PLANES = { l: { B: [570, 1325] }, u: { B: [565, 825] } };
  W.UX = [50.5, 25.2]; W.VX = [-49.5, 24.7];
  // walkable test per level (u,v in 0..10)
  W.walkLevel = {
    l: (u, v) => u >= 0 && v >= 0 && u <= 10 && v <= 10 && !(u > 7.3 && v < 3.7),
    u: (u, v) => u >= 0 && v >= 0 && u <= 10 && v <= 10 && (v <= 3.5 || u <= 4.4) && !(u > 7.2 && v < 3.6),
  };
  W.NPC_SCALE = 4.0;

  // default sprite scale per object (sheet sprites are drawn at different sizes) and footprint (a along u, b along v)
  W.OBJ = {
    desk3: { s: .62, a: 3.2, b: 1.6 }, desk2: { s: .62, a: 2.4, b: 1.5 }, desk_l: { s: .6, a: 3.4, b: 2 }, chair: { s: .5, a: 1, b: 1 },
    rack: { s: .66, a: 1.2, b: 1.2 }, cabinet: { s: .62, a: 1.2, b: 1.1 }, bookshelf: { s: .66, a: 1.6, b: .8 }, whiteboard: { s: .58, a: 2, b: .6 },
    holo: { s: .55, a: 2.2, b: 2.2 }, boxes: { s: .5, a: 1.6, b: 1.6 }, counter: { s: .55, a: 2.8, b: 1.4 }, safe: { s: .5, a: 1.4, b: 1.4 },
    packing: { s: .5, a: 2.4, b: 1.4 }, vending: { s: .55, a: 1.6, b: 1.2 }, coffee: { s: .48, a: 1.3, b: 1.1 }, water: { s: .45, a: .9, b: .9 },
    fridge: { s: .55, a: 1.3, b: 1.2 }, couch: { s: .7, a: 2.8, b: 1.5 }, coffee_table: { s: .55, a: 2, b: 1.2 }, bean_teal: { s: .5, a: 1.4, b: 1.4 },
    bean_blue: { s: .5, a: 1.4, b: 1.4 }, bean_purple: { s: .5, a: 1.4, b: 1.4 }, arcade_blue: { s: .6, a: 1.3, b: 1.3 }, arcade_pink: { s: .6, a: 1.3, b: 1.3 },
    pingpong: { s: .72, a: 3.4, b: 2 }, ringlight: { s: .45, a: .8, b: .8 }, camera: { s: .45, a: .9, b: .9 }, lamp: { s: .45, a: .6, b: .6 },
    plant_big: { s: .48, a: 1.1, b: 1.1 }, vault_door: { s: .62, a: .3, b: 2.4, wall: true }, coins: { s: .42, a: 1.3, b: 1 }, scanner: { s: .55, a: 2.2, b: 1.5 },
    cooler: { s: .58, a: 1.4, b: 1.2 }, cables: { s: .38, a: 1.6, b: 1.2 }, snack_shelf: { s: .55, a: 2.2, b: .4, wall: true }, trash: { s: .32, a: .7, b: .7 },
    side_table: { s: .42, a: .9, b: .9 }, papers: { s: .42, a: 1.2, b: 1 }, tv_chart: { s: .55, a: 2.6, b: .2, wall: true },
  };

  // Furniture per floor. o=object, u/v = back corner of footprint, f=flip (mirror; swaps a/b), z=lift (wall-mounted height in px)
  // seat = where the agent sits (u,v) and the direction they face.
  const L = {
    t1u: [ // COMMAND DECK (left strip) + RESEARCH LAB (right strip)
      { o: 'desk_l', u: 0, v: 1.4, f: 1, agent: 'KAI-07', seat: [2.6, 3.4, 'north-west'] },
      { o: 'holo', u: 1.4, v: 6.4 }, { o: 'bookshelf', u: 0, v: 9, f: 1 }, { o: 'plant_big', u: 3.2, v: 9 },
      { o: 'tv_chart', u: .3, v: 0, z: 150 }, { o: 'papers', u: 3.3, v: .3 },
      { o: 'desk3', u: 4.5, v: 0, agent: 'RAZE-11', seat: [5.9, 2.5, 'north-east'] },
      { o: 'whiteboard', u: 3.4, v: .1 }, { o: 'trash', u: 6.6, v: 2.7 },
    ],
    t1l: [ // SERVER ROOM (u<5) + ARCHIVE (u>=5)
      { o: 'rack', u: 0, v: 0, f: 1 }, { o: 'rack', u: 0, v: 1.4, f: 1 }, { o: 'rack', u: 0, v: 2.8, f: 1 }, { o: 'rack', u: 1.4, v: 0 },
      { o: 'cooler', u: 0, v: 4.4, f: 1 }, { o: 'cables', u: 1.6, v: 5 },
      { o: 'desk2', u: 2.8, v: 1.4, agent: 'ZERO-1', seat: [4, 3.6, 'north-east'] },
      { o: 'cabinet', u: 5.2, v: 0 }, { o: 'cabinet', u: 6.4, v: 0 }, { o: 'bookshelf', u: 8.6, v: 4, f: 1 }, { o: 'boxes', u: 8.2, v: 7.6 },
      { o: 'desk2', u: 5.4, v: 4.2, agent: 'SABLE-6', seat: [6.6, 6.4, 'north-east'] }, { o: 'papers', u: 8.4, v: 6 }, { o: 'plant_big', u: 0, v: 8.6 },
    ],
    t2u: [ // WRITERS STUDIO (left) + QA BAY (right)
      { o: 'bookshelf', u: 0, v: 0, f: 1 }, { o: 'bookshelf', u: 0, v: 1.8, f: 1 },
      { o: 'desk2', u: 0, v: 4, f: 1, agent: 'JUNO-X9', seat: [2.4, 5.2, 'north-west'] },
      { o: 'bean_purple', u: 2.6, v: 8.2 }, { o: 'lamp', u: .2, v: 8.4 }, { o: 'plant_big', u: 2.8, v: .3 }, { o: 'papers', u: 3.2, v: 2.2 },
      { o: 'scanner', u: 4.6, v: 0 }, { o: 'desk2', u: 4.5, v: 1.6, agent: 'VOLT-3', seat: [5.7, 3.3, 'north-east'] },
    ],
    t2l: [ // SHOP FLOOR (left) + FINANCE VAULT (right)
      { o: 'counter', u: 0, v: 2, f: 1 }, { o: 'packing', u: 1.4, v: 6.8 },
      { o: 'boxes', u: 0, v: 6.4 }, { o: 'desk3', u: 1.6, v: .1, agent: 'NYX-21', seat: [3, 2.4, 'north-east'] },
      { o: 'vault_door', u: 9.6, v: 4.6, f: 1, z: 10 },
      { o: 'safe', u: 5.2, v: 0 }, { o: 'coins', u: 6.6, v: .2 }, { o: 'desk2', u: 5.2, v: 4.4, agent: 'KADE-12', seat: [6.4, 6.6, 'north-east'] },
      { o: 'plant_big', u: 8.8, v: 4 }, { o: 'cabinet', u: 8.6, v: 5.4, f: 1 },
    ],
    t3u: [ // GROWTH STUDIO (left) + DATA ROOM (right)
      { o: 'desk2', u: 0, v: 1.2, f: 1, agent: 'HEX-04', seat: [2.4, 2.4, 'north-west'] },
      { o: 'ringlight', u: 2.8, v: 5.4 }, { o: 'camera', u: 2.6, v: 7.4 }, { o: 'bean_teal', u: .2, v: 7 }, { o: 'tv_chart', u: 1.8, v: 0, z: 150 },
      { o: 'desk3', u: 4.5, v: 0, agent: 'ORIN-88', seat: [5.9, 2.5, 'north-east'] }, { o: 'plant_big', u: 0, v: 9.2 },
    ],
    t3l: [ // LOUNGE & PANTRY
      { o: 'vending', u: 0, v: .2, f: 1, id: 'vending' }, { o: 'fridge', u: 0, v: 1.9, f: 1 }, { o: 'coffee', u: 0, v: 3.3, f: 1, id: 'coffee' },
      { o: 'water', u: 0, v: 4.6, f: 1, id: 'water' },
      { o: 'arcade_blue', u: 3.6, v: 0, id: 'arcade' }, { o: 'arcade_pink', u: 5.1, v: 0, id: 'arcade2' },
      { o: 'couch', u: 2.6, v: 4.6, id: 'couch' }, { o: 'coffee_table', u: 3.1, v: 6.4 },
      { o: 'bean_teal', u: 6.4, v: 5.6, id: 'bean1' }, { o: 'bean_blue', u: 7.8, v: 6.6, id: 'bean2' }, { o: 'bean_purple', u: .6, v: 8.4, id: 'bean3' },
      { o: 'pingpong', u: 5.6, v: 8.2 }, { o: 'plant_big', u: 8.8, v: 4.2 }, { o: 'lamp', u: 0, v: 6.4 },
    ],
  };
  W.LAYOUT = L;

  // floors: tower index + level; portals = elevator (same tower) and bridges (lower floors of neighbours)
  W.FLOORS = {
    t1u: { t: 0, lv: 'u' }, t1l: { t: 0, lv: 'l' }, t2u: { t: 1, lv: 'u' }, t2l: { t: 1, lv: 'l' }, t3u: { t: 2, lv: 'u' }, t3l: { t: 2, lv: 'l' },
  };
  W.LIFT = { l: [8.4, 4.4], u: [6.4, 1.8], cab: [8.8, 1.8] };          // stand points in front of the lift and inside the cabin
  W.BRIDGE = { out: [9.7, 6.2], in: [2.4, 9.7] };                        // exit on the right edge, entry on the left edge (lower floors)

  W.ROOMS = [
    { id: 'command', name: 'COMMAND DECK', floor: 't1u', side: 'L', accent: 0x22d3ee, agent: 'KAI-07', pages: [['Ringkasan', '/dashboard'], ['Automation', '/automation'], ['Audit log', '/audit'], ['Notifikasi', '/notifications']] },
    { id: 'lab', name: 'RESEARCH LAB', floor: 't1u', side: 'R', accent: 0x4ade80, agent: 'RAZE-11', pages: [['Riset keyword & kompetitor', '/research']] },
    { id: 'server', name: 'SERVER ROOM', floor: 't1l', side: 'L', accent: 0xfb923c, agent: 'ZERO-1', pages: [['Pengaturan', '/settings'], ['Panduan API', '/setup'], ['Diagnostik', '/diagnostics']] },
    { id: 'archive', name: 'ARCHIVE', floor: 't1l', side: 'R', accent: 0xd6a76c, agent: 'SABLE-6', pages: [['Aset & produk', '/assets']] },
    { id: 'studio', name: 'WRITERS STUDIO', floor: 't2u', side: 'L', accent: 0xc084fc, agent: 'JUNO-X9', pages: [['Buat listing', '/listings'], ['Shared Brain', '/brain']] },
    { id: 'qa', name: 'QA BAY', floor: 't2u', side: 'R', accent: 0xfacc15, agent: 'VOLT-3', pages: [['Approval & validasi', '/approvals']] },
    { id: 'shop', name: 'SHOP FLOOR', floor: 't2l', side: 'L', accent: 0xf472b6, agent: 'NYX-21', pages: [['Approval Center', '/approvals'], ['Listing & toko', '/listings']] },
    { id: 'finance', name: 'FINANCE VAULT', floor: 't2l', side: 'R', accent: 0xfbbf24, agent: 'KADE-12', pages: [['Akuntansi', '/accounting']] },
    { id: 'growth', name: 'GROWTH STUDIO', floor: 't3u', side: 'L', accent: 0xfb7185, agent: 'HEX-04', pages: [['Social media', '/social']] },
    { id: 'data', name: 'DATA ROOM', floor: 't3u', side: 'R', accent: 0x60a5fa, agent: 'ORIN-88', pages: [['Analytics & impor Shop Stats', '/analytics']] },
    { id: 'lounge', name: 'LOUNGE · PANTRY', floor: 't3l', side: '*', accent: 0xa78bfa, agent: null, pages: [] },
  ];
  W.roomById = Object.fromEntries(W.ROOMS.map(r => [r.id, r]));
  W.roomOf = (floor, u) => W.ROOMS.find(r => r.floor === floor && (r.side === '*' || (r.side === 'L' ? u < (W.FLOORS[floor].lv === 'u' ? 4.5 : 5) : u >= (W.FLOORS[floor].lv === 'u' ? 4.5 : 5))));
  // lounge activity spots (t3l) - stand cells in front of things
  W.SPOTS = {
    vending: { floor: 't3l', u: 2, v: 1, face: 'north-west', kind: 'snack' }, coffee: { floor: 't3l', u: 1.9, v: 3.9, face: 'north-west', kind: 'snack' },
    water: { floor: 't3l', u: 1.6, v: 5.2, face: 'north-west', kind: 'snack' }, arcade: { floor: 't3l', u: 4.2, v: 2, face: 'north-east', kind: 'game' },
    arcade2: { floor: 't3l', u: 5.7, v: 2, face: 'north-east', kind: 'game' }, couch1: { floor: 't3l', u: 3.6, v: 5.6, face: 'south-west', kind: 'rest' },
    couch2: { floor: 't3l', u: 4.8, v: 5.6, face: 'south-west', kind: 'rest' }, bean1: { floor: 't3l', u: 7, v: 7.4, face: 'south-east', kind: 'rest' },
    bean2: { floor: 't3l', u: 8.4, v: 8.4, face: 'south-east', kind: 'rest' }, bean3: { floor: 't3l', u: 2.4, v: 9.4, face: 'south-east', kind: 'rest' },
    chatA: { floor: 't3l', u: 5.2, v: 7.2, face: 'south-east', kind: 'chat' }, chatB: { floor: 't3l', u: 6.4, v: 7.8, face: 'north-west', kind: 'chat' },
    pingA: { floor: 't3l', u: 5, v: 9.4, face: 'south-east', kind: 'chat' }, pingB: { floor: 't3l', u: 9.4, v: 9.6, face: 'north-west', kind: 'chat' },
  };
})();
