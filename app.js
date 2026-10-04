'use strict';
/* Autolog phone app: static shell for the Expense Autolog Apps Script backend.
   GET  ?view=data&key=…              -> snapshot JSON
   POST {action:'categorize'|'quickadd'|'undo_quickadd'|'set_fronted', key,…} — the view
        key's only mutations (set_fronted changes just the "fronted:" tag in Notes)
   Config { url, key } lives in localStorage only. ?demo=1 renders sample data. */

const $ = (id) => document.getElementById(id);
const CFG_KEY = 'autolog.cfg';
const APP_VERSION = 28; // keep in step with index.html's app.js?v=
// The backend address is fixed and not secret (auth lives in the key), so connecting
// only truly requires the key itself.
const DEFAULT_EXEC_URL = 'https://script.google.com/macros/s/AKfycbx3VtjlwOqMmPIP-Wp07x4B0Ns4cGK2wr78cM06nwijUMW3l2yW3_j8z1dZZrYvSvwi/exec';
const BASE_CATS = ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Health', 'Subscriptions', 'TRANSFER', 'REFUND'];
// The canonical envelopes (a contract with Actual — never invent names here) and
// the reserved values a person never picks as a category.
const CANON_CATS = ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Health', 'Subscriptions',
  'Phone & Internet', 'Family', 'Entertainment', 'Travel Fund'];
const NOT_PICKABLE = { Uncategorized: 1, REVIEW: 1, 'DUPLICATE?': 1 };

let cfg = null;
let data = null;
let tab = 'overview';

