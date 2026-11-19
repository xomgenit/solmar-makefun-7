// combat.js — hitscan shooting + generic enemies (cops, Harbor Kings).
import { segmentHitsRects, dist, clamp } from './util.js';
import { collideCircle } from './city.js';
import { sfx } from './audio.js';

let enemySeq = 1;
export function spawnEnemy(game, x, y, type) {
  const e = {
    id: enemySeq++, x, y, type, // 'cop' | 'king'
    hp: type === 'king' ? 60 : 50,
    maxHp: type === 'king' ? 60 : 50,
    angle: 0, fireCd: 1 + Math.random(),
    speed: type === 'cop' ? 235 : 0, // kings hold ground
    bustTimer: 0, dead: false,
  };
  game.enemies.push(e);
  return e;
}

// Hitscan shot from (x,y) along angle. fromPlayer: true = player shooting.
export function shoot(game, x, y, angle, { fromPlayer = true } = {}) {
  const RANGE = 520;
  const ex = x + Math.cos(angle) * RANGE, ey = y + Math.sin(angle) * RANGE;
  sfx.shoot();
  if (game.effects) {
    game.effects.muzzle(game.effects, x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
    game.effects.tracer(game.effects, x, y, ex, ey);
  }
  // Nearest blocking building along the ray.
  let wallDist = RANGE;
  for (const b of game.city.buildings) {
    // Sample the ray for a building hit.
    for (let t = 20; t < RANGE; t += 20) {
      const px = x + Math.cos(angle) * t, py = y + Math.sin(angle) * t;
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { wallDist = Math.min(wallDist, t); break; }
    }
  }
  const hit = (tx, ty, radius) => {
    // Perpendicular distance from the ray + along-ray distance.
    const dx = tx - x, dy = ty - y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > wallDist) return -1;
    const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return perp < radius + 6 ? along : -1;
  };
  if (fromPlayer) {
    // Enemies first.
    let best = null, bestD = Infinity;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const d = hit(e.x, e.y, 14);
      if (d >= 0 && d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      best.hp -= 34;
      if (game.effects) game.effects.blood(game.effects, best.x, best.y);
      if (best.hp <= 0) killEnemy(game, best);
      return best;
    }
    // Then peds (stray fire can clip one).
    for (const ped of game.peds) {
      if (ped.down) continue;
      const d = hit(ped.x, ped.y, 10);
      if (d >= 0) {
        if (game.police) game.police.addWanted(1);
        return { ped: true };
      }
    }
    return null;
  }
  // Enemy shooting the player.
  const p = game.player;
  const d = hit(p.x, p.y, p.car ? 18 : 12);
  if (d >= 0) hurtPlayer(game, 7.5, x, y);
  return d >= 0 ? p : null;
}

export function killEnemy(game, enemy) {
  enemy.dead = true;
  game.enemies = game.enemies.filter((e) => e !== enemy);
  game.stats.kills = (game.stats.kills || 0) + 1;
  if (game.effects) game.effects.blood(game.effects, enemy.x, enemy.y);
  if (enemy.type === 'cop' && game.police) game.police.addWanted(1);
  if (enemy.type === 'king' && game.missions) game.missions.onEnemyDown(enemy);
}

export function hurtPlayer(game, amount, fromX, fromY) {
  const p = game.player;
  if (game.state !== 'playing' || p.health <= 0) return;
  p.health -= amount;
  p.lastHurtAt = game.time;
  if (game.effects) {
    game.effects.blood(game.effects, p.x, p.y);
    game.effects.addShake(game.effects, 4);
  }
  if (p.health <= 0) {
    p.health = 0;
    game.wasted();
  }
}

export function hasLineOfSight(game, x1, y1, x2, y2) {
  return !segmentHitsRects(x1, y1, x2, y2, game.city.buildings);
}

export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of [...game.enemies]) {
    if (e.dead) continue;
    e.fireCd -= dt;
    const d = dist(e.x, e.y, p.x, p.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === 'cop') {
      // Chase the player on foot; in a car the cruisers handle pursuit.
      if (!p.car) {
        const step = e.speed * dt;
        e.x += Math.cos(e.angle) * step;
        e.y += Math.sin(e.angle) * step;
        const res = collideCircle(game.city, e.x, e.y, 12);
        e.x = res.x; e.y = res.y;
        // Bust: within 42px of a player on foot for 1.1s.
        if (d < 42) {
          e.bustTimer += dt;
          if (e.bustTimer > 1.1) { game.busted(); return; }
        } else e.bustTimer = 0;
      } else e.bustTimer = 0;
      // Shoot within 300px with line of sight.
      if (d < 300 && e.fireCd <= 0 && hasLineOfSight(game, e.x, e.y, p.x, p.y)) {
        e.fireCd = 1.1 + Math.random() * 0.6;
        shoot(game, e.x, e.y, e.angle + (Math.random() - 0.5) * 0.3, { fromPlayer: false });
      }
    } else {
      // Kings hold ground and shoot within 380px with LOS.
      if (d < 380 && e.fireCd <= 0 && hasLineOfSight(game, e.x, e.y, p.x, p.y)) {
        e.fireCd = 1.0 + Math.random() * 0.8;
        const aimed = Math.random() < 0.2;
        const spread = aimed ? 0.10 : 0.55;
        shoot(game, e.x, e.y, e.angle + (Math.random() - 0.5) * spread, { fromPlayer: false });
      }
    }
  }
}

export function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  // Body.
  ctx.fillStyle = e.type === 'king' ? '#c0392b' : '#1a3a6b';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  // Gun direction.
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.angle) * 18, Math.sin(e.angle) * 18); ctx.stroke();
  ctx.restore();
  // Health bar.
  const w = 30;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(e.x - w / 2, e.y - 22, w, 5);
  ctx.fillStyle = e.hp > e.maxHp / 2 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(e.x - w / 2, e.y - 22, w * clamp(e.hp / e.maxHp, 0, 1), 5);
}
