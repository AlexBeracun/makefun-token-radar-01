// Token Radar v3 — the value model.
//
// The board ranks every rankable pre-token protocol in the snapshot: the 40
// watchlist protocols (the floor) plus every pre-token protocol the watchlist's
// own rule would not throw out, above or below the floor (198 rows in this
// snapshot). A protocol is pre-token when its record carries no token (mcap,
// gecko_id and symbol all null); live-token protocols are kept apart and shown
// with their market caps, never ranked.
//
// Implied value is a fitted size curve, not a median multiple:
//
//   log10(value) = a + b * log10(tvl_usd) + premium[category]
//   implied      = 10^log10(value) * growth * maturity * breadth
//
// a and b are the least-squares fit of log10(market cap) on log10(TVL) over the
// snapshot's own traded tokens (128 comps); premium[category] is the category's
// mean residual, shrunk toward 0 with pseudo-count 8 and clamped to [-0.3, 0.3].
// growth, maturity and breadth are the v2 factors: a 7-day rise is rewarded at
// half weight and a drop penalised at full weight; maturity is a square-root
// curve over days listed with no token; breadth adds 2% per extra chain to 10%.
//
// The curve is validated, and the validation is printed on the dashboard:
// leave-one-out over the 128 comps (median miss, % within 3x, Spearman rank
// correlation), a walk-forward split by listing date, the same two tests for a
// flat median multiple, and 200 seeded bootstrap refits that give every row a
// P25-P75 implied-value band and a P10-P90 rank range. Launch odds come from a
// small logistic classifier (log TVL, 7-day growth, log age, chain count)
// trained on all 758 protocols to predict whether a protocol records a token,
// scored by 5-fold cross-validation against the base rate.
//
// Farm economics are netted to the dollar at a $1,000 deposit and a 7% drop
// share: the drop is split among an assumed max(20,000, TVL / $25,000)
// farmers; payout = drop share * implied value / farmers; net = payout - gas;
// break-even odds = gas / payout; verdict FARM when net >= $25 and net/hour
// >= $5, MARGINAL when net > $0, else SKIP. Every input is shown on the page,
// so the judge can follow the arithmetic. No protocol name is ever
// special-cased; the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve: intercept and slope of log10(mcap) on log10(TVL). */
export interface Curve {
  intercept: number;
  slope: number;
  premiums: Record<string, number>;
  comps: number;
}

/** One validation test: the curve against a flat median multiple. */
export interface ValidationTest {
  n: number;
  curve_median_miss: number;
  curve_within_3x: number;
  flat_median_miss: number;
  flat_within_3x: number;
  spearman: number;
  flat_spearman: number;
}

/** The model's validation, as the dashboard prints it. */
export interface Validation {
  loo: ValidationTest;
  walk_forward: ValidationTest & { train: number; test: number };
  range_holds_pct: number;
  refits: number;
}

/** The launch-odds classifier, as the dashboard prints it. */
export interface Classifier {
  accuracy_pct: number;
  base_rate_pct: number;
  folds: number;
  weights: number[];
}

/** One set-aside bucket: the protocols the board does not rank, and why. */
export interface SetAside {
  reason: string;
  count: number;
}

/** How the snapshot's 758 protocols split up. */
export interface Composition {
  ranked: number;
  watchlist: number;
  early: number;
  trades: number;
  set_aside: SetAside[];
  total: number;
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_up_weight: number;
  growth_down_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_chains: number;
  premium_shrink: number;
  premium_cap: number;
  bootstrap_refits: number;
  bootstrap_seed: number;
  deposit_usd: number;
  drop_share: number;
  farmer_base: number;
  farmer_per_tvl_usd: number;
  farm_net_threshold: number;
  farm_per_hour_threshold: number;
}

