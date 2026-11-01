'use strict';
// Espions : rendez-vous secrets entre deux agents, trois cercles flous pour l'adversaire,
// démasquer, lieux compromis qui déménagent, campeurs révélés, faux rendez-vous.
const { Game, makeTeams, TEAM_INFO, geo } = require('./base');

const RDV_R = 15;
const RDV_T = 20;
const COMPROMISE = 40;
const UNMASK = 15;
const BLOCK = 60000;
const CAMP_T = 60;
const CAMP_R = 12;
const MISSION_T = 180;
const EVERY = 210;
const DISPERSE = 90; // dispersion au départ : ni mission ni démasquage

class Espions extends Game {
  constructor(room, opts) {
    super(room, opts);
    this.duration = Game.opt(opts, 'duree', [15, 20, 25], 20) * 60;
    this.teams = makeTeams(this.ids, 2, this.rnd);
    this.teamOf = {};
    this.teams.forEach((t, i) => t.forEach((id) => { this.teamOf[id] = i; }));
    this.score = [0, 0];
    this.missions = []; // { id, team, agents:[a,b], point, circles:[{lat,lng,r0}], real:idx, until, t, moves, fake, startedAt }
    this.seq = 0;
    this.nextMission = [DISPERSE, DISPERSE + EVERY / 2];
    this.fakeReady = [0, 0];
    this.st = {};
    for (const id of this.ids) this.st[id] = { blockedUntil: 0, anchor: null, anchorAt: 0, camping: false, rdv: 0, unmasks: 0 };
  }

  busy(id) { return this.missions.some((m) => !m.fake && m.agents.includes(id)); }

  available(team) {
    return this.teams[team].filter((id) => this.st[id].blockedUntil <= this.now && !this.busy(id));
  }

  // Trois cercles : le vrai contient le point (décalé du centre), deux leurres ailleurs.
  makeCircles(point) {
    const R = Math.min(150, this.zone.r * 0.55);
    const realCentre = geo.offset(point, this.rnd() * R * 0.7, this.rnd() * 360);
    const circles = [{ lat: realCentre.lat, lng: realCentre.lng, r0: R }];
    for (let i = 0; i < 2; i++) {
      const c = this.farPoint([realCentre, ...circles], R * 1.2, this.zone.r * 0.85);
      circles.push({ lat: c.lat, lng: c.lng, r0: R });
    }
    const order = [0, 1, 2].sort(() => this.rnd() - 0.5);
    return { circles: order.map((i) => circles[i]), real: order.indexOf(0) };
  }

  launch(team, fake = false, by = null) {
    let agents;
    if (fake) agents = [by];
    else {
      const av = this.available(team).sort(() => this.rnd() - 0.5);
      if (av.length < 2) return false;
      agents = av.slice(0, 2);
    }
    const enemyPts = this.teams[1 - team].map((id) => this.pos(id));
    const point = fake ? this.rndPoint(this.zone.r * 0.85) : this.farPoint(enemyPts, COMPROMISE + 25, this.zone.r * 0.85);
    const { circles, real } = this.makeCircles(point);
    const m = { id: ++this.seq, team, agents, point, circles, real, until: this.now + MISSION_T * 1000, startedAt: this.now, t: 0, moves: 0, fake };
    this.missions.push(m);
    this.fx(this.teams[1 - team], { s: 'radio', v: [60, 60, 60], m: '📻 Interception : un rendez-vous ennemi commence !', k: 'bad' });
    if (!fake) {
      for (const a of agents) {
        const other = agents.find((x) => x !== a);
        this.fx(a, { s: 'mission', v: [100, 60, 100, 60, 100], m: `🕵️ MISSION : retrouve ${this.name(other)} au point secret`, k: 'good' });
      }
    }
    return true;
  }