const DEMO = {
  ok: true, month: 'August 2026', dayOfMonth: 18, daysInMonth: 31, totalMYR: 956.5,
  generatedAt: '2026-08-18 14:32',
  byCat: { Food: 142.8, Groceries: 441.1, Transport: 42.6, Subscriptions: 54.9, Fuel: 80, Shopping: 129, Health: 59.1, 'Phone & Internet': 50 },
  budgets: { Food: 600, Groceries: 450, Transport: 200, Subscriptions: 60, Fuel: 250, 'Phone & Internet': 50 },
  fixedCats: ['Subscriptions', 'Phone & Internet', 'Family', 'Insurance'],
  categories: ['Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Health', 'Subscriptions'],
  coverage: { tng: '2026-08-14', hsbc: '2026-08-16', rhb: null, alipay: '2026-08-15' },
  efBalanceMYR: 2446.21,
  efMonthlyBasisMYR: 6980,
  buffer: { balanceMYR: 1810, floorMYR: 2500 },
  audit: { cashMYR: 11431.4, autologMYR: -900.2, unbilledMYR: 543.6, asOf: '2026-08-18 07:31' },
  projByCat: { Food: 246, Groceries: 470, Transport: 73.4, Subscriptions: 54.9, Fuel: 80, 'Phone & Internet': 50 },
  history: { '2026-07': { Food: 512.3, Groceries: 380, Transport: 96.5 }, '2026-06': { Food: 640.1, Groceries: 402.2, Transport: 88 } },
  monthRows: [
    { id: 'm1', date: '2026-08-18', merchant: 'Starbucks KLIA2', amountMYR: 19.5, category: 'Food', source: 'applepay', fronted: null },
    { id: 'm2', date: '2026-08-16', merchant: 'KBBQ dinner', amountMYR: 90, category: 'Food', source: 'applepay', fronted: 'Mei' },
    { id: 'm3', date: '2026-08-14', merchant: 'Nasi lemak', amountMYR: 33.3, category: 'Food', source: 'tng', fronted: null },
    { id: 'm4', date: '2026-08-12', merchant: 'Village Grocer', amountMYR: 441.1, category: 'Groceries', source: 'applepay', fronted: null },
    { id: 'm5', date: '2026-08-10', merchant: 'Exit Toll: ELITE', amountMYR: 42.6, category: 'Transport', source: 'tng', fronted: null }
  ],
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
    { id: 'm1', date: '2026-08-18', merchant: 'Starbucks KLIA2', amountMYR: 19.5, category: 'Food', source: 'applepay' },
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
// Row dates: '2026-08-16' -> '16 Aug' this year, '16 Aug 2025' otherwise — one
// format everywhere (rows used to show raw ISO next to cards' '16 Aug 2026').
function fmtDay(iso) {
  const p = String(iso || '').split('-');
  if (p.length !== 3) return iso || '';
  const y = String(new Date().getFullYear());
  return Number(p[2]) + ' ' + (MONTHS[Number(p[1]) - 1] || p[1]) + (p[0] === y ? '' : ' ' + p[0]);
}
// Ledger source ids are backend vocabulary; people read these.
const SOURCE_LABEL = { applepay: 'Apple Pay', tng: 'TnG', statement: 'Statement', manual: 'Quick add', alipay: 'Alipay', grab: 'Grab' };
const srcLabel = (s) => SOURCE_LABEL[s] || s || '';
const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`;
// Backend/network errors in plain words; a failed POST changed nothing.
function friendly(err) {
  const m = String((err && err.message) || err || '');
  if (/failed to fetch|networkerror|load failed|network/i.test(m)) return 'No connection — nothing changed. Try again.';
  if (/unexpected token|json/i.test(m)) return 'The server didn’t answer properly — try again in a minute.';
  return m;
}
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Add style (critique 4 Oct 2026, user's choice to try): quick-add opens as a
// sheet over the current tab — the keypad is up at once and Overview stays behind,
// so the budget bar visibly moves when the sheet closes. "Tab" keeps the old screen.
const ADD_STYLE_KEY = 'autolog.addStyle';
function addAsSheet() { try { return (localStorage.getItem(ADD_STYLE_KEY) || 'sheet') === 'sheet'; } catch (e) { return true; } }
function setAddStyle(v) { try { localStorage.setItem(ADD_STYLE_KEY, v); } catch (e) { /* per-device nicety */ } }
// 'yyyy-MM-dd HH:mm' -> 'today 14:32' / '18 Aug 14:32' (the footer showed raw ISO).
function fmtUpdated(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (!m) return s || '';
  return (m[1] === localToday() ? 'today' : fmtDay(m[1])) + ' ' + m[2];
}

const barColor = (r) => r >= 1 ? 'var(--red)' : r >= 0.8 ? 'var(--amber)' : 'var(--green)';
// Pace colour (27 Sep 2026): judge where the month LANDS, not how much of the cap
// is used — right after a sitting every cap equals "spent + what's still needed",
// which the old %-used rule painted solid red. Over now = red; projected within
// the cap (RM1 slack) = green; up to 10% over = amber; beyond = red.
function paceColor(spent, proj, cap) {
  if (!(cap > 0)) return 'var(--blue)';
  if (spent > cap + 0.005) return 'var(--red)';
  const landing = Math.max(spent, proj || 0);
  if (landing <= cap + 1) return 'var(--green)';
  return landing <= cap * 1.1 ? 'var(--amber)' : 'var(--red)';
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// action {label, run}: an inline button (e.g. Undo) — the toast then stays 6s
// and takes taps; plain toasts never block what's underneath.
function toast(msg, action) {
  const t = $('toast');
  t.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  const hide = () => {
    t.style.opacity = 0;
    t.style.transform = 'translateX(-50%) translateY(8px)';
    t.style.pointerEvents = 'none';
  };
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => { clearTimeout(t._h); hide(); action.run(); });
    t.appendChild(b);
  }
  t.style.pointerEvents = action ? 'auto' : 'none';
  // Reaching Undo by VoiceOver/keyboard stops the clock; leaving restarts it.
  t.onfocusin = () => clearTimeout(t._h);
  t.onfocusout = () => { clearTimeout(t._h); t._h = setTimeout(hide, 4000); };
  // With a sheet open, the bottom is the sheet's buttons: show the toast up top.
  const sheetOpen = !$('sheet').classList.contains('hidden');
  t.style.bottom = sheetOpen ? 'auto' : '';
  t.style.top = sheetOpen ? 'calc(14px + env(safe-area-inset-top))' : '';
  t.style.opacity = 1;
  t.style.transform = 'translateX(-50%)'; // rises from its resting +8px offset
  clearTimeout(t._h);
  const ms = action ? 10000 : /^(Failed|Could not|Undo failed|No connection)/.test(msg) ? 5000 : 2600;
  t._h = setTimeout(hide, ms);
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

function isDemo() { return !!new URLSearchParams(location.search).get('demo'); }

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

// Bars and the budget ring render at zero and sweep to their real value on the
// next frame (CSS transitions do the motion) — the "feels static" fix.
// opts.cat makes the row tappable (drill-down); opts.pacePct/paceText add the
// month-end projection tick + caption (backend projByCat: one-offs of RM100+
// aren't extrapolated, so a paid bill never "paces" over its envelope).
// Category identity (style A, 27 Sep 2026): one icon + one iOS system colour per
// canonical envelope, used everywhere a category appears. Red is deliberately
// NOT a category colour — it's reserved for "over".
const CATS = {
  'Food': ['🍜', 'var(--c-orange)'], 'Groceries': ['🛒', 'var(--c-green)'], 'Transport': ['🚗', 'var(--c-blue)'],
  'Fuel': ['⚡', 'var(--c-cyan)'], 'Health': ['💊', 'var(--c-mint)'], 'Shopping': ['🛍', 'var(--c-purple)'],
  'Subscriptions': ['🗓️', 'var(--c-indigo)'], 'Phone & Internet': ['📱', 'var(--c-gray)'], 'Family': ['🏠', 'var(--c-brown)'],
  'Entertainment': ['🎾', 'var(--c-gold)'], 'Travel Fund': ['✈️', 'var(--c-teal)'],
  'TRANSFER': ['🏦', 'var(--c-gray)'], 'REFUND': ['💰', 'var(--c-green)'], 'Uncategorized': ['❔', 'var(--c-gray)'],
  'REVIEW': ['⚠️', 'var(--c-gray)'], 'DUPLICATE?': ['⚠️', 'var(--c-gray)']
};
const catOf = (name) => CATS[name] || ['•', 'var(--c-gray)'];
function catIcon(name, size) {
  const [icon, color] = catOf(name);
  const px = size || 29;
  const mix = color === 'var(--c-gray)' ? 30 : 18; // grey at 18% vanished on white
  return `<span class="caticon" aria-hidden="true" style="width:${px}px;height:${px}px;background:color-mix(in srgb, ${color} ${mix}%, transparent)">${icon}</span>`;
}

// Category chips (critique 29 Sep 2026): icon + name, the 4 likeliest first and
// the rest behind "More" — ten flat text chips were a scan. A selection hidden
// in the rest opens the rest.
function chipHtml(c, selected) {
  return `<button type="button" data-c="${esc(c)}"${selected ? ' class="sel"' : ''} aria-pressed="${selected ? 'true' : 'false'}"><span class="ci" aria-hidden="true">${catOf(c)[0]}</span>${esc(c)}</button>`;
}
// TRANSFER/REFUND aren't spending envelopes: they sit last, under their own label.
const RESERVED_CATS = ['TRANSFER', 'REFUND'];
function catChipsHtml(cats, top, selected) {
  const envelopes = cats.filter((c) => !RESERVED_CATS.includes(c));
  const reserved = cats.filter((c) => RESERVED_CATS.includes(c));
  const first = top.filter((c) => envelopes.includes(c)).slice(0, 4);
  const rest = envelopes.filter((c) => !first.includes(c));
  const open = !!selected && (rest.includes(selected) || reserved.includes(selected));
  return first.map((c) => chipHtml(c, c === selected)).join('') +
    (rest.length || reserved.length ? `<button type="button" class="more${open ? ' hidden' : ''}" aria-expanded="${open}">More&hellip;</button>
      <div class="chips-more${open ? '' : ' hidden'}">${rest.map((c) => chipHtml(c, c === selected)).join('')}${reserved.length
        ? `<div class="chipsep">Not spending</div>${reserved.map((c) => chipHtml(c, c === selected)).join('')}` : ''}</div>` : '');
}
function wireMore(holder) {
  const more = holder.querySelector('.more');
  if (more) more.addEventListener('click', (e) => {
    more.classList.add('hidden');
    more.setAttribute('aria-expanded', 'true');
    const rest = holder.querySelector('.chips-more');
    rest.classList.remove('hidden');
    const firstRest = rest.querySelector('button');
    if (firstRest && e.detail === 0) firstRest.focus({ preventScroll: true }); // keyboard only
  });
}
// Likeliest categories: explicit suggestions, then this month's most-used, then
// the budgeted envelopes.
function topCats(suggested) {
  const count = {};
  (data && data.monthRows || []).forEach((t) => { count[t.category] = (count[t.category] || 0) + 1; });
  const used = Object.keys(count).filter((c) => !NOT_PICKABLE[c]).sort((a, b) => count[b] - count[a]);
  return [...new Set([...(suggested || []), ...used, ...Object.keys((data && data.budgets) || {}), ...CANON_CATS])];
}
function pickableCats(allowReserved) {
  return [...new Set([...CANON_CATS, ...((data && data.categories) || []), ...Object.keys((data && data.budgets) || {}),
    ...(allowReserved ? ['TRANSFER', 'REFUND'] : [])])]
    .filter((c) => !NOT_PICKABLE[c] && (allowReserved || (c !== 'TRANSFER' && c !== 'REFUND')));
}
// A category this merchant already carries elsewhere this month (first 10
// letters/digits of the name) — the sheet offers it first.
function suggestCategory(t) {
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const k = key(t.merchant);
  if (k.length < 4) return null;
  const hit = [...(data.monthRows || []), ...(data.recent || [])]
    .find((x) => x.id !== t.id && key(x.merchant) === k && !NOT_PICKABLE[x.category] && x.category !== 'TRANSFER');
  return hit ? hit.category : null;
}

// Misread guard for screenshot imports: an amount far outside this category's
// usual size (26 Sep 2026: a RM13.00 Subway read as RM1,300). Median of the
// other rows this month; with too few peers, only very large lines are flagged.
function amountFlag(r) {
  const a = Math.abs(r.amountMYR || 0);
  if (!a || !data) return null;
  const seen = new Set([r.id]);
  const peers = [...(data.monthRows || []), ...(data.recent || [])].filter((x) => {
    if (seen.has(x.id) || x.category !== r.category || !(x.amountMYR > 0)) return false;
    seen.add(x.id);
    return true;
  }).map((x) => x.amountMYR).sort((x, y) => x - y);
  if (peers.length >= 3) {
    const med = peers[Math.floor(peers.length / 2)];
    if (a >= 100 && a > 5 * med) return `${Math.round(a / med)}&times; your usual ${esc(r.category)} spend`;
  }
  const cap = (data.budgets || {})[r.category];
  if (cap > 0 && a >= 150 && a > cap / 2) return `over half the ${esc(r.category)} budget in one line`;
  if (peers.length < 3 && a >= 500) return 'unusually large';
  return null;
}

function barRow(name, right, pct, color, opts) {
  opts = opts || {};
  // Tappable rows are buttons to VoiceOver, announced as one sentence
  // ("Food, RM104.00 left, heading RM20.00 over at this pace").
  const label = `${name}, ${right.replace(/&[a-z]+;/g, ' ')}${opts.paceText ? ', ' + opts.paceText : ''}`;
  return `<div class="barrow${opts.cat ? ' tappable' : ''}"${opts.cat ? ` data-cat="${esc(opts.cat)}" role="button" tabindex="0" aria-label="${esc(label)}"` : ''}>
    ${catIcon(name)}<div class="mid">
    <div class="top"><span class="name">${esc(name)}</span><span class="amt" style="${opts.amtColor ? 'color:' + opts.amtColor : ''}">${right}</span></div>
    <div class="track" aria-hidden="true"><div class="fill" style="width:${pct}%;background:${color}" data-w="${pct}"></div>
    ${opts.pacePct !== undefined ? `<div class="pace" style="left:calc(${opts.pacePct}% - 1px)"></div>` : ''}</div>
    ${opts.paceText ? `<div class="pacetext" style="color:${opts.paceColor || 'var(--muted)'}">${opts.paceText}</div>` : ''}</div>${opts.cat ? '<span class="chev" aria-hidden="true">&rsaquo;</span>' : ''}</div>`;
}

function animateFills(rootId) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('#' + rootId + ' .fill[data-w]').forEach((f) => { f.style.transform = 'scaleX(1)'; });
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
  // Hero: safe to spend today = what's left across the budgeted envelopes ÷ days
  // remaining (today included). Truthful before AND after a sitting's sweep —
  // the caps mirror Actual's real capacity. Monthly spend drops to a sub-line.
  // An overspent envelope counts AGAINST the rest (29 Sep 2026, user decision):
  // covering it at the sitting takes money from the others, so the hero must too.
  let left = 0;
  let overTotal = 0;
  bCats.forEach((c) => {
    const d = budgets[c] - (byCat[c] || 0);
    left += d;
    if (d < -0.005) overTotal -= d;
  });
  left = Math.max(0, left);
  const daysLeft = Math.max(1, data.daysInMonth - data.dayOfMonth + 1);
  const perDay = left / daysLeft;
  const heroLabel = `${fmt(perDay)} a day safe to spend. ${fmt(left)} left for ${plural(daysLeft, 'day')} including today.` +
    (overTotal > 0.005 ? ` ${fmt(overTotal)} over in some envelopes.` : '');
  let html = bCats.length
    ? `<div role="group" aria-label="${esc(heroLabel)}"><div aria-hidden="true">
      <div style="margin-top:6px;display:flex;align-items:baseline;gap:8px">
        <div id="bigTotal" style="font-size:46px;font-weight:800;letter-spacing:-1.2px;color:${perDay < 20 ? 'var(--amber)' : 'var(--text)'}">${fmt(perDay)}</div>
        <div class="muted" style="font-size:17px;font-weight:600">/ day</div></div>
      <div style="font-size:15px;font-weight:600;margin-top:1px">safe to spend</div>
      <div class="muted" style="font-size:13px;margin-top:3px">${fmt(left)} left &middot; ${daysLeft} day${daysLeft === 1 ? '' : 's'} incl. today &middot; ${fmt(data.totalMYR)} spent this month</div>
      ${overTotal > 0.005 ? `<div style="font-size:13px;margin-top:3px;color:var(--red)">${left <= 0.005
        ? `envelopes are ${fmt(overTotal)} over in total &mdash; the sitting covers it from Buffer`
        : `already ${fmt(overTotal)} lower for overspent envelopes`}</div>` : ''}</div></div>`
    : `<div id="bigTotal" style="font-size:44px;font-weight:800;letter-spacing:-1px;margin-top:6px">${fmt(data.totalMYR)}</div>
      <div class="muted" style="font-size:13px;margin-top:2px">spent this month &middot; day ${data.dayOfMonth} of ${data.daysInMonth}</div>`;

  const undo = pendingUndo();
  if (undo) {
    html += `<button class="btn secondary" id="undoBtn" style="margin-top:14px">&#x21a9;&#xfe0e; Undo last add &mdash; ${esc(undo.text)}</button>`;
  }

  // Follow-ups the app can't do itself (a removed import that had already
  // synced): kept on screen until ticked off, not on a 2-second toast.
  const todos = actualTodos();
  if (todos.length) {
    html += `<div class="card notice"><h3>To do in Actual</h3>` + todos.map((x, i) => `<div class="txn" style="gap:10px">
      <div style="min-width:0;flex:1"><div class="m">Delete &ldquo;${esc(x.merchant)}&rdquo;</div>
      <div class="sub">${esc(fmtDay(x.date))} &middot; ${x.amountMYR === null ? 'no amount' : fmt(x.amountMYR)} &middot; removed here as not real</div></div>
      <div class="rowacts"><button type="button" data-todo="${i}">Done</button></div></div>`).join('') + `</div>`;
  }

  if (bCats.length) {
    const rows = bCats.map((c) => {
      const s = byCat[c] || 0;
      const proj = data.projByCat && typeof data.projByCat[c] === 'number' ? Math.max(data.projByCat[c], s) : s;
      return { c, s, cap: budgets[c], proj, r: s / budgets[c], rank: proj / budgets[c] };
    }).sort((a, b) => b.rank - a.rank);
    html += `<div class="card list"><h3>Budgets</h3>` +
      rows.map((x) => {
        const status = paceColor(x.s, x.proj, x.cap);
        const over = x.s > x.cap + 0.005;
        const opts = { cat: x.c };
        if (over) opts.amtColor = 'var(--red)';
        else if (status !== 'var(--green)') opts.amtColor = status;
        // The projection tick + caption only when the month is heading over the cap.
        if (!over && x.proj > x.cap + 1) {
          opts.pacePct = 100;
          opts.paceColor = status;
          opts.paceText = `heading ${fmt(x.proj - x.cap)} over at this pace`;
        } else if (typeof x.proj === 'number' && x.proj > x.s + 0.5 && x.cap > 0) {
          opts.pacePct = Math.min(100, Math.round(x.proj / x.cap * 100));
        }
        // A bill envelope (backend fixedCats) is never paced; once its charge has
        // landed, say so instead of leaving a bare "RM0.00 left".
        const fixed = (data.fixedCats || []).includes(x.c);
        if (fixed && !over && opts.pacePct === undefined && x.s >= x.cap - 0.5 && x.s > 0) opts.paceText = 'paid for the month';
        const right = over ? `${fmt(x.s - x.cap)} over` : `${fmt(x.cap - x.s)} left`;
        // One neutral tint while on track (29 Sep 2026, user choice): category
        // colours stay on the icon tiles, so amber and red on a bar only ever
        // mean "heading over" and "over".
        const fill = over ? 'var(--red)' : status !== 'var(--green)' ? status : 'var(--bar)';
        return barRow(x.c, right, Math.max(2, Math.min(100, Math.round(x.r * 100))), fill, opts);
      }).join('') + `</div>`;
  }

  const others = Object.keys(byCat).filter((c) => !budgets[c] && c !== 'REFUND')
    .map((c) => ({ c, s: byCat[c] })).sort((a, b) => b.s - a.s);
  if (others.length) {
    const max = Math.max(others[0].s, 0.01);
    // These bars are relative to the biggest row (no cap to measure against) — say so.
    html += `<div class="card list"><h3><span>${bCats.length ? 'Other spending' : 'Spending'}</span><span style="font-size:12px">bars relative to the largest</span></h3>` +
      others.map((x) => barRow(x.c, fmt(x.s), Math.max(2, Math.round(x.s / max * 100)), 'var(--bar)', { cat: x.c })).join('') +
      '</div>';
  }

  // Who still owes you (rows tagged "fronted: name"; empty list = card hidden).
  if (data.fronted && data.fronted.length) {
    html += `<div class="card"><h3>Owed to you</h3>` +
      data.fronted.map((f, i) => `<div class="txn tappable" role="button" tabindex="0" data-owed="${i}"
        aria-label="${esc(f.name)} owes ${esc(fmt(f.outstandingMYR))}. Log their repayment"><div style="min-width:0;flex:1">
        <div class="m">${esc(f.name)}</div>
        <div class="sub">since ${esc(f.since ? fmtDay(f.since) : '?')} &middot; ${plural(f.count, 'row')}</div></div>
        <div class="val" style="color:var(--yellow)">${fmt(f.outstandingMYR)}</div><span class="chev" aria-hidden="true">&rsaquo;</span></div>`).join('') +
      `<div class="muted" style="font-size:12px;padding-top:8px">Paid back? Tap their name to log it.</div></div>`;
  }

  html += `<div class="card list"><h3>Recent</h3>` +
    (data.recent || []).map((t, i) => txnRow(t, 'data-ri="' + i + '"')).join('') +
    `</div><div class="muted" style="text-align:center;margin-top:20px;font-size:12px">Updated ${esc(fmtUpdated(data.generatedAt))}</div>`;
  const view = $('view-overview');
  view.classList.toggle('firstpaint', firstPaint); // card entrance stagger, first load only
  view.innerHTML = html;
  animateFills('view-overview');
  if (firstPaint && !reduceMotion()) { const target = bCats.length ? perDay : data.totalMYR; if (target > 0) countUp($('bigTotal'), target); }

  view.querySelectorAll('.barrow[data-cat]').forEach((el) => {
    el.addEventListener('click', () => openCategorySheet(el.dataset.cat));
  });
  view.querySelectorAll('.txn[data-ri]').forEach((el) => {
    el.addEventListener('click', () => openRowSheet(data.recent[Number(el.dataset.ri)]));
  });
  view.querySelectorAll('.txn[data-owed]').forEach((el) => {
    el.addEventListener('click', () => startRepayment(data.fronted[Number(el.dataset.owed)]));
  });
  view.querySelectorAll('button[data-todo]').forEach((b) => {
    b.addEventListener('click', () => { dropActualTodo(Number(b.dataset.todo)); renderOverview(); });
  });


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
        renderOverview(); // drop the pill now, even if the refresh below fails
        refresh();
      } catch (err) {
        // A closed window or vanished row means the pill is stale: drop it.
        if (/window closed|not found|synced/.test(err.message)) clearLastAdd();
        toast('Undo failed: ' + friendly(err));
        renderOverview();
      }
    });
  }
}

