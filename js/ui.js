'use strict';
// Benutzeroberfläche: Anzeigen, Karte, Inventar, Truhen, Menüs, Figuren-Editor, Touch
(function () {
  const U = G.U, B = G.B, ID = B.ID, I = G.Items, World = G.World;
  const UI = (G.UI = {});
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Pixel-Icons für Herzen und Wetter
  // ---------------------------------------------------------------------------
  function pixelURL(rows, pal, scale = 2) {
    const h = rows.length, w = rows[0].length;
    const c = U.canvas(w * scale, h * scale);
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x * scale, y * scale, scale, scale); }
    }));
    return c.toDataURL();
  }
  const HEART = [
    '.XX...XX.',
    'XrrX.XrrX',
    'XrwrXrrrX',
    'XrrrrrrrX',
    'XrrrrrrrX',
    '.XrrrrrX.',
    '..XrrrX..',
    '...XrX...',
    '....X....',
  ];
  const halfHeart = HEART.map((r) => [...r].map((ch, x) => (x > 4 && (ch === 'r' || ch === 'w') ? 'e' : ch)).join(''));
  const ICON = {
    heart: pixelURL(HEART, { X: '#2a0607', r: '#e2363b', w: '#ffc9c9' }),
    half: pixelURL(halfHeart, { X: '#2a0607', r: '#e2363b', w: '#ffc9c9', e: '#4a2a2c' }),
    empty: pixelURL(HEART.map((r) => r.replace(/[rw]/g, 'e')), { X: '#2a0607', e: '#4a2a2c' }),
    sun: pixelURL(['..y..y..', '...yy...', '.yYYYYy.', 'yyYYYYyy', 'yyYYYYyy', '.yYYYYy.', '...yy...', '..y..y..'], { y: '#f2c14e', Y: '#fff1a8' }, 3),
    moon: pixelURL(['..mmm...', '.mmMm...', 'mmM.....', 'mmM.....', 'mmM.....', 'mmMm..m.', '.mmmMmm.', '..mmmm..'], { m: '#c9cde0', M: '#ffffff' }, 3),
    rain: pixelURL(['..gggg..', '.gGGGGg.', 'gGGGGGGg', 'gggggggg', '........', '.b..b..b', 'b..b..b.', '........'], { g: '#8a93a8', G: '#c3c9d6', b: '#6fa4ff' }, 3),
    storm: pixelURL(['..gggg..', '.gGGGGg.', 'gGGGGGGg', 'ggggyggg', '...yy...', '..yy....', '...y....', '..y.....'], { g: '#5c6373', G: '#8a93a8', y: '#ffe066' }, 3),
    snow: pixelURL(['...w....', '.w.w.w..', '..www...', 'wwwwwww.', '..www...', '.w.w.w..', '...w....', '........'], { w: '#ffffff' }, 3),
  };

  // ---------------------------------------------------------------------------
  // Anzeigen
  // ---------------------------------------------------------------------------
  UI.init = () => {
    $('hud-gold-icon').src = I.iconURL(I.ID.GOLD);
    // Schnellleiste
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('button');
      s.className = 'slot';
      s.dataset.i = i;
      s.setAttribute('aria-label', 'Platz ' + (i + 1));
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        UI.selectSlot(i);
      });
      hb.appendChild(s);
    }
    const hearts = $('hearts');
    for (let i = 0; i < 10; i++) hearts.appendChild(document.createElement('img'));
    $('minimap').addEventListener('click', () => UI.openMap());
    setupScreens();
    setupInventory();
    setupCreator();
    setupTouch();
  };

  UI.selectSlot = (i) => {
    G.Player.sel = i;
    UI.renderHotbar();
    const s = G.Player.held();
    const hn = $('held-name');
    hn.textContent = s ? I.name(s.id) : '';
    hn.style.opacity = 1;
    clearTimeout(UI._hnT);
    UI._hnT = setTimeout(() => (hn.style.opacity = 0), 1800);
  };

  function fillSlot(el, s) {
    el.innerHTML = '';
    if (!s) return;
    const img = document.createElement('img');
    img.src = I.iconURL(s.id);
    img.alt = '';
    el.appendChild(img);
    if (s.n > 1) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = s.n;
      el.appendChild(n);
    }
    const d = I.defs[s.id];
    if (d && d.maxDur && s.dur < d.maxDur) {
      const bar = document.createElement('span');
      bar.className = 'dur';
      const k = s.dur / d.maxDur;
      bar.innerHTML = `<i style="width:${Math.round(k * 100)}%;background:hsl(${Math.round(k * 120)},80%,50%)"></i>`;
      el.appendChild(bar);
    }
    el.title = I.name(s.id);
  }

  UI.renderHotbar = () => {
    const P = G.Player;
    const slots = $('hotbar').children;
    for (let i = 0; i < 9; i++) {
      fillSlot(slots[i], P.inv.slots[i]);
      slots[i].classList.toggle('sel', i === P.sel);
      if (!document.body.classList.contains('touch')) {
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = i + 1;
        slots[i].appendChild(k);
      }
    }
    $('hud-gold-n').textContent = I.goldValue(P.inv);
  };

  UI.inventoryChanged = () => {
    UI.renderHotbar();
    if (!$('scr-inv').hidden) renderInventory();
    if (!$('scr-chest').hidden) renderChest();
  };

  UI.updateHearts = () => {
    const h = Math.max(0, Math.ceil(G.Player.health));
    const imgs = $('hearts').children;
    for (let i = 0; i < 10; i++) {
      const v = h - i * 2;
      imgs[i].src = v >= 2 ? ICON.heart : v === 1 ? ICON.half : ICON.empty;
    }
    $('hearts').classList.toggle('low', h <= 4 && G.Player.alive);
  };

  UI.flashHurt = () => {
    const f = $('fx-hurt');
    f.style.transition = 'none';
    f.style.opacity = 1;
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.6s';
      f.style.opacity = 0;
    });
  };

  UI.toast = (msg, kind) => {
    const box = $('toasts');
    // gleiche Meldung nicht doppelt
    for (const t of box.children) if (t.textContent === msg && !t.classList.contains('out')) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), kind === 'gold' ? 5200 : 3200);
    setTimeout(() => t.remove(), kind === 'gold' ? 5800 : 3800);
  };

  let hudT = 0;
  UI.updateHUD = (dt) => {
    hudT -= dt;
    const P = G.Player, S = G.Sky;
    $('fx-water').style.opacity = P.headInWater ? 1 : 0;
    if (hudT > 0) return;
    hudT = 0.12;
    $('hud-pos').textContent = `${World.biomeNames[World.biomeAt(P.pos.x, P.pos.z)]}  ${Math.floor(P.pos.x)} ${Math.floor(P.pos.y)} ${Math.floor(P.pos.z)}`;
    $('hud-clock').textContent = S.clock();
    const w = S.weather;
    const night = S.daylight < 0.4;
    $('hud-weather-icon').src = w === 'klar' ? (night ? ICON.moon : ICON.sun) : w === 'gewitter' ? ICON.storm : w === 'schnee' ? ICON.snow : ICON.rain;
    $('hud-weather').textContent = w === 'klar' ? (night ? 'Nacht' : 'Tag') : S.WEATHER_NAMES[w];
    drawMinimap();
  };

  // ---------------------------------------------------------------------------
  // Karte
  // ---------------------------------------------------------------------------
  function drawArrow(ctx, x, y, ang, s, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, s * 0.75);
    ctx.lineTo(0, s * 0.35);
    ctx.lineTo(-s * 0.7, s * 0.75);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.22);
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }
  function structIcon(ctx, s, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    const r = 7 * k;
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = '#000';
    if (s.type === 'village') {
      ctx.fillStyle = '#c98d4a';
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = s.discovered ? '#f2c14e' : 'rgba(242,193,78,0.25)';
      ctx.setLineDash(s.discovered ? [] : [3 * k, 3 * k]);
      ctx.strokeStyle = s.discovered ? '#000' : '#f2c14e';
      ctx.beginPath();
      ctx.moveTo(-r, r); ctx.lineTo(0, -r); ctx.lineTo(r, r); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (!s.discovered) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#f2c14e';
        ctx.font = `bold ${Math.round(12 * k)}px VT323, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('?', 0, r * 0.75);
      }
    }
    ctx.restore();
  }

  function drawMinimap() {
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const P = G.Player;
    World.flushMap();
    const R = 44;
    const k = S / (R * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2c55c4';
    ctx.fillRect(0, 0, S, S);
    const sx = P.pos.x - R, sz = P.pos.z - R;
    // Quelle auf die Karte begrenzen
    const x0 = Math.max(0, sx), z0 = Math.max(0, sz);
    const x1 = Math.min(World.W, sx + 2 * R), z1 = Math.min(World.W, sz + 2 * R);
    if (x1 > x0 && z1 > z0) ctx.drawImage(World.mapCanvas, x0, z0, x1 - x0, z1 - z0, (x0 - sx) * k, (z0 - sz) * k, (x1 - x0) * k, (z1 - z0) * k);
    const night = 1 - G.Sky.daylight;
    if (night > 0.05) {
      ctx.fillStyle = `rgba(5,8,30,${night * 0.45})`;
      ctx.fillRect(0, 0, S, S);
    }
    for (const s of World.structures) {
      if (s.type !== 'village' && !s.discovered) continue;
      if (s.type === 'village' && !s.discovered) continue;
      const mx = (s.x - sx) * k, my = (s.z - sz) * k;
      if (mx < -10 || my < -10 || mx > S + 10 || my > S + 10) continue;
      structIcon(ctx, s, mx, my, S / 170);
    }
    for (const m of G.Mobs.list) {
      if (m.dead) continue;
      const mx = (m.pos.x - sx) * k, my = (m.pos.z - sz) * k;
      if (mx < 0 || my < 0 || mx > S || my > S) continue;
      if (Math.abs(m.pos.y - P.pos.y) > 12) continue;
      ctx.fillStyle = m.hostile ? '#ff3b30' : '#ffe9d6';
      const r = m.hostile ? 4 : 3;
      ctx.fillRect(mx - r, my - r, r * 2, r * 2);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx - r, my - r, r * 2, r * 2);
    }
    drawArrow(ctx, S / 2, S / 2, -P.yaw, S * 0.055, '#ffffff');
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.font = `bold ${Math.round(S * 0.085)}px "Pixelify Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeText('N', S / 2, S * 0.1);
    ctx.fillText('N', S / 2, S * 0.1);
  }

  UI.openMap = () => {
    if (G.Game.state !== 'play') return;
    openScreen('scr-map');
    drawBigMap();
  };
  function drawBigMap() {
    const cv = $('bigmap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const k = S / World.W;
    World.flushMap();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2c55c4';
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(World.mapCanvas, 0, 0, S, S);
    const P = G.Player;
    for (const s of World.structures) {
      let x = s.x, z = s.z;
      if (!s.discovered && s.type !== 'village') {
        // ungefähre Lage als Gerücht
        x += (U.hash2(s.x, s.z, 1) - 0.5) * 30;
        z += (U.hash2(s.z, s.x, 2) - 0.5) * 30;
      }
      if (s.type === 'village' && !s.discovered) continue;
      structIcon(ctx, s, x * k, z * k, 1.4);
      if (s.discovered) {
        ctx.font = 'bold 18px "Pixelify Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#fff';
        ctx.strokeText(s.name, x * k, z * k - 16);
        ctx.fillText(s.name, x * k, z * k - 16);
      }
    }
    for (const m of G.Mobs.list) {
      if (m.dead || !m.hostile) continue;
      if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) > 60) continue;
      ctx.fillStyle = '#e04040';
      ctx.fillRect(m.pos.x * k - 3, m.pos.z * k - 3, 6, 6);
    }
    if (P.spawn) {
      ctx.fillStyle = '#b22';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.fillRect(P.spawn.x * k - 5, P.spawn.z * k - 3, 10, 6);
      ctx.strokeRect(P.spawn.x * k - 5, P.spawn.z * k - 3, 10, 6);
    }
    drawArrow(ctx, P.pos.x * k, P.pos.z * k, -P.yaw, 12, '#ffffff');
  }

  // ---------------------------------------------------------------------------
  // Bildschirme
  // ---------------------------------------------------------------------------
  const OVERLAYS = ['scr-inv', 'scr-chest', 'scr-pause', 'scr-map', 'modal'];
  UI.anyOpen = () => OVERLAYS.some((id) => !$(id).hidden) || !$('scr-death').hidden;
  function openScreen(id) {
    G.Input.releaseLock();
    G.Input.mouseL = G.Input.mouseR = false;
    G.Input.mineBtn = false;
    $(id).hidden = false;
  }
  UI.closeAll = () => {
    returnCursor();
    for (const id of OVERLAYS) $(id).hidden = true;
    UI.chestKey = null;
  };
  UI.openPause = () => {
    if (G.Game.state !== 'play') return;
    openScreen('scr-pause');
    syncSettings();
  };

  UI.confirm = (title, text, yes, onYes, no = 'Abbrechen') => {
    $('modal-title').textContent = title;
    $('modal-text').textContent = text;
    $('modal-yes').textContent = yes;
    $('modal-no').textContent = no;
    $('modal').hidden = false;
    UI._modalYes = onYes;
  };

  function setSeg(id, v) {
    for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(v));
  }
  function syncSettings() {
    const Gm = G.Game;
    setSeg('p-weather', G.Sky.weather);
    setSeg('p-monsters', Gm.monstersOn ? 1 : 0);
    setSeg('p-cam', G.Player.camMode);
    setSeg('p-view', Gm.viewRadius);
    setSeg('p-sound', G.Audio.enabled ? 1 : 0);
    setSeg('p-autojump', Gm.autoJump ? 1 : 0);
    for (const b of $('p-time').children) b.classList.remove('on');
  }

  function setupScreens() {
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => UI.resume()));
    $('p-resume').addEventListener('click', () => UI.resume());
    $('modal-no').addEventListener('click', () => { $('modal').hidden = true; });
    $('modal-yes').addEventListener('click', () => {
      $('modal').hidden = true;
      const f = UI._modalYes;
      UI._modalYes = null;
      f && f();
    });
    const segHandler = (id, fn) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      G.Audio.play('click');
      fn(b.dataset.v);
      syncSettings();
      if (id === 'p-time') b.classList.add('on');
      G.Game.saveSettings();
    });
    segHandler('p-weather', (v) => G.Sky.setWeather(v, 180));
    segHandler('p-time', (v) => { G.Sky.time = parseFloat(v); });
    segHandler('p-monsters', (v) => { G.Game.monstersOn = v === '1'; });
    segHandler('p-cam', (v) => { G.Player.camMode = v; });
    segHandler('p-view', (v) => G.Game.setViewRadius(parseInt(v, 10)));
    segHandler('p-sound', (v) => G.Audio.setEnabled(v === '1'));
    segHandler('p-autojump', (v) => { G.Game.autoJump = v === '1'; });
    $('p-look').addEventListener('click', () => { UI.closeAll(); G.Game.openCreator(true); });
    $('p-title').addEventListener('click', () => { UI.closeAll(); G.Game.toTitle(); });
    $('btn-respawn').addEventListener('click', () => {
      $('scr-death').hidden = true;
      G.Player.respawn();
      G.Game.resumeLock();
    });
    $('btn-play').addEventListener('click', () => G.Game.play());
    $('btn-look').addEventListener('click', () => G.Game.openCreator(true));
    $('btn-newworld').addEventListener('click', () => {
      UI.confirm('Neue Welt erschaffen?', 'Deine jetzige Welt mit allem, was du gebaut und gesammelt hast, wird gelöscht. Deine Figur bleibt.', 'Neue Welt', () => G.Game.newWorld());
    });
  }
  UI.resume = () => {
    UI.closeAll();
    G.Game.resumeLock();
  };

  UI.showDeath = (cause) => {
    const texts = {
      Sturz: 'Du bist zu tief gefallen.', Kaktus: 'Ein Kaktus hat dich gepikst.', Zombie: 'Ein Zombie hat dich erwischt.',
      Mumie: 'Eine Mumie hat den Schatz verteidigt.', Skelett: 'Ein Skelett hat dich mit Pfeilen getroffen.', Spinne: 'Eine Spinne hat dich gebissen.',
      Creeper: 'Ein Creeper ist explodiert.', Blitz: 'Du wurdest vom Blitz getroffen.', Leere: 'Du bist aus der Welt gefallen.',
    };
    UI.closeAll();
    G.Input.releaseLock();
    $('death-cause').textContent = texts[cause] || 'Pass beim nächsten Mal besser auf!';
    $('scr-death').hidden = false;
  };

  UI.fadeBlack = (on) => { $('fx-black').style.opacity = on ? 1 : 0; };

  // ---------------------------------------------------------------------------
  // Inventar, Truhen, Herstellen
  // ---------------------------------------------------------------------------
  let cursor = null; // Stapel in der "Hand" der Maus
  const cursorEl = () => $('cursor-stack');
  function renderCursor() {
    const el = cursorEl();
    if (!cursor) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<img src="${I.iconURL(cursor.id)}" alt="">` + (cursor.n > 1 ? `<span class="n">${cursor.n}</span>` : '');
  }
  const moveCursor = (e) => {
    const el = cursorEl();
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
  };
  window.addEventListener('pointermove', moveCursor);
  window.addEventListener('pointerdown', moveCursor);
  function returnCursor() {
    if (!cursor) return;
    const left = G.Player.inv.add(cursor.id, cursor.n, cursor.dur);
    if (left > 0) {
      const P = G.Player;
      G.Ent.dropItem(cursor.id, left, P.pos.x, P.pos.y + 1.4, P.pos.z, new THREE.Vector3(-Math.sin(P.yaw) * 4, 2, -Math.cos(P.yaw) * 4), cursor.dur);
    }
    cursor = null;
    renderCursor();
    UI.renderHotbar();
  }

  // Klick auf einen Platz (arr = Array der Stapel, i = Index)
  function clickSlot(arr, i, right, shift, other) {
    const s = arr[i];
    if (shift && s && other) {
      // in den anderen Bereich verschieben
      const left = other(s.id, s.n, s.dur);
      if (left === 0) arr[i] = null;
      else s.n = left;
    } else if (!cursor) {
      if (!s) return;
      if (right && s.n > 1) {
        const k = Math.ceil(s.n / 2);
        cursor = { id: s.id, n: k, dur: s.dur };
        s.n -= k;
      } else {
        cursor = s;
        arr[i] = null;
      }
    } else if (!s) {
      if (right) {
        arr[i] = { id: cursor.id, n: 1, dur: cursor.dur };
        cursor.n--;
        if (cursor.n <= 0) cursor = null;
      } else {
        arr[i] = cursor;
        cursor = null;
      }
    } else if (s.id === cursor.id && I.stackSize(s.id) > 1) {
      const max = I.stackSize(s.id);
      const k = right ? Math.min(1, max - s.n) : Math.min(cursor.n, max - s.n);
      s.n += k;
      cursor.n -= k;
      if (cursor.n <= 0) cursor = null;
    } else {
      arr[i] = cursor;
      cursor = s;
    }
    G.Audio.play('click');
    renderCursor();
    UI.inventoryChanged();
  }

  // Stapel in einen Bereich eines Arrays legen, gibt Rest zurück
  function addRange(arr, from, to, id, n, dur) {
    const max = I.stackSize(id);
    if (max > 1)
      for (let i = from; i < to && n > 0; i++) {
        const s = arr[i];
        if (s && s.id === id && s.n < max) {
          const k = Math.min(n, max - s.n);
          s.n += k;
          n -= k;
        }
      }
    for (let i = from; i < to && n > 0; i++) {
      if (!arr[i]) {
        const k = Math.min(n, max);
        arr[i] = { id, n: k };
        if (dur !== undefined) arr[i].dur = dur;
        n -= k;
      }
    }
    return n;
  }

  function buildGrid(el, n) {
    el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.className = 'slot';
      b.dataset.i = i;
      el.appendChild(b);
    }
  }
  function bindGrid(el, getArr, offset, getOther) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.slot');
      if (!b) return;
      clickSlot(getArr(), offset + parseInt(b.dataset.i, 10), false, e.shiftKey, getOther && getOther());
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const b = e.target.closest('.slot');
      if (!b) return;
      clickSlot(getArr(), offset + parseInt(b.dataset.i, 10), true, false, null);
    });
  }

  function setupInventory() {
    buildGrid($('inv-main'), 27);
    buildGrid($('inv-hot'), 9);
    buildGrid($('chest-grid'), 27);
    buildGrid($('chest-inv'), 27);
    buildGrid($('chest-hot'), 9);
    const inv = () => G.Player.inv.slots;
    // Umschalt+Klick verschiebt in den anderen Bereich
    const into = (getArr, from, to) => () => (id, n, dur) => addRange(getArr(), from, to, id, n, dur);
    bindGrid($('inv-main'), inv, 9, into(inv, 0, 9));
    bindGrid($('inv-hot'), inv, 0, into(inv, 9, 36));
    bindGrid($('chest-grid'), () => UI.chestItems, 0, into(inv, 0, 36));
    bindGrid($('chest-inv'), inv, 9, into(() => UI.chestItems, 0, 27));
    bindGrid($('chest-hot'), inv, 0, into(() => UI.chestItems, 0, 27));
    $('chest-take').addEventListener('click', () => {
      const items = UI.chestItems;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const s = items[i];
        if (!s) continue;
        const left = G.Player.inv.add(s.id, s.n, s.dur);
        if (left === 0) items[i] = null;
        else s.n = left;
      }
      G.Audio.play('pickup');
      UI.inventoryChanged();
    });
    $('craft-list').addEventListener('click', (e) => {
      const r = e.target.closest('.recipe');
      if (!r) return;
      const rec = I.recipes[parseInt(r.dataset.r, 10)];
      const res = I.craft(G.Player.inv, rec);
      if (res) {
        G.Audio.play('craft');
        if (res.left > 0) {
          const P = G.Player;
          G.Ent.dropItem(rec.out, res.left, P.pos.x, P.pos.y + 1.4, P.pos.z);
          UI.toast('Dein Inventar ist voll – der Rest liegt auf dem Boden.');
        }
        G.Game.stats.crafted = (G.Game.stats.crafted || 0) + 1;
        UI.inventoryChanged();
      }
    });
  }

  function renderGrid(el, arr, offset) {
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) fillSlot(kids[i], arr[offset + i]);
  }
  function renderInventory() {
    const s = G.Player.inv.slots;
    renderGrid($('inv-main'), s, 9);
    renderGrid($('inv-hot'), s, 0);
    renderCrafting();
  }
  function renderCrafting() {
    const inv = G.Player.inv;
    const list = $('craft-list');
    const items = I.recipes.map((r, i) => ({ r, i, ok: I.canCraft(inv, r) }));
    items.sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0) || a.i - b.i);
    list.innerHTML = items
      .map(({ r, i, ok }) => {
        const ings = r.ins
          .map((ing) => {
            const have = inv.count(ing.ids);
            return `<span class="ing${have >= ing.n ? '' : ' miss'}" title="${I.name(ing.ids[0])}"><img src="${I.iconURL(ing.ids[0])}" alt="">${ing.n}</span>`;
          })
          .join('');
        return `<button class="recipe${ok ? '' : ' no'}" data-r="${i}"${ok ? '' : ' aria-disabled="true"'}>
          <span class="out"><img src="${I.iconURL(r.out)}" alt="">${r.n > 1 ? `<b>${r.n}</b>` : ''}</span>
          <span class="rname">${I.name(r.out)}</span>
          <span class="ings">${ings}</span></button>`;
      })
      .join('');
  }

  UI.openInventory = (craftFocus) => {
    if (G.Game.state !== 'play' || !G.Player.alive) return;
    openScreen('scr-inv');
    renderInventory();
    if (craftFocus) $('craft-list').scrollTop = 0;
  };
  UI.toggleInventory = () => {
    if (!$('scr-inv').hidden) UI.resume();
    else if (!UI.anyOpen()) UI.openInventory();
  };

  UI.openChest = (x, y, z) => {
    const key = World.idx(x, y, z);
    let items = World.chests.get(key);
    if (!items) {
      items = new Array(27).fill(null);
      World.chests.set(key, items);
    }
    UI.chestKey = key;
    UI.chestItems = items;
    G.Audio.play('chest');
    openScreen('scr-chest');
    renderChest();
    const hasGold = items.some((s) => s && I.defs[s.id] && I.defs[s.id].gold);
    if (hasGold) UI.toast('In dieser Truhe glänzt etwas golden!', 'gold');
  };
  function renderChest() {
    renderGrid($('chest-grid'), UI.chestItems, 0);
    const s = G.Player.inv.slots;
    renderGrid($('chest-inv'), s, 9);
    renderGrid($('chest-hot'), s, 0);
  }

  // ---------------------------------------------------------------------------
  // Figuren-Editor
  // ---------------------------------------------------------------------------
  const PALETTES = {
    skin: ['#f6d5ba', '#ecbd96', '#d9a274', '#c8956b', '#a8744c', '#8a5a3a', '#6a4128', '#4b2d1c'],
    hair: ['#1c1410', '#3b2414', '#6b3f1f', '#a86a34', '#e2c27a', '#f3e6be', '#b2391c', '#8a8a8a', '#d64f9a', '#3a6fd8'],
    eyes: ['#4b4bb5', '#3b6fd8', '#2f8f4a', '#6b4226', '#333333', '#7a5ab8', '#2fa7b0'],
    shirt: ['#2aa6a6', '#d8443c', '#3c6fd8', '#f2c14e', '#5aa83b', '#9b59b6', '#ff8fb3', '#f2f2f2', '#2b2b2b', '#e8702a'],
    pants: ['#3a3c9c', '#22222e', '#5a3a22', '#3a6a3a', '#7f8790', '#c2b086', '#b03030', '#2f6fbf'],
    shoes: ['#555555', '#2a2a2a', '#6b4226', '#f2f2f2', '#b03030', '#2b2b8a', '#d6a02a'],
  };
  const LABELS = { skin: 'Hautfarbe', hair: 'Haare', eyes: 'Augen', shirt: 'T-Shirt', pants: 'Hose', shoes: 'Schuhe' };
  UI.DEFAULT_LOOK = { skin: '#c8956b', hair: '#3b2414', eyes: '#4b4bb5', shirt: '#2aa6a6', pants: '#3a3c9c', shoes: '#555555', hairStyle: 'kurz' };

  function setupCreator() {
    const box = $('cr-colors');
    for (const key of Object.keys(PALETTES)) {
      const row = document.createElement('div');
      row.className = 'color-row';
      row.innerHTML = `<span>${LABELS[key]}</span><div class="swatches" data-k="${key}"></div>`;
      const sw = row.querySelector('.swatches');
      for (const c of PALETTES[key]) {
        const b = document.createElement('button');
        b.className = 'sw';
        b.style.background = c;
        b.dataset.c = c;
        b.setAttribute('aria-label', LABELS[key] + ' ' + c);
        sw.appendChild(b);
      }
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.className = 'sw-custom';
      inp.id = 'cr-custom-' + key;
      inp.title = 'Eigene Farbe';
      sw.appendChild(inp);
      sw.addEventListener('click', (e) => {
        const b = e.target.closest('.sw');
        if (!b) return;
        G.Audio.play('click');
        UI.look[key] = b.dataset.c;
        syncCreator();
      });
      inp.addEventListener('input', () => {
        UI.look[key] = inp.value;
        syncCreator();
      });
      box.appendChild(row);
    }
    $('cr-hairstyle').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      G.Audio.play('click');
      UI.look.hairStyle = b.dataset.v;
      syncCreator();
    });
    $('cr-random').addEventListener('click', () => {
      for (const k of Object.keys(PALETTES)) UI.look[k] = U.pick(PALETTES[k]);
      UI.look.hairStyle = U.pick(['kurz', 'lang', 'zopf']);
      syncCreator();
    });
    $('cr-done').addEventListener('click', () => {
      G.Audio.unlock();
      if (UI.nameLocked) {
        G.Game.finishCreator(UI.lockedName, { ...UI.look });
        return;
      }
      const name = $('cr-name').value.trim().replace(/\s+/g, ' ');
      if (!name) {
        $('cr-name-note').textContent = 'Bitte gib deiner Figur zuerst einen Namen.';
        $('cr-name').focus();
        return;
      }
      UI.confirm(
        'Soll deine Figur „' + name + '“ heißen?',
        'Der Name kann danach nicht mehr geändert werden. Farben und Frisur kannst du jederzeit anpassen.',
        'Ja, so heißt sie!',
        () => G.Game.finishCreator(name, { ...UI.look }),
        'Nochmal überlegen'
      );
    });
    // Figur drehen durch Ziehen
    const stage = document.querySelector('.creator-stage');
    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = e.clientX; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => {
      if (drag === null) return;
      G.Game.previewYaw += (e.clientX - drag) * 0.012;
      drag = e.clientX;
    });
    stage.addEventListener('pointerup', () => { drag = null; });
    stage.addEventListener('pointercancel', () => { drag = null; });
  }

  function syncCreator() {
    for (const sw of document.querySelectorAll('#cr-colors .swatches')) {
      const k = sw.dataset.k;
      for (const b of sw.querySelectorAll('.sw')) b.classList.toggle('on', b.dataset.c.toLowerCase() === String(UI.look[k]).toLowerCase());
      const inp = sw.querySelector('input');
      if (inp) inp.value = UI.look[k];
    }
    for (const b of $('cr-hairstyle').children) b.classList.toggle('on', b.dataset.v === UI.look.hairStyle);
    G.Game.previewLook({ ...UI.look });
  }

  UI.openCreator = (look, lockedName) => {
    UI.look = { ...UI.DEFAULT_LOOK, ...(look || {}) };
    UI.nameLocked = !!lockedName;
    UI.lockedName = lockedName || null;
    const inp = $('cr-name');
    if (lockedName) {
      inp.value = lockedName;
      inp.disabled = true;
      $('cr-name-note').textContent = 'Der Name ist festgelegt und kann nicht mehr geändert werden.';
      $('creator-title').textContent = 'Aussehen ändern';
      $('cr-done').textContent = 'Fertig';
    } else {
      inp.disabled = false;
      $('cr-name-note').textContent = 'Den Namen kannst du nur ein einziges Mal festlegen.';
      $('creator-title').textContent = 'Erstelle deine Figur';
      $('cr-done').textContent = "Los geht's!";
    }
    $('scr-creator').hidden = false;
    syncCreator();
  };

  // ---------------------------------------------------------------------------
  // Touch-Steuerung
  // ---------------------------------------------------------------------------
  function setupTouch() {
    const Input = G.Input;
    const joy = $('joy'), knob = $('joy-knob');
    let joyId = null, jx = 0, jy = 0;
    const R = 50;
    joy.addEventListener('pointerdown', (e) => {
      G.Audio.unlock();
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      jx = r.left + r.width / 2;
      jy = r.top + r.height / 2;
      moveJoy(e);
    });
    const moveJoy = (e) => {
      let dx = e.clientX - jx, dy = e.clientY - jy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      Input.joyX = dx / R;
      Input.joyY = dy / R;
    };
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      knob.style.transform = '';
      Input.joyX = Input.joyY = 0;
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);

    // Umsehen durch Wischen
    const look = $('touch-look');
    const lookers = new Map();
    look.addEventListener('pointerdown', (e) => {
      G.Audio.unlock();
      look.setPointerCapture(e.pointerId);
      lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    look.addEventListener('pointermove', (e) => {
      const p = lookers.get(e.pointerId);
      if (!p) return;
      Input.mdx += (e.clientX - p.x) * 2.2;
      Input.mdy += (e.clientY - p.y) * 2.2;
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const endLook = (e) => lookers.delete(e.pointerId);
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    const hold = (id, on, off) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); G.Audio.unlock(); b.setPointerCapture(e.pointerId); on(); b.classList.add('on'); });
      const up = () => { off && off(); if (id !== 'tb-sprint') b.classList.remove('on'); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    };
    hold('tb-jump', () => (Input.jumpBtn = true), () => (Input.jumpBtn = false));
    hold('tb-mine', () => (Input.mineBtn = true), () => (Input.mineBtn = false));
    hold('tb-use', () => (Input.useTap = true));
    $('tb-sprint').addEventListener('click', () => {
      Input.sprintToggle = !Input.sprintToggle;
      $('tb-sprint').classList.toggle('on', Input.sprintToggle);
    });
    $('tb-inv').addEventListener('click', () => UI.toggleInventory());
    $('tb-cam').addEventListener('click', () => G.Game.toggleCamera());
    $('tb-pause').addEventListener('click', () => UI.openPause());
  }
  UI.setTouch = (on) => {
    document.body.classList.toggle('touch', on);
  };

  UI.setLoading = (p, text) => {
    $('load-bar').style.width = Math.round(p * 100) + '%';
    if (text) $('load-text').textContent = text;
  };
})();
