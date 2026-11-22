'use strict';
// Tests for the pure helpers in app.js. Run: sh test/run.sh
// All fixtures are invented. app.js loads in Node with no global stubs.
const assert = require('assert');
const A = require('../app.js');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + String(e.message).split('\n').join('\n  ')); }
}
const eq = assert.strictEqual;
const withData = (d, fn) => { A.__setData(d); try { return fn(); } finally { A.__setData(null); } };

// ---------- money / number / date ----------
t('fmt basics', () => {
  eq(A.fmt(0), 'RM0.00');
  eq(A.fmt(12.5), 'RM12.50');
  eq(A.fmt(1234.5), 'RM1,234.50');
  eq(A.fmt(1234567.891), 'RM1,234,567.89');
  eq(A.fmt(999.999), 'RM1,000.00');
});
t('fmt negative puts the sign before RM', () => {
  eq(A.fmt(-5), '-RM5.00');
  eq(A.fmt(-1200), '-RM1,200.00');
});

t('amountValue plain and RM prefix', () => {
  eq(A.amountValue('12'), 12);
  eq(A.amountValue('12.50'), 12.5);
  eq(A.amountValue(' RM 12.50 '), 12.5);
  eq(A.amountValue('rm7'), 7);
  eq(A.amountValue('.5'), 0.5);
});
t('amountValue thousands vs decimal comma', () => {
  eq(A.amountValue('1,200'), 1200);
  eq(A.amountValue('1,234.50'), 1234.5);
  eq(A.amountValue('12,345,678'), 12345678);
  eq(A.amountValue('12,50'), 12.5);
  eq(A.amountValue('1.200,50'), 1200.5);
  eq(A.amountValue('1.234.567,8'), 1234567.8);
});
t('amountValue rejects junk', () => {
  ['', null, undefined, 'abc', '1.2.3', '-5', '12abc', 'RM', '--', '1,,2'].forEach((x) =>
    assert.ok(Number.isNaN(A.amountValue(x)), 'expected NaN for ' + JSON.stringify(x)));
});

t('fmtCoverageDate', () => {
  eq(A.fmtCoverageDate('2026-08-28'), '28 Aug 2026');
  eq(A.fmtCoverageDate('2026-01-05'), '5 Jan 2026');
  eq(A.fmtCoverageDate('2026'), '2026');                 // not three parts: returned as-is
  eq(A.fmtCoverageDate('2026-13-01'), '1 13 2026'); // unknown month falls back to the raw number
});
t('fmtDay: this year hides the year, other years show it', () => {
  const y = new Date().getFullYear();
  eq(A.fmtDay(y + '-08-16'), '16 Aug');
  eq(A.fmtDay((y - 1) + '-12-03'), '3 Dec ' + (y - 1));
  eq(A.fmtDay(''), '');
  eq(A.fmtDay(null), '');
  eq(A.fmtDay('garbage'), 'garbage');
});

