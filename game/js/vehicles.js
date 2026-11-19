// vehicles.js — car models, arcade physics, traffic, parked cars.
import { clamp, angleDiff, dist } from './util.js';
import { collideCircle, nearestRoadPoint, WORLD } from './city.js';

export const MODELS = {
  sedan: { name: 'Sedan', color: '#c0392b', len: 46, wid: 22, top: 240, accel: 420, maxReverse: 120 },
  sports: { name: 'Sports', color: '#e74c3c', len: 44, wid: 21, top: 320, accel: 560, maxReverse: 140 },
  taxi: { name: 'Taxi', color: '#f1c40f', len: 46, wid: 22, top: 230, accel: 400, maxReverse: 110 },
  van: { name: 'Van', color: '#7f8c8d', len: 52, wid: 24, top: 200, accel: 340, maxReverse: 100 },
  pickup: { name: 'Pickup', color: '#2e86c1', len: 50, wid: 23, top: 220, accel: 380, maxReverse: 110 },
  cruiser: { name: 'Cruiser', color: '#1a1a2e', len: 48, wid: 22, top: 300, accel: 520, maxReverse: 130 },
};

let carSeq = 1;
export function createCar(x, y, angle, model, role = 'traffic', color = null) {
  const m = MODELS[model] || MODELS.sedan;
  return {
    id: carSeq++, x, y, angle, model, role,
    color: color || m.color,
    speed: 0, vx: 0, vy: 0, hp: 100, wrecked: false,
    damageCooldown: 0, stuckTimer: 0, reverseTimer: 0,
    // traffic state
    axis: Math.random() < 0.5 ? 'x' : 'y', dir: Math.random() < 0.5 ? 1 : -1,
    lane: 22, cruise: 90 + Math.random() * 60, turnCooldown: 0,
  };
}

// Arcade drive: velocity-vector model, handbrake drifts.
export function driveCar(game, car, input, dt) {
  if (car.wrecked) return;
  const m = MODELS[car.model] || MODELS.sedan;
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const speedAlong = car.vx * forward.x + car.vy * forward.y;
  let throttle = 0;
  if (input.throttle > 0) throttle = 1;
  else if (input.throttle < 0) throttle = speedAlong > 20 ? -1 : -0.6; // brake, then reverse
  const accel = throttle * m.accel * (input.handbrake ? 0.7 : 1);
  car.vx += forward.x * accel * dt;
  car.vy += forward.y * accel * dt;
  // Steering: stronger at speed, sharper with handbrake.
  const spd = Math.hypot(car.vx, car.vy);
  const steerRate = (input.handbrake ? 3.4 : 2.2) * clamp(spd / 120, 0, 1) * (speedAlong < 0 ? -1 : 1);
  car.angle += input.steer * steerRate * dt;
  // Lateral grip: kill most sideways velocity (less with handbrake = drift).
  const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = { x: -fwd.y, y: fwd.x };
  const vF = car.vx * fwd.x + car.vy * fwd.y;
  const vR = car.vx * right.x + car.vy * right.y;
  const grip = input.handbrake ? 2.2 : 8.0;
  const vR2 = vR * Math.exp(-grip * dt);
  car.vx = fwd.x * vF + right.x * vR2;
  car.vy = fwd.y * vF + right.y * vR2;
  // Drag + top speed.
  const sp2 = Math.hypot(car.vx, car.vy);
  const top = m.top * (input.handbrake ? 0.92 : 1);
  if (sp2 > top) { car.vx *= top / sp2; car.vy *= top / sp2; }
  car.vx *= Math.exp(-0.25 * dt); car.vy *= Math.exp(-0.25 * dt);
  car.speed = Math.hypot(car.vx, car.vy);
  if (input.handbrake && car.speed > 140) {
    game.effects.skid(game.effects, car.x - fwd.x * 14, car.y - fwd.y * 14, car.angle);
  }
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const res = collideCircle(game.city, car.x, car.y, 20);
  if (res.hit) {
    const impact = car.speed;
    car.x = res.x; car.y = res.y;
    car.vx *= -0.25; car.vy *= -0.25;
    if (impact > 160) damageCar(game, car, impact * 0.08);
  }
  car.damageCooldown = Math.max(0, car.damageCooldown - dt);
}

export function damageCar(game, car, amount) {
  if (car.damageCooldown > 0 || car.wrecked) return;
  car.damageCooldown = 0.5;
  car.hp -= amount;
  if (game && game.effects) game.effects.sparks(game.effects, car.x, car.y);
  if (car.hp <= 0) {
    car.hp = 0; car.wrecked = true; car.speed = 0; car.vx = 0; car.vy = 0;
    if (game && game.effects) game.effects.smoke(game.effects, car.x, car.y);
  }
}

// Circle-pair collision between cars. Parked cars never move (handbrake on).
export function collideCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.wrecked && b.wrecked) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = 30;
      if (d >= min || d < 0.001) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      const aFixed = a.role === 'parked', bFixed = b.role === 'parked';
      if (!aFixed) { a.x -= nx * push * (bFixed ? 2 : 1); a.y -= ny * push * (bFixed ? 2 : 1); }
      if (!bFixed) { b.x += nx * push * (aFixed ? 2 : 1); b.y += ny * push * (aFixed ? 2 : 1); }
      // Exchange a little velocity + soft damage on hard hits.
      const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
      if (rel > 120) {
        if (a.role === 'player') damageCar(game, a, rel * 0.04);
        if (b.role === 'player') damageCar(game, b, rel * 0.04);
        if (game.effects) game.effects.sparks(game.effects, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      // Nudge velocities apart so they don't stick.
      if (!aFixed) { a.vx -= nx * rel * 0.3; a.vy -= ny * rel * 0.3; }
      if (!bFixed) { b.vx += nx * rel * 0.3; b.vy += ny * rel * 0.3; }
    }
  }
}

