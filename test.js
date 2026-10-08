// Tests du moteur : node test.js
const assert = require('assert');
const { solve } = require('./scheduler.js');

const mk = (n, from, to) => { const a = new Array(48).fill(false); for (let s = from; s < to; s++) a[s] = true; return a; };
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('✓', name); };

t('cas simple : tout est planifié sans conflit', () => {
  const r = solve({
    lo: 16, hi: 36,
    people: [{ id: 'A', avail: mk(0, 16, 36) }, { id: 'B', avail: mk(0, 16, 36) }],
    meetings: [{ id: 'm1', people: ['A', 'B'], dur: 2, prio: false }, { id: 'm2', people: ['A'], dur: 1, prio: false }]
  });
  assert.strictEqual(r.placed.length, 2);
  assert.strictEqual(r.unplaced.length, 0);
  assert.ok(r.optimal);
});

t('la réunion prioritaire passe avant les autres (un seul créneau dispo)', () => {
  const r = solve({
    lo: 16, hi: 36,
    people: [{ id: 'A', avail: mk(0, 20, 21) }],
    meetings: [{ id: 'normal', people: ['A'], dur: 1, prio: false }, { id: 'prio', people: ['A'], dur: 1, prio: true }]
  });
  assert.deepStrictEqual(r.placed.map(p => p.id), ['prio']);
  assert.strictEqual(r.unplaced[0].id, 'normal');
  assert.strictEqual(r.unplaced[0].reason, 'conflict');
  assert.deepStrictEqual(r.unplaced[0].conflicts, ['prio']);
});

t('une prioritaire vaut plus que plusieurs normales', () => {
  // A dispo 2 créneaux : 1 prioritaire de 2 créneaux vs 2 normales de 1 créneau
  const r = solve({
    lo: 16, hi: 36,
    people: [{ id: 'A', avail: mk(0, 20, 22) }],
    meetings: [
      { id: 'n1', people: ['A'], dur: 1, prio: false },
      { id: 'n2', people: ['A'], dur: 1, prio: false },
      { id: 'p', people: ['A'], dur: 2, prio: true }]
  });
  assert.deepStrictEqual(r.placed.map(p => p.id), ['p']);
});

t('aucun créneau commun : raison et personnes bloquantes', () => {
  const r = solve({
    lo: 16, hi: 36,
    people: [{ id: 'A', avail: mk(0, 16, 20) }, { id: 'B', avail: mk(0, 24, 30) }],
    meetings: [{ id: 'm', people: ['A', 'B'], dur: 2, prio: true }]
  });
  assert.strictEqual(r.placed.length, 0);
  assert.strictEqual(r.unplaced[0].reason, 'none-common');
  assert.deepStrictEqual(r.unplaced[0].blockers, []);
});

t('pause déjeuner (blocked) respectée', () => {
  const blocked = new Array(48).fill(false); blocked[24] = blocked[25] = true;
  const r = solve({
    lo: 22, hi: 30, blocked,
    people: [{ id: 'A', avail: mk(0, 22, 30) }],
    meetings: [{ id: 'm', people: ['A'], dur: 3, prio: false }]
  });
  assert.strictEqual(r.placed.length, 1);
  const s = r.placed[0].start;
  assert.ok(s + 3 <= 24 || s >= 26, 'ne chevauche pas la pause : ' + s);
});

t('planning compact : réunions collées', () => {
  const r = solve({
    lo: 16, hi: 36,
    people: [{ id: 'A', avail: mk(0, 16, 36) }],
    meetings: [{ id: 'a', people: ['A'], dur: 2, prio: false }, { id: 'b', people: ['A'], dur: 2, prio: false }]
  });
  const [x, y] = r.placed;
  assert.strictEqual(y.start, x.start + 2, 'pas de trou entre les deux');
  assert.strictEqual(x.start, 16, 'au plus tôt');
});

