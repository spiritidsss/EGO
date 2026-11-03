// NOLIMIT GAMES — application téléphone.
(function () {
  'use strict';
  const INFO = window.GAME_INFO;
  const ORDER = window.GAME_ORDER;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const TILES = {
    dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    voyager: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  };
  const THEME_TILES = { recolte: 'voyager', meteores: 'dark', zone: 'voyager', horde: 'dark', drapeau: 'light', geiger: 'dark', primes: 'dark', espions: 'light', home: 'dark' };
  const ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Esri';

  // ---------- État ----------
  const S = {
    pid: store.get('nl-pid', null),
    name: store.get('nl-name', ''),
    room: null,
    you: null,
    catalogue: [],
    view: null,
    offset: 0,
    pos: null,
    manual: store.get('nl-manual', '0') === '1',
    heading: null,
    error: '',
    screen: null,
    follow: true,
    lastCountdownShown: 0,
    resultsShownFor: null,
  };
  if (!S.pid) {
    S.pid = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store.set('nl-pid', S.pid);
  }
  const urlCode = (new URLSearchParams(location.search).get('c') || '').toUpperCase().slice(0, 4);
  const serverNow = () => Date.now() + S.offset;
  const isHost = () => S.room && S.room.hostId === S.pid;

  // ---------- Réseau ----------
  let ws = null;
  let retry = 0;
  let queue = [];
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      retry = 0;
      setConn(true);
      raw({ t: 'hello', pid: S.pid, name: S.name });
      queue.forEach(raw);
      queue = [];
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.now) S.offset = m.now - Date.now();
      onMessage(m);
    };
    ws.onclose = () => {
      setConn(false);
      setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
    };
  }
  function raw(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function send(m) { if (ws && ws.readyState === 1) raw(m); else queue.push(m); }
  function setConn(ok) {
    let el = $('.conn');
    if (ok) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'conn'; el.textContent = 'Reconnexion…'; document.body.appendChild(el); }
  }

  function onMessage(m) {
    switch (m.t) {
      case 'catalogue':
        S.catalogue = m.games;
        if (!S.room) route();
        break;
      case 'noroom':
        S.room = null;
        S.view = null;
        if (m.msg) toast(m.msg, 'bad');
        route();
        break;
      case 'room': {
        const prevPhase = S.room && S.room.phase;
        S.room = m.room;
        S.you = m.you;
        if (m.room.phase === 'lobby') S.view = null;
        if (m.room.phase !== 'lobby' && m.room.countdownUntil && m.room.countdownUntil !== S.lastCountdownShown && m.room.countdownUntil > serverNow()) {
          S.lastCountdownShown = m.room.countdownUntil;
          showCountdown(m.room.countdownUntil);
        }
        route(prevPhase);
        break;
      }
      case 'view':
        S.view = m.v;
        if (S.screen === 'game') updateGame();
        else route();
        break;
      case 'fx':
        handleFx(m.fx);
        break;
      case 'error':
        toast(m.msg, 'bad');
        Sound.play('nope');
        break;
    }
  }

  // ---------- GPS, boussole, écran allumé ----------
  let watchId = null;
  let lastSent = 0;
  let lastSentPos = null;
  function startGeo() {
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (S.manual) return;
        S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        if (p.coords.heading != null && !Number.isNaN(p.coords.heading) && S.heading == null) S.gpsHeading = p.coords.heading;
        pushPos();
        gpsTag();
      },
      (err) => { S.geoErr = err.code === 1 ? 'GPS refusé' : 'GPS indisponible'; gpsTag(); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }
  function pushPos(force) {
    if (!S.pos) return;
    const now = Date.now();
    const moved = !lastSentPos || Math.abs(lastSentPos.lat - S.pos.lat) + Math.abs(lastSentPos.lng - S.pos.lng) > 0.000005;
    if (force || (now - lastSent > 900 && (moved || now - lastSent > 4000))) {
      lastSent = now;
      lastSentPos = { ...S.pos };
      send({ t: 'pos', lat: S.pos.lat, lng: S.pos.lng, acc: S.pos.acc, manual: S.manual });
    }
  }
  setInterval(() => pushPos(), 1000);
  function setManualPos(latlng) {
    S.pos = { lat: latlng.lat, lng: latlng.lng, acc: 3 };
    pushPos(true);
    gpsTag();
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;
    if (h != null) S.heading = (h + 360) % 360;
  }
  let compassOn = false;
  function startCompass() {
    if (compassOn) return;
    compassOn = true;
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') window.addEventListener('deviceorientation', onOrient); }).catch(() => {});
      } else {
        window.addEventListener('deviceorientationabsolute', onOrient);
        window.addEventListener('deviceorientation', onOrient);
      }
    } catch {}
  }
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (S.screen === 'game') keepAwake(true);
      if (ws && ws.readyState > 1) connect();
    }
  });
  function gesture() {
    Sound.unlock();
    startGeo();
    startCompass();
  }

  // ---------- Navigation ----------
  function route() {
    const phase = S.room ? S.room.phase : null;
    let target = 'home';
    if (S.room) target = phase === 'lobby' ? 'lobby' : 'game';
    if (target === 'game' && !S.view) target = 'lobby';
    if (target !== S.screen) {
      teardown();
      S.screen = target;
      if (target === 'home') renderHome();
      if (target === 'lobby') renderLobby();
      if (target === 'game') renderGame();
    } else if (target === 'lobby') updateLobby();
    else if (target === 'game') updateGame();
  }
  function teardown() {
    if (lobbyMap) { lobbyMap.remove(); lobbyMap = null; }
    if (gameMap) { gameMap.remove(); gameMap = null; layers.clear(); }
    document.body.classList.remove('in-game', 'danger');
    Sound.stopLoops();
    keepAwake(false);
    if (S.screen === 'game' && $('#overlay .results')) $('#overlay').innerHTML = '';
    setTheme('home');
  }
  function setTheme(t) { document.body.dataset.theme = t; }

  // ---------- Accueil ----------
  function renderHome() {
    const minis = ORDER.map((g) => `<div class="mini">${INFO[g].art}</div>`).join('');
    $('#app').innerHTML = `
      <section class="screen" id="home">
        <div class="logo">
          <div class="radar"><div class="sweep"></div><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span><div class="core"></div></div>
          <h1 class="wordmark">NOLIMIT<small>GAMES</small></h1>
          <p class="tagline">8 jeux GPS à jouer dehors entre amis. Choisis ta zone, sors ton téléphone, cours.</p>
        </div>
        <div class="marquee"><div class="track">${minis}${minis}</div></div>
        <div class="card" style="display:grid;gap:14px">
          <div class="field"><label for="nm">Ton pseudo</label><input id="nm" class="input" maxlength="16" placeholder="Ex. Luna" value="${esc(S.name)}" autocomplete="nickname"></div>
          <button class="btn btn-primary btn-block" id="create">✦ Créer une partie</button>
          <div class="divider">OU</div>
          <div class="row"><input id="code" class="input code" maxlength="4" placeholder="CODE" value="${esc(urlCode)}" autocapitalize="characters" autocomplete="off"><button class="btn btn-ghost" id="join" style="flex:.7">Rejoindre</button></div>
          <p class="err" id="err"></p>
        </div>
        <p class="foot">Le GPS et le son sont nécessaires pour jouer. Joue dans un lieu sûr, regarde où tu cours.</p>
      </section>`;
    const nm = $('#nm');
    const getName = () => {
      const n = nm.value.trim();
      if (!n) { $('#err').textContent = 'Choisis un pseudo.'; nm.focus(); Sound.play('nope'); return null; }
      S.name = n;
      store.set('nl-name', n);
      return n;
    };
    $('#create').onclick = () => { gesture(); const n = getName(); if (n) { Sound.play('tap'); send({ t: 'create', name: n }); } };
    $('#join').onclick = () => {
      gesture();
      const n = getName();
      const c = $('#code').value.trim().toUpperCase();
      if (!n) return;
      if (c.length !== 4) { $('#err').textContent = 'Le code fait 4 lettres.'; Sound.play('nope'); return; }
      Sound.play('tap');
      send({ t: 'join', code: c, name: n });
    };
    $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#join').click(); });
  }

  // ---------- Salon ----------
  let lobbyMap = null;
  let zoneCircle = null;
  let meMarkerLobby = null;
  function renderLobby() {
    setTheme('home');
    const shareUrl = `${location.origin}/?c=${S.room.code}`;
    $('#app').innerHTML = `
      <section class="screen" id="lobby">
        <div class="lobby-head">
          <div class="room-code"><span class="label">Code de la partie</span><b>${esc(S.room.code)}</b></div>
          <div class="row" style="flex:none;gap:8px">
            <button class="btn btn-ghost btn-small" id="share">Inviter</button>
            <button class="btn btn-ghost btn-small" id="quit">Quitter</button>
          </div>
        </div>
        <div class="card" style="display:grid;gap:10px"><span class="label">Joueurs</span><div class="players" id="players"></div></div>
        <div class="card zone-tools">
          <div class="row" style="justify-content:space-between"><span class="label">Zone de jeu</span><span class="pill mono" id="radiusLbl"></span></div>
          <div class="zone-map" id="lmap"></div>
          <div id="zoneCtl"></div>
        </div>
        <div><span class="label">Choisis le jeu</span></div>
        <div class="games-grid" id="grid"></div>
        <div class="card detail" id="detail"></div>
        <div class="card sim" id="simBox"></div>
        <div class="start-bar" id="startBar"></div>
      </section>`;
    $('#quit').onclick = () => { Sound.play('tap'); send({ t: 'leave' }); };
    $('#share').onclick = async () => {
      Sound.play('tap');
      try {
        if (navigator.share) await navigator.share({ title: 'NOLIMIT GAMES', text: `Rejoins ma partie NOLIMIT GAMES : code ${S.room.code}`, url: shareUrl });
        else { await navigator.clipboard.writeText(shareUrl); toast('Lien copié !', 'good'); }
      } catch {}
    };
    $('#grid').innerHTML = ORDER.map((g) => `
      <button class="poster" data-g="${g}" aria-label="${esc(INFO[g].name)}">
        <span class="mood">${esc(INFO[g].mood)}</span>
        <div class="art">${INFO[g].art}</div>
        <h3>${esc(INFO[g].name)}</h3><p class="tg">${esc(INFO[g].tag)}</p><span class="check">✓</span>
      </button>`).join('');
    $('#grid').onclick = (e) => {
      const b = e.target.closest('.poster');
      if (!b) return;
      Sound.play('tap');
      if (!isHost()) { showRules(b.dataset.g); return; }
      send({ t: 'select', game: b.dataset.g, opts: {} });
    };
    // Carte de la zone.
    lobbyMap = L.map('lmap', { zoomControl: false, attributionControl: true });
    L.tileLayer(TILES.dark, { attribution: ATTR, maxZoom: 19, maxNativeZoom: 16 }).addTo(lobbyMap);
    lobbyMap.setView([48.8566, 2.3522], 15);
    lobbyMap.on('click', (e) => {
      if (S.manual) { setManualPos(e.latlng); updateLobby(); }
      if (!isHost()) return;
      const r = S.room.zone ? S.room.zone.r : 250;
      send({ t: 'zone', lat: e.latlng.lat, lng: e.latlng.lng, r });
    });
    updateLobby(true);
  }

  function updateLobby(first) {
    if (S.screen !== 'lobby' || !S.room) return;
    const r = S.room;
    const host = isHost();
    $('#players').innerHTML = r.players.map((p) => `
      <span class="pchip ${p.connected ? '' : 'off'}" style="--c:${p.color}">
        <i>${p.id === r.hostId ? '★' : ''}</i>${esc(p.name)}${p.id === S.pid ? ' <span class="tagx">(toi)</span>' : ''}
        <span class="tagx">${p.bot ? '🤖' : p.gps ? '📍' : '⌛'}</span>
        ${host && p.id !== S.pid && !p.bot ? `<button data-kick="${esc(p.id)}" aria-label="Retirer">✕</button>` : ''}
      </span>`).join('');
    $('#players').onclick = (e) => { const k = e.target.closest('[data-kick]'); if (k) send({ t: 'kick', id: k.dataset.kick }); };
    // Zone.
    const z = r.zone;
    $('#radiusLbl').textContent = z ? `${Math.round(z.r)} m` : 'à définir';
    if (lobbyMap) {
      if (z) {
        if (!zoneCircle || !lobbyMap.hasLayer(zoneCircle)) zoneCircle = L.circle([z.lat, z.lng], { radius: z.r, color: '#ff3cac', weight: 3, fillColor: '#ff3cac', fillOpacity: 0.12, dashArray: '8 6' }).addTo(lobbyMap);
        else { zoneCircle.setLatLng([z.lat, z.lng]); zoneCircle.setRadius(z.r); }
        if (first || S._fitZone !== `${z.lat},${z.lng},${z.r}`) {
          S._fitZone = `${z.lat},${z.lng},${z.r}`;
          lobbyMap.fitBounds(zoneCircle.getBounds(), { padding: [12, 12] });
        }
      } else if (S.pos && first) lobbyMap.setView([S.pos.lat, S.pos.lng], 16);
      if (S.pos) {
        if (!meMarkerLobby || !lobbyMap.hasLayer(meMarkerLobby)) meMarkerLobby = L.marker([S.pos.lat, S.pos.lng], { icon: L.divIcon({ className: '', html: `<div class="mk mk-me" style="--c:${myColor()}"><div class="dot"></div></div>`, iconSize: [24, 24] }) }).addTo(lobbyMap);
        else meMarkerLobby.setLatLng([S.pos.lat, S.pos.lng]);
      }
    }
    if (host) {
      const rad = z ? Math.round(z.r) : 250;
      if (!$('#zrange')) {
        $('#zoneCtl').innerHTML = `
          <div class="row"><button class="btn btn-ghost btn-small" id="zme">📍 Centrer sur moi</button><span class="hint" style="flex:1.4;text-align:left">ou touche la carte pour placer le centre</span></div>
          <input type="range" id="zrange" min="80" max="1000" step="10" value="${rad}" aria-label="Rayon de la zone">
          <label class="row hint" style="justify-content:flex-start;gap:8px;text-align:left"><input type="checkbox" id="manual" ${S.manual ? 'checked' : ''} style="flex:none;width:20px;height:20px;accent-color:var(--accent)"> Mode test sans GPS : je touche la carte pour me déplacer</label>`;
        $('#zme').onclick = () => {
          gesture();
          Sound.play('tap');
          if (!S.pos) { toast('Position GPS pas encore trouvée… Autorise la localisation.', 'bad'); return; }
          send({ t: 'zone', lat: S.pos.lat, lng: S.pos.lng, r: Number($('#zrange').value) });
        };
        let tm;
        $('#zrange').oninput = (e) => {
          $('#radiusLbl').textContent = `${e.target.value} m`;
          if (zoneCircle) zoneCircle.setRadius(Number(e.target.value));
          clearTimeout(tm);
          tm = setTimeout(() => {
            const zz = S.room.zone || (S.pos ? { lat: S.pos.lat, lng: S.pos.lng } : null);
            if (zz) send({ t: 'zone', lat: zz.lat, lng: zz.lng, r: Number(e.target.value) });
          }, 250);
        };
        $('#manual').onchange = (e) => { S.manual = e.target.checked; store.set('nl-manual', S.manual ? '1' : '0'); toast(S.manual ? 'Mode test : touche la carte pour te déplacer' : 'Retour au GPS', 'good'); };
      } else if (document.activeElement !== $('#zrange')) $('#zrange').value = rad;
      if (!z && S.pos && !S._autoZone) { S._autoZone = true; send({ t: 'zone', lat: S.pos.lat, lng: S.pos.lng, r: 250 }); }
    } else {
      $('#zoneCtl').innerHTML = `<p class="hint">L’hôte choisit la zone. ${S.pos ? '📍 Ta position est trouvée.' : '⌛ Recherche de ta position GPS…'}</p>`;
    }
    // Jeux.
    document.querySelectorAll('.poster').forEach((b) => b.classList.toggle('sel', b.dataset.g === r.selected));
    renderDetail();
    // Joueurs simulés.
    const bots = r.players.filter((p) => p.bot).length;
    $('#simBox').style.display = host ? '' : 'none';
    if (host) {
      $('#simBox').innerHTML = `<div><span class="label">Joueurs simulés</span><p class="hint" style="text-align:left">Pour tester un jeu sans tes amis.</p></div>
        <div class="stepper"><button id="bm" aria-label="Moins">−</button><b>${bots}</b><button id="bp" aria-label="Plus">+</button></div>`;
      $('#bm').onclick = () => { Sound.play('tap'); send({ t: 'bots', n: Math.max(0, bots - 1) }); };
      $('#bp').onclick = () => { Sound.play('tap'); send({ t: 'bots', n: Math.min(12, bots + 1) }); };
    }
    // Lancement.
    const meta = S.catalogue.find((g) => g.id === r.selected);
    const n = r.players.filter((p) => p.connected).length;
    if (host) {
      let why = '';
      if (!z) why = 'Place la zone de jeu sur la carte.';
      else if (meta && n < meta.min) why = `Il faut au moins ${meta.min} joueurs.`;
      $('#startBar').innerHTML = `<button class="btn btn-primary btn-block" id="go" ${why ? 'disabled' : ''}>▶ LANCER ${esc(INFO[r.selected].name.toUpperCase())}</button>${why ? `<p class="hint">${why}</p>` : ''}`;
      $('#go') && ($('#go').onclick = () => { gesture(); Sound.play('tap'); send({ t: 'start', game: r.selected, opts: r.gameOpts }); });
    } else {
      $('#startBar').innerHTML = `<div class="card hint" style="text-align:center">⌛ En attente de l’hôte… Prochain jeu : <b>${esc(INFO[r.selected].name)}</b></div>`;
    }
  }

  function renderDetail() {
    const r = S.room;
    const g = r.selected;
    const info = INFO[g];
    const meta = S.catalogue.find((x) => x.id === g) || { opts: [] };
    const host = isHost();
    const opts = (meta.opts || []).map((o) => {
      const cur = r.gameOpts && r.gameOpts[o.key] != null ? r.gameOpts[o.key] : o.def;
      return `<div class="field"><span class="label">${esc(o.label)}</span><div class="seg" data-k="${esc(o.key)}">${o.choices.map((c) => `<button data-v="${esc(c.v)}" class="${String(c.v) === String(cur) ? 'on' : ''}" ${host ? '' : 'disabled'}>${esc(c.l)}</button>`).join('')}</div></div>`;
    }).join('');
    $('#detail').innerHTML = `
      <div class="row" style="align-items:flex-start"><div><h2 style="font-size:1.3rem">${esc(info.name)}</h2><p class="hint" style="text-align:left">${esc(info.tag)}</p></div><div style="flex:none;width:64px;height:64px">${info.art}</div></div>
      <div class="meta"><span class="pill">👥 ${esc(info.players)}</span><span class="pill">⏱ ${esc(info.time)}</span><span class="pill">✦ ${esc(info.mood)}</span></div>
      <ol class="rules">${info.rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${opts ? `<div class="opts">${opts}</div>` : ''}`;
    if (host) {
      $('#detail').onclick = (e) => {
        const b = e.target.closest('.seg button');
        if (!b) return;
        Sound.play('tap');
        const k = b.parentElement.dataset.k;
        const o = (meta.opts || []).find((x) => x.key === k);
        const v = typeof o.def === 'number' ? Number(b.dataset.v) : b.dataset.v;
        send({ t: 'select', game: g, opts: { ...(r.gameOpts || {}), [k]: v } });
      };
    }
  }

  function showRules(g) {
    const info = INFO[g];
    sheet(`<div class="row" style="align-items:flex-start"><div><h2>${esc(info.name)}</h2><p class="hint" style="text-align:left">${esc(info.tag)}</p></div><div style="flex:none;width:70px">${info.art}</div></div>
      <ol class="rules">${info.rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <button class="btn btn-ghost btn-block" data-close>Fermer</button>`);
  }

  function myColor() {
    const p = S.room && S.room.players.find((x) => x.id === S.pid);
    return p ? p.color : '#fff';
  }

  // ---------- En jeu ----------
  let gameMap = null;
  const layers = new Map();
  let lastChips = {};
  function renderGame() {
    const v = S.view;
    const info = INFO[v.game];
    setTheme(info.theme);
    document.body.classList.add('in-game');
    keepAwake(true);
    $('#app').innerHTML = `
      <section id="game">
        <div id="map"></div>
        <div class="hud">
          <div class="hud-top">
            <div class="hud-title"><h2>${esc(info.name)}</h2><p id="hsub"></p></div>
            <div class="timer" id="timer">--:--</div>
            <button class="icon-btn" id="mute" aria-label="Son">${Sound.muted ? '🔇' : '🔊'}</button>
            <button class="icon-btn" id="menu" aria-label="Menu">☰</button>
          </div>
          <div class="chips" id="chips"></div>
          <div class="status" id="status" hidden></div>
          <div class="feed" id="feed"></div>
        </div>
        <div class="gps-tag" id="gps"></div>
        <div class="map-btns"><button id="recenter" class="on" aria-label="Me suivre">◎</button><button id="fitall" aria-label="Voir la zone">⤢</button></div>
        <div class="bottom"><div id="panel" class="panel"></div><div class="actions" id="actions"></div></div>
      </section>`;
    gameMap = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.5 });
    L.tileLayer(TILES[THEME_TILES[info.theme] || 'dark'], { attribution: ATTR, maxZoom: 19, maxNativeZoom: 16 }).addTo(gameMap);
    const z = v.zone;
    gameMap.fitBounds(L.latLng(z.lat, z.lng).toBounds(z.r * 2.1));
    gameMap.on('dragstart', () => { S.follow = false; $('#recenter').classList.remove('on'); });
    gameMap.on('click', (e) => { if (S.manual) setManualPos(e.latlng); });
    $('#recenter').onclick = () => { S.follow = true; $('#recenter').classList.add('on'); centerMe(true); };
    $('#fitall').onclick = () => { S.follow = false; $('#recenter').classList.remove('on'); gameMap.fitBounds(L.latLng(z.lat, z.lng).toBounds(z.r * 2.1)); };
    $('#mute').onclick = () => { const m = Sound.toggle(); $('#mute').textContent = m ? '🔇' : '🔊'; };
    $('#menu').onclick = () => openMenu();
    $('#actions').onclick = (e) => {
      const b = e.target.closest('.act');
      if (!b || b.disabled) return;
      const a = (S.view.actions || [])[Number(b.dataset.i)];
      if (!a) return;
      Sound.play('tap');
      Sound.vibrate(15);
      if (a.choices) {
        if (!a.choices.length) return toast('Personne à portée', 'bad');
        sheet(`<h2>${esc(a.icon || '')} ${esc(a.label)}</h2>${a.hint ? `<p class="hint" style="text-align:left">${esc(a.hint)}</p>` : ''}
          <div class="choices">${a.choices.map((c) => `<button class="btn btn-ghost btn-block" data-v="${esc(c.v)}">${esc(c.l)}</button>`).join('')}</div>
          <button class="btn btn-ghost btn-block" data-close>Annuler</button>`, (el) => {
          el.querySelector('.choices').onclick = (ev) => {
            const cb = ev.target.closest('[data-v]');
            if (!cb) return;
            send({ t: 'act', a: { type: a.id, ...(a.args || {}), [a.argKey]: cb.dataset.v } });
            closeSheet();
          };
        });
        return;
      }
      send({ t: 'act', a: { type: a.id, ...(a.args || {}) } });
    };
    S.follow = true;
    updateGame();
    setTimeout(() => gameMap && gameMap.invalidateSize(), 100);
  }

  function centerMe(force) {
    const me = (S.view.markers || []).find((m) => m.type === 'me');
    if (me && gameMap && (S.follow || force)) gameMap.panTo([me.lat, me.lng], { animate: true });
  }

  function iconHtml(m) {
    const c = m.color || '#fff';
    switch (m.type) {
      case 'me':
      case 'player':
        return `<div class="mk mk-${m.type} ${esc(m.cls || '')}" style="--c:${c}"><div class="dot"></div>${m.type === 'player' && m.label ? `<span class="nm">${esc(m.label)}</span>` : ''}</div>`;
      case 'item':
        return `<div class="mk mk-item ${esc(m.cls || '')} ${m.far ? 'far' : ''}"><div class="orb">${esc(m.icon || '')}</div>${m.label ? `<span class="lbl">${esc(m.label)}</span>` : ''}</div>`;
      case 'creature':
        return `<div class="mk mk-creature ${esc(m.cls || '')}"><div class="orb">${esc(m.icon)}</div></div>`;
      case 'base':
        return `<div class="mk mk-base" style="--c:${c}"><div class="orb">${esc(m.icon)}</div>${m.label ? `<span class="nm">${esc(m.label)}</span>` : ''}</div>`;
      case 'flag':
        return `<div class="mk mk-flag ${esc(m.cls || '')}" style="--c:${c}"><svg class="orb" viewBox="0 0 32 40" width="30" height="38"><path d="M5 3v35" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M7 4q7-4 13 0t11 0v15q-5 4-11 0t-13 0z" fill="${c}" stroke="#fff" stroke-width="1.5"/></svg></div>`;
      case 'impact':
        return `<div class="mk mk-impact ${esc(m.cls || '')}">${esc(m.label || '')}</div>`;
    }
    return '';
  }
  const SIZES = { me: 24, player: 20, item: 34, creature: 42, base: 40, flag: 30, impact: 40 };

  function circleStyle(m) {
    const theme = document.body.dataset.theme;
    const map = {
      'zone-edge': { color: theme === 'horde' ? '#ff2a2a' : '#ffffff', weight: 2, opacity: 0.55, fill: false, dashArray: '6 8' },
      'zone-edge faint': { color: '#ffffff', weight: 1, opacity: 0.2, fill: false, dashArray: '2 8' },
      'zone-safe': { color: '#ffb300', weight: 4, opacity: 0.95, fillColor: '#ffb300', fillOpacity: 0.06 },
      'zone-next': { color: '#ffffff', weight: 2, opacity: 0.85, fill: false, dashArray: '10 8' },
      std: { color: '#ff5a1f', weight: 2, fillColor: '#ff3d00', fillOpacity: 0.18 },
      rain: { color: '#ff9a1f', weight: 2, fillColor: '#ff7a00', fillOpacity: 0.2, dashArray: '4 4' },
      giant: { color: '#ff1f1f', weight: 4, fillColor: '#ff0000', fillOpacity: 0.22 },
      blast: { color: '#fff3b0', weight: 0, fillColor: '#fff3b0', fillOpacity: 0.55 },
      shelter: { color: '#3ddc97', weight: 3, fillColor: '#3ddc97', fillOpacity: 0.15 },
      'extract-zone': { color: '#3dff88', weight: 3, fillColor: '#3dff88', fillOpacity: 0.2, dashArray: '6 6' },
      'base-ring': { color: m.color || '#fff', weight: 2, fillColor: m.color || '#fff', fillOpacity: 0.1, dashArray: '4 6' },
      intel: { color: '#c4002f', weight: 2, fillColor: '#c4002f', fillOpacity: 0.1, dashArray: '3 6' },
      'rdv-zone': { color: '#e8d6a8', weight: 3, fillColor: '#c4002f', fillOpacity: 0.25 },
    };
    return map[m.cls] || { color: '#fff', weight: 2, fillOpacity: 0.1 };
  }

  function syncMarkers(markers) {
    const seen = new Set();
    for (const m of markers) {
      if (m.lat == null || m.lng == null) continue;
      const key = m.id + ':' + (m.type === 'circle' || m.type === 'impact' ? 'c' : 'm');
      seen.add(key);
      let L1 = layers.get(key);
      if (m.type === 'circle') {
        const st = circleStyle(m);
        if (!L1) { L1 = { layer: L.circle([m.lat, m.lng], { radius: m.r, interactive: false, ...st }).addTo(gameMap), cls: m.cls }; layers.set(key, L1); }
        else {
          L1.layer.setLatLng([m.lat, m.lng]);
          L1.layer.setRadius(m.r);
          if (L1.cls !== m.cls) { L1.layer.setStyle(st); L1.cls = m.cls; }
        }
        continue;
      }
      if (m.type === 'impact') {
        // Cercle extérieur + remplissage qui grandit jusqu'à l'impact.
        const st = circleStyle(m);
        const prog = m.cls === 'blast' ? 1 : Math.max(0.02, Math.min(1, 1 - (m.at - serverNow()) / m.total));
        if (!L1) {
          L1 = {
            outer: L.circle([m.lat, m.lng], { radius: m.r, interactive: false, ...st, fillOpacity: 0.05 }).addTo(gameMap),
            inner: L.circle([m.lat, m.lng], { radius: m.r * prog, interactive: false, stroke: false, fillColor: st.fillColor, fillOpacity: 0.35 }).addTo(gameMap),
            label: L.marker([m.lat, m.lng], { interactive: false, icon: L.divIcon({ className: '', html: iconHtml(m), iconSize: [60, 40] }) }).addTo(gameMap),
            cls: m.cls,
            lastLabel: m.label,
          };
          layers.set(key, L1);
        } else {
          L1.inner.setRadius(m.r * prog);
          if (L1.cls !== m.cls) { L1.outer.setStyle(circleStyle(m)); L1.inner.setStyle({ fillColor: circleStyle(m).fillColor, fillOpacity: 0.6 }); L1.cls = m.cls; }
          if (L1.lastLabel !== m.label) { L1.label.setIcon(L.divIcon({ className: '', html: iconHtml(m), iconSize: [60, 40] })); L1.lastLabel = m.label; }
        }
        continue;
      }
      const html = iconHtml(m);
      const sz = SIZES[m.type] || 30;
      if (!L1) {
        const mk = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: m.type === 'me' ? '' : 'smooth', html, iconSize: [sz, sz] }), interactive: false, zIndexOffset: m.type === 'me' ? 1000 : m.type === 'creature' ? 500 : 0 }).addTo(gameMap);
        L1 = { layer: mk, html };
        layers.set(key, L1);
      } else {
        L1.layer.setLatLng([m.lat, m.lng]);
        if (L1.html !== html) { L1.layer.setIcon(L.divIcon({ className: m.type === 'me' ? '' : 'smooth', html, iconSize: [sz, sz] })); L1.html = html; }
      }
    }
    for (const [key, L1] of layers) {
      if (seen.has(key)) continue;
      for (const l of [L1.layer, L1.outer, L1.inner, L1.label]) if (l) gameMap.removeLayer(l);
      layers.delete(key);
    }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function tickTimer() {
    const v = S.view;
    const el = $('#timer');
    if (!v || !el || !v.hud) return;
    const now = serverNow();
    if (now < v.startAt) { el.textContent = fmt((v.startAt - now) / 1000); el.classList.remove('low'); return; }
    if (v.hud.ends) {
      const left = (v.hud.ends - now) / 1000;
      el.textContent = fmt(left);
      el.classList.toggle('low', left < 60);
    } else if (v.hud.elapsedFrom) {
      el.textContent = fmt((now - v.hud.elapsedFrom) / 1000);
      el.classList.remove('low');
    }
  }
  setInterval(tickTimer, 250);

  function updateGame() {
    const v = S.view;
    if (!v || S.screen !== 'game' || !gameMap) return;
    const hud = v.hud || {};
    if (v.team) $('#hsub').innerHTML = `<span style="color:${v.team.color};font-weight:800">● Équipe ${esc(v.team.name)}</span>${hud.sub ? ' · ' + esc(hud.sub) : ''}`;
    else $('#hsub').textContent = hud.sub || INFO[v.game].tag;
    // Puces.
    $('#chips').innerHTML = (hud.chips || []).map((c, i) => {
      const key = c.label;
      const bump = lastChips[key] != null && lastChips[key] !== c.value ? 'bump' : '';
      lastChips[key] = c.value;
      return `<div class="chip ${c.color ? 'team' : ''} ${bump}" style="${c.color ? `--c:${c.color}` : ''}"><span>${esc(c.icon || '')} ${esc(c.label)}</span><b>${esc(c.value)}</b>${c.bar != null ? `<i class="bar" style="width:${Math.max(0, Math.min(100, c.bar * 100))}%"></i>` : ''}</div>`;
    }).join('');
    const st = $('#status');
    if (hud.status) { st.hidden = false; st.className = `status ${hud.status.cls || ''}`; st.textContent = hud.status.text; }
    else st.hidden = true;
    // Fil d'actualité.
    const feedEl = $('#feed');
    const known = new Set([...feedEl.children].map((c) => c.dataset.id));
    for (const f of (v.feed || [])) {
      if (known.has(String(f.id)) || serverNow() - f.at > 8000) continue;
      const d = document.createElement('div');
      d.dataset.id = f.id;
      d.className = f.kind;
      d.textContent = f.msg;
      feedEl.appendChild(d);
      setTimeout(() => d.remove(), 8200);
    }
    while (feedEl.children.length > 4) feedEl.firstChild.remove();
    // Carte.
    syncMarkers(v.markers || []);
    centerMe();
    // Actions.
    const acts = v.actions || [];
    const sig = JSON.stringify(acts.map((a) => [a.id, a.key, a.label, a.enabled, a.choices && a.choices.length]));
    if ($('#actions').dataset.sig !== sig) {
      $('#actions').dataset.sig = sig;
      $('#actions').innerHTML = acts.map((a, i) => `<button class="act ${a.big ? 'big' : ''}" data-i="${i}" ${a.enabled === false ? 'disabled' : ''}><span class="ic">${esc(a.icon || '')}</span><span>${esc(a.label)}${a.hint && !a.big ? `<small>${esc(a.hint)}</small>` : ''}</span></button>`).join('');
    }
    // Panneau.
    renderPanel(v.panel);
    // Sons continus.
    const au = v.audio || {};
    Sound.set('geiger', au.geiger || 0);
    Sound.set('growl', au.growl || 0);
    Sound.set('heart', au.heart || 0);
    document.body.classList.toggle('danger', !!v.danger);
    gpsTag();
    // Fin de partie.
    if (v.over && S.resultsShownFor !== v.over.at) {
      S.resultsShownFor = v.over.at;
      setTimeout(() => showResults(v), 900);
    }
  }

  function renderPanel(p) {
    const el = $('#panel');
    if (!p) { if (el.dataset.kind) { el.innerHTML = ''; el.dataset.kind = ''; } return; }
    if (p.kind === 'geiger') {
      if (el.dataset.kind !== 'geiger') {
        el.dataset.kind = 'geiger';
        const ticks = Array.from({ length: 11 }, (_, i) => { const a = (-120 + i * 24) * Math.PI / 180; return `<line x1="${100 + Math.sin(a) * 78}" y1="${100 - Math.cos(a) * 78}" x2="${100 + Math.sin(a) * 88}" y2="${100 - Math.cos(a) * 88}" stroke="#7dff6a" stroke-width="${i % 5 === 0 ? 3 : 1.5}"/>`; }).join('');
        el.innerHTML = `<div class="geiger">
          <svg class="gauge" viewBox="0 0 200 120"><path d="M24 100a76 76 0 0 1 152 0" fill="none" stroke="#1e4a18" stroke-width="10"/><path d="M140 37a76 76 0 0 1 36 63" fill="none" stroke="#ff4d4d" stroke-width="10" opacity=".7"/>${ticks}<text x="100" y="74" text-anchor="middle" fill="#7dff6a" font-size="10" font-family="monospace" opacity=".6">CPS</text><g class="needle"><line x1="100" y1="100" x2="100" y2="26" stroke="#d6ffcf" stroke-width="3" stroke-linecap="round"/></g><circle cx="100" cy="100" r="7" fill="#7dff6a"/></svg>
          <div class="readout"><span>DOSE</span><b id="usv">0.00</b><span>µSv/h</span><div class="cps" id="cps"></div></div>
          <div class="xbar" id="xbar" hidden><i></i></div></div>`;
      }
      const ang = -120 + Math.min(240, (Math.log10(1 + p.cps) / Math.log10(61)) * 240 + (Math.random() - 0.5) * 6);
      $('.needle', el).style.transform = `rotate(${ang}deg)`;
      $('#usv', el).textContent = p.usv;
      $('#cps', el).textContent = `${p.cps.toFixed(1)} cps`;
      const xb = $('#xbar', el);
      xb.hidden = p.extracting == null;
      if (p.extracting != null) $('i', xb).style.width = `${Math.round(p.extracting * 100)}%`;
      return;
    }
    if (p.kind === 'compass') {
      if (el.dataset.kind !== 'compass') {
        el.dataset.kind = 'compass';
        el.innerHTML = `<div class="compass-wrap">
          <div class="compass" id="cmp">
            <svg class="rose" viewBox="0 0 200 200"><circle cx="100" cy="100" r="94" fill="rgba(0,0,0,.35)" stroke="rgba(255,176,0,.5)" stroke-width="2"/>${Array.from({ length: 36 }, (_, i) => `<line x1="100" y1="${i % 9 === 0 ? 12 : 8}" x2="100" y2="${i % 9 === 0 ? 26 : 16}" stroke="rgba(255,210,140,.6)" stroke-width="${i % 9 === 0 ? 3 : 1}" transform="rotate(${i * 10} 100 100)"/>`).join('')}<text x="100" y="44" text-anchor="middle" fill="#ff5a3d" font-weight="900" font-size="16" font-family="sans-serif">N</text></svg>
            <svg class="arrow" viewBox="0 0 200 200"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ffb000"/><stop offset="1" stop-color="#ff3d00"/></linearGradient></defs><path d="M100 30 128 120 100 104 72 120Z" fill="url(#ag)" stroke="#fff" stroke-width="2"/><circle cx="100" cy="100" r="8" fill="#fff"/></svg>
          </div>
          <div class="band" id="band"></div><div class="heat" id="heat">${'<i></i>'.repeat(5)}</div><p class="band-sub" id="bsub"></p></div>`;
      }
      const head = S.heading != null ? S.heading : null;
      const rel = head != null ? p.bearing - head : p.bearing;
      $('.arrow', el).style.transform = `rotate(${rel}deg)`;
      $('.rose', el).style.transform = `rotate(${head != null ? -head : 0}deg)`;
      $('#cmp', el).classList.toggle('hot', p.inRange);
      $('#band', el).textContent = p.inRange ? '🎯 À PORTÉE !' : p.band;
      [...$('#heat', el).children].forEach((h, i) => h.classList.toggle('on', i <= p.heat));
      $('#bsub', el).textContent = p.grace ? 'Dispersion en cours : éloigne-toi des autres' : head != null ? 'La flèche pointe vers ta cible' : 'Boussole indisponible : la flèche est orientée nord en haut';
    }
  }

  function gpsTag() {
    const el = $('#gps');
    if (!el) return;
    if (S.manual) { el.textContent = '🧪 mode test : touche la carte'; el.className = 'gps-tag'; return; }
    if (S.pos) { el.textContent = `📍 GPS ±${Math.round(S.pos.acc)} m`; el.className = 'gps-tag' + (S.pos.acc > 30 ? ' bad' : ''); }
    else { el.textContent = S.geoErr ? `⚠️ ${S.geoErr}` : '⌛ recherche GPS…'; el.className = 'gps-tag bad'; }
  }

  function openMenu() {
    const host = isHost();
    sheet(`<h2>${esc(INFO[S.view.game].name)}</h2>
      <ol class="rules">${INFO[S.view.game].rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <label class="row hint" style="justify-content:flex-start;gap:8px;text-align:left"><input type="checkbox" id="manual2" ${S.manual ? 'checked' : ''} style="flex:none;width:20px;height:20px;accent-color:var(--accent)"> Mode test : je touche la carte pour me déplacer</label>
      ${host ? '<button class="btn btn-ghost btn-block" id="endg">⏹ Arrêter la partie (retour au salon)</button>' : ''}
      <button class="btn btn-ghost btn-block" id="leaveg">Quitter la partie</button>
      <button class="btn btn-primary btn-block" data-close>Reprendre</button>`, (el) => {
      el.querySelector('#manual2').onchange = (e) => { S.manual = e.target.checked; store.set('nl-manual', S.manual ? '1' : '0'); gpsTag(); };
      if (host) el.querySelector('#endg').onclick = () => { send({ t: 'end' }); closeSheet(); };
      el.querySelector('#leaveg').onclick = () => { send({ t: 'leave' }); closeSheet(); };
    });
  }

  // ---------- Effets ----------
  function handleFx(fx) {
    if (fx.s) Sound.play(fx.s);
    if (fx.v) Sound.vibrate(fx.v);
    if (fx.m) toast(fx.m, fx.k === 'score' ? 'score' : fx.k);
    if (fx.shake) {
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 500);
    }
    if (fx.s === 'boom' || fx.s === 'hit') {
      const f = document.createElement('div');
      f.className = 'flash';
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 520);
    }
  }
  function toast(msg, kind = 'info') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind || ''}`;
    t.textContent = msg;
    const life = kind === 'score' ? 1200 : 3400;
    t.style.animationDuration = `.35s, .4s`;
    t.style.animationDelay = `0s, ${life / 1000}s`;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), life + 450);
  }

  function sheet(html, init) {
    const o = $('#overlay');
    o.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
    o.onclick = (e) => { if (e.target === o || e.target.closest('[data-close]')) closeSheet(); };
    if (init) init(o.querySelector('.sheet'));
  }
  function closeSheet() { $('#overlay').innerHTML = ''; }

  function showCountdown(until) {
    const o = $('#overlay');
    const step = () => {
      const left = Math.ceil((until - serverNow()) / 1000);
      if (left > 3) { setTimeout(step, 100); return; }
      if (left >= 1) {
        o.innerHTML = `<div style="display:grid;gap:10px;justify-items:center"><div class="countdown" style="animation:none"></div></div>`;
        o.innerHTML = `<div style="display:grid;gap:10px;justify-items:center"><div class="countdown">${left}</div><div class="cd-sub">${esc(INFO[S.room.selected] ? INFO[S.room.selected].name : '')}</div></div>`;
        Sound.play('count');
        Sound.vibrate(60);
        setTimeout(step, Math.max(50, until - serverNow() - (left - 1) * 1000));
      } else {
        o.innerHTML = '<div class="countdown go">GO !</div>';
        Sound.play('go');
        Sound.vibrate([100, 50, 200]);
        setTimeout(() => { if (o.querySelector('.countdown')) o.innerHTML = ''; }, 800);
      }
    };
    step();
  }

  function showResults(v) {
    const o = v.over;
    const iWin = o.winners && o.winners.includes(S.pid);
    const draw = !o.winners || o.winners.length === 0;
    const r = o.ranking || [];
    const podium = [r[1], r[0], r[2]].map((p, i) => p ? `<div class="step p${[2, 1, 3][i]}"><div class="av" style="--c:${p.color}">${esc(p.name.slice(0, 1).toUpperCase())}</div><div class="nm">${esc(p.name)}</div><div class="sc">${esc(p.score)} ${esc(o.unit || '')}</div><div class="blk">${[2, 1, 3][i]}</div></div>` : '<div></div>').join('');
    const teams = o.teams ? `<div class="teams-res">${o.teams.map((t) => `<div style="--c:${t.color}"><span class="label">${esc(t.name)}</span><b>${esc(t.score)}</b></div>`).join('')}</div>` : '';
    const host = isHost();
    $('#overlay').innerHTML = `<div class="results">
      <div class="verdict ${iWin ? 'win' : draw ? '' : 'lose'}">${o.coop ? (o.success ? (iWin ? 'Survivant' : 'Mission réussie') : 'Mission échouée') : iWin ? 'Victoire' : draw ? 'Fin de partie' : 'Défaite'}</div>
      <h2>${esc(o.title)}</h2>
      ${teams}
      ${o.teams ? '' : `<div class="podium">${podium}</div>`}
      <div class="rank">${r.map((p, i) => `<div class="${p.id === S.pid ? 'me' : ''}"><b class="mono">${i + 1}</b><i style="--c:${p.color}"></i><span class="n">${esc(p.name)}${p.detail ? `<br><span class="d">${esc(p.detail)}</span>` : ''}</span><span class="s">${esc(p.score)} ${esc(o.unit || '')}</span></div>`).join('')}</div>
      ${host ? `<div class="row"><button class="btn btn-ghost" id="lob">Salon</button><button class="btn btn-primary" id="again">↻ Rejouer</button></div>` : '<p class="hint">L’hôte peut relancer une partie.</p><button class="btn btn-ghost btn-block" id="close">Voir la carte</button>'}
    </div>`;
    if (host) {
      $('#again').onclick = () => { Sound.play('tap'); $('#overlay').innerHTML = ''; send({ t: 'start', game: S.room.selected, opts: S.room.gameOpts }); };
      $('#lob').onclick = () => { Sound.play('tap'); $('#overlay').innerHTML = ''; send({ t: 'end' }); };
    } else $('#close').onclick = () => { $('#overlay').innerHTML = ''; };
    if (iWin || (o.coop && o.success)) confetti();
  }

  function confetti() {
    const c = document.createElement('canvas');
    c.id = 'confetti';
    c.width = innerWidth * devicePixelRatio;
    c.height = innerHeight * devicePixelRatio;
    c.style.width = '100%';
    c.style.height = '100%';
    document.body.appendChild(c);
    const g = c.getContext('2d');
    const cols = ['#ff3cac', '#2bd2ff', '#ffd36b', '#3ddc97', '#c77dff', '#fff'];
    const parts = Array.from({ length: 160 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5, r: Math.random() * 6, s: (4 + Math.random() * 6) * devicePixelRatio, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
    let n = 0;
    (function frame() {
      g.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy * devicePixelRatio; p.a += 0.1; p.vy += 0.03;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
      }
      if (++n < 260) requestAnimationFrame(frame); else c.remove();
    })();
  }

  connect();
  route();
  startGeo();
  document.addEventListener('pointerdown', gesture, { passive: true });
})();