// "To do in Actual" follow-ups, per device (localStorage; the phone is the only
// place they're created). Dropped after 14 days so a stale one can't linger.
const TODO_KEY = 'autolog.actualTodo';
function actualTodos() {
  try {
    const all = JSON.parse(localStorage.getItem(TODO_KEY)) || [];
    return all.filter((x) => Date.now() - x.ts < 14 * 864e5);
  } catch (e) { return []; }
}
function addActualTodo(t) {
  try {
    const all = actualTodos();
    all.push({ merchant: t.merchant || '(no merchant)', amountMYR: t.amountMYR, date: t.date || '', ts: Date.now() });
    localStorage.setItem(TODO_KEY, JSON.stringify(all));
  } catch (e) { /* per-viewer nicety only */ }
}
function dropActualTodo(i) {
  try {
    const all = actualTodos();
    all.splice(i, 1);
    localStorage.setItem(TODO_KEY, JSON.stringify(all));
  } catch (e) { /* ignore */ }
}

// Search over this month's rows (+ Recent, which can reach into last month):
// case-insensitive merchant/category substring, or an amount that starts with
// the typed digits. Results are the same tappable rows as everywhere else.
function renderSearch(q) {
  const out = $('searchOut');
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) { out.innerHTML = ''; return; }
  const seen = new Set();
  const pool = [...(data.monthRows || []), ...(data.recent || [])].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    const amt = t.amountMYR === null ? '' : String(Math.abs(t.amountMYR));
    return String(t.merchant || '').toLowerCase().includes(q) || String(t.category || '').toLowerCase().includes(q) ||
      (/^[\d.,]+$/.test(q) && amt.startsWith(q.replace(/,/g, '')));
  }).slice(0, 30);
  out.innerHTML = pool.length
    ? pool.map((t, i) => txnRow(t, 'data-si="' + i + '"')).join('') + (pool.length === 30 ? '<div class="muted" style="font-size:12px;margin-top:6px">First 30 shown — narrow it down.</div>' : '')
    : '<div class="muted" style="font-size:13px;padding:12px 0 2px">No match this month.</div>';
  out.querySelectorAll('.txn[data-si]').forEach((el) => {
    el.addEventListener('click', () => openRowSheet(pool[Number(el.dataset.si)]));
  });
}

// One tappable transaction line (Recent, drill-down). A 🏷 marks a fronted tag.
function txnRow(t, attr) {
  const inflow = t.amountMYR !== null && t.amountMYR < 0;
  return `<div class="txn tappable" role="button" tabindex="0" ${attr}>${catIcon(t.category)}<div style="min-width:0;flex:1"><div class="m">${esc(t.merchant || '(no merchant)')}</div>
    <div class="sub">${esc(fmtDay(t.date))} &middot; ${esc(t.category)}${t.fronted ? ` &middot; <span style="color:var(--yellow)">fronted: ${esc(t.fronted)}</span>` : ''}</div></div>
    <div class="val${inflow ? ' in' : ''}">${t.amountMYR === null ? '—' : (inflow ? '+' + fmt(-t.amountMYR) : fmt(t.amountMYR))}</div><span class="chev" aria-hidden="true">&rsaquo;</span></div>`;
}

// Every bottom sheet is a modal dialog: labelled by its #sheetTitle, focus moves
// into it (and back to what opened it on close), Tab stays inside, Escape closes.
let sheetReturnFocus = null;
function mountSheet(inner, closeLabel) {
  const sheet = $('sheet');
  if (sheet.classList.contains('hidden')) sheetReturnFocus = document.activeElement;
  sheet.innerHTML = `<div class="inner scroll" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${inner}
    <button class="btn secondary" id="sheetCancel">${closeLabel || 'Close'}</button></div>`;
  sheet.classList.remove('hidden');
  // Everything behind the sheet leaves the accessibility tree and tab order.
  $('app').inert = true;
  $('nav').inert = true;
  // Property, not addEventListener: a {once} listener was consumed by any tap
  // INSIDE the sheet (clicks bubble), leaving the backdrop dead afterwards.
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };
  $('sheetCancel').addEventListener('click', closeSheet);
  const title = $('sheetTitle');
  if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
  return sheet;
}
const showSheet = (inner) => mountSheet(inner);

function sheetKeys(e) {
  const sheet = $('sheet');
  if (sheet.classList.contains('hidden')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('button, input, select, [tabindex="0"]')].filter((x) => !x.closest('.hidden') && !x.disabled);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// In-app confirm (replaces window.confirm): the destructive action is a big,
// clearly coloured button, and the question stays readable on the sheet.
function confirmSheet(title, body, confirmLabel, alt) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = mountSheet(`<div id="sheetTitle" style="font-size:17px;font-weight:700">${title}</div>
      <div class="muted" style="font-size:14px;margin-top:6px;line-height:1.45">${body}</div>
      <button class="btn danger" id="confirmYes">${confirmLabel}</button>
      ${alt ? `<button class="btn quiet" id="confirmAlt">${alt.label}</button>` : ''}`, 'Cancel');
    const finish = (v) => { if (!answered) { answered = true; resolve(v); } };
    sheet.querySelector('#confirmYes').addEventListener('click', () => { finish(true); closeSheet(); });
    if (alt) sheet.querySelector('#confirmAlt').addEventListener('click', () => { finish(false); sheetOnClose = null; alt.run(); });
    sheetOnClose = () => finish(false);
  });
}
let sheetOnClose = null;

// Drill-down: every transaction in one category this month (backend monthRows).
function openCategorySheet(cat) {
  const rows = (data.monthRows || []).filter((t) => t.category === cat);
  if (!data.monthRows) return toast('Needs a newer backend — refresh');
  const total = rows.reduce((s, t) => s + (t.amountMYR || 0), 0);
  const cap = (data.budgets || {})[cat];
  const hist = data.history || {};
  const months = Object.keys(hist).sort().reverse();
  // Compare like with like: this month's projected landing (backend projByCat,
  // one-offs not extrapolated) against last month's full total — month-to-date
  // vs a whole month always looked "down" early in the month.
  const proj = data.projByCat && typeof data.projByCat[cat] === 'number' ? Math.max(data.projByCat[cat], total) : null;
  const prev = months.length ? hist[months[0]][cat] || 0 : 0;
  const prevName = months.length ? MONTHS[Number(months[0].split('-')[1]) - 1] : '';
  let trend = '';
  if (proj !== null && prev > 0) {
    const tone = proj > prev * 1.1 ? ['var(--amber)', 'up on'] : proj < prev * 0.9 ? ['var(--green)', 'down on'] : ['var(--muted)', 'about the same as'];
    trend = `<div style="font-size:13px;margin-top:6px">On pace for <b>${fmt(proj)}</b> &mdash; <span style="color:${tone[0]}">${tone[1]} ${prevName} (${fmt(prev)})</span></div>`;
  }
  const histLine = months.length
    ? `<div class="muted" style="font-size:12px;margin-top:4px">${months.map((m) => {
        const p = m.split('-');
        return `${MONTHS[Number(p[1]) - 1]}: <b style="color:var(--text)">${fmt(hist[m][cat] || 0)}</b>`;
      }).join(' &middot; ')}</div>`
    : '';
  const sheet = showSheet(`<div id="sheetTitle" style="font-size:17px;font-weight:700">${esc(cat)}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${plural(rows.length, 'transaction')} this month &middot; ${fmt(total)}${cap ? ' of ' + fmt(cap) : ''}</div>${trend}${histLine}
    <div style="margin-top:6px">${rows.length ? rows.map((t, i) => txnRow(t, 'data-mi="' + i + '"')).join('')
      : '<div class="muted" style="font-size:14px;padding:14px 0">Nothing yet this month.</div>'}</div>`);
  sheet.querySelectorAll('.txn[data-mi]').forEach((el) => {
    // Opening a row keeps the way back: its Close returns to this list.
    el.addEventListener('click', () => openRowSheet(rows[Number(el.dataset.mi)], () => openCategorySheet(cat)));
  });
}

