'use strict';
// Geräusche, live mit der Web-Audio-API erzeugt (keine Sounddateien nötig)
(function () {
  const U = G.U;
  const A = (G.Audio = { enabled: true, volume: 0.7 });
  let ctx = null, master = null, noiseBuf = null;
  let rainGain = null, windGain = null;

  A.unlock = () => {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch (e) {
      return;
    }
    master = ctx.createGain();
    master.gain.value = A.enabled ? A.volume : 0;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Dauergeräusche: Regen und Wind
    const loop = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return g;
    };
    rainGain = loop('lowpass', 1400, 0.4);
    windGain = loop('bandpass', 380, 0.8);
  };

  A.setEnabled = (on) => {
    A.enabled = on;
    if (master) master.gain.value = on ? A.volume : 0;
  };

  A.setAmbience = (rain, wind) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    rainGain.gain.setTargetAtTime(rain * 0.22, t, 0.5);
    windGain.gain.setTargetAtTime(wind * (0.12 + 0.06 * Math.sin(t * 0.7)), t, 0.8);
  };

  function noise(dur, type, f0, f1, vol, q = 1, delay = 0) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  function tone(dur, wave, f0, f1, vol, delay = 0, lp = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = g.connect(f);
      f.connect(master);
    } else g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const STEP = {
    grass: ['lowpass', 900, 300, 0.25],
    stone: ['bandpass', 1800, 900, 0.3],
    sand: ['highpass', 2400, 1800, 0.12],
    wood: ['bandpass', 500, 260, 0.35],
    snow: ['bandpass', 3000, 1500, 0.15],
    water: ['bandpass', 900, 500, 0.15],
  };

  // name, Position (für Lautstärke nach Entfernung), Lautstärke, Optionen
  A.play = (name, pos, vol = 1, opt = {}) => {
    if (!ctx || !A.enabled) return;
    if (pos && G.Player && G.Player.pos) {
      const d = pos.distanceTo(G.Player.pos);
      vol *= U.clamp(1 - d / 40, 0, 1);
      if (vol <= 0.01) return;
    }
    const v = vol;
    switch (name) {
      case 'step': {
        const s = STEP[opt.surface] || STEP.grass;
        noise(0.09, s[0], s[1] * U.rand(0.85, 1.15), s[2], s[3] * v, 0.8);
        if (opt.surface === 'wood') tone(0.06, 'sine', 160, 90, 0.12 * v);
        break;
      }
      case 'break':
        noise(0.18, 'lowpass', 2500, 300, 0.45 * v, 0.7);
        noise(0.12, 'bandpass', 900, 400, 0.25 * v, 2, 0.04);
        break;
      case 'dig':
        noise(0.06, 'bandpass', 1300, 700, 0.18 * v, 1.2);
        break;
      case 'place':
        tone(0.09, 'sine', 190, 80, 0.35 * v);
        noise(0.06, 'lowpass', 1200, 400, 0.2 * v);
        break;
      case 'hurt':
        tone(0.16, 'sawtooth', 340, 150, 0.22 * v, 0, 1400);
        tone(0.12, 'square', 220, 110, 0.08 * v, 0.02, 900);
        break;
      case 'hitMob':
        noise(0.08, 'lowpass', 1500, 300, 0.4 * v);
        tone(0.15, 'sawtooth', 160, 90, 0.15 * v, 0, 800);
        break;
      case 'hitAnimal':
        noise(0.07, 'lowpass', 1500, 300, 0.35 * v);
        tone(0.14, 'triangle', 700, 950, 0.15 * v);
        break;
      case 'swing':
        noise(0.12, 'bandpass', 600, 2400, 0.12 * v, 1.5);
        break;
      case 'mobDie':
        tone(0.35, 'square', 300, 70, 0.12 * v, 0, 900);
        break;
      case 'pickup':
        tone(0.08, 'sine', 700, 1300, 0.18 * v);
        break;
      case 'gold':
        [880, 1175, 1568].forEach((f, i) => tone(0.18, 'triangle', f, f * 1.01, 0.12 * v, i * 0.07));
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) noise(0.07, 'bandpass', 1600, 900, 0.25 * v, 1.5, i * 0.12);
        break;
      case 'groan':
        tone(0.6, 'sawtooth', 95, 70, 0.12 * v, 0, 500);
        break;
      case 'bow':
        tone(0.15, 'triangle', 260, 120, 0.2 * v);
        break;
      case 'arrowHit':
        noise(0.05, 'bandpass', 2500, 1500, 0.2 * v, 2);
        break;
      case 'fuse':
        noise(1.5, 'highpass', 3000, 5000, 0.18 * v, 0.5);
        break;
      case 'boom':
        noise(1.4, 'lowpass', 900, 60, 0.9 * v, 0.5);
        tone(0.9, 'sine', 70, 30, 0.6 * v);
        break;
      case 'thunder':
        noise(0.15, 'highpass', 2500, 1200, 0.35 * v, 0.5);
        noise(3.2, 'lowpass', 420, 50, 0.85 * v, 0.6, 0.05);
        noise(2.2, 'lowpass', 200, 40, 0.6 * v, 0.6, 0.6);
        break;
      case 'click':
        tone(0.04, 'square', 900, 700, 0.06 * v);
        break;
      case 'craft':
        tone(0.08, 'triangle', 520, 520, 0.15 * v);
        tone(0.12, 'triangle', 780, 780, 0.15 * v, 0.08);
        break;
      case 'chest':
        tone(0.35, 'sawtooth', 110, 190, 0.08 * v, 0, 700);
        break;
      case 'splash':
        noise(0.35, 'bandpass', 1200, 400, 0.3 * v, 0.7);
        break;
      case 'sleep':
        [523, 659, 784].forEach((f, i) => tone(0.4, 'sine', f, f, 0.1 * v, i * 0.15));
        break;
      default:
        break;
    }
  };
})();