  relocate(m) {
    const enemyPts = this.teams[1 - m.team].map((id) => this.pos(id));
    m.point = this.farPoint([...enemyPts, m.point], 100, this.zone.r * 0.85);
    const c = this.makeCircles(m.point);
    m.circles = c.circles;
    m.real = c.real;
    m.until += 45000;
    m.moves++;
    m.t = 0;
    for (const a of m.agents) this.fx(a, { s: 'alarm', v: [200, 80, 200], m: '⚠️ Lieu compromis ! Nouveau point de rendez-vous', k: 'bad' });
    this.fx(this.teams[1 - m.team], { s: 'radio', m: '📻 Le rendez-vous ennemi a changé de lieu', k: 'info' });
  }

  tick(dt) {
    const t = this.elapsed;
    for (const team of [0, 1]) {
      if (t >= this.nextMission[team]) {
        if (this.launch(team)) this.nextMission[team] = t + EVERY;
        else this.nextMission[team] = t + 15;
      }
    }
    for (const m of [...this.missions]) {
      if (this.now > m.until) {
        this.missions = this.missions.filter((x) => x !== m);
        if (!m.fake) {
          this.fx(m.agents, { s: 'lose', v: [300], m: '⌛ Rendez-vous manqué', k: 'bad' });
          this.feed(`⌛ Les ${TEAM_INFO[m.team].name} ratent un rendez-vous`, 'info');
        }
        continue;
      }
      if (m.fake) continue;
      // Compromis : un ennemi à moins de 40 m du vrai point (2 déménagements max).
      if (m.moves < 2 && this.teams[1 - m.team].some((id) => this.d(this.pos(id), m.point) <= COMPROMISE)) {
        this.relocate(m);
        continue;
      }
      const together = m.agents.every((a) => this.d(this.pos(a), m.point) <= RDV_R);
      if (together) {
        m.t += dt;
        if (m.t >= RDV_T) {
          this.score[m.team] += 3;
          m.agents.forEach((a) => { this.st[a].rdv++; });
          this.missions = this.missions.filter((x) => x !== m);
          this.fx(this.teams[m.team], { s: 'win', v: [80, 50, 80, 50, 200], m: `✅ Rendez-vous réussi ! +3 (${m.agents.map((a) => this.name(a)).join(' & ')})`, k: 'good' });
          this.fx(this.teams[1 - m.team], { s: 'lose', v: [300], m: '❌ Les ennemis ont réussi un rendez-vous', k: 'bad' });
          this.feed(`✅ Rendez-vous réussi pour les ${TEAM_INFO[m.team].name}`, 'good');
        }
      }
    }
    // Campeurs : immobiles (moins de 12 m) pendant 60 s.
    for (const id of this.ids) {
      const s = this.st[id];
      const p = this.pos(id);
      if (!s.anchor || this.d(p, s.anchor) > CAMP_R) {
        if (s.camping) this.fx(id, { s: 'relief', m: 'Tu n’es plus repéré.', k: 'good' });
        s.anchor = { lat: p.lat, lng: p.lng };
        s.anchorAt = this.now;
        s.camping = false;
      } else if (!s.camping && this.now - s.anchorAt > CAMP_T * 1000) {
        s.camping = true;
        this.fx(id, { s: 'alarm', v: [200], m: '👁️ Immobile trop longtemps : l’ennemi te voit sur sa carte !', k: 'bad' });
      }
    }
    if (t >= this.duration) this.end();
  }

  end() {
    const w = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    this.finish({
      title: w < 0 ? 'Égalité entre les services secrets' : `Les ${TEAM_INFO[w].name} remportent la guerre froide !`,
      winners: w < 0 ? [] : this.teams[w],
      teams: [0, 1].map((i) => ({ name: TEAM_INFO[i].name, color: TEAM_INFO[i].color, score: this.score[i] })),
      ranking: this.ranking((id) => this.st[id].rdv * 3 + this.st[id].unmasks * 2)
        .map((r) => ({ ...r, score: this.st[r.id].rdv * 3 + this.st[r.id].unmasks * 2, detail: `${this.st[r.id].rdv} rdv · ${this.st[r.id].unmasks} démasqué${this.st[r.id].unmasks > 1 ? 's' : ''}`, color: TEAM_INFO[this.teamOf[r.id]].color })),
      unit: 'pts',
    });
  }

