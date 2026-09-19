/**
 * Tiny WebAudio sound engine: all sounds are synthesized (no assets).
 * Disabled by default until the user enables "Sound effects".
 */

let ctx: AudioContext | null = null;
let enabled = false;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function soundEnabled() {
  return enabled;
}

function blip(freq: number, dur: number, type: OscillatorType, gainV: number, when = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainV, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** reel tick as a card passes the marker; pitch rises with speed */
export function tick(pitch = 1) {
  if (!enabled) return;
  blip(1500 * pitch, 0.045, 'square', 0.05);
}

export function click() {
  if (!enabled) return;
  blip(700, 0.05, 'triangle', 0.08);
}

/** victory jingle, brighter as rarity goes up */
export function win(rarity: string) {
  if (!enabled) return;
  const base: Record<string, number> = {
    mil_spec: 392,
    restricted: 440,
    classified: 523,
    covert: 587,
    rare_special: 659,
  };
  const f = base[rarity] ?? 440;
  const steps = rarity === 'rare_special' ? 5 : 3;
  for (let i = 0; i < steps; i++) {
    blip(f * Math.pow(1.25, i), 0.16, 'triangle', 0.12, i * 0.09);
  }
}

/** big gold reveal fanfare */
export function goldSound() {
  if (!enabled) return;
  const notes = [523, 659, 784, 1046, 1318];
  notes.forEach((f, i) => {
    blip(f, 0.3, 'triangle', 0.14, i * 0.12);
    blip(f / 2, 0.3, 'sine', 0.1, i * 0.12);
  });
  // shimmer
  for (let i = 0; i < 8; i++) blip(2000 + i * 300, 0.08, 'square', 0.03, 0.5 + i * 0.05);
}

export function sell() {
  if (!enabled) return;
  blip(880, 0.08, 'sine', 0.1);
  blip(1174, 0.12, 'sine', 0.1, 0.08);
}

export function error() {
  if (!enabled) return;
  blip(180, 0.18, 'sawtooth', 0.08);
}
