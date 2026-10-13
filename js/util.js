'use strict';
// Gemeinsamer Namensraum für alle Spielmodule
window.G = window.G || {};

(function () {
  const U = (G.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Kleinster Winkelunterschied (-PI..PI)
  U.angleDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.approachAngle = (cur, target, maxStep) => {
    const d = U.angleDiff(cur, target);
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
  };

  // Deterministischer Zufallsgenerator (für die Weltgenerierung)
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.hashString = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  U.hash2 = (x, z, s) => {
    let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // 2D-Simplex-Rauschen (nach Stefan Gustavson)
  const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  U.Simplex = class {
    constructor(rand) {
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = p[i];
        p[i] = p[j];
        p[j] = t;
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    noise2(xin, yin) {
      const perm = this.perm;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t);
      const y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) {
        const g = GRAD[perm[ii + perm[jj]] & 7];
        t0 *= t0;
        n += t0 * t0 * (g[0] * x0 + g[1] * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) {
        const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7];
        t1 *= t1;
        n += t1 * t1 * (g[0] * x1 + g[1] * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) {
        const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7];
        t2 *= t2;
        n += t2 * t2 * (g[0] * x2 + g[1] * y2);
      }
      return 70 * n;
    }
  };

  // Fraktales Rauschen, Ergebnis ungefähr -1..1
  U.fbm = (noise, x, y, octaves, lac = 2, gain = 0.5) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  };

  // Hilfsfunktionen für Pixel-Texturen auf Canvas
  U.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // Wartet auf den nächsten Frame (oder kurz, falls der Tab im Hintergrund ist)
  U.nextFrame = () =>
    new Promise((r) => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(fin);
      setTimeout(fin, 60);
    });
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  U.isTouch = () =>
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches);

  // Speicher (localStorage kann in manchen Umgebungen fehlen)
  U.store = {
    get(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) { /* ignorieren */ }
    },
  };

  U.hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.shadeHex = (hex, f) => {
    const [r, g, b] = U.hexToRgb(hex);
    return U.rgbToHex(r * f, g * f, b * f);
  };
})();