async function setFronted(id, name) {
  if (isDemo()) return { ok: true };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'set_fronted', key: cfg.key, id, name })
  });
  return res.json();
}

// One row: shows it and lets you tag who you fronted it for (any row — card taps
// included, which the Add tab's note can't reach). Only the tag changes backend-side.
async function editQuickAdd(id, fields) {
  if (isDemo()) return { ok: true };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'edit_quickadd', key: cfg.key, id, ...fields })
  });
  return res.json();
}

async function removeImported(id) {
  if (isDemo()) return { ok: true, inActual: true };
  return postJson({ action: 'remove_imported', id });
}

async function fixImported(id, amount) {
  if (isDemo()) return { ok: true, amountMYR: Number(amount) };
  return postJson({ action: 'fix_imported', id, amount });
}

// A row a screenshot import added in the last 24h can be removed as "not real".
function freshImport(t) {
  return ['statement', 'tng', 'alipay'].includes(t.source) && t.createdMs && Date.now() - t.createdMs < 24 * 3600e3;
}

async function notReal(t, after) {
  const yes = await confirmSheet(`Remove &ldquo;${esc(t.merchant)}&rdquo;?`,
    `${t.amountMYR === null ? '' : fmt(t.amountMYR) + ' &middot; '}${esc(fmtDay(t.date))}<br>Only for a misread line that isn&rsquo;t a real transaction. A real one with a wrong number? Fix its amount instead.`,
    'Remove row', t.amountMYR !== null ? { label: 'Fix amount instead', run: () => fixAmountSheet(t, t._onFix) } : null);
  if (!yes) return;
  try {
    const r = await removeImported(t.id);
    if (!r.ok) throw new Error(r.error || 'rejected');
    if (r.inActual) {
      addActualTodo(t);
      toast('Removed — also delete it in Actual (listed on Overview)');
    } else toast('Removed');
    if (after) after();
    refresh();
  } catch (err) {
    toast('Failed: ' + friendly(err));
  }
}

// "Fix amount" for a fresh import whose number was misread: the backend keeps
// the original in a repair trail and the next sync corrects Actual too.
function fixAmountSheet(t, after) {
  const flag = amountFlag(t);
  const sheet = mountSheet(`<div id="sheetTitle" style="font-size:17px;font-weight:700">Fix amount</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${esc(t.merchant)} &middot; ${esc(fmtDay(t.date))} &middot; read as ${fmt(t.amountMYR)}</div>
    ${flag ? `<div class="flag">${flag}</div>` : ''}
    <div class="fieldlabel" id="fixLabel">Correct amount (RM)</div>
    <div style="margin-top:14px"><input type="text" inputmode="decimal" id="fixAmount" aria-labelledby="fixLabel" value="${Math.abs(t.amountMYR)}" autocomplete="off" style="background:var(--fill);font-size:20px;font-weight:700"></div>
    <button class="btn" id="fixSave">Save amount</button>`, 'Cancel');
  sheet.querySelector('#fixSave').addEventListener('click', async () => {
    const v = amountValue($('fixAmount').value);
    if (!(v > 0)) return toast('Amount must be a number more than 0');
    if (Math.abs(v - Math.abs(t.amountMYR)) < 0.005) return toast('Same as before');
    closeSheet();
    try {
      const r = await fixImported(t.id, String(v));
      if (!r.ok) throw new Error(r.error || 'rejected');
      toast(`${t.merchant}: ${fmt(Math.abs(t.amountMYR))} → ${fmt(v)} · Actual updates on the next sync`);
      if (after) after(r.amountMYR);
      refresh();
    } catch (err) {
      toast('Failed: ' + friendly(err));
    }
  });
}

// Change any row's category from its sheet (not just Review rows), with the
// same Undo. The bridge propagates category changes to Actual on its next run.
async function recategorize(t, cat) {
  const was = t.category;
  try {
    const r = await categorize(t.id, cat);
    if (!r.ok) throw new Error(r.error || 'rejected');
    t.category = cat;
    if (data.review) {
      const before = data.review.length;
      data.review = data.review.filter((x) => x.id !== t.id);
      data.reviewTotal = Math.max(0, (data.reviewTotal || 0) - (before - data.review.length));
      renderReview();
      updateBadge();
    }
    toast(`${t.merchant || 'Row'} → ${cat}`, { label: 'Undo', run: async () => {
      try {
        const u = await categorize(t.id, was || 'Uncategorized');
        if (!u.ok) throw new Error(u.error || 'rejected');
        t.category = was;
        toast('Undone — back to ' + (was || 'Uncategorized'));
      } catch (err) { toast('Undo failed: ' + friendly(err)); }
      refresh();
    } });
    refresh();
  } catch (err) {
    toast('Failed: ' + friendly(err));
  }
}

function openRowSheet(t, back) {
  if (!t) return;
  // Your own quick-adds are editable (merchant/amount/date) after the undo
  // window; card/TnG rows are statement-matched and stay as captured.
  const editable = t.source === 'manual';
  const editBlock = editable ? `<button type="button" class="linkbtn" id="editToggle" aria-expanded="false" aria-controls="editBlock">Edit this quick-add &rsaquo;</button>
    <div id="editBlock" class="hidden">
    <div style="margin-top:4px"><input type="text" id="editMerchant" aria-label="Merchant" value="${esc(t.merchant || '')}" placeholder="Merchant" autocomplete="off" style="background:var(--fill)"></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <input type="text" inputmode="decimal" id="editAmount" aria-label="Amount (RM)" value="${t.amountMYR === null ? '' : Math.abs(t.amountMYR)}" placeholder="Amount (RM)" style="flex:1;background:var(--fill)" autocomplete="off">
      <input type="date" id="editDate" aria-label="Date" max="${localToday()}" value="${esc(t.date)}" style="flex:1;background:var(--fill)"></div>
    <button class="btn secondary" id="editSave">Save changes</button></div>` : '';
  const flag = freshImport(t) ? amountFlag(t) : null;
  const removeBlock = freshImport(t)
    ? `<div class="muted" style="font-size:12px;margin-top:14px">Imported from a screenshot ${Math.round((Date.now() - t.createdMs) / 3600e3)}h ago.</div>
       ${flag ? `<div class="flag">Check the amount: ${flag}</div>` : ''}
       <div style="display:flex;gap:10px">${t.amountMYR !== null ? '<button class="btn quiet" id="fixBtn">Fix amount</button>' : ''}
       <button class="btn quiet" id="notRealBtn" style="color:var(--red)">Not real</button></div>` : '';
  const sheet = mountSheet(`<div id="sheetTitle" style="font-size:17px;font-weight:700">${esc(t.merchant || '(no merchant)')}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${esc(fmtDay(t.date))} &middot; ${t.amountMYR === null ? 'no amount' : fmt(t.amountMYR)} &middot; ${esc(srcLabel(t.source))}</div>
    <div class="fieldlabel" id="rowCatLabel">Category${NOT_PICKABLE[t.category] ? ' &mdash; not set yet' : ''}</div>
    <div class="chips cats" id="rowCats" role="group" aria-labelledby="rowCatLabel">${catChipsHtml(pickableCats(true),
      topCats([...(NOT_PICKABLE[t.category] ? [] : [t.category]), ...(suggestCategory(t) ? [suggestCategory(t)] : [])]), t.category)}</div>${removeBlock}${editBlock}
    <button type="button" class="linkbtn" id="frontToggle" aria-expanded="${t.fronted ? 'true' : 'false'}" aria-controls="frontRow">${t.fronted ? 'Fronted for ' + esc(t.fronted) : (t.amountMYR !== null && t.amountMYR < 0 ? 'Repayment from someone?' : 'Paid this for someone?')} &rsaquo;</button>
    <div id="frontRow" class="${t.fronted ? '' : 'hidden'}">
    <div class="muted" style="font-size:13px;margin-top:2px">${t.amountMYR !== null && t.amountMYR < 0
      ? 'Tag the repayment with the same name as the spend it pays back.'
      : 'Tag them — the Owed-to-you card tracks it until they pay you back.'}</div>
    <div style="margin-top:10px"><input type="text" id="frontedName" list="frontedNames" aria-label="Fronted for (name)" placeholder="Their name" value="${esc(t.fronted || '')}" autocomplete="off" style="background:var(--fill)"></div>
    <div style="display:flex;gap:10px"><button class="btn secondary" id="frontedSave">Save tag</button>
    ${t.fronted ? '<button class="btn quiet" id="frontedClear">Remove tag</button>' : ''}</div></div>`, back ? 'Back' : 'Close');
  if (back) sheetOnClose = back;
  const rowCats = sheet.querySelector('#rowCats');
  wireMore(rowCats);
  // Disclosures: the sheet opens on the category chips; the rest unfolds on request.
  [['frontToggle', 'frontRow', 'frontedName'], ['editToggle', 'editBlock', 'editMerchant']].forEach(([tg, blk, focusId]) => {
    const btn = sheet.querySelector('#' + tg);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const open = sheet.querySelector('#' + blk).classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!open));
      if (!open) sheet.querySelector('#' + focusId).focus({ preventScroll: true });
    });
  });
  rowCats.querySelectorAll('button[data-c]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.c === t.category) return toast('Already ' + t.category);
    sheetOnClose = null;
    closeSheet();
    recategorize(t, b.dataset.c);
  }));
  const save = async (name) => {
    sheetOnClose = null;
    closeSheet();
    try {
      const r = await setFronted(t.id, name);
      if (!r.ok) throw new Error(r.error || 'rejected');
      t.fronted = name || null;
      toast(name ? `${t.merchant} → fronted: ${name}` : 'Tag removed');
      refresh();
    } catch (err) {
      toast('Failed: ' + friendly(err));
    }
  };
  sheet.querySelector('#frontedSave').addEventListener('click', () => {
    const name = $('frontedName').value.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return toast('Type a name, or use Remove tag');
    save(name);
  });
  const clear = sheet.querySelector('#frontedClear');
  if (clear) clear.addEventListener('click', () => save(''));
  const notRealBtn = sheet.querySelector('#notRealBtn');
  if (notRealBtn) notRealBtn.addEventListener('click', () => { sheetOnClose = null; notReal(t); });
  const fixBtn = sheet.querySelector('#fixBtn');
  if (fixBtn) fixBtn.addEventListener('click', () => { sheetOnClose = null; fixAmountSheet(t); });
  const editSave = sheet.querySelector('#editSave');
  if (editSave) {
    editSave.addEventListener('click', async () => {
      const merchant = $('editMerchant').value.trim();
      const value = amountValue($('editAmount').value);
      const date = $('editDate').value;
      if (!merchant) return toast('Merchant cannot be empty');
      if (!(value > 0)) return toast('Amount must be a number more than 0');
      const fields = {};
      if (merchant !== t.merchant) fields.merchant = merchant;
      const signed = t.amountMYR !== null && t.amountMYR < 0 ? -value : value; // keep a repayment negative
      if (t.amountMYR === null || Math.abs(signed - t.amountMYR) > 0.004) fields.amount = String(signed);
      if (date && date !== t.date) fields.date = date;
      if (!Object.keys(fields).length) return toast('Nothing changed');
      sheetOnClose = null;
      closeSheet();
      try {
        const r = await editQuickAdd(t.id, fields);
        if (!r.ok) throw new Error(r.error || 'rejected');
        toast('Saved — syncs to Actual on the next run');
        refresh();
      } catch (err) {
        toast('Failed: ' + friendly(err));
      }
    });
  }
}

