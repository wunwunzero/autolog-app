'use strict';
/* Autolog phone app: static shell for the Expense Autolog Apps Script backend.
   GET  ?view=data&key=…              -> snapshot JSON
   POST {action:'categorize', key,…}  -> set one row's category (the view key's only mutation)
   Config { url, key } lives in localStorage only. ?demo=1 renders sample data. */

const $ = (id) => document.getElementById(id);
const CFG_KEY = 'autolog.cfg';
const BASE_CATS = ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Health', 'Subscriptions', 'TRANSFER', 'REFUND'];

let cfg = null;
let data = null;
let tab = 'overview';

const DEMO = {
  ok: true, month: 'August 2026', dayOfMonth: 18, daysInMonth: 31, totalMYR: 956.5,
  generatedAt: '2026-08-18 14:32',
  byCat: { Food: 142.8, Groceries: 441.1, Transport: 42.6, Subscriptions: 54.9, Fuel: 80, Shopping: 129, Health: 59.1 },
  budgets: { Food: 600, Groceries: 450, Transport: 200, Subscriptions: 60, Fuel: 250 },
  categories: ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Health', 'Subscriptions'],
  reviewTotal: 3,
  review: [
    { id: 'd1', date: '2026-08-15', merchant: 'MYSTERY SHOP 88', amountMYR: 42, category: 'Uncategorized', source: 'statement' },
    { id: 'd2', date: '2026-08-13', merchant: 'PANAXIS SDN BHD', amountMYR: 11, category: 'Uncategorized', source: 'tng' },
    { id: 'd3', date: '2026-08-11', merchant: 'OCEAN SKY', amountMYR: 13.7, category: 'Uncategorized', source: 'tng' }
  ],
  recent: [
    { id: 'r1', date: '2026-08-18', merchant: 'BIG Pharmacy', amountMYR: 22.9, category: 'Health', source: 'applepay' },
    { id: 'r2', date: '2026-08-18', merchant: 'Starbucks KLIA2', amountMYR: 19.5, category: 'Food', source: 'applepay' },
    { id: 'r3', date: '2026-08-12', merchant: 'Shopee MY', amountMYR: -35, category: 'REFUND', source: 'statement' }
  ]
};

const fmt = (v) => (v < 0 ? '-' : '') + 'RM' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const barColor = (r) => r >= 1 ? '#ff453a' : r >= 0.8 ? '#ff9f0a' : '#30d158';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = 0; }, 2600);
}

function parseConnect(s) {
  const url = (s.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/) || [])[0];
  const key = (s.match(/[?&]key=([\w-]+)/) || [])[1];
  return url && key ? { url, key } : null;
}

async function fetchData() {
  if (new URLSearchParams(location.search).get('demo')) return DEMO;
  const res = await fetch(cfg.url + '?view=data&key=' + encodeURIComponent(cfg.key));
  const j = await res.json();
  if (!j.ok) throw new Error('Backend refused the key');
  return j;
}

async function categorize(id, category) {
  if (new URLSearchParams(location.search).get('demo')) return { ok: true };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
    body: JSON.stringify({ action: 'categorize', key: cfg.key, id, category })
  });
  return res.json();
}

function ringSvg(pct, color) {
  const shown = Math.max(0, Math.min(100, pct)).toFixed(1);
  return `<svg width="88" height="88" viewBox="0 0 42 42" style="flex:0 0 auto">
    <circle cx="21" cy="21" r="15.915" fill="none" stroke="#2c2c2e" stroke-width="4.2"/>
    ${pct > 0 ? `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${color}" stroke-width="4.2"
      stroke-linecap="round" stroke-dasharray="${shown} 100" transform="rotate(-90 21 21)"/>` : ''}
    <text x="21" y="24.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff"
      font-family="-apple-system,system-ui,sans-serif">${Math.round(pct)}%</text></svg>`;
}

function barRow(name, right, pct, color) {
  return `<div class="barrow"><div class="top"><span class="name">${esc(name)}</span>
    <span class="amt">${right}</span></div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div></div>`;
}

