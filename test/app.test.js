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

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
