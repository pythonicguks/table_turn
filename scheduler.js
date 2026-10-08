/*
 * Table Turn — moteur de planification
 *
 * Problème : une journée découpée en créneaux de 30 min. Chaque personne a des
 * disponibilités ; chaque réunion a des participants requis, une durée (en
 * créneaux) et un drapeau « prioritaire ». On cherche le meilleur planning :
 *
 *   1. maximiser les réunions prioritaires planifiées (elles passent avant tout) ;
 *   2. puis maximiser les autres réunions planifiées ;
 *   3. à valeur égale, préférer le planning le plus compact (peu de « trous »
 *      dans la journée de chaque personne, réunions plutôt tôt).
 *
 * Recherche exacte (séparation et évaluation) avec garde-fous de temps ; si la
 * limite est atteinte, la meilleure solution trouvée est renvoyée avec
 * optimal = false.
 *
 * Utilisable dans le navigateur (window.Scheduler) et dans Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scheduler = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VAL_PRIO = 1e6;
  var VAL_OTHER = 1e3;

  /**
   * input = {
   *   lo, hi,                 // plage de créneaux absolus [lo, hi) (0 = 00:00, 1 = 00:30…)
   *   people:   [{ id, avail: boolean[] }]   // avail indexé par créneau absolu
   *   meetings: [{ id, people: id[], dur, prio }]  // dur en créneaux de 30 min
   *   blocked:  boolean[]     // créneaux fermés pour tous (pause déjeuner), optionnel
   * }
   */
  function solve(input, opts) {
    var o = Object.assign({ maxNodesA: 4e6, maxNodesB: 3e5, timeMs: 2500, timeBMs: 800 }, opts || {});
    var t0 = Date.now();
    var lo = input.lo;
    var N = Math.max(0, input.hi - lo);
    var people = input.people;
    var pIndex = new Map();
    people.forEach(function (p, i) { pIndex.set(p.id, i); });

    var avail = people.map(function (p) {
      var a = new Uint8Array(N);
      for (var s = 0; s < N; s++) {
        a[s] = p.avail[lo + s] && !(input.blocked && input.blocked[lo + s]) ? 1 : 0;
      }
      return a;
    });

    var ms = input.meetings.map(function (m, i) {
      var seen = {};
      var ps = [];
      (m.people || []).forEach(function (id) {
        var ix = pIndex.get(id);
        if (ix !== undefined && !seen[ix]) { seen[ix] = 1; ps.push(ix); }
      });
      var starts = [];
      if (ps.length && m.dur >= 1 && m.dur <= N) {
        for (var s = 0; s + m.dur <= N; s++) {
          var ok = true;
          for (var a = 0; a < ps.length && ok; a++) {
            for (var k = 0; k < m.dur; k++) {
              if (!avail[ps[a]][s + k]) { ok = false; break; }
            }
          }
          if (ok) starts.push(s);
        }
      }
      var sortedPs = ps.slice().sort(function (x, y) { return x - y; });
      return {
        i: i,
        id: m.id,
        ps: ps,
        dur: m.dur,
        prio: !!m.prio,
        starts: starts,
        v: (m.prio ? VAL_PRIO : VAL_OTHER) + ps.length * m.dur,
        key: (m.prio ? 'P' : 'N') + m.dur + ':' + sortedPs.join(',')
      };
    });

    // Réunions réellement plaçables, les plus contraintes d'abord (prioritaires en tête).
    var order = ms.filter(function (m) { return m.starts.length > 0; }).sort(function (a, b) {
      return (Number(b.prio) - Number(a.prio)) ||
        (a.starts.length - b.starts.length) ||
        (b.dur - a.dur) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) ||
        (a.i - b.i);
    });
    var sameAsPrev = order.map(function (m, k) { return k > 0 && order[k - 1].key === m.key; });
    var suffix = new Array(order.length + 1).fill(0);
    for (var q = order.length - 1; q >= 0; q--) suffix[q] = suffix[q + 1] + order[q].v;

    var busy = people.map(function () { return new Uint8Array(N); });
    var assign = new Int16Array(ms.length).fill(-1);

    function canPlace(m, s) {
      for (var a = 0; a < m.ps.length; a++) {
        var b = busy[m.ps[a]];
        for (var k = 0; k < m.dur; k++) if (b[s + k]) return false;
      }
      return true;
    }
    function setBusy(m, s, v) {
      for (var a = 0; a < m.ps.length; a++) {
        var b = busy[m.ps[a]];
        for (var k = 0; k < m.dur; k++) b[s + k] = v;
      }
    }
    function clearAll() {
      busy.forEach(function (b) { b.fill(0); });
      assign.fill(-1);
    }

    // Critère secondaire : compacité (plus petit = meilleur).
    function score(asg) {
      var gap = 0, startSum = 0;
      var occ = people.map(function () { return new Uint8Array(N); });
      for (var x = 0; x < ms.length; x++) {
        var m = ms[x], s = asg[m.i];
        if (s === undefined || s < 0) continue;
        startSum += s;
        for (var a = 0; a < m.ps.length; a++) for (var k = 0; k < m.dur; k++) occ[m.ps[a]][s + k] = 1;
      }
      for (var p = 0; p < occ.length; p++) {
        var first = -1, last = -1, cnt = 0;
        for (var t = 0; t < N; t++) if (occ[p][t]) { if (first < 0) first = t; last = t; cnt++; }
        if (first >= 0) gap += (last - first + 1) - cnt;
      }
      return gap * 3 + startSum * 0.05;
    }

    // --- Solution gloutonne de départ (borne initiale) ---
    var best = { main: 0, assign: null };
    (function greedy() {
      var cur = 0;
      order.forEach(function (m) {
        for (var j = 0; j < m.starts.length; j++) {
          if (canPlace(m, m.starts[j])) {
            setBusy(m, m.starts[j], 1);
            assign[m.i] = m.starts[j];
            cur += m.v;
            break;
          }
        }
      });
      best = { main: cur, assign: Array.from(assign) };
      clearAll();
    })();

    // --- Phase A : valeur maximale (réunions prioritaires puis autres) ---
    var nodes = 0, abortedA = false;
    var deadlineA = t0 + o.timeMs;
    function dfsA(k, cur) {
      if (abortedA) return;
      if (++nodes > o.maxNodesA || ((nodes & 1023) === 0 && Date.now() > deadlineA)) { abortedA = true; return; }
      if (cur + suffix[k] <= best.main) return;
      if (k === order.length) { best = { main: cur, assign: Array.from(assign) }; return; }
      var m = order[k];
      var minStart = 0, canPlaceIt = true;
      if (sameAsPrev[k]) {
        var prevS = assign[order[k - 1].i];
        if (prevS < 0) canPlaceIt = false; else minStart = prevS + 1;
      }
      if (canPlaceIt) {
        for (var j = 0; j < m.starts.length; j++) {
          var s = m.starts[j];
          if (s < minStart || !canPlace(m, s)) continue;
          setBusy(m, s, 1); assign[m.i] = s;
          dfsA(k + 1, cur + m.v);
          setBusy(m, s, 0); assign[m.i] = -1;
          if (abortedA) return;
        }
      }
      dfsA(k + 1, cur);
    }
    dfsA(0, 0);
    clearAll();

    var bestAssign = best.assign;
    var tieBest = score(bestAssign);

    // --- Phase B : à valeur égale, planning le plus compact ---
    var nodesB = 0, abortedB = false;
    if (!abortedA && order.length) {
      var deadlineB = Date.now() + o.timeBMs;
      var bestMain = best.main;
      var dfsB = function (k, cur) {
        if (abortedB) return;
        if (++nodesB > o.maxNodesB || ((nodesB & 1023) === 0 && Date.now() > deadlineB)) { abortedB = true; return; }
        if (cur + suffix[k] < bestMain) return;
        if (k === order.length) {
          if (cur >= bestMain) {
            var sc = score(assign);
            if (sc < tieBest - 1e-9) { tieBest = sc; bestAssign = Array.from(assign); }
          }
          return;
        }
        var m = order[k];
        var minStart = 0, canPlaceIt = true;
        if (sameAsPrev[k]) {
          var prevS = assign[order[k - 1].i];
          if (prevS < 0) canPlaceIt = false; else minStart = prevS + 1;
        }
        if (canPlaceIt) {
          for (var j = 0; j < m.starts.length; j++) {
            var s = m.starts[j];
            if (s < minStart || !canPlace(m, s)) continue;
            setBusy(m, s, 1); assign[m.i] = s;
            dfsB(k + 1, cur + m.v);
            setBusy(m, s, 0); assign[m.i] = -1;
            if (abortedB) return;
          }
        }
        dfsB(k + 1, cur);
      };
      dfsB(0, 0);
      clearAll();
    }

    // --- Amélioration locale (compacité), et ajout de réunions oubliées si recherche interrompue ---
    (function localSearch(asg) {
      for (var x = 0; x < ms.length; x++) if (asg[x] >= 0) setBusy(ms[x], asg[x], 1);
      order.forEach(function (m) {
        if (asg[m.i] >= 0) return;
        for (var j = 0; j < m.starts.length; j++) {
          if (canPlace(m, m.starts[j])) { setBusy(m, m.starts[j], 1); asg[m.i] = m.starts[j]; break; }
        }
      });
      var cur = score(asg), improved = true, pass = 0;
      while (improved && pass++ < 30) {
        improved = false;
        for (var y = 0; y < order.length; y++) {
          var m = order[y], s0 = asg[m.i];
          if (s0 < 0) continue;
          setBusy(m, s0, 0);
          var bs = s0, bsc = cur;
          for (var j = 0; j < m.starts.length; j++) {
            var s = m.starts[j];
            if (s === s0 || !canPlace(m, s)) continue;
            asg[m.i] = s;
            var sc = score(asg);
            if (sc < bsc - 1e-9) { bsc = sc; bs = s; }
          }
          asg[m.i] = bs;
          setBusy(m, bs, 1);
          if (bs !== s0) { cur = bsc; improved = true; }
        }
      }
      clearAll();
    })(bestAssign);

    // --- Résultat ---
    var placed = [], unplaced = [];
    var stats = { prio: 0, prioPlaced: 0, other: 0, otherPlaced: 0, personSlots: 0 };
    ms.forEach(function (m) {
      if (m.prio) stats.prio++; else stats.other++;
      var s = bestAssign[m.i];
      if (s >= 0) {
        placed.push({ id: m.id, start: lo + s, dur: m.dur });
        if (m.prio) stats.prioPlaced++; else stats.otherPlaced++;
        stats.personSlots += m.ps.length * m.dur;
      }
    });
    placed.sort(function (a, b) { return a.start - b.start; });

    ms.forEach(function (m) {
      if (bestAssign[m.i] >= 0) return;
      var u = { id: m.id, prio: m.prio };
      if (!m.ps.length) {
        u.reason = 'no-people';
      } else if (m.dur > N) {
        u.reason = 'too-long';
      } else if (!m.starts.length) {
        u.reason = 'none-common';
        u.blockers = [];
        m.ps.forEach(function (p) {
          var run = 0, longest = 0;
          for (var s = 0; s < N; s++) { run = avail[p][s] ? run + 1 : 0; if (run > longest) longest = run; }
          if (longest < m.dur) u.blockers.push(people[p].id);
        });
      } else {
        u.reason = 'conflict';
        u.conflicts = [];
        ms.forEach(function (q) {
          var qs = bestAssign[q.i];
          if (qs < 0 || q === m) return;
          if (!q.ps.some(function (p) { return m.ps.indexOf(p) >= 0; })) return;
          var overlaps = m.starts.some(function (s) { return s < qs + q.dur && qs < s + m.dur; });
          if (overlaps) u.conflicts.push(q.id);
        });
      }
      unplaced.push(u);
    });

    return {
      placed: placed,
      unplaced: unplaced,
      stats: stats,
      optimal: !abortedA,
      nodes: nodes + nodesB,
      elapsedMs: Date.now() - t0
    };
  }

  return { solve: solve };
});