function renderOverview() {
  const budgets = data.budgets || {};
  const byCat = data.byCat || {};
  const bCats = Object.keys(budgets);
  let html = `<div style="font-size:44px;font-weight:800;letter-spacing:-1px;margin-top:6px">${fmt(data.totalMYR)}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">spent this month &middot; day ${data.dayOfMonth} of ${data.daysInMonth}</div>`;

  if (bCats.length) {
    let capSum = 0, spent = 0;
    const rows = bCats.map((c) => {
      const s = byCat[c] || 0;
      capSum += budgets[c];
      spent += s;
      return { c, s, cap: budgets[c], r: s / budgets[c] };
    }).sort((a, b) => b.r - a.r);
    const left = capSum - spent;
    const ratio = capSum > 0 ? spent / capSum : 0;
    html += `<div class="card"><h3>Budgets</h3>
      <div style="display:flex;align-items:center;gap:18px;margin-top:14px">${ringSvg(ratio * 100, barColor(ratio))}
      <div><div style="font-size:21px;font-weight:700">${fmt(spent)}</div>
      <div class="muted" style="font-size:13px">of ${fmt(capSum)} budgeted</div>
      <div style="font-size:13px;font-weight:600;margin-top:3px;color:${left >= 0 ? '#30d158' : '#ff453a'}">
      ${left >= 0 ? fmt(left) + ' left' : fmt(-left) + ' over'}</div></div></div><div style="margin-top:6px">` +
      rows.map((x) => barRow(x.c, `${fmt(x.s)} / ${fmt(x.cap)}`,
        Math.max(2, Math.min(100, Math.round(x.r * 100))), barColor(x.r))).join('') +
      '</div></div>';
  }

  const others = Object.keys(byCat).filter((c) => !budgets[c] && c !== 'REFUND')
    .map((c) => ({ c, s: byCat[c] })).sort((a, b) => b.s - a.s);
  if (others.length) {
    const max = Math.max(others[0].s, 0.01);
    html += `<div class="card"><h3>${bCats.length ? 'Other spending' : 'Spending'}</h3><div style="margin-top:2px">` +
      others.map((x) => barRow(x.c, fmt(x.s), Math.max(2, Math.round(x.s / max * 100)), '#0a84ff')).join('') +
      '</div></div>';
  }

  html += `<div class="card"><h3>Recent</h3>` +
    (data.recent || []).map((t) => {
      const inflow = t.amountMYR !== null && t.amountMYR < 0;
      return `<div class="txn"><div style="min-width:0"><div class="m">${esc(t.merchant || '(no merchant)')}</div>
        <div class="sub">${esc(t.date)} &middot; ${esc(t.category)}</div></div>
        <div class="val${inflow ? ' in' : ''}">${t.amountMYR === null ? '—' : (inflow ? '+' + fmt(-t.amountMYR) : fmt(t.amountMYR))}</div></div>`;
    }).join('') +
    `</div><div class="muted" style="text-align:center;margin-top:20px;font-size:12px">Updated ${esc(data.generatedAt || '')}</div>`;
  $('view-overview').innerHTML = html;
}

function renderReview() {
  const list = data.review || [];
  let html = '';
  if (!list.length) {
    html = `<div class="card" style="text-align:center;padding:34px 16px">
      <div style="font-size:40px">🎉</div>
      <div style="font-size:17px;font-weight:700;margin-top:8px">Nothing to review</div>
      <div class="muted" style="font-size:14px;margin-top:4px">Every transaction is categorised &mdash; all clear to sync to Actual Budget.</div></div>`;
  } else {
    html = `<div class="card"><h3>Needs a category (${data.reviewTotal})</h3>` +
      list.map((t, i) => `<div class="txn tappable" data-i="${i}"><div style="min-width:0">
        <div class="m">${esc(t.merchant || '(no merchant)')}</div>
        <div class="sub">${esc(t.date)} &middot; ${esc(t.source)}${t.category === 'REVIEW' ? ' &middot; REVIEW' : ''}</div></div>
        <div class="val">${t.amountMYR === null ? '—' : fmt(t.amountMYR)}</div></div>`).join('') +
      '</div><div class="muted" style="font-size:13px;text-align:center;margin-top:14px">Tap a transaction to pick its category.<br>These stay out of Actual Budget until categorised.</div>';
  }
  $('view-review').innerHTML = html;
  document.querySelectorAll('#view-review .tappable').forEach((el) => {
    el.addEventListener('click', () => openSheet(list[Number(el.dataset.i)]));
  });
}

