// police.js — wanted system 0–5: foot cops + cruisers, heat cools when unseen.
import { dist, clamp } from './util.js';
import { spawnEnemy, hasLineOfSight } from './combat.js';
import { nearestRoadPoint } from './city.js';
import { createCar, driveCar } from './vehicles.js';

export function createPolice(game) {
  const pol = {
    freshHeat: 0, // seconds of guaranteed "seen" after a crime
    coolTimer: 0,
    spawnTimer: 0,
    lastSeen: null,
    isSeen() {
      if (pol.freshHeat > 0) return true;
      const p = game.player;
      for (const e of game.enemies) {
        if (e.type !== 'cop') continue;
        if (dist(e.x, e.y, p.x, p.y) < 550 && hasLineOfSight(game, e.x, e.y, p.x, p.y)) return true;
      }
      for (const c of game.cars) {
        if (c.role !== 'cruiser') continue;
        if (dist(c.x, c.y, p.x, p.y) < 600) return true;
      }
      return false;
    },
    addWanted(n) {
      if (game.wanted >= 5) return;
      game.wanted = clamp(game.wanted + n, 0, 5);
      pol.freshHeat = 3; // fresh heat draws a first response for 3s
      pol.spawnTimer = 0;
    },
    clearWanted() { game.wanted = 0; pol.freshHeat = 0; },
    setWanted(n) {
      game.wanted = clamp(n, 0, 5);
      if (n > 0) pol.freshHeat = 3;
    },
    update(dt) {
      const p = game.player;
      if (pol.freshHeat > 0) pol.freshHeat -= dt;
      if (game.wanted <= 0) {
        pol.coolTimer = 0;
        return;
      }
      const seen = pol.isSeen();
      if (seen) { pol.lastSeen = { x: p.x, y: p.y }; pol.coolTimer = 0; }
      else {
        pol.coolTimer += dt;
        if (pol.coolTimer > 4) { // heat cools when unseen
          pol.coolTimer = 0;
          game.wanted = Math.max(0, game.wanted - 1);
          if (game.wanted === 0) pol.clearWanted();
        }
      }
      // Spawn units: fresh heat draws a first response for 3s; afterwards
      // units only spawn while the player is seen.
      pol.spawnTimer -= dt;
      const wantCops = game.wanted;
      const cops = game.enemies.filter((e) => e.type === 'cop').length;
      const cruisers = game.cars.filter((c) => c.role === 'cruiser' && !c.wrecked).length;
      const needCops = p.car ? Math.min(1, wantCops) : Math.min(wantCops, 4);
      const needCruisers = p.car ? Math.min(wantCops, 3) : 0;
      if (pol.spawnTimer <= 0 && (pol.freshHeat > 0 || seen)) {
        pol.spawnTimer = 1.2;
        if (cops < needCops) {
          const a = Math.random() * Math.PI * 2;
          spawnEnemy(game, p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420, 'cop');
        } else if (cruisers < needCruisers) {
          const rp = nearestRoadPoint(game.city, p.x + (Math.random() - 0.5) * 600, p.y + (Math.random() - 0.5) * 600);
          const c = createCar(rp.x, rp.y, Math.atan2(p.y - rp.y, p.x - rp.x), 'cruiser', 'cruiser');
          game.cars.push(c);
        }
      }
      // Despawn units that are far past the search radius.
      game.enemies = game.enemies.filter((e) => {
        if (e.type !== 'cop') return true;
        return dist(e.x, e.y, p.x, p.y) < 1900;
      });
      game.cars = game.cars.filter((c) => {
        if (c.role !== 'cruiser') return true;
        return dist(c.x, c.y, p.x, p.y) < 1900;
      });
      updateCruisers(game, dt);
    },
  };
  return pol;
}

function updateCruisers(game, dt) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.role !== 'cruiser' || car.wrecked) continue;
    // Road-following pursuit: steer toward the player, snap back to roads.
    const target = { x: p.x, y: p.y };
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    let steer = 0;
    const diff = ((desired - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (diff > 0.15) steer = 1; else if (diff < -0.15) steer = -1;
    // If off-road, head for the nearest road point first.
    const rp = nearestRoadPoint(game.city, car.x, car.y);
    const offRoad = dist(car.x, car.y, rp.x, rp.y) > 70;
    const aim = offRoad ? Math.atan2(rp.y - car.y, rp.x - car.x) : desired;
    const diff2 = ((aim - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    steer = diff2 > 0.15 ? 1 : diff2 < -0.15 ? -1 : 0;
    // Stuck recovery: reversing briefly when barely moving.
    car.stuckTimer = car.speed < 25 ? car.stuckTimer + dt : 0;
    if (car.stuckTimer > 2) { car.reverseTimer = 0.8; car.stuckTimer = 0; }
    let throttle = 1;
    if (car.reverseTimer > 0) { car.reverseTimer -= dt; throttle = -0.7; steer = -steer; }
    driveCar(game, car, { throttle, steer, handbrake: false }, dt);
    // Ramming: touching the player's car shoves + damages it.
    if (p.car && !p.car.wrecked && dist(car.x, car.y, p.car.x, p.car.y) < 34) {
      const dx = p.car.x - car.x, dy = p.car.y - car.y, d = Math.hypot(dx, dy) || 1;
      p.car.vx += (dx / d) * 90; p.car.vy += (dy / d) * 90;
      if (game.effects) game.effects.addShake(game.effects, 3);
    }
    // Cruisers give up past 1300px: handled by the despawn filter above.
  }
}
