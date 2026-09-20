'use strict';
/* Autolog phone app: static shell for the Expense Autolog Apps Script backend.
   GET  ?view=data&key=…              -> snapshot JSON
   POST {action:'categorize', key,…}  -> set one row's category (the view key's only mutation)
   Config { url, key } lives in localStorage only. ?demo=1 renders sample data. */

const $ = (id) => document.getElementById(id);
const CFG_KEY = 'autolog.cfg';
const APP_VERSION = 18; // keep in step with index.html's app.js?v=
// The backend address is fixed and not secret (auth lives in the key), so connecting
// only truly requires the key itself.
const DEFAULT_EXEC_URL = 'https://script.google.com/macros/s/AKfycbx3VtjlwOqMmPIP-Wp07x4B0Ns4cGK2wr78cM06nwijUMW3l2yW3_j8z1dZZrYvSvwi/exec';
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
  coverage: { tng: '2026-08-14', hsbc: '2026-08-16', rhb: null, alipay: '2026-08-15' },
  efBalanceMYR: 2446.21,
  fronted: [
    { name: 'Ali', outstandingMYR: 180, since: '2026-08-10', count: 3 },
    { name: 'Mei', outstandingMYR: 45.5, since: '2026-08-16', count: 1 }
  ],
  reviewTotal: 3,
  review: [
    { id: 'd1', date: '2026-08-15', merchant: 'MYSTERY SHOP 88', amountMYR: 42, category: 'Uncategorized', source: 'statement' },
    { id: 'd2', date: '2026-08-13', merchant: 'PANAXIS SDN BHD', amountMYR: 11, category: 'Uncategorized', source: 'tng' },
    { id: 'd3', date: '2026-08-11', merchant: 'OCEAN SKY', amountMYR: 13.7, category: 'Uncategorized', source: 'tng' }
  ],
  recent: [
    { id: 'r1', date: '2026-08-18', merchant: 'BIG Pharmacy', amountMYR: 22.9, category: 'Health', source: 'applepay' },
    { id: 'r2', date: '2026-08-18', merchant: 'Starbucks KLIA2', amountMYR: 19.5, category: 'Food', source: 'applepay' },
    { id: 'r3', date: '2026-08-12', merchant: 'Shopee MY', amountMYR: -35, category: 'REFUND', source: 'statement' },
    { id: 'r4', date: '2026-08-10', merchant: 'Family transfer', amountMYR: 400, category: 'Family', source: 'manual' },
    { id: 'r5', date: '2026-08-05', merchant: 'YES phone bill', amountMYR: 50, category: 'Phone & Internet', source: 'manual' }
  ]
};

const fmt = (v) => (v < 0 ? '-' : '') + 'RM' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-08-28' -> '28 Aug 2026' (string-split, no Date parsing: avoids timezone drift)
function fmtCoverageDate(iso) {
  const p = String(iso).split('-');
  return p.length === 3 ? Number(p[2]) + ' ' + (MONTHS[Number(p[1]) - 1] || p[1]) + ' ' + p[0] : iso;
}
const barColor = (r) => r >= 1 ? '#ff453a' : r >= 0.8 ? '#ff9f0a' : '#30d158';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  t.style.transform = 'translateX(-50%)'; // rises from its resting +8px offset
  clearTimeout(t._h);
  t._h = setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translateX(-50%) translateY(8px)';
  }, 2600);
}

function parseConnect(s) {
  s = String(s || '').trim();
  // Accept every shape the user might paste: the raw dash link, the emailed tap-link
  // (…/autolog-app/#connect=<encoded>), a Gmail-wrapped copy (google.com/url?q=<encoded>,
  // often double-encoded), or a bare encoded blob. Peel layers until the address and
  // key appear or decoding stops making progress.
  // Simplest of all: just the key, typed by hand (12-ish chars from the Config tab).
  if (/^[A-Za-z0-9-]{8,24}$/.test(s)) return { url: DEFAULT_EXEC_URL, key: s };
  for (let i = 0; i < 5; i++) {
    const frag = s.match(/#connect=(.+)$/);
    if (frag) {
      try { s = decodeURIComponent(frag[1]); continue; } catch (e) { /* fall through */ }
    }
    const url = (s.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/) || [])[0];
    const key = (s.match(/[?&]key=([\w-]+)/) || [])[1];
    if (url && key) return { url, key };
    let decoded;
    try { decoded = decodeURIComponent(s); } catch (e) { break; }
    if (decoded === s) break;
    s = decoded;
  }
  return null;
}

