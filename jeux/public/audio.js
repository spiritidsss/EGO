// Sons synthétisés (aucun fichier) et vibrations.
(function () {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('nl-muted') === '1'; } catch {}

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, { vol = 0.3, at = 0, freq = 1000, q = 0.7, type = 'lowpass', sweep = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  const SFX = {
    tap: () => tone(880, 0.06, { type: 'triangle', vol: 0.12 }),
    pickup: () => { tone(988, 0.08, { type: 'triangle', vol: 0.25 }); tone(1318, 0.12, { type: 'triangle', vol: 0.25, at: 0.06 }); },
    rare: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, at: i * 0.06 })),
    power: () => { tone(440, 0.25, { type: 'sawtooth', vol: 0.12, slide: 3 }); tone(660, 0.2, { type: 'sine', vol: 0.15, at: 0.1, slide: 2 }); },
    wave: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.15, at: i * 0.09 })),
    nope: () => { tone(220, 0.12, { type: 'square', vol: 0.12 }); tone(180, 0.18, { type: 'square', vol: 0.12, at: 0.1 }); },
    warn: () => { tone(880, 0.09, { type: 'square', vol: 0.1 }); tone(880, 0.09, { type: 'square', vol: 0.1, at: 0.15 }); },
    alarm: () => { for (let i = 0; i < 3; i++) { tone(960, 0.14, { type: 'sawtooth', vol: 0.15, at: i * 0.3 }); tone(720, 0.14, { type: 'sawtooth', vol: 0.15, at: i * 0.3 + 0.15 }); } },
    hit: () => { noise(0.35, { vol: 0.6, freq: 600, sweep: 0.2 }); tone(120, 0.3, { type: 'sine', vol: 0.5, slide: 0.4 }); },
    boom: () => { noise(1.2, { vol: 0.7, freq: 900, sweep: 0.05 }); tone(70, 0.9, { type: 'sine', vol: 0.6, slide: 0.5 }); },
    dead: () => { tone(400, 0.9, { type: 'sawtooth', vol: 0.2, slide: 0.2 }); noise(0.8, { vol: 0.4, freq: 400, sweep: 0.2 }); },
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', vol: 0.22, at: i * 0.12 })),
    lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, { type: 'sine', vol: 0.2, at: i * 0.2 })),
    freeze: () => { noise(0.6, { vol: 0.3, freq: 6000, type: 'highpass' }); tone(1760, 0.5, { type: 'sine', vol: 0.1, slide: 0.5 }); },
    steal: () => { tone(600, 0.1, { type: 'square', vol: 0.12 }); tone(300, 0.25, { type: 'square', vol: 0.12, at: 0.08, slide: 0.5 }); },
    heal: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.2, { vol: 0.18, at: i * 0.08 })),
    shield: () => tone(330, 0.5, { type: 'triangle', vol: 0.2, slide: 2 }),
    trap: () => { tone(1200, 0.05, { type: 'square', vol: 0.2 }); noise(0.4, { vol: 0.5, freq: 1500, sweep: 0.3, at: 0.05 }); },
    burn: () => noise(0.25, { vol: 0.25, freq: 3000, type: 'bandpass', q: 2 }),
    battery: () => [440, 554, 659, 880].forEach((f, i) => tone(f, 0.15, { type: 'square', vol: 0.1, at: i * 0.07 })),
    roar: () => { noise(0.8, { vol: 0.5, freq: 300, q: 4, type: 'bandpass', sweep: 0.6 }); tone(90, 0.8, { type: 'sawtooth', vol: 0.25, slide: 0.7 }); },
    scream: () => { tone(1400, 0.6, { type: 'sawtooth', vol: 0.12, slide: 0.6 }); noise(0.6, { vol: 0.25, freq: 2500, q: 3, type: 'bandpass' }); },
    stalker: () => { tone(55, 1.6, { type: 'sawtooth', vol: 0.35, slide: 0.8, attack: 0.3 }); tone(58, 1.6, { type: 'sawtooth', vol: 0.3, attack: 0.3 }); },
    relief: () => tone(523, 0.4, { type: 'sine', vol: 0.15, slide: 1.5 }),
    flare: () => { noise(0.8, { vol: 0.4, freq: 4000, type: 'highpass' }); tone(200, 0.6, { type: 'sine', vol: 0.2, slide: 4 }); },
    grab: () => [659, 784, 988].forEach((f, i) => tone(f, 0.15, { type: 'square', vol: 0.12, at: i * 0.07 })),
    drop: () => tone(500, 0.3, { type: 'triangle', vol: 0.2, slide: 0.4 }),
    tag: () => { tone(300, 0.08, { type: 'square', vol: 0.2 }); noise(0.1, { vol: 0.3, freq: 2000 }); },
    extract: () => { for (let i = 0; i < 12; i++) noise(0.02, { vol: 0.5, freq: 4000, type: 'highpass', at: i * 0.04 }); tone(220, 0.6, { type: 'sine', vol: 0.2, at: 0.5, slide: 2 }); },
    capture: () => { tone(200, 0.1, { type: 'square', vol: 0.2 }); [523, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.2, at: 0.1 + i * 0.08 })); },
    heart: () => { tone(60, 0.12, { vol: 0.6 }); tone(55, 0.14, { vol: 0.5, at: 0.18 }); },
    radio: () => { noise(0.25, { vol: 0.3, freq: 1800, q: 1.5, type: 'bandpass' }); tone(1200, 0.08, { type: 'square', vol: 0.08, at: 0.27 }); tone(1600, 0.08, { type: 'square', vol: 0.08, at: 0.38 }); },
    mission: () => { SFX.radio(); [392, 523, 659].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.15, at: 0.5 + i * 0.1 })); },
    count: () => tone(660, 0.18, { type: 'square', vol: 0.15 }),
    go: () => { tone(1320, 0.5, { type: 'square', vol: 0.15 }); noise(0.4, { vol: 0.2, freq: 3000, type: 'highpass' }); },
  };

  // Boucles continues pilotées par la vue : compteur Geiger, grognements, battements.
  const loops = { geiger: 0, growl: 0, heart: 0 };
  let growlNode = null;
  let lastHeart = 0;
  setInterval(() => {
    if (!ctx || muted) return;
    const dt = 0.05;
    if (loops.geiger > 0) {
      const n = loops.geiger * dt;
      let k = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const at = Math.random() * dt;
        noise(0.006, { vol: 0.9, freq: 3500, type: 'highpass', at });
        if (loops.geiger > 8 && navigator.vibrate && Math.random() < 0.15) navigator.vibrate(8);
      }
    }
    if (loops.heart > 0.05) {
      const period = 1100 - loops.heart * 650;
      if (performance.now() - lastHeart > period) {
        lastHeart = performance.now();
        tone(55, 0.12, { vol: 0.25 + loops.heart * 0.4 });
        tone(50, 0.14, { vol: 0.2 + loops.heart * 0.35, at: 0.17 });
        if (navigator.vibrate && loops.heart > 0.4) navigator.vibrate([40, 120, 40]);
      }
    }
    // Grognement : bruit filtré grave modulé.
    if (loops.growl > 0.02) {
      if (!growlNode) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 140;
        f.Q.value = 6;
        const g = ctx.createGain();
        g.gain.value = 0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 3.2;
        const lg = ctx.createGain();
        lg.gain.value = 60;
        lfo.connect(lg).connect(f.frequency);
        lfo.start();
        s.connect(f).connect(g).connect(master);
        s.start();
        growlNode = { s, g, lfo };
      }
      growlNode.g.gain.setTargetAtTime(loops.growl * 1.6, ctx.currentTime, 0.3);
      growlNode.lfo.frequency.setTargetAtTime(2 + loops.growl * 5, ctx.currentTime, 0.5);
      if (loops.growl > 0.6 && navigator.vibrate && Math.random() < 0.04) navigator.vibrate([60, 40, 90]);
    } else if (growlNode) {
      growlNode.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    }
  }, 50);

  window.Sound = {
    unlock,
    play(name) { if (!muted && SFX[name]) { try { SFX[name](); } catch {} } },
    vibrate(p) { if (p && navigator.vibrate) { try { navigator.vibrate(p); } catch {} } },
    set(k, v) { loops[k] = v || 0; },
    stopLoops() { loops.geiger = 0; loops.growl = 0; loops.heart = 0; },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('nl-muted', muted ? '1' : '0'); } catch {}
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
  };
})();
