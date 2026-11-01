'use strict';
// La Zone : la zone rétrécit, on perd des PV dehors ; soins, boucliers, pièges ; dernier en vie.
const { Game, geo } = require('./base');

const ITEMS = {
  soin: { icon: '💚', label: 'Soin', desc: '+35 PV' },
  bouclier: { icon: '🛡️', label: 'Bouclier', desc: 'Absorbe 40 dégâts' },
  piege: { icon: '🪤', label: 'Piège', desc: 'Pose un piège invisible ici (−30 PV)' },
};

class Zone extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.phaseLen = Game.opt(opts, 'phase', [2, 3], 3) * 60;
    this.st = {};
    for (const id of this.ids) this.st[id] = { hp: 100, shield: 0, inv: [], outAt: null, dmgTaken: 0, trapsHit: 0, lastHurt: 0 };
    this.cur = { lat: this.zone.lat, lng: this.zone.lng, r: this.zone.r };
    this.from = { ...this.cur };
    this.phase = 0;
    this.shrinkStart = null;
    this.next = null;
    this.items = [];
    this.traps = [];
    this.seq = 0;
    this.solo = this.ids.length === 1;
    this.planNext();
    this.spawnItems(3 + this.ids.length);
  }

  planNext() {
    // Rétrécit de 45 % à chaque phase ; sous 30 m, la zone se ferme complètement.
    const r = this.cur.r < 30 ? 0 : this.cur.r * 0.55;
    const c = geo.randomIn(this.cur, Math.max(0, this.cur.r - r), 0, this.rnd);
    this.next = { lat: c.lat, lng: c.lng, r };
    this.nextAt = (this.phase + 1) * this.phaseLen; // début du rétrécissement (s)
  }

  spawnItems(n) {
    const keys = Object.keys(ITEMS);
    for (let i = 0; i < n; i++) {
      const c = geo.randomIn(this.next || this.cur, (this.next || this.cur).r * 0.95, 0, this.rnd);
      this.items.push({ id: ++this.seq, ...c, kind: keys[Math.floor(this.rnd() * keys.length)] });
    }
  }

  alive() { return this.ids.filter((id) => this.st[id].hp > 0); }

  hurt(id, n, why) {
    const s = this.st[id];
    if (s.shield > 0) {
      const a = Math.min(s.shield, n);
      s.shield -= a;
      n -= a;
    }
    s.hp = Math.max(0, s.hp - n);
    s.dmgTaken += n;
    if (s.hp <= 0 && s.outAt == null) {
      s.outAt = this.elapsed;
      this.fx(id, { s: 'dead', v: [600], m: `💀 Éliminé (${why})`, k: 'bad', shake: true });
      this.feed(`💀 ${this.name(id)} est tombé (${why})`, 'bad');
    }
  }

  tick(dt) {
    const t = this.elapsed;
    // Rétrécissement progressif sur 30 s.
    if (t >= this.nextAt && !this.shrinkStart) {
      this.shrinkStart = t;
      this.from = { ...this.cur };
      this.fx('all', { s: 'alarm', v: [150, 80, 150], m: '🔥 La zone se referme !', k: 'bad' });
      this.feed('🔥 La zone rétrécit', 'bad');
    }
    if (this.shrinkStart != null) {
      const k = Math.min(1, (t - this.shrinkStart) / 30);
      const c = geo.toward(this.from, this.next, geo.dist(this.from, this.next) * k);
      this.cur = { lat: c.lat, lng: c.lng, r: this.from.r + (this.next.r - this.from.r) * k };
      if (k >= 1) {
        this.phase++;
        this.shrinkStart = null;
        this.planNext();
        this.spawnItems(2 + Math.ceil(this.alive().length / 2));
      }
    }
    if (this.shrinkStart == null && this.nextAt - t <= 60 && this.warned !== this.phase) {
      this.warned = this.phase;
      this.fx('all', { s: 'warn', v: [60, 60, 60], m: '⏳ La zone rétrécit dans 60 s', k: 'info' });
    }
    const dps = 2 + 2 * this.phase;
    for (const id of this.alive()) {
      const p = this.pos(id);
      if (geo.dist(p, this.cur) > this.cur.r) {
        this.hurt(id, dps * dt, 'zone');
        if (this.now - this.st[id].lastHurt > 3000) {
          this.st[id].lastHurt = this.now;
          this.fx(id, { s: 'burn', v: [120] });
        }
      }
      for (const it of [...this.items]) {
        if (this.d(p, it) <= 14 && this.st[id].inv.length < 3) {
          this.st[id].inv.push(it.kind);
          this.items = this.items.filter((x) => x !== it);
          this.fx(id, { s: 'pickup', v: [35], m: `${ITEMS[it.kind].icon} ${ITEMS[it.kind].label} ramassé`, k: 'good' });
        }
      }
      for (const tr of [...this.traps]) {
        if (tr.owner !== id && this.d(p, tr) <= 12) {
          this.traps = this.traps.filter((x) => x !== tr);
          this.st[id].trapsHit++;
          this.fx(id, { s: 'trap', v: [200, 50, 200], m: `🪤 Piège de ${this.name(tr.owner)} ! −30 PV`, k: 'bad', shake: true });
          this.fx(tr.owner, { s: 'pickup', m: `🪤 ${this.name(id)} est tombé dans ton piège`, k: 'good' });
          this.hurt(id, 30, 'piège');
        }
      }
    }
    const alive = this.alive();
    if ((!this.solo && alive.length <= 1) || alive.length === 0 || t > 40 * 60) this.end();
  }

  end() {
    const ranking = this.ranking((id) => (this.st[id].hp > 0 ? 100000 + this.st[id].hp : this.st[id].outAt))
      .map((r) => ({ ...r, score: Math.round(this.st[r.id].hp), detail: this.st[r.id].hp > 0 ? `${Math.round(this.st[r.id].hp)} PV` : `tombé à ${Math.floor((this.st[r.id].outAt || 0) / 60)}:${String(Math.floor((this.st[r.id].outAt || 0) % 60)).padStart(2, '0')}` }));
    this.finish({ title: this.solo ? `Tu as survécu ${Math.floor(this.elapsed / 60)} min !` : `${ranking[0].name} survit à la Zone !`, winners: [ranking[0].id], ranking, unit: 'PV' });
  }

  act(id, a) {
    const s = this.st[id];
    if (s.hp <= 0 || a.type !== 'use') return;
    const i = s.inv.indexOf(a.item);
    if (i < 0) return;
    s.inv.splice(i, 1);
    if (a.item === 'soin') { s.hp = Math.min(100, s.hp + 35); this.fx(id, { s: 'heal', v: [40, 40, 40], m: '💚 +35 PV', k: 'good' }); }
    if (a.item === 'bouclier') { s.shield = 40; this.fx(id, { s: 'shield', v: [60], m: '🛡️ Bouclier actif', k: 'good' }); }
    if (a.item === 'piege') { this.traps.push({ id: ++this.seq, ...this.pos(id), owner: id }); this.fx(id, { s: 'power', m: '🪤 Piège posé', k: 'good' }); }
  }

  view(me) {
    const s = this.st[me];
    const markers = [
      { id: 'cur', type: 'circle', lat: this.cur.lat, lng: this.cur.lng, r: this.cur.r, cls: 'zone-safe' },
      { id: 'next', type: 'circle', lat: this.next.lat, lng: this.next.lng, r: this.next.r, cls: 'zone-next' },
      { id: 'outer', type: 'circle', lat: this.zone.lat, lng: this.zone.lng, r: this.zone.r, cls: 'zone-edge faint' },
    ];
    for (const it of this.items) markers.push({ id: 'i' + it.id, type: 'item', lat: it.lat, lng: it.lng, cls: it.kind, icon: ITEMS[it.kind].icon });
    for (const tr of this.traps) if (tr.owner === me) markers.push({ id: 't' + tr.id, type: 'item', lat: tr.lat, lng: tr.lng, cls: 'trap', icon: '🪤' });
    for (const id of this.ids) {
      if (this.st[id].hp <= 0 && id !== me) continue;
      const mk = this.playerMarker(id, me, { cls: this.st[id].hp <= 0 ? 'dead' : '' });
      if (mk) markers.push(mk);
    }
    const out = s.hp > 0 && geo.dist(this.pos(me), this.cur) > this.cur.r;
    const left = Math.max(0, Math.ceil(this.nextAt - this.elapsed));
    let status = null;
    if (s.hp <= 0) status = { text: '💀 Éliminé — tu regardes la fin', cls: 'bad' };
    else if (out) status = { text: `☢️ HORS ZONE — −${2 + 2 * this.phase} PV/s`, cls: 'bad pulse' };
    return {
      hud: {
        chips: [
          { icon: '❤️', label: 'PV', value: Math.ceil(s.hp), bar: s.hp / 100 },
          { icon: '🛡️', label: 'Bouclier', value: s.shield },
          { icon: '🧍', label: 'En vie', value: this.alive().length },
        ],
        sub: this.shrinkStart != null ? 'La zone se referme…' : `Rétrécissement dans ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
        elapsedFrom: this.startAt,
        status,
      },
      markers,
      actions: s.hp > 0 ? s.inv.map((k, i) => ({ id: 'use', key: k + i, args: { item: k }, label: ITEMS[k].label, icon: ITEMS[k].icon, hint: ITEMS[k].desc })) : [],
      danger: out,
    };
  }

  botTarget(id) {
    if (this.st[id].hp <= 0) return null;
    const p = this.pos(id);
    const tgt = this.shrinkStart != null || this.nextAt - this.elapsed < 40 ? this.next : this.cur;
    if (geo.dist(p, tgt) > tgt.r * 0.7) return { ...tgt, speed: 2.8 };
    let best = null;
    let bd = 100;
    for (const it of this.items) {
      const d = this.d(p, it);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  botAct(id) {
    const s = this.st[id];
    if (s.hp > 0 && s.inv.length && (s.hp < 60 || this.rnd() < 0.03)) this.act(id, { type: 'use', item: s.inv.includes('soin') && s.hp < 60 ? 'soin' : s.inv[0] });
  }
}

Zone.meta = {
  id: 'zone', name: 'La Zone', min: 1, max: 24,
  opts: [{ key: 'phase', label: 'Rythme', def: 3, choices: [{ v: 2, l: 'Rapide (2 min)' }, { v: 3, l: 'Normal (3 min)' }] }],
};

module.exports = Zone;
