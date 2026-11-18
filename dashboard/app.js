// Token Radar v4 — a static dashboard over the sealed snapshot (as_of 2026-11-14).
// No framework, no network: every number below is computed in lib/model.ts
// from the snapshot and shipped in data.js. The page never invents data.
//
// What changed from v3: the launch-odds classifier gained two features —
// log TVL relative to the category median, and the category's token rate
// (shrunk toward the global rate). Both are computed from the training rows
// only, so a held-out fold never feeds its own features. Held-out accuracy
// rose from 62% to 64% against a 57% base rate. The value curve is unchanged
// (richer fits were tested and did not beat it on leave-one-out). Farm plans
// are now written for the protocol: every step names it, its chain, or the
// plan's own net, odds and verdict, and the last step states what the loss is
// if the token never launches (the gas and fees — the deposit stays yours).
// The FARM verdict now also requires launch odds ≥ break-even odds, so a FARM
// row is worth doing in expectation, not just big on paper.

const DATA = window.RADAR;

const state = {
  q: '',
  p: 'board', // board | live
  category: 'all',
  chain: 'all',
  sort: 'rank',
  dir: 1,
  sel: null,
  watch: false,
  early: false,
  verdict: 'all',
  deposit: 1000,
  share: 0.07,
};
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtUsd(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  const u = a >= 1e9 ? ['B', 1e9] : a >= 1e6 ? ['M', 1e6] : a >= 1e3 ? ['K', 1e3] : ['', 1];
  return (n < 0 ? '−$' : '$') + (a / u[1]).toFixed(a / u[1] >= 100 ? 0 : a / u[1] >= 10 ? 1 : 2) + u[0];
}
function fmtSigned(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n < 0 ? '−$' : n > 0 ? '+$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  // change_7d arrives in percent units already (DefiLlama): -2.19 means -2.19%, not -219%.
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function fmtAge(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(0)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
function fmtOdds(o) {
  return o === null || o === undefined ? '—' : `${Math.round(o * 100)}%`;
}
function fmtMult(x) {
  return `×${x.toFixed(2)}`;
}

/** Farm economics at the selected deposit and drop share, scaled off the $1,000 / 7% base in data.js. */
function econ(r) {
  const payout = r.payout_usd * (state.deposit / 1000) * (state.share / 0.07);
  const net = payout - r.gas_usd;
  const perHour = net / r.hours;
  const verdict = net >= 25 && perHour >= 5 && r.launch_odds >= r.gas_usd / payout ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return { payout, net, perHour, breakEven: r.gas_usd / payout, verdict };
}

function sortRows(rows) {
  const k = state.sort;
  const val = (r) => (k === 'odds' ? r.launch_odds : k === 'net' ? econ(r).net : k === 'age' ? r.age_days ?? -1 : r[k]);
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * state.dir;
  });
}

function filteredRows() {
  let rows = DATA.rows;
  if (state.watch) rows = rows.filter((r) => r.watchlist);
  if (state.early) rows = rows.filter((r) => !r.watchlist);
  if (state.verdict !== 'all') rows = rows.filter((r) => econ(r).verdict === state.verdict);
  if (state.category !== 'all') rows = rows.filter((r) => (r.category ?? 'Other') === state.category);
  if (state.chain !== 'all') rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }
  return sortRows(rows);
}

function th(label, key) {
  const active = state.sort === key;
  const arrow = active ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
  return `<th class="${active ? 'sort-active' : ''}"><button type="button" onclick="setSort('${key}')">${label}${arrow}</button></th>`;
}

function verdictPill(v) {
  return `<span class="verdict v-${v.toLowerCase()}">${v}</span>`;
}

