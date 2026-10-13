'use strict';
// Einfache Kollision von Quadern (Spieler, Tiere, Monster) mit der Blockwelt
(function () {
  const World = G.World;
  const Phys = (G.Phys = {});
  const EPS = 0.001;

  // e: { pos, vel, hw, h, onGround, collidedH }
  function moveAxis(e, axis, d) {
    if (d === 0) return;
    const p = e.pos;
    const min = [p.x - e.hw, p.y, p.z - e.hw];
    const max = [p.x + e.hw, p.y + e.h, p.z + e.hw];
    const ext = axis === 1 ? 0 : e.hw;
    // Bereich der neu betretenen Zellen entlang der Achse
    let a0, a1, stepDir;
    if (d > 0) {
      a0 = Math.floor(max[axis] - EPS) + 1;
      a1 = Math.floor(max[axis] + d - EPS);
      stepDir = 1;
    } else {
      a0 = Math.floor(min[axis] + EPS) - 1;
      a1 = Math.floor(min[axis] + d + EPS);
      stepDir = -1;
    }
    const o1 = axis === 0 ? 1 : 0;
    const o2 = axis === 2 ? 1 : 2;
    const b0 = Math.floor(min[o1] + EPS), b1 = Math.floor(max[o1] - EPS);
    const c0 = Math.floor(min[o2] + EPS), c1 = Math.floor(max[o2] - EPS);
    let blocked = null;
    for (let a = a0; stepDir > 0 ? a <= a1 : a >= a1; a += stepDir) {
      for (let b = b0; b <= b1 && blocked === null; b++)
        for (let c = c0; c <= c1; c++) {
          const cell = [0, 0, 0];
          cell[axis] = a; cell[o1] = b; cell[o2] = c;
          if (World.isSolid(cell[0], cell[1], cell[2])) { blocked = a; break; }
        }
      if (blocked !== null) break;
    }
    const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
    if (blocked === null) {
      p[key] += d;
      return;
    }
    if (d > 0) {
      p[key] = blocked - (axis === 1 ? e.h : ext) - EPS;
      if (axis === 1) e.vel.y = Math.min(0, e.vel.y);
    } else {
      p[key] = blocked + 1 + ext + EPS;
      if (axis === 1) { e.onGround = true; e.vel.y = 0; }
    }
    if (axis !== 1) { e.collidedH = true; e.vel[key] = 0; }
  }

  Phys.move = (e, dt) => {
    const maxV = Math.max(Math.abs(e.vel.x), Math.abs(e.vel.y), Math.abs(e.vel.z));
    const steps = Math.min(8, Math.max(1, Math.ceil((maxV * dt) / 0.4)));
    const sdt = dt / steps;
    e.onGround = false;
    e.collidedH = false;
    for (let s = 0; s < steps; s++) {
      moveAxis(e, 1, e.vel.y * sdt);
      moveAxis(e, 0, e.vel.x * sdt);
      moveAxis(e, 2, e.vel.z * sdt);
    }
    const W = World;
    e.inWater = W.get(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.35), Math.floor(e.pos.z)) === G.B.ID.WATER;
    e.headInWater = W.get(Math.floor(e.pos.x), Math.floor(e.pos.y + e.h * 0.9), Math.floor(e.pos.z)) === G.B.ID.WATER;
  };

  // Ist ein Quader an der Position frei?
  Phys.free = (x, y, z, hw, h) => {
    for (let cy = Math.floor(y + EPS); cy <= Math.floor(y + h - EPS); cy++)
      for (let cz = Math.floor(z - hw + EPS); cz <= Math.floor(z + hw - EPS); cz++)
        for (let cx = Math.floor(x - hw + EPS); cx <= Math.floor(x + hw - EPS); cx++)
          if (World.isSolid(cx, cy, cz)) return false;
    return true;
  };

  // Automatisch über eine Blockstufe springen, wenn man dagegen läuft
  Phys.canStepUp = (e, dirX, dirZ) => {
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.01) return false;
    const nx = e.pos.x + (dirX / len) * 0.4, nz = e.pos.z + (dirZ / len) * 0.4;
    if (Phys.free(nx, e.pos.y + 0.05, nz, e.hw, e.h)) return false; // nichts im Weg
    return Phys.free(nx, e.pos.y + 1.05, nz, e.hw, e.h) && Phys.free(e.pos.x, e.pos.y + 1.05, e.pos.z, e.hw, e.h);
  };

  // Schnitt Strahl / Quader -> Abstand oder -1
  Phys.rayBox = (ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) => {
    let tmin = -Infinity, tmax = Infinity;
    const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mn[i] || o[i] > mx[i]) return -1;
      } else {
        let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return -1;
      }
    }
    if (tmax < 0) return -1;
    return tmin >= 0 ? tmin : 0;
  };
})();
