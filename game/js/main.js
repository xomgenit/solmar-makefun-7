// main.js — orchestration: states, player control, camera, save wiring, debug hooks.
import { buildCity, zoneAt } from './city.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createEffects, updateEffects, burst } from './effects.js';
import { createMissions } from './missions.js';
import { createPolice } from './police.js';
import { createCar, driveCar, collideCars, updateTraffic, spawnTrafficCar, spawnParkedCar, MODELS } from './vehicles.js';
import { createPed, updatePeds, scarePeds } from './people.js';
import { shoot, updateEnemies, hasLineOfSight } from './combat.js';
import { collideCircle } from './city.js';
import { drawWorld } from './render.js';
import { saveGame, loadSave, hasSave, clearSave } from './save.js';
import { ensureAudio, sfx, updateEngine, updateSiren, stopAllLoops } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const PARAM_SEED = params.get('seed') ? parseInt(params.get('seed'), 10) : null;
const AUTOSTART = params.get('autostart') === '1';

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const input = createInput(canvas);

// Single game object, reset in place — window.__solmar.game never goes stale.
const game = {
  state: 'title', // title | playing | paused | wasted | busted
  time: 0,
  city: null,
  player: null,
  cars: [], peds: [], enemies: [],
  wanted: 0,
  objective: { title: 'Free Roam', text: 'Explore Solmar Bay' },
  missionMarker: null,
  stats: { kills: 0, carsStolen: 0, missionsDone: 0 },
  cam: { x: 0, y: 0 },
  fireCd: 0,
};
game.effects = createEffects();
game.hud = createHud();
game.missions = createMissions(game);
game.police = createPolice(game);
game.save = () => saveGame(game);
game.wasted = () => {
  if (game.state !== 'playing') return;
  game.state = 'wasted';
  sfx.wasted(); stopAllLoops();
  showOverlay('wasted');
};
game.busted = () => {
  if (game.state !== 'playing') return;
  game.state = 'busted';
  sfx.wasted(); stopAllLoops();
  showOverlay('busted');
};

function resetGame(seed) {
  game.city = buildCity(seed);
  game.cars = []; game.peds = []; game.enemies = [];
  game.wanted = 0;
  game.time = 0;
  game.stats = { kills: 0, carsStolen: 0, missionsDone: 0 };
  game.objective = { title: 'Free Roam', text: 'Explore Solmar Bay' };
  game.missionMarker = game.city.landmarkById.pier;
  game.effects.particles.length = 0; game.effects.tracers.length = 0;
  game.effects.floaters.length = 0; game.effects.skids.length = 0;
  const hideout = game.city.landmarkById.hideout;
  game.player = {
    x: hideout.cx + 40, y: hideout.cy + 60, angle: 0, aimAngle: 0,
    health: 100, cash: 200, car: null, lastHurtAt: -99,
  };
  game.missions.reset();
  // Red sports car waiting in the eastbound lane by the hideout.
  spawnParkedCar(game, 560, 330, 0, 'sports');
  spawnParkedCar(game, 1500, 1000, Math.PI / 2, 'sedan');
  spawnParkedCar(game, 2400, 1800, 0, 'taxi');
  spawnParkedCar(game, 900, 2400, Math.PI / 2, 'van');
  spawnParkedCar(game, 2700, 900, 0, 'pickup');
  for (let i = 0; i < 14; i++) spawnTrafficCar(game, game.player.x, game.player.y);
  for (let i = 0; i < 24; i++) {
    const ped = createPed(game.player.x + (Math.random() - 0.5) * 1200, game.player.y + (Math.random() - 0.5) * 1200);
    const r = collideCircle(game.city, ped.x, ped.y, 10);
    ped.x = r.x; ped.y = r.y;
    game.peds.push(ped);
  }
  game.cam.x = game.player.x - canvas.width / 2;
  game.cam.y = game.player.y - canvas.height / 2;
}

function startNewGame() {
  const seed = PARAM_SEED ?? Math.floor(Math.random() * 100000);
  resetGame(seed);
  game.missions.start('free-roam');
  game.state = 'playing';
  hideOverlays();
  game.hud.showHud(true);
  ensureAudio();
  game.hud.banner('SOLMAR', 'Welcome to Solmar Bay, Dice', '#f1c40f');
}

function continueGame() {
  const data = loadSave();
  if (!data) return;
  resetGame(data.seed);
  game.player.cash = data.cash ?? 200;
  game.player.health = data.health ?? 100;
  game.player.x = data.x ?? game.player.x;
  game.player.y = data.y ?? game.player.y;
  if (data.car) {
    const car = createCar(data.car.x, data.car.y, data.car.angle, data.car.model, 'player');
    car.hp = data.car.hp ?? 100;
    game.cars.push(car);
    game.player.car = car;
  }
  if (data.stats) game.stats = data.stats;
  game.missions.restore(data.missions);
  game.state = 'playing';
  hideOverlays();
  game.hud.showHud(true);
  ensureAudio();
}