async function fetchData() {
  if (new URLSearchParams(location.search).get('demo')) return DEMO;
  const res = await fetch(cfg.url + '?view=data&key=' + encodeURIComponent(cfg.key));
  const j = await res.json();
  if (!j.ok) throw new Error('Backend refused the key');
  return j;
}

async function quickAdd(fields) {
  if (new URLSearchParams(location.search).get('demo')) return { ok: true, id: 'demo' };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
    body: JSON.stringify({ action: 'quickadd', key: cfg.key, ...fields })
  });
  return res.json();
}

async function undoQuickAdd(id) {
  if (new URLSearchParams(location.search).get('demo')) return { ok: true };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'undo_quickadd', key: cfg.key, id })
  });
  return res.json();
}

// Last quick-add, kept for the 15-minute undo window the backend enforces.
// localStorage so it survives an app relaunch; wrapped because iOS can deny it.
const UNDO_KEY = 'autolog.lastAdd';
const UNDO_WINDOW_MS = 15 * 60 * 1000;
function rememberLastAdd(id, text) {
  try { localStorage.setItem(UNDO_KEY, JSON.stringify({ id, text, ts: Date.now() })); } catch (e) { /* per-viewer nicety only */ }
}
function pendingUndo() {
  try {
    const u = JSON.parse(localStorage.getItem(UNDO_KEY));
    return u && u.id && Date.now() - u.ts < UNDO_WINDOW_MS ? u : null;
  } catch (e) { return null; }
}
function clearLastAdd() {
  try { localStorage.removeItem(UNDO_KEY); } catch (e) { /* ignore */ }
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
      stroke-linecap="round" stroke-dasharray="0 100" data-dash="${shown}" transform="rotate(-90 21 21)"/>` : ''}
    <text x="21" y="24.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff"
      font-family="-apple-system,system-ui,sans-serif">${Math.round(pct)}%</text></svg>`;
}

// Bars and the budget ring render at zero and sweep to their real value on the
// next frame (CSS transitions do the motion) — the "feels static" fix.
function barRow(name, right, pct, color) {
  return `<div class="barrow"><div class="top"><span class="name">${esc(name)}</span>
    <span class="amt">${right}</span></div>
    <div class="track"><div class="fill" style="width:2%;background:${color}" data-w="${pct}"></div></div></div>`;
}

function animateFills(rootId) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('#' + rootId + ' .fill[data-w]').forEach((f) => { f.style.width = f.dataset.w + '%'; });
    document.querySelectorAll('#' + rootId + ' circle[data-dash]').forEach((c) => {
      c.setAttribute('stroke-dasharray', c.dataset.dash + ' 100');
    });
  }));
}

// Headline total counts up on the first paint of a session (ease-out, 500ms).
function countUp(el, target) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / 500);
    el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Placeholder skeleton while the backend builds the snapshot (2–5s): the user
// chose fresh-data-always over cached-instant, so the wait must look deliberate.
function renderSkeleton() {
  const card = (rows) => `<div class="card"><div class="skel" style="width:38%;height:12px"></div>` +
    Array.from({ length: rows }, (_, i) =>
      `<div class="skel" style="height:14px;margin-top:16px;width:${88 - i * 9}%"></div>`).join('') + '</div>';
  $('view-overview').innerHTML =
    `<div class="skel" style="width:56%;height:44px;margin-top:10px;border-radius:10px"></div>
     <div class="skel" style="width:40%;height:12px;margin-top:10px"></div>` +
    card(4) + card(3) + card(2);
}