t('plural', () => {
  eq(A.plural(1, 'row'), '1 row');
  eq(A.plural(0, 'row'), '0 rows');
  eq(A.plural(2, 'row'), '2 rows');
  eq(A.plural(2, 'category', 'categories'), '2 categories');
  eq(A.plural(1, 'category', 'categories'), '1 category');
});
t('esc escapes the four HTML-significant characters', () => {
  eq(A.esc('<a href="x">Tom & Co</a>'), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Co&lt;/a&gt;');
  eq(A.esc('&lt;'), '&amp;lt;'); // ampersand first: no double-decode confusion
  eq(A.esc(42), '42');
  eq(A.esc(''), '');
});
t('isoDayNum', () => {
  eq(A.isoDayNum('2026-03-02') - A.isoDayNum('2026-03-01'), 1);
  eq(A.isoDayNum('2026-03-01') - A.isoDayNum('2026-02-28'), 1);            // month boundary
  eq(A.isoDayNum('2028-03-01') - A.isoDayNum('2028-02-28'), 2);            // leap year
  eq(A.isoDayNum('2027-01-01') - A.isoDayNum('2026-01-01'), 365);
  eq(A.isoDayNum('2026-03-01 14:00'), A.isoDayNum('2026-03-01'));          // time suffix ignored
  ['', null, undefined, 'x', '26-03-01'].forEach((x) => assert.ok(Number.isNaN(A.isoDayNum(x))));
});

// ---------- friendly ----------
t('friendly: network errors', () => {
  const msg = 'No connection — nothing changed. Try again.';
  eq(A.friendly(new Error('Failed to fetch')), msg);
  eq(A.friendly(new Error('NetworkError when attempting to fetch resource.')), msg);
  eq(A.friendly(new Error('Load failed')), msg);
  eq(A.friendly('network down'), msg);
});
t('friendly: JSON errors', () => {
  const msg = 'The server didn’t answer properly — try again in a minute.';
  eq(A.friendly(new Error('Unexpected token < in JSON at position 0')), msg);
  eq(A.friendly(new SyntaxError('JSON.parse: bad')), msg);
});
t('friendly: read timeout and AbortError map to TIMEOUT_MSG', () => {
  eq(A.friendly(new Error(A.TIMEOUT_MSG)), A.TIMEOUT_MSG);
  const ab = new Error('The operation was aborted'); ab.name = 'AbortError';
  eq(A.friendly(ab), A.TIMEOUT_MSG);
});
t('friendly: write timeout is kept distinct (never invites a blind retry)', () => {
  assert.notStrictEqual(A.WRITE_TIMEOUT_MSG, A.TIMEOUT_MSG);
  eq(A.friendly(new Error(A.WRITE_TIMEOUT_MSG)), A.WRITE_TIMEOUT_MSG);
  const ab = new Error(A.WRITE_TIMEOUT_MSG); ab.name = 'AbortError';
  eq(A.friendly(ab), A.WRITE_TIMEOUT_MSG);   // write message wins even when flagged AbortError
  assert.ok(/Refresh/.test(A.WRITE_TIMEOUT_MSG));
});
t('friendly: passthrough and empties', () => {
  eq(A.friendly(new Error('Bad key')), 'Bad key');
  eq(A.friendly('Rate limited'), 'Rate limited');
  eq(A.friendly(null), '');
  eq(A.friendly(undefined), '');
});

// ---------- parseConnect ----------
const FAKE_EXEC = 'https://script.google.com/macros/s/AKfycbFAKEFAKEFAKE_test-0001/exec';
t('parseConnect: raw dash link', () => {
  const r = A.parseConnect(FAKE_EXEC + '?key=demo-key-1234&view=dash');
  assert.deepStrictEqual(r, { url: FAKE_EXEC, key: 'demo-key-1234' });
});
t('parseConnect: tap-link with encoded fragment', () => {
  const link = 'https://example.test/autolog-app/#connect=' + encodeURIComponent(FAKE_EXEC + '?key=demo-key-1234');
  assert.deepStrictEqual(A.parseConnect(link), { url: FAKE_EXEC, key: 'demo-key-1234' });
});
t('parseConnect: double-encoded, mail-wrapped copy', () => {
  const inner = encodeURIComponent(FAKE_EXEC + '?key=demo-key-1234');
  const wrapped = 'https://www.example.test/url?q=' + encodeURIComponent(inner) + '&sa=D';
  assert.deepStrictEqual(A.parseConnect(wrapped), { url: FAKE_EXEC, key: 'demo-key-1234' });
});
t('parseConnect: bare key uses the default backend address', () => {
  const r = A.parseConnect('  demo-key-1234 ');
  eq(r.key, 'demo-key-1234');
  assert.ok(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(r.url));
});
t('parseConnect: malformed % does not throw', () => {
  eq(A.parseConnect('#connect=%E0%A4%A'), null);
  eq(A.parseConnect('https://example.test/#connect=100%'), null);
  eq(A.parseConnect('%%%'), null);
});
t('parseConnect: junk and empties give null', () => {
  [null, undefined, '', '   ', 'hello world', 'short', 'https://example.test/x', 'a'.repeat(30)].forEach((x) =>
    eq(A.parseConnect(x), null, JSON.stringify(x)));
  eq(A.parseConnect(FAKE_EXEC), null);   // address without a key
});

// ---------- snapshot clock / stale capture / today spend ----------
t('snapToday', () => {
  eq(withData({ generatedAt: '2026-08-28 09:15' }, A.snapToday), '2026-08-28');
  eq(withData({ generatedAt: '2026-08-28T01:00:00Z' }, A.snapToday), '2026-08-28');
  eq(withData({}, A.snapToday), null);
  eq(withData({ generatedAt: 'yesterday' }, A.snapToday), null);
  eq(A.snapToday(), null); // no snapshot at all
});

const snap = (tng, hsbc, extra) => Object.assign({ generatedAt: '2026-08-28 09:00', coverage: { tng, hsbc } }, extra || {});
t('staleCaptureText: fresh channels give null', () => {
  eq(withData(snap('2026-08-27', '2026-08-28'), A.staleCaptureText), null);
});
t('staleCaptureText: exactly 7 days is not stale, 8 days is', () => {
  eq(withData(snap('2026-08-21', '2026-08-28'), A.staleCaptureText), null);
  eq(withData(snap('2026-08-20', '2026-08-28'), A.staleCaptureText),
    'TnG last synced 8 days ago — the real figure may be lower');
});
t('staleCaptureText: single stale HSBC, singular channel wording', () => {
  eq(withData(snap('2026-08-28', '2026-08-10'), A.staleCaptureText),
    'HSBC last synced 18 days ago — the real figure may be lower');
});
t('staleCaptureText: both stale uses the larger gap', () => {
  eq(withData(snap('2026-08-10', '2026-08-01'), A.staleCaptureText),
    'TnG and HSBC last synced 27+ days ago — the real figure may be lower');
  eq(withData(snap('2026-08-01', '2026-08-10'), A.staleCaptureText),
    'TnG and HSBC last synced 27+ days ago — the real figure may be lower');
});
t('staleCaptureText: missing coverage / null channel / no clock', () => {
  eq(withData({ generatedAt: '2026-08-28 09:00' }, A.staleCaptureText), null);                 // no coverage object
  eq(withData(snap('2026-08-10', null), A.staleCaptureText),
    'TnG last synced 18 days ago — the real figure may be lower');                              // null hsbc ignored
  eq(withData(snap(null, null), A.staleCaptureText), null);
  eq(withData({ coverage: { tng: '2026-01-01' } }, A.staleCaptureText), null);                  // no generatedAt
});
t('staleSources: none stale, or no clock / no coverage, gives an empty list', () => {
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-27', hsbc: '2026-08-21' }), []);
  assert.deepStrictEqual(A.staleSources(null, { tng: '2026-01-01' }), []);
  assert.deepStrictEqual(A.staleSources('2026-08-28', null), []);
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: null }), []);
});
t('staleSources: one stale source carries key, label, gap and its date', () => {
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-28', hsbc: '2026-08-10' }),
    [{ key: 'hsbc', label: 'HSBC', gap: 18, date: '2026-08-10' }]);
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-20', hsbc: '2026-08-28' }).length, 1); // 8 days is stale
});
t('staleSources: two stale sources come back oldest first, whatever the channel order', () => {
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-10', hsbc: '2026-08-01' }).map((x) => x.key), ['hsbc', 'tng']);
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-01', hsbc: '2026-08-10' }).map((x) => x.key), ['tng', 'hsbc']);
  assert.deepStrictEqual(A.staleSources('2026-08-28', { tng: '2026-08-01', hsbc: '2026-08-10', rhb: '2020-01-01' }).length, 2); // rhb never counts
});
t('staleCaptureText: rhb and alipay never trigger it', () => {
  eq(withData({ generatedAt: '2026-08-28 09:00', coverage: { tng: '2026-08-28', hsbc: '2026-08-28', rhb: '2025-01-01', alipay: '2025-01-01' } }, A.staleCaptureText), null);
});