function quitToTitle() {
  game.state = 'title';
  stopAllLoops();
  game.hud.showHud(false);
  showOverlay('title');
}

function respawn(fine, at, label) {
  game.player.cash = Math.max(0, game.player.cash - fine);
  game.player.health = 100;
  game.player.x = at.cx; game.player.y = at.cy;
  if (game.player.car) { game.player.car = null; }
  game.police.clearWanted();
  game.enemies.length = 0;
  game.state = 'playing';
  hideOverlays();
  game.hud.showHud(true);
  game.hud.banner(label, `-$${fine}`, '#e74c3c');
}

// --- Overlays ---
function showOverlay(which) {
  for (const id of ['title', 'pause', 'wasted', 'busted', 'howto']) {
    const el = document.getElementById(`overlay-${id}`);
    if (el) el.style.display = id === which ? 'flex' : 'none';
  }
  if (which === 'title') {
    const cont = document.getElementById('continue-btn');
    if (cont) cont.disabled = !hasSave();
  }
}
function hideOverlays() {
  for (const id of ['title', 'pause', 'wasted', 'busted', 'howto']) {
    const el = document.getElementById(`overlay-${id}`);
    if (el) el.style.display = 'none';
  }
}

document.getElementById('new-game-btn').addEventListener('click', () => { sfx.click(); startNewGame(); });
document.getElementById('continue-btn').addEventListener('click', () => { sfx.click(); continueGame(); });
document.getElementById('howto-btn').addEventListener('click', () => { sfx.click(); showOverlay('howto'); });
document.getElementById('howto-back').addEventListener('click', () => { sfx.click(); showOverlay('title'); });
document.getElementById('resume-btn').addEventListener('click', () => { sfx.click(); game.state = 'playing'; hideOverlays(); });
document.getElementById('save-btn').addEventListener('click', () => { game.save(); sfx.cash(); document.getElementById('save-note').textContent = 'Saved!'; });
document.getElementById('restart-mission-btn').addEventListener('click', () => { game.missions.restartCurrent(); game.state = 'playing'; hideOverlays(); });
document.getElementById('quit-btn').addEventListener('click', () => { sfx.click(); quitToTitle(); });
document.getElementById('wasted-respawn').addEventListener('click', () => { sfx.click(); respawn(100, game.city.landmarkById.hospital, 'WASTED — patched up at Solmar General'); });
document.getElementById('busted-respawn').addEventListener('click', () => { sfx.click(); respawn(150, game.city.landmarkById.sbpd, 'BUSTED — bailed out at SBPD HQ'); });