function renderOverview() {
  const budgets = data.budgets || {};
  const byCat = data.byCat || {};
  const bCats = Object.keys(budgets);
  const firstPaint = !renderOverview._painted;
  renderOverview._painted = true;
  let html = `<div id="bigTotal" style="font-size:44px;font-weight:800;letter-spacing:-1px;margin-top:6px">${fmt(data.totalMYR)}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">spent this month &middot; day ${data.dayOfMonth} of ${data.daysInMonth}</div>`;

  const undo = pendingUndo();
  if (undo) {
    html += `<button class="btn" id="undoBtn" style="background:#2c2c2e;margin-top:14px">&#x21a9;&#xfe0e; Undo last add &mdash; ${esc(undo.text)}</button>`;
  }

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

  // Emergency Fund progress (bridge-mirrored daily; older backends omit the field).
  // The bar shows progress toward a soft 3-months-of-planned-spending goal.
  if (typeof data.efBalanceMYR === 'number') {
    let capSum = 0;
    Object.keys(budgets).forEach((c) => { capSum += budgets[c]; });
    const months = capSum > 0 ? data.efBalanceMYR / capSum : null;
    const goalPct = months !== null ? Math.min(100, months / 3 * 100) : 0;
    html += `<div class="card"><h3>Emergency Fund</h3>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px">
        <div style="font-size:24px;font-weight:800;letter-spacing:-.5px">${fmt(data.efBalanceMYR)}</div>
        ${months !== null ? `<div class="muted" style="font-size:13px;font-weight:600">&asymp; ${months.toFixed(1)} mo of spending</div>` : ''}</div>
      ${months !== null ? `<div class="track" style="margin-top:10px"><div class="fill" style="width:2%;background:#30d158" data-w="${Math.max(2, goalPct)}"></div></div>
      <div class="muted" style="font-size:12px;margin-top:7px">toward a 3-month cushion &middot; grows via month-end sweeps</div>` : ''}</div>`;
  }

  // Who still owes you (rows tagged "fronted: name"; empty list = card hidden).
  if (data.fronted && data.fronted.length) {
    html += `<div class="card"><h3>Owed to you</h3>` +
      data.fronted.map((f) => `<div class="txn"><div style="min-width:0">
        <div class="m">${esc(f.name)}</div>
        <div class="sub">since ${esc(f.since ? fmtCoverageDate(f.since) : '?')} &middot; ${f.count} row(s)</div></div>
        <div class="val" style="color:#ffd60a">${fmt(f.outstandingMYR)}</div></div>`).join('') +
      `</div><div class="muted" style="font-size:12px;margin-top:6px;text-align:center">Paid back? Log it with the same &ldquo;fronted: name&rdquo; note to clear it.</div>`;
  }

  // Capture coverage: how far each statement channel is imported ("synced until").
  // Older backends don't send `coverage` — hide the card entirely then.
  if (data.coverage) {
    const CHANNELS = [['tng', 'TNG eWallet'], ['hsbc', 'HSBC'], ['rhb', 'RHB Card'], ['alipay', 'Alipay']];
    html += `<div class="card"><h3>Statements synced until</h3><div style="margin-top:4px">` +
      CHANNELS.map(([k, label]) => {
        const d = data.coverage[k];
        return `<div class="txn"><div class="m">${label}</div>
          <div class="val" style="font-weight:600;color:${d ? '#fff' : '#8e8e93'}">${d ? esc(fmtCoverageDate(d)) : 'no imports yet'}</div></div>`;
      }).join('') +
      `</div><div class="muted" style="font-size:12px;margin-top:8px">Newest imported transaction per source &mdash; spends after these dates arrive with your next screenshot/statement drop.</div></div>`;
  }

  html += `<div class="card"><h3>Recent</h3>` +
    (data.recent || []).map((t) => {
      const inflow = t.amountMYR !== null && t.amountMYR < 0;
      return `<div class="txn"><div style="min-width:0"><div class="m">${esc(t.merchant || '(no merchant)')}</div>
        <div class="sub">${esc(t.date)} &middot; ${esc(t.category)}</div></div>
        <div class="val${inflow ? ' in' : ''}">${t.amountMYR === null ? '—' : (inflow ? '+' + fmt(-t.amountMYR) : fmt(t.amountMYR))}</div></div>`;
    }).join('') +
    `</div><div class="muted" style="text-align:center;margin-top:20px;font-size:12px">Updated ${esc(data.generatedAt || '')}</div>`;
  const view = $('view-overview');
  view.classList.toggle('firstpaint', firstPaint); // card entrance stagger, first load only
  view.innerHTML = html;
  animateFills('view-overview');
  if (firstPaint && data.totalMYR > 0) countUp($('bigTotal'), data.totalMYR);

  const undoBtn = $('undoBtn');
  if (undoBtn) {
    undoBtn.addEventListener('click', async () => {
      const u = pendingUndo();
      if (!u) { renderOverview(); return; }
      undoBtn.disabled = true;
      undoBtn.textContent = 'Removing…';
      try {
        const r = await undoQuickAdd(u.id);
        if (!r.ok) throw new Error(r.error || 'rejected');
        clearLastAdd();
        toast('Removed — ' + u.text);
        refresh();
      } catch (err) {
        // A closed window or vanished row means the pill is stale: drop it.
        if (/window closed|not found|synced/.test(err.message)) clearLastAdd();
        toast('Undo failed: ' + err.message);
        renderOverview();
      }
    });
  }
}

