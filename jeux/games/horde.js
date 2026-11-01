'use strict';
// La Horde : fuir des créatures qui poursuivent les joueurs, trouver 5 batteries, rejoindre l'évacuation.
const { Game, geo } = require('./base');

const TYPES = {
  rodeur: { speed: 1.25, sight: 60, icon: '🧟', label: 'Rôdeur' },
  sprinteur: { speed: 4.2, sight: 70, icon: '🐺', label: 'Sprinteur' },
  guetteur: { speed: 0, sight: 45, icon: '👁️', label: 'Guetteur' },
  traqueur: { speed: 2.3, sight: 9999, icon: '💀', label: 'Traqueur' },
};
const ITEMS = {
  fusee: { icon: '🎆', label: 'Fusée', desc: 'Fait fuir les créatures à 35 m pendant 15 s' },
  leurre: { icon: '📢', label: 'Leurre', desc: 'Attire les créatures à 150 m pendant 30 s' },
  abri: { icon: '⛺', label: 'Abri', desc: 'Zone sûre de 25 m pendant 60 s' },
};
const CATCH = 8;
const BATTERIES = 5;

class Horde extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.diff = Game.opt(opts, 'difficulte', ['facile', 'normal', 'cauchemar'], 'normal');
    this.mult = { facile: 0.7, normal: 1, cauchemar: 1.4 }[this.diff];
    this.st = {};
    for (const id of this.ids) this.st[id] = { lives: 3, invUntil: 0, inv: [], zombie: false, evac: false, callReady: 0, isolatedSince: null, hits: 0, bats: 0 };
    this.mobs = [];
    this.items = [];
    this.bats = [];
    this.found = 0;
    this.lures = [];
    this.shelters = [];
    this.flares = [];
    this.seq = 0;
    this.extract = null;
    this.extractUntil = 0;
    const n = Math.round((2 + Math.ceil(this.ids.length / 2)) * this.mult);
    for (let i = 0; i < n; i++) this.spawnMob('rodeur');
    for (let i = 0; i < 2; i++) this.spawnMob('guetteur');
    this.spawnMob('sprinteur');
    this.spawnBattery();
    this.spawnBattery();
    for (let i = 0; i < 2 + Math.ceil(this.ids.length / 2); i++) this.spawnItem();
    this.nextGrow = 120;
  }

  humans() { return this.ids.filter((id) => !this.st[id].zombie && !this.st[id].evac); }

  spawnMob(type, at) {
    const pts = this.humans().map((id) => this.pos(id));
    const p = at || this.farPoint(pts, 110, this.zone.r * 0.95);
    const m = { id: ++this.seq, type, lat: p.lat, lng: p.lng, target: null, state: 'idle', until: 0, wander: null, alertUntil: 0 };
    this.mobs.push(m);
    return m;
  }

  spawnBattery() {
    if (this.found + this.bats.length >= BATTERIES) return;
    const pts = this.humans().map((id) => this.pos(id));
    this.bats.push({ id: ++this.seq, ...this.farPoint(pts, 90, this.zone.r * 0.9) });
  }

  spawnItem() {
    const keys = Object.keys(ITEMS);
    this.items.push({ id: ++this.seq, ...this.rndPoint(), kind: keys[Math.floor(this.rnd() * keys.length)] });
  }

  inShelter(p) { return this.shelters.some((s) => this.d(p, s) <= 25); }

  nearestHuman(m, max) {
    let best = null;
    let bd = max;
    for (const id of this.humans()) {
      const p = this.pos(id);
      if (this.inShelter(p)) continue;
      const d = this.d(m, p);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  moveMob(m, dt) {
    const T = TYPES[m.type];
    if (T.speed === 0) return;
    const speed = T.speed * (this.diff === 'cauchemar' ? 1.12 : this.diff === 'facile' ? 0.88 : 1);
    // Fusées : fuite.
    const flare = this.flares.find((f) => f.until > this.now && this.d(m, f) < 45);
    if (flare) {
      const away = geo.offset(m, speed * 1.5 * dt, geo.bearing(flare, m));
      Object.assign(m, away);
      return;
    }
    // Leurres : attraction.
    const lure = this.lures.find((l) => l.until > this.now && this.d(m, l) < 150);
    let goal = null;
    let sp = speed;
    if (lure) goal = lure;
    else if (m.type === 'traqueur') {
      if (m.target && this.humans().includes(m.target)) goal = this.pos(m.target);
    } else if (m.type === 'sprinteur') {
      if (m.state === 'rest') {
        if (this.now > m.until) m.state = 'idle';
        return;
      }
      if (m.state === 'charge') {
        if (this.now > m.until || !this.humans().includes(m.target)) { m.state = 'rest'; m.until = this.now + 20000; return; }
        goal = m.chargeTo;
      } else {
        const h = this.nearestHuman(m, T.sight);
        if (h) {
          m.state = 'charge';
          m.target = h;
          m.until = this.now + 8000;
          // Charge en ligne droite vers la position actuelle, prolongée : on l'esquive par un écart.
          const p = this.pos(h);
          m.chargeTo = geo.offset(m, this.d(m, p) + 25, geo.bearing(m, p));
          this.fx(h, { s: 'roar', v: [300, 100, 300], m: '🐺 Un sprinteur te charge ! Écarte-toi !', k: 'bad' });
          goal = m.chargeTo;
        }
      }
    } else {
      const alerted = m.alertUntil > this.now && m.target && this.humans().includes(m.target);
      const h = alerted ? m.target : this.nearestHuman(m, T.sight * this.mult);
      if (h) goal = this.pos(h);
      else sp = speed * 0.6;
    }
    if (!goal) {
      if (!m.wander || this.d(m, m.wander) < 8) m.wander = this.rndPoint();
      goal = m.wander;
    }
    let next = geo.toward(m, goal, sp * dt);
    // Les créatures ne peuvent pas entrer dans un abri.
    for (const s of this.shelters) {
      if (this.d(next, s) < 25) next = geo.offset(s, 25.5, geo.bearing(s, next));
    }
    // Ni sortir de la zone.
    if (!this.inZone(next)) next = geo.offset(this.zone, this.zone.r - 1, geo.bearing(this.zone, next));
    m.lat = next.lat;
    m.lng = next.lng;
  }

  tick(dt) {
    const t = this.elapsed;
    this.lures = this.lures.filter((l) => l.until > this.now);
    this.shelters = this.shelters.filter((s) => s.until > this.now);
    this.flares = this.flares.filter((f) => f.until > this.now);
    if (t >= this.nextGrow) {
      this.nextGrow += 120;
      this.spawnMob('rodeur');
      if (Math.floor(t / 120) % 2 === 0) this.spawnMob('sprinteur');
      if (this.items.length < 4) this.spawnItem();
      this.feed('🌑 La horde grossit…', 'bad');
    }
    // Guetteurs : alertent les rôdeurs.
    for (const g of this.mobs.filter((m) => m.type === 'guetteur')) {
      const h = this.nearestHuman(g, TYPES.guetteur.sight);
      if (h && (!g.cool || g.cool < this.now)) {
        g.cool = this.now + 30000;
        let n = 0;
        for (const m of this.mobs) {
          if (m.type === 'rodeur' && this.d(m, g) < 250) { m.target = h; m.alertUntil = this.now + 30000; n++; }
        }
        this.fx(h, { s: 'scream', v: [500], m: `👁️ Un guetteur t’a vu ! ${n} rôdeurs alertés`, k: 'bad' });
      }
    }
    // Traqueur : joueur isolé depuis 30 s.
    for (const id of this.humans()) {
      const s = this.st[id];
      const p = this.pos(id);
      const others = this.humans().filter((o) => o !== id);
      const alone = others.length > 0 && others.every((o) => this.d(p, this.pos(o)) > 150);
      if (alone) {
        if (s.isolatedSince == null) s.isolatedSince = t;
        if (t - s.isolatedSince > 30 && !this.mobs.some((m) => m.type === 'traqueur' && m.target === id)) {
          const at = geo.offset(p, 140, this.rnd() * 360);
          const m = this.spawnMob('traqueur', this.inZone(at) ? at : null);
          m.target = id;
          this.fx(id, { s: 'stalker', v: [800], m: '💀 Tu es seul… le Traqueur t’a senti.', k: 'bad', shake: true });
          this.feed(`💀 Le Traqueur chasse ${this.name(id)}`, 'bad');
        }
      } else {
        s.isolatedSince = null;
        const tr = this.mobs.find((m) => m.type === 'traqueur' && m.target === id);
        if (tr && others.some((o) => this.d(p, this.pos(o)) < 50)) {
          this.mobs = this.mobs.filter((m) => m !== tr);
          this.fx(id, { s: 'relief', m: 'Le Traqueur a perdu ta trace.', k: 'good' });
        }
      }
    }
    for (const m of this.mobs) this.moveMob(m, dt);
    // Contacts.
    for (const id of this.humans()) {
      const s = this.st[id];
      const p = this.pos(id);
      if (s.invUntil > this.now || this.inShelter(p)) continue;
      const m = this.mobs.find((x) => x.type !== 'guetteur' && this.d(x, p) <= CATCH);
      if (m) {
        s.lives--;
        s.hits++;
        s.invUntil = this.now + 10000;
        if (m.type === 'sprinteur') { m.state = 'rest'; m.until = this.now + 20000; }
        if (m.type === 'traqueur') this.mobs = this.mobs.filter((x) => x !== m);
        if (s.lives <= 0) {
          s.zombie = true;
          this.fx(id, { s: 'dead', v: [800], m: '🧟 Tu es devenu un zombie. Guide la horde vers les vivants…', k: 'bad', shake: true });
          this.feed(`🧟 ${this.name(id)} a été dévoré`, 'bad');
        } else {
          this.fx(id, { s: 'hit', v: [300, 80, 300], m: `🩸 Mordu ! ${s.lives} vie${s.lives > 1 ? 's' : ''} — 10 s pour fuir`, k: 'bad', shake: true });
        }
      }
    }
    // Ramassage.
    for (const id of this.humans()) {
      const p = this.pos(id);
      for (const b of [...this.bats]) {
        if (this.d(p, b) <= 12) {
          this.bats = this.bats.filter((x) => x !== b);
          this.found++;
          this.st[id].bats++;
          this.fx('all', { s: 'battery', v: [50, 50, 50], m: `🔋 Batterie ${this.found}/${BATTERIES} (${this.name(id)})`, k: 'good' });
          this.spawnBattery();
          if (this.found >= BATTERIES && !this.extract) this.openExtract();
        }
      }
      for (const it of [...this.items]) {
        if (this.d(p, it) <= 12 && this.st[id].inv.length < 3) {
          this.st[id].inv.push(it.kind);
          this.items = this.items.filter((x) => x !== it);
          this.fx(id, { s: 'pickup', v: [35], m: `${ITEMS[it.kind].icon} ${ITEMS[it.kind].label}`, k: 'good' });
        }
      }
      if (this.extract && this.d(p, this.extract) <= 20) {
        this.st[id].evac = true;
        this.fx(id, { s: 'win', v: [80, 60, 80], m: '🚁 Évacué ! Tu es en sécurité.', k: 'good' });
        this.feed(`🚁 ${this.name(id)} est évacué`, 'good');
      }
    }
    const humans = this.humans();
    if (humans.length === 0) this.end();
    else if (this.extract && this.now > this.extractUntil) this.end();
    else if (t > 30 * 60) this.end();
  }

  openExtract() {
    const pts = this.humans().map((id) => this.pos(id));
    const cx = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
    const brg = geo.bearing(cx, this.zone);
    this.extract = geo.offset(this.zone, this.zone.r * 0.75, Number.isFinite(brg) ? brg : this.rnd() * 360);
    this.extractUntil = this.now + 180000;
    for (let i = 0; i < 2; i++) this.spawnMob('rodeur', geo.offset(this.extract, 40 + this.rnd() * 30, this.rnd() * 360));
    this.fx('all', { s: 'alarm', v: [200, 100, 200, 100, 400], m: '🚁 Évacuation ouverte ! 3 minutes pour la rejoindre', k: 'good' });
    this.feed('🚁 Point d’évacuation ouvert !', 'good');
  }

  end() {
    const evac = this.ids.filter((id) => this.st[id].evac);
    const ranking = this.ranking((id) => (this.st[id].evac ? 100 : 0) + this.st[id].lives * 10 + this.st[id].bats)
      .map((r) => ({ ...r, score: this.st[r.id].bats, detail: this.st[r.id].evac ? '🚁 évacué' : this.st[r.id].zombie ? '🧟 zombie' : '❌ resté sur place' }));
    this.finish({
      title: evac.length ? `${evac.length} survivant${evac.length > 1 ? 's' : ''} évacué${evac.length > 1 ? 's' : ''} !` : 'La horde a gagné…',
      winners: evac.length ? evac : [],
      ranking,
      unit: '🔋',
      coop: true,
      success: evac.length > 0,
    });
  }

  act(id, a) {
    const s = this.st[id];
    if (a.type === 'call' && s.zombie) {
      if (this.now < s.callReady) return;
      const victim = this.humans().find((h) => h === a.target);
      if (!victim) return;
      s.callReady = this.now + 60000;
      let n = 0;
      for (const m of this.mobs) {
        if (m.type === 'rodeur' && this.d(m, this.pos(victim)) < 220) { m.target = victim; m.alertUntil = this.now + 20000; n++; }
      }
      this.fx(victim, { s: 'scream', v: [400], m: `🧟 ${this.name(id)} a attiré ${n} créatures vers toi !`, k: 'bad' });
      this.fx(id, { s: 'power', m: `${n} créatures guidées vers ${this.name(victim)}`, k: 'good' });
      return;
    }
    if (a.type !== 'use' || s.zombie || s.evac) return;
    const i = s.inv.indexOf(a.item);
    if (i < 0) return;
    s.inv.splice(i, 1);
    const p = this.pos(id);
    if (a.item === 'fusee') { this.flares.push({ ...p, until: this.now + 15000 }); this.fx(id, { s: 'flare', v: [100], m: '🎆 Fusée !', k: 'good' }); }
    if (a.item === 'leurre') { this.lures.push({ ...p, until: this.now + 30000, id: ++this.seq }); this.fx(id, { s: 'power', m: '📢 Leurre posé : éloigne-toi !', k: 'good' }); }
    if (a.item === 'abri') { this.shelters.push({ ...p, until: this.now + 60000, id: ++this.seq }); this.fx('all', { s: 'shield', m: `⛺ ${this.name(id)} a monté un abri`, k: 'good' }); }
  }

  view(me) {
    const s = this.st[me];
    const p = this.pos(me);
    const markers = [this.zoneMarker()];
    let nearest = Infinity;
    for (const m of this.mobs) {
      const d = this.d(p, m);
      if (m.type !== 'guetteur') nearest = Math.min(nearest, d);
      // Brouillard : on ne voit les créatures qu'à 120 m (zombies : tout).
      if (!s.zombie && d > 120) continue;
      markers.push({ id: 'm' + m.id, type: 'creature', lat: m.lat, lng: m.lng, cls: m.type + (m.state === 'charge' ? ' charge' : '') + (m.state === 'rest' ? ' rest' : ''), icon: TYPES[m.type].icon, sight: m.type === 'guetteur' ? TYPES.guetteur.sight : 0 });
    }
    for (const b of this.bats) markers.push({ id: 'b' + b.id, type: 'item', lat: b.lat, lng: b.lng, cls: 'battery', icon: '🔋' });
    for (const it of this.items) markers.push({ id: 'i' + it.id, type: 'item', lat: it.lat, lng: it.lng, cls: 'loot', icon: ITEMS[it.kind].icon });
    for (const sh of this.shelters) markers.push({ id: 's' + sh.id, type: 'circle', lat: sh.lat, lng: sh.lng, r: 25, cls: 'shelter' });
    for (const l of this.lures) markers.push({ id: 'l' + l.id, type: 'item', lat: l.lat, lng: l.lng, cls: 'lure', icon: '📢' });
    if (this.extract) markers.push({ id: 'ex', type: 'item', lat: this.extract.lat, lng: this.extract.lng, cls: 'extract', icon: '🚁', label: 'ÉVACUATION' }, { id: 'exc', type: 'circle', lat: this.extract.lat, lng: this.extract.lng, r: 20, cls: 'extract-zone' });
    for (const id of this.ids) {
      const o = this.st[id];
      if (o.evac && id !== me) continue;
      const mk = this.playerMarker(id, me, { cls: o.zombie ? 'zombie' : o.invUntil > this.now ? 'blink' : '' });
      if (mk) markers.push(mk);
    }
    let status = null;
    if (s.evac) status = { text: '🚁 Évacué — tu es en sécurité', cls: 'good' };
    else if (s.zombie) status = { text: '🧟 Zombie — attire la horde sur les vivants', cls: 'bad' };
    else if (s.invUntil > this.now) status = { text: `🩸 Fuis ! Invincible ${Math.ceil((s.invUntil - this.now) / 1000)} s`, cls: 'bad pulse' };
    else if (this.inShelter(p)) status = { text: '⛺ À l’abri', cls: 'good' };
    else if (nearest < 30) status = { text: `⚠️ Créature à ${Math.round(nearest)} m !`, cls: 'bad pulse' };
    const actions = [];
    if (s.zombie) {
      const ready = this.now >= s.callReady;
      actions.push({ id: 'call', label: ready ? 'Guider la horde' : `Guider (${Math.ceil((s.callReady - this.now) / 1000)} s)`, icon: '🧟', enabled: ready, choices: this.humans().map((h) => ({ v: h, l: this.name(h) })), argKey: 'target' });
    } else if (!s.evac) s.inv.forEach((k, i) => actions.push({ id: 'use', key: k + i, args: { item: k }, label: ITEMS[k].label, icon: ITEMS[k].icon, hint: ITEMS[k].desc }));
    const chips = [
      { icon: '❤️', label: 'Vies', value: s.zombie ? '🧟' : '❤️'.repeat(s.lives) },
      { icon: '🔋', label: 'Batteries', value: `${this.found}/${BATTERIES}` },
      { icon: '🧍', label: 'Vivants', value: this.humans().length },
    ];
    return {
      hud: {
        chips,
        ends: this.extract ? this.extractUntil : null,
        elapsedFrom: this.extract ? null : this.startAt,
        sub: this.extract ? 'Rejoins l’évacuation !' : `Trouve les ${BATTERIES} batteries`,
        status,
      },
      markers,
      actions,
      audio: { growl: s.zombie || s.evac ? 0 : Math.max(0, Math.min(1, (90 - nearest) / 80)) },
      danger: !s.zombie && !s.evac && nearest < 25,
    };
  }

  botTarget(id) {
    const s = this.st[id];
    if (s.evac) return null;
    const p = this.pos(id);
    if (s.zombie) return null;
    const threat = this.mobs.filter((m) => m.type !== 'guetteur').sort((a, b) => this.d(p, a) - this.d(p, b))[0];
    if (threat && this.d(p, threat) < 40) return { ...geo.offset(p, 30, geo.bearing(threat, p)), speed: 3 };
    if (this.extract) return { ...this.extract, speed: 2.5 };
    const b = [...this.bats, ...this.items].sort((x, y) => this.d(p, x) - this.d(p, y))[0];
    return b || null;
  }

  botAct(id) {
    const s = this.st[id];
    if (s.inv.length && this.rnd() < 0.02) this.act(id, { type: 'use', item: s.inv[0] });
  }
}

Horde.meta = {
  id: 'horde', name: 'La Horde', min: 1, max: 15,
  opts: [{ key: 'difficulte', label: 'Difficulté', def: 'normal', choices: [{ v: 'facile', l: 'Facile' }, { v: 'normal', l: 'Normal' }, { v: 'cauchemar', l: 'Cauchemar' }] }],
};

module.exports = Horde;