const row = (id, date, amt, cat) => ({ id, date, amountMYR: amt, category: cat, merchant: 'Shop ' + id });
t('todaySpend: unknown when no clock or no monthRows', () => {
  eq(withData({ monthRows: [] }, A.todaySpend), null);
  eq(withData({ generatedAt: '2026-08-28 09:00' }, A.todaySpend), null);
});
t('todaySpend: nothing today', () => {
  const r = withData({ generatedAt: '2026-08-28 09:00', monthRows: [row('a', '2026-08-27', 10, 'Food')], budgets: { Food: 300 } }, A.todaySpend);
  assert.deepStrictEqual(r, { any: false, spent: 0, budgeted: 0 });
});
t('todaySpend: only refunds/transfers/negatives today = any but zero spend', () => {
  const r = withData({ generatedAt: '2026-08-28 09:00', budgets: { Food: 300 }, monthRows: [
    row('a', '2026-08-28', 40, 'REFUND'), row('b', '2026-08-28', 500, 'TRANSFER'),
    row('c', '2026-08-28', -15, 'Food'), row('d', '2026-08-28', 9, 'REVIEW'), row('e', '2026-08-28', 9, 'DUPLICATE?')] }, A.todaySpend);
  assert.deepStrictEqual(r, { any: true, spent: 0, budgeted: 0 });
});
t('todaySpend: budgeted vs unbudgeted split', () => {
  const r = withData({ generatedAt: '2026-08-28 09:00', budgets: { Food: 300, Fuel: 150 }, monthRows: [
    row('a', '2026-08-28', 12, 'Food'), row('b', '2026-08-28', 30, 'Fuel'),
    row('c', '2026-08-28', 70, 'Gadgets'), row('d', '2026-08-27', 999, 'Food')] }, A.todaySpend);
  assert.deepStrictEqual(r, { any: true, spent: 112, budgeted: 42 });
});
t('todaySpend: rounds away float noise', () => {
  const r = withData({ generatedAt: '2026-08-28 09:00', budgets: { Food: 1 }, monthRows: [
    row('a', '2026-08-28', 0.1, 'Food'), row('b', '2026-08-28', 0.2, 'Food')] }, A.todaySpend);
  eq(r.spent, 0.3); eq(r.budgeted, 0.3);
});

// ---------- colours ----------
t('barColor thresholds', () => {
  eq(A.barColor(0), 'var(--green)');
  eq(A.barColor(0.79), 'var(--green)');
  eq(A.barColor(0.8), 'var(--amber)');
  eq(A.barColor(0.99), 'var(--amber)');
  eq(A.barColor(1), 'var(--red)');
  eq(A.barColor(2.5), 'var(--red)');
});
t('paceColor', () => {
  eq(A.paceColor(50, 80, 0), 'var(--blue)');          // no cap
  eq(A.paceColor(50, 80, undefined), 'var(--blue)');
  eq(A.paceColor(100.01, 0, 100), 'var(--red)');       // already over
  eq(A.paceColor(100, 100, 100), 'var(--green)');      // exactly at cap is not over
  eq(A.paceColor(60, 101, 100), 'var(--green)');       // within RM1 slack
  eq(A.paceColor(60, 101.01, 100), 'var(--amber)');
  eq(A.paceColor(60, 110, 100), 'var(--amber)');       // exactly 10% over
  eq(A.paceColor(60, 110.01, 100), 'var(--red)');
  eq(A.paceColor(60, null, 100), 'var(--green)');      // no projection: judged on spent
});

