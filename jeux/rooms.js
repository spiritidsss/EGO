'use strict';
// Salles de jeu : code à 4 lettres, joueurs, zone, partie en cours, joueurs simulés.
const geo = require('./geo');
const { GAMES, catalogue } = require('./games');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#3ddc97', '#c77dff', '#ff8c42', '#2ec4b6', '#f72585',
  '#90e0ef', '#b5e48c', '#ffadad', '#a0c4ff', '#fdffb6', '#bdb2ff', '#ffc6ff', '#caffbf'];
const BOT_NAMES = ['Bot Ada', 'Bot Bix', 'Bot Cid', 'Bot Dot', 'Bot Eli', 'Bot Fox', 'Bot Gus', 'Bot Hal',
  'Bot Ivy', 'Bot Jax', 'Bot Kim', 'Bot Lou', 'Bot Max', 'Bot Neo', 'Bot Oz', 'Bot Pia'];
const MAX_PLAYERS = 24;

function safeName(n) {
  return String(n || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Joueur';
}

class Room {
  constructor(code, hostId, opts = {}) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.zone = null;
    this.game = null;
    this.gameId = null;
    this.selected = 'recolte';
    this.gameOpts = {};
    this.clock = opts.clock || (() => Date.now());
    this.rnd = opts.rnd || Math.random;
    this.lastActive = this.clock();
    this.countdownUntil = 0;
    if (!opts.manual) this.interval = setInterval(() => this.tick(), 1000);
  }

  now() { return this.clock(); }

  addPlayer(id, name, ws, bot = false) {
    let p = this.players.get(id);
    if (!p) {
      const used = new Set([...this.players.values()].map((x) => x.color));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[this.players.size % COLORS.length];
      p = { id, name: safeName(name), color, ws: null, connected: false, bot, pos: null, manual: false };
      this.players.set(id, p);
    } else if (name) p.name = safeName(name);
    p.ws = ws;
    p.connected = bot || !!ws;
    this.lastActive = this.now();
    return p;
  }

  summary() {
    return {
      code: this.code,
      hostId: this.hostId,
      zone: this.zone,
      selected: this.selected,
      gameOpts: this.gameOpts,
      gameId: this.game ? this.gameId : null,
      phase: this.game ? (this.game.over ? 'over' : 'play') : 'lobby',
      countdownUntil: this.countdownUntil,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected, bot: p.bot, gps: !!p.pos,
      })),
    };
  }

  send(p, msg) {
    if (p && p.ws && p.ws.readyState === 1) {
      try { p.ws.send(JSON.stringify(msg)); } catch {}
    }
  }

  broadcastRoom() {
    const s = this.summary();
    for (const p of this.players.values()) this.send(p, { t: 'room', room: s, you: p.id, now: this.now() });
  }

  sendView(p) {
    if (!this.game || p.bot) return;
    let v;
    try { v = this.game.fullView(p.id); } catch (e) { console.error(e); return; }
    this.send(p, { t: 'view', v, now: this.now() });
  }

  broadcastViews() {
    for (const p of this.players.values()) this.sendView(p);
  }

  fx(target, fx) {
    const ids = target === 'all' ? [...this.players.keys()] : Array.isArray(target) ? target : [target];
    for (const id of ids) {
      const p = this.players.get(id);
      if (p && !p.bot) this.send(p, { t: 'fx', fx });
    }
  }

  // Joueurs simulés : se déplacent vers la cible proposée par le jeu, sinon au hasard.
  moveBots(dt) {
    if (!this.zone) return;
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      if (!p.pos) p.pos = { ...geo.randomIn(this.zone, this.zone.r * 0.8, 0, this.rnd), acc: 5 };
      let target = null;
      let speed = p.speed || 1.6;
      if (this.game && !this.game.over && this.game.botTarget) {
        const t = this.game.botTarget(p.id);
        if (t) { target = t; if (t.speed) speed = t.speed; }
      }
      if (!target) {
        if (!p.wander || geo.dist(p.pos, p.wander) < 10) p.wander = geo.randomIn(this.zone, this.zone.r * 0.9, 0, this.rnd);
        target = p.wander;
      }
      const next = geo.toward(p.pos, target, speed * dt);
      const jitter = geo.offset(next, this.rnd() * 1.5, this.rnd() * 360);
      p.pos = { lat: jitter.lat, lng: jitter.lng, acc: 5, t: this.now() };
      if (this.game && !this.game.over && this.game.botAct) {
        try { this.game.botAct(p.id); } catch (e) { console.error(e); }
      }
    }
  }

  tick(dt = 1) {
    if (this.countdownUntil && this.now() < this.countdownUntil) {
      this.moveBots(dt);
      return;
    }
    this.moveBots(dt);
    if (this.game && !this.game.over) {
      try { this.game._tick(dt); } catch (e) { console.error(e); }
    }
    if (this.game) this.broadcastViews();
  }

  setPos(id, pos) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    const lat = Number(pos.lat);
    const lng = Number(pos.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const first = !p.pos;
    p.pos = { lat, lng, acc: Math.min(500, Number(pos.acc) || 20), t: this.now() };
    p.manual = !!pos.manual;
    if (first) this.broadcastRoom();
  }

  start(gameId, opts) {
    const G = GAMES[gameId];
    if (!G || !this.zone) return 'Choisis une zone de jeu sur la carte.';
    const n = [...this.players.values()].filter((p) => p.connected).length;
    if (n < G.meta.min) return `Il faut au moins ${G.meta.min} joueurs pour ${G.meta.name}.`;
    // Les joueurs sans GPS démarrent au centre de la zone.
    for (const p of this.players.values()) if (!p.pos) p.pos = { lat: this.zone.lat, lng: this.zone.lng, acc: 50, t: this.now() };
    this.gameId = gameId;
    this.selected = gameId;
    this.gameOpts = opts || {};
    this.countdownUntil = this.now() + 4000;
    this.game = new G(this, this.gameOpts);
    this.game.startAt = this.countdownUntil;
    this.broadcastRoom();
    this.broadcastViews();
    return null;
  }

  endGame() {
    this.game = null;
    this.gameId = null;
    this.countdownUntil = 0;
    this.broadcastRoom();
  }

  destroy() { clearInterval(this.interval); }
}

