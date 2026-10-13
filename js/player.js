'use strict';
// Spieler: Steuerung, Kamera, Abbauen/Bauen, Leben
(function () {
  const U = G.U, B = G.B, ID = B.ID, World = G.World, C = G.Char, Phys = G.Phys, I = G.Items;

  // ---------------------------------------------------------------------------
  // Eingabe
  // ---------------------------------------------------------------------------
  const Input = (G.Input = {
    keys: {}, mdx: 0, mdy: 0, mouseL: false, mouseR: false, useTap: false, wheel: 0,
    joyX: 0, joyY: 0, jumpBtn: false, mineBtn: false, sprintToggle: false, locked: false, sens: 1,
  });

  Input.init = (canvas) => {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      Input.keys[e.code] = true;
      if (G.Game.state !== 'play') return;
      G.Game.onKey(e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { Input.keys[e.code] = false; });
    window.addEventListener('blur', () => { Input.keys = {}; Input.mouseL = Input.mouseR = false; });

    // Maus (mit Pointer-Lock; falls nicht möglich: Ziehen zum Umsehen)
    let dragging = false, downX = 0, downY = 0, moved = false;
    canvas.addEventListener('mousedown', (e) => {
      G.Audio.unlock();
      if (G.Game.state !== 'play' || G.UI.anyOpen()) return;
      if (!Input.locked && !Input.noLock) {
        Input.requestLock(canvas);
      }
      if (e.button === 0) {
        Input.mouseL = true;
        dragging = !Input.locked;
        moved = false;
        downX = e.clientX; downY = e.clientY;
      } else if (e.button === 2) {
        Input.mouseR = true;
        Input.useTap = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { Input.mouseL = false; dragging = false; }
      if (e.button === 2) Input.mouseR = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (G.Game.state !== 'play') return;
      if (Input.locked) {
        Input.mdx += e.movementX || 0;
        Input.mdy += e.movementY || 0;
      } else if (dragging) {
        const dx = e.clientX - downX, dy = e.clientY - downY;
        if (moved || Math.hypot(dx, dy) > 6) {
          moved = true;
          Input.mouseL = false; // Ziehen = Umsehen statt Abbauen
          Input.mdx += e.movementX * 1.6;
          Input.mdy += e.movementY * 1.6;
        }
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (G.Game.state !== 'play') return;
      Input.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = Input.locked;
      Input.locked = document.pointerLockElement === canvas;
      if (was && !Input.locked && G.Game.state === 'play' && !G.UI.anyOpen() && !Input.ignoreUnlock) G.UI.openPause();
      Input.ignoreUnlock = false;
    });
    // In manchen Umgebungen (z.B. eingebettet) gibt es kein Pointer-Lock: dann Ziehen zum Umsehen
    document.addEventListener('pointerlockerror', () => {
      Input.lockFails = (Input.lockFails || 0) + 1;
      if (Input.lockFails >= 3) Input.noLock = true;
    });
  };
  Input.requestLock = (canvas) => {
    try {
      if (!canvas.requestPointerLock) { Input.noLock = true; return; }
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      Input.noLock = true;
    }
  };
  Input.releaseLock = () => {
    if (document.pointerLockElement) {
      Input.ignoreUnlock = true;
      document.exitPointerLock();
    }
  };

  // ---------------------------------------------------------------------------
  // Spieler
  // ---------------------------------------------------------------------------
  const P = (G.Player = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw: 0.3, h: 1.8,
    yaw: 0, pitch: -0.2, bodyYaw: 0, health: 20, maxHealth: 20, alive: true,
    inv: new I.Inventory(36), sel: 0, onGround: false, inWater: false, headInWater: false,
    camMode: 'first', camDist: 4, shake: 0, hurtT: 0, lastHurt: 99, regenT: 0,
    hurtRoll: 0, landDip: 0, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, deathT: 0,
    mining: null, swingT: -1, attackCd: 0, useCd: 0, cactusCd: 0, fallY: 0,
    spawn: null, target: null, warned: null, stepT: 0,
  });

  P.init = (scene, camera, look, name) => {
    P.scene = scene;
    P.camera = camera;
    P.name = name;
    P.model = C.createHumanoid(look);
    scene.add(P.model.root);
    P.shadow = G.Ent.makeShadow(0.7);
    // Namensschild
    P.makeNameTag(name);
    // Markierung des anvisierten Blocks
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    P.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
    P.highlight.visible = false;
    scene.add(P.highlight);
    P.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: B.crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    P.crack.visible = false;
    scene.add(P.crack);
    // Arm in der Ich-Perspektive
    P.fpArm = C.createFPArm(look);
    P.fpArm.rotation.order = 'YXZ';
    camera.add(P.fpArm);
    P.fpArm.visible = false;
    P.fpItem = new THREE.Group();
    camera.add(P.fpItem);
    P.fpHeldId = undefined;
  };

  P.makeNameTag = (name) => {
    if (P.nameTag) { P.scene.remove(P.nameTag); P.nameTag.material.map.dispose(); P.nameTag.material.dispose(); }
    const c = U.canvas(256, 64);
    const ctx = c.getContext('2d');
    ctx.font = 'bold 34px "Pixelify Sans", "Trebuchet MS", sans-serif';
    const w = Math.min(250, ctx.measureText(name).width + 24);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(128 - w / 2, 8, w, 48);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    const t = new THREE.CanvasTexture(c);
    P.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: true }));
    P.nameTag.scale.set(1.6, 0.4, 1);
    P.scene.add(P.nameTag);
  };

  P.setLook = (look) => {
    C.applyLook(P.model, look);
    P.model.heldId = undefined;
    P.camera.remove(P.fpArm);
    P.fpArm = C.createFPArm(look);
    P.fpArm.rotation.order = 'YXZ';
    P.camera.add(P.fpArm);
    P.fpHeldId = undefined;
  };

  P.held = () => P.inv.slots[P.sel];

  P.giveItem = (id, n, dur) => {
    const before = I.goldValue(P.inv);
    const left = P.inv.add(id, n, dur);
    if (left < n) {
      G.UI.inventoryChanged();
      if (I.defs[id] && I.defs[id].gold && I.goldValue(P.inv) > before) G.Audio.play('gold');
    }
    return left;
  };

  P.hurt = (amount, fromX, fromZ, cause, knock = 5) => {
    if (!P.alive || G.Game.state !== 'play' || P.hurtT > 0.45) return;
    P.health -= amount;
    P.hurtT = 0.55;
    P.lastHurt = 0;
    P.lastCause = cause;
    G.Audio.play('hurt');
    G.UI.flashHurt();
    if (fromX !== undefined) {
      const dx = P.pos.x - fromX, dz = P.pos.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      P.vel.x += (dx / l) * knock;
      P.vel.z += (dz / l) * knock;
      P.vel.y = Math.max(P.vel.y, 4);
    }
    P.shake = Math.max(P.shake, 0.25);
    // Kamera kippt kurz zur Seite, aus der der Treffer kam
    P.hurtRoll = fromX !== undefined ? (Math.sign((P.pos.x - fromX) * Math.cos(P.yaw) - (P.pos.z - fromZ) * Math.sin(P.yaw)) || 1) * 0.12 : 0.1;
    if (P.health <= 0) P.die(cause);
    G.UI.updateHearts();
  };

  P.die = (cause) => {
    P.health = 0;
    P.alive = false;
    P.deathT = 0;
    P.mining = null;
    G.Game.stats.deaths = (G.Game.stats.deaths || 0) + 1;
    G.UI.showDeath(cause);
  };

  P.respawn = () => {
    const s = P.spawn || World.findSpawn();
    // Prüfen, ob der Startpunkt (z.B. Bett) noch frei ist
    if (!Phys.free(s.x, s.y, s.z, P.hw, P.h)) {
      const f = World.findSpawn();
      s.x = f.x; s.y = f.y; s.z = f.z;
    }
    P.pos.set(s.x, s.y, s.z);
    P.vel.set(0, 0, 0);
    P.health = P.maxHealth;
    P.alive = true;
    P.fallY = P.pos.y;
    P.model.root.rotation.z = 0;
    G.UI.updateHearts();
  };

  // Blickrichtung der Kamera
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function updateDirs() {
    fwd.set(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  }

  function eyePos() {
    return new THREE.Vector3(P.pos.x, P.pos.y + 1.62, P.pos.z);
  }

  // ---------------------------------------------------------------------------
  // Zielen
  // ---------------------------------------------------------------------------
  const REACH = 5;
  function findTarget() {
    const cam = P.camera.position;
    const eye = eyePos();
    // Strahl ab dem Punkt, der dem Kopf am nächsten ist (Third-Person)
    const t0 = Math.max(0, fwd.dot(new THREE.Vector3().subVectors(eye, cam)) - 0.4);
    const o = cam.clone().addScaledVector(fwd, t0);
    const maxD = REACH + 1.5;
    const hit = World.raycast(o.x, o.y, o.z, fwd.x, fwd.y, fwd.z, maxD);
    const mob = G.Mobs.raycast(o, fwd, maxD);
    let tb = null;
    if (hit) {
      const c = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      if (c.distanceTo(eye) <= REACH + 0.6) tb = hit;
    }
    if (mob && (!tb || mob.dist < tb.dist)) {
      const mc = mob.mob.center;
      if (mc.distanceTo(eye) < 4.2) return { mob: mob.mob };
    }
    return tb ? { block: tb } : null;
  }

  // ---------------------------------------------------------------------------
  // Abbauen
  // ---------------------------------------------------------------------------
  function damageTool(n) {
    const s = P.held();
    if (!s || s.dur === undefined) return;
    s.dur -= n;
    if (s.dur <= 0) {
      P.inv.slots[P.sel] = null;
      G.Audio.play('break');
      G.UI.toast(I.name(s.id) + ' ist kaputt gegangen!');
    }
    G.UI.inventoryChanged();
  }

  P.breakBlock = (x, y, z) => {
    const id = World.get(x, y, z);
    if (id === ID.AIR || B.ISWATER[id]) return;
    const drops = I.blockDrops(id);
    for (const [iid, n] of drops) G.Ent.dropItem(iid, n, x + 0.5, y + 0.4, z + 0.5);
    if (id === ID.CHEST) {
      const key = World.idx(x, y, z);
      const items = World.chests.get(key);
      if (items) for (const s of items) if (s) G.Ent.dropItem(s.id, s.n, x + 0.5, y + 0.5, z + 0.5, null, s.dur);
      World.chests.delete(key);
    }
    G.Ent.blockBreak(x, y, z, id);
    World.setBlock(x, y, z, ID.AIR);
    // Dinge obendrauf fallen mit herunter
    const above = World.get(x, y + 1, z);
    const ad = B.defs[above];
    if (above && (ad.render === 'cross' || ad.render === 'torch')) {
      for (const [iid, n] of I.blockDrops(above)) G.Ent.dropItem(iid, n, x + 0.5, y + 1.4, z + 0.5);
      World.setBlock(x, y + 1, z, ID.AIR);
    }
    G.Audio.play('break', new THREE.Vector3(x, y, z));
    G.Game.stats.mined = (G.Game.stats.mined || 0) + 1;
    damageTool(1);
  };

  function handleMining(dt) {
    const tgt = P.target;
    const want = Input.mouseL || Input.mineBtn;
    if (!want) {
      P.mining = null;
      P.warned = null;
      return;
    }
    if (P.swingT < 0) P.swingT = 0;
    if (!tgt) { P.mining = null; return; }
    if (tgt.mob) {
      P.mining = null;
      if (P.attackCd <= 0) {
        const s = P.held();
        const d = s ? I.defs[s.id] : null;
        const dmg = d && d.damage ? d.damage : 1;
        tgt.mob.damage(dmg, P.pos.x, P.pos.z, true);
        P.attackCd = 0.45;
        P.swingT = 0;
        G.Audio.play('swing');
        if (d && d.kind === 'tool') damageTool(d.tool === 'sword' ? 1 : 2);
      }
      return;
    }
    const b = tgt.block;
    const key = b.x + ',' + b.y + ',' + b.z;
    const info = I.mineInfo(b.id, P.held());
    if (!info.canMine) {
      if (P.warned !== key) { G.UI.toast(info.reason); P.warned = key; }
      P.mining = null;
      return;
    }
    if (!P.mining || P.mining.key !== key) P.mining = { key, x: b.x, y: b.y, z: b.z, p: 0, sound: 0 };
    const m = P.mining;
    m.p += dt / info.time;
    m.sound -= dt;
    if (m.sound <= 0) {
      m.sound = 0.25;
      G.Audio.play('dig', null, 0.8);
      G.Ent.blockBreak(b.x, b.y, b.z, b.id);
      G.Ent.burst(b.x + 0.5, b.y + 0.5, b.z + 0.5, B.tileColor(B.defs[b.id].faceTiles[2]), 0, 1);
    }
    if (m.p >= 1) {
      P.breakBlock(b.x, b.y, b.z);
      P.mining = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Benutzen / Bauen
  // ---------------------------------------------------------------------------
  function overlapsEntity(x, y, z) {
    const boxHit = (px, py, pz, hw, h) => x < px + hw && x + 1 > px - hw && y < py + h && y + 1 > py && z < pz + hw && z + 1 > pz - hw;
    if (boxHit(P.pos.x, P.pos.y, P.pos.z, P.hw, P.h)) return true;
    for (const m of G.Mobs.list) if (!m.dead && boxHit(m.pos.x, m.pos.y, m.pos.z, m.hw, m.h)) return true;
    return false;
  }

  function handleUse() {
    const tgt = P.target;
    const s = P.held();
    const d = s ? I.defs[s.id] : null;
    if (tgt && tgt.block) {
      const bd = B.defs[tgt.block.id];
      if (bd.interact === 'chest') { G.UI.openChest(tgt.block.x, tgt.block.y, tgt.block.z); return true; }
      if (bd.interact === 'bed') { G.Game.sleep(tgt.block); return true; }
      if (bd.interact === 'craft') { G.UI.openInventory(true); return true; }
    }
    // Eimer: stilles Wasser schöpfen
    if (s && s.id === I.ID.BUCKET) {
      const cam = P.camera.position;
      const eye = eyePos();
      const t0 = Math.max(0, fwd.dot(new THREE.Vector3().subVectors(eye, cam)) - 0.4);
      const o = cam.clone().addScaledVector(fwd, t0);
      const hit = World.raycast(o.x, o.y, o.z, fwd.x, fwd.y, fwd.z, REACH + 1.5, false, true);
      if (hit && hit.water && new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5).distanceTo(eye) <= REACH + 0.6) {
        World.setBlock(hit.x, hit.y, hit.z, ID.AIR);
        if (s.n > 1) {
          s.n--;
          if (P.inv.add(I.ID.WATER_BUCKET, 1) > 0) G.Ent.dropItem(I.ID.WATER_BUCKET, 1, P.pos.x, P.pos.y + 1, P.pos.z);
        } else P.inv.slots[P.sel] = { id: I.ID.WATER_BUCKET, n: 1 };
        G.Audio.play('bucket');
        G.UI.inventoryChanged();
        P.swingT = 0;
        return true;
      }
      if (!(tgt && tgt.block && B.defs[tgt.block.id].interact)) {
        G.UI.toast('Mit dem Eimer kannst du stilles Wasser schöpfen.');
        return false;
      }
    }
    // Wassereimer: Wasser ausgießen
    if (s && s.id === I.ID.WATER_BUCKET && tgt && tgt.block) {
      const b = tgt.block;
      let x = b.x + b.nx, y = b.y + b.ny, z = b.z + b.nz;
      if (B.defs[b.id].replaceable || B.WASH[b.id]) { x = b.x; y = b.y; z = b.z; }
      const cur = World.get(x, y, z);
      if (World.inside(x, z) && y > 0 && y < World.H - 1 && (cur === ID.AIR || B.ISWATER[cur] || B.WASH[cur])) {
        if (B.WASH[cur]) for (const [iid, n] of I.blockDrops(cur)) G.Ent.dropItem(iid, n, x + 0.5, y + 0.3, z + 0.5);
        World.setBlock(x, y, z, ID.WATER);
        P.inv.slots[P.sel] = { id: I.ID.BUCKET, n: 1 };
        G.Audio.play('bucket');
        G.UI.inventoryChanged();
        P.swingT = 0;
        return true;
      }
      return false;
    }
    if (d && d.food) {
      if (P.health >= P.maxHealth) { G.UI.toast('Du bist schon ganz gesund.'); return true; }
      P.health = Math.min(P.maxHealth, P.health + d.food);
      s.n--;
      if (s.n <= 0) P.inv.slots[P.sel] = null;
      G.Audio.play('eat');
      G.Ent.burst(P.pos.x, P.pos.y + 1.5, P.pos.z, [200, 120, 80], 6, 1);
      G.UI.inventoryChanged();
      G.UI.updateHearts();
      P.swingT = 0;
      return true;
    }
    if (d && d.kind === 'block' && tgt && tgt.block) {
      const b = tgt.block;
      let x = b.x + b.nx, y = b.y + b.ny, z = b.z + b.nz;
      const targetDef = B.defs[b.id];
      if (targetDef.replaceable) { x = b.x; y = b.y; z = b.z; }
      if (!World.inside(x, z) || y < 1 || y >= World.H - 1) return false;
      const cur = World.get(x, y, z);
      if (cur !== ID.AIR && !B.ISWATER[cur] && !B.defs[cur].replaceable) return false;
      const nd = B.defs[d.block];
      if (nd.render === 'torch' || nd.render === 'cross') {
        const below = World.get(x, y - 1, z);
        if (!B.OPAQUE[below]) { G.UI.toast(nd.name + ' braucht einen festen Block darunter.'); return false; }
        if (nd.render === 'cross' && ![ID.GRASS, ID.DIRT, ID.SNOW_GRASS, ID.SAND].includes(below)) return false;
      }
      if (nd.solid && overlapsEntity(x, y, z)) return false;
      World.setBlock(x, y, z, d.block);
      if (d.block === ID.CHEST) World.chests.set(World.idx(x, y, z), new Array(27).fill(null));
      s.n--;
      if (s.n <= 0) P.inv.slots[P.sel] = null;
      G.Audio.play('place');
      G.UI.inventoryChanged();
      P.swingT = 0;
      G.Game.stats.placed = (G.Game.stats.placed || 0) + 1;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  P.update = (dt) => {
    const keys = Input.keys;
    // Umsehen
    const sens = 0.0026 * Input.sens;
    P.yaw -= Input.mdx * sens;
    P.pitch -= Input.mdy * sens;
    Input.mdx = Input.mdy = 0;
    if (keys.ArrowLeft) P.yaw += dt * 2.2;
    if (keys.ArrowRight) P.yaw -= dt * 2.2;
    if (keys.ArrowUp) P.pitch += dt * 1.6;
    if (keys.ArrowDown) P.pitch -= dt * 1.6;
    P.pitch = U.clamp(P.pitch, -1.5, 1.5);
    if (Input.wheel) {
      P.sel = (((P.sel + Input.wheel) % 9) + 9) % 9;
      Input.wheel = 0;
      G.UI.selectSlot(P.sel);
    }
    updateDirs();

    P.hurtT = Math.max(0, P.hurtT - dt);
    P.lastHurt += dt;
    P.attackCd -= dt;
    P.useCd -= dt;
    P.cactusCd -= dt;
    P.shake = Math.max(0, P.shake - dt * 1.5);

    if (!P.alive) {
      P.vel.x *= 0.9; P.vel.z *= 0.9;
      P.vel.y -= 28 * dt;
      Phys.move(P, dt);
      updateModel(dt, 0);
      return;
    }

    // Laufen
    let f = 0, s = 0;
    if (keys.KeyW) f += 1;
    if (keys.KeyS) f -= 1;
    if (keys.KeyD) s += 1;
    if (keys.KeyA) s -= 1;
    f -= Input.joyY;
    s += Input.joyX;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const flatF = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const wish = new THREE.Vector3().addScaledVector(flatF, f).addScaledVector(right, s);
    const sprint = (keys.ShiftLeft || keys.ShiftRight || Input.sprintToggle) && f > 0.3;
    P.sprinting = sprint;
    let speed = sprint ? 5.8 : 4.3;
    if (P.inWater) speed = 2.6;
    wish.multiplyScalar(speed);
    // Strömung: fließendes Wasser trägt einen mit
    const flow = World.flowAt(Math.floor(P.pos.x), Math.floor(P.pos.y + 0.1), Math.floor(P.pos.z));
    if (flow) {
      wish.x += flow.x * 2.8;
      wish.z += flow.z * 2.8;
      if (flow.down) P.vel.y -= 10 * dt;
    }
    const accel = P.onGround ? 14 : P.inWater ? 6 : 3.5;
    P.vel.x += (wish.x - P.vel.x) * Math.min(1, accel * dt);
    P.vel.z += (wish.z - P.vel.z) * Math.min(1, accel * dt);
    const jump = keys.Space || Input.jumpBtn;
    if (P.inWater) {
      P.vel.y -= 9 * dt;
      if (jump) P.vel.y = Math.min(P.vel.y + 30 * dt, 3.6);
      P.vel.y *= 1 - Math.min(1, dt * 2);
      // aus dem Wasser an Land springen
      if (jump && P.collidedH) P.vel.y = 6.5;
    } else {
      P.vel.y -= 28 * dt;
      if (jump && P.onGround) P.vel.y = 8.6;
    }
    P.vel.y = Math.max(P.vel.y, -48);
    const wasGround = P.onGround;
    const wasWater = P.inWater;
    Phys.move(P, dt);
    if (P.inWater && !wasWater && P.vel.y < -6) G.Audio.play('splash');
    if (P.onGround && P.collidedH && wish.lengthSq() > 0.1 && G.Game.autoJump && Phys.canStepUp(P, wish.x, wish.z)) P.vel.y = 8.6;

    // Fallschaden
    if (!P.onGround && wasGround) P.fallY = P.pos.y;
    if (!P.onGround) P.fallY = Math.max(P.fallY, P.pos.y);
    if (P.inWater) P.fallY = P.pos.y;
    if (P.onGround && !wasGround) {
      const fd = P.fallY - P.pos.y;
      if (fd > 3.4) P.hurt(Math.floor(fd - 3), undefined, undefined, 'Sturz');
      if (fd > 1) playStep(1.2);
      if (fd > 0.6) P.landDip = Math.min(0.22, 0.05 + fd * 0.035);
      P.fallY = P.pos.y;
    }
    // Kaktus pikst
    if (P.cactusCd <= 0) {
      outer: for (let y = Math.floor(P.pos.y); y <= Math.floor(P.pos.y + P.h); y++)
        for (let z = Math.floor(P.pos.z - P.hw - 0.08); z <= Math.floor(P.pos.z + P.hw + 0.08); z++)
          for (let x = Math.floor(P.pos.x - P.hw - 0.08); x <= Math.floor(P.pos.x + P.hw + 0.08); x++)
            if (World.get(x, y, z) === ID.CACTUS) { P.hurt(1, x + 0.5, z + 0.5, 'Kaktus', 3); P.cactusCd = 0.6; break outer; }
    }
    if (P.pos.y < -12) P.die('Leere');

    // Heilen mit der Zeit
    if (P.health < P.maxHealth && P.lastHurt > 5) {
      P.regenT += dt;
      if (P.regenT > 3) { P.regenT = 0; P.health = Math.min(P.maxHealth, P.health + 1); G.UI.updateHearts(); }
    }

    // Ziel, Abbauen, Bauen
    P.target = findTarget();
    handleMining(dt);
    if (Input.useTap || (Input.mouseR && P.useCd <= 0)) {
      if (handleUse()) P.useCd = 0.25;
      else if (Input.useTap) P.useCd = 0.25;
      Input.useTap = false;
    }
    if (P.swingT >= 0) {
      P.swingT += dt * 3.2;
      if (P.swingT >= 1) P.swingT = (Input.mouseL || Input.mineBtn) && P.mining ? 0 : -1;
    }

    updateModel(dt, Math.hypot(P.vel.x, P.vel.z));
    updateHighlight();
  };

  function surfaceUnder() {
    const id = World.get(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.1), Math.floor(P.pos.z));
    if ([ID.STONE, ID.COBBLE, ID.MOSSY_COBBLE, ID.STONE_BRICKS, ID.BRICKS, ID.SANDSTONE, ID.CHISELED_SANDSTONE, ID.TERRA_BLUE, ID.TERRA_ORANGE, ID.GOLD_BLOCK, ID.ICE, ID.BEDROCK, ID.GLASS].includes(id) || B.defs[id].name.includes('erz')) return 'stone';
    if ([ID.SAND, ID.GRAVEL].includes(id)) return 'sand';
    if ([ID.PLANKS, ID.SPRUCE_PLANKS, ID.LOG, ID.BIRCH_LOG, ID.SPRUCE_LOG, ID.JUNGLE_LOG, ID.CHEST, ID.CRAFTING, ID.BOOKSHELF].includes(id)) return 'wood';
    if ([ID.SNOW, ID.SNOW_GRASS, ID.WOOL].includes(id)) return 'snow';
    return 'grass';
  }
  function playStep(v = 1) {
    G.Audio.play('step', null, v * 0.8, { surface: P.inWater ? 'water' : surfaceUnder() });
  }

  function updateModel(dt, hspeed) {
    const m = P.model;
    const mineDir = P.yaw + Math.PI;
    const busy = P.swingT >= 0 || P.mining;
    if (busy) P.bodyYaw = U.approachAngle(P.bodyYaw, mineDir, dt * 12);
    else if (hspeed > 0.4) P.bodyYaw = U.approachAngle(P.bodyYaw, Math.atan2(P.vel.x, P.vel.z), dt * 9);
    m.root.position.copy(P.pos);
    m.root.rotation.y = P.bodyYaw;
    const headYaw = U.clamp(U.angleDiff(P.bodyYaw, mineDir), -1.1, 1.1);
    const s = P.held();
    const step = C.animate(m, dt, {
      speed: hspeed, onGround: P.onGround, swim: P.inWater && !P.onGround, sprint: P.sprinting,
      swing: P.swingT, headYaw, headPitch: U.clamp(-P.pitch, -0.9, 0.9), holding: !!s, dead: !P.alive,
    });
    if (step) playStep();
    C.setHeld(m, s ? s.id : null);
    const L = World.lightAt(P.pos.x, P.pos.y + 1.2, P.pos.z);
    C.setTint(m, Math.max(0.14, G.Sky.entityBrightness(L.sky, L.block)), P.hurtT > 0.3 ? 1 : 0);
    G.Ent.placeShadow(P.shadow, P.pos, P.alive ? 1 : 0);
    P.nameTag.position.set(P.pos.x, P.pos.y + 2.2, P.pos.z);
  }

  function updateHighlight() {
    const t = P.target;
    if (t && t.block) {
      P.highlight.visible = true;
      P.highlight.position.set(t.block.x + 0.5, t.block.y + 0.5, t.block.z + 0.5);
    } else P.highlight.visible = false;
    if (P.mining && P.mining.p > 0) {
      P.crack.visible = true;
      P.crack.position.set(P.mining.x + 0.5, P.mining.y + 0.5, P.mining.z + 0.5);
      P.crack.material.map = B.crackTextures[Math.min(9, Math.floor(P.mining.p * 10))];
    } else P.crack.visible = false;
  }

  // ---------------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------------
  P.updateCamera = (dt) => {
    const cam = P.camera;
    updateDirs();
    const eye = eyePos();
    const a = P.model.anim;
    let roll = 0;
    P.hurtRoll *= Math.max(0, 1 - dt * 5);
    P.landDip = Math.max(0, P.landDip - dt * 0.9);
    if (P.camMode === 'first') {
      // Kopfbewegung im Schritt-Takt: auf und ab, leicht seitlich und etwas Neigung
      const run = a.run || 0;
      const k = a.amp * (P.onGround ? 1 : 0.3);
      const bob = Math.abs(Math.cos(a.phase)) * 0.055 * k - 0.03 * k;
      const side = Math.sin(a.phase) * 0.028 * k;
      roll = Math.sin(a.phase) * (0.008 + 0.01 * run) * k + P.hurtRoll;
      let ey = eye.y + bob - P.landDip;
      if (!P.alive) {
        // Beim Tod sinkt der Blick zu Boden und kippt zur Seite
        P.deathT += dt;
        const d = Math.min(1, P.deathT * 2);
        ey = U.lerp(eye.y, P.pos.y + 0.3, d);
        roll += d * 0.7;
      }
      cam.position.set(eye.x + right.x * side, ey, eye.z + right.z * side);
      P.model.root.visible = false;
      P.nameTag.visible = false;
      P.fpArm.visible = P.alive;
      P.fpItem.visible = P.alive;
      // Hand bleibt beim schnellen Umsehen etwas zurück
      const dYaw = U.angleDiff(P.lastYaw, P.yaw), dPitch = P.pitch - P.lastPitch;
      P.lastYaw = P.yaw;
      P.lastPitch = P.pitch;
      P.swayX = U.clamp(P.swayX + dYaw * 0.35, -0.12, 0.12);
      P.swayY = U.clamp(P.swayY - dPitch * 0.35, -0.1, 0.1);
      P.swayX *= Math.max(0, 1 - dt * 8);
      P.swayY *= Math.max(0, 1 - dt * 8);
      // Arm kommt von rechts unten und zeigt nach vorne; beim Abbauen schwingt er
      const sw = P.swingT >= 0 ? Math.sin(P.swingT * Math.PI) : 0;
      const breathe = Math.sin(a.t * 1.6) * 0.006 * (1 - a.amp);
      const bx = Math.sin(a.phase) * 0.02 * k + P.swayX, by = -Math.abs(Math.cos(a.phase)) * 0.03 * k + breathe + P.swayY - P.landDip * 0.4;
      P.fpArm.rotation.set(1.85 - sw * 0.75, 0.28 + sw * 0.15, 0);
      P.fpArm.position.set(0.36 + bx - sw * 0.04, -0.5 + by - sw * 0.06, -0.3 - sw * 0.1);
      P.fpItem.position.set(0.3 + bx - sw * 0.1, -0.3 + by - sw * 0.18, -0.72 - sw * 0.08);
      P.fpItem.rotation.set(-sw * 0.9, -0.45, 0.15 + sw * 0.3);
      const s = P.held();
      const hid = s ? s.id : null;
      if (P.fpHeldId !== hid) {
        P.fpHeldId = hid;
        const g = P.fpItem;
        while (g.children.length) {
          const c = g.children[0];
          g.remove(c);
          c.traverse((o) => {
            if (!o.isMesh) return;
            o.geometry.dispose();
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
          });
        }
        if (hid) {
          const im = C.itemMesh(hid, 0.42, true);
          if (im) {
            if (im.userData.cube) { im.scale.setScalar(0.5); im.position.set(0.06, -0.06, 0); }
            im.traverse((o) => {
              if (!o.isMesh) return;
              o.renderOrder = 1000;
              // Würfel-Materialien sind geteilt: für die Hand eigene Kopien
              o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material;
              for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.depthTest = false;
            });
            g.add(im);
          }
        }
      }
      const L = World.lightAt(eye.x, eye.y, eye.z);
      const br = Math.max(0.14, G.Sky.entityBrightness(L.sky, L.block));
      for (const mt of P.fpArm.userData.mats) mt.color.setRGB(br, br, br);
      P.fpItem.traverse((o) => {
        if (o.isMesh) for (const mt of Array.isArray(o.material) ? o.material : [o.material]) mt.color.setRGB(br, br, br);
      });
    } else {
      P.fpArm.visible = false;
      P.fpItem.visible = false;
      // Über-die-Schulter-Kamera mit Kollision (im Hochformat etwas weiter weg)
      const want = cam.aspect < 1 ? 5.2 : 4.2;
      const side = 0.55;
      const back = new THREE.Vector3(-fwd.x, -fwd.y, -fwd.z);
      const target = eye.clone().addScaledVector(right, side).add(new THREE.Vector3(0, 0.15, 0));
      const hit = World.raycast(target.x, target.y, target.z, back.x, back.y, back.z, want + 0.3, true);
      let d = want;
      if (hit) d = Math.max(0.4, hit.dist - 0.3);
      // Kopf sicher erreichen (nicht durch Wände)
      const sideHit = World.raycast(eye.x, eye.y, eye.z, right.x, 0, right.z, side + 0.25, true);
      if (sideHit) target.copy(eye).addScaledVector(right, Math.max(0, sideHit.dist - 0.25)).add(new THREE.Vector3(0, 0.15, 0));
      P.camDist = d < P.camDist ? d : P.camDist + (d - P.camDist) * Math.min(1, dt * 4);
      cam.position.copy(target).addScaledVector(back, P.camDist);
      const close = P.camDist < 1.0;
      P.model.root.visible = !close;
      P.nameTag.visible = !close && G.Game.showName;
    }
    if (P.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * P.shake * 0.3;
      cam.position.y += (Math.random() - 0.5) * P.shake * 0.3;
    }
    cam.lookAt(cam.position.x + fwd.x, cam.position.y + fwd.y, cam.position.z + fwd.z);
    if (roll) cam.rotateZ(roll);
    const wantFov = P.sprinting ? 78 : 70;
    if (Math.abs(cam.fov - wantFov) > 0.1) {
      cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 6);
      cam.updateProjectionMatrix();
    }
    // Kopf unter Wasser?
    P.headInWater = Phys.submerged(cam.position.x, cam.position.y, cam.position.z);
  };

  P.serialize = () => ({
    x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, health: P.health,
    inv: P.inv.serialize(), sel: P.sel, spawn: P.spawn,
  });
  P.load = (o) => {
    P.pos.set(o.x, o.y, o.z);
    P.yaw = o.yaw || 0;
    P.pitch = o.pitch || 0;
    P.health = o.health > 0 ? o.health : P.maxHealth;
    P.inv.load(o.inv);
    P.sel = o.sel || 0;
    P.spawn = o.spawn || null;
    // Kamera-Einstellung kommt aus den Einstellungen (Standard: Ich-Sicht)
    P.fallY = P.pos.y;
  };
})();