function boardTable(rows) {
  if (!rows.length) return '<p class="empty">No protocols match these filters.</p>';
  const body = rows
    .map((r) => {
      const e = econ(r);
      return `<tr class="${r.watchlist ? 'is-watch' : ''}" onclick="selectRow('${r.slug}')">
      <td class="num">${r.rank}</td>
      <td><div class="pname">${esc(r.name)}${r.watchlist ? ' <span class="wtag">watchlist</span>' : ''}</div><div class="psub">${esc(r.slug)} · ${esc(r.category ?? 'Other')}</div></td>
      <td class="num">${fmtUsd(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtAge(r.age_days)}</td>
      <td class="num">${fmtOdds(r.launch_odds)}</td>
      <td class="num"><strong>${fmtUsd(r.implied_value_usd)}</strong><div class="band">${fmtUsd(r.implied_p25_usd)}–${fmtUsd(r.implied_p75_usd)} · #${r.rank_lo}–${r.rank_hi}</div></td>
      <td class="num ${e.net >= 0 ? 'up' : 'down'}">${fmtSigned(e.net)}</td>
      <td>${verdictPill(e.verdict)}<div class="band">${fmtSigned(e.perHour)}/h</div></td>
    </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="board">
    <thead><tr>${th('Rank', 'rank')}<th>Protocol</th>${th('TVL', 'tvl_usd')}${th('7d', 'change_7d')}${th('Tracked', 'age_days')}${th('Launch odds', 'odds')}${th('Implied value', 'implied_value_usd')}${th('Net of fees', 'net')}<th>Verdict</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="table-note">${rows.length} rows · implied value is the fitted curve, not a price target · the band is the P25–P75 predictive range over 200 refits and #a–b is the P10–P90 rank range across those refits (fit uncertainty only) · net of fees is the ${fmtUsd(state.deposit)}-deposit plan at a ${Math.round(state.share * 100)}% drop share.</p>`;
}

function liveTable() {
  const body = DATA.live
    .map(
      (r, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><div class="pname">${esc(r.name)}</div><div class="psub">${esc(r.slug)} · ${esc(r.category ?? 'Other')}</div></td>
      <td class="num">${fmtUsd(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtUsd(r.mcap_usd)}</td>
      <td class="num"><strong>${r.ratio === null ? '—' : fmtMult(r.ratio)}</strong></td>
    </tr>`,
    )
    .join('');
  const prem = Object.entries(DATA.curve.premiums)
    .map(([cat, p]) => {
      const pct = Math.round((10 ** p - 1) * 100);
      return `<li><span>${esc(cat)}</span><strong class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct}%</strong></li>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="board">
    <thead><tr><th>Rank</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Market cap</th><th>mcap / TVL</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="table-note">The 24 largest traded protocols by market cap. Their mcap / TVL ratios are the comps the fitted curve is checked against; the full fit uses ${DATA.curve.comps} comps.</p>
    <div class="panel"><h2>Category premiums</h2><p>Mean residual of the curve per category, shrunk toward zero and capped at ±0.3 in log10 (about ×2.0 / ×0.5). A premium above zero means traded protocols in that category sit above the curve.</p><ul class="premiums">${prem}</ul></div>`;
}

/** Log-log scatter: traded comps (blue, actual mcap) vs ranked rows (orange, implied value) and the fitted curve. */
function scatter() {
  const W = 920;
  const H = 300;
  const L = 52;
  const R = 14;
  const T = 14;
  const B = 26;
  const x0 = 6.7;
  const x1 = 10.6;
  const y0 = 5.0;
  const y1 = 11.2;
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y) => T + ((y1 - y) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let x = 7; x <= 10; x++) {
    g += `<line x1="${X(x)}" y1="${T}" x2="${X(x)}" y2="${H - B}" class="grid"/><text x="${X(x)}" y="${H - 8}" class="axis">$${x === 7 ? '10M' : x === 8 ? '100M' : x === 9 ? '1B' : '10B'}</text>`;
  }
  for (let y = 6; y <= 11; y++) {
    g += `<line x1="${L}" y1="${Y(y)}" x2="${W - R}" y2="${Y(y)}" class="grid"/><text x="${L - 6}" y="${Y(y) + 4}" class="axis" text-anchor="end">$${y === 6 ? '1M' : y === 7 ? '10M' : y === 8 ? '100M' : y === 9 ? '1B' : y === 10 ? '10B' : '100B'}</text>`;
  }
  const a = DATA.curve.intercept;
  const b = DATA.curve.slope;
  const cx0 = Math.max(x0, (y0 - a) / b);
  const cx1 = Math.min(x1, (y1 - a) / b);
  const line = `<line x1="${X(cx0)}" y1="${Y(a + b * cx0)}" x2="${X(cx1)}" y2="${Y(a + b * cx1)}" class="curve"/>`;
  const comps = DATA.comps
    .map((c) => `<circle cx="${X(c.log_tvl).toFixed(1)}" cy="${Y(c.log_mcap).toFixed(1)}" r="2.6" class="dot-comp"/>`)
    .join('');
  const rows = DATA.rows
    .map((r) => `<circle cx="${X(Math.log10(Math.max(r.tvl_usd, 1))).toFixed(1)}" cy="${Y(Math.log10(Math.max(r.implied_value_usd, 1))).toFixed(1)}" r="2.2" class="dot-row"/>`)
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="scatter" role="img" aria-label="Log-log scatter of market cap against TVL: traded comps in blue, ranked pre-token protocols in orange, fitted curve in green">
    ${g}${line}${comps}${rows}
    <text x="${W - R}" y="${T + 12}" class="axis-label" text-anchor="end">market cap (log)</text>
    <text x="${W - R}" y="${H - 8}" class="axis" text-anchor="end">TVL (log) →</text>
  </svg>
  <p class="legend"><span class="sw comp"></span> traded comp, actual mcap · <span class="sw row"></span> ranked pre-token, implied value · <span class="sw curve"></span> fitted curve log10(mcap) = ${a} + ${b}·log10(TVL)</p>`;
}

function methodPanel() {
  const v = DATA.validation;
  const c = DATA.classifier;
  const setAsideTotal = DATA.composition.set_aside.reduce((s, x) => s + x.count, 0);
  return `<section class="panel" id="method">
    <h2>How the model works — and where it was tested</h2>
    <p><strong>The curve.</strong> log10(mcap) = ${DATA.curve.intercept} + ${DATA.curve.slope}·log10(TVL), fitted on ${DATA.curve.comps} traded protocols (mcap &gt; 0) from the snapshot. Each category then gets a premium — the mean residual of its comps, shrunk toward zero with a pseudo-count of 8 and capped at ±0.3 in log10 — so a category that trades above the curve lifts its rows. On top of the curve: 7-day growth (up at half speed, down at full speed, −50% to +60%), maturity (0.60 + 0.40·√(age / 3y), unknown age = 1y), and breadth (1 + 2% per extra chain, up to 10%). Implied value = TVL × curve × premium × growth × maturity × breadth.</p>
    ${scatter()}
    <table class="valid"><thead><tr><th>Test</th><th>Curve</th><th>Flat median multiple (v2)</th><th>What it means</th></tr></thead><tbody>
      <tr><td>Leave-one-out, ${DATA.curve.comps} comps</td><td>median miss ×${v.loo.curve_median_miss} · ${Math.round(v.loo.curve_within_3x * 100)}% within 3× · Spearman ${v.loo.spearman}</td><td>median miss ×${v.loo.flat_median_miss} · ${Math.round(v.loo.flat_within_3x * 100)}% within 3× · Spearman ${v.loo.flat_spearman}</td><td>Each comp is priced by a curve fitted without it. The curve misses by less than the flat multiple on every measure.</td></tr>
      <tr><td>Walk-forward (fit 47 older, test 48 newer by listed date)</td><td>median miss ×${v.walk_forward.curve_median_miss} · ${Math.round(v.walk_forward.curve_within_3x * 100)}% within 3×</td><td>median miss ×${v.walk_forward.flat_median_miss} · ${Math.round(v.walk_forward.flat_within_3x * 100)}% within 3×</td><td>The curve was fitted on older launches and tested on newer ones — the same direction a radar is actually used.</td></tr>
      <tr><td>Predictive value bands</td><td>${Math.round(v.range_holds_pct * 100)}% of comps' true market caps land inside their P10–P90 band</td><td>—</td><td>200 seeded refits of the curve; each draw adds one residual of noise, so the band is the interval a fresh protocol's true value should land in. It is honest if comps fall inside it about 80% of the time.</td></tr>
      <tr><td>Launch odds (will it ever list a token?)</td><td>${Math.round(c.accuracy_pct * 100)}% held-out accuracy</td><td>${Math.round(c.base_rate_pct * 100)}% base rate</td><td>Logistic classifier on log TVL, clipped 7d growth, log age, chain count, TVL relative to the category median, and the category's token rate (shrunk toward the global rate), 5-fold cross-validated. Better than guessing, far from certain — treat odds as a ranking aid, not a forecast.</td></tr>
    </tbody></table>
    <p><strong>Farm economics, netted to the dollar.</strong> Deposit ${fmtUsd(state.deposit)}, drop share ${Math.round(state.share * 100)}% of the implied value, split over farmers = max(20,000, TVL / $25,000). Gas is $3 to enter + $8 to exit + $2 a week over the hold. Hours are the steps below. Net = payout − gas. Verdict: <strong>FARM</strong> if net ≥ $25, net/hour ≥ $5, and launch odds ≥ break-even odds, <strong>MARGINAL</strong> if net &gt; $0, otherwise <strong>SKIP</strong>. At the $1,000 / 7% defaults, ${DATA.farm_count} of ${DATA.rows.length} rows are FARM. Change the deposit or the drop share above and every net, verdict and count on this page updates.</p>
    <p><strong>Coverage.</strong> ${DATA.composition.ranked} protocols are ranked (the ${DATA.watchlist_size} watchlist protocols plus ${DATA.composition.early} early protocols below the $50M floor). The other ${setAsideTotal} protocols in the snapshot are set aside: ${DATA.composition.set_aside.map((s) => `${esc(s.reason)} ${s.count}`).join(', ')}. Every protocol in the snapshot is accounted for: ${DATA.composition.ranked} + ${setAsideTotal} = ${DATA.composition.total}.</p>
    <p class="limits"><strong>Limits.</strong> The snapshot is sealed at ${DATA.as_of}; nothing here is live data. Implied values are model estimates with a typical miss of ×${DATA.validation.loo.curve_median_miss} — a row at $100M could plausibly be worth $25M or $400M. Launch odds come from the same snapshot, not from news or team quality. Farm plans assume the token launches and the drop happens; they do not price smart-contract risk or the time a launch takes.</p>
  </section>`;
}

function hero() {
  const total = DATA.rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const farm = DATA.rows.filter((r) => econ(r).verdict === 'FARM').length;
  const comp = DATA.composition;
  const segs = [
    { label: 'Ranked', n: comp.ranked, color: '#16a34a' },
    ...comp.set_aside.map((s, i) => ({ label: s.reason, n: s.count, color: i === 0 ? '#94a3b8' : '#cbd5e1' })),
  ];
  const bar = segs
    .map((s) => `<div class="seg" style="width:${(s.n / comp.total) * 100}%;background:${s.color}" title="${esc(s.label)}: ${s.n}"></div>`)
    .join('');
  const legend = segs.map((s) => `<span><strong>${s.n}</strong> ${esc(s.label)}</span>`).join(' · ');
  return `<header class="hero">
    <div class="hero-top"><div><h1>Token Launch Radar</h1><p class="lede">Which pre-token protocols are worth watching — and worth farming — priced off the traded market, not off a name list.</p></div><div class="asof">Snapshot ${DATA.as_of}<br>${comp.total} protocols · ${DATA.watchlist_size} on the watchlist</div></div>
    <div class="facts">
      <div class="fact"><span>Ranked</span><strong>${DATA.rows.length}</strong><small>watchlist ${DATA.watchlist_size} + early ${DATA.composition.early}</small></div>
      <div class="fact"><span>Total implied value</span><strong>${fmtUsd(total)}</strong><small>sum of all ranked rows</small></div>
      <div class="fact"><span>Leave-one-out miss</span><strong>×${DATA.validation.loo.curve_median_miss}</strong><small>flat median multiple: ×${DATA.validation.loo.flat_median_miss}</small></div>
      <div class="fact"><span>Value bands hold</span><strong>${Math.round(DATA.validation.range_holds_pct * 100)}%</strong><small>of comps inside P10–P90</small></div>
      <div class="fact"><span>Launch odds accuracy</span><strong>${Math.round(DATA.classifier.accuracy_pct * 100)}%</strong><small>base rate ${Math.round(DATA.classifier.base_rate_pct * 100)}%</small></div>
      <div class="fact"><span>Worth farming</span><strong>${farm} FARM</strong><small>at ${fmtUsd(state.deposit)} · ${Math.round(state.share * 100)}% drop share</small></div>
    </div>
    <div class="compbar">${bar}</div>
    <p class="comp-legend">${legend}</p>
  </header>`;
}

function controls() {
  const cats = [...new Set(DATA.rows.map((r) => r.category ?? 'Other'))].sort();
  const chains = [...new Set(DATA.rows.flatMap((r) => r.chains))].sort();
  const counts = { all: DATA.rows.length, FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const r of DATA.rows) counts[econ(r).verdict]++;
  const vchip = (v, label) => `<button type="button" class="chip${state.verdict === v ? ' active' : ''}" onclick="setVerdict('${v}')">${label} (${counts[v] ?? counts.all})</button>`;
  return `<section class="controls">
    <div class="tabs" role="tablist">
      <button type="button" class="${state.p === 'board' ? 'active' : ''}" onclick="setTab('board')">Pre-token radar</button>
      <button type="button" class="${state.p === 'live' ? 'active' : ''}" onclick="setTab('live')">Live tokens · comps</button>
    </div>
    <div class="fields">
      <label class="field grow">Search<input type="search" value="${esc(state.q)}" placeholder="Name or slug…" oninput="setQ(this.value)"></label>
      <label class="field">Category<select onchange="setCategory(this.value)"><option value="all">All categories</option>${cats.map((c) => `<option value="${esc(c)}"${state.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Chain<select onchange="setChain(this.value)"><option value="all">All chains</option>${chains.map((c) => `<option value="${esc(c)}"${state.chain === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Deposit<select onchange="setDeposit(this.value)"><option value="1000"${state.deposit === 1000 ? ' selected' : ''}>$1,000</option><option value="10000"${state.deposit === 10000 ? ' selected' : ''}>$10,000</option></select></label>
      <label class="field">Drop share<select onchange="setShare(this.value)"><option value="0.035"${state.share === 0.035 ? ' selected' : ''}>3.5%</option><option value="0.07"${state.share === 0.07 ? ' selected' : ''}>7%</option><option value="0.14"${state.share === 0.14 ? ' selected' : ''}>14%</option></select></label>
    </div>
    <div class="chips">
      <button type="button" class="chip${!state.watch && !state.early ? ' active' : ''}" onclick="setScope('all')">All ${DATA.rows.length}</button>
      <button type="button" class="chip${state.watch ? ' active' : ''}" onclick="setScope('watch')">Watchlist ${DATA.watchlist_size}</button>
      <button type="button" class="chip${state.early ? ' active' : ''}" onclick="setScope('early')">Early ${DATA.composition.early}</button>
      <span class="chip-sep"></span>
      ${vchip('all', 'All verdicts')}${vchip('FARM', 'FARM')}${vchip('MARGINAL', 'MARGINAL')}${vchip('SKIP', 'SKIP')}
    </div>
  </section>`;
}

function detailDialog() {
  const r = DATA.rows.find((x) => x.slug === state.sel);
  if (!r) return '';
  const e = econ(r);
  const steps = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
  return `<dialog id="detail" class="detail">
    <div class="detail-head"><div><h2>${esc(r.name)}</h2><p>${esc(r.slug)} · ${esc(r.category ?? 'Other')} · ${r.chains.map(esc).join(', ')}</p></div><button type="button" class="close" onclick="closeDetail()" aria-label="Close">✕</button></div>
    <div class="detail-grid">
      <div>
        <h3>How the value is built</h3>
        <table class="arith"><tbody>
          <tr><td>TVL</td><td class="num">${fmtUsd(r.tvl_usd)}</td></tr>
          <tr><td>Curve value 10^(${DATA.curve.intercept} + ${DATA.curve.slope}·log10 TVL)</td><td class="num">${fmtUsd(r.curve_value_usd)}</td></tr>
          <tr><td>Category premium (${esc(r.category ?? 'Other')})</td><td class="num">${fmtMult(10 ** r.cat_premium)}</td></tr>
          <tr><td>7d growth ${fmtPct(r.change_7d)}</td><td class="num">${fmtMult(r.growth_mult)}</td></tr>
          <tr><td>Maturity (${fmtAge(r.age_days)} tracked)</td><td class="num">${fmtMult(r.maturity_mult)}</td></tr>
          <tr><td>Breadth (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'})</td><td class="num">${fmtMult(r.breadth_mult)}</td></tr>
          <tr class="total"><td>Implied value</td><td class="num"><strong>${fmtUsd(r.implied_value_usd)}</strong></td></tr>
          <tr><td>P25–P75 band (200 predictive refits)</td><td class="num">${fmtUsd(r.implied_p25_usd)}–${fmtUsd(r.implied_p75_usd)}</td></tr>
          <tr><td>Rank range (P10–P90, fit only)</td><td class="num">#${r.rank_lo}–${r.rank_hi}</td></tr>
        </tbody></table>
        <h3>Launch odds</h3>
        <div class="oddsbar"><div style="width:${Math.round(r.launch_odds * 100)}%"></div></div>
        <p class="muted">${fmtOdds(r.launch_odds)} chance this protocol ever lists a token, from the classifier (log TVL, 7d growth, age, chain count, TVL vs its category median, category token rate). ${Math.round(DATA.classifier.accuracy_pct * 100)}% held-out accuracy vs a ${Math.round(DATA.classifier.base_rate_pct * 100)}% base rate — a ranking aid, not a forecast.</p>
      </div>
      <div>
        <h3>Farm plan — netted at ${fmtUsd(state.deposit)} · ${Math.round(state.share * 100)}% drop share</h3>
        <table class="arith"><tbody>
          <tr><td>Farmers sharing the drop</td><td class="num">${r.farmers.toLocaleString('en-US')}</td></tr>
          <tr><td>Payout if it launches</td><td class="num">${fmtSigned(e.payout)}</td></tr>
          <tr><td>Gas (${r.hold_days} days: $3 + $8 + $2/week)</td><td class="num">−$${r.gas_usd}</td></tr>
          <tr><td>Hold</td><td class="num">${r.hold_days} days · ${r.hours}h work</td></tr>
          <tr class="total"><td>Net of fees</td><td class="num"><strong class="${e.net >= 0 ? 'up' : 'down'}">${fmtSigned(e.net)}</strong></td></tr>
          <tr><td>Net per hour</td><td class="num">${fmtSigned(e.perHour)}/h</td></tr>
          <tr><td>Break-even odds</td><td class="num">${Math.round(e.breakEven * 100)}% launch chance covers gas</td></tr>
          <tr><td>Verdict</td><td class="num">${verdictPill(e.verdict)}</td></tr>
        </tbody></table>
        <h3>Steps</h3>
        <ol class="steps">${steps}</ol>
        <p class="muted">Steps are written for the $1,000 deposit; at another deposit, scale the amounts by the same factor. A plan is only worth doing if the launch odds beat the break-even odds and the verdict is FARM.</p>
      </div>
    </div>
  </dialog>`;
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.q = h.get('q') ?? '';
  state.p = h.get('p') === 'live' ? 'live' : 'board';
  state.category = h.get('category') ?? 'all';
  state.chain = h.get('chain') ?? 'all';
  state.sort = h.get('sort') ?? 'rank';
  state.dir = h.get('dir') === '-1' ? -1 : 1;
  state.sel = h.get('sel');
  state.watch = h.get('watch') === '1';
  state.early = h.get('early') === '1';
  state.verdict = ['all', 'FARM', 'MARGINAL', 'SKIP'].includes(h.get('verdict')) ? h.get('verdict') : 'all';
  state.deposit = h.get('deposit') === '10000' ? 10000 : 1000;
  state.share = ['0.035', '0.07', '0.14'].includes(h.get('share')) ? Number(h.get('share')) : 0.07;
}
function writeHash() {
  const h = new URLSearchParams();
  if (state.q) h.set('q', state.q);
  if (state.p !== 'board') h.set('p', state.p);
  if (state.category !== 'all') h.set('category', state.category);
  if (state.chain !== 'all') h.set('chain', state.chain);
  if (state.sort !== 'rank') h.set('sort', state.sort);
  if (state.dir !== 1) h.set('dir', String(state.dir));
  if (state.sel) h.set('sel', state.sel);
  if (state.watch) h.set('watch', '1');
  if (state.early) h.set('early', '1');
  if (state.verdict !== 'all') h.set('verdict', state.verdict);
  if (state.deposit !== 1000) h.set('deposit', String(state.deposit));
  if (state.share !== 0.07) h.set('share', String(state.share));
  const next = h.toString();
  history.replaceState(null, '', next ? `#${next}` : location.pathname);
}

window.setSort = (k) => {
  if (state.sort === k) state.dir = -state.dir;
  else {
    state.sort = k;
    state.dir = k === 'rank' ? 1 : -1;
  }
  render();
};
window.setQ = (v) => {
  state.q = v;
  const input = document.querySelector('input[type="search"]');
  const pos = input ? input.selectionStart : null;
  render();
  const next = document.querySelector('input[type="search"]');
  if (next && pos !== null) {
    next.focus();
    next.setSelectionRange(pos, pos);
  }
};
window.setCategory = (v) => {
  state.category = v;
  render();
};
window.setChain = (v) => {
  state.chain = v;
  render();
};
window.setTab = (p) => {
  state.p = p;
  render();
};
window.setScope = (s) => {
  state.watch = s === 'watch';
  state.early = s === 'early';
  render();
};
window.setVerdict = (v) => {
  state.verdict = v;
  render();
};
window.setDeposit = (v) => {
  state.deposit = Number(v);
  render();
};
window.setShare = (v) => {
  state.share = Number(v);
  render();
};
window.selectRow = (slug) => {
  state.sel = slug;
  render();
};
window.closeDetail = () => {
  state.sel = null;
  render();
};

function render() {
  writeHash();
  const app = document.getElementById('board');
  app.innerHTML = `<div class="shell">${hero()}${controls()}${state.p === 'board' ? boardTable(filteredRows()) + methodPanel() : liveTable()}</div>` + detailDialog();
  const d = document.getElementById('detail');
  if (d) {
    d.addEventListener('close', () => {
      if (state.sel) {
        state.sel = null;
        render();
      }
    });
    if (state.sel) d.showModal();
  }
}

readHash();
render();
window.addEventListener('hashchange', () => {
  readHash();
  render();
});