function openSheet(txn) {
  const cats = [...new Set([...(data.categories || []), ...BASE_CATS])];
  const sheet = $('sheet');
  sheet.innerHTML = `<div class="inner">
    <div style="font-size:17px;font-weight:700">${esc(txn.merchant || '(no merchant)')}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${esc(txn.date)} &middot; ${txn.amountMYR === null ? 'no amount' : fmt(txn.amountMYR)}</div>
    <div class="chips">${cats.map((c) => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('')}
      <button data-new="1" style="color:#0a84ff">＋ New…</button></div>
    <button class="btn" style="background:#2c2c2e" id="sheetCancel">Cancel</button></div>`;
  sheet.classList.remove('hidden');
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); }, { once: true });
  $('sheetCancel').addEventListener('click', closeSheet);
  sheet.querySelectorAll('.chips button').forEach((b) => {
    b.addEventListener('click', async () => {
      let cat = b.dataset.c;
      if (b.dataset.new) {
        cat = (prompt('New category name:') || '').trim();
        if (!cat) return;
      }
      closeSheet();
      try {
        const r = await categorize(txn.id, cat);
        if (!r.ok) throw new Error(r.error || 'rejected');
        data.review = data.review.filter((x) => x.id !== txn.id);
        data.reviewTotal = Math.max(0, (data.reviewTotal || 1) - 1);
        renderReview();
        updateBadge();
        toast(`${txn.merchant || 'Row'} → ${cat}`);
      } catch (err) {
        toast('Failed: ' + err.message);
      }
    });
  });
}

function closeSheet() { $('sheet').classList.add('hidden'); }

function updateBadge() {
  const n = data ? data.reviewTotal || 0 : 0;
  $('badge').textContent = n;
  $('badge').classList.toggle('hidden', !n);
  const pill = $('statusPill');
  if (n) { pill.className = 'pill bad'; pill.textContent = n + ' to review'; }
  else { pill.className = 'pill good'; pill.textContent = 'all clear'; }
}

function setTab(t) {
  tab = t;
  $('view-overview').classList.toggle('hidden', t !== 'overview');
  $('view-review').classList.toggle('hidden', t !== 'review');
  $('tab-overview').classList.toggle('on', t === 'overview');
  $('tab-review').classList.toggle('on', t === 'review');
}

function showSetup(message) {
  localStorage.removeItem(CFG_KEY);
  $('app').classList.add('hidden');
  $('nav').classList.add('hidden');
  $('setup').classList.remove('hidden');
  if (!showSetup._wired) {
    showSetup._wired = true;
    $('connectBtn').addEventListener('click', () => {
      const parsed = parseConnect($('connect').value);
      if (!parsed) return toast('That link is missing the address or key');
      localStorage.setItem(CFG_KEY, JSON.stringify(parsed));
      location.reload();
    });
  }
  if (message) toast(message);
}

async function refresh() {
  try {
    data = await fetchData();
    $('month').textContent = data.month;
    renderOverview();
    renderReview();
    updateBadge();
  } catch (err) {
    // A rejected key never fixes itself: reopen setup so the link can be re-pasted.
    if (/refused/i.test(err.message)) {
      showSetup('Key rejected — paste your dashboard link again');
      return;
    }
    toast('Could not load: ' + err.message);
  }
}

function boot() {
  const params = new URLSearchParams(location.search);
  // Guaranteed escape hatch (…/autolog-app/?reset=1): wipe the stored connection and
  // start over, regardless of what state a cached version left behind.
  if (params.get('reset')) {
    localStorage.removeItem(CFG_KEY);
    history.replaceState(null, '', location.pathname);
  }
  // Tap-to-connect: …/autolog-app/#connect=<url-encoded dashboard link>, sent by the
  // backend's emailDashLink(). Configures the app in one tap, no copying.
  if (location.hash.indexOf('#connect=') === 0) {
    const parsed = parseConnect(decodeURIComponent(location.hash.slice(9)));
    if (parsed) localStorage.setItem(CFG_KEY, JSON.stringify(parsed));
    history.replaceState(null, '', location.pathname);
  }
  const demo = params.get('demo');
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)); } catch (e) { cfg = null; }
  if (!cfg && !demo) {
    showSetup();
    return;
  }
  $('app').classList.remove('hidden');
  $('nav').classList.remove('hidden');
  $('tab-overview').addEventListener('click', () => setTab('overview'));
  $('tab-review').addEventListener('click', () => setTab('review'));
  $('tab-refresh').addEventListener('click', () => { toast('Refreshing…'); refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
}

boot();