// Batch selection state for the Review tab: "Select" flips the list into
// multi-select, then one category tap fixes every selected row.
let reviewSelectMode = false;
let reviewSel = new Set();

function renderReview() {
  const list = data.review || [];
  reviewSel = new Set([...reviewSel].filter((id) => list.some((t) => t.id === id)));
  if (!list.length) reviewSelectMode = false;
  let html = '';
  if (!list.length) {
    html = `<div class="card" style="text-align:center;padding:34px 16px">
      <div style="font-size:40px">🎉</div>
      <div style="font-size:17px;font-weight:700;margin-top:8px">Nothing to review</div>
      <div class="muted" style="font-size:14px;margin-top:4px">Every transaction is categorised &mdash; all clear to sync to Actual Budget.</div></div>`;
  } else {
    html = `<div class="card"><h3 style="display:flex;justify-content:space-between;align-items:center">
      <span>Needs a category (${data.reviewTotal})</span>
      ${list.length > 1 ? `<button type="button" id="selToggle" class="cardhead-btn">${reviewSelectMode ? 'Done' : 'Select'}</button>` : ''}</h3>` +
      list.map((t, i) => `<div class="txn tappable" data-i="${i}">
        ${reviewSelectMode ? `<div class="selmark${reviewSel.has(t.id) ? ' on' : ''}"></div>` : ''}
        <div style="min-width:0;flex:1">
        <div class="m">${esc(t.merchant || '(no merchant)')}</div>
        <div class="sub">${esc(t.date)} &middot; ${esc(t.source)}${t.category === 'REVIEW' ? ' &middot; REVIEW' : ''}</div></div>
        <div class="val">${t.amountMYR === null ? '—' : fmt(t.amountMYR)}</div></div>`).join('') +
      '</div>' +
      (reviewSelectMode && reviewSel.size
        ? `<button class="btn" id="batchBtn">Categorize ${reviewSel.size} selected&hellip;</button>`
        : '') +
      `<div class="muted" style="font-size:13px;text-align:center;margin-top:14px">${reviewSelectMode
        ? 'Tap rows to select, then give them all one category.'
        : 'Tap a transaction to pick its category.<br>These stay out of Actual Budget until categorised.'}</div>`;
  }
  $('view-review').innerHTML = html;
  document.querySelectorAll('#view-review .tappable').forEach((el) => {
    el.addEventListener('click', () => {
      const t = list[Number(el.dataset.i)];
      if (!reviewSelectMode) return openSheet([t]);
      if (reviewSel.has(t.id)) reviewSel.delete(t.id); else reviewSel.add(t.id);
      renderReview();
    });
  });
  const selToggle = $('selToggle');
  if (selToggle) {
    selToggle.addEventListener('click', () => {
      reviewSelectMode = !reviewSelectMode;
      if (!reviewSelectMode) reviewSel.clear();
      renderReview();
    });
  }
  const batchBtn = $('batchBtn');
  if (batchBtn) {
    batchBtn.addEventListener('click', () => openSheet(list.filter((t) => reviewSel.has(t.id))));
  }
}

