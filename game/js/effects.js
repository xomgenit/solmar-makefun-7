// effects.js — particles, tracers, floaters, skids, screen shake.
// The helpers are bound onto the fx object as game.effects.* (see contract).
export function createEffects() {
  const fx = { particles: [], tracers: [], floaters: [], skids: [], shake: 0, shakeX: 0, shakeY: 0 };
  fx.burst = (x, y, color, n, speed) => burst(fx, x, y, color, n, speed);
  fx.sparks = (x, y) => sparks(fx, x, y);
  fx.smoke = (x, y) => smoke(fx, x, y);
  fx.blood = (x, y) => blood(fx, x, y);
  fx.tracer = (x1, y1, x2, y2) => tracer(fx, x1, y1, x2, y2);
  fx.floater = (x, y, text, color) => floater(fx, x, y, text, color);
  fx.skid = (x, y, angle) => skid(fx, x, y, angle);
  fx.muzzle = (x, y) => muzzle(fx, x, y);
  fx.addShake = (amount) => addShake(fx, amount);
  return fx;
}
function add(fx, p) { fx.particles.push(p); if (fx.particles.length > 400) fx.particles.splice(0, fx.particles.length - 400); }
export function burst(fx, x, y, color, n = 10, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    add(fx, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, max: 0.7, color, size: 2 + Math.random() * 3 });
  }
}
export function sparks(fx, x, y) { burst(fx, x, y, '#ffd34d', 8, 160); }
export function smoke(fx, x, y) { burst(fx, x, y, '#888888', 6, 40); }
export function blood(fx, x, y) { burst(fx, x, y, '#c0392b', 10, 100); }
export function tracer(fx, x1, y1, x2, y2) { fx.tracers.push({ x1, y1, x2, y2, life: 0.12, max: 0.12 }); }
export function floater(fx, x, y, text, color = '#ffd34d') { fx.floaters.push({ x, y, text, color, life: 1.2, max: 1.2 }); }
export function skid(fx, x, y, angle) { fx.skids.push({ x, y, angle, life: 1.5, max: 1.5 }); if (fx.skids.length > 200) fx.skids.splice(0, fx.skids.length - 200); }
export function muzzle(fx, x, y) { burst(fx, x, y, '#ffea00', 4, 90); }
export function addShake(fx, amount) { fx.shake = Math.min(14, fx.shake + amount); }
export function updateEffects(fx, dt) {
  for (const p of fx.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const t of fx.tracers) t.life -= dt;
  fx.tracers = fx.tracers.filter((t) => t.life > 0);
  for (const f of fx.floaters) { f.y -= 30 * dt; f.life -= dt; }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
  for (const s of fx.skids) s.life -= dt;
  fx.skids = fx.skids.filter((s) => s.life > 0);
  if (fx.shake > 0) {
    fx.shake = Math.max(0, fx.shake - dt * 30);
    fx.shakeX = (Math.random() - 0.5) * fx.shake;
    fx.shakeY = (Math.random() - 0.5) * fx.shake;
  } else { fx.shakeX = 0; fx.shakeY = 0; }
}
export function drawEffects(fx, ctx) {
  for (const s of fx.skids) {
    ctx.save(); ctx.globalAlpha = 0.35 * (s.life / s.max);
    ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-7, -2, 14, 4); ctx.restore();
  }
  for (const p of fx.particles) {
    ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const t of fx.tracers) {
    ctx.save(); ctx.globalAlpha = Math.max(0, t.life / t.max);
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
