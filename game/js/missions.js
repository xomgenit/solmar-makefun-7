// missions.js — Vera's 5-mission chain + cash stashes + gold sports unlock + free-roam.
// Def shape: { id, title, brief, reward, next, start(game,ms), update(game,ms,dt) -> 'done'|'failed'|undefined, onEnemyDown(game,ms,enemy) }
// Per-mission state lives in ms.current.state (fresh {} per start).
// completeCurrent clears state FIRST, then pays/banners/autosaves/chains to def.next.
// Pay-once: rewards are paid ONLY by completeCurrent; revisiting a site pays $0.
import { dist } from './util.js';
import { sfx } from './audio.js';
import { spawnEnemy } from './combat.js';
import { spawnParkedCar } from './vehicles.js';

// Hidden cash stashes, $300 each. All three sit on road centres (verified:
// collideCircle moves them 0px), so a player on foot or in a car can reach them.
export const STASHES = [
  { x: 1050, y: 1500 },
  { x: 2250, y: 900 },
  { x: 2850, y: 2100 },
];
const STASH_REWARD = 300;
const GOLD_COLOR = '#f1c40f';
const GOLD_SPOT = { x: 1500, y: 1050 }; // on the road by Vera's Garage

function setMarker(game, lm) { game.missionMarker = { x: lm.cx, y: lm.cy }; }

function ensureSportsCar(game, ms) {
  if (!ms.sportsUnlocked) return;
  const has = game.cars.some((c) => c.model === 'sports' && c.color === GOLD_COLOR);
  if (!has) spawnParkedCar(game, GOLD_SPOT.x, GOLD_SPOT.y, 0, 'sports', GOLD_COLOR);
}