function openSheet(txns) {
  if (!txns.length) return;
  const many = txns.length > 1;
  // Budget keys carry the full funded plan (mirrored daily from Actual), so a
  // newly funded envelope becomes a chip before any row or rule uses it.
  const cats = [...new Set([...(data.categories || []), ...Object.keys(data.budgets || {}), ...BASE_CATS])];
  const sheet = $('sheet');
  const head = many
    ? `${txns.length} transactions`
    : esc(txns[0].merchant || '(no merchant)');
  const sub = many
    ? 'one category for all of them'
    : `${esc(txns[0].date)} &middot; ${txns[0].amountMYR === null ? 'no amount' : fmt(txns[0].amountMYR)}`;
  sheet.innerHTML = `<div class="inner">
    <div style="font-size:17px;font-weight:700">${head}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${sub}</div>
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
      let done = 0;
      let lastErr = null;
      for (const txn of txns) { // sequential: each categorize takes the backend lock
        try {
          const r = await categorize(txn.id, cat);
          if (!r.ok) throw new Error(r.error || 'rejected');
          done++;
          data.review = data.review.filter((x) => x.id !== txn.id);
          data.reviewTotal = Math.max(0, (data.reviewTotal || 1) - 1);
        } catch (err) {
          lastErr = err;
        }
      }
      reviewSel.clear();
      if (done) reviewSelectMode = false;
      renderReview();
      updateBadge();
      if (lastErr) toast(`${done}/${txns.length} → ${cat} · last error: ${lastErr.message}`);
      else toast(many ? `${done} transactions → ${cat}` : `${txns[0].merchant || 'Row'} → ${cat}`);
    });
  });
}

function closeSheet() { $('sheet').classList.add('hidden'); healViewport(); }

// iOS (especially standalone) keeps the visual viewport shrunk after the keyboard or a
// prompt() closes, until a real scroll event fires - the fixed tab bar floats mid-screen
// on pages too short to scroll. The body is kept 2px taller than the viewport so this
// nudge always produces a genuine scroll and snaps the viewport back.
function healViewport() {
  setTimeout(() => { window.scrollTo(0, 1); window.scrollTo(0, 0); }, 80);
}

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
  ['overview', 'review', 'add'].forEach((v) => {
    $('view-' + v).classList.toggle('hidden', t !== v);
    $('tab-' + v).classList.toggle('on', t === v);
  });
  healViewport();
}

// Category chips for the Add form: single-select toggle, no reserved categories
// (a manual REFUND/TRANSFER would fight the netting logic).
function fillAddChips() {
  const cats = [...new Set([...((data && data.categories) || []), ...Object.keys((data && data.budgets) || {}), ...BASE_CATS])]
    .filter((c) => c !== 'TRANSFER' && c !== 'REFUND');
  const holder = $('addChips');
  const selected = holder.querySelector('.sel')?.dataset.c;
  holder.innerHTML = cats.map((c) => `<button type="button" data-c="${esc(c)}"${c === selected ? ' class="sel"' : ''}>${esc(c)}</button>`).join('');
  holder.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const was = b.classList.contains('sel');
      holder.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      if (!was) b.classList.add('sel'); // tap again to unselect = let the rules decide
    });
  });
}

// Recent MANUAL merchants as one-tap prefills on the Add form: the recurring
// quick-adds (family transfer, phone bill, bank-transfer meals) are the #1
// capture leak, so refilling them must cost one tap, not four fields.
function fillRecentChips() {
  const holder = $('recentChips');
  if (!holder) return;
  const seen = {};
  const recents = ((data && data.recent) || [])
    .filter((t) => t.source === 'manual' && t.merchant)
    .filter((t) => {
      const k = t.merchant.toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    })
    .slice(0, 6);
  holder.classList.toggle('hidden', !recents.length);
  holder.innerHTML = recents.map((t, i) => `<button type="button" data-i="${i}">&#8634;&#xfe0e; ${esc(t.merchant)}</button>`).join('');
  holder.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const t = recents[Number(b.dataset.i)];
      $('addMerchant').value = t.merchant;
      if (t.amountMYR !== null && t.amountMYR > 0) $('addAmount').value = String(t.amountMYR);
      $('addChips').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.c === t.category));
      toast('Prefilled — adjust and log');
    });
  });
}

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addSaveLabel() {
  return $('addPaidback').checked ? 'Log repayment' : 'Log transaction';
}

