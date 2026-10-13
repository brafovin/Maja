'use strict';
// Gegenstände am Boden, Partikel, Pfeile, Explosionen, Schatten
(function () {
  const U = G.U, B = G.B, ID = B.ID, World = G.World, Phys = G.Phys;
  const Ent = (G.Ent = { drops: [], arrows: [] });

  // ---------------------------------------------------------------------------
  // Runde Schatten unter Figuren
  // ---------------------------------------------------------------------------
  let shadowTex = null;
  function getShadowTex() {
    if (shadowTex) return shadowTex;
    const c = U.canvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
    return shadowTex;
  }
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  Ent.makeShadow = (size) => {
    const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: getShadowTex(), transparent: true, depthWrite: false, fog: true }));
    m.scale.set(size * 1.4, 1, size * 1.4);
    m.renderOrder = 2;
    G.scene.add(m);
    return m;
  };
  Ent.placeShadow = (m, pos, alpha) => {
    if (!m) return;
    const x = Math.floor(pos.x), z = Math.floor(pos.z);
    let y = Math.floor(pos.y + 0.01);
    let k = 0;
    for (; k < 5; k++) if (World.isSolid(x, y - 1 - k, z)) break;
    if (k >= 5) { m.visible = false; return; }
    const gy = y - k;
    m.position.set(pos.x, gy + 0.015, pos.z);
    m.material.opacity = alpha * (1 - (pos.y - gy) / 5);
  };

  // ---------------------------------------------------------------------------
  // Partikel (instanzierte kleine Würfel)
  // ---------------------------------------------------------------------------
  const MAXP = 500;
  const parts = [];
  let pmesh = null;
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  Ent.init = (scene) => {
    pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: true }), MAXP);
    pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAXP; i++) pmesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
    pmesh.count = 0;
    pmesh.frustumCulled = false;
    scene.add(pmesh);
  };
  // kind: 'block' (fällt), 'fire', 'smoke', 'spark'
  Ent.burst = (x, y, z, rgb, n, spread = 2, kind = 'block', size = 0.09) => {
    const L = World.lightAt(x, y, z);
    const br = kind === 'fire' || kind === 'spark' ? 1 : G.Sky.entityBrightness(L.sky, L.block);
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      const life = kind === 'smoke' ? U.rand(0.8, 1.6) : kind === 'fire' ? U.rand(0.3, 0.6) : U.rand(0.4, 0.9);
      parts.push({
        x: x + U.rand(-0.2, 0.2), y: y + U.rand(-0.2, 0.2), z: z + U.rand(-0.2, 0.2),
        vx: U.rand(-1, 1) * spread, vy: kind === 'smoke' || kind === 'fire' ? U.rand(0.5, 1.5) : U.rand(0.5, 1.6) * spread, vz: U.rand(-1, 1) * spread,
        life, max: life, kind,
        size: size * U.rand(0.7, 1.3) * (kind === 'smoke' ? 2.5 : 1),
        r: (rgb[0] / 255) * br * U.rand(0.85, 1.1), g: (rgb[1] / 255) * br * U.rand(0.85, 1.1), b: (rgb[2] / 255) * br * U.rand(0.85, 1.1),
      });
    }
  };
  Ent.blockBreak = (x, y, z, id) => {
    const d = B.defs[id];
    let c = B.tileColor(d.faceTiles[0]);
    if (Array.isArray(d.tint)) c = [c[0] * d.tint[0], c[1] * d.tint[1], c[2] * d.tint[2]];
    Ent.burst(x + 0.5, y + 0.5, z + 0.5, c, 14, 1.6);
  };
  function updateParticles(dt) {
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.kind === 'block') {
        p.vy -= 18 * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        if (World.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
          p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
        } else { p.x = nx; p.y = ny; p.z = nz; }
      } else {
        p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
    }
    for (const p of parts) {
      if (n >= MAXP) break;
      const k = p.life / p.max;
      let s = p.size;
      if (p.kind === 'smoke') s *= 1 + (1 - k) * 1.5;
      else s *= Math.min(1, k * 2.5);
      tmpP.set(p.x, p.y, p.z);
      tmpS.set(s, s, s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      pmesh.setMatrixAt(n, tmpM);
      pmesh.setColorAt(n, tmpC.setRGB(p.r, p.g, p.b));
      n++;
    }
    pmesh.count = n;
    pmesh.instanceMatrix.needsUpdate = true;
    if (pmesh.instanceColor) pmesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Gegenstände am Boden
  // ---------------------------------------------------------------------------
  Ent.dropItem = (id, n, x, y, z, vel, dur) => {
    const mat = new THREE.SpriteMaterial({ map: G.Items.iconTexture(id), alphaTest: 0.4, fog: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.38, 0.38, 0.38);
    G.scene.add(sp);
    const d = {
      id, n, dur, sprite: sp,
      pos: new THREE.Vector3(x, y, z),
      vel: vel ? vel.clone() : new THREE.Vector3(U.rand(-1.5, 1.5), U.rand(2, 4), U.rand(-1.5, 1.5)),
      hw: 0.12, h: 0.25, age: 0, t: Math.random() * 6, onGround: false,
    };
    Ent.drops.push(d);
    return d;
  };
  function updateDrops(dt, player) {
    for (let i = Ent.drops.length - 1; i >= 0; i--) {
      const d = Ent.drops[i];
      d.age += dt;
      d.t += dt;
      const dx = player.pos.x - d.pos.x, dy = player.pos.y + 0.8 - d.pos.y, dz = player.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (player.alive && d.age > 0.5 && dist < 1.8 && !d.full) {
        // zum Spieler fliegen
        d.pos.x += (dx / dist) * Math.min(dist, dt * 9);
        d.pos.y += (dy / dist) * Math.min(dist, dt * 9);
        d.pos.z += (dz / dist) * Math.min(dist, dt * 9);
        if (dist < 0.6) {
          const left = player.giveItem(d.id, d.n, d.dur);
          if (left < d.n) G.Audio.play('pickup');
          if (left === 0) {
            G.scene.remove(d.sprite);
            d.sprite.material.dispose();
            Ent.drops.splice(i, 1);
            continue;
          }
          d.n = left;
          d.full = true;
        }
      } else {
        if (d.full && d.age % 2 < dt) d.full = false;
        d.vel.y -= 20 * dt;
        d.vel.x *= 1 - Math.min(1, dt * (d.onGround ? 8 : 1));
        d.vel.z *= 1 - Math.min(1, dt * (d.onGround ? 8 : 1));
        Phys.move(d, dt);
        if (d.inWater) d.vel.y = 1;
        const flow = World.flowAt(Math.floor(d.pos.x), Math.floor(d.pos.y + 0.05), Math.floor(d.pos.z));
        if (flow) { d.vel.x += flow.x * dt * 14; d.vel.z += flow.z * dt * 14; }
      }
      d.sprite.position.set(d.pos.x, d.pos.y + 0.22 + Math.sin(d.t * 3) * 0.05, d.pos.z);
      const L = World.lightAt(d.pos.x, d.pos.y + 0.3, d.pos.z);
      const br = G.Sky.entityBrightness(L.sky, L.block);
      d.sprite.material.color.setRGB(br, br, br);
      if (d.age > 300 || d.pos.y < -10) {
        G.scene.remove(d.sprite);
        d.sprite.material.dispose();
        Ent.drops.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pfeile (von Skeletten)
  // ---------------------------------------------------------------------------
  const arrowGeo = new THREE.BoxGeometry(0.04, 0.04, 0.55);
  const arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const tipGeo = new THREE.BoxGeometry(0.08, 0.08, 0.1);
  const tipMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  Ent.shootArrow = (from, to, shooter) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(arrowGeo, arrowMat));
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.z = 0.3;
    g.add(tip);
    const dir = to.clone().sub(from);
    const dist = dir.length();
    const speed = 22;
    const t = dist / speed;
    // Schwerkraft ausgleichen und etwas ungenau zielen
    const v = dir.multiplyScalar(1 / t);
    v.y += 0.5 * 14 * t;
    v.x += U.rand(-0.8, 0.8);
    v.z += U.rand(-0.8, 0.8);
    g.position.copy(from);
    G.scene.add(g);
    Ent.arrows.push({ mesh: g, pos: from.clone(), vel: v, stuck: 0, shooter });
    G.Audio.play('bow', from);
  };
  function updateArrows(dt, player) {
    for (let i = Ent.arrows.length - 1; i >= 0; i--) {
      const a = Ent.arrows[i];
      if (a.stuck > 0) {
        a.stuck -= dt;
        if (a.stuck <= 0) { G.scene.remove(a.mesh); Ent.arrows.splice(i, 1); }
        continue;
      }
      a.vel.y -= 14 * dt;
      const step = a.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().normalize();
      const hit = World.raycast(a.pos.x, a.pos.y, a.pos.z, dir.x, dir.y, dir.z, len, true);
      // Spieler getroffen?
      if (player.alive) {
        const t = Phys.rayBox(a.pos.x, a.pos.y, a.pos.z, dir.x, dir.y, dir.z,
          player.pos.x - 0.35, player.pos.y, player.pos.z - 0.35, player.pos.x + 0.35, player.pos.y + 1.85, player.pos.z + 0.35);
        if (t >= 0 && t <= len && (!hit || t < hit.dist)) {
          player.hurt(2, a.pos.x - a.vel.x, a.pos.z - a.vel.z, 'Skelett');
          G.scene.remove(a.mesh);
          Ent.arrows.splice(i, 1);
          continue;
        }
      }
      if (hit) {
        a.pos.addScaledVector(dir, hit.dist - 0.1);
        a.stuck = 4;
        a.mesh.position.copy(a.pos);
        G.Audio.play('arrowHit', a.pos);
        continue;
      }
      a.pos.add(step);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      if (a.pos.y < -10 || Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z) > 80) {
        G.scene.remove(a.mesh);
        Ent.arrows.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Explosion (Creeper)
  // ---------------------------------------------------------------------------
  Ent.explode = (x, y, z, r) => {
    const list = [];
    const ir = Math.ceil(r + 1);
    let drops = 0;
    for (let dy = -ir; dy <= ir; dy++)
      for (let dz = -ir; dz <= ir; dz++)
        for (let dx = -ir; dx <= ir; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > r + U.rand(-0.6, 0.6)) continue;
          const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
          const id = World.get(bx, by, bz);
          if (id === ID.AIR || B.ISWATER[id] || id === ID.BEDROCK || id === ID.CHEST) continue;
          if (!World.inside(bx, bz) || by <= 0) continue;
          list.push([bx, by, bz, ID.AIR]);
          if (drops < 12 && Math.random() < 0.25) {
            const dd = G.Items.blockDrops(id);
            for (const [iid, n] of dd) { Ent.dropItem(iid, n, bx + 0.5, by + 0.5, bz + 0.5); drops++; }
          }
        }
    World.setBlocks(list);
    for (let i = 0; i < 26; i++) Ent.burst(x + U.rand(-r, r), y + U.rand(-1, r), z + U.rand(-r, r), [70, 70, 70], 1, 1, 'smoke', 0.3);
    Ent.burst(x, y, z, [255, 200, 90], 18, 4, 'spark', 0.12);
    G.Audio.play('boom', new THREE.Vector3(x, y, z));
    const P = G.Player;
    const pd = Math.hypot(P.pos.x - x, P.pos.y + 0.9 - y, P.pos.z - z);
    if (pd < r * 2.2 && P.alive) {
      const dmg = Math.round((1 - pd / (r * 2.2)) * 14);
      if (dmg > 0) P.hurt(dmg, x, z, 'Creeper', 9);
    }
    P.shake = Math.max(P.shake, Math.max(0, 1 - pd / 20));
    for (const m of G.Mobs.list) {
      if (m.dead) continue;
      const md = Math.hypot(m.pos.x - x, m.pos.y + m.h / 2 - y, m.pos.z - z);
      if (md < r * 2) m.damage(Math.round((1 - md / (r * 2)) * 14), x, z, false);
    }
  };

  Ent.clear = () => {
    for (const d of Ent.drops) { G.scene.remove(d.sprite); d.sprite.material.dispose(); }
    Ent.drops = [];
    for (const a of Ent.arrows) G.scene.remove(a.mesh);
    Ent.arrows = [];
    parts.length = 0;
  };

  Ent.update = (dt, player) => {
    updateParticles(dt);
    updateDrops(dt, player);
    updateArrows(dt, player);
  };
})();