// ---------- budget bars drain: full = left ----------
t('budgetBar: untouched envelope is full, on track, no tick', () => {
  const b = A.budgetBar(0, 600, 0, false);
  eq(b.leftPct, 100); eq(b.state, 'ok'); eq(b.tickPct, null);
});
t('budgetBar: half spent is half full; the tick is where it lands (projected amount LEFT)', () => {
  const b = A.budgetBar(300, 600, 300, false);
  eq(b.leftPct, 50); eq(b.state, 'ok'); eq(b.tickPct, null);          // projection = spent: no tick
  const c = A.budgetBar(300, 600, 450, false);                         // heading to RM450 of RM600: 25% left at month end
  eq(c.leftPct, 50); eq(c.state, 'ok'); eq(c.tickPct, 25);
});
t('budgetBar: heading over puts the tick at the left edge and keeps the bar (orange)', () => {
  const b = A.budgetBar(300, 400, 520, false);
  eq(b.state, 'heading'); eq(b.leftPct, 25); eq(b.tickPct, 0);
  eq(A.budgetBar(300, 400, 401, false).state, 'ok');                   // within RM1 slack
  eq(A.budgetBar(300, 400, 401.5, false).state, 'heading');
});
t('budgetJar: ok and heading keep the level; over and paid are empty with a mark', () => {
  eq(JSON.stringify(A.budgetJar(A.budgetBar(150, 600, 150, false))), JSON.stringify({ pct: 75, tone: 'ok', mark: null }));
  eq(JSON.stringify(A.budgetJar(A.budgetBar(300, 400, 520, false))), JSON.stringify({ pct: 25, tone: 'warn', mark: null }));
  eq(JSON.stringify(A.budgetJar(A.budgetBar(450, 400, 450, false))), JSON.stringify({ pct: 0, tone: 'over', mark: 'over' }));
  eq(JSON.stringify(A.budgetJar(A.budgetBar(50, 50, 50, true))), JSON.stringify({ pct: 0, tone: 'paid', mark: 'paid' }));
});
t('budgetJar: a sliver floors at 6, exact 0 and 100 stay', () => {
  eq(A.budgetJar({ leftPct: 2, state: 'ok' }).pct, 6);
  eq(A.budgetJar({ leftPct: 5.9, state: 'heading' }).pct, 6);
  eq(A.budgetJar({ leftPct: 6, state: 'ok' }).pct, 6);
  eq(A.budgetJar({ leftPct: 0, state: 'ok' }).pct, 0);
  eq(A.budgetJar({ leftPct: 100, state: 'ok' }).pct, 100);
  eq(A.budgetJar({ leftPct: 33.6, state: 'ok' }).pct, 34);
});
t('jarSvg: decorative hides from VoiceOver; tone and mark classes; default output unchanged', () => {
  const plain = A.jarSvg('x', 50);
  assert.ok(plain.includes('role="img"') && plain.includes('aria-label="Jar 50 percent full"'));
  assert.ok(plain.includes('class="jar" ') && !plain.includes('jar-mark') && !plain.includes(' warn'));
  const d = A.jarSvg('x', 50, { decorative: true });
  assert.ok(d.includes('aria-hidden="true"') && !d.includes('role=') && !d.includes('aria-label'));
  assert.ok(A.jarSvg('x', 50, { tone: 'warn' }).includes('class="jar-water warn"'));
  // the water is a group (fill rect + a darker surface line), translated as one inside the clip
  const g = A.jarSvg('x', 50);
  const m = g.match(/<g class="jar-water" data-y="([\d.]+)" style="transform:translateY\(([\d.]+)px\)"><rect x="12" y="26" width="80" height="88"\/><rect class="jar-surface" x="12" y="26" width="80" height="4"\/><\/g>/);
  assert.ok(m, 'water group with a surface line');
  assert.ok(g.indexOf('clip-path="url(#x)"') < g.indexOf('jar-water') && g.indexOf('jar-water') < g.indexOf('jar-surface') && g.indexOf('jar-surface') < g.indexOf('class="jar-line"'));
  assert.ok(A.jarSvg('x', 0).includes('data-y="88"')); // 0%: group sits fully below the clip, so the 4-unit line is clipped too
  assert.ok(A.jarSvg('x', 50, { noTarget: true }).includes('class="jar-water idle"'));
  const o = A.jarSvg('x', 0, { tone: 'over', mark: 'over' });
  assert.ok(o.includes('<svg class="jar over"') && o.includes('d="M52 50v26M52 88v.5"'));
  const p = A.jarSvg('x', 0, { tone: 'paid', mark: 'paid' });
  assert.ok(p.includes('<svg class="jar paid"') && p.includes('d="M34 70l12 12 24-26"'));
  assert.ok(p.indexOf('jar-line') < p.indexOf('jar-mark'));
});
t('budgetBar: overspent is an empty bar, no tick', () => {
  const b = A.budgetBar(450, 400, 450, false);
  eq(b.state, 'over'); eq(b.leftPct, 0); eq(b.tickPct, null);
  eq(A.budgetBar(400, 400, 400, false).state, 'ok');                   // exactly at the cap is not over
  eq(A.budgetBar(400, 400, 400, false).leftPct, 0);
});
t('budgetBar: overPct is the overspend as a share of the cap, never under 8, never over 100', () => {
  eq(A.budgetBar(450, 400, 450, false).overPct, 12.5);                 // RM50 over RM400
  eq(A.budgetBar(900, 400, 900, false).overPct, 100);                  // RM500 over a RM400 cap: capped at the track
  eq(A.budgetBar(401, 400, 401, false).overPct, 8);                    // RM1 over: still seen
  eq(A.budgetBar(450, 450.5, 450, false).overPct, 0);                  // under the cap: not an over bar
  const small = A.budgetBar(500, 450, 500, false).overPct, big = A.budgetBar(950, 450, 950, false).overPct;
  assert.ok(small < big, 'RM50 over and RM500 over on one cap must differ');
  eq(A.budgetBar(950, 450, 950, false).overPct, 100);                  // RM500 over RM450: more than the cap, capped
  eq(A.budgetBar(300, 400, 520, false).overPct, 0);                    // heading over is not over
  eq(A.budgetBar(60, 60, 60, true).overPct, 0);                        // paid is not over
});
t('budgetBar: overPct with no cap is the full track (or 0 with nothing spent)', () => {
  eq(A.budgetBar(12, 0, 12, false).overPct, 100);
  eq(A.budgetBar(0, 0, 0, false).overPct, 0);
});
t('todayLeft: opening minus budgeted spend, floored at 0, never both', () => {
  let r = A.todayLeft(58.44, 42.4);
  eq(r.left, 16.04); eq(r.over, 0);
  r = A.todayLeft(58.44, 0);
  eq(r.left, 58.44); eq(r.over, 0);
  r = A.todayLeft(58.44, 70.44);
  eq(r.left, 0); eq(r.over, 12);
  r = A.todayLeft(58.44, 58.44);
  eq(r.left, 0); eq(r.over, 0);
});
t('todayLeft: float noise and bad input', () => {
  const r = A.todayLeft(0.3, 0.1 + 0.2);
  eq(r.left, 0); eq(r.over, 0);                                        // 0.30000000000000004 is not "over"
  const z = A.todayLeft(undefined, null);
  eq(z.left, 0); eq(z.over, 0);
});
t('amountProblem: missing, not a number, zero', () => {
  eq(A.amountProblem('', { noun: 'an amount', example: '12.50' }), 'Enter an amount, e.g. 12.50');
  eq(A.amountProblem('   ', { noun: 'a target' }), 'Enter a target');
  eq(A.amountProblem('abc', { example: '12.50' }), 'That isn’t a number — try 12.50');
  eq(A.amountProblem('0'), 'Must be more than 0');
  eq(A.amountProblem('-5'), 'That isn’t a number');                     // amountValue rejects a minus sign
  eq(A.amountProblem('12.50'), null);
  eq(A.amountProblem('1,200'), null);
});
t('amountProblem: allowZero is for balances', () => {
  eq(A.amountProblem('0', { allowZero: true }), null);
  eq(A.amountProblem('', { noun: 'your RHB balance', allowZero: true }), 'Enter your RHB balance');
});
t('addErrors: Spend asks for amount then merchant, in page order', () => {
  let e = A.addErrors({ amount: '', merchant: '', paid: false });
  eq(e.map((x) => x.id).join(), 'addAmount,addMerchant');
  e = A.addErrors({ amount: 'x', merchant: 'Shop', paid: false });
  eq(e.length, 1); eq(e[0].id, 'addAmount'); eq(e[0].msg, 'That isn’t a number — try 12.50');
  eq(A.addErrors({ amount: '12', merchant: 'Shop', paid: false }).length, 0);
  eq(A.addErrors({ amount: '12', merchant: ' ', paid: false })[0].msg, 'Add a merchant, e.g. Starbucks');
});
t('addErrors: Paid back asks for amount, what-for and category; the name is optional and no message says "merchant"', () => {
  const e = A.addErrors({ amount: '', merchant: '', paid: true, who: '', cat: undefined, hasNames: true });
  eq(e.map((x) => x.id).join(), 'addAmount,addMerchant,addChips');
  eq(e[1].msg, 'Say what it was for, e.g. Ali dinner');
  eq(e[2].msg, 'Pick the category it came from');
  assert.ok(!e.some((x) => /merchant/i.test(x.msg)));
  // Money back with no person attached (selling something, a cash refund) is a real entry.
  eq(A.addErrors({ amount: '5', merchant: 'Sold old bag', paid: true, who: '', cat: 'Shopping' }).length, 0);
  eq(A.addErrors({ amount: '5', merchant: 'Dinner', paid: true, who: 'Ali', cat: 'Food' }).length, 0);
});
t('catLabel: backend codes never reach the screen', () => {
  eq(A.catLabel('TRANSFER'), 'Transfer');
  eq(A.catLabel('REFUND'), 'Refund');
  eq(A.catLabel('REVIEW'), 'Needs a category');
  eq(A.catLabel('DUPLICATE?'), 'Possible duplicate');
  eq(A.catLabel('Food'), 'Food');
});
t('budgetBar: cap 0 never divides by zero', () => {
  let b = A.budgetBar(0, 0, 0, false);
  eq(b.leftPct, 0); eq(b.tickPct, null); eq(b.state, 'ok');
  b = A.budgetBar(12, 0, 12, false);
  eq(b.leftPct, 0); eq(b.state, 'over');
  eq(A.budgetBar(5, undefined, undefined, false).state, 'over');
});
t('budgetBar: a fixed bill that has landed is empty and "paid", not a warning', () => {
  const b = A.budgetBar(60, 60, 60, true);
  eq(b.state, 'paid'); eq(b.leftPct, 0); eq(b.tickPct, null);
  eq(A.budgetBar(59.8, 60, 59.8, true).state, 'paid');                 // within 50 sen
  const open = A.budgetBar(0, 60, 0, true);                            // not charged yet: full, no tick
  eq(open.state, 'ok'); eq(open.leftPct, 100); eq(open.tickPct, null);
  eq(A.budgetBar(0, 60, 40, true).tickPct, null);                      // fixed bills never pace
});
t('budgetBar: a non-fixed envelope at its cap is never "paid"', () => {
  eq(A.budgetBar(60, 60, 60, false).state, 'ok');
});