// The settlement audit, on the phone. Tolerance RM20 = normal Alipay-wallet /
// rounding drift (the 2 Sep precedent writes larger residuals off to Buffer).
function runAudit() {
  const a = data.audit;
  // Two fields, summed here: the RHB and TnG apps each show one balance, so
  // nobody has to add them up in their head.
  const rhb = amountValue($('auditRhb').value);
  const tngRaw = $('auditTng').value.trim();
  const tng = tngRaw ? amountValue(tngRaw) : 0;
  const out = $('auditOut');
  if (!(rhb >= 0) || !(tng >= 0)) { out.innerHTML = ''; return toast('Type each balance as a number'); }
  const real = Math.round((rhb + tng) * 100) / 100;
  const expected = Math.round((a.cashMYR + a.autologMYR + a.unbilledMYR) * 100) / 100;
  const gap = Math.round((real - expected) * 100) / 100;
  const tone = Math.abs(gap) <= 20 ? 'var(--green)' : 'var(--amber)';
  const verdict = Math.abs(gap) <= 20
    ? `Balanced &mdash; within RM20 (normal wallet/rounding drift).`
    : gap < 0
      ? `${fmt(-gap)} <b>missing</b>: money left RHB/TnG that the system doesn't know about. Usual suspect: a bank-app transfer &mdash; drop your RHB transfer history in the inbox's <b>RHB Transfers</b> folder and the report will name it.`
      : `${fmt(gap)} <b>more</b> than expected: a repayment not logged with Paid back, a refund, or a spend counted twice.`;
  out.innerHTML = `<div style="font-size:13px;margin-top:12px;line-height:1.5">
    <div class="txn"><div class="m">Your total</div><div class="val">${fmt(real)}</div></div>
    <div class="txn"><div class="m">Expected</div><div class="val">${fmt(expected)}</div></div>
    <div class="sub" style="margin-top:-4px">In Actual: Cash ${fmt(a.cashMYR)} &middot; Autolog account ${fmt(a.autologMYR)} &middot; card taps not billed yet ${fmt(a.unbilledMYR)}</div>
    <div class="txn"><div class="m">Gap</div><div class="val" style="color:${tone}">${gap >= 0 ? '+' : ''}${fmt(gap)}</div></div>
    <div style="color:${tone}">${verdict}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">Actual figures as of ${esc(a.asOf || 'the last sync')} &mdash; anything paid since then shows up as a gap.</div></div>`;
}

// More tab (27 Sep 2026): the monthly/occasional cards, off the daily Overview —
// search, the month-end balance check, and the savings pots.
function renderMore() {
  let html = '';
  // Capture coverage: how far each statement channel is imported ("synced until").
  // Older backends don't send `coverage` — hide the card entirely then.
  if (data.coverage) {
    const CHANNELS = [['tng', 'TNG eWallet'], ['hsbc', 'HSBC'], ['rhb', 'RHB Card'], ['alipay', 'Alipay']];
    html += `<div class="card"><h3>Statements synced until</h3><div style="margin-top:4px">` +
      CHANNELS.map(([k, label]) => {
        const d = data.coverage[k];
        return `<div class="txn"><div class="m">${label}</div>
          <div class="val" style="font-weight:600;color:${d ? 'var(--text)' : 'var(--muted)'}">${d ? esc(fmtCoverageDate(d)) : 'no imports yet'}</div></div>`;
      }).join('') +
      `</div><div class="muted" style="font-size:12px;margin-top:8px">Newest imported transaction per source &mdash; spends after these dates arrive with your next screenshot/statement drop.</div></div>`;
  }

  html += `<div class="card"><h3>Search this month</h3>
    <div><input type="search" id="searchBox" aria-label="Search this month" placeholder="Merchant or amount, e.g. ikea or 117" autocomplete="off" style="background:var(--fill)"></div>
    <div id="searchOut"></div></div>`;
  // Emergency Fund progress (bridge-mirrored daily; older backends omit the field).
  // The bar shows progress toward a soft 3-month cushion of CORE OUTFLOW (loan,
  // bills, living envelopes — the backend's efMonthlyBasisMYR). Budgets-tab caps
  // were the wrong denominator: they omit the loan and include savings pots.
  if (typeof data.efBalanceMYR === 'number') {
    const basis = data.efMonthlyBasisMYR > 0 ? data.efMonthlyBasisMYR : null;
    const months = basis ? data.efBalanceMYR / basis : null;
    const goalPct = months !== null ? Math.min(100, months / 3 * 100) : 0;
    html += `<div class="card"><h3>Emergency Fund</h3>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px">
        <div style="font-size:24px;font-weight:800;letter-spacing:-.5px">${fmt(data.efBalanceMYR)}</div>
        ${months !== null ? `<div class="muted" style="font-size:13px;font-weight:600">&asymp; ${months.toFixed(1)} mo of core outflow</div>` : ''}</div>
      ${months !== null ? `<div class="track" style="margin-top:10px" role="progressbar" aria-label="Emergency Fund toward a 3-month cushion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(goalPct)}"><div class="fill" style="width:${Math.max(2, goalPct)}%;background:var(--blue)" data-w="1"></div></div>
      <div class="muted" style="font-size:12px;margin-top:7px">toward a 3-month cushion (${fmt(basis * 3)}) &middot; the envelope only &mdash; off-budget savings not counted</div>` : ''}</div>`;
  }

  // Buffer vs its floor (bridge-mirrored daily; floor defaults to RM2,500 — the
  // worst single-month shock seen). Refilled by salary above plan, never swept.
  if (data.buffer && typeof data.buffer.balanceMYR === 'number') {
    const b = data.buffer;
    const ok = b.balanceMYR >= b.floorMYR;
    const pct = b.floorMYR > 0 ? Math.max(2, Math.min(100, Math.round(b.balanceMYR / b.floorMYR * 100))) : 100;
    html += `<div class="card"><h3>Buffer</h3>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px">
        <div style="font-size:24px;font-weight:800;letter-spacing:-.5px">${fmt(b.balanceMYR)}</div>
        <div class="muted" style="font-size:13px;font-weight:600">floor ${fmt(b.floorMYR)}</div></div>
      <div class="track" style="margin-top:10px" role="progressbar" aria-label="Buffer against its floor" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="fill" style="width:${pct}%;background:${ok ? 'var(--green)' : 'var(--amber)'}" data-w="1"></div></div>
      <div style="font-size:12px;margin-top:7px;color:${ok ? 'var(--muted)' : 'var(--amber)'}">${ok
        ? `${fmt(b.balanceMYR - b.floorMYR)} above the floor &middot; covers one-off shocks`
        : `${fmt(b.floorMYR - b.balanceMYR)} below the floor &mdash; salary above plan refills it first`}</div></div>`;
  }

  // Phone audit: expected real RHB + TnG = Cash + Autolog (the sum doesn't change
  // when you settle) + card taps not yet billed. The typed balance never leaves
  // the phone and isn't stored.
  if (data.audit) {
    // Rows still in Review aren't in Actual, so they'd show up as a false gap:
    // say so BEFORE the check, not after the verdict.
    const pending = data.reviewTotal
      ? `<div class="flag" style="display:block;margin:0 0 10px">${plural(data.reviewTotal, 'row')} still in Review aren&rsquo;t in Actual yet &mdash; categorise them first or the check will show a false gap.</div>` : '';
    html += `<div class="card"><h3>Balance check</h3>${pending}
      <div class="muted" style="font-size:13px">Your real balances right now, from each app.</div>
      <div style="display:flex;gap:10px;margin-top:10px">
        <input type="text" inputmode="decimal" id="auditRhb" aria-label="RHB balance" placeholder="RHB" autocomplete="off" style="flex:1;background:var(--fill)">
        <input type="text" inputmode="decimal" id="auditTng" aria-label="TnG balance" placeholder="TnG" autocomplete="off" style="flex:1;background:var(--fill)"></div>
      <button class="btn" id="auditBtn">Check</button>
      <div id="auditOut"></div></div>`;
  }

  html += `<div class="card"><h3>Quick add opens as</h3>
    <div class="seg" style="margin-top:12px" role="group" aria-label="Quick add style">
      <button type="button" id="styleSheet" aria-pressed="${addAsSheet()}">Sheet over the screen</button>
      <button type="button" id="styleTab" aria-pressed="${!addAsSheet()}">Its own tab</button></div>
    <div class="muted" style="font-size:12px;margin-top:8px">Sheet: the keypad comes up at once and the screen behind stays put. Switch back here any time.</div></div>`;
  html += `<div class="card"><h3>How the numbers work</h3><ul class="muted" style="font-size:13px;line-height:1.55;margin:4px 0 0;padding-left:18px">
    <li><b style="color:var(--text)">Safe to spend</b> &mdash; what&rsquo;s left across every budgeted envelope, divided by the days left this month (today included). An overspent envelope counts against the others.</li>
    <li><b style="color:var(--text)">Pace tick</b> &mdash; the small mark on a bar is where this month is heading; &ldquo;heading RM20 over&rdquo; means that projection passes the cap.</li>
    <li><b style="color:var(--text)">The rules</b> &mdash; keyword rules in the sheet&rsquo;s Rules tab pick a category from the merchant name; anything they miss waits in Review.</li>
    <li><b style="color:var(--text)">Buffer floor</b> &mdash; the cushion for one-off shocks (the worst single month seen); salary above plan refills it before anything else.</li></ul></div>`;
  html += `<div class="muted" style="text-align:center;margin-top:20px;font-size:12px">Updated ${esc(fmtUpdated(data.generatedAt))}</div>`;
  // Only the data cards re-render; the static import card above keeps its
  // chosen files and the last import's review list across refreshes.
  const view = $('more-dyn');
  const q = $('searchBox') ? $('searchBox').value : '';
  view.innerHTML = html;
  animateFills('more-dyn');
  const auditBtn = $('auditBtn');
  if (auditBtn) auditBtn.addEventListener('click', runAudit);
  [['styleSheet', 'sheet'], ['styleTab', 'tab']].forEach(([id, v]) => $(id).addEventListener('click', () => {
    setAddStyle(v);
    $('styleSheet').setAttribute('aria-pressed', String(v === 'sheet'));
    $('styleTab').setAttribute('aria-pressed', String(v === 'tab'));
    toast(v === 'sheet' ? 'Quick add now opens as a sheet' : 'Quick add now has its own tab');
  }));
  const searchBox = $('searchBox');
  if (searchBox) {
    searchBox.value = q;
    searchBox.addEventListener('input', () => renderSearch(searchBox.value));
    if (q) renderSearch(q);
  }
}

// Batch selection state for the Review tab: "Select" flips the list into
// multi-select, then one category tap fixes every selected row.
let reviewSelectMode = false;
let reviewSel = new Set();
const inFlightIds = new Set(); // rows whose categorize POST hasn't answered yet

