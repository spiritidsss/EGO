'use strict';
// Geiger : sources radioactives invisibles, compteur sonore, extraction, retour à la base, vols et leurres.
const { Game, makeTeams, TEAM_INFO, geo } = require('./base');

const EXTRACT_R = 10;
const EXTRACT_T = 15;
const STEAL_R = 10;
const STEAL_T = 5;
const HOME = 15;

class Geiger extends Game {
  constructor(room, opts) {
    super(room, opts);
    const nTeams = Math.min(Game.opt(opts, 'equipes', [2, 3], 2), Math.max(1, this.ids.length));
    this.duration = Game.opt(opts, 'duree', [15, 20, 25], 20) * 60;
    this.nTeams = this.ids.length === 1 ? 1 : nTeams;
    this.teams = makeTeams(this.ids, this.nTeams, this.rnd);
    this.teamOf = {};
    this.teams.forEach((t, i) => t.forEach((id) => { this.teamOf[id] = i; }));
    const brg = this.rnd() * 360;
    this.bases = this.teams.map((_, i) => geo.offset(this.zone, this.zone.r * 0.8, brg + (360 / this.nTeams) * i));
    this.score = this.teams.map(() => 0);
    this.lures = this.teams.map(() => null);
    this.sources = [];
    this.seq = 0;
    const n = 6 + this.nTeams * 2;
    for (let i = 0; i < n; i++) {
      const c = this.farPoint(this.bases, 60, this.zone.r * 0.9);
      this.sources.push({ id: ++this.seq, lat: c.lat, lng: c.lng, value: i < 2 ? 2 : 1, unstable: i < 2, carrier: null, delivered: false });
    }
    this.st = {};
    for (const id of this.ids) this.st[id] = { extracting: null, progress: 0, stealFrom: null, stealT: 0, trappedUntil: 0, delivered: 0, steals: 0 };
  }

  carried(id) { return this.sources.find((s) => s.carrier === id); }
  free() { return this.sources.filter((s) => !s.carrier && !s.delivered); }

  // Ce que le compteur de `me` capte : sources libres, porteurs adverses, leurres adverses.
  emitters(me) {
    const t = this.teamOf[me];
    const out = [];
    for (const s of this.free()) {
      const hot = this.ids.some((id) => this.st[id].extracting === s.id);
      out.push({ ...s, k: (s.unstable ? 2 : 1) * (hot ? 3 : 1) });
    }
    for (const s of this.sources) {
      if (s.carrier && this.teamOf[s.carrier] !== t) out.push({ ...this.pos(s.carrier), k: s.unstable ? 2 : 1.2 });
    }
    this.lures.forEach((l, i) => { if (l && !l.sprung && i !== t) out.push({ ...l, k: 1, lure: i }); });
    return out;
  }

  level(me) {
    const p = this.pos(me);
    let sum = 0;
    let near = Infinity;
    for (const e of this.emitters(me)) {
      const d = this.d(p, e);
      near = Math.min(near, d);
      sum += e.k / (1 + (d / 22) ** 2);
    }
    return { sum, near };
  }

  tick(dt) {
    for (const id of this.ids) {
      const s = this.st[id];
      const p = this.pos(id);
      const t = this.teamOf[id];
      if (s.trappedUntil > this.now) continue;
      // Extraction en cours.
      if (s.extracting) {
        const src = this.sources.find((x) => x.id === s.extracting);
        if (!src || src.carrier || src.delivered || this.d(p, src) > EXTRACT_R + 3) {
          if (src && !src.carrier) this.fx(id, { s: 'nope', m: 'Extraction interrompue', k: 'bad' });
          s.extracting = null;
          s.progress = 0;
        } else {
          s.progress += dt;
          if (s.progress >= EXTRACT_T) {
            src.carrier = id;
            src.safeUntil = this.now + 30000;
            s.extracting = null;
            s.progress = 0;
            this.fx(id, { s: 'extract', v: [100, 50, 100, 50, 200], m: `☢️ Source extraite${src.unstable ? ' (INSTABLE ×2)' : ''} ! Ramène-la à ta base`, k: 'good' });
            this.feed(`☢️ ${this.name(id)} a extrait une source`, 'info');
          }
        }
      }
      // Livraison.
      const c = this.carried(id);
      if (c && this.d(p, this.bases[t]) <= HOME) {
        c.carrier = null;
        c.delivered = true;
        this.score[t] += c.value;
        s.delivered += c.value;
        this.fx(this.teams[t], { s: 'win', v: [80, 40, 80], m: `🏠 +${c.value} pour les ${TEAM_INFO[t].name} (${this.name(id)})`, k: 'good' });
        this.feed(`🏠 ${this.name(id)} dépose une source (+${c.value})`, 'good');
      }
      // Vol : rester à moins de 10 m d'un porteur adverse pendant 5 s.
      const victim = this.ids.find((o) => this.teamOf[o] !== t && this.carried(o) && !(this.carried(o).safeUntil > this.now) && this.d(p, this.pos(o)) <= STEAL_R);
      if (victim && !c) {
        if (s.stealFrom !== victim) { s.stealFrom = victim; s.stealT = 0; this.fx(victim, { s: 'alarm', v: [200, 100, 200], m: `⚠️ ${this.name(id)} essaie de te voler ta source !`, k: 'bad' }); }
        s.stealT += dt;
        if (s.stealT >= STEAL_T) {
          const src = this.carried(victim);
          src.carrier = id;
          src.safeUntil = this.now + 30000;
          s.steals++;
          s.stealFrom = null;
          this.fx(victim, { s: 'steal', v: [400], m: `🪝 ${this.name(id)} t’a volé ta source !`, k: 'bad' });
          this.fx(id, { s: 'extract', v: [100, 50, 100], m: `🪝 Source volée à ${this.name(victim)} !`, k: 'good' });
          this.feed(`🪝 ${this.name(id)} vole une source à ${this.name(victim)}`, 'bad');
        }
      } else { s.stealFrom = null; s.stealT = 0; }
    }
    if (this.elapsed >= this.duration || this.sources.every((s) => s.delivered)) this.end();
  }

