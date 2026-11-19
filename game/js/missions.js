// missions.js — mission registry + free-roam hook for Builder 2.
// Def shape: { id, title, brief, reward, next, start(game,ms), update(game,ms,dt) -> 'done'|'failed'|undefined, onEnemyDown(game,ms,enemy) }
// Per-mission state lives in ms.state (fresh {} per start).
// completeCurrent clears state FIRST, then pays/banners/autosaves/chains to def.next.
import { dist } from './util.js';
import { sfx } from './audio.js';

export const MISSION_DEFS = {
  'free-roam': {
    id: 'free-roam', title: 'Free Roam', brief: 'Explore Solmar Bay. Visit the Pier for a bonus.', reward: 0, next: null,
    start(game, ms) { game.missions.setObjective('Free Roam', 'Visit Solmar Pier (+$50)'); },
    update(game, ms, dt) {
      const pier = game.city.landmarkById.pier;
      if (!ms.pierPaid && dist(game.player.x, game.player.y, pier.cx, pier.cy) < 200) {
        ms.pierPaid = true;
        game.player.cash += 50;
        game.effects.floater(game.effects, game.player.x, game.player.y - 30, '+$50', '#2ecc71');
        sfx.cash();
        game.missions.setObjective('Free Roam', 'Enjoy Solmar Bay — free roam');
      }
      return undefined;
    },
  },
};

export function createMissions(game) {
  const ms = {
    current: null, currentId: null,
    completed: [], // mission ids completed (pay-once record)
    pierPaid: false, // free-roam pier bonus — lives in the closure, NOT in per-start state
    sportsUnlocked: false,
    stashesTaken: [],
    list() { return Object.values(MISSION_DEFS); },
    isComplete(id) { return ms.completed.includes(id); },
    setObjective(title, text) {
      game.objective = { title, text };
      if (game.hud) game.hud.update(game, 0);
    },
    start(id) {
      const def = MISSION_DEFS[id];
      if (!def) return false;
      ms.current = { def, state: {} };
      ms.currentId = id;
      if (def.start) def.start(game, ms);
      if (game.hud) game.hud.banner(def.title, def.brief, '#f1c40f');
      return true;
    },
    completeCurrent() {
      if (!ms.current) return;
      const def = ms.current.def;
      // Clear state FIRST so no effect can re-trigger the payout.
      ms.current = null; ms.currentId = null;
      if (!ms.completed.includes(def.id)) ms.completed.push(def.id);
      if (def.reward > 0) {
        game.player.cash += def.reward;
        game.effects.floater(game.effects, game.player.x, game.player.y - 30, `+$${def.reward}`, '#2ecc71');
        sfx.cash();
      }
      if (game.hud) game.hud.banner('MISSION COMPLETE', `${def.title} — $${def.reward}`, '#2ecc71');
      game.save();
      if (def.next && MISSION_DEFS[def.next]) ms.start(def.next);
      else ms.start('free-roam');
    },
    failCurrent(reason) {
      if (!ms.current) return;
      const def = ms.current.def;
      ms.current = null; ms.currentId = null;
      if (game.hud) game.hud.banner('MISSION FAILED', reason || def.title, '#e74c3c');
      ms.start(def.id); // restart in place, chain intact, pays nothing
    },
    restartCurrent() {
      if (!ms.current) return;
      const id = ms.current.def.id;
      ms.current = null; ms.currentId = null;
      ms.start(id);
    },
    onEnemyDown(enemy) {
      if (ms.current && ms.current.def.onEnemyDown) ms.current.def.onEnemyDown(game, ms, enemy);
    },
    update(dt) {
      if (ms.current && ms.current.def.update) {
        const res = ms.current.def.update(game, ms, dt);
        if (res === 'done') ms.completeCurrent();
        else if (res === 'failed') ms.failCurrent();
      }
    },
    serialize() {
      return {
        currentId: ms.currentId, completed: [...ms.completed],
        pierPaid: ms.pierPaid, sportsUnlocked: ms.sportsUnlocked, stashesTaken: [...ms.stashesTaken],
      };
    },
    restore(data) {
      if (!data) return;
      ms.completed = data.completed || [];
      ms.pierPaid = !!data.pierPaid;
      ms.sportsUnlocked = !!data.sportsUnlocked;
      ms.stashesTaken = data.stashesTaken || [];
      if (data.currentId && MISSION_DEFS[data.currentId]) ms.start(data.currentId);
      else ms.start('free-roam');
    },
    reset() {
      ms.current = null; ms.currentId = null;
      ms.completed = []; ms.pierPaid = false;
      ms.sportsUnlocked = false; ms.stashesTaken = [];
    },
  };
  return ms;
}