// ---------- jar level, keyboard inset, signed money ----------
t('jarWaterY: area-linear, empty to full, 50% at the middle', () => {
  eq(A.jarWaterY(0), 88);
  eq(A.jarWaterY(100), 0);
  assert.ok(Math.abs(A.jarWaterY(50) - 44) < 0.2, String(A.jarWaterY(50)));
  let prev = 89;
  for (let p = 0; p <= 100; p += 5) { const y = A.jarWaterY(p); assert.ok(y < prev, 'monotonic at ' + p); prev = y; }
  // 12% of the glass's area needs a little MORE height than 12% of its height (the bottom is rounded and narrow)
  assert.ok(88 - A.jarWaterY(12) > 88 * 0.12);
  eq(A.jarWaterY(-5), 88); eq(A.jarWaterY(250), 0); eq(A.jarWaterY(NaN), 88);
});
t('kbInset: keyboard height from the visual viewport; browser chrome is ignored', () => {
  eq(A.kbInset(800, 800, 0), 0);                 // no keyboard
  eq(A.kbInset(800, 480, 0), 320);               // keyboard open
  eq(A.kbInset(800, 480, 60), 260);              // page panned down 60px: that part is not covered
  eq(A.kbInset(800, 740, 0), 0);                 // 60px of URL bar, under the 80px floor
  eq(A.kbInset(800, 820, 0), 0);                 // never negative
  eq(A.kbInset(800, 480, undefined), 320);
});
t('fmtSigned: money in is +RM, money out is plain', () => {
  eq(A.fmtSigned(-35), '+RM35.00');
  eq(A.fmtSigned(35), 'RM35.00');
  eq(A.fmtSigned(0), 'RM0.00');
});

// ---------- flags ----------
const flagSnap = (extra) => Object.assign({
  budgets: { Food: 400, Shopping: 1000 },
  monthRows: [
    { id: 'p1', category: 'Food', amountMYR: 10 }, { id: 'p2', category: 'Food', amountMYR: 12 },
    { id: 'p3', category: 'Food', amountMYR: 15 }, { id: 'p4', category: 'Food', amountMYR: -50 } ],
  recent: [{ id: 'p1', category: 'Food', amountMYR: 10 }] // duplicate of p1: must not count twice
}, extra || {});
t('amountFlag: no data / zero amount', () => {
  eq(A.amountFlag({ id: 'x', category: 'Food', amountMYR: 500 }), null);
  eq(withData(flagSnap(), () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 0 })), null);
  eq(withData(flagSnap(), () => A.amountFlag({ id: 'x', category: 'Food' })), null);
});
t('amountFlag: far above the category median (3+ peers, refunds and duplicates excluded)', () => {
  // peers 10,12,15 -> median 12; 130 > 5*12 and >= 100
  eq(withData(flagSnap(), () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 130 })), '11&times; your usual Food spend');
  // 60 is > 5*12 but under the RM100 floor, and under half of the 400 budget
  eq(withData(flagSnap(), () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 60 })), null);
});
t('amountFlag: over half the budget needs >= RM150', () => {
  const d = flagSnap({ budgets: { Food: 280 }, monthRows: [] });
  eq(withData(d, () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 150 })), 'over half the Food budget in one line');
  eq(withData(d, () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 149 })), null);
  eq(withData(flagSnap({ budgets: { Food: 300 }, monthRows: [] }), () => A.amountFlag({ id: 'x', category: 'Food', amountMYR: 150 })), null); // not > half
});
t('amountFlag: few peers, very large line', () => {
  const d = { budgets: {}, monthRows: [], recent: [] };
  eq(withData(d, () => A.amountFlag({ id: 'x', category: 'Shopping', amountMYR: 500 })), 'unusually large');
  eq(withData(d, () => A.amountFlag({ id: 'x', category: 'Shopping', amountMYR: 499.99 })), null);
});
t('amountFlag: category name is escaped', () => {
  const d = { budgets: { 'A<b>': 100 }, monthRows: [], recent: [] };
  eq(withData(d, () => A.amountFlag({ id: 'x', category: 'A<b>', amountMYR: 160 })), 'over half the A&lt;b&gt; budget in one line');
});
t('importFlag precedence: credit > unusual > amountFlag > large', () => {
  const base = { id: 'x', category: 'Shopping', amountMYR: 600, credit: true, unusual: true, usualMax: 100, large: true };
  const d = { budgets: {}, monthRows: [], recent: [] };
  withData(d, () => {
    assert.ok(/money back/.test(A.importFlag(base)));
    assert.ok(/over 3&times; the most you&rsquo;ve paid here before \(RM100\.00\)/.test(A.importFlag(Object.assign({}, base, { credit: false }))));
    eq(A.importFlag(Object.assign({}, base, { credit: false, unusual: false })), 'unusually large');
    eq(A.importFlag(Object.assign({}, base, { credit: false, unusual: false, amountMYR: 20 })), 'large for a place with little history');
    eq(A.importFlag({ id: 'y', category: 'Shopping', amountMYR: 20 }), null);
  });
});
t('importFlag: unusual without usualMax omits the figure', () => {
  withData({ budgets: {}, monthRows: [] }, () => {
    eq(A.importFlag({ id: 'x', category: 'Food', amountMYR: 5, unusual: true }), 'over 3&times; the most you&rsquo;ve paid here before');
  });
});

