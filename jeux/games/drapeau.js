'use strict';
// Drapeau : deux équipes, deux bases, voler le drapeau adverse et le ramener.
const { Game, makeTeams, TEAM_INFO, geo } = require('./base');

const GRAB = 12;
const TAG = 12;
const HOME = 15;
const NO_GUARD = 25;
const SETUP = 60;

class Drapeau extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.target = Game.opt(opts, 'captures', [2, 3, 5], 3);
    this.duration = Game.opt(opts, 'duree', [15, 20, 30], 20) * 60;
    this.teams = makeTeams(this.ids, 2, this.rnd);
    this.teamOf = {};
    this.teams.forEach((t, i) => t.forEach((id) => { this.teamOf[id] = i; }));
    const brg = this.rnd() * 360;
    this.bases = [geo.offset(this.zone, this.zone.r * 0.75, brg), geo.offset(this.zone, this.zone.r * 0.75, brg + 180)];
    this.flags = [0, 1].map((i) => ({ ...this.bases[i], carrier: null, home: true, droppedAt: 0 }));
    this.score = [0, 0];
    this.st = {};
    for (const id of this.ids) this.st[id] = { jailed: false, caps: 0, tags: 0, grabs: 0 };
  }

  // Un joueur est « chez lui » s'il est plus près de sa base que de la base adverse.
  onHomeSide(id) {
    const t = this.teamOf[id];
    const p = this.pos(id);
    return this.d(p, this.bases[t]) < this.d(p, this.bases[1 - t]);
  }

  tagCandidates(id) {
    const t = this.teamOf[id];
    const p = this.pos(id);
    if (this.st[id].jailed || this.now < this.startAt + SETUP * 1000) return [];
    // Anti-camping : on ne peut pas toucher depuis le cercle de 25 m autour de son propre drapeau.
    if (this.flags[t].home && this.d(p, this.flags[t]) < NO_GUARD) return [];
    return this.teams[1 - t].filter((o) => {
      if (this.st[o].jailed) return false;
      const carrier = this.flags[t].carrier === o;
      if (carrier && this.now < this.flags[t].grabbedAt + 10000) return false;
      return this.d(p, this.pos(o)) <= TAG && (carrier || !this.onHomeSide(o));
    });
  }

  tick() {
    for (const id of this.ids) {
      const t = this.teamOf[id];
      const s = this.st[id];
      const p = this.pos(id);
      if (s.jailed) {
        if (this.d(p, this.bases[t]) <= HOME) {
          s.jailed = false;
          this.fx(id, { s: 'relief', v: [60], m: '✅ De retour en jeu !', k: 'good' });
        } else continue;
      }
      const enemyFlag = this.flags[1 - t];
      const myFlag = this.flags[t];
      // Prendre le drapeau adverse (pas pendant la mise en place).
      if (this.elapsed >= SETUP && !enemyFlag.carrier && this.d(p, enemyFlag) <= GRAB && this.now - enemyFlag.droppedAt > 3000) {
        enemyFlag.carrier = id;
        enemyFlag.home = false;
        enemyFlag.grabbedAt = this.now;
        s.grabs++;
        this.fx(this.teams[t], { s: 'grab', v: [100, 50, 100], m: `🚩 ${this.name(id)} a le drapeau ${TEAM_INFO[1 - t].name.toLowerCase()} !`, k: 'good' });
        this.fx(this.teams[1 - t], { s: 'alarm', v: [300, 100, 300], m: `🚨 ${this.name(id)} vole votre drapeau !`, k: 'bad' });
        this.feed(`🚩 ${this.name(id)} vole le drapeau des ${TEAM_INFO[1 - t].name}`, 'info');
      }
      // Ramener son propre drapeau tombé.
      if (!myFlag.carrier && !myFlag.home && this.d(p, myFlag) <= GRAB) {
        Object.assign(myFlag, this.bases[t], { home: true });
        this.fx('all', { s: 'relief', m: `🏠 ${this.name(id)} ramène le drapeau des ${TEAM_INFO[t].name}`, k: 'info' });
      }
      // Capture.
      if (enemyFlag.carrier === id && this.d(p, this.bases[t]) <= HOME) {
        this.score[t]++;
        s.caps++;
        Object.assign(enemyFlag, this.bases[1 - t], { carrier: null, home: true });
        this.fx(this.teams[t], { s: 'win', v: [100, 50, 100, 50, 300], m: `🏆 CAPTURE ! ${this.score[0]} – ${this.score[1]}`, k: 'good' });
        this.fx(this.teams[1 - t], { s: 'lose', v: [500], m: `💔 Capture des ${TEAM_INFO[t].name}… ${this.score[0]} – ${this.score[1]}`, k: 'bad' });
        this.feed(`🏆 ${this.name(id)} marque pour les ${TEAM_INFO[t].name}`, 'good');
        if (this.score[t] >= this.target) return this.end();
      }
    }
    // Le drapeau suit son porteur.
    for (const f of this.flags) if (f.carrier) Object.assign(f, { lat: this.pos(f.carrier).lat, lng: this.pos(f.carrier).lng });
    if (this.elapsed >= this.duration) this.end();
  }

  end() {
    const w = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    this.finish({
      title: w < 0 ? 'Match nul !' : `Victoire des ${TEAM_INFO[w].name} !`,
      winners: w < 0 ? [] : this.teams[w],
      teams: [0, 1].map((i) => ({ name: TEAM_INFO[i].name, color: TEAM_INFO[i].color, score: this.score[i] })),
      ranking: this.ranking((id) => this.st[id].caps * 10 + this.st[id].tags * 3 + this.st[id].grabs)
        .map((r) => ({ ...r, score: this.st[r.id].caps, detail: `${this.st[r.id].tags} touche${this.st[r.id].tags > 1 ? 's' : ''}`, color: TEAM_INFO[this.teamOf[r.id]].color })),
      unit: '🚩',
    });
  }

  act(id, a) {
    if (a.type !== 'tag') return;
    const c = this.tagCandidates(id);
    const o = c.includes(a.target) ? a.target : c[0];
    if (!o) return this.fx(id, { s: 'nope', m: 'Personne à toucher à moins de 12 m', k: 'bad' });
    const t = this.teamOf[id];
    this.st[o].jailed = true;
    this.st[id].tags++;
    const f = this.flags[t];
    if (f.carrier === o) {
      f.carrier = null;
      f.droppedAt = this.now;
      this.fx('all', { s: 'drop', m: `🏳️ ${this.name(o)} lâche le drapeau !`, k: 'info' });
    }
    this.fx(o, { s: 'hit', v: [400], m: `✋ Touché par ${this.name(id)} ! Retourne à ta base.`, k: 'bad', shake: true });
    this.fx(id, { s: 'tag', v: [80], m: `✋ Tu as touché ${this.name(o)}`, k: 'good' });
    this.feed(`✋ ${this.name(id)} touche ${this.name(o)}`);
  }

  view(me) {
    const t = this.teamOf[me];
    const s = this.st[me];
    const markers = [this.zoneMarker()];
    // Ligne médiane : deux demi-terrains.
    this.bases.forEach((b, i) => {
      markers.push({ id: 'base' + i, type: 'base', lat: b.lat, lng: b.lng, color: TEAM_INFO[i].color, label: i === t ? 'TA BASE' : 'BASE ADVERSE', icon: '🏰' });
      markers.push({ id: 'basec' + i, type: 'circle', lat: b.lat, lng: b.lng, r: NO_GUARD, cls: 'base-ring', color: TEAM_INFO[i].color });
    });
    this.flags.forEach((f, i) => {
      markers.push({ id: 'flag' + i, type: 'flag', lat: f.lat, lng: f.lng, color: TEAM_INFO[i].color, cls: f.carrier ? 'carried' : f.home ? 'home' : 'dropped', icon: '🚩' });
    });
    for (const id of this.ids) {
      const mine = this.teamOf[id] === t;
      const carrier = this.flags.some((f) => f.carrier === id);
      if (!mine && !carrier) continue;
      const mk = this.playerMarker(id, me, { color: TEAM_INFO[this.teamOf[id]].color, cls: (this.st[id].jailed ? 'jailed' : '') + (carrier ? ' carrier' : '') });
      if (mk) markers.push(mk);
    }
    const cands = this.tagCandidates(me);
    const carrying = this.flags[1 - t].carrier === me;
    let status = null;
    if (this.elapsed < SETUP) status = { text: `🏰 Rejoins ton camp — la partie commence dans ${Math.ceil(SETUP - this.elapsed)} s`, cls: 'info pulse' };
    else if (s.jailed) status = { text: '✋ Touché — retourne à ta base pour revenir en jeu', cls: 'bad pulse' };
    else if (carrying) status = { text: this.now < this.flags[1 - t].grabbedAt + 10000 ? `🚩 Élan : intouchable ${Math.ceil((this.flags[1 - t].grabbedAt + 10000 - this.now) / 1000)} s — FONCE !` : '🚩 Tu portes le drapeau ! Ramène-le à ta base', cls: 'good pulse' };
    else if (this.flags[t].carrier) status = { text: `🚨 ${this.name(this.flags[t].carrier)} a votre drapeau !`, cls: 'bad' };
    else if (this.flags[t].home && this.d(this.pos(me), this.flags[t]) < NO_GUARD) status = { text: '🚫 Trop près de ton drapeau : tu ne peux pas toucher d’ici', cls: 'warn' };
    else status = { text: this.onHomeSide(me) ? '🛡️ Ton camp : touche les intrus' : '⚔️ Camp adverse : attention', cls: 'info' };
    return {
      team: { idx: t, name: TEAM_INFO[t].name, color: TEAM_INFO[t].color },
      hud: {
        chips: [
          { icon: '🔵', label: TEAM_INFO[0].name, value: this.score[0], color: TEAM_INFO[0].color },
          { icon: '🔴', label: TEAM_INFO[1].name, value: this.score[1], color: TEAM_INFO[1].color },
          { icon: '🎯', label: 'Objectif', value: this.target },
        ],
        ends: this.startAt + this.duration * 1000,
        status,
      },
      markers,
      actions: [{ id: 'tag', label: cands.length ? `Toucher ${this.name(cands[0])}` : 'Toucher', icon: '✋', enabled: cands.length > 0, args: { target: cands[0] }, big: true }],
    };
  }

  botTarget(id) {
    const t = this.teamOf[id];
    const s = this.st[id];
    if (s.jailed) return { ...this.bases[t], speed: 2.5 };
    const ef = this.flags[1 - t];
    if (ef.carrier === id) return { ...this.bases[t], speed: 3 };
    const mf = this.flags[t];
    if (mf.carrier) return { ...this.pos(mf.carrier), speed: 3.2 };
    if (!mf.home) return { lat: mf.lat, lng: mf.lng, speed: 3 };
    // Moitié attaque, moitié défense.
    const idx = this.teams[t].indexOf(id);
    if (idx % 2 === 0) return ef.carrier ? null : { lat: ef.lat, lng: ef.lng, speed: 2.4 };
    const intruder = this.teams[1 - t].find((o) => !this.onHomeSide(o) && !this.st[o].jailed);
    if (intruder) return { ...this.pos(intruder), speed: 2.8 };
    return geo.offset(this.bases[t], 45, geo.bearing(this.bases[t], this.zone) + ((idx * 37) % 120) - 60);
  }

  botAct(id) {
    if (this.tagCandidates(id).length && this.rnd() < 0.6) this.act(id, { type: 'tag' });
  }
}

Drapeau.meta = {
  id: 'drapeau', name: 'Drapeau', min: 2, max: 24, teams: true,
  opts: [
    { key: 'captures', label: 'Captures pour gagner', def: 3, choices: [{ v: 2, l: '2' }, { v: 3, l: '3' }, { v: 5, l: '5' }] },
    { key: 'duree', label: 'Durée max', def: 20, choices: [{ v: 15, l: '15 min' }, { v: 20, l: '20 min' }, { v: 30, l: '30 min' }] },
  ],
};

module.exports = Drapeau;