async function saveQuickAdd() {
  const merchant = $('addMerchant').value.trim();
  const amount = $('addAmount').value.trim().replace(',', '.');
  const paidback = $('addPaidback').checked;
  if (!merchant) return toast('Give it a merchant name');
  if (!(parseFloat(amount) > 0)) return toast('Amount must be more than 0');
  const cat = $('addChips').querySelector('.sel')?.dataset.c;
  // A repayment nets a specific envelope, so the category is not optional —
  // the backend rejects category-less negatives too (they'd sync wrong).
  if (paidback && !cat) return toast('Pick the envelope the repayment nets');
  const fields = { merchant, amount: paidback ? '-' + amount : amount, currency: $('addCurrency').value };
  if (cat) fields.category = cat;
  const note = $('addNote').value.trim();
  if (note) fields.note = note; // e.g. "fronted: Ali" — needs webhook v25+; older backends ignore it
  // Only send a date when it isn't today, so "now" keeps its time of day (dedup ordering).
  if ($('addDate').value && $('addDate').value !== localToday()) fields.date = $('addDate').value;
  const btn = $('addSave');
  btn.disabled = true;
  btn.textContent = 'Logging…';
  try {
    const r = await quickAdd(fields);
    if (!r.ok) throw new Error(r.error || 'rejected');
    const amtText = fields.currency === 'MYR' ? fmt(parseFloat(amount)) : fields.currency + ' ' + amount;
    toast(paidback
      ? `Paid back ${amtText} into ${cat}${r.dedup ? ' (already logged)' : ''}`
      : `Logged ${amtText} at ${merchant}${r.dedup ? ' (already logged)' : ''}`);
    if (r.id && !r.dedup) rememberLastAdd(r.id, `${paidback ? '+' : ''}${amtText} · ${merchant}`);
    $('addMerchant').value = '';
    $('addAmount').value = '';
    $('addNote').value = '';
    $('addChips').querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
    $('addDate').value = localToday();
    $('addPaidback').checked = false;
    $('addMerchant').placeholder = 'Merchant';
    setTab('overview');
    refresh();
  } catch (err) {
    toast('Failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = addSaveLabel();
  }
}

function showSetup(message) {
  localStorage.removeItem(CFG_KEY);
  $('app').classList.add('hidden');
  $('nav').classList.add('hidden');
  $('setup').classList.remove('hidden');
  $('setupVersion').textContent = 'Autolog app v' + APP_VERSION;
  if (!showSetup._wired) {
    showSetup._wired = true;
    $('connectBtn').addEventListener('click', () => {
      const parsed = parseConnect($('connect').value);
      if (!parsed) return toast('Couldn’t read that (app v' + APP_VERSION + '). Try just typing your 12-character key.');
      localStorage.setItem(CFG_KEY, JSON.stringify(parsed));
      location.reload();
    });
  }
  if (message) toast(message);
}

async function refresh() {
  $('tab-refresh').classList.add('busy');
  try {
    data = await fetchData();
    $('month').textContent = data.month;
    renderOverview();
    renderReview();
    fillAddChips();
    fillRecentChips();
    updateBadge();
  } catch (err) {
    // A rejected key never fixes itself: reopen setup so the link can be re-pasted.
    if (/refused/i.test(err.message)) {
      showSetup('Key rejected — paste your dashboard link again');
      return;
    }
    toast('Could not load: ' + err.message);
  } finally {
    $('tab-refresh').classList.remove('busy');
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
  $('tab-add').addEventListener('click', () => setTab('add'));
  $('tab-refresh').addEventListener('click', () => { toast('Refreshing…'); refresh(); });
  $('addDate').value = localToday();
  $('addSave').addEventListener('click', saveQuickAdd);
  $('addPaidback').addEventListener('change', () => {
    $('addSave').textContent = addSaveLabel();
    $('addMerchant').placeholder = $('addPaidback').checked ? 'Repayment - Ali dinner' : 'Merchant';
  });
  fillAddChips();
  renderSkeleton(); // the first fetch takes the backend 2–5s; never show a blank screen
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); healViewport(); } });
  // Keyboard dismissal is the main viewport-shrinker: heal on every input blur, and on
  // any visual-viewport resize settling (covers prompt(), rotation, keyboard).
  document.addEventListener('focusout', healViewport);
  if (window.visualViewport) {
    let vvT;
    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(vvT);
      vvT = setTimeout(healViewport, 120);
    });
  }
  refresh();
}

boot();