  unmaskCandidates(id) {
    const t = this.teamOf[id];
    const p = this.pos(id);
    return this.teams[1 - t].filter((o) => this.d(p, this.pos(o)) <= UNMASK);
  }

  act(id, a) {
    const s = this.st[id];
    const t = this.teamOf[id];
    if (s.blockedUntil > this.now) return;
    if (this.elapsed < DISPERSE) return;
    if (a.type === 'unmask') {
      const c = this.unmaskCandidates(id);
      if (!c.includes(a.target)) return this.fx(id, { s: 'nope', m: 'Cette personne n’est pas à moins de 15 m', k: 'bad' });
      const m = this.missions.find((x) => !x.fake && x.agents.includes(a.target));
      if (m) {
        this.missions = this.missions.filter((x) => x !== m);
        this.score[t] += 2;
        s.unmasks++;
        this.st[a.target].blockedUntil = this.now + BLOCK;
        this.fx(a.target, { s: 'dead', v: [600], m: `🔦 Démasqué par ${this.name(id)} ! Bloqué 1 min`, k: 'bad', shake: true });
        this.fx(m.agents.filter((x) => x !== a.target), { s: 'lose', m: `🔦 ${this.name(a.target)} a été démasqué, mission annulée`, k: 'bad' });
        this.fx(this.teams[t], { s: 'capture', v: [100, 50, 100], m: `🔦 ${this.name(id)} démasque ${this.name(a.target)} ! +2`, k: 'good' });
        this.feed(`🔦 ${this.name(a.target)} démasqué par ${this.name(id)}`, 'good');
      } else {
        s.blockedUntil = this.now + BLOCK;
        this.fx(id, { s: 'nope', v: [500], m: `❌ ${this.name(a.target)} n’était pas en mission. Bloqué 1 min`, k: 'bad' });
        this.fx(a.target, { s: 'relief', m: `😏 ${this.name(id)} t’a accusé à tort`, k: 'good' });
      }
    }
    if (a.type === 'fake') {
      if (this.now < this.fakeReady[t]) return;
      this.fakeReady[t] = this.now + 240000;
      this.launch(t, true, id);
      this.fx(this.teams[t], { s: 'power', m: `🎭 ${this.name(id)} lance un faux rendez-vous pour l’équipe`, k: 'good' });
    }
  }

