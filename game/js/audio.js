// audio.js — WebAudio-synthesised sound, no assets.
let ctx = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenOn = false;
export function ensureAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable */ }
}
function tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}
export const sfx = {
  shoot() { tone(880, 0.09, 'square', 0.06, 220); },
  crash() { tone(90, 0.18, 'sawtooth', 0.12, 40); },
  blip() { tone(660, 0.07, 'sine', 0.06); },
  cash() { tone(990, 0.08, 'sine', 0.08); setTimeout(() => tone(1320, 0.12, 'sine', 0.08), 80); },
  horn() { tone(370, 0.25, 'sawtooth', 0.05, 370); },
  wasted() { tone(220, 0.7, 'sawtooth', 0.1, 55); },
  click() { tone(520, 0.05, 'sine', 0.05); },
  heal() { tone(520, 0.15, 'sine', 0.07, 780); },
};
export function updateEngine(driving, speed01) {
  if (!ctx) return;
  try {
    if (driving && !engineOsc) {
      engineOsc = ctx.createOscillator(); engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth'; engineGain.gain.value = 0.02;
      engineOsc.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start();
    }
    if (engineOsc) {
      engineOsc.frequency.setValueAtTime(50 + speed01 * 140, ctx.currentTime);
      engineGain.gain.setValueAtTime(driving ? 0.015 + speed01 * 0.03 : 0.0001, ctx.currentTime);
    }
  } catch { /* ignore */ }
}
export function updateSiren(active) {
  if (!ctx) return;
  try {
    if (active && !sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenGain = ctx.createGain();
      sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700; sirenGain.gain.value = 0.015;
      sirenOsc.connect(sirenGain); sirenGain.connect(ctx.destination);
      sirenOsc.start(); sirenOn = true;
    } else if (!active && sirenOsc) {
      sirenOsc.stop(); sirenOsc = null; sirenOn = false;
    }
    if (sirenOsc) sirenOsc.frequency.setValueAtTime(sirenOn ? (700 + 250 * Math.sin(Date.now() / 300)) : 700, ctx.currentTime);
  } catch { /* ignore */ }
}
export function stopAllLoops() {
  try {
    if (engineOsc) { engineOsc.stop(); engineOsc = null; }
    if (sirenOsc) { sirenOsc.stop(); sirenOsc = null; }
  } catch { /* ignore */ }
}