function renderReview() {
  const list = (data.review || []).filter((t) => !inFlightIds.has(t.id));
  data.review = list;
  reviewSel = new Set([...reviewSel].filter((id) => list.some((t) => t.id === id)));
  if (list.length <= 1) reviewSelectMode = false; // the Select/Done toggle hides below 2 rows
  let html = '';
  if (!list.length) {
    html = `<div class="card" style="text-align:center;padding:34px 16px">
      <div style="font-size:40px">🎉</div>
      <div style="font-size:17px;font-weight:700;margin-top:8px">Nothing to review</div>
      <div class="muted" style="font-size:14px;margin-top:4px">Every transaction is categorised &mdash; all clear to sync to Actual Budget.</div></div>`;
  } else {
    html = `<div class="card list"><h3>
      <span>Needs a category (${data.reviewTotal})</span>
      ${list.length > 1 ? `<button type="button" id="selToggle" class="cardhead-btn">${reviewSelectMode ? 'Done' : 'Select'}</button>` : ''}</h3>` +
      list.map((t, i) => `<div class="txn tappable" data-i="${i}" tabindex="0" ${reviewSelectMode
          ? `role="checkbox" aria-checked="${reviewSel.has(t.id)}"` : 'role="button"'}>
        ${reviewSelectMode ? `<span class="selbox" aria-hidden="true"><span class="selmark${reviewSel.has(t.id) ? ' on' : ''}"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.4l2.6 2.6L11 4.4"/></svg></span></span>` : catIcon(suggestCategory(t) || t.category)}
        <div style="min-width:0;flex:1">
        <div class="m">${esc(t.merchant || '(no merchant)')}</div>
        <div class="sub">${esc(fmtDay(t.date))} &middot; ${esc(srcLabel(t.source))}${t.category === 'REVIEW' ? ' &middot; REVIEW' : ''}${(() => { const g = suggestCategory(t); return g ? ` &middot; <span style="color:var(--text);font-weight:600">maybe ${esc(g)}</span>` : ''; })()}</div></div>
        <div class="val">${t.amountMYR === null ? '—' : fmt(t.amountMYR)}</div></div>`).join('') +
      '</div>' +
      (reviewSelectMode && reviewSel.size
        ? `<button class="btn" id="batchBtn">Categorise ${reviewSel.size} selected&hellip;</button>`
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
      const again = document.querySelector(`#view-review .txn[data-i="${el.dataset.i}"]`);
      if (again) again.focus({ preventScroll: true }); // keep keyboard/VoiceOver place
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
  const cats = pickableCats(true);
  const suggested = many ? null : suggestCategory(txns[0]);
  const head = many
    ? `${txns.length} transactions`
    : esc(txns[0].merchant || '(no merchant)');
  const sub = many
    ? 'one category for all of them'
    : `${esc(fmtDay(txns[0].date))} &middot; ${txns[0].amountMYR === null ? 'no amount' : fmt(txns[0].amountMYR)} &middot; ${esc(srcLabel(txns[0].source))}`;
  const sheet = mountSheet(`<div id="sheetTitle" style="font-size:17px;font-weight:700">${head}</div>
    <div class="muted" style="font-size:13px;margin-top:2px">${sub}</div>
    ${suggested ? `<div class="muted" style="font-size:12px;margin-top:10px">Suggested &mdash; this merchant is ${esc(suggested)} elsewhere</div>` : ''}
    <div class="chips cats" id="catPick" role="group" aria-label="Category">${catChipsHtml(cats, topCats(suggested ? [suggested] : []), null)}</div>
    <div class="muted" style="font-size:12px;margin-top:10px">New envelopes appear here once they&rsquo;re funded in Actual.</div>`, 'Cancel');
  const holder = sheet.querySelector('#catPick');
  wireMore(holder);
  holder.querySelectorAll('button[data-c]').forEach((b) => {
    b.addEventListener('click', async () => {
      const cat = b.dataset.c;
      closeSheet();
      applyCategory(txns, cat);
    });
  });
}

async function applyCategory(txns, cat) {
  const many = txns.length > 1;
  // Take the rows off screen BEFORE the (slow, sequential) POSTs so they
  // can't be tapped and submitted twice; any refresh landing mid-loop is
  // filtered through inFlightIds so it can't resurrect them either.
  txns.forEach((t) => inFlightIds.add(t.id));
  const before = data.review.length;
  data.review = data.review.filter((x) => !inFlightIds.has(x.id));
  data.reviewTotal = Math.max(0, (data.reviewTotal || 0) - (before - data.review.length));
  reviewSel.clear();
  reviewSelectMode = false;
  renderReview();
  updateBadge();
  const done = [];
  let lastErr = null;
  const failed = [];
  for (const txn of txns) { // sequential: each categorize takes the backend lock
    try {
      const r = await categorize(txn.id, cat);
      if (!r.ok) throw new Error(r.error || 'rejected');
      done.push(txn);
    } catch (err) {
      lastErr = err;
      failed.push(txn);
    }
  }
  txns.forEach((t) => inFlightIds.delete(t.id));
  if (failed.length) {
    data.review = failed.concat(data.review);
    data.reviewTotal += failed.length;
    renderReview();
    updateBadge();
  }
  // Undo (10s, paused while focused): put each row back to the category it had (Uncategorized/REVIEW).
  const undo = done.length ? { label: 'Undo', run: () => undoCategory(done) } : null;
  if (lastErr) toast(`${done.length}/${txns.length} → ${cat} · last error: ${friendly(lastErr)}`, undo);
  else toast(many ? `${done.length} transactions → ${cat}` : `${txns[0].merchant || 'Row'} → ${cat}`, undo);
  if (done.length) refresh(); // Overview spend + the >100-row review tail catch up
}

async function undoCategory(rows) {
  let back = 0;
  for (const t of rows) {
    try {
      const r = await categorize(t.id, t.category || 'Uncategorized');
      if (!r.ok) throw new Error(r.error || 'rejected');
      back++;
    } catch (err) { /* reported below */ }
  }
  toast(back === rows.length ? 'Undone — back in Review' : `Undo: ${back}/${rows.length} restored — refresh to check`);
  if (isDemo()) {
    data.review = rows.concat(data.review);
    data.reviewTotal = (data.reviewTotal || 0) + rows.length;
    renderReview();
    updateBadge();
  }
  refresh();
}

// A pending sheetOnClose runs once (a confirm answered "no", or a row sheet
// returning to its drill-down list); otherwise focus goes back to the opener.
function closeSheet() {
  $('sheet').classList.add('hidden');
  $('app').inert = false;
  $('nav').inert = false;
  const next = sheetOnClose;
  sheetOnClose = null;
  if (next) { next(); return; }
  healViewport();
  if (sheetReturnFocus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus({ preventScroll: true });
  sheetReturnFocus = null;
}

// iOS (especially standalone) keeps the visual viewport shrunk after the keyboard or a
// prompt() closes, until a real scroll event fires - the fixed tab bar floats mid-screen
// on pages too short to scroll. The body is kept 2px taller than the viewport so this
// nudge always produces a genuine scroll and snaps the viewport back.
// The nudge returns to the CURRENT scroll position — ending on scrollTo(0, 0)
// yanked a long Review list back to the top after every categorize.
function healViewport() {
  setTimeout(() => {
    const y = window.scrollY;
    window.scrollTo(0, y > 0 ? y - 1 : 1);
    window.scrollTo(0, y);
  }, 80);
}

function updateBadge() {
  const n = data ? data.reviewTotal || 0 : 0;
  $('badge').textContent = n;
  $('badge').classList.toggle('hidden', !n);
  $('tab-review').setAttribute('aria-label', n ? `Review, ${n} to categorise` : 'Review');
  const pill = $('statusPill');
  if (n) { pill.className = 'pill bad'; pill.textContent = n + ' to review'; }
  else { pill.className = 'pill good'; pill.textContent = 'all clear'; }
  pill.setAttribute('aria-label', n ? `${n} to review — open Review` : 'All clear — open Review');
}

function setTab(t) {
  tab = t;
  ['overview', 'review', 'add', 'more'].forEach((v) => {
    $('view-' + v).classList.toggle('hidden', t !== v);
    $('tab-' + v).classList.toggle('on', t === v);
    if (t === v) $('tab-' + v).setAttribute('aria-current', 'page'); else $('tab-' + v).removeAttribute('aria-current');
  });
  healViewport();
}

// Add form (critique 29 Sep 2026): Spend | Paid back is a mode, not a
// checkbox; amount first; category chips with icons (top 4 + More, no reserved
// categories — a manual REFUND/TRANSFER would fight the netting logic); and
// "paid for someone" is its own field with name chips instead of a note syntax.
let addMode = 'spend';
const addPaid = () => addMode === 'paid';

function setAddMode(mode) {
  addMode = mode;
  $('modeSpend').setAttribute('aria-pressed', String(mode === 'spend'));
  $('modePaid').setAttribute('aria-pressed', String(mode === 'paid'));
  $('addTitle').textContent = addPaid() ? 'Log a repayment' : 'Log a spend';
  $('addSave').textContent = addSaveLabel();
  $('addMerchant').placeholder = addPaid() ? 'What for, e.g. Ali dinner' : 'Merchant';
  $('catLabel').textContent = addPaid() ? 'Envelope you paid it from — required' : 'Category — optional, the rules decide';
  $('frontLabel').textContent = addPaid() ? 'Who paid you back?' : 'Paid for someone? (optional)';
  // Paid back starts with "who": picking the name fills amount, label and
  // envelope. A spend keeps it as an optional extra below the category.
  const block = $('frontBlock');
  if (addPaid()) $('addCard').insertBefore(block, $('amountRow'));
  else $('addCard').insertBefore(block, $('extraToggle'));
  fillNameChips();
  fillRecentChips();
  syncAddDisclosure();
}

// The rarely-used fields (who you paid for, date, note) sit behind ONE quiet line
// in Spend mode, so the first screen is amount, merchant, category, Log. Paid back
// needs "who" up top, so only date/note fold there. Anything in use stays shown.
let addMoreOpen = false;
function syncAddDisclosure() {
  const who = $('addFronted').value.trim();
  const extraInUse = ($('addDate').value && $('addDate').value !== localToday()) || $('addNote').value.trim();
  const open = addMoreOpen || !!extraInUse;
  $('addExtra').classList.toggle('hidden', !open);
  $('frontBlock').classList.toggle('hidden', !(addPaid() || open || who));
  $('extraToggle').classList.toggle('hidden', open);
  $('extraToggle').setAttribute('aria-expanded', String(open));
  $('extraToggle').textContent = addPaid() ? 'More options · date or note' : 'More options · date, note, paid for someone';
}
function showAddExtra(open) {
  addMoreOpen = open;
  syncAddDisclosure();
}

// Sheet style: the form's nodes move from #view-add into the sheet (their
// listeners travel with them) and move back when it closes.
function openAddSheet() {
  if (!$('sheet').classList.contains('hidden')) return;
  mountSheet('<div id="addHost"></div>', 'Close');
  const host = $('addHost');
  host.appendChild($('addForm'));
  host.appendChild($('addHelp'));
  $('sheet').querySelector('.inner').setAttribute('aria-labelledby', 'addTitle');
  sheetOnClose = () => {
    $('view-add').appendChild($('addForm'));
    $('view-add').appendChild($('addHelp'));
    // A repayment started from Owed and then abandoned must not leave the next
    // tired taxi logging as a repayment.
    if (addPaid() && !$('addAmount').value && !$('addMerchant').value) setAddMode('spend');
    healViewport();
    if (sheetReturnFocus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus({ preventScroll: true });
    sheetReturnFocus = null;
  };
  $('addAmount').focus({ preventScroll: true }); // the keypad is up on arrival
}
function closeAddSheet() { if (!$('sheet').classList.contains('hidden')) closeSheet(); }

// From the Owed card: straight into Paid back with the person picked.
function startRepayment(f) {
  if (addAsSheet()) openAddSheet();
  else { setTab('add'); window.scrollTo(0, 0); }
  setAddMode('paid');
  const chip = [...$('nameChips').querySelectorAll('button')].find((b) => b.dataset.name === f.name);
  if (chip) chip.click();
}

function selectedAddCat() { return $('addChips').querySelector('.sel')?.dataset.c; }

function fillAddChips(select) {
  const holder = $('addChips');
  const selected = select !== undefined ? select : selectedAddCat();
  const cats = pickableCats(false);
  if (selected && !cats.includes(selected) && !NOT_PICKABLE[selected]) cats.push(selected);
  holder.innerHTML = catChipsHtml(cats, topCats(), selected);
  wireMore(holder);
  holder.querySelectorAll('button[data-c]').forEach((b) => {
    b.addEventListener('click', () => {
      const was = b.classList.contains('sel');
      holder.querySelectorAll('button[data-c]').forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
      if (!was) { b.classList.add('sel'); b.setAttribute('aria-pressed', 'true'); } // tap again = let the rules decide
    });
  });
}

// Name chips: people who owe you (both modes). In Paid back, a name also
// prefills what they owe and the envelope of their latest fronted spend.
function fillNameChips() {
  const holder = $('nameChips');
  if (!holder) return;
  const owed = (data && data.fronted) || [];
  holder.classList.toggle('hidden', !owed.length);
  const current = $('addFronted').value.trim().toLowerCase();
  holder.innerHTML = owed.slice(0, 6).map((f, i) => {
    const on = current && f.name.toLowerCase() === current;
    return `<button type="button" data-n="${i}" data-name="${esc(f.name)}"${on ? ' class="sel"' : ''} aria-pressed="${on ? 'true' : 'false'}">${esc(f.name)}${addPaid() ? ` &middot; ${fmt(f.outstandingMYR)}` : ''}</button>`;
  }).join('');
  // Every name ever tagged, as input suggestions: "Ali" vs "Ali B" splits a debt.
  const names = [...new Set([...owed.map((f) => f.name), ...((data && data.monthRows) || []).map((t) => t.fronted).filter(Boolean)])];
  $('frontedNames').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
  holder.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const f = owed[Number(b.dataset.n)];
    $('addFronted').value = f.name;
    holder.querySelectorAll('button').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    if (addPaid()) {
      if (!$('addAmount').value) $('addAmount').value = String(f.outstandingMYR);
      if (!$('addMerchant').value) $('addMerchant').value = 'Repayment - ' + f.name;
      const last = (data.monthRows || []).filter((t) => t.fronted && t.fronted.toLowerCase() === f.name.toLowerCase() && t.amountMYR > 0)[0];
      if (last && !selectedAddCat()) fillAddChips(last.category);
    }
  }));
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
    .filter((t) => addPaid() === (t.amountMYR !== null && t.amountMYR < 0)) // repeat chips match the mode
    .filter((t) => {
      const k = t.merchant.toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    })
    .slice(0, 4);
  holder.classList.toggle('hidden', !recents.length);
  holder.innerHTML = recents.map((t, i) => `<button type="button" data-i="${i}" aria-label="Repeat ${esc(t.merchant)}"><span class="ci" aria-hidden="true">&#8634;&#xfe0e;</span>${esc(t.merchant)}</button>`).join('');
  holder.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const t = recents[Number(b.dataset.i)];
      // amountMYR is MYR and signed: reset the currency, and mirror a repayment
      // row's sign into the mode (else "+45 Food" would log as a spend).
      setAddMode(t.amountMYR !== null && t.amountMYR < 0 ? 'paid' : 'spend');
      $('addMerchant').value = t.merchant;
      $('addAmount').value = t.amountMYR !== null ? String(Math.abs(t.amountMYR)) : '';
      $('addCurrency').value = 'MYR';
      $('addFronted').value = t.fronted || '';
      fillAddChips(t.category); // any category, even one outside the chip pool (Family)
      toast('Prefilled — adjust and log');
    });
  });
}