// --- Player control ---
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const c of game.cars) {
    const d = Math.hypot(c.x - game.player.x, c.y - game.player.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function stealOrExit() {
  const p = game.player;
  if (p.car) {
    // Exit the car.
    const car = p.car;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    p.car = null;
    car.role = 'parked';
    return;
  }
  const car = nearestCar(85);
  if (!car || car.wrecked) return;
  p.car = car;
  car.role = 'player';
  p.x = car.x; p.y = car.y;
  game.stats.carsStolen++;
  // Seen theft raises heat: a witness (ped/cop nearby) or existing heat.
  const witness = game.peds.some((ped) => !ped.down && Math.hypot(ped.x - p.x, ped.y - p.y) < 320)
    || game.enemies.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 500);
  if (witness || game.wanted > 0) game.police.addWanted(1);
  game.hud.banner('CAR STOLEN', MODELS[car.model].name, '#e67e22');
  sfx.horn();
}

function serviceInteract() {
  const p = game.player;
  const spa = game.city.landmarkById.spa;
  const hosp = game.city.landmarkById.hospital;
  if (p.car && Math.hypot(p.car.x - spa.cx, p.car.y - spa.cy) < 200) {
    if (p.cash >= 150) {
      p.cash -= 150;
      game.police.clearWanted();
      p.car.hp = 100; p.car.wrecked = false;
      game.hud.banner('RESPRAYED', 'Wanted cleared, car repaired — $150', '#2ecc71');
      sfx.cash();
    } else game.hud.setHint('Need $150 for a respray');
    return;
  }
  if (!p.car && Math.hypot(p.x - hosp.cx, p.y - hosp.cy) < 200) {
    if (p.cash >= 100 && p.health < 100) {
      p.cash -= 100; p.health = 100;
      game.hud.banner('PATCHED UP', 'Full health — $100', '#2ecc71');
      sfx.heal();
    } else if (p.health >= 100) game.hud.setHint('Already at full health');
    else game.hud.setHint('Need $100 to heal');
  }
}

function updatePlayer(dt) {
  const p = game.player;
  const ix = input.mouse.x, iy = input.mouse.y;
  p.aimAngle = Math.atan2(iy + game.cam.y - p.y, ix + game.cam.x - p.x);
  // Health regen after 8s calm.
  if (game.time - p.lastHurtAt > 8 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
  if (p.car) {
    const car = p.car;
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
    const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
    driveCar(game, car, { throttle, steer, handbrake: input.down('Space') }, dt);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    if (car.wrecked) { p.car = null; car.role = 'parked'; game.hud.banner('WRECKED', 'Your car is totalled', '#e74c3c'); }
    updateEngine(true, Math.min(1, car.speed / 300));
  } else {
    const mx = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const my = (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0) - (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0);
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 330 : 220;
    const len = Math.hypot(mx, my) || 1;
    p.x += (mx / len) * speed * dt * (mx || my ? 1 : 0);
    p.y += (my / len) * speed * dt * (mx || my ? 1 : 0);
    if (mx || my) p.angle = Math.atan2(my, mx);
    const res = collideCircle(game.city, p.x, p.y, 12);
    p.x = res.x; p.y = res.y;
    updateEngine(false, 0);
  }
  // Shooting (on foot or leaning out — allowed on foot only for balance).
  game.fireCd -= dt;
  if (!p.car && input.mouse.down && game.fireCd <= 0) {
    game.fireCd = 0.22;
    const gx = p.x + Math.cos(p.aimAngle) * 20, gy = p.y + Math.sin(p.aimAngle) * 20;
    shoot(game, gx, gy, p.aimAngle, { fromPlayer: true });
    scarePeds(game, p.x, p.y, 260);
  }
  if (input.wasPressed('KeyE')) { stealOrExit(); serviceInteract(); }
  // Hints.
  let hint = '';
  if (!p.car) {
    const car = nearestCar(85);
    if (car) hint = 'E — Steal car';
    else if (Math.hypot(p.x - game.city.landmarkById.hospital.cx, p.y - game.city.landmarkById.hospital.cy) < 200) hint = 'E — Heal ($100)';
  } else if (Math.hypot(p.car.x - game.city.landmarkById.spa.cx, p.car.y - game.city.landmarkById.spa.cy) < 200) {
    hint = 'E — Respray ($150): clear wanted + repair';
  }
  game.hud.setHint(hint);
}

function updateCamera(dt) {
  const p = game.player;
  const tx = p.x - canvas.width / 2, ty = p.y - canvas.height / 2;
  game.cam.x += (tx - game.cam.x) * Math.min(1, 6 * dt);
  game.cam.y += (ty - game.cam.y) * Math.min(1, 6 * dt);
  game.cam.x = Math.max(-100, Math.min(game.city.world - canvas.width + 100, game.cam.x));
  game.cam.y = Math.max(-100, Math.min(game.city.world - canvas.height + 100, game.cam.y));
}

// --- Main loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'playing') {
    game.time += dt;
    updatePlayer(dt);
    updateTraffic(game, dt);
    collideCars(game);
    updatePeds(game, dt);
    updateEnemies(game, dt);
    game.police.update(dt);
    game.missions.update(dt);
    updateEffects(game.effects, dt);
    updateCamera(dt);
    updateSiren(game.wanted > 0);
    if (input.wasPressed('Escape')) { game.state = 'paused'; showOverlay('pause'); document.getElementById('save-note').textContent = ''; }
    game.hud.update(game, dt);
  } else if (game.state === 'paused') {
    // Esc resumes (a paused branch must exist — retry-6 Esc bug).
    if (input.wasPressed('Escape')) { game.state = 'playing'; hideOverlays(); }
    updateSiren(false);
  } else if (game.state === 'title') {
    // Attract mode: slow pan across the city.
    game.time += dt;
    game.cam.x = 1200 + Math.sin(game.time * 0.05) * 900;
    game.cam.y = 1200 + Math.cos(game.time * 0.04) * 700;
    updateEffects(game.effects, dt);
  }
  // Draw.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (game.city) {
    ctx.save();
    ctx.translate(-game.cam.x + game.effects.shakeX, -game.cam.y + game.effects.shakeY);
    drawWorld(game, ctx, game.cam, canvas.width, canvas.height);
    ctx.restore();
    // Vignette for readability.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, canvas.width, 6);
  }
  input.postUpdate();
  requestAnimationFrame(frame);
}

// Boot: a city must exist behind the title screen.
resetGame(PARAM_SEED ?? 7);
game.state = 'title';
game.hud.showHud(false);
showOverlay('title');
if (AUTOSTART) startNewGame();
requestAnimationFrame(frame);

// Debug hooks (tests + screenshots).
window.__solmar = {
  game,
  teleport(x, y) {
    game.player.x = x; game.player.y = y;
    if (game.player.car) { game.player.car.x = x; game.player.car.y = y; }
    game.cam.x = x - canvas.width / 2; game.cam.y = y - canvas.height / 2;
  },
  setWanted(n) { game.police.setWanted(n); },
  giveCash(n) { game.player.cash += n; },
  zone() { return zoneAt(game.player.x, game.player.y); },
  los(x1, y1, x2, y2) { return hasLineOfSight(game, x1, y1, x2, y2); },
  startNewGame, continueGame,
};