// ---------- flippable ----------
const v47 = (extra) => Object.assign({ recap: null }, extra || {});
const fresh = (extra) => Object.assign({ source: 'statement', createdMs: Date.now() - 3600e3, amountMYR: 25, category: 'Food' }, extra || {});
t('flippable: allowed case', () => {
  withData(v47(), () => {
    eq(A.flippable(fresh()), true);
    eq(A.flippable(fresh({ amountMYR: -25 })), true);    // money back can flip to a spend
    ['statement', 'tng', 'alipay'].forEach((s) => eq(A.flippable(fresh({ source: s })), true));
  });
});
t('flippable: needs the v47 backend', () => {
  withData({}, () => eq(A.flippable(fresh()), false));
  eq(A.flippable(fresh()), false); // no snapshot
});
t('flippable: source guard', () => {
  withData(v47(), () => ['manual', 'applepay', 'grab', undefined, ''].forEach((s) => eq(A.flippable(fresh({ source: s })), false, String(s))));
});
t('flippable: 13-day window', () => {
  withData(v47(), () => {
    eq(A.flippable(fresh({ createdMs: Date.now() - 12 * 24 * 3600e3 })), true);
    eq(A.flippable(fresh({ createdMs: Date.now() - 14 * 24 * 3600e3 })), false);
    eq(A.flippable(fresh({ createdMs: 0 })), false);
    eq(A.flippable(fresh({ createdMs: undefined })), false);
  });
});
t('flippable: amount and category guards', () => {
  withData(v47(), () => {
    eq(A.flippable(fresh({ amountMYR: 0 })), false);
    eq(A.flippable(fresh({ amountMYR: '25' })), false);
    eq(A.flippable(fresh({ category: 'TRANSFER' })), false);
    eq(A.flippable(fresh({ category: 'DUPLICATE?' })), false);
    eq(A.flippable(fresh({ category: 'REFUND' })), true);   // a refund is exactly what flips back to a spend
  });
});

// ---------- history charts ----------
const hist = {
  '2026-06': { Food: 300.004, Fuel: 120, Refunds: -20 },
  '2026-04': { Food: 100 },
  '2026-05': { Food: 250, Groceries: 80, Fuel: 90, Shopping: 40, Health: 0 }
};
t('monthItems: oldest first, labels, valueOf receives (month, key)', () => {
  withData({ history: hist }, () => {
    const it = A.monthItems((h, k) => (k === '2026-04' ? -1 : Object.keys(h).length));
    assert.deepStrictEqual(it.map((x) => x.key), ['2026-04', '2026-05', '2026-06']);
    assert.deepStrictEqual(it.map((x) => x.label), ['Apr', 'May', 'Jun']);
    eq(it[0].full, 'April 2026');
    assert.deepStrictEqual(it.map((x) => x.value), [-1, 5, 3]);
  });
  withData({}, () => assert.deepStrictEqual(A.monthItems(() => 1), [])); // no history yet
});
t('monthTotalItems: nets each month (rounded) and names the top three positives', () => {
  withData({ history: hist }, () => {
    const it = A.monthTotalItems();
    assert.deepStrictEqual(it.map((x) => x.value), [100, 460, 400]);
    eq(it[0].extra, 'Food RM100.00');
    eq(it[1].extra, 'Food RM250.00 · Fuel RM90.00 · Groceries RM80.00');   // 4 positives: top 3 only; zero excluded
    eq(it[2].extra, 'Food RM300.00 · Fuel RM120.00');                      // refund (negative) excluded from the list
  });
});
t('monthTotalItems: tolerates non-numeric cells', () => {
  withData({ history: { '2026-01': { Food: '12.5', Fuel: null, Misc: 'x' } } }, () => eq(A.monthTotalItems()[0].value, 12.5));
});
t('versusPrev', () => {
  eq(A.versusPrev(-12, 'June'), 'RM12.00 less than June');
  eq(A.versusPrev(1234.5, 'June'), 'RM1,234.50 more than June');
  eq(A.versusPrev(0, 'June'), 'the same as June');
  eq(A.versusPrev(0.004, 'June'), 'the same as June');
  eq(A.versusPrev(0.01, 'June'), 'RM0.01 more than June');
  eq(A.versusPrev(undefined, 'June'), '');
  eq(A.versusPrev('5', 'June'), '');
  eq(A.versusPrev(5, ''), '');
  eq(A.versusPrev(5, null), '');
});