// "1,200" and "1,234.50" are thousands separators; a lone "12,50" is a decimal
// comma. (The old blanket replace(',', '.') turned "1,200" into RM1.20.)
function amountValue(s) {
  s = String(s || '').replace(/\s/g, '').replace(/^RM/i, '');
  // European grouping, e.g. 1.200,50
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  if (s.indexOf('.') !== -1 || /^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
}

// Screenshot upload from the phone: files -> base64 -> upload_screenshot into
// the chosen inbox folder, then process_inbox_app and show the summary here.
// Replaces the Drive-app drop + waiting for the 07:00 run.
const UPLOAD_FOLDERS = [['tng', 'TnG'], ['hsbc', 'HSBC'], ['rhb', 'RHB Card'], ['rhbxfer', 'RHB Transfers'], ['alipay', 'Alipay']];

async function postJson(payload) {
  const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: cfg.key, ...payload }) });
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('could not read ' + file.name));
    r.readAsDataURL(file);
  });
}

async function uploadAndProcess() {
  const files = [...($('uploadFiles').files || [])];
  const folder = $('uploadChips').querySelector('.sel')?.dataset.f;
  const status = $('uploadStatus');
  if (!folder) return toast('Pick which app the screenshots are from');
  if (!files.length) return toast('Choose one or more screenshots');
  const bad = files.find((f) => !/^image\/(png|jpe?g)$/i.test(f.type));
  if (bad) return toast(bad.name + ': PNG/JPEG only (screenshots, not photos)');
  const btn = $('uploadBtn');
  btn.disabled = true;
  btn.dataset.busy = '1';
  btn.textContent = 'Working…';
  try {
    for (let i = 0; i < files.length; i++) {
      status.textContent = `Uploading ${i + 1} of ${files.length}…`;
      if (files[i].size > 8 * 1024 * 1024) throw new Error(files[i].name + ' is over 8MB');
      const r = isDemo() ? { ok: true } : await postJson({ action: 'upload_screenshot', folder, name: files[i].name, mime: files[i].type, data: await fileToBase64(files[i]) });
      if (!r.ok) throw new Error(r.error || 'upload rejected');
    }
    status.textContent = 'Processing (OCR + reconcile) — this can take a minute…';
    const p = isDemo()
      ? { ok: true, summary: { processed: ['Screenshot (statement): demo.png'], matched: 4, added: 2, refunds: 0, unsupported: [], unparsed: 1, transferCheck: null } }
      : await postJson({ action: 'process_inbox_app' });
    if (isDemo()) p.summary.addedRows = [
      { id: 'x1', date: '2026-08-18', merchant: 'SUBWAY-PETRONAS TTDI', amountMYR: 1300, category: 'Food', source: 'statement', createdMs: Date.now() },
      { id: 'x2', date: '2026-08-18', merchant: 'AEON CO-BANDAR PUCHON', amountMYR: 23.7, category: 'Groceries', source: 'statement', createdMs: Date.now() }];
    if (!p.ok) throw new Error(p.error || 'processing failed');
    const s = p.summary || {};
    if (s.nothingNew) { status.innerHTML = '<span class="muted">Uploaded, but nothing new to process (already handled?).</span>'; return; }
    renderImportSummary(s);
    $('uploadFiles').value = '';
    $('uploadPicked').textContent = '';
    refresh();
  } catch (err) {
    status.innerHTML = `<span style="color:var(--red)">${esc(friendly(err))}</span>`;
  } finally {
    delete btn.dataset.busy;
    syncUploadBtn();
  }
}