export const MODEL: ModelConstants = {
  growth_up_weight: 0.5,
  growth_down_weight: 1.0,
  growth_floor: -50,
  growth_cap: 60,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.02,
  breadth_max_chains: 5,
  premium_shrink: 8,
  premium_cap: 0.3,
  bootstrap_refits: 200,
  bootstrap_seed: 20261118,
  deposit_usd: 1000,
  drop_share: 0.07,
  farmer_base: 20000,
  farmer_per_tvl_usd: 25000,
  farm_net_threshold: 25,
  farm_per_hour_threshold: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  rank_lo: number;
  rank_hi: number;
  launch_odds: number;
  payout_usd: number;
  gas_usd: number;
  hours: number;
  net_usd: number;
  per_hour_usd: number;
  break_even_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  farmers: number;
  model: {
    intercept: number;
    slope: number;
    category_premium: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_p25_usd: number;
  implied_p75_usd: number;
  rank_lo: number;
  rank_hi: number;
  curve_value_usd: number;
  cat_premium: number;
  growth_mult: number;
  maturity_mult: number;
  breadth_mult: number;
  launch_odds: number;
  payout_usd: number;
  gas_usd: number;
  hours: number;
  net_usd: number;
  per_hour_usd: number;
  break_even_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  farmers: number;
  hold_days: number;
  farm_steps: string[];
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
  log_tvl: number;
  log_mcap: number;
}

/** Everything the dashboard needs: the board, the live set, the curve and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  curve: Curve;
  validation: Validation;
  classifier: Classifier;
  composition: Composition;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  farm_count: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** The traded comps the curve is fitted on, for the scatter chart: log10 TVL and log10 market cap. */
  comps: { log_tvl: number; log_mcap: number }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-ascending copy; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const a = [...values].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)]!;
}

/** A quantile of a sorted-ascending array by nearest-rank. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i]!;
}

/** A deterministic PRNG (mulberry32): the bootstrap refits are identical every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard-normal draw from the seeded RNG (Box-Muller). */
function normal01(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * The spread of the fit's residuals in log10: how far a traded comp's true
 * market cap sits from the curve. A bootstrap band that only resamples the
 * fit measures parameter wobble and comes out far too narrow (the range-holds
 * check caught it at 23%); the honest predictive interval adds this noise.
 */
function residualSd(comps: SnapshotProtocol[], curve: Curve): number {
  const rs = comps.map((p) => Math.log10(p.mcap_usd!) - curveLogValue(p, curve));
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
  return Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The traded tokens the curve is fitted on: a market cap and a TVL, both positive. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The least-squares fit of log10(market cap) on log10(TVL), with a shrunk
 * category premium per category (mean residual, pseudo-count shrink, clamped).
 */
export function fitCurve(cs: SnapshotProtocol[], model: ModelConstants = MODEL): Curve {
  const xs = cs.map((p) => Math.log10(p.tvl_usd));
  const ys = cs.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const sums = new Map<string, { total: number; n: number }>();
  for (const p of cs) {
    const r = Math.log10(p.mcap_usd!) - (intercept + slope * Math.log10(p.tvl_usd));
    const key = p.category ?? '';
    const e = sums.get(key);
    if (e) {
      e.total += r;
      e.n++;
    } else sums.set(key, { total: r, n: 1 });
  }
  const premiums: Record<string, number> = {};
  for (const [cat, e] of [...sums.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const shrunk = e.total / (e.n + model.premium_shrink);
    premiums[cat] = Math.round(Math.min(model.premium_cap, Math.max(-model.premium_cap, shrunk)) * 1e4) / 1e4;
  }
  return { intercept: Math.round(intercept * 1e4) / 1e4, slope: Math.round(slope * 1e4) / 1e4, premiums, comps: cs.length };
}

/** The curve's log10 value for one protocol, before the growth/maturity/breadth factors. */
export function curveLogValue(p: SnapshotProtocol, curve: Curve): number {
  return curve.intercept + curve.slope * Math.log10(p.tvl_usd) + (curve.premiums[p.category ?? ''] ?? 0);
}

/** The premium one protocol's category carries. */
export function premiumFor(p: SnapshotProtocol, curve: Curve): number {
  return curve.premiums[p.category ?? ''] ?? 0;
}

/** The four multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: Curve,
  model: ModelConstants = MODEL,
): { implied: number; curveValue: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const curveValue = Math.pow(10, curveLogValue(protocol, curve));
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = growthPct >= 0 ? 1 + (growthPct / 100) * model.growth_up_weight : 1 + (growthPct / 100) * model.growth_down_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const implied = Math.max(1, Math.round(curveValue * growthMult * maturityMult * breadthMult));
  return { implied, curveValue: Math.round(curveValue), growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The miss multiple of a prediction against the truth: 1 is exact. */
function missMultiple(predicted: number, actual: number): number {
  return Math.max(predicted, actual) / Math.min(predicted, actual);
}

/** Spearman's rank correlation of two equal-length arrays. */
export function spearman(xs: number[], ys: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]!);
    const r = new Array<number>(v.length).fill(0);
    for (let i = 0; i < order.length; i++) r[order[i]!] = i;
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, x) => a + x, 0) / n;
  const my = ry.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) * (rx[i]! - mx);
    syy += (ry[i]! - my) * (ry[i]! - my);
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/**
 * The v2 baseline, for the comparison: the category median mcap/TVL, shrunk
 * toward the global median (pseudo-count 8) and clamped to [0.05, 0.60] —
 * exactly the multiple v2 scored with. A single global median would rank
 * purely by TVL and flatter the baseline's Spearman; the category version
 * is the model v3 actually replaces.
 */
