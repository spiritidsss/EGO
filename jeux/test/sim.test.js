'use strict';
// Simulation accélérée : chaque jeu joué jusqu'au bout par des joueurs simulés.
const test = require('node:test');
const assert = require('node:assert');
const { Room } = require('../rooms');
const { GAMES } = require('../games');
const geo = require('../geo');

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function play(gameId, nBots, opts = {}, seed = 1) {
  let t = 1_700_000_000_000;
  const room = new Room('TEST', 'bot-0', { manual: true, clock: () => t, rnd: seeded(seed) });
  room.zone = { lat: 48.8566, lng: 2.3522, r: 250 };
  for (let i = 0; i < nBots; i++) {
    const p = room.addPlayer(`bot-${i}`, `Bot ${i}`, null, true);
    p.speed = 1.4 + (i % 4) * 0.4;
  }
  const err = room.start(gameId, opts);
  assert.equal(err, null);
  const fxCount = { n: 0 };
  room.fx = () => { fxCount.n++; };
  let ticks = 0;
  while (!room.game.over && ticks < 3600) {
    t += 1000;
    room.tick(1);
    // Toutes les vues doivent se construire sans erreur et rester sérialisables.
    if (ticks % 30 === 0) for (const id of room.game.ids) JSON.stringify(room.game.fullView(id));
    ticks++;
  }
  return { room, ticks, over: room.game.over, fx: fxCount.n };
}

for (const id of Object.keys(GAMES)) {
  const G = GAMES[id];
  for (const n of [Math.max(G.meta.min, 2), 6, 12]) {
    test(`${G.meta.name} — ${n} joueurs simulés jouent jusqu'au bout`, () => {
      const { over, ticks, room } = play(id, n);
      assert.ok(over, `la partie ne s'est pas terminée (${ticks} s)`);
      assert.ok(over.title, 'titre de fin manquant');
      assert.ok(Array.isArray(over.ranking) && over.ranking.length === n, 'classement incomplet');
      // Les positions restent dans la zone (avec la marge du bruit GPS).
      for (const p of room.players.values()) assert.ok(geo.dist(p.pos, room.zone) < room.zone.r + 60);
    });
  }
}

test('Espions : un lieu compromis déménage', () => {
  let t = 1_700_000_000_000;
  const room = new Room('T2', 'a', { manual: true, clock: () => t, rnd: seeded(7) });
  room.zone = { lat: 48.85, lng: 2.35, r: 300 };
  for (let i = 0; i < 6; i++) room.addPlayer(`p${i}`, `P${i}`, null, true).pos = { ...room.zone };
  room.start('espions', {});
  room.fx = () => {};
  const g = room.game;
  g.startAt = t;
  for (const id of g.ids) room.players.get(id).pos = geo.offset(room.zone, 280, 0);
  assert.ok(g.launch(0));
  const m = g.missions[0];
  const before = { ...m.point };
  const enemy = g.teams[1][0];
  room.players.get(enemy).pos = { ...m.point };
  g.tick(1);
  assert.equal(m.moves, 1);
  assert.ok(geo.dist(before, m.point) > 50);
});

test('Chasseurs de Primes : une capture fait hériter de la cible', () => {
  let t = 1_700_000_000_000;
  const room = new Room('T3', 'a', { manual: true, clock: () => t, rnd: seeded(3) });
  room.zone = { lat: 48.85, lng: 2.35, r: 300 };
  for (let i = 0; i < 4; i++) room.addPlayer(`p${i}`, `P${i}`, null, true).pos = geo.offset(room.zone, 200, i * 90);
  room.start('primes', {});
  room.fx = () => {};
  const g = room.game;
  g.graceUntil = 0;
  const h = g.ids[0];
  const prey = g.target[h];
  const next = g.target[prey];
  room.players.get(prey).pos = { ...room.players.get(h).pos };
  g.act(h, { type: 'capture' });
  t += 6000;
  g.tick(1);
  assert.equal(g.st[prey].alive, false);
  assert.equal(g.target[h], next);
});

test('Geiger : le compteur monte en s’approchant d’une source', () => {
  let t = 1_700_000_000_000;
  const room = new Room('T4', 'a', { manual: true, clock: () => t, rnd: seeded(5) });
  room.zone = { lat: 48.85, lng: 2.35, r: 300 };
  room.addPlayer('a', 'A', null, true).pos = { ...room.zone };
  room.start('geiger', {});
  const g = room.game;
  const src = g.sources[0];
  room.players.get('a').pos = geo.offset(src, 150, 0);
  const far = g.level('a').sum;
  room.players.get('a').pos = geo.offset(src, 5, 0);
  const near = g.level('a').sum;
  assert.ok(near > far * 3);
});