  end() {
    const best = Math.max(...this.score);
    const winT = this.score.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    this.finish({
      title: this.nTeams === 1 ? `${this.score[0]} points de radiation récoltés` : winT.length > 1 ? 'Égalité !' : `Victoire des ${TEAM_INFO[winT[0]].name} !`,
      winners: winT.length > 1 && this.nTeams > 1 ? [] : winT.flatMap((i) => this.teams[i]),
      teams: this.nTeams > 1 ? this.teams.map((_, i) => ({ name: TEAM_INFO[i].name, color: TEAM_INFO[i].color, score: this.score[i] })) : null,
      ranking: this.ranking((id) => this.st[id].delivered * 10 + this.st[id].steals).map((r) => ({ ...r, score: this.st[r.id].delivered, detail: `${this.st[r.id].steals} vol${this.st[r.id].steals > 1 ? 's' : ''}`, color: TEAM_INFO[this.teamOf[r.id]].color })),
      unit: '☢️',
    });
  }

  act(id, a) {
    const s = this.st[id];
    const t = this.teamOf[id];
    const p = this.pos(id);
    if (s.trappedUntil > this.now) return;
    if (a.type === 'extract') {
      if (this.carried(id) || s.extracting) return;
      // Leurre adverse à portée ?
      const li = this.lures.findIndex((l, i) => l && !l.sprung && i !== t && this.d(p, l) <= EXTRACT_R);
      if (li >= 0) {
        this.lures[li].sprung = true;
        s.trappedUntil = this.now + 30000;
        this.fx(id, { s: 'trap', v: [500, 100, 500], m: '🪤 C’était un LEURRE ! Bloqué 30 s', k: 'bad', shake: true });
        this.fx(this.teams[li], { s: 'pickup', m: `🪤 ${this.name(id)} est tombé dans votre leurre !`, k: 'good' });
        return;
      }
      const src = this.free().filter((x) => this.d(p, x) <= EXTRACT_R).sort((x, y) => this.d(p, x) - this.d(p, y))[0];
      if (!src) return this.fx(id, { s: 'nope', m: 'Aucune source à moins de 10 m', k: 'bad' });
      if (this.ids.some((o) => this.st[o].extracting === src.id)) return this.fx(id, { s: 'nope', m: 'Quelqu’un extrait déjà cette source', k: 'bad' });
      s.extracting = src.id;
      s.progress = 0;
      this.fx(id, { s: 'power', v: [50], m: 'Extraction… reste sur place 15 s', k: 'info' });
    } else if (a.type === 'lure') {
      if (this.lures[t]) return;
      this.lures[t] = { lat: p.lat, lng: p.lng, sprung: false, by: id };
      this.fx(this.teams[t], { s: 'power', m: `🪤 ${this.name(id)} a posé le leurre de l’équipe`, k: 'good' });
    }
  }