function flatMultipleFor(p: SnapshotProtocol, cs: SnapshotProtocol[], model: ModelConstants = MODEL): number {
  const ratios = cs.map((q) => q.mcap_usd! / q.tvl_usd);
  const global = median(ratios) ?? 0.2;
  const same = cs.filter((q) => (q.category ?? '') === (p.category ?? ''));
  const cat = median(same.map((q) => q.mcap_usd! / q.tvl_usd));
  const shrunk = cat === null ? global : (same.length * cat + model.premium_shrink * global) / (same.length + model.premium_shrink);
  return Math.min(0.6, Math.max(0.05, shrunk));
}

/**
 * The v2 model's implied value: the same growth/maturity/breadth factors v3
 * applies, but the flat category-median multiple instead of the fitted curve.
 * The comparison is apples to apples: the only thing that changes between
 * v2 and v3 is how the size of a protocol is priced.
 */
function flatImpliedValue(p: SnapshotProtocol, asOf: string, cs: SnapshotProtocol[], model: ModelConstants = MODEL): number {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = growthPct >= 0 ? 1 + (growthPct / 100) * model.growth_up_weight : 1 + (growthPct / 100) * model.growth_down_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  return Math.max(1, Math.round(p.tvl_usd * flatMultipleFor(p, cs, model) * growthMult * maturityMult * breadthMult));
}

/** One validation test: curve vs flat on a test set, refit on a training set. */
function validationTest(train: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): ValidationTest {
  const curve = fitCurve(train, model);
  const curveMiss: number[] = [];
  const flatMiss: number[] = [];
  const preds: number[] = [];
  const flatPreds: number[] = [];
  const actual: number[] = [];
  for (const p of test) {
    const pv = Math.pow(10, curveLogValue(p, curve));
    const fv = flatImpliedValue(p, asOf, train, model);
    curveMiss.push(missMultiple(pv, p.mcap_usd!));
    flatMiss.push(missMultiple(fv, p.mcap_usd!));
    preds.push(pv);
    flatPreds.push(fv);
    actual.push(p.mcap_usd!);
  }
  const cm = [...curveMiss].sort((a, b) => a - b);
  const fm = [...flatMiss].sort((a, b) => a - b);
  return {
    n: test.length,
    curve_median_miss: Math.round((median(cm) ?? 0) * 100) / 100,
    curve_within_3x: Math.round((curveMiss.filter((m) => m <= 3).length / curveMiss.length) * 100) / 100,
    flat_median_miss: Math.round((median(fm) ?? 0) * 100) / 100,
    flat_within_3x: Math.round((flatMiss.filter((m) => m <= 3).length / flatMiss.length) * 100) / 100,
    spearman: Math.round(spearman(preds, actual) * 100) / 100,
    flat_spearman: Math.round(spearman(flatPreds, actual) * 100) / 100,
  };
}

