import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollRarity, rollFloat, rollBool, rollInt, makeSeed, wearFromFloat } from '../util/rng.js';
import { DEFAULT_PROBABILITIES } from 'shared';

/** relative frequency within expected*tolerance (loose, for weighted RNG sanity) */
function chi2Ok(obs: Record<string, number>, exp: Record<string, number>, alpha999 = 1.6) {
  let chi2 = 0;
  for (const k of Object.keys(exp)) {
    const e = exp[k];
    const o = obs[k] ?? 0;
    chi2 += ((o - e) ** 2) / e;
  }
  const dof = Object.keys(exp).length - 1;
  // chi-square critical value at p=0.999 for dof 4 is 18.47; be generous
  return chi2 < Math.max(18.47 * alpha999, dof * 3);
}

test('rollRarity distribution: 10k', () => {
  const n = 10_000;
  const obs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const t = rollRarity(DEFAULT_PROBABILITIES, new Set());
    obs[t] = (obs[t] ?? 0) + 1;
  }
  const exp: Record<string, number> = {};
  for (const [k, v] of Object.entries(DEFAULT_PROBABILITIES)) exp[k] = (n * v) / 100;
  assert.ok(chi2Ok(obs, exp), JSON.stringify({ obs, exp }));
});

test('rollRarity distribution: 100k', () => {
  const n = 100_000;
  const obs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const t = rollRarity(DEFAULT_PROBABILITIES, new Set());
    obs[t] = (obs[t] ?? 0) + 1;
  }
  const exp: Record<string, number> = {};
  for (const [k, v] of Object.entries(DEFAULT_PROBABILITIES)) exp[k] = (n * v) / 100;
  for (const k of Object.keys(exp)) {
    const tol = Math.max(0.02, 3 / Math.sqrt(exp[k])); // 3 sigma
    const ratio = obs[k] / exp[k];
    assert.ok(Math.abs(ratio - 1) < tol, `${k}: ${obs[k]} vs expected ${exp[k]} (ratio ${ratio}, tol ${tol})`);
  }
});

test('rollRarity distribution: 1M', () => {
  const n = 1_000_000;
  const obs: Record<string, number> = {};
  const probs = DEFAULT_PROBABILITIES;
  // precompute cumulative table the same way the service does
  const tiers = Object.keys(probs) as (keyof typeof probs)[];
  const weights = tiers.map((t) => probs[t]);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    const t = rollRarity(probs, new Set());
    obs[t] = (obs[t] ?? 0) + 1;
  }
  console.log('\n1M roll distribution:');
  for (const t of tiers) {
    const e = (n * probs[t]) / 100;
    const o = obs[t] ?? 0;
    const dev = ((o - e) / e) * 100;
    console.log(`  ${t.padEnd(12)} expected ${probs[t].toFixed(2)}%  observed ${((o / n) * 100).toFixed(3)}%  dev ${dev.toFixed(2)}%`);
    const tol = Math.max(0.005, 3 / Math.sqrt((n * probs[t]) / 100)) * 100; // 3 sigma
    assert.ok(Math.abs(dev) < tol, `${t} deviates ${dev}% (tol ${tol}%)`);
  }
});

test('rollRarity with empty tiers renormalizes', () => {
  const probs = { mil_spec: 0.7992, restricted: 0.1598, classified: 0.032, covert: 0.0064, rare_special: 0.0026 } as const;
  const empty = new Set(['rare_special', 'covert'] as const);
  const obs: Record<string, number> = {};
  for (let i = 0; i < 20_000; i++) {
    const t = rollRarity(probs, empty);
    obs[t] = (obs[t] ?? 0) + 1;
    assert.ok(!empty.has(t as never), 'must not roll empty tier');
  }
  // all mass should go to mil_spec + restricted
  const other = Object.entries(obs).filter(([k]) => !['mil_spec', 'restricted', 'classified'].includes(k));
  assert.equal(other.length, 0, JSON.stringify(obs));
});

test('rollFloat within bounds and uniform-ish', () => {
  const min = 0.1, max = 0.7;
  let sum = 0, below = 0, above = 0;
  const n = 50_000;
  for (let i = 0; i < n; i++) {
    const f = rollFloat(min, max);
    sum += f;
    if (f < min) below++;
    if (f > max) above++;
  }
  const mean = sum / n;
  assert.equal(below, 0);
  assert.equal(above, 0);
  assert.ok(Math.abs(mean - (min + max) / 2) < 0.005, `mean ${mean}`);
});

test('wearFromFloat boundaries', () => {
  assert.equal(wearFromFloat(0.0), 'Factory New');
  assert.equal(wearFromFloat(0.06), 'Factory New');
  assert.equal(wearFromFloat(0.14), 'Minimal Wear');
  assert.equal(wearFromFloat(0.15), 'Field-Tested');
  assert.equal(wearFromFloat(0.37), 'Field-Tested');
  assert.equal(wearFromFloat(0.38), 'Well-Worn');
  assert.equal(wearFromFloat(0.44), 'Well-Worn');
  assert.equal(wearFromFloat(0.999), 'Battle-Scarred');
  assert.equal(wearFromFloat(1.0), 'Battle-Scarred');
});

test('rollBool approx rate', () => {
  const n = 100_000;
  let hits = 0;
  for (let i = 0; i < n; i++) if (rollBool(0.1)) hits++;
  assert.ok(Math.abs(hits / n - 0.1) < 0.01, `${hits}/${n}`);
});

test('rollInt uniform over small range', () => {
  const obs = new Map<number, number>();
  const n = 60_000;
  for (let i = 0; i < n; i++) {
    const v = rollInt(6);
    obs.set(v, (obs.get(v) ?? 0) + 1);
  }
  assert.equal(obs.size, 6);
  for (const [k, v] of obs) assert.ok(Math.abs(v - n / 6) / (n / 6) < 0.05, `${k}: ${v}`);
});

test('makeSeed unique and 32 hex chars', () => {
  const s1 = makeSeed();
  const s2 = makeSeed();
  assert.match(s1, /^[0-9a-f]{32}$/);
  assert.notEqual(s1, s2);
});
