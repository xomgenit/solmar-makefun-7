// util.js — math + seeded RNG + collision helpers (SOLMAR, fresh code).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
// Push a circle out of an axis-aligned rect. Returns true if it collided.
export function pushCircleOutOfRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r, hit: true, nx: dx / d, ny: dy / d };
  }
  // Centre inside rect: push out along the smallest penetration axis.
  const pl = x - rect.x, pr = rect.x + rect.w - x, pt = y - rect.y, pb = rect.y + rect.h - y;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: rect.x - r, y, hit: true, nx: -1, ny: 0 };
  if (m === pr) return { x: rect.x + rect.w + r, y, hit: true, nx: 1, ny: 0 };
  if (m === pt) return { x, y: rect.y - r, hit: true, nx: 0, ny: -1 };
  return { x, y: rect.y + rect.h + r, hit: true, nx: 0, ny: 1 };
}
// Does segment (x1,y1)-(x2,y2) hit any rect in list? (LOS / hitscan wall check)
export function segmentHitsRects(x1, y1, x2, y2, rects) {
  for (const r of rects) {
    if (segmentHitsRect(x1, y1, x2, y2, r)) return true;
  }
  return false;
}
function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1;
  // Endpoint-inside test + sampling along the segment (robust enough for LOS/hitscan).
  if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
  if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t, py = y1 + dy * t;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
  }
  return false;
}