export const MISSION_DEFS = {
  'first-wheels': {
    id: 'first-wheels', title: 'First Wheels', brief: 'Steal any car, then drive it to Vera\'s Garage.', reward: 250, next: 'the-pickup',
    start(game, ms) {
      game.missions.setObjective('First Wheels', 'Steal any car, then drive it to Vera\'s Garage');
      setMarker(game, game.city.landmarkById.garage);
    },
    update(game, ms, dt) {
      const g = game.city.landmarkById.garage;
      if (game.player.car && dist(game.player.x, game.player.y, g.cx, g.cy) < 200) return 'done';
      return undefined;
    },
  },
  'the-pickup': {
    id: 'the-pickup', title: 'The Pickup', brief: 'Pick up the package at East Harbour Docks, deliver it to Vera\'s Diner.', reward: 400, next: 'hot-delivery',
    start(game, ms) {
      ms.current.state.picked = false;
      game.missions.setObjective('The Pickup', 'Pick up the package at East Harbour Docks');
      setMarker(game, game.city.landmarkById.docks);
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const docks = game.city.landmarkById.docks;
      const diner = game.city.landmarkById.diner;
      if (!st.picked) {
        if (dist(game.player.x, game.player.y, docks.cx, docks.cy) < 120) {
          st.picked = true;
          game.hud.banner('PACKAGE SECURED', 'Deliver it to Vera\'s Diner', '#2ecc71');
          game.missions.setObjective('The Pickup', 'Deliver the package to Vera\'s Diner');
          setMarker(game, diner);
        }
        return undefined;
      }
      if (dist(game.player.x, game.player.y, diner.cx, diner.cy) < 200) return 'done';
      return undefined;
    },
  },
  'hot-delivery': {
    id: 'hot-delivery', title: 'Hot Delivery', brief: 'Timed run: deliver to the Docks in 90 seconds.', reward: 600, next: 'payback-pier',
    start(game, ms) {
      ms.current.state.timeLeft = 90;
      ms.current.state.shown = 90;
      game.missions.setObjective('Hot Delivery', 'Deliver to the Docks — 90s on the clock');
      setMarker(game, game.city.landmarkById.docks);
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      st.timeLeft -= dt;
      const shown = Math.max(0, Math.ceil(st.timeLeft));
      if (shown !== st.shown) {
        st.shown = shown;
        game.missions.setObjective('Hot Delivery', `Deliver to the Docks — ${shown}s left`);
      }
      const docks = game.city.landmarkById.docks;
      if (dist(game.player.x, game.player.y, docks.cx, docks.cy) < 200) return 'done';
      if (st.timeLeft <= 0) return 'failed'; // timeout: restart in place, pays $0
      return undefined;
    },
  },
  'payback-pier': {
    id: 'payback-pier', title: 'Payback at the Pier', brief: 'Eliminate the 4 Harbor Kings on the pier deck.', reward: 800, next: 'solmar-score',
    start(game, ms) {
      // Clear any leftover kings (e.g. mission restarted from the pause menu).
      game.enemies = game.enemies.filter((e) => e.type !== 'king');
      ms.current.state.kills = 0;
      ms.current.state.wave = 1;
      spawnEnemy(game, 3360, 1800, 'king');
      spawnEnemy(game, 3500, 1800, 'king');
      game.missions.setObjective('Payback at the Pier', 'Eliminate the Harbor Kings (4 left)');
      setMarker(game, game.city.landmarkById.pier);
    },
    onEnemyDown(game, ms, enemy) {
      const st = ms.current.state;
      st.kills++;
      if (st.kills === 2 && st.wave === 1) {
        st.wave = 2;
        spawnEnemy(game, 3420, 1800, 'king');
        spawnEnemy(game, 3480, 1800, 'king');
        game.hud.banner('REINFORCEMENTS', 'More Kings on the pier!', '#e74c3c');
      }
      game.missions.setObjective('Payback at the Pier', `Eliminate the Harbor Kings (${4 - st.kills} left)`);
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      if (st.kills >= 4) return 'done';
      // Auto-heal: kings only vanish without a kill if the player was wasted
      // (respawn clears enemies) — respawn the current wave so the mission
      // can never get stuck with zero kings and kills < 4.
      const liveKings = game.enemies.filter((e) => e.type === 'king').length;
      if (liveKings === 0) {
        if (st.wave === 1 && st.kills < 2) {
          spawnEnemy(game, 3360, 1800, 'king');
          spawnEnemy(game, 3500, 1800, 'king');
        } else if (st.wave === 2 && st.kills < 4) {
          spawnEnemy(game, 3420, 1800, 'king');
          spawnEnemy(game, 3480, 1800, 'king');
        }
      }
      return undefined;
    },
  },
  'solmar-score': {
    id: 'solmar-score', title: 'The Solmar Score', brief: 'Crack the vault at Solmar National Bank, then lose the heat.', reward: 1500, next: null,
    start(game, ms) {
      ms.current.state.channel = 0;
      ms.current.state.alarmed = false;
      ms.current.state.shown = -1;
      game.missions.setObjective('The Solmar Score', 'Crack the vault — stay close to the bank (0%)');
      setMarker(game, game.city.landmarkById.bank);
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const bank = game.city.landmarkById.bank;
      if (!st.alarmed) {
        if (dist(game.player.x, game.player.y, bank.cx, bank.cy) < 200) {
          st.channel += dt;
          const pct = Math.min(100, Math.floor((st.channel / 5) * 100));
          if (pct !== st.shown) {
            st.shown = pct;
            game.missions.setObjective('The Solmar Score', `Crack the vault — stay close to the bank (${pct}%)`);
          }
          if (st.channel >= 5) {
            st.alarmed = true;
            if (game.wanted < 2) game.police.addWanted(2 - game.wanted); // alarm raises 2 stars
            game.hud.banner('ALARM TRIPPED', 'Lose the heat to finish the score', '#e74c3c');
            game.missions.setObjective('The Solmar Score', 'Escape the heat — lose the cops');
          }
        } else if (st.channel > 0) {
          // Stepping away resets the channel.
          st.channel = 0;
          st.shown = -1;
          game.missions.setObjective('The Solmar Score', 'Crack the vault — stay close to the bank (0%)');
        }
        return undefined;
      }
      // Escape phase: done once the heat is fully gone (unseen decay or spa respray).
      if (game.wanted === 0) return 'done';
      return undefined;
    },
  },
  'free-roam': {
    id: 'free-roam', title: 'Free Roam', brief: 'Explore Solmar Bay. Visit the Pier for a bonus.', reward: 0, next: null,
    start(game, ms) {
      game.missions.setObjective('Free Roam', 'Visit Solmar Pier (+$50)');
      setMarker(game, game.city.landmarkById.pier);
    },
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
      // Gold sports car unlocks when Hot Delivery pays out.
      if (def.id === 'hot-delivery' && !ms.sportsUnlocked) {
        ms.sportsUnlocked = true;
        ensureSportsCar(game, ms);
        game.hud.banner('NEW RIDE', 'A gold sports car waits by Vera\'s Garage', '#f1c40f');
      }
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
      // Cash stashes: live in every mission + free roam, pay exactly once each.
      for (let i = 0; i < STASHES.length; i++) {
        if (ms.stashesTaken.includes(i)) continue;
        const s = STASHES[i];
        if (dist(game.player.x, game.player.y, s.x, s.y) < 70) {
          ms.stashesTaken.push(i);
          game.player.cash += STASH_REWARD;
          game.effects.floater(game.effects, game.player.x, game.player.y - 30, `+$${STASH_REWARD}`, '#2ecc71');
          sfx.cash();
          game.save();
        }
      }
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
      ensureSportsCar(game, ms); // respawn the prize car on CONTINUE if earned and missing
    },
    reset() {
      ms.current = null; ms.currentId = null;
      ms.completed = []; ms.pierPaid = false;
      ms.sportsUnlocked = false; ms.stashesTaken = [];
    },
  };
  return ms;
}
