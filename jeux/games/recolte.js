'use strict';
// Récolte : objets magiques à ramasser par vagues, avec des pouvoirs.
const { Game, makeTeams, TEAM_INFO } = require('./base');

const RARITIES = [
  { k: 'commun', pts: 1, w: 58, life: 240 },
  { k: 'rare', pts: 3, w: 26, life: 200 },
  { k: 'epique', pts: 6, w: 12, life: 160 },
  { k: 'legendaire', pts: 15, w: 4, life: 120 },
];
const POWERS = {
  radar: { label: 'Radar', icon: '📡', desc: 'Tous les objets visibles 30 s' },
  invis: { label: 'Invisibilité', icon: '👻', desc: 'Invisible 60 s' },
  gel: { label: 'Gel', icon: '❄️', desc: 'Gèle l’adversaire le plus proche (40 m) 20 s' },
  vol: { label: 'Vol', icon: '🪝', desc: 'Vole 5 points à l’adversaire le plus proche (25 m)' },
};
const PICK = 15;
const SIGHT = 160;
const WAVE = 120;

class Recolte extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.duration = Game.opt(opts, 'duree', [10, 15, 20], 15) * 60;
    this.teamMode = Game.opt(opts, 'mode', ['solo', 'equipes'], 'solo') === 'equipes' && this.ids.length >= 4;
    this.items = [];
    this.seq = 0;
    this.st = {};
    for (const id of this.ids) this.st[id] = { pts: 0, count: 0, inv: [], radarUntil: 0, invisUntil: 0, frozenUntil: 0, best: null };
    if (this.teamMode) {
      this.teams = makeTeams(this.ids, 2, this.rnd);
      this.teamOf = {};
      this.teams.forEach((t, i) => t.forEach((id) => { this.teamOf[id] = i; }));
    }
    this.nextWave = 0;
  }

  spawnWave() {
    const n = 6 + 2 * this.ids.length;
    for (let i = 0; i < n; i++) {
      let roll = this.rnd() * 100;
      const rar = RARITIES.find((r) => (roll -= r.w) < 0) || RARITIES[0];
      this.items.push({ id: ++this.seq, ...this.rndPoint(), kind: 'pts', rar: rar.k, pts: rar.pts, until: this.now + rar.life * 1000 });
    }
    const np = 1 + Math.floor(this.ids.length / 3);
    const keys = Object.keys(POWERS);
    for (let i = 0; i < np; i++) {
      this.items.push({ id: ++this.seq, ...this.rndPoint(), kind: 'pow', pow: keys[Math.floor(this.rnd() * keys.length)], until: this.now + 200000 });
    }
    this.feed('✨ Nouvelle vague d’objets magiques !', 'good');
    this.fx('all', { s: 'wave', v: [60, 40, 60] });
  }

  scoreOf(id) {
    return this.st[id].pts;
  }

  teamScore(i) {
    return this.teams[i].reduce((s, id) => s + this.st[id].pts, 0);
  }

  enemies(id) {
    return this.ids.filter((o) => o !== id && (!this.teamMode || this.teamOf[o] !== this.teamOf[id]));
  }

  tick() {
    const t = this.elapsed;
    if (t >= this.nextWave) {
      this.spawnWave();
      this.nextWave += WAVE;
    }
    this.items = this.items.filter((it) => it.until > this.now);
    for (const id of this.ids) {
      const s = this.st[id];
      if (s.frozenUntil > this.now) continue;
      const p = this.pos(id);
      if (!p) continue;
      for (const it of [...this.items]) {
        if (this.d(p, it) > PICK) continue;
        if (it.kind === 'pow') {
          if (s.inv.length >= 3) continue;
          s.inv.push(it.pow);
          this.fx(id, { s: 'power', v: [40, 30, 40], m: `${POWERS[it.pow].icon} Pouvoir obtenu : ${POWERS[it.pow].label}`, k: 'good' });
        } else {
          s.pts += it.pts;
          s.count++;
          const big = it.rar === 'legendaire' || it.rar === 'epique';
          this.fx(id, { s: big ? 'rare' : 'pickup', v: big ? [50, 30, 50, 30, 120] : [35], m: `+${it.pts}`, k: 'score' });
          if (it.rar === 'legendaire') this.feed(`🌟 ${this.name(id)} a trouvé un objet légendaire !`, 'good');
        }
        this.items = this.items.filter((x) => x !== it);
      }
    }
    if (t >= this.duration) this.end();
  }

  end() {
    if (this.teamMode) {
      const sc = this.teams.map((_, i) => this.teamScore(i));
      const w = sc[0] === sc[1] ? -1 : sc[0] > sc[1] ? 0 : 1;
      this.finish({
        title: w < 0 ? 'Égalité parfaite !' : `Victoire des ${TEAM_INFO[w].name} !`,
        winners: w < 0 ? [...this.ids] : this.teams[w],
        teams: this.teams.map((t, i) => ({ name: TEAM_INFO[i].name, color: TEAM_INFO[i].color, score: sc[i] })),
        ranking: this.ranking((id) => this.st[id].pts),
        unit: 'pts',
      });
    } else {
      const ranking = this.ranking((id) => this.st[id].pts);
      const top = ranking[0].score;
      this.finish({ title: `${ranking.filter((r) => r.score === top).map((r) => r.name).join(' & ')} remporte la récolte !`, winners: ranking.filter((r) => r.score === top).map((r) => r.id), ranking, unit: 'pts' });
    }
  }

  nearestEnemy(id, max) {
    const p = this.pos(id);
    let best = null;
    let bd = max;
    for (const o of this.enemies(id)) {
      if (this.st[o].invisUntil > this.now) continue;
      const d = this.d(p, this.pos(o));
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }

  act(id, a) {
    const s = this.st[id];
    if (a.type !== 'use') return;
    const i = s.inv.indexOf(a.pow);
    if (i < 0) return;
    if (a.pow === 'radar') s.radarUntil = this.now + 30000;
    else if (a.pow === 'invis') s.invisUntil = this.now + 60000;
    else if (a.pow === 'gel') {
      const o = this.nearestEnemy(id, 40);
      if (!o) return this.fx(id, { s: 'nope', m: 'Personne à moins de 40 m', k: 'bad' });
      this.st[o].frozenUntil = this.now + 20000;
      this.fx(o, { s: 'freeze', v: [300], m: `❄️ ${this.name(id)} t’a gelé 20 s !`, k: 'bad' });
      this.feed(`❄️ ${this.name(id)} gèle ${this.name(o)}`);
    } else if (a.pow === 'vol') {
      const o = this.nearestEnemy(id, 25);
      if (!o) return this.fx(id, { s: 'nope', m: 'Personne à moins de 25 m', k: 'bad' });
      const n = Math.min(5, this.st[o].pts);
      this.st[o].pts -= n;
      s.pts += n;
      this.fx(o, { s: 'steal', v: [100, 50, 100], m: `🪝 ${this.name(id)} t’a volé ${n} points !`, k: 'bad' });
      this.fx(id, { s: 'pickup', m: `+${n} volés`, k: 'score' });
      this.feed(`🪝 ${this.name(id)} vole ${n} pts à ${this.name(o)}`);
    }
    s.inv.splice(i, 1);
    this.fx(id, { s: 'power', v: [30] });
  }

  view(me) {
    const s = this.st[me];
    const p = this.pos(me);
    const radar = s.radarUntil > this.now;
    const markers = [this.zoneMarker()];
    for (const it of this.items) {
      const d = this.d(p, it);
      if (!radar && d > SIGHT && it.rar !== 'legendaire') continue;
      markers.push({
        id: 'i' + it.id, type: 'item', lat: it.lat, lng: it.lng,
        cls: it.kind === 'pow' ? 'pow' : it.rar, icon: it.kind === 'pow' ? POWERS[it.pow].icon : '',
        label: it.kind === 'pow' ? POWERS[it.pow].label : `+${it.pts}`, far: d > SIGHT,
      });
    }
    for (const id of this.ids) {
      if (id !== me && this.st[id].invisUntil > this.now) continue;
      const mk = this.playerMarker(id, me, {
        color: this.teamMode ? TEAM_INFO[this.teamOf[id]].color : this.color(id),
        cls: [this.st[id].frozenUntil > this.now ? 'frozen' : '', id === me && s.invisUntil > this.now ? 'ghost' : ''].join(' '),
      });
      if (mk) markers.push(mk);
    }
    const chips = [{ icon: '💎', label: 'Score', value: s.pts }];
    if (this.teamMode) {
      const t = this.teamOf[me];
      chips.push({ icon: '🛡️', label: TEAM_INFO[t].name, value: this.teamScore(t), color: TEAM_INFO[t].color });
      chips.push({ icon: '⚔️', label: TEAM_INFO[1 - t].name, value: this.teamScore(1 - t), color: TEAM_INFO[1 - t].color });
    } else {
      const r = this.ranking((id) => this.st[id].pts);
      chips.push({ icon: '🏆', label: 'Rang', value: `${r.findIndex((x) => x.id === me) + 1}/${r.length}` });
    }
    let status = null;
    if (s.frozenUntil > this.now) status = { text: `❄️ Gelé — ${Math.ceil((s.frozenUntil - this.now) / 1000)} s`, cls: 'bad' };
    else if (radar) status = { text: `📡 Radar actif — ${Math.ceil((s.radarUntil - this.now) / 1000)} s`, cls: 'good' };
    else if (s.invisUntil > this.now) status = { text: `👻 Invisible — ${Math.ceil((s.invisUntil - this.now) / 1000)} s`, cls: 'good' };
    const nextWave = this.startAt + this.nextWave * 1000;
    return {
      hud: { chips, ends: this.startAt + this.duration * 1000, sub: `Prochaine vague dans ${Math.max(0, Math.ceil((nextWave - this.now) / 1000))} s`, status },
      markers,
      actions: s.inv.map((pw, i) => ({ id: 'use', key: pw + i, args: { pow: pw }, label: POWERS[pw].label, icon: POWERS[pw].icon, hint: POWERS[pw].desc })),
      me: { id: me },
    };
  }

  botTarget(id) {
    const p = this.pos(id);
    let best = null;
    let bd = Infinity;
    for (const it of this.items) {
      const d = this.d(p, it) / (it.kind === 'pts' ? it.pts : 2);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  botAct(id) {
    const s = this.st[id];
    if (s.inv.length && this.rnd() < 0.05) this.act(id, { type: 'use', pow: s.inv[0] });
  }
}

Recolte.meta = {
  id: 'recolte', name: 'Récolte', min: 1, max: 24,
  opts: [
    { key: 'duree', label: 'Durée', def: 15, choices: [{ v: 10, l: '10 min' }, { v: 15, l: '15 min' }, { v: 20, l: '20 min' }] },
    { key: 'mode', label: 'Mode', def: 'solo', choices: [{ v: 'solo', l: 'Chacun pour soi' }, { v: 'equipes', l: '2 équipes' }] },
  ],
};

module.exports = Recolte;