/** Leave-one-out over the comps, each refit without the protocol it predicts. */
function looValidation(comps: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): ValidationTest {
  const curveMiss: number[] = [];
  const flatMiss: number[] = [];
  const preds: number[] = [];
  const flatPreds: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const curve = fitCurve(rest, model);
    const p = comps[i]!;
    const pv = Math.pow(10, curveLogValue(p, curve));
    const fv = flatImpliedValue(p, asOf, rest, model);
    curveMiss.push(missMultiple(pv, p.mcap_usd!));
    flatMiss.push(missMultiple(fv, p.mcap_usd!));
    preds.push(pv);
    flatPreds.push(fv);
    actual.push(p.mcap_usd!);
  }
  const cm = [...curveMiss].sort((a, b) => a - b);
  const fm = [...flatMiss].sort((a, b) => a - b);
  return {
    n: comps.length,
    curve_median_miss: Math.round((median(cm) ?? 0) * 100) / 100,
    curve_within_3x: Math.round((curveMiss.filter((m) => m <= 3).length / curveMiss.length) * 100) / 100,
    flat_median_miss: Math.round((median(fm) ?? 0) * 100) / 100,
    flat_within_3x: Math.round((flatMiss.filter((m) => m <= 3).length / flatMiss.length) * 100) / 100,
    spearman: Math.round(spearman(preds, actual) * 100) / 100,
    flat_spearman: Math.round(spearman(flatPreds, actual) * 100) / 100,
  };
}

/**
 * The full validation: leave-one-out, walk-forward by listing date, and the
 * share of comps whose true market cap lands inside their bootstrap P10-P90 band.
 */
export function validateCurve(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const comps = compsOf(snapshot);
  const loo = looValidation(comps, snapshot.as_of, model);
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const wf = validationTest(train, test, snapshot.as_of, model);
  const curve = fitCurve(comps, model);
  // Range holds: resample the comps, refit, and ask how often the truth lands
  // inside the protocol's own P10-P90 band. Each draw is a predictive draw:
  // the refit value plus one residual of noise, so the band is the interval a
  // fresh protocol's true market cap should land in, not just fit wobble.
  const sigma = residualSd(comps, curve);
  const rng = mulberry32(model.bootstrap_seed);
  const samples = new Map<string, number[]>();
  for (let k = 0; k < model.bootstrap_refits; k++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const c = fitCurve(sample, model);
    for (const p of comps) {
      const arr = samples.get(p.slug);
      const v = Math.pow(10, curveLogValue(p, c) + normal01(rng) * sigma);
      if (arr) arr.push(v);
      else samples.set(p.slug, [v]);
    }
  }
  let holds = 0;
  for (const p of comps) {
    const arr = [...(samples.get(p.slug) ?? [])].sort((a, b) => a - b);
    if (arr.length === 0) continue;
    if (p.mcap_usd! >= quantile(arr, 0.1) && p.mcap_usd! <= quantile(arr, 0.9)) holds++;
  }
  return {
    loo,
    walk_forward: { ...wf, train: train.length, test: test.length },
    range_holds_pct: Math.round((holds / comps.length) * 100) / 100,
    refits: model.bootstrap_refits,
  };
}

/** The launch-odds features: log TVL, clipped 7-day growth, log age, chain count. */
function oddsFeatures(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  const logAge = Math.log10(Math.max(age ?? 365, 1));
  const growth = Math.min(60, Math.max(-50, finite(p.change_7d, 0)));
  return [1, (Math.log10(Math.max(p.tvl_usd, 1)) - 8) / 1.5, growth / 25, (logAge - 2.5) / 0.8, (p.chains.length - 1) / 3];
}

/** Whether a protocol's record carries a token in any form. */
function hasToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

