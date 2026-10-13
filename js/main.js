'use strict';
// Hauptprogramm: Start, Spielschleife, Speichern, Titel und Figuren-Vorschau
(function () {
  const U = G.U, B = G.B, World = G.World, Sky = G.Sky, P = G.Player, UI = G.UI, Input = G.Input, C = G.Char;
  const KEY_CHAR = 'blockwelt.character';
  const KEY_WORLD = 'blockwelt.world.v1';
  const KEY_SET = 'blockwelt.settings';
  const $ = (id) => document.getElementById(id);

  const Game = (G.Game = {
    state: 'boot',
    stats: {},
    monstersOn: true,
    autoJump: true,
    viewRadius: 6,
    viewDist: 96,
    gamma: 1,
    showName: true,
    previewYaw: -0.5,
    worldReady: false,
    character: null,
  });

  let renderer, scene, camera, canvas;
  let pScene, pCam, pGroup, pModel, pStrip;
  let touch = false;

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  function boot() {
    canvas = $('game');
    touch = U.isTouch();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
    } catch (e) {
      document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif;color:#f5efdc;background:#0f0e17;height:100%">Dein Browser unterstützt leider kein WebGL. Probiere einen aktuellen Browser wie Chrome, Firefox oder Safari.</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xaaccff, 40, 90);
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 600);
    scene.add(camera);
    G.scene = scene;
    G.camera = camera;
    G.renderer = renderer;

    World.createMaterials(scene);
    Sky.init(scene);
    G.Ent.init(scene);
    Input.init(canvas);
    UI.init();
    UI.setTouch(touch);
    loadSettings();
    buildPreview();

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) Game.save(); });
    window.addEventListener('pagehide', () => Game.save());
    canvas.addEventListener('click', () => {
      if (Game.state === 'play' && !UI.anyOpen() && !touch && !Input.locked && !Input.noLock) Input.requestLock(canvas);
    });

    Game.character = U.store.get(KEY_CHAR);
    if (Game.character && Game.character.name) Game.toTitle();
    else Game.openCreator(false);
    requestAnimationFrame(loop);
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function loadSettings() {
    const s = U.store.get(KEY_SET) || {};
    Game.monstersOn = s.monsters !== undefined ? s.monsters : true;
    Game.autoJump = s.autoJump !== undefined ? s.autoJump : true;
    Game.setViewRadius(s.view || (touch ? 4 : 6));
    G.Audio.setEnabled(s.sound !== undefined ? s.sound : true);
    // Standard ist die Ich-Perspektive
    P.camMode = s.cam === 'third' ? 'third' : 'first';
  }
  Game.saveSettings = () => {
    U.store.set(KEY_SET, { monsters: Game.monstersOn, autoJump: Game.autoJump, view: Game.viewRadius, sound: G.Audio.enabled, cam: P.camMode });
  };
  Game.setViewRadius = (r) => {
    Game.viewRadius = r;
    Game.viewDist = r * 16;
    camera && (camera.far = Math.max(400, Game.viewDist * 3));
    camera && camera.updateProjectionMatrix();
  };

  // ---------------------------------------------------------------------------
  // Bildschirme
  // ---------------------------------------------------------------------------
  function hideScreens() {
    for (const id of ['scr-title', 'scr-creator', 'scr-loading', 'scr-death']) $(id).hidden = true;
    UI.closeAll();
  }

  Game.toTitle = () => {
    if (Game.state === 'play') Game.save();
    hideScreens();
    Input.releaseLock();
    Game.state = 'title';
    $('hud').hidden = true;
    $('touch').hidden = true;
    const c = Game.character;
    const hasSave = !!U.store.get(KEY_WORLD) || Game.worldReady;
    $('title-hello').innerHTML = '';
    const hello = document.createElement('span');
    hello.append('Hallo, ');
    const b = document.createElement('b');
    b.textContent = c.name;
    hello.append(b, hasSave ? '! Deine Welt wartet auf dich.' : '! Eine neue Welt wartet auf dich.');
    $('title-hello').appendChild(hello);
    $('btn-play').textContent = hasSave ? 'Weiterspielen' : 'Spielen';
    $('btn-newworld').hidden = !hasSave;
    $('scr-title').hidden = false;
    setPreviewLook(c.look);
  };

  Game.openCreator = (edit) => {
    hideScreens();
    Input.releaseLock();
    const fromGame = Game.state === 'play';
    Game.creatorReturn = fromGame ? 'play' : 'title';
    Game.state = 'creator';
    $('hud').hidden = true;
    $('touch').hidden = true;
    const c = Game.character;
    UI.openCreator(c ? c.look : null, c ? c.name : null);
  };
  Game.previewLook = (look) => setPreviewLook(look);

  Game.finishCreator = (name, look) => {
    const isNew = !Game.character;
    if (isNew) {
      // Der Name wird genau einmal festgelegt
      Game.character = { name: name.slice(0, 16), look, created: Date.now() };
    } else {
      Game.character.look = look;
    }
    U.store.set(KEY_CHAR, Game.character);
    $('scr-creator').hidden = true;
    if (Game.worldReady) P.setLook(look);
    if (Game.creatorReturn === 'play' && Game.worldReady) {
      Game.state = 'play';
      $('hud').hidden = false;
      $('touch').hidden = !touch;
      Game.resumeLock();
      return;
    }
    if (isNew) Game.play();
    else Game.toTitle();
  };

  Game.play = () => {
    G.Audio.unlock();
    if (Game.worldReady) {
      hideScreens();
      startPlaying();
      return;
    }
    const save = U.store.get(KEY_WORLD);
    startWorld(save);
  };

  Game.newWorld = () => {
    U.store.remove(KEY_WORLD);
    Game.worldReady = false;
    startWorld(null);
  };

  // ---------------------------------------------------------------------------
  // Welt laden / erzeugen
  // ---------------------------------------------------------------------------
  async function startWorld(save) {
    hideScreens();
    Game.state = 'loading';
    $('scr-loading').hidden = false;
    UI.setLoading(0, 'Welt wird erschaffen …');
    await U.nextFrame();
    World.disposeAll();
    G.Mobs.clear();
    G.Ent.clear();
    G.Sim.clear();
    const seed = save && save.seed ? save.seed : Math.floor(Math.random() * 2 ** 31);
    const t0 = performance.now();
    await World.generate(seed, (p, text) => UI.setLoading(p * 0.85, text));
    if (save) {
      UI.setLoading(0.86, 'Spielstand laden …');
      await U.nextFrame();
      try {
        if (save.mods && save.mods.length) {
          World.applyMods(save.mods);
          // Wasser, das beim Speichern noch floss, fließt weiter
          G.Sim.wake(save.mods.map((m) => m[0]));
        }
        if (save.chests) {
          for (const [key, items] of save.chests)
            World.chests.set(key, items.map((v) => (v ? (v[2] >= 0 ? { id: v[0], n: v[1], dur: v[2] } : { id: v[0], n: v[1] }) : null)));
        }
        if (save.structures)
          save.structures.forEach((st, i) => {
            if (World.structures[i]) { World.structures[i].discovered = !!st[0]; World.structures[i].guarded = !!st[1]; }
          });
        Sky.time = save.time || 0.04;
        Sky.setWeather(save.weather || 'klar', save.weatherTimer || 150, true);
        Game.stats = save.stats || {};
      } catch (e) {
        console.warn('Spielstand beschädigt', e);
      }
    } else {
      Sky.time = 0.04;
      Sky.setWeather('klar', 150, true);
      Game.stats = {};
    }
    // Spieler
    const c = Game.character;
    if (!P.model) P.init(scene, camera, c.look, c.name);
    else {
      P.setLook(c.look);
      if (P.name !== c.name) { P.name = c.name; P.makeNameTag(c.name); }
    }
    P.inv = new G.Items.Inventory(36);
    if (save && save.player) {
      P.load(save.player);
      if (!G.Phys.free(P.pos.x, P.pos.y, P.pos.z, P.hw, P.h)) {
        const s = World.findSpawn();
        P.pos.set(s.x, s.y, s.z);
      }
    } else {
      const s = World.findSpawn();
      P.pos.set(s.x, s.y, s.z);
      P.spawn = null;
      P.health = P.maxHealth;
      P.sel = 0;
      // Startausrüstung
      const IT = G.Items.ID;
      P.inv.add(IT.WOOD_PICK, 1);
      P.inv.add(IT.WOOD_SWORD, 1);
      P.inv.add(IT.WOOD_AXE, 1);
      P.inv.add(B.ID.TORCH, 8);
      P.inv.add(IT.APPLE, 3);
      // zur Dorfmitte schauen
      const v = World.structures.find((s2) => s2.type === 'village');
      if (v) P.yaw = Math.atan2(-(v.x - P.pos.x), -(v.z - P.pos.z));
    }
    P.alive = true;
    P.vel.set(0, 0, 0);
    P.fallY = P.pos.y;
    $('hud-name').textContent = c.name;
    G.Mobs.spawnInitialAnimals();

    // Chunks rund um den Spieler vorbereiten
    UI.setLoading(0.9, 'Landschaft aufbauen …');
    await U.nextFrame();
    let guard = 0;
    while (guard++ < 400) {
      const r = World.updateChunks(P.pos.x, P.pos.z, Math.min(Game.viewRadius, 4), 30, false);
      UI.setLoading(0.9 + 0.1 * Math.min(1, guard / 20), 'Landschaft aufbauen …');
      if (r.pending === 0) break;
      await U.nextFrame();
    }
    console.log('Welt fertig in', Math.round(performance.now() - t0), 'ms');
    Game.worldReady = true;
    $('scr-loading').hidden = true;
    startPlaying();
    if (!save) {
      setTimeout(() => UI.toast('Willkommen auf der Insel, ' + c.name + '!'), 400);
      setTimeout(() => UI.toast('Auf der Karte oben rechts siehst du die Welt. Tippe sie an für die große Karte.'), 3200);
      setTimeout(() => UI.toast('In den Tempeln der Insel ist Gold versteckt. Viel Glück!', 'gold'), 6500);
    } else setTimeout(() => UI.toast('Willkommen zurück, ' + c.name + '!'), 300);
    Game.save();
  }

  function startPlaying() {
    Game.state = 'play';
    $('hud').hidden = false;
    $('touch').hidden = !touch;
    P.camera.fov = 70;
    P.camera.updateProjectionMatrix();
    UI.renderHotbar();
    UI.updateHearts();
    UI.selectSlot(P.sel);
    Game.resumeLock();
  }

  Game.resumeLock = () => {
    if (!touch && !Input.noLock && Game.state === 'play') Input.requestLock(canvas);
  };

  // ---------------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------------
  Game.save = () => {
    if (!Game.worldReady || !P.model) return;
    const chests = [];
    for (const [key, items] of World.chests) chests.push([key, items.map((s) => (s ? [s.id, s.n, s.dur === undefined ? -1 : s.dur] : 0))]);
    const data = {
      v: 1,
      seed: World.seed,
      mods: Array.from(World.mods),
      chests,
      structures: World.structures.map((s) => [s.discovered ? 1 : 0, s.guarded ? 1 : 0]),
      player: P.serialize(),
      time: Sky.time,
      weather: Sky.weather,
      weatherTimer: Sky.weatherTimer,
      stats: Game.stats,
    };
    if (!P.alive) data.player.health = P.maxHealth;
    if (!U.store.set(KEY_WORLD, data)) {
      // Zu groß? Dann wenigstens ohne Truhen-Inhalt der unberührten Truhen
      console.warn('Speichern fehlgeschlagen');
    }
  };

  // ---------------------------------------------------------------------------
  // Tasten
  // ---------------------------------------------------------------------------
  Game.onKey = (e) => {
    const code = e.code;
    if (code === 'Escape') {
      if (!$('scr-death').hidden) return;
      if (UI.anyOpen()) UI.resume();
      else UI.openPause();
      return;
    }
    if (!$('scr-death').hidden || !$('modal').hidden) return;
    if (code === 'KeyE') { UI.toggleInventory(); return; }
    if (code === 'KeyM') {
      if (!$('scr-map').hidden) UI.resume();
      else if (!UI.anyOpen()) UI.openMap();
      return;
    }
    if (UI.anyOpen()) return;
    if (code.startsWith('Digit')) {
      const n = parseInt(code.slice(5), 10);
      if (n >= 1 && n <= 9) UI.selectSlot(n - 1);
    } else if (code === 'KeyV' || code === 'F5') {
      Game.toggleCamera();
      e.preventDefault();
    } else if (code === 'KeyQ') {
      const s = P.held();
      if (s && P.alive) {
        const f = new THREE.Vector3(-Math.sin(P.yaw), 0.3, -Math.cos(P.yaw));
        G.Ent.dropItem(s.id, 1, P.pos.x + f.x * 0.6, P.pos.y + 1.4, P.pos.z + f.z * 0.6, f.multiplyScalar(5), s.dur).age = -1;
        s.n--;
        if (s.n <= 0) P.inv.slots[P.sel] = null;
        UI.inventoryChanged();
      }
    }
  };

  Game.toggleCamera = () => {
    P.camMode = P.camMode === 'third' ? 'first' : 'third';
    UI.toast(P.camMode === 'first' ? 'Ich-Sicht' : 'Sicht hinter der Figur');
    Game.saveSettings();
  };

  // ---------------------------------------------------------------------------
  // Schlafen
  // ---------------------------------------------------------------------------
  Game.sleep = (b) => {
    const h = Sky.hours();
    P.spawn = { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 };
    if (!(h >= 18.5 || h < 5.5)) {
      UI.toast('Schlafen kannst du nur nachts. Dein Startpunkt ist jetzt dieses Bett.');
      return;
    }
    const near = G.Mobs.list.some((m) => m.hostile && !m.dead && m.pos.distanceTo(P.pos) < 10);
    if (near) {
      UI.toast('Du kannst jetzt nicht schlafen – Monster sind in der Nähe!');
      return;
    }
    Game.state = 'sleep';
    UI.fadeBlack(true);
    G.Audio.play('sleep');
    setTimeout(() => {
      Sky.time = 0.01;
      P.health = P.maxHealth;
      UI.updateHearts();
      Game.state = 'play';
      UI.fadeBlack(false);
      UI.toast('Guten Morgen, ' + Game.character.name + '!');
    }, 1600);
  };

  // ---------------------------------------------------------------------------
  // Entdeckungen
  // ---------------------------------------------------------------------------
  let discoverT = 0;
  function checkDiscoveries(dt) {
    discoverT -= dt;
    if (discoverT > 0) return;
    discoverT = 0.5;
    for (const s of World.structures) {
      if (s.discovered) continue;
      if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < s.r) {
        s.discovered = true;
        const art = s.type === 'village' ? 'ein' : 'einen';
        UI.toast('Du hast ' + art + ' ' + s.name + ' entdeckt!', 'gold');
        if (s.hint) setTimeout(() => UI.toast(s.hint, s.type === 'village' ? undefined : 'gold'), 1800);
        G.Audio.play('gold');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Vorschau-Szene für Titel und Editor
  // ---------------------------------------------------------------------------
  function buildPreview() {
    pScene = new THREE.Scene();
    const bg = U.canvas(4, 256);
    const ctx = bg.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#16193a');
    g.addColorStop(0.55, '#3d5fa3');
    g.addColorStop(0.85, '#c99b6a');
    g.addColorStop(1, '#e8b877');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    pScene.background = new THREE.CanvasTexture(bg);
    pScene.fog = new THREE.Fog(0x9a8f88, 7, 13);
    pScene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dl = new THREE.DirectionalLight(0xfff1dd, 0.6);
    dl.position.set(2, 4, 3);
    pScene.add(dl);
    pGroup = new THREE.Group();
    pScene.add(pGroup);
    // Laufband aus Grasblöcken, damit die Schritte echt aussehen
    const mk = (tile, tint) => {
      const t = new THREE.CanvasTexture(B.tileCanvas(B.tiles[tile], tint));
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return new THREE.MeshLambertMaterial({ map: t });
    };
    const side = mk('grass_side'), top = mk('grass_top'), dirt = mk('dirt');
    const mats = [side, side, top, dirt, side, side];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    pStrip = new THREE.Group();
    for (let z = -8; z < 8; z++)
      for (let x = -1; x <= 1; x++) {
        const m = new THREE.Mesh(geo, mats);
        m.position.set(x, -0.5, z + 0.5);
        pStrip.add(m);
      }
    // ein paar Blumen am Wegesrand
    const flowerMat = new THREE.MeshLambertMaterial({ map: G.Items.iconTexture(B.ID.FLOWER_RED), alphaTest: 0.5, side: THREE.DoubleSide });
    const flowerMat2 = new THREE.MeshLambertMaterial({ map: G.Items.iconTexture(B.ID.FLOWER_YELLOW), alphaTest: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), i % 2 ? flowerMat : flowerMat2);
      f.position.set(i % 2 ? -1 : 1, 0.4, -7 + i * 2.6);
      f.rotation.y = Math.PI / 4;
      pStrip.add(f);
    }
    pGroup.add(pStrip);
    pCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }
  function setPreviewLook(look) {
    if (!look) return;
    if (!pModel) {
      pModel = C.createHumanoid(look);
      pGroup.add(pModel.root);
    } else C.applyLook(pModel, look);
  }

  let previewT = 0;
  function renderPreview(dt) {
    previewT += dt;
    // abwechselnd stehen, gehen und rennen
    const cyc = previewT % 12;
    const speed = cyc < 3 ? 0 : cyc < 8 ? 3.4 : cyc < 10.5 ? 5.8 : 0;
    const sprint = cyc >= 8 && cyc < 10.5;
    if (pModel) {
      pModel.anim.speedSmooth = (pModel.anim.speedSmooth || 0) + (speed - (pModel.anim.speedSmooth || 0)) * Math.min(1, dt * 3);
      const sp = pModel.anim.speedSmooth;
      C.animate(pModel, dt, { speed: sp, onGround: true, sprint, swing: -1, headYaw: 0, headPitch: 0.05, holding: false });
      for (const c of pStrip.children) {
        c.position.z -= sp * dt;
        if (c.position.z < -8) c.position.z += 16;
      }
    }
    if (Game.state === 'creator' || Game.state === 'title') {
      // automatisches Drehen, wenn nicht gezogen wird
      if (Game.state === 'title') Game.previewYaw += dt * 0.15;
    }
    pGroup.rotation.y = Game.previewYaw;
    // Bereich, in dem die Figur stehen soll
    const W = window.innerWidth, H = window.innerHeight;
    let rect;
    if (Game.state === 'creator') {
      const st = document.querySelector('.creator-stage').getBoundingClientRect();
      rect = st.width > 40 && st.height > 40 ? st : { left: 0, top: 0, width: W, height: H * 0.35 };
    } else if (W > 720) rect = { left: W * 0.5, top: 0, width: W * 0.5, height: H };
    else rect = { left: 0, top: H * 0.5, width: W, height: H * 0.5 };
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const frac = Math.min(1, rect.height / H);
    const visH = 2.5 / Math.max(0.2, frac);
    const dist = visH / (2 * Math.tan((pCam.fov / 2) * Math.PI / 180));
    pCam.aspect = W / H;
    pCam.position.set(0, 1.1 + 0.05 * dist, dist);
    pCam.lookAt(0, 0.9, 0);
    pCam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    pCam.updateProjectionMatrix();
    pScene.fog.near = dist + 2;
    pScene.fog.far = dist + 8;
    renderer.render(pScene, pCam);
  }

  // ---------------------------------------------------------------------------
  // Spielschleife
  // ---------------------------------------------------------------------------
  let last = performance.now();
  let saveT = 30;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (Game.state === 'play' || Game.state === 'sleep') {
      const paused = UI.anyOpen() || Game.state === 'sleep';
      if (!paused) {
        P.update(dt);
        G.Mobs.update(dt, P);
        G.Ent.update(dt, P);
        G.Sim.update(dt);
        checkDiscoveries(dt);
        saveT -= dt;
        if (saveT <= 0) { saveT = 30; Game.save(); }
      } else if (!$('scr-death').hidden) {
        // nach dem Tod läuft die Welt weiter
        P.update(dt);
        G.Mobs.update(dt, P);
        G.Ent.update(dt, P);
      }
      P.updateCamera(dt);
      Sky.update(paused && $('scr-death').hidden ? 0 : dt, camera, P, renderer);
      World.updateChunks(camera.position.x, camera.position.z, Game.viewRadius, touch ? 4 : 6);
      UI.updateHUD(dt);
      renderer.render(scene, camera);
    } else if (Game.state === 'title' || Game.state === 'creator') {
      renderPreview(dt);
    } else {
      renderer.setClearColor(0x0f0e17);
      renderer.clear();
    }
  }

  // Für Tests und Fehlersuche
  Game.debug = { get scene() { return scene; }, get camera() { return camera; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
