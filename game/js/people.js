// people.js — pedestrians: walk, flee, get knocked down.
import { collideCircle } from './city.js';
import { dist } from './util.js';

let pedSeq = 1;
export function createPed(x, y) {
  const angle = Math.random() * Math.PI * 2;
  return {
    id: pedSeq++, x, y, angle,
    speed: 40 + Math.random() * 30,
    down: false, downTimer: 0,
    fleeTimer: 0, fleeX: 0, fleeY: 0,
    color: ['#e67e22', '#8e44ad', '#16a085', '#d35400', '#2c3e50'][Math.floor(Math.random() * 5)],
    walkPhase: Math.random() * 10,
  };
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.down = false;
      continue;
    }
    // Flee gunfire / speeding cars.
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      const dx = ped.x - ped.fleeX, dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      ped.x += (dx / d) * ped.speed * 2.2 * dt;
      ped.y += (dy / d) * ped.speed * 2.2 * dt;
      ped.angle = Math.atan2(dy, dx);
    } else {
      ped.walkPhase += dt * 6;
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      // Wander: occasionally change direction, more often near roads.
      if (Math.random() < dt * 0.25) ped.angle += (Math.random() - 0.5) * 1.6;
    }
    // Keep peds in the world + out of buildings.
    const res = collideCircle(game.city, ped.x, ped.y, 10);
    ped.x = res.x; ped.y = res.y;
    if (res.hit) ped.angle += Math.PI / 2;
    // Recycle far peds near the player.
    if (dist(ped.x, ped.y, p.x, p.y) > 1300) {
      ped.x = p.x + (Math.random() - 0.5) * 1200;
      ped.y = p.y + (Math.random() - 0.5) * 1200;
      ped.angle = Math.random() * Math.PI * 2;
      const r2 = collideCircle(game.city, ped.x, ped.y, 10);
      ped.x = r2.x; ped.y = r2.y;
    }
    // Player car running a ped over (only when the car is moving fast).
    if (p.car && !p.car.wrecked && p.car.speed > 90) {
      if (dist(ped.x, ped.y, p.car.x, p.car.y) < 26) knockDownPed(game, ped, true);
    }
  }
}

export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.down) continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.fleeTimer = 2.5;
      ped.fleeX = x; ped.fleeY = y;
    }
  }
}

// byPlayer decides whether it raises wanted (traffic accidents don't).
export function knockDownPed(game, ped, byPlayer) {
  if (ped.down) return;
  ped.down = true;
  ped.downTimer = 4;
  if (game.effects) game.effects.blood(game.effects, ped.x, ped.y);
  if (byPlayer && game.police) {
    // Only raises heat if someone saw it: cops nearby or already wanted.
    if (game.wanted > 0 || game.police.isSeen()) game.police.addWanted(1);
    else if (Math.random() < 0.5) game.police.addWanted(1); // a witness saw
  }
}