// The import result is judged, not just counted (critique 29 Sep 2026): the
// headline is only green when nothing needs a look; amounts far off their
// category's usual size are flagged; every added row has Fix amount / Not real.
function renderImportSummary(s) {
  const status = $('uploadStatus');
  const tc = s.transferCheck;
  const leaks = tc ? tc.unlogged.filter((u) => !u.budgetSide) : [];
  const added = (s.addedRows || []).map((r) => Object.assign({ createdMs: Date.now() }, r));
  const flags = added.map((r) => amountFlag(r));
  const nFlag = flags.filter(Boolean).length;
  const problems = (s.unsupported || []).length || leaks.length || (tc && tc.duplicates.length);
  let head;
  if (problems) head = `<b style="color:var(--red)">Imported ${s.added} &mdash; some things need attention</b>`;
  else if (nFlag || s.unparsed) head = `<b style="color:var(--amber)">Imported ${s.added} &mdash; check ${nFlag ? nFlag + ' flagged amount' + (nFlag === 1 ? '' : 's') : 'the unreadable lines'}</b>`;
  else if (s.added) head = `<b style="color:var(--green)">Imported ${plural(s.added, 'new row')}</b> &mdash; glance for misreads below`;
  else head = `<b>Nothing new</b> &mdash; every line was already logged`;
  status.innerHTML = `<div style="margin-top:8px;line-height:1.6">${head}
    <div class="muted">${s.matched} already logged &middot; ${s.added} added &middot; ${plural(s.refunds, 'refund')}</div>
    ${(s.unsupported || []).length ? `<div style="color:var(--red);margin-top:6px">${plural(s.unsupported.length, 'file')} not processed:</div>
      <ul class="issues">${s.unsupported.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    ${s.unparsed ? `<details class="issues"><summary style="color:var(--amber)">${plural(s.unparsed, 'line')} couldn&rsquo;t be read${(s.unparsedSample || []).length ? ' &mdash; show' : ''}</summary>
      ${(s.unparsedSample || []).length ? `<ul>${s.unparsedSample.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
      <div class="muted" style="font-size:12px">If one is a real spend, add it with Quick add.</div>` : '<div class="muted" style="font-size:12px">The lines are listed in the email report.</div>'}</details>` : ''}
    ${tc ? `<div>RHB transfer check: ${tc.matched} matched${leaks.length ? `, <span style="color:var(--red)">${leaks.length} with no ledger entry</span>` : ''}${tc.duplicates.length ? `, <span style="color:var(--red)">${plural(tc.duplicates.length, 'possible duplicate')}</span>` : ''}</div>
      ${leaks.length ? `<ul class="issues">${leaks.map((u) => `<li>${esc(fmtDay(u.date))} &middot; ${esc(u.desc)} &middot; ${fmt(Math.abs(u.amount))} &mdash; quick-add it if it was spending</li>`).join('')}</ul>` : ''}` : ''}
    <div class="muted" style="font-size:12px">Rows without a category wait in Review.</div></div>
    ${added.length ? `<div class="fieldlabel" style="margin:18px 0 0 0">Added &mdash; check each amount</div><div id="addedList"></div>` : ''}`;
  if (!added.length) return;
  const list = $('addedList');
  // Flagged rows first: they're the likely misreads.
  const order = added.map((r, i) => i).sort((a, b) => (flags[b] ? 1 : 0) - (flags[a] ? 1 : 0));
  list.innerHTML = order.map((i) => {
    const r = added[i];
    return `<div class="txn imported" data-ai="${i}">${catIcon(r.category)}<div style="min-width:0;flex:1">
      <div class="m">${esc(r.merchant)}</div>
      <div class="sub">${esc(fmtDay(r.date))} &middot; ${esc(r.category)}</div>
      ${flags[i] ? `<div class="flag">${flags[i]}</div>` : ''}</div>
      <div class="val">${r.amountMYR === null ? '—' : fmt(r.amountMYR)}</div>
      <div class="rowacts">${r.amountMYR !== null ? `<button type="button" data-fix="${i}" aria-label="Fix amount for ${esc(r.merchant)}">Fix</button>` : ''}
      <button type="button" class="danger" data-nr="${i}" aria-label="${esc(r.merchant)} is not real — remove">Not real</button></div></div>`;
  }).join('');
  list.querySelectorAll('button[data-nr]').forEach((b) => b.addEventListener('click', () => {
    const r = added[Number(b.dataset.nr)];
    notReal(r, () => {
      const row = b.closest('.txn');
      row.querySelector('.rowacts').innerHTML = '<span class="muted" style="font-size:13px">Removed</span>';
      row.style.opacity = '.5';
    });
  }));
  // One "fixed" handler per row, also used when Fix is reached from the
  // Not-real confirm ("Fix amount instead").
  list.querySelectorAll('button[data-fix]').forEach((b) => {
    const r = added[Number(b.dataset.fix)];
    r._onFix = (amt) => {
      r.amountMYR = amt;
      const row = b.closest('.txn');
      row.querySelector('.val').textContent = fmt(amt);
      const f = row.querySelector('.flag');
      if (f) f.remove();
      b.textContent = 'Fixed';
    };
    b.addEventListener('click', () => fixAmountSheet(r, r._onFix));
  });
}

const UPLOAD_FOLDER_KEY = 'autolog.uploadFolder';
// Upload stays disabled (and says why) until an app and some files are chosen.
function syncUploadBtn() {
  const folder = $('uploadChips').querySelector('.sel');
  const n = ($('uploadFiles').files || []).length;
  const btn = $('uploadBtn');
  if (btn.dataset.busy) return;
  btn.disabled = !folder || !n;
  btn.textContent = !folder ? 'Pick the app first' : !n ? 'Choose screenshots first' : `Upload & process ${plural(n, 'screenshot')}`;
}
function wireUpload() {
  const chips = $('uploadChips');
  if (!chips) return;
  let last = null;
  try { last = localStorage.getItem(UPLOAD_FOLDER_KEY); } catch (e) { /* ignore */ }
  chips.innerHTML = UPLOAD_FOLDERS.map(([f, label]) =>
    `<button type="button" data-f="${f}"${f === last ? ' class="sel"' : ''} aria-pressed="${f === last}">${label}</button>`).join('');
  chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    chips.querySelectorAll('button').forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
    b.classList.add('sel');
    b.setAttribute('aria-pressed', 'true');
    try { localStorage.setItem(UPLOAD_FOLDER_KEY, b.dataset.f); } catch (e) { /* ignore */ }
  }));
  $('uploadFiles').addEventListener('change', () => {
    const n = $('uploadFiles').files.length;
    $('uploadPicked').textContent = n ? `${plural(n, 'screenshot')} chosen` : '';
    syncUploadBtn();
  });
  chips.addEventListener('click', syncUploadBtn);
  syncUploadBtn();
  $('uploadBtn').addEventListener('click', uploadAndProcess);
}

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addSaveLabel() {
  return addPaid() ? 'Log repayment' : 'Log spend';
}

async function saveQuickAdd() {
  const merchant = $('addMerchant').value.trim();
  const value = amountValue($('addAmount').value);
  const paidback = addPaid();
  if (!merchant) return toast('Give it a merchant name');
  if (!(value > 0)) return toast('Amount must be a number more than 0');
  const amount = String(value); // normalized, so the backend stores exactly what the toast shows
  const cat = selectedAddCat();
  // A repayment nets a specific envelope, so the category is not optional —
  // the backend rejects category-less negatives too (they'd sync wrong).
  if (paidback && !cat) return toast('Pick the envelope the repayment nets');
  const fields = { merchant, amount: paidback ? '-' + amount : amount, currency: $('addCurrency').value };
  if (cat) fields.category = cat;
  // The Notes cell: free note + the "fronted: <name>" tag the Owed tracker reads
  // (same sanitising as setFrontedTag: , ; | would split the tag).
  const who = $('addFronted').value.replace(/[,;|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  const note = [$('addNote').value.trim(), who ? 'fronted: ' + who : ''].filter(Boolean).join('; ');
  if (note) fields.note = note;
  if ($('addDate').value && $('addDate').value > localToday()) return toast('That date is in the future');
  // Only send a date when it isn't today, so "now" keeps its time of day (dedup ordering).
  if ($('addDate').value && $('addDate').value !== localToday()) fields.date = $('addDate').value;
  const btn = $('addSave');
  btn.disabled = true;
  btn.textContent = 'Logging…';
  try {
    const r = await quickAdd(fields);
    if (!r.ok) throw new Error(r.error || 'rejected');
    const amtText = fields.currency === 'MYR' ? fmt(value) : fields.currency + ' ' + amount;
    // The toast answers the question that prompted the log ("is Transport still
    // OK?") from the numbers already on screen, and carries Undo inline; the
    // Overview pill stays as the 15-minute fallback.
    let msg;
    if (paidback) msg = `Paid back ${amtText} into ${cat}`;
    else if (cat && (data && data.budgets || {})[cat] > 0 && fields.currency === 'MYR') {
      const leftNow = data.budgets[cat] - ((data.byCat || {})[cat] || 0) - value;
      msg = `Logged ${amtText} · ${cat} ${leftNow >= 0 ? fmt(leftNow) + ' left' : fmt(-leftNow) + ' over'}`;
    } else if (cat) msg = `Logged ${amtText} · ${cat}`;
    else msg = `Logged ${amtText} at ${merchant} · category by the rules`;
    if (r.dedup) msg += ' (already logged)';
    const undoable = !!r.id && !r.dedup;
    if (addAsSheet()) closeAddSheet(); // first, so the toast sits at the bottom by the thumb
    toast(msg, undoable ? { label: 'Undo', run: async () => {
      try {
        const u = await undoQuickAdd(r.id);
        if (!u.ok) throw new Error(u.error || 'rejected');
        clearLastAdd();
        toast(`Removed — ${amtText} · ${merchant}`);
      } catch (err) { toast('Undo failed: ' + friendly(err)); }
      refresh();
    } } : null);
    if (undoable && !isDemo()) rememberLastAdd(r.id, `${paidback ? '+' : ''}${amtText} · ${merchant}`);
    $('addMerchant').value = '';
    $('addAmount').value = '';
    $('addNote').value = '';
    $('addFronted').value = '';
    $('addCurrency').value = 'MYR'; // a stale SGD would silently re-price the next add
    fillAddChips(null);
    $('addDate').value = localToday();
    showAddExtra(false);
    setAddMode('spend');
    if (!addAsSheet()) setTab('overview');
    refresh();
  } catch (err) {
    toast('Failed: ' + friendly(err));
  } finally {
    btn.disabled = false;
    btn.textContent = addSaveLabel();
  }
}

function showSetup(message) {
  localStorage.removeItem(CFG_KEY);
  cfg = null; // else every foregrounding re-fetches with the rejected key and re-toasts
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

// Snapshots take the backend 2–5s, so refreshes overlap (foregrounding + a
// quick-add, say). Only the newest may land: an older snapshot finishing last
// would resurrect a just-categorized row or hide a just-added one.
let refreshSeq = 0;

async function refresh() {
  if (!cfg && !isDemo()) return; // disconnected (e.g. key rejected): nothing to fetch
  const seq = ++refreshSeq;
  $('tab-refresh').classList.add('busy');
  try {
    const fresh = await fetchData();
    if (seq !== refreshSeq) return;
    data = fresh;
    $('month').textContent = data.month;
    renderOverview();
    renderMore();
    renderReview();
    fillAddChips();
    fillRecentChips();
    fillNameChips();
    syncAddDisclosure();
    updateBadge();
  } catch (err) {
    if (seq !== refreshSeq) return;
    // A rejected key never fixes itself: reopen setup so the link can be re-pasted.
    if (/refused/i.test(err.message)) {
      showSetup('Key rejected — paste your dashboard link again');
      return;
    }
    toast('Could not load: ' + friendly(err));
    if (!data) renderLoadError(friendly(err)); // never leave the skeleton shimmering forever
  } finally {
    if (seq === refreshSeq) $('tab-refresh').classList.remove('busy');
  }
}

function renderLoadError(message) {
  $('view-overview').innerHTML = `<div class="card" style="text-align:center;padding:30px 16px">
    <div style="font-size:17px;font-weight:700">Couldn&rsquo;t load your numbers</div>
    <div class="muted" style="font-size:13px;margin-top:6px">${esc(message)}</div>
    <button class="btn" id="retryBtn">Try again</button></div>`;
  $('retryBtn').addEventListener('click', () => { renderSkeleton(); refresh(); });
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
    // parseConnect peels the #connect= layer and decodes safely itself; a raw
    // decodeURIComponent here threw on a malformed % and killed boot().
    const parsed = parseConnect(location.hash);
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
  $('tab-add').addEventListener('click', () => (addAsSheet() ? openAddSheet() : setTab('add')));
  $('tab-more').addEventListener('click', () => setTab('more'));
  $('tab-refresh').addEventListener('click', () => { toast('Refreshing…'); refresh(); });
  $('addDate').value = localToday();
  $('addDate').max = localToday(); // a spend can't be in the future
  $('extraToggle').addEventListener('click', () => showAddExtra(true));
  $('addFronted').addEventListener('input', fillNameChips);
  $('statusPill').addEventListener('click', () => setTab('review'));
  $('addForm').addEventListener('submit', (e) => { e.preventDefault(); saveQuickAdd(); }); // Go/Enter on the keypad logs it
  syncAddDisclosure(); // the rare fields start folded
  $('modeSpend').addEventListener('click', () => setAddMode('spend'));
  $('modePaid').addEventListener('click', () => setAddMode('paid'));
  fillAddChips();
  // Rows drawn as div[role=button|checkbox] answer Enter/Space like real buttons;
  // sheets trap Tab and close on Escape.
  document.addEventListener('keydown', (e) => {
    sheetKeys(e);
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el && el.matches && el.matches('div[role="button"], div[role="checkbox"]')) {
      e.preventDefault();
      el.click();
    }
  });
  wireUpload();
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
