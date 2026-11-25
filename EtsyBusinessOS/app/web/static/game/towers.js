// Layout data for the three painted towers (coordinates are pixels in the 1438x2576 tower images).
(function () {
  const W = (window.W = window.W || {});
  W.TOWER_W = 1438; W.TOWER_H = 2576; W.GAP = 120; W.MARGIN = 260;
  W.TOWERS = [
    { id: 't1', img: '/static/game/towers/t1.webp' },
    { id: 't2', img: '/static/game/towers/t2.webp' },
    { id: 't3', img: '/static/game/towers/t3.webp' },
  ];
  W.towerX = (i) => W.MARGIN + i * (W.TOWER_W + W.GAP);
  W.WORLD_W = W.MARGIN * 2 + 3 * W.TOWER_W + 2 * W.GAP;
  W.WORLD_H = W.TOWER_H + 220;
  W.TOP = 110;

  // Rooms: tower index, click rectangle [x0,y0,x1,y1] (tower px), floor id, owner, pages.
  W.ROOMS = [
    { id: 'command', name: 'COMMAND DECK', t: 0, rect: [40, 330, 720, 1230], floor: 't1u', accent: 0x22d3ee, agent: 'KAI-07',
      pages: [['Ringkasan', '/dashboard'], ['Automation', '/automation'], ['Audit log', '/audit'], ['Notifikasi', '/notifications']] },
    { id: 'lab', name: 'RESEARCH LAB', t: 0, rect: [720, 300, 1420, 1250], floor: 't1u', accent: 0x4ade80, agent: 'RAZE-11',
      pages: [['Riset keyword & kompetitor', '/research']] },
    { id: 'server', name: 'SERVER ROOM', t: 0, rect: [20, 1380, 760, 2480], floor: 't1l', accent: 0xfb923c, agent: 'ZERO-1',
      pages: [['Pengaturan', '/settings'], ['Panduan API', '/setup'], ['Diagnostik', '/diagnostics']] },
    { id: 'archive', name: 'ARCHIVE', t: 0, rect: [760, 1380, 1420, 2480], floor: 't1l', accent: 0xd6a76c, agent: 'SABLE-6',
      pages: [['Aset & produk', '/assets']] },
    { id: 'studio', name: 'WRITERS STUDIO', t: 1, rect: [40, 330, 760, 1260], floor: 't2u', accent: 0xc084fc, agent: 'JUNO-X9',
      pages: [['Buat listing', '/listings'], ['Shared Brain', '/brain']] },
    { id: 'qa', name: 'QA BAY', t: 1, rect: [760, 300, 1420, 1260], floor: 't2u', accent: 0xfacc15, agent: 'VOLT-3',
      pages: [['Approval & validasi', '/approvals']] },
    { id: 'shop', name: 'SHOP FLOOR', t: 1, rect: [20, 1380, 820, 2480], floor: 't2l', accent: 0xf472b6, agent: 'NYX-21',
      pages: [['Approval Center', '/approvals'], ['Listing & toko', '/listings']] },
    { id: 'finance', name: 'FINANCE VAULT', t: 1, rect: [820, 1380, 1420, 2480], floor: 't2l', accent: 0xfbbf24, agent: 'KADE-12',
      pages: [['Akuntansi', '/accounting']] },
    { id: 'growth', name: 'GROWTH STUDIO', t: 2, rect: [40, 330, 760, 1260], floor: 't3u', accent: 0xfb7185, agent: 'HEX-04',
      pages: [['Social media', '/social']] },
    { id: 'data', name: 'DATA ROOM', t: 2, rect: [760, 300, 1420, 1260], floor: 't3u', accent: 0x60a5fa, agent: 'ORIN-88',
      pages: [['Analytics & impor Shop Stats', '/analytics']] },
    { id: 'lounge', name: 'LOUNGE · PANTRY', t: 2, rect: [20, 1380, 1420, 2480], floor: 't3l', accent: 0xa78bfa, agent: null,
      pages: [] },
  ];
  W.roomById = Object.fromEntries(W.ROOMS.map(r => [r.id, r]));

  // Floors: walkable points (tower px). 'exit' is where NPCs teleport (lift) in/out.
  W.FLOORS = {
    t1u: { t: 0, exit: [560, 1150], wander: [[600, 1040], [520, 1080], [840, 950], [700, 1000], [430, 1000]], window: [[640, 880, 'north-east']] },
    t1l: { t: 0, exit: [560, 2240], wander: [[660, 1860], [300, 2080], [600, 1800], [560, 2000], [900, 2150]], window: [] },
    t2u: { t: 1, exit: [560, 1150], wander: [[600, 1080], [840, 1040], [400, 1120], [700, 1000]], window: [[860, 960, 'north-east']] },
    t2l: { t: 1, exit: [560, 2290], wander: [[1040, 2100], [400, 2180], [620, 2080], [760, 1960]], window: [] },
    t3u: { t: 2, exit: [560, 1150], wander: [[560, 1080], [760, 1000], [480, 1040], [700, 1100]], window: [[760, 880, 'north-east']] },
    t3l: { t: 2, exit: [700, 2300], wander: [[660, 2080], [780, 2060], [560, 2200], [880, 2240], [460, 2160]], window: [[1240, 2180, 'north-east']] },
  };
  // Seats at each agent's own desk (seated typing pose faces the desk).
  W.WORK = {
    'KAI-07': { floor: 't1u', x: 662, y: 950, face: 'north-west' },
    'RAZE-11': { floor: 't1u', x: 985, y: 1125, face: 'north-east' },
    'ZERO-1': { floor: 't1l', x: 520, y: 2175, face: 'north-east' },
    'SABLE-6': { floor: 't1l', x: 785, y: 1965, face: 'north-east' },
    'JUNO-X9': { floor: 't2u', x: 652, y: 985, face: 'north-west' },
    'VOLT-3': { floor: 't2u', x: 945, y: 1150, face: 'north-east' },
    'NYX-21': { floor: 't2l', x: 865, y: 2230, face: 'north-west' },
    'KADE-12': { floor: 't2l', x: 805, y: 1865, face: 'north-east' },
    'HEX-04': { floor: 't3u', x: 662, y: 990, face: 'north-west' },
    'ORIN-88': { floor: 't3u', x: 962, y: 1125, face: 'north-east' },
  };
  // Lounge activity spots (tower 3 lower floor)
  W.SPOTS = {
    coffee: { floor: 't3l', x: 610, y: 1730, face: 'north-east', kind: 'snack' },
    vending: { floor: 't3l', x: 340, y: 2040, face: 'north-west', kind: 'snack' },
    water: { floor: 't3l', x: 470, y: 1820, face: 'north-east', kind: 'snack' },
    arcade: { floor: 't3l', x: 945, y: 1885, face: 'north-east', kind: 'game' },
    arcade2: { floor: 't3l', x: 1065, y: 1965, face: 'north-east', kind: 'game' },
    couch1: { floor: 't3l', x: 560, y: 1930, face: 'south-east', kind: 'rest' },
    couch2: { floor: 't3l', x: 640, y: 1890, face: 'south-east', kind: 'rest' },
    bean1: { floor: 't3l', x: 500, y: 2120, face: 'south-east', kind: 'rest' },
    bean2: { floor: 't3l', x: 740, y: 2190, face: 'south-east', kind: 'rest' },
    bean3: { floor: 't3l', x: 920, y: 2100, face: 'south-east', kind: 'rest' },
    chatA: { floor: 't3l', x: 640, y: 2090, face: 'south-east', kind: 'chat' },
    chatB: { floor: 't3l', x: 790, y: 2060, face: 'south-west', kind: 'chat' },
    pingA: { floor: 't3l', x: 1010, y: 2080, face: 'south-east', kind: 'chat' },
    pingB: { floor: 't3l', x: 1330, y: 2010, face: 'south-west', kind: 'chat' },
    beanS: { floor: 't2u', x: 380, y: 1130, face: 'south-east', kind: 'rest' },
    beanG: { floor: 't3u', x: 300, y: 1000, face: 'south-east', kind: 'rest' },
  };

  // Living overlays (tower px). screens: flicker/scan over painted monitors; leds: twinkle areas; glow: soft lights.
  W.FX = [
    { // tower 1
      windows: [[470, 200, 660, 640], [810, 180, 1380, 540]],
      screens: [[80, 500, 420, 920, 'big'], [460, 690, 800, 860], [990, 920, 1300, 1050], [460, 1990, 800, 2090], [820, 1500, 900, 1580]],
      leds: [[60, 1600, 600, 2040]], glows: [[370, 1020, 0x67e8f9, 90], [1250, 880, 0x22d3ee, 70]], neon: [[60, 1540, 0xc084fc], [1340, 1580, 0x22d3ee]],
      fans: [[680, 1640]],
    },
    { // tower 2
      windows: [[790, 170, 1380, 640]],
      screens: [[450, 700, 690, 850], [1030, 960, 1240, 1110], [560, 1920, 980, 2100]],
      leds: [], glows: [[85, 960, 0xfde68a, 70], [930, 950, 0x4ade80, 80], [600, 2150, 0xf472b6, 50]], neon: [[140, 1640, 0xf472b6, 'sign']],
      fans: [],
    },
    { // tower 3
      windows: [[1130, 1330, 1410, 1900]],
      screens: [[780, 360, 1380, 800, 'big'], [440, 640, 700, 760], [880, 800, 1200, 940], [880, 1660, 960, 1760], [1040, 1720, 1120, 1820]],
      leds: [[1220, 940, 1300, 1120], [770, 1580, 840, 1720]], glows: [[360, 700, 0xfdf4ff, 80], [190, 1860, 0xa78bfa, 120], [1010, 1700, 0x60a5fa, 70], [1080, 1760, 0xf472b6, 70]], neon: [],
      fans: [], steam: [[652, 1550]],
    },
  ];
})();
