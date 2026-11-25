// Isometric pixel-style office. Rooms = agents' workplaces; characters animate by job status.
(function () {
  const cv = document.getElementById('office'); const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, TW = 112, TH = 56, OX = W / 2, OY = 70;
  const ROOM = 3; let agents = []; let t = 0;
  const statusColor = {working: '#38bdf8', waiting: '#facc15', queued: '#a3a3a3', error: '#ef4444', idle: '#4ade80'};
  function iso(x, y) { return [OX + (x - y) * TW / 2, OY + (x + y) * TH / 2]; }
  function tile(x, y, w, h, fill, stroke) {
    const p = [iso(x, y), iso(x + w, y), iso(x + w, y + h), iso(x, y + h)];
    ctx.beginPath(); ctx.moveTo(...p[0]); p.slice(1).forEach(q => ctx.lineTo(...q)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function desk(x, y) {
    const [a, b] = iso(x, y); ctx.fillStyle = '#3f3f46'; ctx.fillRect(a - 16, b - 10, 32, 10);
    ctx.fillStyle = '#18181b'; ctx.fillRect(a - 8, b - 26, 16, 14); ctx.fillStyle = '#22d3ee'; ctx.fillRect(a - 6, b - 24, 12, 9);
  }
  function person(px, py, color, status, bob) {
    const y = py - 34 + bob;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(px, py - 2, 11, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(px - 8, y + 12, 16, 18);            // body
    ctx.fillStyle = '#f1c27d'; ctx.fillRect(px - 6, y, 12, 12);              // head
    ctx.fillStyle = '#1f2937'; ctx.fillRect(px - 6, y, 12, 4);               // hair
    ctx.fillStyle = '#111'; ctx.fillRect(px - 3, y + 6, 2, 2); ctx.fillRect(px + 1, y + 6, 2, 2);
    ctx.fillStyle = statusColor[status] || '#888'; ctx.beginPath(); ctx.arc(px + 12, y - 4, 5, 0, 7); ctx.fill();
  }
  function draw() {
    t += 1; ctx.clearRect(0, 0, W, H);
    tile(0, 0, 9, 9, '#12151c', '#1f2430');
    agents.forEach(a => {
      const hue = a.color; tile(a.x + .15, a.y + .15, ROOM - .3, ROOM - .3, hue + '33', hue + 'aa');
      const [lx, ly] = iso(a.x + .2, a.y + .2);
      ctx.fillStyle = '#e5e7eb'; ctx.font = 'bold 12px Consolas, monospace'; ctx.textAlign = 'center';
      const [cx, cy] = iso(a.x + ROOM / 2, a.y + .35); ctx.fillText(a.room.toUpperCase(), cx, cy);
      desk(a.x + 1.5, a.y + 1.3);
      let bob = 0, px, py;
      if (a.status === 'working') { bob = Math.sin(t / 6) * 2;[px, py] = iso(a.x + 1.5, a.y + 1.75); }
      else if (a.status === 'idle') { const w = (Math.sin(t / 90 + a.x) + 1) / 2;[px, py] = iso(a.x + .7 + w * 1.6, a.y + 2.2); }
      else { [px, py] = iso(a.x + 2.2, a.y + 1.9); bob = a.status === 'error' ? Math.sin(t / 3) : 0; }
      person(px, py, a.color, a.status, bob);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Consolas, monospace'; ctx.fillText(a.name, px, py + 14);
      if (a.current) { ctx.fillStyle = '#93c5fd'; ctx.font = '10px Consolas, monospace'; ctx.fillText(a.current, px, py - 50); }
    });
    requestAnimationFrame(draw);
  }
  function cards() {
    document.getElementById('cards').innerHTML = agents.map(a =>
      `<div class="agent"><div class="avatar" style="background:${a.color}">${a.name.slice(0, 2)}</div><div><b>${a.name}</b> <span class="badge b-${a.status}">${a.status.toUpperCase()}</span>
       <div class="small muted">${a.role} · ${a.room}</div><div class="small muted">${a.desc}</div></div></div>`).join('');
  }
  async function poll() {
    try { const r = await fetch('/api/agents'); const j = await r.json(); agents = j.agents; cards(); } catch (e) { }
    setTimeout(poll, 3000);
  }
  poll(); draw();
})();
