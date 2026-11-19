// hud.js — DOM HUD + round minimap.
import { zoneAt } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthFill: $('health-fill'), healthText: $('health-text'), cash: $('cash'),
    stars: $('stars'), zone: $('zone'), minimap: $('minimap'),
    speed: $('speed'), speedometer: $('speedometer'), carHealth: $('car-health'),
    objectiveTitle: $('objective-title'), objectiveText: $('objective-text'),
    hint: $('hint'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
  };
  const mm = el.minimap ? el.minimap.getContext('2d') : null;
  let bannerTimer = 0;
  const hud = {
    showHud(on) {
      const h = document.getElementById('hud');
      if (h) h.style.display = on ? 'block' : 'none';
    },
    banner(title, sub, color = '#f1c40f') {
      if (!el.banner) return;
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.style.borderColor = color;
      el.banner.style.color = color;
      el.banner.style.display = 'block';
      bannerTimer = 2.6;
    },
    setHint(text) { if (el.hint) el.hint.textContent = text || ''; },
    update(game, dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0 && el.banner) el.banner.style.display = 'none';
      }
      const p = game.player;
      if (el.healthFill) el.healthFill.style.width = `${Math.max(0, p.health)}%`;
      if (el.healthText) el.healthText.textContent = `HP ${Math.ceil(Math.max(0, p.health))}`;
      if (el.cash) el.cash.textContent = `$${p.cash}`;
      if (el.stars) el.stars.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
      if (el.zone) el.zone.textContent = zoneAt(p.x, p.y);
      if (el.objectiveTitle && game.objective) el.objectiveTitle.textContent = game.objective.title;
      if (el.objectiveText && game.objective) el.objectiveText.textContent = game.objective.text;
      if (el.speedometer) el.speedometer.style.display = p.car ? 'block' : 'none';
      if (p.car) {
        if (el.speed) el.speed.textContent = `${Math.round(p.car.speed * 0.9)} km/h`;
        if (el.carHealth) el.carHealth.textContent = `CAR ${Math.ceil(Math.max(0, p.car.hp))}`;
      }
      hud.drawMinimap(game);
    },
    drawMinimap(game) {
      if (!mm || !el.minimap) return;
      const S = el.minimap.width, scale = S / game.city.world;
      mm.clearRect(0, 0, S, S);
      mm.save();
      mm.beginPath(); mm.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); mm.clip();
      mm.fillStyle = '#1c2b1a'; mm.fillRect(0, 0, S, S);
      // Sea + beach.
      mm.fillStyle = '#1d5c7a'; mm.fillRect(3450 * scale, 0, S, S);
      mm.fillStyle = '#d9c27a'; mm.fillRect(3150 * scale, 0, 300 * scale, S);
      // Roads.
      mm.strokeStyle = '#555'; mm.lineWidth = 2;
      for (const c of game.city.roads) {
        mm.beginPath(); mm.moveTo(c * scale, 0); mm.lineTo(c * scale, S); mm.stroke();
        mm.beginPath(); mm.moveTo(0, c * scale); mm.lineTo(S, c * scale); mm.stroke();
      }
      const dot = (x, y, color, r = 3) => {
        mm.fillStyle = color;
        mm.beginPath(); mm.arc(x * scale, y * scale, r, 0, Math.PI * 2); mm.fill();
      };
      // Mission marker.
      if (game.missionMarker) dot(game.missionMarker.x, game.missionMarker.y, '#ffd34d', 4);
      for (const e of game.enemies) dot(e.x, e.y, e.type === 'king' ? '#ff4444' : '#4488ff', 2.5);
      for (const c of game.cars) if (c.role === 'cruiser') dot(c.x, c.y, '#4488ff', 2.5);
      // Player (always centred-ish: draw at true position, map is the whole city).
      dot(game.player.x, game.player.y, '#ffffff', 3.5);
      mm.restore();
      mm.strokeStyle = 'rgba(255,255,255,0.7)'; mm.lineWidth = 2;
      mm.beginPath(); mm.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); mm.stroke();
    },
  };
  return hud;
}