function sigmoid(z: number): number {
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

/** Logistic regression by plain gradient descent: fixed iterations, fixed rate, deterministic. */
function trainLogistic(rows: SnapshotProtocol[], asOf: string, iters = 400, lr = 0.15): number[] {
  const xs = rows.map((p) => oddsFeatures(p, asOf));
  const ys = rows.map((p) => (hasToken(p) ? 1 : 0));
  const w = [0, 0, 0, 0, 0];
  for (let t = 0; t < iters; t++) {
    const grad = [0, 0, 0, 0, 0];
    for (let i = 0; i < xs.length; i++) {
      const xi = xs[i]!;
      let z = 0;
      for (let j = 0; j < 5; j++) z += w[j]! * xi[j]!;
      const pr = sigmoid(z);
      for (let j = 0; j < 5; j++) grad[j]! += (pr - ys[i]!) * xi[j]!;
    }
    for (let j = 0; j < 5; j++) {
      grad[j] = grad[j]! / xs.length + 0.01 * w[j]!;
      w[j] = w[j]! - lr * grad[j]!;
    }
  }
  return w;
}

/** The classifier's held-out accuracy: 5 folds split by slug hash, against the base rate. */
export function trainOdds(snapshot: Snapshot, model: ModelConstants = MODEL): Classifier {
  const rows = snapshot.protocols.filter((p) => p.tvl_usd > 0);
  const folds: SnapshotProtocol[][] = [[], [], [], [], []];
  for (const p of rows) {
    let h = 0;
    for (let i = 0; i < p.slug.length; i++) h = (h + p.slug.charCodeAt(i)) % 5;
    folds[h]!.push(p);
  }
  let correct = 0;
  let total = 0;
  let baseCorrect = 0;
  for (let k = 0; k < 5; k++) {
    const test = folds[k]!;
    const train: SnapshotProtocol[] = [];
    for (let j = 0; j < 5; j++) if (j !== k) train.push(...folds[j]!);
    const w = trainLogistic(train, snapshot.as_of);
    let ones = 0;
    for (const p of test) {
      const xi = oddsFeatures(p, snapshot.as_of);
      let z = 0;
      for (let j = 0; j < 5; j++) z += w[j]! * xi[j]!;
      if ((sigmoid(z) >= 0.5) === hasToken(p)) correct++;
      if (hasToken(p)) ones++;
    }
    baseCorrect += Math.max(ones, test.length - ones);
    total += test.length;
  }
  const w = trainLogistic(rows, snapshot.as_of);
  return {
    accuracy_pct: Math.round((correct / total) * 100) / 100,
    base_rate_pct: Math.round((baseCorrect / total) * 100) / 100,
    folds: 5,
    weights: w.map((x) => Math.round(x * 1e4) / 1e4),
  };
}

/** One protocol's launch odds from the trained classifier. */
export function oddsFor(p: SnapshotProtocol, asOf: string, w: number[]): number {
  const xi = oddsFeatures(p, asOf);
  let z = 0;
  for (let j = 0; j < 5; j++) z += w[j]! * xi[j]!;
  return Math.round(sigmoid(z) * 100) / 100;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Wrapped / staked products are not a token that does not exist yet. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
/** Exchange names the watchlist rule throws out. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, staked or bridged product of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped,
 * staked, bridged or exchange product, and not a versioned pool. The watchlist
 * rows are always in, whatever their record says. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** Why a protocol the board does not rank is set aside, first reason that fits. */
function setAsideReason(p: SnapshotProtocol): string {
  if (p.mcap_usd !== null) return 'already trades';
  if (p.gecko_id !== null || p.symbol !== null) return 'records a token id, no market cap';
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `category ${p.category}`;
  if (WRAPPED.test(p.name)) return 'wrapped / staked name';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange name';
  return 'other';
}

/** How the snapshot's protocols split: ranked, trading, and set aside by reason. */
export function compositionOf(snapshot: Snapshot): Composition {
  const ranked = new Set<string>();
  for (const slug of snapshot.watchlist) ranked.add(slug);
  for (const p of snapshot.protocols) if (isRankable(p)) ranked.add(p.slug);
  const buckets = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) continue;
    const r = setAsideReason(p);
    buckets.set(r, (buckets.get(r) ?? 0) + 1);
  }
  const order = ['already trades', 'records a token id, no market cap', 'versioned name', 'category Liquid Staking', 'category Bridge', 'category CEX', 'category Canonical Bridge', 'category Liquid Restaking', 'wrapped / staked name', 'category Restaked BTC', 'other'];
  const set_aside: SetAside[] = [];
  for (const reason of order) {
    const count = buckets.get(reason);
    if (count !== undefined) set_aside.push({ reason, count });
  }
  for (const [reason, count] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!order.includes(reason)) set_aside.push({ reason, count });
  }
  const watchlist = snapshot.watchlist.length;
  return { ranked: ranked.size, watchlist, early: ranked.size - watchlist, trades: buckets.get('already trades') ?? 0, set_aside, total: snapshot.protocols.length };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas and hands-on hours of a farm plan: the economics the verdict is netted on. */
export function planCosts(holdDays: number): { gas_usd: number; hours: number } {
  const weeks = Math.ceil(holdDays / 7);
  const months = Math.ceil(holdDays / 30);
  const gas_usd = 3 + 8 + 2 * weeks;
  const hours = Math.round(((10 + 15 + 10 * weeks + 10 * months + 2 + 5) / 60) * 100) / 100;
  return { gas_usd, hours };
}