export function spawnTrafficCar(game, nearX, nearY) {
  const roads = game.city.roads;
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const road = roads[Math.floor(Math.random() * roads.length)];
  const along = clamp((axis === 'x' ? nearX : nearY) + (Math.random() - 0.5) * 1400, 200, WORLD - 200);
  const x = axis === 'x' ? along : road;
  const y = axis === 'x' ? road : along;
  const models = ['sedan', 'taxi', 'van', 'pickup'];
  const car = createCar(x, y, axis === 'x' ? 0 : Math.PI / 2, models[Math.floor(Math.random() * models.length)], 'traffic');
  car.axis = axis; car.dir = Math.random() < 0.5 ? 1 : -1;
  car.angle = axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  game.cars.push(car);
  return car;
}

export function spawnParkedCar(game, x, y, angle, model, color = null) {
  const car = createCar(x, y, angle, model, 'parked', color);
  game.cars.push(car);
  return car;
}

function nearestRoadCentre(roads, v) {
  let best = roads[0], bd = Infinity;
  for (const c of roads) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } }
  return best;
}

// Lane-following traffic: drive along roads, turn at intersections, stop for obstacles.
export function updateTraffic(game, dt) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.role !== 'traffic' || car.wrecked) continue;
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    // Obstacle ahead? Stop.
    let blocked = false;
    for (const o of game.cars) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const along = dx * fwd.x + dy * fwd.y;
      const side = Math.abs(-dx * fwd.y + dy * fwd.x);
      if (along > 0 && along < 70 && side < 30) { blocked = true; break; }
    }
    // Ped ahead? Stop.
    if (!blocked) {
      for (const ped of game.peds) {
        if (ped.down) continue;
        const dx = ped.x - car.x, dy = ped.y - car.y;
        const along = dx * fwd.x + dy * fwd.y;
        const side = Math.abs(-dx * fwd.y + dy * fwd.x);
        if (along > 0 && along < 55 && side < 26) { blocked = true; break; }
      }
    }
    const speed = blocked ? 0 : car.cruise;
    car.vx = fwd.x * speed; car.vy = fwd.y * speed;
    car.x += car.vx * dt; car.y += car.vy * dt;
    // At an intersection, sometimes turn onto the cross road.
    const rc = nearestRoadCentre(game.city.roads, car.axis === 'x' ? car.y : car.x);
    const cross = nearestRoadCentre(game.city.roads, car.axis === 'x' ? car.x : car.y);
    const onCross = Math.abs((car.axis === 'x' ? car.x : car.y) - cross) < 8;
    if (onCross && car.turnCooldown <= 0 && Math.random() < 0.35) {
      car.turnCooldown = 2.5;
      car.axis = car.axis === 'x' ? 'y' : 'x';
      car.dir = Math.random() < 0.5 ? 1 : -1;
      car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      // Stay glued to the road line (gentle snap below handles it).
    }
    // Keep the car on its road line (gentle snap).
    if (car.axis === 'x') car.y += (rc - car.y) * Math.min(1, 2 * dt);
    else car.x += (rc - car.x) * Math.min(1, 2 * dt);
    // Recycle far cars near the player.
    const d = dist(car.x, car.y, p.x, p.y);
    if (d > 1400) {
      const idx = game.cars.indexOf(car);
      if (idx >= 0) game.cars.splice(idx, 1);
      spawnTrafficCar(game, p.x, p.y);
    }
  }
}

export function drawCar(ctx, car) {
  const m = MODELS[car.model] || MODELS.sedan;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-m.len / 2 + 2, -m.wid / 2 + 3, m.len, m.wid);
  ctx.fillStyle = car.wrecked ? '#2b2b2b' : car.color;
  ctx.fillRect(-m.len / 2, -m.wid / 2, m.len, m.wid);
  // Cabin + windshield.
  ctx.fillStyle = car.wrecked ? '#1c1c1c' : '#20242a';
  ctx.fillRect(-m.len / 2 + 10, -m.wid / 2 + 4, m.len / 2.6, m.wid - 8);
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.fillRect(m.len / 2 - 10, -m.wid / 2 + 4, 5, m.wid - 8);
  if (car.model === 'taxi') { ctx.fillStyle = '#111'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, 3); }
  if (car.role === 'cruiser') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-m.len / 2 + 2, -m.wid / 2, 8, m.wid);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(-2, -m.wid / 2 - 2, 5, 4);
    ctx.fillStyle = '#2e86c1'; ctx.fillRect(-2, m.wid / 2 - 2, 5, 4);
  }
  // Headlights.
  ctx.fillStyle = 'rgba(255,255,190,0.9)';
  ctx.fillRect(m.len / 2 - 2, -m.wid / 2 + 2, 2, 4);
  ctx.fillRect(m.len / 2 - 2, m.wid / 2 - 6, 2, 4);
  ctx.restore();
  // Damage smoke.
  if (car.hp < 40 && !car.wrecked && Math.random() < 0.1) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(car.x, car.y - 8, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
