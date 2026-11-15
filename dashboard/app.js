// Token Radar v2 dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail drawer
// with the model's own inputs, and the live-token comparables the multiple was
// calibrated from. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watch: false, early: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }

  // The model in one function: the page recomputes a row from the snapshot figures
  // and checks the number board.json carries, so page and board are the same arithmetic.
  // implied = round(tvl x multiple x growth x maturity x breadth); growth is asymmetric
  // (up at half weight, down at full weight), maturity is a square-root curve.
  function impliedOf(row, model) {
    var g = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var gm = g >= 0 ? 1 + (g / 100) * model.growth_up_weight : 1 + (g / 100) * model.growth_down_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var mm = model.maturity_floor + Math.sqrt(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var bm = 1 + model.breadth_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * gm * mm * bm));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 of USDC against it and repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' in the tightest active range, and swap $10 through it each week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds once inside its own app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedged position, and close it within the week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and place one small position on a market that settles within two weeks.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the same wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it for the full window.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full window.';
    if (c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and open one small covered position.';
    if (c.indexOf('launchpad') >= 0 || c.indexOf('locker') >= 0) return 'Lock $' + capital + ' of USDC in ' + name + ' on ' + chain + ' for the shortest lock it offers.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week: a fresh supply, a small borrow and repay, or a vote in its governance.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Make one qualifying action each week: a $10 swap through its main pool, or add and remove a little liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Make one qualifying action each week: open and close one small hedged trade, never a naked leveraged bet.';
    if (c.indexOf('prediction') >= 0) return 'Make one qualifying action each week: place one small position on a market that settles soon.';
    if (c.indexOf('bridge') >= 0) return 'Make one qualifying action each week: bridge a small amount and use it once on the destination chain.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Make one qualifying action each week: top up the stake a little, or claim and restake the rewards.';
    return 'Make one qualifying action each week: a deposit, a swap, a vote, or a claim inside the protocol itself.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    return [
      { text: "Open the protocol's own site from its DefiLlama listing, connect a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.", cost: 'under $3 of gas for the first transaction', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and never withdraw and re-deposit just to look active.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Once a month, open the protocol's own points or rewards page and check the position is counted; only follow links the protocol itself publishes.", cost: 'no fee to check', time: '10 minutes a month' },
      { text: 'Never pay to claim anything, never paste your seed phrase anywhere, and ignore any direct message offering an early token sale.', cost: '$0, and it saves the whole position', time: '2 minutes to read' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it in one sitting.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'pre-token';
    state.watch = false; state.early = false; state.selected = null;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('early') === '1') state.early = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watch) params.set('watch', '1');
    if (state.early) params.set('early', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.early && r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'mult') { av = a.base_multiple; bv = b.base_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function hero() {
    var top = DATA.rows[0];
    return el('header', { class: 'hero' },
      el('div', { class: 'row' },
        el('div', null,
          el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
          el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
          el('p', { text: 'Every protocol in the snapshot that records no token, ranked by what its launch would be worth if its record stayed as it is. Implied value is this radar\u2019s claim, not a prediction that a token is issued, or when.' })
        ),
        el('div', { class: 'hero-meta' },
          el('div', null, el('b', { text: DATA.as_of }), el('span', { text: 'Snapshot date' })),
          el('div', null, el('b', { text: DATA.model_version }), el('span', { text: 'Model version' })),
          el('div', null, el('b', { text: 'DefiLlama' }), el('span', { text: 'Source index' }))
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('b', { text: String(DATA.watchlist_size) }), el('span', { text: 'Watchlist protocols covered (' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + ')' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows ranked' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'Early finds below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor' })),
        el('div', { class: 'fact' }, el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('span', { text: 'Top implied value: ' + (top ? top.name : 'n/a') }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var watchBtn = el('button', { class: 'chip', type: 'button', 'aria-pressed': state.watch ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watch = !state.watch; if (state.watch) state.early = false; writeHash(); render(); } });
    var earlyBtn = el('button', { class: 'chip', type: 'button', 'aria-pressed': state.early ? 'true' : 'false', text: 'Early finds', onclick: function () { state.early = !state.early; if (state.early) state.watch = false; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'chips' }, watchBtn, earlyBtn),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.early = false; writeHash(); render(); } })));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String(r.base_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge early', text: r.watchlist ? 'watchlist' : 'early' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model arithmetic and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('mult', 'Multiple'),
            sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Board' }))),
          tbody)));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : String(r.ratio) })));
    });
    var cal = DATA.calibration.by_category || {};
    var keys = Object.keys(cal).sort();
    return el('div', null,
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables the multiple is calibrated from.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
            tbody))),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Calibrated multiples by category' }),
        el('p', { class: 'sub', text: 'Median mcap / TVL of the live-token protocols in each category, shrunk toward the global median ' + DATA.calibration.global_multiple + ' and clamped to [' + DATA.model.multiple_floor + ', ' + DATA.model.multiple_cap + ']. ' + DATA.calibration.live_count + ' live protocols supplied the comparables.' }),
        el('div', { class: 'calib' }, keys.map(function (k) { return el('div', null, el('span', { text: k || 'No category' }), el('b', { text: String(cal[k]) })); }))));
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple x growth x maturity x breadth )\n' +
        'multiple = median(mcap/tvl) of live protocols in the category, shrunk to the global median ' + DATA.calibration.global_multiple + ', clamped [' + m.multiple_floor + ', ' + m.multiple_cap + ']\n' +
        'growth   = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ')/100 x ' + m.growth_up_weight + ' when up, x ' + m.growth_down_weight + ' when down\n' +
        'maturity = ' + m.maturity_floor + ' + sqrt(min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ') x ' + m.maturity_range + '\n' +
        'breadth  = 1 + ' + m.breadth_step + ' x min(chains - 1, ' + m.breadth_max_chains + ')'),
      el('ul', null,
        el('li', { text: 'TVL, seven-day growth, chains and the listing date all come from the snapshot; age is the time since the protocol was first listed, the best record of how long it has run with no token. An unlisted age uses ' + m.unknown_age_days + ' days.' }),
        el('li', { text: 'The multiple is calibrated, not chosen: the snapshot\u2019s own live-token protocols say what a dollar of TVL is worth in each category.' }),
        el('li', { text: 'A drop in TVL is penalised at full weight and a rise rewarded at half: shrinking is a worse signal than growing is a good one.' }),
        el('li', { text: 'Limits: the snapshot records no token; it does not prove there is none. Implied value is a claim about the record as it stands, not a prediction of issuance, timing or price.' })));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + '  \u00b7  ' + (row.watchlist ? 'watchlist' : 'early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (calibrated)' }), el('b', { class: 'num', text: 'x ' + row.base_multiple })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + '  ->  x ' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + '  ->  x ' + row.maturity_multiplier })),
        el('div', null, el('span', { text: 'Chain breadth' }), el('b', { class: 'num', text: (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + '  ->  x ' + row.breadth_multiplier })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('p', { class: 'note', text: 'This protocol records no token in the snapshot. That is the record, not proof: always check the protocol\u2019s own pages before you farm it.' })));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