// ---------- categories ----------
t('canonCats / pickableCats fall back without snapshot.pickable', () => {
  assert.deepStrictEqual(A.canonCats(), A.CANON_CATS);                 // no snapshot
  withData({ pickable: [] }, () => assert.deepStrictEqual(A.canonCats(), A.CANON_CATS));
  withData({ pickable: 'Food' }, () => assert.deepStrictEqual(A.canonCats(), A.CANON_CATS));
  withData({ pickable: ['Pets', 'Gifts'] }, () => assert.deepStrictEqual(A.canonCats(), ['Pets', 'Gifts']));
});
t('pickableCats: merges, dedupes, drops non-pickable; reserved only on request', () => {
  const d = { pickable: ['Food', 'Pets'], categories: ['Pets', 'Uncategorized', 'REVIEW', 'TRANSFER', 'Gifts'], budgets: { Food: 1, 'DUPLICATE?': 1, Rent: 1 } };
  withData(d, () => {
    assert.deepStrictEqual(A.pickableCats(false), ['Food', 'Pets', 'Gifts', 'Rent']);
    assert.deepStrictEqual(A.pickableCats(true), ['Food', 'Pets', 'TRANSFER', 'Gifts', 'Rent', 'REFUND']);
  });
});
t('pickableCats: built-in fallback list never offers reserved values by default', () => {
  withData({}, () => {
    const c = A.pickableCats(false);
    assert.deepStrictEqual(c, A.CANON_CATS);
    assert.ok(!c.includes('TRANSFER') && !c.includes('REFUND'));
  });
});
t('topCats: suggestions, then most-used this month, then budgets, then canon; deduped', () => {
  const d = { pickable: ['Food', 'Travel'], budgets: { Rent: 1, Food: 1 }, monthRows: [
    { category: 'Gifts' }, { category: 'Gifts' }, { category: 'Pets' }, { category: 'REVIEW' }, { category: 'REVIEW' }, { category: 'REVIEW' }, { category: 'Uncategorized' }] };
  withData(d, () => assert.deepStrictEqual(A.topCats(['Pets']), ['Pets', 'Gifts', 'Rent', 'Food', 'Travel']));
  withData(d, () => assert.deepStrictEqual(A.topCats(), ['Gifts', 'Pets', 'Rent', 'Food', 'Travel']));
});
t('suggestCategory', () => {
  const d = { monthRows: [
    { id: 'a', merchant: 'Kopi Corner PJ', category: 'Food' },
    { id: 'b', merchant: 'Mystery Mart', category: 'REVIEW' },
    { id: 'c', merchant: 'Wire Transfer Ltd', category: 'TRANSFER' }],
    recent: [{ id: 'd', merchant: 'Pasar Kebun', category: 'Groceries' }] };
  withData(d, () => {
    eq(A.suggestCategory({ id: 'z', merchant: 'KOPI-CORNER PJ #2' }), 'Food');         // case/punctuation ignored, first 10 chars
    eq(A.suggestCategory({ id: 'z', merchant: 'Pasar Kebun Jaya' }), 'Groceries');     // found in recent
    eq(A.suggestCategory({ id: 'a', merchant: 'Kopi Corner PJ' }), null);              // never matches itself
    eq(A.suggestCategory({ id: 'z', merchant: 'Mystery Mart' }), null);                // REVIEW is not a real category
    eq(A.suggestCategory({ id: 'z', merchant: 'Wire Transfer Ltd' }), null);           // neither is TRANSFER
    eq(A.suggestCategory({ id: 'z', merchant: 'ab' }), null);                          // key too short
    eq(A.suggestCategory({ id: 'z', merchant: '' }), null);
    eq(A.suggestCategory({ id: 'z' }), null);
  });
});

// ---------- small extras ----------
t('srcLabel', () => {
  eq(A.srcLabel('tng'), 'TnG');
  eq(A.srcLabel('manual'), 'Quick add');
  eq(A.srcLabel('weird'), 'weird');
  eq(A.srcLabel(undefined), '');
});
t('fmtUpdated', () => {
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  eq(A.fmtUpdated(today + ' 14:32'), 'today 14:32');
  eq(A.fmtUpdated(today + 'T07:05:09'), 'today 07:05');
  eq(A.fmtUpdated('2020-08-18 09:00'), '18 Aug 2020 09:00');
  eq(A.fmtUpdated('n/a'), 'n/a');
  eq(A.fmtUpdated(null), '');
});

// ---------- Time mode (days of work) ----------
t('workDays', () => {
  eq(A.workDays(150, 37.5), 0.5);   // RM37.5 an hour, 8-hour day = RM300
  eq(A.workDays(600, 37.5), 2);
  assert.ok(Number.isNaN(A.workDays(100, 0)));
  assert.ok(Number.isNaN(A.workDays(100, -5)));
});
t('workTime: minutes, hours, days', () => {
  eq(A.workTime(0, 37.5), '0 min');
  eq(A.workTime(22.5, 37.5), '36 min');
  eq(A.workTime(87.5, 37.5), '2 h 20 min');
  eq(A.workTime(75, 37.5), '2 h');
  eq(A.workTime(360, 37.5), '1.2 days');
  eq(A.workTime(300, 37.5), '1.0 days');    // a full 8 hours counts in days
  eq(A.workTime(10, 0), '');
  eq(A.workTime(NaN, 37.5), '');
  eq(A.workTime(-87.5, 37.5), '-2 h 20 min');
});
t('storage keys: the old per-day key is not the hourly key (a shared key wiped the pay on every launch)', () => {
  assert.strictEqual(A.PREF.pay, 'autolog.payPerHour');
  assert.strictEqual(A.PREF.payPerDayOld, 'autolog.payPerDay');
  const keys = Object.values(A.PREF);
  assert.strictEqual(new Set(keys).size, keys.length, 'every preference has its own key');
});
t('migratePay: old per-day figure becomes per-hour once', () => {
  eq(A.migratePay(null, '300'), 37.5);
  eq(A.migratePay(null, '250'), 31.25);
  eq(A.migratePay(null, '100'), 12.5);
  eq(A.migratePay(null, '333'), 41.63);
  eq(A.migratePay('30', '300'), null);      // already migrated: keep the hourly figure
  eq(A.migratePay(null, null), null);
  eq(A.migratePay(null, 'abc'), null);
  eq(A.migratePay(null, '0'), null);
});
t('resolveTheme', () => {
  eq(A.resolveTheme('light', false), 'light');
  eq(A.resolveTheme('dark', true), 'dark');
  eq(A.resolveTheme('auto', true), 'light');
  eq(A.resolveTheme('auto', false), 'dark');
  eq(A.resolveTheme('bogus', true), 'light');
  eq(A.resolveTheme(null, false), 'dark');
});
t('fmtDays', () => { eq(A.fmtDays(2.94), '2.9 days'); eq(A.fmtDays(NaN), ''); });

// ---------- Next payday ----------
t('nextPayday counts from the snapshot date', () => {
  const a = A.nextPayday('2026-11-21', 26);
  eq(a.iso, '2026-11-26'); eq(a.days, 5); eq(a.label, '26 Nov'); eq(a.weekday, 'Thursday');
  eq(A.nextPayday('2026-11-26', 26).days, 0);                 // payday itself = today
  const b = A.nextPayday('2026-11-27', 26);
  eq(b.iso, '2026-12-26'); eq(b.days, 29);
  eq(A.nextPayday('2026-11-25', 26).days, 1);
});
t('nextPayday: short months use their last day, year rolls over', () => {
  const f = A.nextPayday('2026-02-10', 31);
  eq(f.iso, '2026-02-28'); eq(f.days, 18); eq(f.label, '28 Feb');
  eq(A.nextPayday('2026-02-28', 31).days, 0);
  eq(A.nextPayday('2026-04-30', 31).days, 0);                 // April has 30 days
  const y = A.nextPayday('2026-12-28', 26);
  eq(y.iso, '2027-01-26'); eq(y.days, 29);
  eq(A.nextPayday('2028-01-30', 31).iso, '2028-01-31');       // leap-year Feb handled below
  eq(A.nextPayday('2028-02-10', 31).iso, '2028-02-29');
});
t('nextPayday rejects bad input', () => {
  eq(A.nextPayday(null, 26), null);
  eq(A.nextPayday('garbage', 26), null);
  eq(A.nextPayday('2026-11-21', 0), null);
  eq(A.nextPayday('2026-11-21', 32), null);
});

