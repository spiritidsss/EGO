'use strict';
// Chasseurs de Primes : chacun chasse une cible (flèche + distance), chacun est chassé.
const { Game, geo } = require('./base');

const CAPTURE = 12;
const ESCAPE = 22;
const ESCAPE_T = 5;

function band(d) {
  if (d < 25) return { l: 'moins de 25 m', k: 4 };
  if (d < 50) return { l: '25 – 50 m', k: 3 };
  if (d < 100) return { l: '50 – 100 m', k: 2 };
  if (d < 200) return { l: '100 – 200 m', k: 1 };
  return { l: 'plus de 200 m', k: 0 };
}

class Primes extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.duration = Game.opt(opts, 'duree', [15, 20, 30], 20) * 60;
    const order = [...this.ids].sort(() => this.rnd() - 0.5);
    this.target = {};
    order.forEach((id, i) => { this.target[id] = order[(i + 1) % order.length]; });
    this.st = {};
    for (const id of this.ids) this.st[id] = { alive: true, caps: 0, outAt: null, tipUsed: false, warnedAt: 0, hunterNear: false, revealUntil: 0 };
    this.pending = null; // capture en cours : { hunter, prey, until }
    this.reveals = []; // { id, until }
    // 90 s de dispersion avant que les captures soient possibles.
    this.graceUntil = this.startAt + 90000;
  }

  alive() { return this.ids.filter((id) => this.st[id].alive); }
  hunterOf(id) { return this.alive().find((h) => this.target[h] === id); }

  tick() {
    // Capture en cours : la proie a 5 s pour s'éloigner à plus de 22 m.
    if (this.pending) {
      const { hunter, prey } = this.pending;
      const d = this.d(this.pos(hunter), this.pos(prey));
      if (!this.st[hunter].alive || !this.st[prey].alive) this.pending = null;
      else if (this.now >= this.pending.until) {
        if (d <= ESCAPE) this.capture(hunter, prey);
        else {
          this.fx(prey, { s: 'relief', v: [60], m: '💨 Tu t’es échappé !', k: 'good' });
          this.fx(hunter, { s: 'nope', v: [200], m: `💨 ${this.name(prey)} s’est échappé…`, k: 'bad' });
        }
        this.pending = null;
      }
    }
    // Alerte de proximité du chasseur.
    for (const id of this.alive()) {
      const h = this.hunterOf(id);
      const s = this.st[id];
      if (!h) continue;
      const near = this.d(this.pos(id), this.pos(h)) < 50;
      if (near && !s.hunterNear && this.now - s.warnedAt > 20000) {
        s.warnedAt = this.now;
        this.fx(id, { s: 'heart', v: [100, 100, 100, 100, 100], m: '💓 Ton chasseur est à moins de 50 m…', k: 'bad' });
      }
      s.hunterNear = near;
    }
    this.reveals = this.reveals.filter((r) => r.until > this.now);
    const alive = this.alive();
    if (alive.length <= 1 || this.elapsed >= this.duration) this.end();
  }

  capture(hunter, prey) {
    const s = this.st[prey];
    s.alive = false;
    s.outAt = this.elapsed;
    this.st[hunter].caps++;
    this.target[hunter] = this.target[prey] === hunter ? null : this.target[prey];
    delete this.target[prey];
    this.fx(prey, { s: 'dead', v: [800], m: `🎯 Capturé par ${this.name(hunter)} ! Tu deviens indic.`, k: 'bad', shake: true });
    this.fx(hunter, { s: 'capture', v: [100, 60, 100, 60, 300], m: `🎯 Prime encaissée ! Nouvelle cible : ${this.target[hunter] ? '???' : 'aucune'}`, k: 'good' });
    this.feed(`🎯 ${this.name(prey)} a été capturé`, 'bad');
  }

  end() {
    const ranking = this.ranking((id) => (this.st[id].alive ? 1000 : this.st[id].outAt) + this.st[id].caps * 10000)
      .map((r) => ({ ...r, score: this.st[r.id].caps, detail: this.st[r.id].alive ? '🟢 en vie' : '⚫ capturé' }));
    const alive = this.alive();
    const w = alive.length === 1 ? alive[0] : ranking[0].id;
    this.finish({ title: `${this.name(w)} est le meilleur chasseur !`, winners: [w], ranking, unit: '🎯' });
  }

  act(id, a) {
    const s = this.st[id];
    if (a.type === 'capture' && s.alive) {
      const prey = this.target[id];
      if (!prey || this.pending || this.now < this.graceUntil) return;
      if (this.d(this.pos(id), this.pos(prey)) > CAPTURE) return this.fx(id, { s: 'nope', m: 'Ta cible n’est pas à portée', k: 'bad' });
      this.pending = { hunter: id, prey, until: this.now + ESCAPE_T * 1000 };
      this.fx(prey, { s: 'alarm', v: [300, 100, 300, 100, 300], m: '🚨 ON TE CAPTURE ! COURS — 5 s !', k: 'bad', shake: true });
      this.fx(id, { s: 'power', v: [80], m: 'Capture en cours… reste sur lui 5 s !', k: 'info' });
    }
    if (a.type === 'reveal' && !s.alive && !s.tipUsed) {
      if (!this.alive().includes(a.target)) return;
      s.tipUsed = true;
      this.reveals.push({ id: a.target, until: this.now + 20000, by: id });
      this.fx(this.alive(), { s: 'radio', v: [60, 60], m: `📡 Un indic révèle la position de ${this.name(a.target)} (20 s)`, k: 'info' });
    }
  }

  view(me) {
    const s = this.st[me];
    const p = this.pos(me);
    const markers = [this.zoneMarker()];
    const mk = this.playerMarker(me, me, { cls: s.alive ? '' : 'dead' });
    if (mk) markers.push(mk);
    for (const r of this.reveals) {
      if (r.id === me) continue;
      const rp = this.pos(r.id);
      markers.push({ id: 'rv' + r.id, type: 'player', lat: rp.lat, lng: rp.lng, color: '#ffb000', cls: 'revealed', label: this.name(r.id) });
    }
    const prey = this.target[me];
    let panel = null;
    if (s.alive && prey) {
      const pp = this.pos(prey);
      const d = this.d(p, pp);
      panel = { kind: 'compass', bearing: geo.bearing(p, pp), band: band(d).l, heat: band(d).k, inRange: d <= CAPTURE, grace: this.now < this.graceUntil };
    }
    const revealed = this.reveals.some((r) => r.id === me);
    let status = null;
    if (!s.alive) status = { text: s.tipUsed ? '⚫ Capturé — tu as donné ton tuyau' : '⚫ Capturé — tu peux révéler un joueur une fois', cls: 'bad' };
    else if (this.pending && this.pending.prey === me) status = { text: `🚨 COURS ! ${Math.max(0, Math.ceil((this.pending.until - this.now) / 1000))} s`, cls: 'bad pulse' };
    else if (this.pending && this.pending.hunter === me) status = { text: `🎯 Capture… ${Math.max(0, Math.ceil((this.pending.until - this.now) / 1000))} s`, cls: 'good pulse' };
    else if (revealed) status = { text: '📡 Ta position est révélée !', cls: 'bad pulse' };
    else if (this.now < this.graceUntil) status = { text: `🌫️ Dispersion — chasse dans ${Math.ceil((this.graceUntil - this.now) / 1000)} s`, cls: 'info' };
    else if (s.hunterNear) status = { text: '💓 Ton chasseur est tout près…', cls: 'bad' };
    const actions = [];
    if (s.alive) actions.push({ id: 'capture', label: 'Capturer', icon: '🎯', enabled: !!(panel && panel.inRange && !this.pending && !panel.grace), big: true });
    else if (!s.tipUsed) actions.push({ id: 'reveal', label: 'Révéler un joueur', icon: '📡', choices: this.alive().map((o) => ({ v: o, l: this.name(o) })), argKey: 'target' });
    const hunter = this.hunterOf(me);
    return {
      hud: {
        chips: [
          { icon: '🎯', label: 'Primes', value: s.caps },
          { icon: '🧍', label: 'En lice', value: this.alive().length },
        ],
        ends: this.startAt + this.duration * 1000,
        status,
      },
      markers,
      panel,
      audio: { heart: s.alive && hunter ? Math.max(0, Math.min(1, (80 - this.d(p, this.pos(hunter))) / 70)) : 0 },
      actions,
      danger: !!(this.pending && this.pending.prey === me),
    };
  }

  botTarget(id) {
    const s = this.st[id];
    if (!s.alive) return null;
    if (this.pending && this.pending.prey === id) return { ...geo.offset(this.pos(id), 40, geo.bearing(this.pos(this.pending.hunter), this.pos(id))), speed: 4 };
    const prey = this.target[id];
    if (!prey) return null;
    return { ...this.pos(prey), speed: 2.2 };
  }

  botAct(id) {
    const s = this.st[id];
    if (s.alive) {
      const prey = this.target[id];
      if (prey && this.d(this.pos(id), this.pos(prey)) <= CAPTURE) this.act(id, { type: 'capture' });
    } else if (!s.tipUsed && this.rnd() < 0.01) {
      const a = this.alive();
      if (a.length) this.act(id, { type: 'reveal', target: a[0] });
    }
  }
}

Primes.meta = {
  id: 'primes', name: 'Chasseurs de Primes', min: 2, max: 24,
  opts: [{ key: 'duree', label: 'Durée', def: 20, choices: [{ v: 15, l: '15 min' }, { v: 20, l: '20 min' }, { v: 30, l: '30 min' }] }],
};

module.exports = Primes;
