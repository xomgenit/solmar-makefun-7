// city.js — seeded procedural city for Solmar Bay (fresh code).
import { makeRng, clamp } from './util.js';

export const WORLD = 3600;
export const ROAD_W = 90;
export const ROAD_STEP = 300;
export const ROAD0 = 150; // road centres: 150, 450, ..., 3450

export const LANDMARKS = [
  { id: 'hideout', name: "Dice's Hideout", cx: 560, cy: 330 },
  { id: 'sbpd', name: 'SBPD Headquarters', cx: 1800, cy: 300 },
  { id: 'bank', name: 'Solmar National Bank', cx: 2250, cy: 600 },
  { id: 'diner', name: "Vera's Diner", cx: 1050, cy: 750 },
  { id: 'garage', name: "Vera's Garage", cx: 1500, cy: 1050 },
  { id: 'docks', name: 'East Harbour Docks', cx: 2850, cy: 1500 },
  { id: 'pier', name: 'Solmar Pier', cx: 3420, cy: 1800 },
  { id: 'spa', name: 'Sunset Auto Spa', cx: 1200, cy: 2100 },
  { id: 'hospital', name: 'Solmar General', cx: 2100, cy: 2400 },
];
export const PIER = { x: 3300, y: 1770, w: 260, h: 60 }; // wooden deck over the sea

const ZONES = [
  { name: 'PALMA BEACH', x0: 3150, y0: 0, x1: 3600, y1: 3600 },
  { name: 'EAST HARBOUR', x0: 2400, y0: 0, x1: 3150, y1: 3600 },
  { name: 'DOWNTOWN', x0: 1200, y0: 0, x1: 2400, y1: 3600 },
  { name: 'OLD TOWN', x0: 0, y0: 0, x1: 1200, y1: 3600 },
];
export function zoneAt(x, y) {
  for (const z of ZONES) if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return z.name;
  return 'SOLMAR BAY';
}

export function roadCentres() {
  const out = [];
  for (let c = ROAD0; c <= WORLD - ROAD0; c += ROAD_STEP) out.push(c);
  return out;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const roads = roadCentres();
  const buildings = [];
  const palms = [];
  const roofColors = ['#b0563a', '#7a6a58', '#5d7a8c', '#8c5d6e', '#6e8c5d', '#946b2d'];
  // One building per block (blocks are between roads), skipping beach/sea + landmark cells.
  for (let ix = 0; ix < roads.length - 1; ix++) {
    for (let iy = 0; iy < roads.length - 1; iy++) {
      const bx = roads[ix] + ROAD_W / 2 + 12;
      const by = roads[iy] + ROAD_W / 2 + 12;
      const bw = ROAD_STEP - ROAD_W - 24;
      const bh = ROAD_STEP - ROAD_W - 24;
      const ccx = bx + bw / 2, ccy = by + bh / 2;
      if (ccx > 3120) continue; // beach / sea: no buildings
      if (LANDMARKS.some((l) => Math.abs(l.cx - ccx) < 260 && Math.abs(l.cy - ccy) < 260)) continue;
      if (rng() < 0.12) continue; // empty lot / parking
      const w = bw * (0.55 + rng() * 0.4);
      const h = bh * (0.55 + rng() * 0.4);
      buildings.push({
        x: ccx - w / 2, y: ccy - h / 2, w, h,
        color: roofColors[Math.floor(rng() * roofColors.length)],
        wall: '#3d3a36',
      });
    }
  }
  // Landmark buildings (solid, bigger).
  for (const l of LANDMARKS) {
    if (l.id === 'pier') continue;
    buildings.push({ x: l.cx - 70, y: l.cy - 50, w: 140, h: 100, color: '#a8842e', wall: '#4a4038', landmark: l.id });
  }
  // Palms along the beach strip + scattered.
  for (let i = 0; i < 90; i++) {
    const x = 3160 + rng() * 260;
    const y = rng() * WORLD;
    if (Math.abs(y - 1800) < 120) continue; // keep the pier approach clear
    palms.push({ x, y, r: 5 + rng() * 4 });
  }
  for (let i = 0; i < 40; i++) {
    palms.push({ x: rng() * 3000, y: rng() * WORLD, r: 4 + rng() * 4 });
  }
  const landmarkById = {};
  for (const l of LANDMARKS) landmarkById[l.id] = l;
  return { seed, roads, buildings, palms, landmarkById, world: WORLD };
}

// Push a circle out of every building it overlaps. Returns {x, y, hit}.
export function collideCircle(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r; y = cy + (dy / d) * r;
    } else {
      const pl = x - b.x, pr = b.x + b.w - x, pt = y - b.y, pb = b.y + b.h - y;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = b.x - r; else if (m === pr) x = b.x + b.w + r;
      else if (m === pt) y = b.y - r; else y = b.y + b.h + r;
    }
  }
  // World bounds + sea: the sea (x > 3520) is not walkable/drivable except the pier deck.
  if (x > 3520 && !(y > PIER.y && y < PIER.y + PIER.h && x < PIER.x + PIER.w)) { x = 3520; hit = true; }
  if (x < 10) { x = 10; hit = true; }
  if (y < 10) { y = 10; hit = true; }
  if (y > WORLD - 10) { y = WORLD - 10; hit = true; }
  return { x, y, hit };
}

export function nearestRoadPoint(city, x, y) {
  let bx = city.roads[0], bd = Infinity;
  for (const c of city.roads) { const d = Math.abs(c - x); if (d < bd) { bd = d; bx = c; } }
  let by = city.roads[0]; bd = Infinity;
  for (const c of city.roads) { const d = Math.abs(c - y); if (d < bd) { bd = d; by = c; } }
  // Snap to the nearer axis road.
  return Math.abs(bx - x) < Math.abs(by - y) ? { x: bx, y } : { x, y: by };
}
