'use strict';
// Météorites : esquiver les cercles d'impact, ramasser les cristaux, dernier debout.
const { Game, geo } = require('./base');

class Meteores extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.lives = Game.opt(opts, 'vies', [1, 3, 5], 3);
    this.maxDuration = 20 * 60;
    this.st = {};
    for (const id of this.ids) this.st[id] = { lives: this.lives, crystals: 0, outAt: null, hits: 0 };
    this.impacts = [];
    this.crystals = [];
    this.seq = 0;
    this.nextSpawn = 8;
    this.nextGiant = 180;
    this.solo = this.ids.length === 1;
  }

  alive() { return this.ids.filter((id) => this.st[id].lives > 0); }

  // Intensité qui monte avec le temps : 0 au départ, 1 vers 12 minutes.
  get level() { return Math.min(1, this.elapsed / 720); }

  spawn() {
    const lv = this.level;
    const warn = 20 - 9 * lv;
    const roll = this.rnd();
    const alive = this.alive();
    // Un impact sur deux vise un joueur vivant au hasard (avec un décalage).
    const aim = () => {
      if (alive.length && this.rnd() < 0.55) {
        const p = this.pos(alive[Math.floor(this.rnd() * alive.length)]);
        const c = geo.offset(p, this.rnd() * 25, this.rnd() * 360);
        return this.inZone(c) ? c : this.rndPoint();
      }
      return this.rndPoint();
    };
    if (lv > 0.25 && roll < 0.25) {
      // Pluie : 3 à 5 impacts en chaîne sur une ligne.
      const n = 3 + Math.floor(this.rnd() * 3);
      const start = aim();
      const brg = this.rnd() * 360;
      for (let i = 0; i < n; i++) {
        const c = geo.offset(start, (i - n / 2) * 35, brg);
        this.impacts.push({ id: ++this.seq, ...c, r: 22 + 8 * lv, at: this.now + (warn + i * 1.5) * 1000, warnFrom: this.now, kind: 'rain' });
      }
    } else {
      const n = 1 + Math.floor(lv * 2.5 + this.rnd() * (1 + lv));
      for (let i = 0; i < n; i++) {
        const c = aim();
        this.impacts.push({ id: ++this.seq, ...c, r: 20 + 25 * lv + this.rnd() * 10, at: this.now + warn * 1000, warnFrom: this.now, kind: 'std' });
      }
    }
    this.fx('all', { s: 'warn', v: [40] });
  }

  spawnGiant() {
    const c = this.rndPoint(this.zone.r * 0.6);
    this.impacts.push({ id: ++this.seq, ...c, r: Math.min(90, this.zone.r * 0.45), at: this.now + 25000, warnFrom: this.now, kind: 'giant' });
    this.feed('☄️ MÉTÉORE GÉANT en approche !', 'bad');
    this.fx('all', { s: 'alarm', v: [200, 100, 200, 100, 200], m: '☄️ Météore géant ! 25 s pour fuir', k: 'bad' });
  }

  tick() {
    const t = this.elapsed;
    if (t >= this.nextSpawn) {
      this.spawn();
      this.nextSpawn = t + (14 - 8 * this.level) + this.rnd() * 4;
    }
    if (t >= this.nextGiant) {
      this.spawnGiant();
      this.nextGiant += 180;
    }
    for (const im of this.impacts.filter((x) => !x.done && x.at <= this.now)) {
      const hit = [];
      for (const id of this.alive()) {
        if (this.d(this.pos(id), im) <= im.r) {
          const s = this.st[id];
          s.lives--;
          s.hits++;
          hit.push(id);
          if (s.lives <= 0) {
            s.outAt = t;
            this.fx(id, { s: 'dead', v: [600], m: '💀 Éliminé ! Tu passes spectateur.', k: 'bad', shake: true });
            this.feed(`💀 ${this.name(id)} est pulvérisé`, 'bad');
          } else this.fx(id, { s: 'hit', v: [300, 80, 200], m: `💥 Touché ! ${s.lives} vie${s.lives > 1 ? 's' : ''}`, k: 'bad', shake: true });
        }
      }
      for (const id of this.ids) if (!hit.includes(id) && this.d(this.pos(id), im) < im.r + 60) this.fx(id, { s: 'boom', v: [80], shake: true });
      // Cristaux nés de l'impact.
      const nc = im.kind === 'giant' ? 3 : 1;
      for (let i = 0; i < nc; i++) {
        const c = geo.offset(im, this.rnd() * im.r * 0.6, this.rnd() * 360);
        this.crystals.push({ id: ++this.seq, ...c, until: this.now + 45000, value: im.kind === 'giant' ? 3 : 1 });
      }
      im.done = true;
      im.blastUntil = this.now + 2500;
    }
    this.impacts = this.impacts.filter((x) => !x.done || x.blastUntil > this.now);
    this.crystals = this.crystals.filter((c) => c.until > this.now);
    for (const id of this.alive()) {
      for (const c of [...this.crystals]) {
        if (this.d(this.pos(id), c) <= 12) {
          this.st[id].crystals += c.value;
          this.crystals = this.crystals.filter((x) => x !== c);
          this.fx(id, { s: 'pickup', v: [30], m: `🔷 +${c.value} cristal`, k: 'score' });
        }
      }
    }
    const alive = this.alive();
    if ((!this.solo && alive.length <= 1) || alive.length === 0 || t >= this.maxDuration) this.end();
  }

  end() {
    const score = (id) => this.st[id].lives * 1000 + (this.st[id].outAt ?? this.elapsed) * 1 + this.st[id].crystals * 10;
    const ranking = this.ranking(score).map((r) => ({ ...r, score: this.st[r.id].crystals, detail: this.st[r.id].lives > 0 ? `${this.st[r.id].lives} ❤️` : `éliminé à ${fmt(this.st[r.id].outAt)}` }));
    const w = ranking[0];
    this.finish({ title: this.solo ? `Tu as tenu ${fmt(this.elapsed)} !` : `${w.name} est le dernier debout !`, winners: this.solo ? [] : [w.id], ranking, unit: '🔷' });
  }

  view(me) {
    const s = this.st[me];
    const markers = [this.zoneMarker()];
    for (const im of this.impacts) {
      const total = im.at - im.warnFrom;
      markers.push({
        id: 'm' + im.id, type: 'impact', lat: im.lat, lng: im.lng, r: im.r, cls: im.done ? 'blast' : im.kind,
        at: im.at, total, label: im.done ? '' : `${Math.max(0, Math.ceil((im.at - this.now) / 1000))}`,
      });
    }
    for (const c of this.crystals) markers.push({ id: 'c' + c.id, type: 'item', lat: c.lat, lng: c.lng, cls: 'crystal', icon: '🔷', label: c.value > 1 ? `+${c.value}` : '' });
    for (const id of this.ids) {
      if (this.st[id].lives <= 0 && id !== me) continue;
      const mk = this.playerMarker(id, me, { cls: this.st[id].lives <= 0 ? 'dead' : '' });
      if (mk) markers.push(mk);
    }
    const p = this.pos(me);
    const danger = this.impacts.find((im) => !im.done && this.d(p, im) <= im.r);
    let status = null;
    if (s.lives <= 0) status = { text: '💀 Éliminé — tu regardes la fin', cls: 'bad' };
    else if (danger) status = { text: `⚠️ SORS DU CERCLE — ${Math.max(0, Math.ceil((danger.at - this.now) / 1000))} s`, cls: 'bad pulse' };
    return {
      hud: {
        chips: [
          { icon: '❤️', label: 'Vies', value: '❤️'.repeat(Math.max(0, s.lives)) || '—' },
          { icon: '🔷', label: 'Cristaux', value: s.crystals },
          { icon: '🧍', label: 'En vie', value: this.alive().length },
        ],
        elapsedFrom: this.startAt,
        status,
      },
      markers,
      actions: [],
      danger: !!danger,
    };
  }

  botTarget(id) {
    if (this.st[id].lives <= 0) return null;
    const p = this.pos(id);
    const danger = this.impacts.find((im) => !im.done && this.d(p, im) <= im.r + 5);
    if (danger) {
      const away = geo.offset(danger, danger.r + 20, geo.bearing(danger, p));
      return { ...away, speed: 3.2 };
    }
    let best = null;
    let bd = 120;
    for (const c of this.crystals) {
      const d = this.d(p, c);
      const risky = this.impacts.some((im) => !im.done && this.d(c, im) <= im.r);
      if (!risky && d < bd) { bd = d; best = c; }
    }
    return best;
  }
}

function fmt(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

Meteores.meta = {
  id: 'meteores', name: 'Météorites', min: 1, max: 24,
  opts: [{ key: 'vies', label: 'Vies', def: 3, choices: [{ v: 1, l: '1 vie' }, { v: 3, l: '3 vies' }, { v: 5, l: '5 vies' }] }],
};

module.exports = Meteores;