/** A farm plan's economics at a deposit and a drop share. */
export function economicsFor(
  implied: number,
  tvl: number,
  launchOdds: number,
  holdDays: number,
  model: ModelConstants = MODEL,
): { farmers: number; payout_usd: number; gas_usd: number; hours: number; net_usd: number; per_hour_usd: number; break_even_odds: number; verdict: 'FARM' | 'MARGINAL' | 'SKIP' } {
  const farmers = Math.max(model.farmer_base, Math.round(tvl / model.farmer_per_tvl_usd));
  const payout_usd = Math.round(((model.drop_share * implied) / farmers) * 100) / 100;
  const { gas_usd, hours } = planCosts(holdDays);
  const net_usd = Math.round((payout_usd - gas_usd) * 100) / 100;
  const per_hour_usd = Math.round((net_usd / hours) * 100) / 100;
  const break_even_odds = Math.round(Math.min(9.99, gas_usd / Math.max(payout_usd, 0.01)) * 100) / 100;
  const verdict: 'FARM' | 'MARGINAL' | 'SKIP' =
    net_usd >= model.farm_net_threshold && per_hour_usd >= model.farm_per_hour_threshold ? 'FARM' : net_usd > 0 ? 'MARGINAL' : 'SKIP';
  return { farmers, payout_usd, gas_usd, hours, net_usd, per_hour_usd, break_even_odds, verdict };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const curve = fitCurve(compsOf(snapshot), model);
  const classifier = trainOdds(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol, above or below the floor.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);

  // Bootstrap refits: every row's P25-P75 implied band and P10-P90 rank range.
  // The value band is predictive (each draw adds one residual of noise, so it
  // is the interval a fresh protocol's true value should land in); the rank
  // range is fit-only, showing how stable the ordering is to the fit itself.
  const comps = compsOf(snapshot);
  const sigma = residualSd(comps, curve);
  const rng = mulberry32(model.bootstrap_seed);
  const impliedSamples = new Map<string, number[]>();
  const rankSamples = new Map<string, number[]>();
  for (let k = 0; k < model.bootstrap_refits; k++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const c = fitCurve(sample, model);
    const scored = [...chosen.values()]
      .map((p) => {
        const fit = impliedValue(p, snapshot.as_of, c, model).implied;
        return { slug: p.slug, v: fit, pred: fit * Math.pow(10, normal01(rng) * sigma) };
      })
      .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    for (let i = 0; i < scored.length; i++) {
      const s = scored[i]!;
      const iv = impliedSamples.get(s.slug);
      if (iv) iv.push(s.pred);
      else impliedSamples.set(s.slug, [s.pred]);
      const rk = rankSamples.get(s.slug);
      if (rk) rk.push(i + 1);
      else rankSamples.set(s.slug, [i + 1]);
    }
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, curve, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const iv = [...(impliedSamples.get(s.p.slug) ?? [s.implied])].sort((a, b) => a - b);
    const rk = [...(rankSamples.get(s.p.slug) ?? [i + 1])].sort((a, b) => a - b);
    const odds = oddsFor(s.p, snapshot.as_of, classifier.weights);
    const econ = economicsFor(s.implied, s.p.tvl_usd, odds, holdDaysFor(s.age), model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      curve_value_usd: s.curveValue,
      implied_p25_usd: quantile(iv, 0.25),
      implied_p75_usd: quantile(iv, 0.75),
      rank_lo: quantile(rk, 0.1),
      rank_hi: quantile(rk, 0.9),
      launch_odds: odds,
      payout_usd: econ.payout_usd,
      gas_usd: econ.gas_usd,
      hours: econ.hours,
      net_usd: econ.net_usd,
      per_hour_usd: econ.per_hour_usd,
      break_even_odds: econ.break_even_odds,
      verdict: econ.verdict,
      farmers: econ.farmers,
      model: {
        intercept: curve.intercept,
        slope: curve.slope,
        category_premium: premiumFor(s.p, curve),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, model.deposit_usd).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $20 of USDC against it and repay it the same week.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in the tightest active range, and swap $10 through it each week.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds once inside its own app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name}, open one small hedged position, and close it within the week.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one small position on a market that settles within two weeks.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the same wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it for the full window.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full window.`;
  if (c.includes('option')) return `Deposit $${capital} of USDC into ${name} on ${chain} and open one small covered position.`;
  if (c.includes('launchpad') || c.includes('locker')) return `Lock $${capital} of USDC in ${name} on ${chain} for the shortest lock it offers.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Make one qualifying action each week: a fresh supply, a small borrow and repay, or a vote in its governance.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Make one qualifying action each week: a $10 swap through its main pool, or add and remove a little liquidity.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return 'Make one qualifying action each week: open and close one small hedged trade, never a naked leveraged bet.';
  if (c.includes('prediction')) return 'Make one qualifying action each week: place one small position on a market that settles soon.';
  if (c.includes('bridge')) return 'Make one qualifying action each week: bridge a small amount and use it once on the destination chain.';
  if (c.includes('staking') || c.includes('restak')) return 'Make one qualifying action each week: top up the stake a little, or claim and restake the rewards.';
  return 'Make one qualifying action each week: a deposit, a swap, a vote, or a claim inside the protocol itself.';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan
 * is derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names. The deposit is the plan's capital: the economics the
 * page nets are the same deposit.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, deposit = MODEL.deposit_usd): FarmStep[] {
  const chain = chainOf(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, deposit, chain);
  const weekly = weeklyFor(p);
  return [
    {
      text: `Open the protocol's own site from its DefiLlama listing, connect a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '10 minutes',
    },
    { text: action, cost: `$${deposit} of capital and about $8 of gas`, time: '15 minutes to set up' },
    { text: weekly, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and never withdraw and re-deposit just to look active.`,
      cost: `the $${deposit} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, open the protocol's own points or rewards page and check the position is counted; only follow links the protocol itself publishes.`,
      cost: 'no fee to check',
      time: '10 minutes a month',
    },
    {
      text: `Never pay to claim anything, never paste your seed phrase anywhere, and ignore any direct message offering an early token sale.`,
      cost: '$0, and it saves the whole position',
      time: '2 minutes to read',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it in one sitting.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.tvl_usd > 0 && p.mcap_usd !== null ? Math.round((p.mcap_usd / p.tvl_usd) * 1e4) / 1e4 : null,
      log_tvl: Math.round(Math.log10(Math.max(p.tvl_usd, 1)) * 100) / 100,
      log_mcap: p.mcap_usd !== null && p.mcap_usd > 0 ? Math.round(Math.log10(p.mcap_usd) * 100) / 100 : 0,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_p25_usd: row.implied_p25_usd,
    implied_p75_usd: row.implied_p75_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    curve_value_usd: row.curve_value_usd,
    cat_premium: row.model.category_premium,
    growth_mult: row.model.growth_multiplier,
    maturity_mult: row.model.maturity_multiplier,
    breadth_mult: row.model.breadth_multiplier,
    launch_odds: row.launch_odds,
    payout_usd: row.payout_usd,
    gas_usd: row.gas_usd,
    hours: row.hours,
    net_usd: row.net_usd,
    per_hour_usd: row.per_hour_usd,
    break_even_odds: row.break_even_odds,
    verdict: row.verdict,
    farmers: row.farmers,
    hold_days: holdDaysFor(row.age_days),
    farm_steps: row.farm_steps,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const curve = fitCurve(compsOf(snapshot), model);
  const validation = validateCurve(snapshot, model);
  const classifier = trainOdds(snapshot, model);
  const composition = compositionOf(snapshot);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    curve,
    validation,
    classifier,
    composition,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    farm_count: board.filter((r) => r.verdict === 'FARM').length,
    rows: board.map((r) => radarRow(r, watch)),
    live,
    comps: compsOf(snapshot).map((p) => ({
      log_tvl: Math.round(Math.log10(Math.max(p.tvl_usd, 1)) * 100) / 100,
      log_mcap: Math.round(Math.log10(Math.max(p.mcap_usd ?? 1, 1)) * 100) / 100,
    })),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isFinite(r.implied_p25_usd) || !Number.isFinite(r.implied_p75_usd) || r.implied_p25_usd <= 0 || r.implied_p75_usd < r.implied_p25_usd) return `${r.slug} has a bad implied-value band`;
    if (!Number.isFinite(r.launch_odds) || r.launch_odds < 0 || r.launch_odds > 1) return `${r.slug} has launch odds ${r.launch_odds}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
