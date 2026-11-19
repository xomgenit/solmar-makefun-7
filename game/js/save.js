// save.js — localStorage save (solmar-save-v1).
export const SAVE_KEY = 'solmar-save-v1';
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}
export function saveGame(game) {
  try {
    const data = {
      seed: game.city.seed,
      cash: game.player.cash,
      health: game.player.health,
      x: game.player.x, y: game.player.y,
      car: game.player.car ? { model: game.player.car.model, color: game.player.car.color, x: game.player.car.x, y: game.player.car.y, angle: game.player.car.angle, hp: game.player.car.hp } : null,
      missions: game.missions.serialize(),
      stats: game.stats,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