  view(me) {
    const t = this.teamOf[me];
    const s = this.st[me];
    const { sum, near } = this.level(me);
    const markers = [this.zoneMarker()];
    this.bases.forEach((b, i) => {
      markers.push({ id: 'base' + i, type: 'base', lat: b.lat, lng: b.lng, color: TEAM_INFO[i].color, label: i === t ? 'TA BASE' : TEAM_INFO[i].name, icon: '🏭' });
      markers.push({ id: 'basec' + i, type: 'circle', lat: b.lat, lng: b.lng, r: HOME, cls: 'base-ring', color: TEAM_INFO[i].color });
    });
    if (this.lures[t] && !this.lures[t].sprung) markers.push({ id: 'lure', type: 'item', lat: this.lures[t].lat, lng: this.lures[t].lng, cls: 'lure', icon: '🪤', label: 'votre leurre' });
    for (const id of this.teams[t]) {
      const mk = this.playerMarker(id, me, { color: TEAM_INFO[t].color, cls: this.carried(id) ? 'carrier hot' : '' });
      if (mk) markers.push(mk);
    }
    const c = this.carried(me);
    // Comptes par seconde : bruit de fond + signal.
    const cps = Math.min(60, 0.4 + sum * 18);
    let status = null;
    if (s.trappedUntil > this.now) status = { text: `🪤 Piégé — ${Math.ceil((s.trappedUntil - this.now) / 1000)} s`, cls: 'bad pulse' };
    else if (s.extracting) status = { text: `☢️ Extraction ${Math.floor((s.progress / EXTRACT_T) * 100)} % — ne bouge pas`, cls: 'good pulse' };
    else if (c) status = { text: c.safeUntil > this.now ? `☢️ Source protégée ${Math.ceil((c.safeUntil - this.now) / 1000)} s — file à ta base !` : `☢️ Tu portes une source${c.unstable ? ' INSTABLE' : ''} — tu es détectable !`, cls: 'warn pulse' };
    else if (s.stealFrom) status = { text: `🪝 Vol en cours… ${Math.floor(s.stealT)}/${STEAL_T} s`, cls: 'good' };
    const chips = this.teams.map((_, i) => ({ icon: i === t ? '🛡️' : '⚔️', label: TEAM_INFO[i].name, value: this.score[i], color: TEAM_INFO[i].color }));
    chips.push({ icon: '☢️', label: 'Restantes', value: this.free().length });
    const canExtract = !c && !s.extracting && near <= EXTRACT_R;
    return {
      team: { idx: t, name: TEAM_INFO[t].name, color: TEAM_INFO[t].color },
      hud: { chips, ends: this.startAt + this.duration * 1000, status },
      markers,
      panel: { kind: 'geiger', cps, usv: (sum * 9.7).toFixed(2), extracting: s.extracting ? s.progress / EXTRACT_T : null },
      audio: { geiger: cps },
      actions: [
        { id: 'extract', label: s.extracting ? 'Extraction…' : 'Extraire', icon: '☢️', enabled: canExtract, big: true },
        ...(this.lures[t] ? [] : [{ id: 'lure', label: 'Poser le leurre ici', icon: '🪤', hint: 'Fait crépiter les compteurs adverses et piège qui tente de l’extraire' }]),
      ],
    };
  }

  botTarget(id) {
    const t = this.teamOf[id];
    if (this.carried(id)) return { ...this.bases[t], speed: 2.4 };
    const p = this.pos(id);
    const prey = this.ids.find((o) => this.teamOf[o] !== t && this.carried(o) && !(this.carried(o).safeUntil > this.now) && this.d(p, this.pos(o)) < 80);
    if (prey) return { ...this.pos(prey), speed: 3 };
    const src = this.free().sort((a, b) => this.d(p, a) - this.d(p, b))[0];
    if (!src) return null;
    if (this.st[id].extracting) return { ...p, speed: 0 };
    return { lat: src.lat, lng: src.lng, speed: 1.6 };
  }

  botAct(id) {
    const s = this.st[id];
    if (!this.carried(id) && !s.extracting) {
      const p = this.pos(id);
      if (this.free().some((x) => this.d(p, x) <= EXTRACT_R)) this.act(id, { type: 'extract' });
    }
    if (!this.lures[this.teamOf[id]] && this.rnd() < 0.01) this.act(id, { type: 'lure' });
  }
}

Geiger.meta = {
  id: 'geiger', name: 'Geiger', min: 1, max: 24, teams: true,
  opts: [
    { key: 'equipes', label: 'Équipes', def: 2, choices: [{ v: 2, l: '2 équipes' }, { v: 3, l: '3 équipes' }] },
    { key: 'duree', label: 'Durée', def: 20, choices: [{ v: 15, l: '15 min' }, { v: 20, l: '20 min' }, { v: 25, l: '25 min' }] },
  ],
};

module.exports = Geiger;