  view(me) {
    const t = this.teamOf[me];
    const s = this.st[me];
    const markers = [this.zoneMarker()];
    const mine = this.missions.find((m) => !m.fake && m.agents.includes(me));
    // Missions adverses : trois cercles qui rétrécissent.
    for (const m of this.missions.filter((x) => x.team !== t)) {
      const k = Math.min(1, (this.now - m.startedAt) / (m.until - m.startedAt));
      m.circles.forEach((c, i) => {
        markers.push({ id: `mc${m.id}-${i}`, type: 'circle', lat: c.lat, lng: c.lng, r: Math.max(45, c.r0 * (1 - 0.65 * k)), cls: 'intel', label: '?' });
      });
    }
    if (mine) {
      markers.push({ id: 'rdv', type: 'item', lat: mine.point.lat, lng: mine.point.lng, cls: 'rdv', icon: '📍', label: 'RENDEZ-VOUS' });
      markers.push({ id: 'rdvc', type: 'circle', lat: mine.point.lat, lng: mine.point.lng, r: RDV_R, cls: 'rdv-zone' });
    }
    for (const id of this.teams[t]) {
      const mk = this.playerMarker(id, me, { color: TEAM_INFO[t].color, cls: this.st[id].camping ? 'spotted' : '' });
      if (mk) markers.push(mk);
    }
    for (const id of this.teams[1 - t]) {
      if (!this.st[id].camping) continue;
      const mk = this.playerMarker(id, me, { color: TEAM_INFO[1 - t].color, cls: 'spotted enemy' });
      if (mk) markers.push(mk);
    }
    const ownActive = this.missions.filter((m) => m.team === t && !m.fake).length;
    const enemyActive = this.missions.filter((m) => m.team !== t).length;
    let status = null;
    if (this.elapsed < DISPERSE) status = { text: `🌫️ Dispersez-vous — premières missions dans ${Math.ceil(DISPERSE - this.elapsed)} s`, cls: 'info pulse' };
    else if (s.blockedUntil > this.now) status = { text: `⛔ Bloqué — ${Math.ceil((s.blockedUntil - this.now) / 1000)} s`, cls: 'bad pulse' };
    else if (mine) {
      const partner = mine.agents.find((x) => x !== me);
      const left = Math.max(0, Math.ceil((mine.until - this.now) / 1000));
      status = { text: mine.t > 0 ? `🤝 Échange en cours ${Math.floor(mine.t)}/${RDV_T} s` : `🕵️ Retrouve ${this.name(partner)} au 📍 — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, cls: 'good pulse' };
    } else if (s.camping) status = { text: '👁️ Tu es repéré : bouge !', cls: 'bad pulse' };
    else if (enemyActive) status = { text: `📻 ${enemyActive} rendez-vous ennemi${enemyActive > 1 ? 's' : ''} en cours : trouve le vrai cercle`, cls: 'warn' };
    else if (ownActive) status = { text: `🕵️ Ton équipe a ${ownActive} rendez-vous en cours`, cls: 'info' };
    const cands = this.unmaskCandidates(me);
    const blocked = s.blockedUntil > this.now || this.elapsed < DISPERSE;
    const fakeIn = Math.max(0, Math.ceil((this.fakeReady[t] - this.now) / 1000));
    return {
      team: { idx: t, name: TEAM_INFO[t].name, color: TEAM_INFO[t].color },
      hud: {
        chips: [
          { icon: '🛡️', label: TEAM_INFO[t].name, value: this.score[t], color: TEAM_INFO[t].color },
          { icon: '⚔️', label: TEAM_INFO[1 - t].name, value: this.score[1 - t], color: TEAM_INFO[1 - t].color },
        ],
        ends: this.startAt + this.duration * 1000,
        status,
      },
      markers,
      actions: [
        { id: 'unmask', label: 'Démasquer', icon: '🔦', enabled: !blocked && cands.length > 0, choices: cands.map((o) => ({ v: o, l: this.name(o) })), argKey: 'target', big: true, hint: 'Accuse un ennemi à moins de 15 m d’être en mission' },
        { id: 'fake', label: fakeIn ? `Faux rdv (${Math.floor(fakeIn / 60)}:${String(fakeIn % 60).padStart(2, '0')})` : 'Faux rendez-vous', icon: '🎭', enabled: !blocked && !fakeIn, hint: 'Fait apparaître 3 cercles chez l’ennemi pour l’attirer' },
      ],
    };
  }

  botTarget(id) {
    const m = this.missions.find((x) => !x.fake && x.agents.includes(id));
    if (m) return { ...m.point, speed: 2 };
    const t = this.teamOf[id];
    const em = this.missions.find((x) => x.team !== t);
    if (em) {
      const c = em.circles[(id.length + em.id + this.teams[t].indexOf(id)) % 3];
      return { lat: c.lat, lng: c.lng, speed: 1.8 };
    }
    return null;
  }

  botAct(id) {
    const c = this.unmaskCandidates(id);
    if (c.length && this.rnd() < 0.03) this.act(id, { type: 'unmask', target: c[0] });
    if (this.rnd() < 0.003) this.act(id, { type: 'fake' });
  }
}

Espions.meta = {
  id: 'espions', name: 'Espions', min: 4, max: 24, teams: true,
  opts: [{ key: 'duree', label: 'Durée', def: 20, choices: [{ v: 15, l: '15 min' }, { v: 20, l: '20 min' }, { v: 25, l: '25 min' }] }],
};

module.exports = Espions;
