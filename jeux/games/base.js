'use strict';
// Classe de base des jeux : accès aux joueurs, positions, effets, fin de partie, vue commune.
const geo = require('../geo');

class Game {
  constructor(room, opts = {}) {
    this.room = room;
    this.opts = opts;
    this.zone = { ...room.zone };
    this.ids = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
    this.startAt = room.now();
    this.over = null;
    this.feedList = [];
    this.feedSeq = 0;
  }

  static opt(opts, key, choices, def) {
    const v = opts && opts[key];
    return choices.some((c) => String(c) === String(v)) ? (typeof def === 'number' ? Number(v) : v) : def;
  }

  get now() { return this.room.now(); }
  get elapsed() { return Math.max(0, (this.now - this.startAt) / 1000); }
  get rnd() { return this.room.rnd; }

  player(id) { return this.room.players.get(id); }
  pos(id) { const p = this.player(id); return p && p.pos; }
  name(id) { const p = this.player(id); return p ? p.name : '?'; }
  color(id) { const p = this.player(id); return p ? p.color : '#888'; }
  d(a, b) { return geo.dist(a, b); }
  dp(id, point) { return geo.dist(this.pos(id), point); }

  rndPoint(rMax = this.zone.r * 0.92, rMin = 0, centre = this.zone) {
    return geo.randomIn(centre, rMax, rMin, this.rnd);
  }

  // Point aléatoire à au moins `away` mètres de tous les points donnés (best effort).
  farPoint(points, away, rMax) {
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 30; i++) {
      const c = this.rndPoint(rMax);
      const m = Math.min(Infinity, ...points.filter(Boolean).map((p) => geo.dist(p, c)));
      if (m >= away) return c;
      if (m > bestD) { bestD = m; best = c; }
    }
    return best;
  }

  inZone(p, z = this.zone) { return geo.dist(p, z) <= z.r; }

  fx(target, fx) { this.room.fx(target, fx); }

  feed(msg, kind = 'info') {
    this.feedList.push({ id: ++this.feedSeq, msg, kind, at: this.now });
    if (this.feedList.length > 6) this.feedList.shift();
  }

  finish(result) {
    if (this.over) return;
    this.over = { ...result, at: this.now };
    for (const id of this.ids) {
      const win = result.winners && result.winners.includes(id);
      this.fx(id, { s: win ? 'win' : 'lose', v: win ? [80, 60, 80, 60, 300] : [400] });
    }
    this.room.broadcastRoom();
  }

  _tick(dt) {
    if (this.over) return;
    this.tick(dt);
  }

  _act(pid, a) {
    if (this.over || !this.ids.includes(pid)) return;
    this.act(pid, a);
  }

  tick() {}
  act() {}

  fullView(pid) {
    const v = this.over ? { over: this.over } : {};
    const base = {
      game: this.constructor.meta.id,
      zone: this.zone,
      startAt: this.startAt,
      feed: this.feedList,
      players: this.ids.map((id) => ({ id, name: this.name(id), color: this.color(id) })),
    };
    let own = {};
    if (this.ids.includes(pid)) own = this.view(pid) || {};
    else own = this.spectatorView ? this.spectatorView() : { hud: { title: 'Spectateur' }, markers: [] };
    return { ...base, ...own, ...v };
  }

  // Marqueur standard d'un joueur.
  playerMarker(id, me, extra = {}) {
    const p = this.pos(id);
    if (!p) return null;
    return { id: 'p-' + id, type: id === me ? 'me' : 'player', lat: p.lat, lng: p.lng, color: this.color(id), label: this.name(id), ...extra };
  }

  zoneMarker(z = this.zone, extra = {}) {
    return { id: 'zone', type: 'circle', lat: z.lat, lng: z.lng, r: z.r, cls: 'zone-edge', ...extra };
  }

  ranking(scoreOf, idList = this.ids) {
    return idList
      .map((id) => ({ id, name: this.name(id), color: this.color(id), score: scoreOf(id) }))
      .sort((a, b) => b.score - a.score);
  }
}

// Deux à quatre équipes équilibrées, mélangées.
function makeTeams(ids, n, rnd) {
  const shuffled = [...ids].sort(() => rnd() - 0.5);
  const teams = Array.from({ length: n }, () => []);
  shuffled.forEach((id, i) => teams[i % n].push(id));
  return teams;
}

const TEAM_INFO = [
  { name: 'Bleus', color: '#3d8bff' },
  { name: 'Rouges', color: '#ff3d5a' },
  { name: 'Verts', color: '#2ee59d' },
];

module.exports = { Game, makeTeams, TEAM_INFO, geo };