class Rooms {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.sessions = new Map(); // pid -> code
    this.sockets = new Map(); // ws -> pid
    this.opts = opts;
    if (!opts.manual) this.gc = setInterval(() => this.cleanup(), 60000);
  }

  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      const anyone = [...r.players.values()].some((p) => p.connected && !p.bot);
      if (anyone) r.lastActive = now;
      else if (now - r.lastActive > 30 * 60000) {
        r.destroy();
        this.rooms.delete(code);
        for (const [pid, c] of this.sessions) if (c === code) this.sessions.delete(pid);
      }
    }
  }

  reply(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  roomOf(pid) {
    const code = this.sessions.get(pid);
    return code ? this.rooms.get(code) : null;
  }

  handle(ws, m) {
    if (m.t === 'hello') {
      const pid = String(m.pid || '').slice(0, 40);
      if (!pid) return;
      this.sockets.set(ws, pid);
      ws.pid = pid;
      this.reply(ws, { t: 'catalogue', games: catalogue(), now: Date.now() });
      const r = this.roomOf(pid);
      if (r && r.players.has(pid)) {
        r.addPlayer(pid, m.name, ws);
        r.broadcastRoom();
        r.sendView(r.players.get(pid));
      } else this.reply(ws, { t: 'noroom' });
      return;
    }
    const pid = ws.pid;
    if (!pid) return;
    let r = this.roomOf(pid);

    switch (m.t) {
      case 'create': {
        if (r) this.leave(pid);
        const code = this.newCode();
        r = new Room(code, pid);
        this.rooms.set(code, r);
        this.sessions.set(pid, code);
        r.addPlayer(pid, m.name, ws);
        r.broadcastRoom();
        return;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const target = this.rooms.get(code);
        if (!target) return this.reply(ws, { t: 'error', msg: `Aucune partie avec le code ${code}.` });
        if (!target.players.has(pid) && target.players.size >= MAX_PLAYERS) return this.reply(ws, { t: 'error', msg: 'La partie est complète.' });
        if (r && r !== target) this.leave(pid);
        this.sessions.set(pid, code);
        target.addPlayer(pid, m.name, ws);
        target.broadcastRoom();
        target.sendView(target.players.get(pid));
        return;
      }
      case 'leave':
        this.leave(pid);
        this.reply(ws, { t: 'noroom' });
        return;
      case 'rename':
        if (r && r.players.has(pid)) { r.players.get(pid).name = safeName(m.name); r.broadcastRoom(); }
        return;
    }
    if (!r || !r.players.has(pid)) return;
    const isHost = r.hostId === pid;

    switch (m.t) {
      case 'pos':
        r.setPos(pid, m);
        return;
      case 'act':
        if (r.game && !r.game.over && r.now() >= r.countdownUntil && m.a && typeof m.a.type === 'string') {
          r.game._act(pid, m.a);
          r.broadcastViews();
        }
        return;
      case 'zone': {
        if (!isHost || r.game) return;
        const lat = Number(m.lat), lng = Number(m.lng), rad = Number(m.r);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        r.zone = { lat, lng, r: Math.max(60, Math.min(2000, rad || 250)) };
        r.broadcastRoom();
        return;
      }
      case 'select':
        if (!isHost || r.game || !GAMES[m.game]) return;
        r.selected = m.game;
        r.gameOpts = typeof m.opts === 'object' && m.opts ? m.opts : {};
        r.broadcastRoom();
        return;
      case 'start': {
        if (!isHost) return;
        if (r.game && !r.game.over) return;
        if (r.game) r.game = null;
        const err = r.start(m.game || r.selected, m.opts || r.gameOpts);
        if (err) this.reply(ws, { t: 'error', msg: err });
        return;
      }
      case 'end':
        if (isHost) r.endGame();
        return;
      case 'bots': {
        if (!isHost || r.game) return;
        const n = Math.max(0, Math.min(15, Number(m.n) || 0));
        for (const [id, p] of r.players) if (p.bot) r.players.delete(id);
        for (let i = 0; i < n; i++) {
          const p = r.addPlayer(`bot-${i}-${r.code}`, BOT_NAMES[i], null, true);
          p.speed = 1.3 + Math.random() * 1.6;
        }
        r.broadcastRoom();
        return;
      }
      case 'kick':
        if (isHost && m.id !== pid && r.players.has(m.id) && !r.game) {
          const p = r.players.get(m.id);
          r.players.delete(m.id);
          this.sessions.delete(m.id);
          if (p.ws) this.reply(p.ws, { t: 'noroom', msg: 'Tu as été retiré de la partie.' });
          r.broadcastRoom();
        }
        return;
    }
  }

  leave(pid) {
    const r = this.roomOf(pid);
    this.sessions.delete(pid);
    if (!r) return;
    if (r.game && !r.game.over) {
      const p = r.players.get(pid);
      if (p) { p.connected = false; p.ws = null; }
    } else r.players.delete(pid);
    if (r.hostId === pid) {
      const next = [...r.players.values()].find((p) => !p.bot && p.connected);
      if (next) r.hostId = next.id;
    }
    if (![...r.players.values()].some((p) => !p.bot)) {
      r.destroy();
      this.rooms.delete(r.code);
      return;
    }
    r.broadcastRoom();
  }

  disconnect(ws) {
    const pid = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!pid) return;
    const r = this.roomOf(pid);
    if (!r) return;
    const p = r.players.get(pid);
    if (p && p.ws === ws) {
      p.connected = false;
      p.ws = null;
      if (r.hostId === pid) {
        const next = [...r.players.values()].find((x) => !x.bot && x.connected);
        if (next) r.hostId = next.id;
      }
      r.broadcastRoom();
    }
  }
}

module.exports = { Rooms, Room };
