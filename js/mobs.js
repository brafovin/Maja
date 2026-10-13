'use strict';
// Tiere und Monster: Modelle, Verhalten, Spawnen
(function () {
  const U = G.U, B = G.B, ID = B.ID, World = G.World, C = G.Char, Phys = G.Phys;
  const IT = G.Items.ID;
  const Mobs = (G.Mobs = { list: [] });
  const Q = 1 / 16; // Pixelgröße der Tiere

  // ---------------------------------------------------------------------------
  // Modell-Bausteine
  // ---------------------------------------------------------------------------
  // Quader in Tier-Pixeln (1/16 Block), Textur wie bei den Figuren
  const qbox = (w, h, d, mats, x = 0, y = 0, z = 0) => {
    const k = Q / C.P;
    const m = C.box(w * k, h * k, d * k, mats, x * k, y * k, z * k);
    return m;
  };
  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const mats = (w, h, d, fn, seed) => C.boxMats(w, h, d, fn, seed);
  const solid = (c) => () => c;
  const cache = {};
  function cached(key, make) {
    if (!cache[key]) cache[key] = make();
    return cache[key];
  }

  function collectMaterials(m) {
    m.materials = [];
    m.root.traverse((o) => {
      if (o.isMesh) {
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        for (let i = 0; i < arr.length; i++) {
          // Materialien pro Tier klonen, damit Helligkeit/Treffer einzeln wirken
          const cl = arr[i].clone();
          arr[i] = cl;
          m.materials.push(cl);
        }
        if (!Array.isArray(o.material)) o.material = arr[0];
      }
    });
  }

  // Vierbeiner: Körper, Kopf, 4 Beine
  function quadruped(cfg) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const [bw, bh, bl] = cfg.body;
    const legH = cfg.leg[1];
    const torso = qbox(bw, bh, bl, cfg.bodyMats, 0, legH + bh / 2 + (cfg.bodyLift || 0), 0);
    body.add(torso);
    const head = new THREE.Group();
    head.position.set(0, cfg.headY * Q, (bl / 2 + (cfg.headZ || 0)) * Q);
    body.add(head);
    const [hw, hh, hd] = cfg.head;
    head.add(qbox(hw, hh, hd, cfg.headMats, 0, 0, hd / 2 - 1));
    if (cfg.extra) cfg.extra(head, body);
    const legs = [];
    const [lw, , ld] = cfg.leg;
    const lx = bw / 2 - lw / 2, lz = bl / 2 - ld / 2 - (cfg.legInset || 0);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * lx * Q, legH * Q, sz * lz * Q);
      pivot.add(qbox(lw, legH, ld, cfg.legMats, 0, -legH / 2, 0));
      body.add(pivot);
      legs.push(pivot);
    }
    return { root, body, head, legs, kind: 'quad', anim: { phase: 0, amp: 0, t: Math.random() * 10, graze: 0 } };
  }

  function faceWithEyes(base, eyeRow, opts = {}) {
    return (face, x, y, w, h) => {
      if (face === 'front') {
        if (y === eyeRow) {
          if (x === 1 || x === w - 2) return opts.eyeWhite || [240, 240, 240];
          if (x === 2 || x === w - 3) return opts.pupil || [20, 20, 20];
        }
        if (opts.front) { const c = opts.front(x, y, w, h); if (c) return c; }
      }
      if (opts.top && face === 'top') return opts.top;
      return base;
    };
  }

  const BUILD = {
    pig() {
      const pink = [236, 154, 152];
      const m = quadruped({
        body: [10, 8, 16], leg: [4, 6, 4], head: [8, 8, 8], headY: 12, headZ: 0,
        bodyMats: cached('pig_b', () => mats(10, 8, 16, (f, x, y, w, h, r) => (r() < 0.04 ? mul(pink, 0.85) : pink), 21)),
        headMats: cached('pig_h', () => mats(8, 8, 8, faceWithEyes(pink, 3), 22)),
        legMats: cached('pig_l', () => mats(4, 6, 4, (f, x, y) => (y >= 5 ? mul(pink, 0.7) : pink), 23)),
        extra(head) {
          head.add(qbox(4, 3, 1, cached('pig_s', () => mats(4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [120, 60, 60] : [222, 128, 128]), 24)), 0, -1, 7.5));
        },
      });
      return m;
    },
    cow() {
      const brown = [70, 50, 38], white = [232, 230, 226];
      const spot = (f, x, y, w, h, r) => (U.hash2(x * 3 + f.length, y * 5, 9) < 0.32 ? white : brown);
      return quadruped({
        body: [12, 10, 18], leg: [4, 12, 4], head: [8, 8, 6], headY: 20, headZ: 0,
        bodyMats: cached('cow_b', () => mats(12, 10, 18, spot, 31)),
        headMats: cached('cow_h', () => mats(8, 8, 6, faceWithEyes(brown, 3, { front: (x, y) => (x >= 3 && x <= 4 && y < 3 ? white : null) }), 32)),
        legMats: cached('cow_l', () => mats(4, 12, 4, (f, x, y) => (y >= 10 ? [40, 30, 24] : U.hash2(x, y, 3) < 0.3 ? white : brown), 33)),
        extra(head) {
          head.add(qbox(4, 3, 1, cached('cow_m', () => mats(4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [60, 40, 40] : [214, 180, 160]), 34)), 0, -2, 5.5));
          const horn = cached('cow_hr', () => mats(1, 3, 1, solid([220, 216, 200]), 35));
          head.add(qbox(1, 3, 1, horn, 4.5, 4.5, 2));
          head.add(qbox(1, 3, 1, horn, -4.5, 4.5, 2));
        },
      });
    },
    sheep() {
      const wool = [236, 236, 236], skin = [214, 186, 166];
      return quadruped({
        body: [10, 10, 16], leg: [4, 12, 4], head: [6, 6, 8], headY: 20, headZ: -1,
        bodyMats: cached('sheep_b', () => mats(10, 10, 16, (f, x, y, w, h, r) => (r() < 0.2 ? mul(wool, 0.92) : wool), 41)),
        headMats: cached('sheep_h', () => mats(6, 6, 8, faceWithEyes(skin, 2, { top: wool, front: (x, y) => (y === 0 ? wool : null) }), 42)),
        legMats: cached('sheep_l', () => mats(4, 12, 4, (f, x, y) => (y < 5 ? wool : skin), 43)),
      });
    },
    chicken() {
      const white = [242, 242, 240];
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      body.add(qbox(6, 6, 8, cached('ch_b', () => mats(6, 6, 8, solid(white), 51)), 0, 8, 0));
      const head = new THREE.Group();
      head.position.set(0, 11 * Q, 4 * Q);
      body.add(head);
      head.add(qbox(4, 6, 3, cached('ch_h', () => mats(4, 6, 3, faceWithEyes(white, 1, { eyeWhite: [20, 20, 20], pupil: white }), 52)), 0, 2, 0.5));
      head.add(qbox(4, 2, 2, cached('ch_beak', () => mats(4, 2, 2, solid([236, 176, 40]), 53)), 0, 2, 3));
      head.add(qbox(2, 2, 2, cached('ch_w', () => mats(2, 2, 2, solid([200, 40, 40]), 54)), 0, 0, 2.5));
      const legs = [];
      const legMat = cached('ch_l', () => mats(1, 5, 1, solid([236, 170, 40]), 55));
      for (const sx of [1, -1]) {
        const pv = new THREE.Group();
        pv.position.set(sx * 1.5 * Q, 5 * Q, 0);
        pv.add(qbox(1, 5, 1, legMat, 0, -2.5, 0));
        pv.add(qbox(3, 0.5, 3, legMat, 0, -4.75, 0.5));
        body.add(pv);
        legs.push(pv);
      }
      const wings = [];
      const wingMat = cached('ch_wing', () => mats(1, 4, 6, solid([230, 230, 226]), 56));
      for (const sx of [1, -1]) {
        const pv = new THREE.Group();
        pv.position.set(sx * 3.5 * Q, 11 * Q, 0);
        pv.add(qbox(1, 4, 6, wingMat, 0, -2, 0));
        body.add(pv);
        wings.push(pv);
      }
      return { root, body, head, legs, wings, kind: 'biped', anim: { phase: 0, amp: 0, t: Math.random() * 10, graze: 0 } };
    },
    creeper() {
      const camo = (f, x, y, w, h, r) => {
        const v = r();
        return v < 0.25 ? [60, 140, 52] : v < 0.4 ? [120, 200, 110] : v < 0.5 ? [40, 96, 40] : [84, 170, 72];
      };
      const face = (f, x, y, w, h, r) => {
        if (f === 'front') {
          if ((y === 2 || y === 3) && (x === 1 || x === 2 || x === 5 || x === 6)) return [16, 16, 16];
          if ((y === 4 || y === 5) && (x === 3 || x === 4)) return [16, 16, 16];
          if ((y === 5 || y === 6 || y === 7) && (x === 2 || x === 5)) return [16, 16, 16];
          if (y === 6 && (x === 3 || x === 4)) return [16, 16, 16];
        }
        return camo(f, x, y, w, h, r);
      };
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      body.add(qbox(8, 12, 4, cached('cr_b', () => mats(8, 12, 4, camo, 61)), 0, 12, 0));
      const head = new THREE.Group();
      head.position.set(0, 18 * Q, 0);
      body.add(head);
      head.add(qbox(8, 8, 8, cached('cr_h', () => mats(8, 8, 8, face, 62)), 0, 4, 0));
      const legs = [];
      const lm = cached('cr_l', () => mats(4, 6, 4, camo, 63));
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const pv = new THREE.Group();
        pv.position.set(sx * 2 * Q, 6 * Q, sz * 4 * Q);
        pv.add(qbox(4, 6, 4, lm, 0, -3, 0));
        body.add(pv);
        legs.push(pv);
      }
      return { root, body, head, legs, kind: 'quad', anim: { phase: 0, amp: 0, t: 0, graze: 0 } };
    },
    spider() {
      const dark = [52, 44, 40];
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const noise = (f, x, y, w, h, r) => (r() < 0.2 ? [70, 60, 54] : dark);
      body.add(qbox(6, 6, 6, cached('sp_t', () => mats(6, 6, 6, noise, 71)), 0, 9, 0));
      body.add(qbox(10, 8, 12, cached('sp_a', () => mats(10, 8, 12, (f, x, y, w, h, r) => (f === 'top' && (x + y) % 5 === 0 ? [90, 30, 30] : noise(f, x, y, w, h, r)), 72)), 0, 10, -9));
      const head = new THREE.Group();
      head.position.set(0, 9 * Q, 3 * Q);
      body.add(head);
      head.add(qbox(8, 8, 8, cached('sp_h', () => mats(8, 8, 8, (f, x, y, w, h, r) => {
        if (f === 'front' && y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return [220, 20, 20];
        if (f === 'front' && y === 2 && (x === 3 || x === 4)) return [200, 30, 30];
        return noise(f, x, y, w, h, r);
      }, 73)), 0, 0, 4));
      const legs = [];
      const lm = cached('sp_l', () => mats(16, 2, 2, noise, 74));
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? 1 : -1;
        const k = i % 4;
        const pv = new THREE.Group();
        pv.position.set(side * 3 * Q, 9 * Q, (2 - k * 1.6) * Q);
        const leg = qbox(16, 2, 2, lm, side * 8, 0, 0);
        pv.add(leg);
        pv.userData.base = (k - 1.5) * 0.35 * -side;
        pv.userData.side = side;
        body.add(pv);
        legs.push(pv);
      }
      return { root, body, head, legs, kind: 'spider', anim: { phase: 0, amp: 0, t: 0, graze: 0 } };
    },
  };

  const LOOKS = {
    zombie: { skin: '#5e8f4c', hair: '#38552e', eyes: '#141414', shirt: '#2b8c8c', pants: '#3c3f99', shoes: '#383838', hairStyle: 'kurz' },
    mummy: { skin: '#cdbb92', hair: '#b9a679', eyes: '#f0d43a', shirt: '#d8c79c', pants: '#c4b287', shoes: '#a8966c', hairStyle: 'kurz' },
    skeleton: { skin: '#d9d9d0', hair: '#cfcfc6', eyes: '#151515', shirt: '#cacac1', pants: '#bebeb5', shoes: '#adada4', hairStyle: 'kurz' },
  };

  // ---------------------------------------------------------------------------
  // Typen
  // ---------------------------------------------------------------------------
  const TYPES = (Mobs.TYPES = {
    pig: { name: 'Schwein', hp: 10, speed: 1.5, w: 0.8, h: 0.9, drops: [[IT.MEAT, 1, 2]] },
    cow: { name: 'Kuh', hp: 10, speed: 1.3, w: 0.9, h: 1.4, drops: [[IT.MEAT, 1, 3], [IT.LEATHER, 0, 2]] },
    sheep: { name: 'Schaf', hp: 8, speed: 1.4, w: 0.8, h: 1.3, drops: [[ID.WOOL, 1, 2], [IT.MEAT, 1, 1]] },
    chicken: { name: 'Huhn', hp: 4, speed: 1.6, w: 0.4, h: 0.7, drops: [[IT.FEATHER, 0, 2], [IT.MEAT, 0, 1]] },
    zombie: { name: 'Zombie', hostile: true, hp: 20, speed: 2.5, w: 0.6, h: 1.8, dmg: 3, humanoid: true, burns: true, drops: [[IT.IRON, 0, 1, 0.08]] },
    mummy: { name: 'Mumie', hostile: true, hp: 24, speed: 2.4, w: 0.6, h: 1.8, dmg: 3, humanoid: true, drops: [[IT.GOLD, 1, 2], [IT.BONE, 0, 2]] },
    skeleton: { name: 'Skelett', hostile: true, hp: 20, speed: 2.4, w: 0.6, h: 1.8, dmg: 2, humanoid: true, ranged: true, burns: true, drops: [[IT.BONE, 0, 2]] },
    spider: { name: 'Spinne', hostile: true, hp: 16, speed: 3.3, w: 1.2, h: 0.9, dmg: 2, drops: [[IT.STRING, 0, 2]] },
    creeper: { name: 'Creeper', hostile: true, hp: 20, speed: 2.3, w: 0.6, h: 1.7, explode: true, drops: [[IT.GUNPOWDER, 0, 2]] },
  });

  // ---------------------------------------------------------------------------
  // Mob
  // ---------------------------------------------------------------------------
  class Mob {
    constructor(type, x, y, z) {
      const d = TYPES[type];
      this.type = type;
      this.def = d;
      this.hostile = !!d.hostile;
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3();
      this.hw = d.w / 2;
      this.h = d.h;
      this.hp = d.hp;
      this.yaw = Math.random() * Math.PI * 2;
      this.bodyYaw = this.yaw;
      this.state = 'idle';
      this.timer = Math.random() * 3;
      this.target = null;
      this.hurtT = 0;
      this.dead = false;
      this.deathT = 0;
      this.attackCd = 0;
      this.swing = -1;
      this.fuse = 0;
      this.burnT = 1; // erst nach einer Sekunde in der Sonne fängt ein Zombie Feuer
      this.shootCd = 1 + Math.random();
      this.onGround = false;
      this.fallY = y;
      if (d.humanoid) {
        const look = LOOKS[type];
        this.model = C.createHumanoid(look, { limbW: type === 'skeleton' ? 2 : 4 });
        this.model.kind = 'humanoid';
        if (type === 'skeleton') C.setHeld(this.model, null);
      } else {
        this.model = BUILD[type]();
        collectMaterials(this.model);
      }
      this.model.root.position.copy(this.pos);
      G.scene.add(this.model.root);
      this.shadow = G.Ent.makeShadow(d.w * 0.9);
    }

    get center() {
      return new THREE.Vector3(this.pos.x, this.pos.y + this.h / 2, this.pos.z);
    }

    damage(amount, fromX, fromZ, byPlayer) {
      if (this.dead) return;
      this.hp -= amount;
      this.hurtT = 0.35;
      const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 6;
      this.vel.z += (dz / l) * 6;
      this.vel.y = Math.max(this.vel.y, 4.5);
      G.Audio.play(this.hostile ? 'hitMob' : 'hitAnimal');
      G.Ent.burst(this.pos.x, this.pos.y + this.h * 0.6, this.pos.z, [180, 30, 30], 5, 2);
      if (!this.hostile) {
        this.state = 'panic';
        this.timer = 4 + Math.random() * 2;
        this.yaw = Math.atan2(dx, dz);
      } else if (byPlayer) {
        this.aggro = true;
      }
      if (this.hp <= 0) this.die(byPlayer);
    }

    die(byPlayer) {
      this.dead = true;
      this.deathT = 0;
      G.Audio.play('mobDie');
      if (byPlayer && this.def.drops)
        for (const [id, a, b, p] of this.def.drops) {
          if (p !== undefined && Math.random() > p) continue;
          const n = U.randInt(a, b);
          if (n > 0) G.Ent.dropItem(id, n, this.pos.x, this.pos.y + 0.5, this.pos.z);
        }
      if (byPlayer && G.Game) G.Game.stats.kills = (G.Game.stats.kills || 0) + (this.hostile ? 1 : 0);
    }

    remove() {
      G.scene.remove(this.model.root);
      if (this.shadow) {
        G.scene.remove(this.shadow);
        this.shadow.material.dispose();
      }
      this.model.root.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          // Humanoide haben eigene Texturen, Tiere teilen sie sich
          arr.forEach((m) => {
            if (this.def.humanoid && m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this.removed = true;
    }

    update(dt, player) {
      const d = this.def;
      this.timer -= dt;
      this.attackCd -= dt;
      this.hurtT = Math.max(0, this.hurtT - dt);
      if (this.swing >= 0) {
        this.swing += dt * 3;
        if (this.swing >= 1) this.swing = -1;
      }
      let moveX = 0, moveZ = 0, speed = 0;
      const toP = player.alive ? new THREE.Vector3(player.pos.x - this.pos.x, player.pos.y - this.pos.y, player.pos.z - this.pos.z) : null;
      const distP = toP ? Math.hypot(toP.x, toP.z) : 1e9;

      if (this.dead) {
        this.deathT += dt;
      } else if (this.hostile && toP && G.Game.monstersOn && (distP < (this.aggro ? 32 : d.ranged ? 18 : 20)) && Math.abs(toP.y) < 12) {
        // Angriff
        const ang = Math.atan2(toP.x, toP.z);
        this.yaw = ang;
        speed = d.speed;
        if (d.ranged) {
          if (distP < 6) { this.yaw = ang + Math.PI; }
          else if (distP < 11) { speed = d.speed * 0.4; this.yaw = ang + Math.PI / 2 * Math.sin(this.timer * 0.5 + 1); }
          this.shootCd -= dt;
          if (this.shootCd <= 0 && distP < 20) {
            const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
            const tgt = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
            const dir = tgt.clone().sub(eye);
            const dist = dir.length();
            dir.normalize();
            const hit = World.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, dist, true);
            if (!hit) {
              G.Ent.shootArrow(eye, tgt, this);
              this.swing = 0;
              this.shootCd = 2 + Math.random() * 0.8;
            } else this.shootCd = 0.5;
          }
        } else if (d.explode) {
          if (distP < 2.8) {
            speed = 0;
            this.fuse += dt;
            if (this.fuse === dt) G.Audio.play('fuse');
            if (this.fuse > 1.5) {
              this.explode();
              return;
            }
          } else {
            this.fuse = Math.max(0, this.fuse - dt);
          }
        } else {
          if (distP < 1.2 + this.hw) speed = 0;
          const reach = 1.5 + this.hw;
          if (distP < reach && Math.abs(toP.y) < 1.8 && this.attackCd <= 0) {
            player.hurt(d.dmg, this.pos.x, this.pos.z, d.name);
            this.attackCd = 1.1;
            this.swing = 0;
          }
          if (this.type === 'spider' && this.onGround && distP > 2 && distP < 4.5 && this.attackCd <= 0 && Math.random() < dt * 2) {
            this.vel.y = 6;
            this.vel.x += Math.sin(ang) * 5;
            this.vel.z += Math.cos(ang) * 5;
          }
        }
        moveX = Math.sin(this.yaw);
        moveZ = Math.cos(this.yaw);
        if (this.hostile && this.type === 'zombie' && Math.random() < dt * 0.15) G.Audio.play('groan', this.pos);
      } else {
        // Umherwandern
        if (this.hostile) this.fuse = Math.max(0, this.fuse - dt);
        if (this.state === 'panic') {
          speed = d.speed * 2;
          if (Math.random() < dt * 1.2) this.yaw += (Math.random() - 0.5) * 2;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = 2; }
        } else if (this.state === 'wander') {
          speed = d.speed * (this.hostile ? 0.5 : 0.7);
          if (this.timer <= 0) { this.state = Math.random() < 0.35 && !this.hostile ? 'graze' : 'idle'; this.timer = 2 + Math.random() * 4; }
        } else {
          if (this.timer <= 0) {
            this.state = 'wander';
            this.yaw = Math.random() * Math.PI * 2;
            this.timer = 2 + Math.random() * 4;
          }
        }
        if (speed > 0) {
          moveX = Math.sin(this.yaw);
          moveZ = Math.cos(this.yaw);
          // Nicht von Klippen laufen, nicht ins tiefe Wasser
          const ax = Math.floor(this.pos.x + moveX * 0.9), az = Math.floor(this.pos.z + moveZ * 0.9);
          let drop = 0;
          for (; drop < 4; drop++) if (World.isSolid(ax, Math.floor(this.pos.y) - 1 - drop, az)) break;
          const wet = B.ISWATER[World.get(ax, Math.floor(this.pos.y) - 1, az)] === 1;
          if ((drop >= 3 || (wet && !this.inWater)) && this.state !== 'panic') {
            this.yaw += Math.PI * (0.5 + Math.random());
            speed = 0;
          }
        }
      }

      // Bewegung
      const accel = this.onGround ? 12 : 3;
      let tvx = moveX * speed, tvz = moveZ * speed;
      const flow = World.flowAt(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
      if (flow) { tvx += flow.x * 2.2; tvz += flow.z * 2.2; }
      this.vel.x += (tvx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (tvz - this.vel.z) * Math.min(1, accel * dt);
      if (this.inWater) {
        this.vel.y += (2.2 - this.vel.y) * Math.min(1, dt * 4);
      } else {
        this.vel.y -= 28 * dt;
      }
      if (this.type === 'spider' && this.collidedH && speed > 0) this.vel.y = 3.2;
      this.vel.y = Math.max(this.vel.y, -40);
      const wasGround = this.onGround;
      Phys.move(this, dt);
      if (!this.dead && this.onGround && this.collidedH && speed > 0 && this.type !== 'spider') {
        if (Phys.canStepUp(this, moveX, moveZ)) this.vel.y = 8.2;
        else if (!this.hostile || !toP) { this.yaw += Math.PI * 0.7; }
      }
      // Fallschaden
      if (!this.onGround && wasGround) this.fallY = this.pos.y;
      if (!this.onGround) this.fallY = Math.max(this.fallY, this.pos.y);
      if (this.onGround && !wasGround) {
        const fd = this.fallY - this.pos.y;
        if (fd > 3.5 && !this.inWater && this.type !== 'chicken') this.damage(Math.floor(fd - 3), this.pos.x, this.pos.z, false);
        this.fallY = this.pos.y;
      }
      if (this.type === 'chicken' && !this.onGround && this.vel.y < -2) this.vel.y = -2;

      // Sonne verbrennt Zombies und Skelette
      if (d.burns && !this.dead) {
        const sky = World.lightAt(this.pos.x, this.pos.y + 1.6, this.pos.z).sky;
        const burning = G.Sky.daylight > 0.55 && sky >= 15 && G.Sky.precip() < 0.3 && !this.inWater;
        if (burning) {
          this.burnT -= dt;
          if (Math.random() < dt * 12) G.Ent.burst(this.pos.x + U.rand(-0.3, 0.3), this.pos.y + U.rand(0.2, 1.8), this.pos.z + U.rand(-0.3, 0.3), [255, U.randInt(120, 200), 30], 1, 0.5, 'fire');
          if (this.burnT <= 0) {
            this.burnT = 1;
            this.damage(2, this.pos.x, this.pos.z, false);
          }
        }
      }
      // Ins Leere gefallen
      if (this.pos.y < -5) { this.dead = true; this.deathT = 2; }

      // Modell aktualisieren
      const hspeed = Math.hypot(this.vel.x, this.vel.z);
      if (hspeed > 0.3 && !this.dead) this.bodyYaw = U.approachAngle(this.bodyYaw, Math.atan2(this.vel.x, this.vel.z), dt * 8);
      const root = this.model.root;
      root.position.copy(this.pos);
      root.rotation.y = this.bodyYaw;
      this.animate(dt, hspeed);
      // Licht
      const L = World.lightAt(this.pos.x, this.pos.y + this.h * 0.7, this.pos.z);
      const bright = G.Sky.entityBrightness(L.sky, L.block);
      const flash = this.def.explode && this.fuse > 0 ? (Math.sin(this.fuse * 20) > 0 ? 0.6 : 0) : 0;
      const hurt = this.hurtT > 0 ? 1 : 0;
      if (this.model.kind === 'humanoid') C.setTint(this.model, bright + flash, hurt);
      else
        for (const mt of this.model.materials) {
          mt.color.setRGB(bright + flash, (bright + flash) * (1 - hurt * 0.55), (bright + flash) * (1 - hurt * 0.55));
          mt.emissive && mt.emissive.setRGB(hurt * 0.45 + flash * 0.5, flash * 0.5, flash * 0.5);
        }
      if (this.def.explode) {
        const s = 1 + Math.min(1, this.fuse / 1.5) * 0.25;
        root.scale.set(s, 1 + (s - 1) * 0.5, s);
      }
      G.Ent.placeShadow(this.shadow, this.pos, this.dead ? 0 : 1);
    }

    animate(dt, speed) {
      const m = this.model;
      if (m.kind === 'humanoid') {
        const toP = G.Player.pos;
        const look = Math.atan2(toP.x - this.pos.x, toP.z - this.pos.z);
        const near = this.hostile && Math.hypot(toP.x - this.pos.x, toP.z - this.pos.z) < 16;
        const headYaw = near ? U.clamp(U.angleDiff(this.bodyYaw, look), -0.9, 0.9) : 0;
        C.animate(m, dt, {
          speed, onGround: this.onGround, swim: this.inWater && !this.onGround, sprint: false,
          swing: this.swing, headYaw, headPitch: 0, zombie: this.type !== 'skeleton',
          holding: this.type === 'skeleton', dead: this.dead,
        });
        if (this.type === 'skeleton') {
          // Bogen-Haltung: beide Arme nach vorne
          m.leftArm.sh.rotation.x = -1.4;
          m.rightArm.sh.rotation.x = -1.4 - (this.swing >= 0 ? 0.3 * Math.sin(this.swing * Math.PI) : 0);
          m.leftArm.sh.rotation.z = 0.3;
          m.rightArm.sh.rotation.z = -0.4;
        }
        return;
      }
      const a = m.anim;
      a.t += dt;
      const ampT = Math.min(1, speed / 2) * (m.kind === 'spider' ? 0.5 : 0.75);
      a.amp += (ampT - a.amp) * Math.min(1, dt * 8);
      a.phase += speed * dt * (m.kind === 'biped' ? 9 : m.kind === 'spider' ? 7 : 4.5);
      const s = Math.sin(a.phase);
      a.graze += ((this.state === 'graze' && !this.dead ? 1 : 0) - a.graze) * Math.min(1, dt * 4);
      if (m.kind === 'quad') {
        m.legs[0].rotation.x = a.amp * s;
        m.legs[3].rotation.x = a.amp * s;
        m.legs[1].rotation.x = -a.amp * s;
        m.legs[2].rotation.x = -a.amp * s;
        m.head.rotation.x = a.graze * 0.9 + Math.sin(a.t * 0.7) * 0.05;
        m.head.rotation.y = Math.sin(a.t * 0.37) * 0.3 * (1 - a.amp);
        m.body.position.y = Math.abs(Math.cos(a.phase)) * 0.02 * a.amp;
      } else if (m.kind === 'biped') {
        m.legs[0].rotation.x = a.amp * s * 1.1;
        m.legs[1].rotation.x = -a.amp * s * 1.1;
        m.head.position.z = (4 + Math.sin(a.phase * 2) * 0.6 * a.amp) / 16;
        m.head.rotation.x = a.graze * 1.0;
        const flap = this.onGround ? 0 : Math.sin(a.t * 30) * 0.8 + 0.8;
        m.wings[0].rotation.z = -flap;
        m.wings[1].rotation.z = flap;
      } else if (m.kind === 'spider') {
        m.legs.forEach((leg, i) => {
          const ph = a.phase + (i % 2 ? Math.PI : 0) + (i >= 4 ? Math.PI : 0);
          leg.rotation.y = leg.userData.base + Math.sin(ph) * 0.35 * a.amp * 2;
          leg.rotation.z = leg.userData.side * (-0.55 + Math.max(0, Math.cos(ph)) * 0.25 * a.amp * 2);
        });
      }
      if (this.dead) m.root.rotation.z = U.lerp(m.root.rotation.z, Math.PI / 2, Math.min(1, dt * 6));
    }

    explode() {
      this.dead = true;
      this.deathT = 99;
      G.Ent.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3);
    }
  }
  Mobs.Mob = Mob;

  Mobs.spawn = (type, x, y, z) => {
    const m = new Mob(type, x, y, z);
    Mobs.list.push(m);
    return m;
  };

  Mobs.clear = () => {
    for (const m of Mobs.list) m.remove();
    Mobs.list = [];
  };

  // Strahl gegen Mobs (für Angriffe)
  Mobs.raycast = (o, dir, maxDist) => {
    let best = null, bd = maxDist;
    for (const m of Mobs.list) {
      if (m.dead) continue;
      const t = Phys.rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z,
        m.pos.x - m.hw - 0.1, m.pos.y, m.pos.z - m.hw - 0.1, m.pos.x + m.hw + 0.1, m.pos.y + m.h + 0.1, m.pos.z + m.hw + 0.1);
      if (t >= 0 && t < bd) { bd = t; best = m; }
    }
    return best ? { mob: best, dist: bd } : null;
  };

  // ---------------------------------------------------------------------------
  // Spawnen
  // ---------------------------------------------------------------------------
  function groundSpot(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (!World.inside(x, z)) return null;
    const y = World.heightAt(x, z);
    const b = World.get(x, y, z);
    if (B.ISWATER[b] || b === ID.ICE || !B.SOLID[b] || B.defs[b].render === 'leaves') return null;
    if (World.isSolid(x, y + 1, z) || World.isSolid(x, y + 2, z)) return null;
    return { x: x + 0.5, y: y + 1, z: z + 0.5, b };
  }

  const ANIMALS_BY_BIOME = {
    [World.BIOME.PLAINS]: ['cow', 'sheep', 'pig', 'chicken', 'cow', 'sheep'],
    [World.BIOME.FOREST]: ['pig', 'chicken', 'cow', 'sheep'],
    [World.BIOME.JUNGLE]: ['chicken', 'pig', 'chicken'],
    [World.BIOME.SNOW]: ['sheep', 'sheep', 'cow'],
    [World.BIOME.MOUNTAIN]: ['sheep'],
  };

  function spawnHerd(x, z, near) {
    const b = World.biomeAt(x, z);
    const types = ANIMALS_BY_BIOME[b];
    if (!types) return 0;
    const type = U.pick(types);
    const n = type === 'chicken' ? U.randInt(2, 4) : U.randInt(2, 3);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const s = groundSpot(x + U.rand(-4, 4), z + U.rand(-4, 4));
      if (!s || World.isReserved(Math.floor(s.x), Math.floor(s.z)) === 2) continue;
      if (s.b !== ID.GRASS && s.b !== ID.SNOW_GRASS && s.b !== ID.DIRT) continue;
      Mobs.spawn(type, s.x, s.y, s.z);
      c++;
    }
    return c;
  }

  Mobs.spawnInitialAnimals = () => {
    let herds = 0, tries = 0;
    while (herds < 55 && tries++ < 3000) {
      const x = U.randInt(8, World.W - 8), z = U.randInt(8, World.W - 8);
      if (spawnHerd(x, z)) herds++;
    }
  };

  let spawnTimer = 0;
  Mobs.update = (dt, player) => {
    const px = player.pos.x, pz = player.pos.z;
    let hostile = 0, animalsNear = 0;
    const viewR = G.Game.viewDist;
    for (const m of Mobs.list) {
      const d = Math.hypot(m.pos.x - px, m.pos.z - pz);
      const active = d < 72;
      m.model.root.visible = d < viewR + 8;
      if (m.shadow) m.shadow.visible = m.model.root.visible && d < 40;
      if (active || m.dead) m.update(dt, player);
      if (m.hostile && !m.dead) hostile++;
      if (!m.hostile && !m.dead && d < 64) animalsNear++;
      // Verschwinden
      if (m.dead && m.deathT > 1.0) m.gone = true;
      if (m.hostile && !m.guard && d > 90) m.gone = true;
      if (m.hostile && !m.guard && G.Sky.daylight > 0.7 && d > 28 && Math.random() < dt * 0.05) m.gone = true;
      if (m.hostile && !G.Game.monstersOn) m.gone = true;
    }
    for (const m of Mobs.list) if (m.gone && !m.removed) m.remove();
    Mobs.list = Mobs.list.filter((m) => !m.removed);
    // Mobs schieben sich gegenseitig weg
    const L = Mobs.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || Math.abs(a.pos.x - px) > 40 || Math.abs(a.pos.z - pz) > 40) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const r = a.hw + b.hw;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          const d = Math.sqrt(d2), push = (r - d) * 2;
          a.vel.x -= (dx / d) * push; a.vel.z -= (dz / d) * push;
          b.vel.x += (dx / d) * push; b.vel.z += (dz / d) * push;
        }
      }
    }

    // Wächter in Tempeln
    for (const s of World.structures) {
      if (s.guarded || !s.spawns) continue;
      if (Math.hypot(s.x - px, s.z - pz) < 34) {
        s.guarded = true;
        if (!G.Game.monstersOn) continue;
        s.spawns.forEach((p, i) => {
          const type = s.type === 'desert' ? (i < 2 ? 'mummy' : 'mummy') : i === 2 ? 'spider' : 'zombie';
          const m = Mobs.spawn(type, p[0] + 0.5, p[1], p[2] + 0.5);
          m.guard = true;
        });
      }
    }

    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    spawnTimer = 1.5;

    // Tiere nachspawnen
    if (animalsNear < 8) {
      const a = Math.random() * Math.PI * 2, r = U.rand(30, 55);
      spawnHerd(px + Math.cos(a) * r, pz + Math.sin(a) * r);
    }

    if (!G.Game.monstersOn || !player.alive) return;
    const night = G.Sky.daylight < 0.35;
    const cap = night ? 10 : 5;
    if (hostile >= cap) return;
    // Oberfläche bei Nacht oder dunkle Höhlen
    const a = Math.random() * Math.PI * 2, r = U.rand(18, 40);
    const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
    if (!World.inside(x, z)) return;
    let spot = null;
    const surf = groundSpot(x, z);
    const underground = player.pos.y < World.heightAt(px, pz) - 6;
    if (!underground && surf && night) {
      const L = World.staticLightAt(surf.x, surf.y, surf.z);
      if (L.block < 6 && World.isReserved(x, z) !== 2) spot = surf;
    } else {
      // Höhle: Luftzelle mit Boden in der Nähe der Spielerhöhe
      const top = World.heightAt(x, z);
      for (let k = 0; k < 10; k++) {
        const y = Math.floor(U.clamp(player.pos.y + U.randInt(-8, 8), 3, top - 3));
        if (!World.isSolid(x, y - 1, z) || World.isSolid(x, y, z) || World.isSolid(x, y + 1, z)) continue;
        if (B.ISWATER[World.get(x, y, z)]) continue;
        const L = World.staticLightAt(x, y, z);
        if (L.sky < 4 && L.block < 5) { spot = { x: x + 0.5, y, z: z + 0.5 }; break; }
      }
    }
    if (!spot) return;
    if (Math.hypot(spot.x - px, spot.z - pz) < 16) return;
    const r2 = Math.random();
    const type = r2 < 0.42 ? 'zombie' : r2 < 0.62 ? 'skeleton' : r2 < 0.82 ? 'spider' : 'creeper';
    if (type === 'spider' && !Phys.free(spot.x, spot.y, spot.z, 0.6, 0.9)) return;
    Mobs.spawn(type, spot.x, spot.y, spot.z);
  };
})();
