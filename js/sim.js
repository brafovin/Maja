'use strict';
// Physik der Welt: fließendes Wasser, fallender Sand und Kies, Laub ohne Stamm zerfällt.
// Änderungen an Blöcken melden sich über World.listeners; betroffene Zellen werden
// eingeplant und Schritt für Schritt weiterberechnet (wie die "Ticks" in Minecraft).
(function () {
  const U = G.U, B = G.B, ID = B.ID, World = G.World;
  const ISW = B.ISWATER, LEVEL = B.LEVEL, SOLID = B.SOLID, WASH = B.WASH;
  const Sim = (G.Sim = { falling: [] });

  const WATER_STEP = 0.25; // Sekunden pro Fließschritt
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const water = new Map(); // Zellindex -> Zeitpunkt
  const gravity = new Map();
  const leaves = new Map();
  let now = 0;
  let flowSoundT = 0;

  const inside = (x, y, z) => x >= 0 && z >= 0 && x < World.W && z < World.W && y >= 0 && y < World.H;
  function plan(map, x, y, z, delay) {
    if (!inside(x, y, z)) return;
    const k = World.idx(x, y, z);
    const t = now + delay;
    const old = map.get(k);
    if (old === undefined || old > t) map.set(k, t);
  }
  function unkey(k) {
    const W = World.W, WW = W * W;
    const y = Math.floor(k / WW);
    const r = k - y * WW;
    const z = Math.floor(r / W);
    return [r - z * W, y, z];
  }

  // ---------------------------------------------------------------------------
  // Auf Änderungen reagieren
  // ---------------------------------------------------------------------------
  Sim.onChange = (changes) => {
    for (const [x, y, z, old, nw] of changes) {
      // Wasser: die Zelle selbst und benachbartes Wasser neu berechnen
      if (ISW[nw]) plan(water, x, y, z, WATER_STEP);
      for (const [dx, dy, dz] of N6) {
        if (ISW[World.get(x + dx, y + dy, z + dz)]) plan(water, x + dx, y + dy, z + dz, WATER_STEP);
      }
      // Sand und Kies: liegt noch etwas darunter?
      if (B.GRAVITY[nw]) plan(gravity, x, y, z, 0.05);
      if (B.GRAVITY[World.get(x, y + 1, z)]) plan(gravity, x, y + 1, z, 0.05);
      // Baum gefällt: Laub in der Nähe prüfen
      if ((B.ISLOG[old] && !B.ISLOG[nw]) || (B.ISLEAF[old] && !B.ISLEAF[nw])) {
        for (let dy = -4; dy <= 4; dy++)
          for (let dz = -4; dz <= 4; dz++)
            for (let dx = -4; dx <= 4; dx++)
              if (B.ISLEAF[World.get(x + dx, y + dy, z + dz)]) plan(leaves, x + dx, y + dy, z + dz, U.rand(1, 7));
      }
    }
  };

  // Nach dem Laden: alle geänderten Stellen einmal prüfen
  Sim.wake = (indices) => {
    for (const k of indices) {
      const [x, y, z] = unkey(k);
      plan(water, x, y, z, WATER_STEP + Math.random());
      for (const [dx, dy, dz] of N6) if (ISW[World.get(x + dx, y + dy, z + dz)]) plan(water, x + dx, y + dy, z + dz, WATER_STEP + Math.random());
    }
  };

  Sim.clear = () => {
    water.clear();
    gravity.clear();
    leaves.clear();
    for (const f of Sim.falling) G.scene.remove(f.mesh);
    Sim.falling = [];
  };

  // ---------------------------------------------------------------------------
  // Wasser
  // ---------------------------------------------------------------------------
  // Kann Wasser der Stufe lvl in einen Block mit dieser ID fließen?
  function flowable(b, lvl) {
    if (b === ID.AIR || WASH[b]) return true;
    const l = LEVEL[b];
    return l > 0 && l < 8 && l > lvl;
  }
  // Breitet sich Wasser an dieser Stelle zur Seite aus? (Nur wenn es nicht nach unten fließen kann)
  function spreads(x, y, z) {
    const b = World.get(x, y - 1, z);
    return SOLID[b] === 1 || LEVEL[b] === 0;
  }
  function isHole(x, y, z) {
    const b = World.get(x, y - 1, z);
    return b === ID.AIR || WASH[b] === 1 || (LEVEL[b] > 0 && !SOLID[b]);
  }
  // Wie weit ist das nächste Loch (Abhang) entfernt? Wasser fließt bevorzugt dorthin.
  function holeDistance(sx, y, sz) {
    if (isHole(sx, y, sz)) return 0;
    const seen = new Set([sx + ',' + sz]);
    let front = [[sx, sz]];
    for (let d = 1; d <= 4; d++) {
      const next = [];
      for (const [x, z] of front)
        for (const [dx, dz] of DIRS) {
          const nx = x + dx, nz = z + dz;
          const k = nx + ',' + nz;
          if (seen.has(k)) continue;
          seen.add(k);
          const b = World.get(nx, y, nz);
          if (!(b === ID.AIR || WASH[b] || LEVEL[b] > 0)) continue;
          if (isHole(nx, y, nz)) return d;
          next.push([nx, nz]);
        }
      front = next;
    }
    return 99;
  }

  function stepWater(x, y, z, set) {
    const id = World.get(x, y, z);
    const L = LEVEL[id];
    if (L < 0) return;
    if (L > 0) {
      // Fließendes Wasser: Was gehört jetzt hierher?
      let want = -1;
      if (ISW[World.get(x, y + 1, z)]) want = 8;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of DIRS) {
          const n = World.get(x + dx, y, z + dz);
          const nl = LEVEL[n];
          if (nl < 0) continue;
          if (nl === 0) sources++;
          if (nl === 0 || nl === 8) {
            if (spreads(x + dx, y, z + dz)) best = Math.min(best, 1);
          } else best = Math.min(best, nl + 1);
        }
        if (best <= 7) want = best;
        // Zwei Quellen nebeneinander auf festem Grund ergeben eine neue Quelle
        if (sources >= 2) {
          const below = World.get(x, y - 1, z);
          if (SOLID[below] || LEVEL[below] === 0) want = 0;
        }
      }
      if (want !== L) {
        set(x, y, z, want < 0 ? ID.AIR : B.waterId(want));
        return; // Nachbarn werden über die Änderung neu eingeplant
      }
    }
    // Nach unten fließen
    const below = World.get(x, y - 1, z);
    if (y > 0 && (below === ID.AIR || WASH[below] || (LEVEL[below] > 0 && LEVEL[below] < 8))) {
      wash(x, y - 1, z, below);
      set(x, y - 1, z, ID.WATER_FALL);
      return;
    }
    if (!spreads(x, y, z)) return;
    // Zur Seite ausbreiten, bevorzugt in Richtung des nächsten Abhangs
    const next = L === 0 || L === 8 ? 1 : L + 1;
    if (next > 7) return;
    const cands = [];
    let best = 99;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      const b = World.get(nx, y, nz);
      if (!flowable(b, next) || !inside(nx, y, nz)) continue;
      const d = holeDistance(nx, y, nz);
      cands.push([nx, nz, d, b]);
      best = Math.min(best, d);
    }
    for (const [nx, nz, d, b] of cands) {
      if (best < 99 && d !== best) continue;
      wash(nx, y, nz, b);
      set(nx, y, nz, B.waterId(next));
    }
  }
  // Blumen, Gras und Fackeln werden weggespült und fallen als Gegenstand heraus
  function wash(x, y, z, b) {
    if (!WASH[b]) return;
    for (const [iid, n] of G.Items.blockDrops(b)) G.Ent.dropItem(iid, n, x + 0.5, y + 0.3, z + 0.5);
  }

  // ---------------------------------------------------------------------------
  // Fallender Sand und Kies
  // ---------------------------------------------------------------------------
  function stepGravity(x, y, z, set) {
    const id = World.get(x, y, z);
    if (!B.GRAVITY[id] || y <= 0) return;
    if (SOLID[World.get(x, y - 1, z)]) return;
    set(x, y, z, ID.AIR);
    const mesh = G.Char.blockCube(id, 0.98);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    G.scene.add(mesh);
    Sim.falling.push({ id, x, z, y, vy: 0, mesh });
  }
  function updateFalling(dt, set) {
    for (let i = Sim.falling.length - 1; i >= 0; i--) {
      const f = Sim.falling[i];
      f.vy = Math.max(-30, f.vy - 25 * dt);
      const ny = f.y + f.vy * dt;
      const cy = Math.floor(ny);
      if (cy < 1 || World.isSolid(f.x, cy, f.z)) {
        // gelandet: oben auf dem festen Block wieder einsetzen
        // (ist dort im selben Moment schon ein anderer Block gelandet, darauf stapeln)
        let ly = cy + 1;
        while (ly < World.H - 1 && World.isSolid(f.x, ly, f.z)) ly++;
        const b = World.get(f.x, ly, f.z);
        if (b === ID.AIR || ISW[b] || WASH[b]) {
          wash(f.x, ly, f.z, b);
          set(f.x, ly, f.z, f.id);
          if (Math.hypot(f.x - G.Player.pos.x, f.z - G.Player.pos.z) < 24) G.Audio.play('place', new THREE.Vector3(f.x, ly, f.z), 0.7);
        } else {
          G.Ent.dropItem(f.id, 1, f.x + 0.5, ly + 0.5, f.z + 0.5);
        }
        G.Ent.blockBreak(f.x, ly - 0.5, f.z, f.id);
        G.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        Sim.falling.splice(i, 1);
        continue;
      }
      f.y = ny;
      f.mesh.position.y = ny + 0.5;
    }
  }

  // ---------------------------------------------------------------------------
  // Laub zerfällt, wenn kein Stamm mehr in der Nähe ist
  // ---------------------------------------------------------------------------
  function stepLeaf(x, y, z, set) {
    const id = World.get(x, y, z);
    if (!B.ISLEAF[id]) return;
    const seen = new Set([World.idx(x, y, z)]);
    let front = [[x, y, z]];
    for (let d = 1; d <= 4; d++) {
      const next = [];
      for (const [cx, cy, cz] of front)
        for (const [dx, dy, dz] of N6) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          if (!inside(nx, ny, nz)) continue;
          const k = World.idx(nx, ny, nz);
          if (seen.has(k)) continue;
          seen.add(k);
          const b = World.get(nx, ny, nz);
          if (B.ISLOG[b]) return; // hängt noch am Baum
          if (B.ISLEAF[b]) next.push([nx, ny, nz]);
        }
      front = next;
    }
    for (const [iid, n] of G.Items.blockDrops(id)) G.Ent.dropItem(iid, n, x + 0.5, y + 0.5, z + 0.5);
    const c = B.defs[id].tint || [0.5, 0.7, 0.3];
    G.Ent.burst(x + 0.5, y + 0.5, z + 0.5, [160 * c[0] * 1.4, 200 * c[1], 120 * c[2] * 1.4], 5, 0.8);
    set(x, y, z, ID.AIR);
  }

  // ---------------------------------------------------------------------------
  // Pro Frame
  // ---------------------------------------------------------------------------
  function run(map, limit, fn, set) {
    let n = 0;
    for (const [k, t] of map) {
      if (t > now) continue;
      map.delete(k);
      const [x, y, z] = unkey(k);
      fn(x, y, z, set);
      if (++n >= limit) break;
    }
  }

  Sim.update = (dt) => {
    now += dt;
    flowSoundT -= dt;
    const changes = [];
    const P = G.Player;
    let nearWater = false;
    const set = (x, y, z, id) => {
      const old = World.rawSet(x, y, z, id);
      if (old >= 0) {
        changes.push([x, y, z, old, id]);
        if (ISW[id] && Math.abs(x - P.pos.x) < 14 && Math.abs(z - P.pos.z) < 14 && Math.abs(y - P.pos.y) < 10) nearWater = true;
      }
    };
    run(water, 300, stepWater, set);
    run(gravity, 64, stepGravity, set);
    run(leaves, 24, stepLeaf, set);
    updateFalling(dt, set);
    if (changes.length) World.commit(changes);
    World.tickLight(dt);
    if (nearWater && flowSoundT <= 0) {
      flowSoundT = 0.9;
      G.Audio.play('flow', null, 0.6);
    }
  };

  Sim.pending = () => ({ water: water.size, gravity: gravity.size, leaves: leaves.size, falling: Sim.falling.length });

  World.listeners.push(Sim.onChange);
})();