// ---------- Tabung pots ----------
const potData = { travelBalanceMYR: 1200, efBalanceMYR: 1500, efMonthlyBasisMYR: 2000, buffer: { balanceMYR: 1810, floorMYR: 2500 } };
t('potsFor: the three pots in order with progress', () => {
  const p = A.potsFor(potData, { travel: 5000 });
  eq(p.map((x) => x.key).join(), 'travel,ef,buffer');
  eq(p[0].balance, 1200); eq(p[0].target, 5000); eq(p[0].pct, 24); eq(p[0].toGo, 3800); eq(p[0].reached, false);
  eq(p[1].target, 6000); eq(p[1].pct, 25); eq(p[1].toGo, 4500);          // default = 3 x monthly basis
  eq(p[1].custom, false); eq(p[1].defaultTarget, 6000); eq(p[1].months, 0.75);
  eq(p[2].target, 2500); eq(p[2].toGo, 690); eq(p[2].low, true); eq(p[2].editable, false);
  eq(p[2].floor, true); eq(p[2].tone, 'warn');
  eq(p[0].line, '24% of RM5,000 \u00B7 RM3,800.00 to go');
  eq(p[1].line, '25% of RM6,000 \u00B7 RM4,500.00 to go');
  assert.ok(!/envelope|core outflow/.test(p.map((x) => x.note).join('|')));
  assert.ok(/this pot only/.test(p[1].note) && /0\.8 months of your usual spending/.test(p[1].note));
});
t('potsFor: Travel Fund without a balance (older backend or null)', () => {
  [{}, { travelBalanceMYR: null }, { travelBalanceMYR: 'x' }].forEach((d) => {
    const p = A.potsFor(d, { travel: 5000 })[0];
    eq(p.key, 'travel'); eq(p.balance, null); eq(p.pct, null); eq(p.toGo, null); eq(p.reached, false);
    eq(p.note, 'Balance arrives after the next sync');
    eq(p.target, 5000);
  });
  eq(A.potsFor({}, null).length, 1);                 // no EF / Buffer in the snapshot: only Travel
});
t('potsFor: no target, negative balance, reached target', () => {
  const none = A.potsFor({ travelBalanceMYR: 300 }, {})[0];
  eq(none.target, null); eq(none.pct, null); eq(none.toGo, null);
  const neg = A.potsFor({ travelBalanceMYR: -80 }, { travel: 1000 })[0];
  eq(neg.balance, -80); eq(neg.pct, 0); eq(neg.toGo, 1080);
  const done = A.potsFor({ travelBalanceMYR: 1500 }, { travel: 1000 })[0];
  eq(done.pct, 100); eq(done.toGo, 0); eq(done.reached, true);
  eq(A.potsFor({ buffer: { balanceMYR: 3000, floorMYR: 2500 } }, {})[1].reached, true);
});
t('potsFor: Buffer is a floor: below it warns with no percent line, above it is plain', () => {
  const low = A.potsFor({ buffer: { balanceMYR: 1810, floorMYR: 2500 } }, {})[1];
  eq(low.floor, true); eq(low.tone, 'warn'); eq(low.low, true);
  eq(low.line, 'RM690.00 below its RM2,500 floor');
  assert.ok(!/%|to go/.test(low.line));
  assert.ok(Math.abs(low.pct - 72.4) < 1e-9);
  const hi = A.potsFor({ buffer: { balanceMYR: 3000, floorMYR: 2500 } }, {})[1];
  eq(hi.floor, true); eq(hi.tone, 'ok'); eq(hi.low, false); eq(hi.pct, 100);
  eq(hi.line, 'RM500.00 above its RM2,500 floor');
  eq(A.potsFor({ buffer: { balanceMYR: 2500, floorMYR: 2500 } }, {})[1].line, 'At its RM2,500 floor');
  const nf = A.potsFor({ buffer: { balanceMYR: 900 } }, {})[1];
  eq(nf.floor, false); eq(nf.line, '');
});
t('potsFor: target reached and no target lines', () => {
  const done = A.potsFor({ travelBalanceMYR: 1500 }, { travel: 1000 })[0];
  eq(done.line, 'Target reached'); eq(done.tone, 'ok'); eq(done.floor, false);
  const near = A.potsFor({ travelBalanceMYR: 999.8 }, { travel: 1000 })[0];
  eq(near.line, '99% of RM1,000 \u00B7 RM0.20 to go'); // never "100%" before it is reached
  const none = A.potsFor({ travelBalanceMYR: 300 }, {})[0];
  eq(none.line, ''); eq(none.pct, null);
  eq(A.potsFor({}, { travel: 5000 })[0].line, ''); // unknown balance: just the sync note
});
t('potsFor: Emergency cushion override wins; no basis means no default', () => {
  const o = A.potsFor(potData, { ef: 10000 })[1];
  eq(o.target, 10000); eq(o.custom, true); eq(o.pct, 15); eq(o.defaultTarget, 6000);
  const nb = A.potsFor({ efBalanceMYR: 900 }, {})[1];
  eq(nb.target, null); eq(nb.months, null); eq(nb.pct, null);
  eq(A.potsFor({ efBalanceMYR: 900 }, { ef: 3000 })[1].pct, 30);
});

// ---------- Hide amounts ----------
t('hide amounts masks fmt but not the number helpers', () => {
  A.__setHide(true);
  try {
    eq(A.fmt(1234.5), 'RM •••');
    eq(A.fmt(-5), 'RM •••');
    eq(A.fmtWhole(3150), 'RM •••');
    eq(A.maskText('+RM12.50 · Lunch'), '+RM ••• · Lunch');
    eq(A.amountValue('12.50'), 12.5);               // typed input is never masked
  } finally { A.__setHide(false); }
  eq(A.fmt(1234.5), 'RM1,234.50');
  eq(A.fmtWhole(3150), 'RM3,150');
  eq(A.fmtWhole(1849.6), 'RM1,850');
  eq(A.maskText('RM12.50 · Lunch'), 'RM12.50 · Lunch'); // visible: untouched
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