// Test de propriétés + comparaison à la force brute sur de petites instances.
function brute(input) {
  const { lo, hi, people, meetings } = input;
  const N = hi - lo;
  let bestVal = 0;
  const busy = {}; people.forEach(p => busy[p.id] = new Array(N).fill(0));
  const val = m => (m.prio ? 1e6 : 1e3) + m.people.length * m.dur;
  (function rec(i, cur) {
    if (i === meetings.length) { bestVal = Math.max(bestVal, cur); return; }
    const m = meetings[i];
    for (let s = 0; s + m.dur <= N; s++) {
      let ok = true;
      for (const pid of m.people) for (let k = 0; k < m.dur; k++) {
        const p = people.find(q => q.id === pid);
        if (!p.avail[lo + s + k] || busy[pid][s + k]) ok = false;
      }
      if (!ok) continue;
      for (const pid of m.people) for (let k = 0; k < m.dur; k++) busy[pid][s + k] = 1;
      rec(i + 1, cur + val(m));
      for (const pid of m.people) for (let k = 0; k < m.dur; k++) busy[pid][s + k] = 0;
    }
    rec(i + 1, cur);
  })(0, 0);
  return bestVal;
}

let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
t('300 instances aléatoires : validité + optimalité vs force brute', () => {
  for (let it = 0; it < 300; it++) {
    const nP = 2 + Math.floor(rnd() * 3), nM = 2 + Math.floor(rnd() * 4), lo = 16, hi = 16 + 8;
    const people = [];
    for (let p = 0; p < nP; p++) {
      const a = new Array(48).fill(false);
      for (let s = lo; s < hi; s++) a[s] = rnd() < 0.8;
      people.push({ id: 'P' + p, avail: a });
    }
    const meetings = [];
    for (let m = 0; m < nM; m++) {
      const ps = people.filter(() => rnd() < 0.5).map(p => p.id);
      if (!ps.length) ps.push('P0');
      meetings.push({ id: 'M' + m, people: ps, dur: 1 + Math.floor(rnd() * 3), prio: rnd() < 0.3 });
    }
    const input = { lo, hi, people, meetings };
    const r = solve(input);
    // validité
    const busy = {};
    people.forEach(p => busy[p.id] = new Array(48).fill(0));
    let main = 0;
    for (const pl of r.placed) {
      const m = meetings.find(x => x.id === pl.id);
      assert.ok(pl.start >= lo && pl.start + pl.dur <= hi);
      for (const pid of m.people) for (let k = 0; k < m.dur; k++) {
        const slot = pl.start + k;
        assert.ok(people.find(p => p.id === pid).avail[slot], 'dispo respectée');
        assert.strictEqual(busy[pid][slot], 0, 'pas de double réservation');
        busy[pid][slot] = 1;
      }
      main += (m.prio ? 1e6 : 1e3) + m.people.length * m.dur;
    }
    assert.strictEqual(r.placed.length + r.unplaced.length, meetings.length);
    assert.ok(r.optimal);
    assert.strictEqual(main, brute(input), 'valeur optimale (itération ' + it + ')');
  }
});

t('grosse instance : termine vite avec une solution valide', () => {
  const people = [];
  for (let p = 0; p < 12; p++) people.push({ id: 'P' + p, avail: mk(0, 16, 36) });
  const meetings = [];
  for (let m = 0; m < 30; m++) {
    const ps = people.filter((_, i) => (i * 7 + m * 3) % 4 === 0 || i === m % 12).map(p => p.id);
    meetings.push({ id: 'M' + m, people: ps, dur: 1 + (m % 3), prio: m % 5 === 0 });
  }
  const t0 = Date.now();
  const r = solve({ lo: 16, hi: 36, people, meetings });
  const dt = Date.now() - t0;
  console.log('   ', r.placed.length, '/', meetings.length, 'planifiées en', dt, 'ms, optimal =', r.optimal);
  assert.ok(dt < 6000);
  assert.ok(r.placed.length > 0);
});

console.log('\n' + ok + ' tests OK');
