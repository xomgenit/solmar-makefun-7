// render.js — canvas world renderer.
import { zoneAt, PIER } from './city.js';
import { drawCar } from './vehicles.js';
import { drawEnemy } from './combat.js';
import { drawEffects } from './effects.js';

export function drawWorld(game, ctx, cam, vw, vh) {
  const city = game.city;
  // Ground: grass.
  ctx.fillStyle = '#4a7c3a';
  ctx.fillRect(cam.x - 20, cam.y - 20, vw + 40, vh + 40);
  // Beach sand + sea (east strip).
  ctx.fillStyle = '#d9c27a';
  ctx.fillRect(3150, cam.y - 20, 300, vh + 40);
  ctx.fillStyle = '#1d6a8c';
  ctx.fillRect(3450, cam.y - 20, 200, vh + 40);
  // Roads.
  ctx.fillStyle = '#333336';
  for (const c of city.roads) {
    ctx.fillRect(c - 45, cam.y - 20, 90, vh + 40);
    ctx.fillRect(cam.x - 20, c - 45, vw + 40, 90);
  }
  // Road centre dashes.
  ctx.fillStyle = '#d8c84a';
  for (const c of city.roads) {
    for (let t = Math.floor((cam.y - 20) / 60) * 60; t < cam.y + vh + 20; t += 60) ctx.fillRect(c - 2, t, 4, 26);
    for (let t = Math.floor((cam.x - 20) / 60) * 60; t < cam.x + vw + 20; t += 60) ctx.fillRect(t, c - 2, 26, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const cx of city.roads) for (const cy of city.roads) {
    if (cx < cam.x - 60 || cx > cam.x + vw + 60 || cy < cam.y - 60 || cy > cam.y + vh + 60) continue;
    for (let i = -3; i <= 3; i++) ctx.fillRect(cx - 40 + i * 11, cy - 45, 6, 12);
  }
  // Pier deck.
  ctx.fillStyle = '#8a6d3b';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.fillStyle = '#6e5630';
  for (let x = PIER.x; x < PIER.x + PIER.w; x += 26) ctx.fillRect(x, PIER.y, 3, PIER.h);
  // Buildings with rooftops.
  for (const b of city.buildings) {
    if (b.x > cam.x + vw || b.x + b.w < cam.x || b.y > cam.y + vh || b.y + b.h < cam.y) continue;
    ctx.fillStyle = b.wall || '#3d3a36';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, 8);
    if (b.landmark) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(city.landmarkById[b.landmark].name, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Palms.
  for (const palm of city.palms) {
    if (palm.x < cam.x - 20 || palm.x > cam.x + vw + 20 || palm.y < cam.y - 20 || palm.y > cam.y + vh + 20) continue;
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(palm.x, palm.y, palm.r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath(); ctx.arc(palm.x, palm.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Landmark labels (non-building ones).
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const l of Object.values(city.landmarkById)) {
    if (l.id === 'pier') ctx.fillText(l.name, l.cx, l.cy - 46);
  }
  // Mission beacon.
  if (game.missionMarker) {
    const pulse = 14 + Math.sin(game.time * 4) * 4;
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(game.missionMarker.x, game.missionMarker.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.arc(game.missionMarker.x, game.missionMarker.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Zone label.
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(zoneAt(game.player.x, game.player.y), cam.x + 16, cam.y + 30);
  // Peds.
  for (const ped of game.peds) {
    if (ped.x < cam.x - 30 || ped.x > cam.x + vw + 30 || ped.y < cam.y - 30 || ped.y > cam.y + vh + 30) continue;
    ctx.save(); ctx.translate(ped.x, ped.y);
    if (ped.down) { ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.7; }
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Cars.
  for (const car of game.cars) drawCar(ctx, car);
  // Enemies.
  for (const e of game.enemies) drawEnemy(ctx, e);
  // Player.
  const p = game.player;
  if (!p.car) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath(); ctx.arc(4, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -2, 10, 4);
    ctx.restore();
    // Aim line.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 60, p.y + Math.sin(p.aimAngle) * 60); ctx.stroke();
  }
  drawEffects(game.effects, ctx);
}
