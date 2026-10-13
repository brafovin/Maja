'use strict';
// Welt: Daten, Generierung, Bauwerke, Licht, Chunk-Meshes, Karte
(function () {
  const U = G.U, B = G.B, ID = B.ID;
  const W = 384, H = 64, SEA = 24, CS = 16, NC = W / CS;
  const WW = W * W;
  const World = (G.World = { W, H, SEA, CS, NC });
  const SOLID = B.SOLID, OPAQUE = B.OPAQUE, AOC = B.AO, FILTER = B.FILTER, EMIT = B.EMIT;
  const defs = B.defs;

  let blocks = null, light = null, heightMap = null, biomeMap = null, reserved = null;
  const idx = (x, y, z) => y * WW + z * W + x;
  World.idx = idx;

  const BIOME = (World.BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOW: 5, JUNGLE: 6, MOUNTAIN: 7 });
  World.biomeNames = ['Ozean', 'Strand', 'Wiese', 'Wald', 'Wüste', 'Schneeland', 'Dschungel', 'Gebirge'];
  const BIOME_TINT = [
    [0.9, 1, 0.9], [1.04, 1.0, 0.82], [1, 1, 1], [0.84, 0.96, 0.82],
    [1.12, 1.0, 0.62], [0.8, 0.9, 0.92], [0.84, 1.12, 0.64], [0.84, 0.94, 0.88],
  ];

  // ---------------------------------------------------------------------------
  // Zugriff
  // ---------------------------------------------------------------------------
  World.inside = (x, z) => x >= 0 && z >= 0 && x < W && z < W;
  World.get = (x, y, z) => {
    if (y < 0) return ID.BEDROCK;
    if (y >= H) return ID.AIR;
    if (x < 0 || z < 0 || x >= W || z >= W) return y <= SEA ? ID.WATER : ID.AIR;
    return blocks[idx(x, y, z)];
  };
  // Für Kollision: außerhalb der Welt ist eine unsichtbare Wand
  World.isSolid = (x, y, z) => {
    if (y < 0) return true;
    if (y >= H) return false;
    if (x < 0 || z < 0 || x >= W || z >= W) return true;
    return SOLID[blocks[idx(x, y, z)]] === 1;
  };
  World.lightAt = (x, y, z) => {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y >= H || x < 0 || z < 0 || x >= W || z >= W) return { sky: 15, block: 0 };
    if (y < 0) return { sky: 0, block: 0 };
    const l = light[idx(x, y, z)];
    return { sky: l >> 4, block: l & 15 };
  };
  World.heightAt = (x, z) => {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= W || z >= W) return SEA;
    return heightMap[z * W + x];
  };
  World.biomeAt = (x, z) => {
    x = U.clamp(Math.floor(x), 0, W - 1); z = U.clamp(Math.floor(z), 0, W - 1);
    return biomeMap[z * W + x];
  };
  World.biomeTint = (x, z) => BIOME_TINT[World.biomeAt(x, z)];

  // ---------------------------------------------------------------------------
  // Generierung
  // ---------------------------------------------------------------------------
  World.structures = [];
  World.chests = new Map(); // Index -> Array(27) Stacks
  World.mods = new Map(); // Spieler-Änderungen (für Speicherstände)

  World.generate = async function (seed, progress) {
    const rng = U.mulberry32(seed ^ 0x9e3779b9);
    const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    blocks = new Uint8Array(WW * H);
    light = new Uint8Array(WW * H);
    heightMap = new Int16Array(WW);
    biomeMap = new Uint8Array(WW);
    reserved = new Uint8Array(WW);
    World.structures = [];
    World.chests = new Map();
    World.mods = new Map();
    World.seed = seed;

    const nH = new U.Simplex(rng), nDetail = new U.Simplex(rng), nMount = new U.Simplex(rng);
    const nRidge = new U.Simplex(rng), nCoast = new U.Simplex(rng), nWarp = new U.Simplex(rng);

    // Biom-Regionen (Voronoi mit verwackelten Grenzen)
    const regionTypes = [BIOME.PLAINS, BIOME.FOREST, BIOME.DESERT, BIOME.SNOW, BIOME.JUNGLE, BIOME.PLAINS, BIOME.FOREST, BIOME.PLAINS];
    for (let i = regionTypes.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [regionTypes[i], regionTypes[j]] = [regionTypes[j], regionTypes[i]];
    }
    const seeds = [];
    let tries = 0;
    while (seeds.length < regionTypes.length && tries < 5000) {
      tries++;
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * W * 0.34;
      const sx = W / 2 + Math.cos(a) * r, sz = W / 2 + Math.sin(a) * r;
      if (seeds.every((s) => (s.x - sx) ** 2 + (s.z - sz) ** 2 > 78 * 78 - tries * 2))
        seeds.push({ x: sx, z: sz, type: regionTypes[seeds.length] });
    }
    const PARAMS = {
      [BIOME.PLAINS]: { base: 4, amp: 4, mount: 0.55 },
      [BIOME.FOREST]: { base: 5, amp: 6, mount: 0.8 },
      [BIOME.DESERT]: { base: 4, amp: 3.5, mount: 0.12 },
      [BIOME.SNOW]: { base: 6, amp: 7, mount: 1.0 },
      [BIOME.JUNGLE]: { base: 5, amp: 7, mount: 0.6 },
    };
    const regionMap = new Uint8Array(WW);

    progress && progress(0.05, 'Landschaft formen …');
    await U.nextFrame();

    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const wx = x + nWarp.noise2(x / 55, z / 55) * 24;
        const wz = z + nWarp.noise2(x / 55 + 40, z / 55 - 30) * 24;
        let dmin = 1e9, best = 0;
        const ds = [];
        for (let i = 0; i < seeds.length; i++) {
          const d = Math.sqrt((seeds[i].x - wx) ** 2 + (seeds[i].z - wz) ** 2);
          ds.push(d);
          if (d < dmin) { dmin = d; best = i; }
        }
        let wsum = 0, base = 0, amp = 0, mount = 0;
        for (let i = 0; i < seeds.length; i++) {
          const w = Math.exp(-(ds[i] - dmin) / 9);
          const p = PARAMS[seeds[i].type];
          wsum += w; base += p.base * w; amp += p.amp * w; mount += p.mount * w;
        }
        base /= wsum; amp /= wsum; mount /= wsum;
        const region = seeds[best].type;
        regionMap[z * W + x] = region;

        const nx = (x - W / 2) / (W / 2), nz = (z - W / 2) / (W / 2);
        const coast = Math.max(Math.abs(nx), Math.abs(nz)) * 0.45 + Math.sqrt(nx * nx + nz * nz) * 0.55 +
          nCoast.noise2(x / 70, z / 70) * 0.1 + nCoast.noise2(x / 25, z / 25) * 0.03;
        const land = 1 - U.smoothstep(0.7, 0.93, coast);

        let h = SEA + base + amp * U.fbm(nH, x / 95, z / 95, 4) + U.fbm(nDetail, x / 22, z / 22, 2) * 1.6;
        const mmask = U.smoothstep(0.1, 0.5, U.fbm(nMount, x / 150 + 300, z / 150, 2));
        const ridge = 1 - Math.abs(U.fbm(nRidge, x / 60, z / 60, 4));
        h += mount * mmask * ridge * ridge * 28;
        h = U.lerp(SEA - 12, h, land);
        const hi = U.clamp(Math.floor(h), 2, H - 8);
        heightMap[z * W + x] = hi;

        let biome = region;
        if (hi < SEA) biome = BIOME.OCEAN;
        else if (hi <= SEA + 1 && region !== BIOME.SNOW) biome = BIOME.BEACH;
        else if (hi >= SEA + 21) biome = BIOME.MOUNTAIN;
        biomeMap[z * W + x] = biome;
      }
      if (z % 64 === 0) {
        progress && progress(0.05 + (z / W) * 0.2, 'Landschaft formen …');
        await U.nextFrame();
      }
    }

    // Spalten füllen
    for (let z = 0; z < W; z++)
      for (let x = 0; x < W; x++) {
        const top = heightMap[z * W + x];
        const biome = biomeMap[z * W + x];
        const region = regionMap[z * W + x];
        const hr = U.hash2(x, z, seed);
        for (let y = 0; y <= top; y++) {
          let id = ID.STONE;
          const depth = top - y;
          if (y === 0 || (y <= 2 && U.hash2(x * 7 + y, z * 13, seed) < 0.55 / y)) id = ID.BEDROCK;
          else if (depth < 4) {
            switch (biome) {
              case BIOME.OCEAN:
                if (depth < 3) id = top >= SEA - 4 ? ID.SAND : hr < 0.55 ? ID.GRAVEL : ID.DIRT;
                break;
              case BIOME.BEACH:
              case BIOME.DESERT:
                id = depth < 3 ? ID.SAND : ID.SANDSTONE;
                break;
              case BIOME.SNOW:
                id = depth === 0 ? ID.SNOW_GRASS : ID.DIRT;
                break;
              case BIOME.MOUNTAIN: {
                const snowLine = SEA + 26 + Math.floor(hr * 4);
                if (top >= snowLine) id = depth === 0 ? ID.SNOW : ID.STONE;
                else if (top >= SEA + 23) id = ID.STONE;
                else id = depth === 0 ? (region === BIOME.SNOW ? ID.SNOW_GRASS : ID.GRASS) : ID.DIRT;
                break;
              }
              default:
                id = depth === 0 ? ID.GRASS : ID.DIRT;
            }
          }
          blocks[idx(x, y, z)] = id;
        }
        for (let y = top + 1; y <= SEA; y++) {
          // Nur flaches Wasser im Schneeland friert zu
          blocks[idx(x, y, z)] = y === SEA && region === BIOME.SNOW && top >= SEA - 5 ? ID.ICE : ID.WATER;
        }
      }

    progress && progress(0.3, 'Höhlen graben …');
    await U.nextFrame();

    // Höhlen: Wurmgänge
    const isWaterNear = (x, y, z) => {
      for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) {
        const b = World.get(x + dx, y + dy, z + dz);
        if (b === ID.WATER || b === ID.ICE) return true;
      }
      return false;
    };
    const worms = 46;
    for (let w = 0; w < worms; w++) {
      let x = ri(30, W - 30), z = ri(30, W - 30);
      const top = heightMap[z * W + x];
      if (top < SEA) continue;
      let y = ri(6, Math.max(7, top - 4));
      let yaw = rng() * Math.PI * 2, pitch = (rng() - 0.5) * 0.5;
      const steps = ri(70, 170);
      for (let s = 0; s < steps; s++) {
        const r = 1.3 + Math.sin(s * 0.13 + w) * 0.5 + rng() * 0.6;
        const ir = Math.ceil(r);
        for (let dy = -ir; dy <= ir; dy++)
          for (let dz = -ir; dz <= ir; dz++)
            for (let dx = -ir; dx <= ir; dx++) {
              if (dx * dx + dy * dy * 1.6 + dz * dz > r * r) continue;
              const cx = Math.floor(x + dx), cy = Math.floor(y + dy), cz = Math.floor(z + dz);
              if (cx < 2 || cz < 2 || cx >= W - 2 || cz >= W - 2 || cy < 3 || cy >= H - 2) continue;
              const i = idx(cx, cy, cz);
              const b = blocks[i];
              if (b === ID.AIR || b === ID.WATER || b === ID.BEDROCK || b === ID.ICE) continue;
              if (isWaterNear(cx, cy, cz)) continue;
              blocks[i] = ID.AIR;
            }
        x += Math.cos(yaw) * Math.cos(pitch);
        z += Math.sin(yaw) * Math.cos(pitch);
        y += Math.sin(pitch);
        yaw += (rng() - 0.5) * 0.5;
        pitch = pitch * 0.85 + (rng() - 0.5) * 0.3;
        if (y < 5) pitch = Math.abs(pitch) + 0.05;
        if (y > heightMap[U.clamp(Math.floor(z), 0, W - 1) * W + U.clamp(Math.floor(x), 0, W - 1)] - 2 && rng() < 0.6) pitch = -Math.abs(pitch) - 0.05;
      }
    }

    // Erze
    const ores = [
      { id: ID.COAL_ORE, per: 9, size: 9, ymax: 50 },
      { id: ID.IRON_ORE, per: 7, size: 6, ymax: 36 },
      { id: ID.GOLD_ORE, per: 3, size: 6, ymax: 24 },
      { id: ID.DIAMOND_ORE, per: 1.6, size: 4, ymax: 14 },
    ];
    for (const o of ores) {
      const n = Math.floor(NC * NC * o.per);
      for (let k = 0; k < n; k++) {
        let x = ri(1, W - 2), y = ri(2, o.ymax), z = ri(1, W - 2);
        for (let s = 0; s < o.size; s++) {
          if (x > 0 && z > 0 && x < W && z < W && y > 0 && y < H) {
            const i = idx(x, y, z);
            if (blocks[i] === ID.STONE) blocks[i] = o.id;
          }
          const d = Math.floor(rng() * 6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    }

    progress && progress(0.4, 'Dörfer und Tempel bauen …');
    await U.nextFrame();

    buildStructures(rng, ri);

    progress && progress(0.5, 'Bäume pflanzen …');
    await U.nextFrame();

    World.recomputeHeightMap();

    plantVegetation(rng, ri);

    progress && progress(0.6, 'Licht berechnen …');
    await U.nextFrame();

    World.recomputeHeightMap();
    World.computeAllLight();
    World.initMap();
    World.chunks = [];
    for (let cz = 0; cz < NC; cz++)
      for (let cx = 0; cx < NC; cx++) World.chunks.push({ cx, cz, mesh: null, water: null, dirty: true, built: false });
  };

  // ---------------------------------------------------------------------------
  // Hilfen für Bauwerke
  // ---------------------------------------------------------------------------
  function setB(x, y, z, id) {
    if (x < 0 || z < 0 || x >= W || z >= W || y < 1 || y >= H) return;
    blocks[idx(x, y, z)] = id;
  }
  function getB(x, y, z) {
    return World.get(x, y, z);
  }
  function surfaceY(x, z) {
    for (let y = H - 1; y > 0; y--) {
      const b = blocks[idx(x, y, z)];
      if (b !== ID.AIR && SOLID[b] && defs[b].render !== 'leaves' && b !== ID.LOG && b !== ID.BIRCH_LOG && b !== ID.SPRUCE_LOG && b !== ID.JUNGLE_LOG) return y;
      if (b === ID.WATER) return y;
    }
    return 0;
  }
  function reserve(x0, z0, x1, z1, v = 1) {
    for (let z = Math.max(0, z0); z <= Math.min(W - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) reserved[z * W + x] = Math.max(reserved[z * W + x], v);
  }
  function areaInfo(cx, cz, r) {
    let min = 1e9, max = -1e9, sum = 0, n = 0, water = 0, reservedHit = 0;
    const hs = [];
    for (let z = cz - r; z <= cz + r; z += 2)
      for (let x = cx - r; x <= cx + r; x += 2) {
        if (x < 4 || z < 4 || x >= W - 4 || z >= W - 4) return null;
        const h = heightMap[z * W + x];
        if (h <= SEA) water++;
        if (reserved[z * W + x]) reservedHit++;
        min = Math.min(min, h); max = Math.max(max, h);
        sum += h; n++; hs.push(h);
      }
    hs.sort((a, b) => a - b);
    return { min, max, avg: sum / n, median: hs[hs.length >> 1], water, reservedHit, n };
  }
  function regionBiomeCount(cx, cz, r, biome) {
    let c = 0, n = 0;
    for (let z = cz - r; z <= cz + r; z += 4)
      for (let x = cx - r; x <= cx + r; x += 4) {
        n++;
        if (World.biomeAt(x, z) === biome) c++;
      }
    return c / n;
  }
  // Fundament unter einer Fläche und Luft darüber
  function foundation(x0, z0, x1, z1, g, fillId, clearH) {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        for (let y = g; y > 0; y--) {
          const b = getB(x, y, z);
          if (y < g - 1 && SOLID[b] && b !== ID.WATER && defs[b].render !== 'leaves') break;
          setB(x, y, z, y === g ? fillId : fillId === ID.GRASS ? ID.DIRT : fillId);
        }
        for (let y = g + 1; y <= Math.min(H - 1, g + clearH); y++) setB(x, y, z, ID.AIR);
      }
  }

  // Beute in Truhen
  const IT = () => G.Items.ID;
  function makeLoot(table, rng) {
    const slots = new Array(27).fill(null);
    const pickSlot = () => {
      for (let t = 0; t < 40; t++) {
        const s = Math.floor(rng() * 27);
        if (!slots[s]) return s;
      }
      return slots.indexOf(null);
    };
    for (const [id, a, b, p] of table) {
      if (rng() > p) continue;
      const n = a + Math.floor(rng() * (b - a + 1));
      const s = pickSlot();
      if (s < 0) break;
      slots[s] = G.Items.makeStack(id, n);
    }
    return slots;
  }
  function lootTable(kind) {
    const T = IT();
    if (kind === 'house')
      return [
        [T.APPLE, 1, 3, 0.6], [T.BREAD, 1, 3, 0.5], [ID.TORCH, 2, 6, 0.6], [T.COAL, 1, 5, 0.5],
        [T.IRON, 1, 3, 0.35], [T.STONE_PICK, 1, 1, 0.35], [T.STONE_SWORD, 1, 1, 0.2],
        [T.IRON_PICK, 1, 1, 0.08], [ID.PLANKS, 4, 12, 0.4], [ID.WOOL, 1, 3, 0.3], [T.STICK, 2, 6, 0.4],
        [T.MEAT, 1, 2, 0.3], [ID.GLASS, 2, 4, 0.2],
      ];
    if (kind === 'desert')
      return [
        [T.GOLD, 3, 8, 1.0], [T.GOLD, 2, 5, 0.7], [T.DIAMOND, 1, 3, 0.6], [T.IRON, 2, 5, 0.6],
        [T.IRON_PICK, 1, 1, 0.45], [T.IRON_SWORD, 1, 1, 0.3], [T.BREAD, 1, 3, 0.4], [T.BONE, 1, 4, 0.5],
        [T.DIAMOND_SWORD, 1, 1, 0.05], [ID.TORCH, 4, 8, 0.5],
      ];
    return [
      [T.GOLD, 4, 10, 1.0], [T.DIAMOND, 1, 4, 0.7], [T.IRON, 2, 6, 0.6], [T.IRON_PICK, 1, 1, 0.5],
      [T.IRON_SWORD, 1, 1, 0.4], [T.BONE, 1, 4, 0.5], [T.APPLE, 1, 3, 0.4], [T.DIAMOND_PICK, 1, 1, 0.08],
    ];
  }
  function placeChest(x, y, z, kind, rng) {
    setB(x, y, z, ID.CHEST);
    World.chests.set(idx(x, y, z), makeLoot(lootTable(kind), rng));
  }

  // ---------------------------------------------------------------------------
  // Bauwerke
  // ---------------------------------------------------------------------------
  function buildStructures(rng, ri) {
    // Kandidaten sammeln
    const cands = [];
    for (let z = 40; z < W - 40; z += 12)
      for (let x = 40; x < W - 40; x += 12) {
        const a = areaInfo(x, z, 12);
        if (!a || a.water > 0) continue;
        cands.push({ x, z, a, b: World.biomeAt(x, z) });
      }
    const placed = [];
    const farFrom = (x, z, d) => placed.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);

    // Wüstentempel
    const desertC = cands
      .filter((c) => c.b === BIOME.DESERT && c.a.max - c.a.min <= 5 && regionBiomeCount(c.x, c.z, 14, BIOME.DESERT) > 0.7)
      .sort((a, b) => a.a.max - a.a.min - (b.a.max - b.a.min) + (rng() - 0.5) * 2);
    let nDesert = 0;
    for (const c of desertC) {
      if (nDesert >= 2) break;
      if (!farFrom(c.x, c.z, 70)) continue;
      buildDesertTemple(c.x, c.z, c.a, rng);
      placed.push({ x: c.x, z: c.z });
      nDesert++;
    }
    // Dschungeltempel
    const jungleC = cands
      .filter((c) => c.b === BIOME.JUNGLE && c.a.max - c.a.min <= 6 && regionBiomeCount(c.x, c.z, 12, BIOME.JUNGLE) > 0.6)
      .sort((a, b) => a.a.max - a.a.min - (b.a.max - b.a.min) + (rng() - 0.5) * 2);
    let nJungle = 0;
    for (const c of jungleC) {
      if (nJungle >= 2) break;
      if (!farFrom(c.x, c.z, 70)) continue;
      buildJungleTemple(c.x, c.z, c.a, rng);
      placed.push({ x: c.x, z: c.z });
      nJungle++;
    }
    // Falls die Welt keine passenden Biome hat: trotzdem Tempel bauen
    const anyFlat = cands
      .filter((c) => c.a.max - c.a.min <= 4 && c.b !== BIOME.MOUNTAIN)
      .sort(() => rng() - 0.5);
    if (nDesert === 0) {
      const c = anyFlat.find((c) => farFrom(c.x, c.z, 70));
      if (c) { buildDesertTemple(c.x, c.z, c.a, rng, true); placed.push({ x: c.x, z: c.z }); }
    }
    if (nJungle === 0) {
      const c = anyFlat.find((c) => farFrom(c.x, c.z, 70));
      if (c) { buildJungleTemple(c.x, c.z, c.a, rng); placed.push({ x: c.x, z: c.z }); }
    }

    // Dörfer
    const villageC = cands
      .filter((c) => (c.b === BIOME.PLAINS || c.b === BIOME.FOREST || c.b === BIOME.SNOW) && c.a.max - c.a.min <= 5)
      .map((c) => ({ c, score: c.a.max - c.a.min + (c.b === BIOME.PLAINS ? 0 : 2) + rng() * 2 }))
      .sort((a, b) => a.score - b.score);
    let nVill = 0;
    for (const { c } of villageC) {
      if (nVill >= 3) break;
      if (!farFrom(c.x, c.z, 85)) continue;
      const big = areaInfo(c.x, c.z, 20);
      if (!big || big.water > 2 || big.max - big.min > 8) continue;
      buildVillage(c.x, c.z, big, rng, ri, nVill);
      placed.push({ x: c.x, z: c.z });
      nVill++;
    }
    if (nVill === 0 && anyFlat.length) {
      const c = anyFlat.find((c) => farFrom(c.x, c.z, 60)) || anyFlat[0];
      buildVillage(c.x, c.z, c.a, rng, ri, 0);
    }
  }

  function buildDesertTemple(cx, cz, a, rng, sandPatch) {
    const S = 10;
    const g = Math.max(SEA + 1, a.median);
    if (sandPatch) {
      for (let z = cz - S - 6; z <= cz + S + 6; z++)
        for (let x = cx - S - 6; x <= cx + S + 6; x++) {
          if (!World.inside(x, z)) continue;
          if ((x - cx) ** 2 + (z - cz) ** 2 > (S + 6) ** 2) continue;
          const t = surfaceY(x, z);
          if (getB(x, t, z) !== ID.WATER) { setB(x, t, z, ID.SAND); setB(x, t - 1, z, ID.SAND); }
        }
    }
    foundation(cx - S, cz - S, cx + S, cz + S + 1, g, ID.SANDSTONE, 16);
    // Pyramide
    for (let i = 1; i <= S; i++) {
      const half = S - i;
      const y = g + i;
      for (let dz = -half; dz <= half; dz++)
        for (let dx = -half; dx <= half; dx++) {
          const shell = Math.abs(dx) === half || Math.abs(dz) === half;
          let id = ID.SANDSTONE;
          if (!shell && i <= 5) id = ID.AIR;
          if (shell && i === 3 && (dx + dz) % 2 === 0) id = ID.TERRA_ORANGE;
          setB(cx + dx, y, cz + dz, id);
        }
    }
    // Eingangsportal (Süden, +Z)
    for (let dz = S - 2; dz <= S + 1; dz++)
      for (let dx = -3; dx <= 3; dx++)
        for (let y = g + 1; y <= g + 6; y++) {
          let id = ID.SANDSTONE;
          if (y === g + 4) id = ID.TERRA_ORANGE;
          if (Math.abs(dx) === 3 || y === g + 6) id = ID.CHISELED_SANDSTONE;
          if (y === g + 6 && Math.abs(dx) === 2) id = ID.SANDSTONE;
          setB(cx + dx, y, cz + dz, id);
        }
    for (let dz = 3; dz <= S + 1; dz++)
      for (let y = g + 1; y <= g + 2; y++) setB(cx, y, cz + dz, ID.AIR);
    for (let y = g + 1; y <= g + 2; y++) { setB(cx - 1, y, cz + S + 1, ID.CHISELED_SANDSTONE); setB(cx + 1, y, cz + S + 1, ID.CHISELED_SANDSTONE); }
    // Ecktürme
    for (const sx of [-1, 1]) {
      const tx = cx + sx * (S - 1), tz = cz + S - 1;
      for (let y = g + 1; y <= g + 9; y++)
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            let id = ID.SANDSTONE;
            if (y === g + 7) id = ID.TERRA_ORANGE;
            if (y === g + 9) id = dx === 0 && dz === 0 ? ID.CHISELED_SANDSTONE : ID.SANDSTONE;
            if (y === g + 5 && dx === 0 && dz === 1) id = ID.CHISELED_SANDSTONE;
            setB(tx + dx, y, tz + dz, id);
          }
    }
    // Boden-Muster in der Halle
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz));
        let id = ID.SANDSTONE;
        if (m === 1) id = ID.TERRA_ORANGE;
        if (m === 2) id = (dx + dz) % 2 === 0 ? ID.TERRA_ORANGE : ID.CHISELED_SANDSTONE;
        if (m === 0) id = ID.TERRA_BLUE;
        setB(cx + dx, g, cz + dz, id);
      }
    // Geheimkammer unter dem blauen Stein
    const fy = g - 12;
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -5; dx <= 5; dx++)
        for (let y = fy - 1; y < g; y++) setB(cx + dx, y, cz + dz, ID.SANDSTONE);
    for (let y = g - 8; y < g; y++) setB(cx, y, cz, ID.AIR); // Schacht
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        setB(cx + dx, fy, cz + dz, Math.max(Math.abs(dx), Math.abs(dz)) === 2 ? ID.TERRA_ORANGE : ID.SANDSTONE);
        for (let y = fy + 1; y <= fy + 3; y++) setB(cx + dx, y, cz + dz, ID.AIR);
      }
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 4) continue;
        for (let y = fy + 1; y <= fy + 3; y++) {
          let id = y === fy + 2 ? ID.CHISELED_SANDSTONE : ID.SANDSTONE;
          if (y === fy + 2 && (dx + dz) % 2 === 0 && Math.abs(dx) !== Math.abs(dz)) id = ID.GOLD_BLOCK;
          setB(cx + dx, y, cz + dz, id);
        }
      }
    setB(cx, fy + 1, cz, ID.WATER); // weiche Landung
    placeChest(cx + 3, fy + 1, cz, 'desert', rng);
    placeChest(cx - 3, fy + 1, cz, 'desert', rng);
    placeChest(cx, fy + 1, cz + 3, 'desert', rng);
    placeChest(cx, fy + 1, cz - 3, 'desert', rng);
    setB(cx + 3, fy + 1, cz + 3, ID.TORCH);
    setB(cx - 3, fy + 1, cz - 3, ID.TORCH);
    setB(cx + 3, fy + 1, cz - 3, ID.GOLD_BLOCK);
    setB(cx - 3, fy + 1, cz + 3, ID.GOLD_BLOCK);
    reserve(cx - S - 2, cz - S - 2, cx + S + 2, cz + S + 3, 2);
    World.structures.push({
      type: 'desert', name: 'Wüstentempel', x: cx, z: cz, y: g, r: 16, discovered: false, guarded: false,
      spawns: [[cx + 3, g + 1, cz - 3], [cx - 3, g + 1, cz - 3], [cx + 1, fy + 1, cz + 1]],
      hint: 'Unter dem blauen Stein in der Mitte soll Gold versteckt sein …',
    });
  }

  function buildJungleTemple(cx, cz, a, rng) {
    const HX = 6, HZ = 7;
    const g = Math.max(SEA + 1, a.median);
    const mix = () => (rng() < 0.45 ? ID.MOSSY_COBBLE : ID.COBBLE);
    foundation(cx - HX - 1, cz - HZ - 1, cx + HX + 1, cz + HZ + 2, g, ID.COBBLE, 16);
    for (let dz = -HZ - 1; dz <= HZ + 1; dz++)
      for (let dx = -HX - 1; dx <= HX + 1; dx++) setB(cx + dx, g, cz + dz, mix());
    // Erdgeschoss
    for (let dz = -HZ; dz <= HZ; dz++)
      for (let dx = -HX; dx <= HX; dx++) {
        const wall = Math.abs(dx) === HX || Math.abs(dz) === HZ;
        for (let y = g + 1; y <= g + 4; y++) {
          let id = wall ? mix() : ID.AIR;
          const corner = Math.abs(dx) === HX && Math.abs(dz) === HZ;
          if (wall && !corner && y === g + 3 && (dx + dz) % 3 === 0) id = ID.AIR;
          setB(cx + dx, y, cz + dz, id);
        }
        setB(cx + dx, g + 5, cz + dz, mix());
      }
    // Säulen
    for (const [px, pz] of [[-3, -1], [3, -1], [-3, 4], [3, 4]])
      for (let y = g + 1; y <= g + 4; y++) setB(cx + px, y, cz + pz, ID.STONE_BRICKS);
    // Eingang
    for (let y = g + 1; y <= g + 2; y++) { setB(cx, y, cz + HZ, ID.AIR); }
    setB(cx - 1, g + 3, cz + HZ, ID.STONE_BRICKS); setB(cx, g + 3, cz + HZ, ID.STONE_BRICKS); setB(cx + 1, g + 3, cz + HZ, ID.STONE_BRICKS);
    // Obergeschoss (Stufenpyramide)
    for (let lvl = 0; lvl < 4; lvl++) {
      const hx = HX - 1 - lvl, hz = HZ - 1 - lvl;
      const y0 = g + 6 + lvl * 2;
      for (let dz = -hz; dz <= hz; dz++)
        for (let dx = -hx; dx <= hx; dx++)
          for (let y = y0; y <= y0 + 1; y++) setB(cx + dx, y, cz + dz, mix());
    }
    // Geheimraum hinter einer falschen Wand
    for (let dx = -HX + 1; dx <= HX - 1; dx++)
      for (let y = g + 1; y <= g + 4; y++) {
        setB(cx + dx, y, cz - HZ + 3, dx === 0 && y === g + 2 ? ID.MOSSY_COBBLE : ID.STONE_BRICKS);
        for (let dz = -HZ + 1; dz <= -HZ + 2; dz++) setB(cx + dx, y, cz + dz, y <= g + 3 ? ID.AIR : mix());
      }
    for (let dx = -HX + 1; dx <= HX - 1; dx += 2) setB(cx + dx, g + 2, cz - HZ, ID.GOLD_BLOCK);
    placeChest(cx - 3, g + 1, cz - HZ + 1, 'jungle', rng);
    placeChest(cx + 3, g + 1, cz - HZ + 1, 'jungle', rng);
    setB(cx, g + 1, cz - HZ + 1, ID.GOLD_BLOCK);
    setB(cx - 5, g + 1, cz - HZ + 2, ID.TORCH);
    // Treppe vor dem Eingang
    for (let dx = -1; dx <= 1; dx++) setB(cx + dx, g, cz + HZ + 1, ID.STONE_BRICKS);
    reserve(cx - HX - 3, cz - HZ - 3, cx + HX + 3, cz + HZ + 4, 2);
    World.structures.push({
      type: 'jungle', name: 'Dschungeltempel', x: cx, z: cz, y: g, r: 14, discovered: false, guarded: false,
      spawns: [[cx - 2, g + 1, cz + 2], [cx + 2, g + 1, cz + 2], [cx, g + 1, cz]],
      hint: 'Hinter einer Wand aus Steinziegeln soll ein Schatz verborgen sein …',
    });
  }

  // Haus in lokalen Koordinaten mit Drehung bauen (Tür zeigt Richtung rot)
  function buildHouse(x0, z0, w, d, g, rot, style, rng) {
    const map = (lx, lz) => {
      switch (rot) {
        case 0: return [x0 + lx, z0 + lz];
        case 1: return [x0 + (w - 1 - lx), z0 + (d - 1 - lz)];
        case 2: return [x0 + lz, z0 + (w - 1 - lx)];
        default: return [x0 + (d - 1 - lz), z0 + lx];
      }
    };
    const S = (lx, y, lz, id) => { const [x, z] = map(lx, lz); setB(x, y, z, id); };
    const wallId = style === 'brick' ? ID.BRICKS : style === 'stone' ? ID.COBBLE : ID.PLANKS;
    const cornerId = style === 'brick' ? ID.STONE_BRICKS : ID.LOG;
    const roofId = style === 'stone' ? ID.SPRUCE_PLANKS : style === 'brick' ? ID.STONE_BRICKS : ID.BRICKS;
    // Fundament und Luft
    for (let lz = -1; lz <= d; lz++)
      for (let lx = -1; lx <= w; lx++) {
        const [x, z] = map(lx, lz);
        if (!World.inside(x, z)) continue;
        const inner = lx >= 0 && lz >= 0 && lx < w && lz < d;
        for (let y = g; y > 0; y--) {
          const b = getB(x, y, z);
          if (y < g && SOLID[b] && defs[b].render !== 'leaves') break;
          setB(x, y, z, inner ? ID.COBBLE : y === g ? ID.GRASS : ID.DIRT);
        }
        for (let y = g + 1; y <= g + 9; y++) setB(x, y, z, ID.AIR);
      }
    const door = Math.floor(w / 2);
    for (let lz = 0; lz < d; lz++)
      for (let lx = 0; lx < w; lx++) {
        const edge = lx === 0 || lz === 0 || lx === w - 1 || lz === d - 1;
        const corner = (lx === 0 || lx === w - 1) && (lz === 0 || lz === d - 1);
        S(lx, g, lz, edge ? ID.COBBLE : ID.PLANKS);
        if (!edge) continue;
        for (let y = g + 1; y <= g + 3; y++) {
          let id = corner ? cornerId : style === 'stone' && y === g + 1 ? ID.COBBLE : wallId;
          if (!corner && y === g + 2) {
            const along = lz === 0 || lz === d - 1 ? lx : lz;
            const len = lz === 0 || lz === d - 1 ? w : d;
            if (along > 1 && along < len - 2 && along % 2 === 0) id = ID.GLASS;
          }
          if (lz === d - 1 && lx === door && y <= g + 2) id = ID.AIR;
          S(lx, y, lz, id);
        }
      }
    // Satteldach (First entlang x)
    const layers = Math.ceil(d / 2) + 1;
    for (let k = 0; k < layers; k++) {
      const y = g + 4 + k;
      const lzA = k - 1, lzB = d - k;
      if (lzA > lzB) break;
      for (let lx = -1; lx <= w; lx++) {
        S(lx, y, lzA, roofId);
        S(lx, y, lzB, roofId);
      }
      for (let lz = lzA + 1; lz < lzB; lz++) {
        S(0, y, lz, wallId === ID.BRICKS ? ID.BRICKS : ID.PLANKS);
        S(w - 1, y, lz, wallId === ID.BRICKS ? ID.BRICKS : ID.PLANKS);
      }
    }
    // Einrichtung
    S(1, g + 1, 1, ID.BED);
    const [chx, chz] = map(w - 2, 1);
    placeChest(chx, g + 1, chz, 'house', rng);
    if (w >= 7) S(w - 3, g + 1, 1, ID.CRAFTING);
    if (w >= 7 && d >= 7) S(door - 1 > 1 ? 2 : 1, g + 1, 1, ID.BOOKSHELF);
    S(1, g + 1, d - 2, ID.TORCH);
    S(w - 2, g + 1, d - 2, ID.TORCH);
    // Rückgabe: Türposition (Weltkoordinaten vor der Tür)
    const [dx, dz] = map(door, d);
    return { doorX: dx, doorZ: dz };
  }

  function buildVillage(cx, cz, a, rng, ri, num) {
    const g = Math.max(SEA + 1, a.median);
    // Brunnen
    foundation(cx - 3, cz - 3, cx + 3, cz + 3, g, ID.GRAVEL, 8);
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
        if (ring) {
          setB(cx + dx, g, cz + dz, ID.COBBLE);
          setB(cx + dx, g + 1, cz + dz, ID.COBBLE);
        } else {
          setB(cx + dx, g, cz + dz, ID.WATER);
          setB(cx + dx, g - 1, cz + dz, ID.WATER);
          setB(cx + dx, g - 2, cz + dz, ID.COBBLE);
        }
      }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      setB(cx + dx, g + 2, cz + dz, ID.LOG);
      setB(cx + dx, g + 3, cz + dz, ID.LOG);
    }
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) setB(cx + dx, g + 4, cz + dz, ID.COBBLE);
    reserve(cx - 4, cz - 4, cx + 4, cz + 4, 2);

    const houses = [];
    const n = ri(4, 6);
    const styles = ['wood', 'wood', 'stone', 'brick'];
    for (let k = 0; k < n * 3 && houses.length < n; k++) {
      const ang = (houses.length / n) * Math.PI * 2 + rng() * 0.6;
      const rad = 12 + rng() * 6;
      const hx = Math.round(cx + Math.cos(ang) * rad), hz = Math.round(cz + Math.sin(ang) * rad);
      const w = rng() < 0.5 ? 7 : 9, d = rng() < 0.5 ? 7 : 6;
      // Tür Richtung Zentrum
      const vx = cx - hx, vz = cz - hz;
      let rot;
      if (Math.abs(vx) > Math.abs(vz)) rot = vx > 0 ? 2 : 3;
      else rot = vz > 0 ? 0 : 1;
      const fw = rot < 2 ? w : d, fd = rot < 2 ? d : w;
      const x0 = hx - Math.floor(fw / 2), z0 = hz - Math.floor(fd / 2);
      if (x0 < 6 || z0 < 6 || x0 + fw > W - 6 || z0 + fd > W - 6) continue;
      const overlap = houses.some((h) => x0 - 2 < h.x1 && x0 + fw + 2 > h.x0 && z0 - 2 < h.z1 && z0 + fd + 2 > h.z0) ||
        (x0 - 1 < cx + 4 && x0 + fw + 1 > cx - 4 && z0 - 1 < cz + 4 && z0 + fd + 1 > cz - 4);
      if (overlap) continue;
      const ai = areaInfo(hx, hz, 4);
      if (!ai || ai.water > 0) continue;
      const hg = U.clamp(ai.median, g - 2, g + 2);
      const style = styles[Math.floor(rng() * styles.length)];
      const door = buildHouse(x0, z0, w, d, hg, rot, style, rng);
      houses.push({ x0, z0, x1: x0 + fw, z1: z0 + fd, door });
      reserve(x0 - 1, z0 - 1, x0 + fw, z0 + fd, 2);
    }
    // Wege aus Kies
    for (const h of houses) {
      let x = h.door.doorX, z = h.door.doorZ;
      const tx = cx, tz = cz;
      let steps = 0;
      while ((Math.abs(x - tx) > 2 || Math.abs(z - tz) > 2) && steps++ < 60) {
        for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) {
          const px = x + ox, pz = z + oz;
          if (!World.inside(px, pz)) continue;
          if (reserved[pz * W + px] === 2 && !(Math.abs(px - cx) <= 3 && Math.abs(pz - cz) <= 3)) continue;
          const t = surfaceY(px, pz);
          const b = getB(px, t, pz);
          if (b === ID.GRASS || b === ID.DIRT || b === ID.SAND || b === ID.SNOW_GRASS) {
            setB(px, t, pz, ID.GRAVEL);
            for (let y = t + 1; y < t + 4; y++) if (getB(px, y, pz) !== ID.AIR && !SOLID[getB(px, y, pz)]) setB(px, y, pz, ID.AIR);
          }
          reserved[pz * W + px] = Math.max(reserved[pz * W + px], 1);
        }
        if (Math.abs(x - tx) > Math.abs(z - tz)) x += Math.sign(tx - x); else z += Math.sign(tz - z);
        if (steps === 6) {
          // Laterne am Weg
          const lx = x + 2, lz = z;
          if (World.inside(lx, lz) && !reserved[lz * W + lx]) {
            const t = surfaceY(lx, lz);
            if (getB(lx, t, lz) !== ID.WATER) {
              setB(lx, t + 1, lz, ID.COBBLE);
              setB(lx, t + 2, lz, ID.LOG);
              setB(lx, t + 3, lz, ID.TORCH);
              reserved[lz * W + lx] = 2;
            }
          }
        }
      }
    }
    World.structures.push({
      type: 'village', name: 'Dorf', x: cx, z: cz, y: g, r: 26, discovered: false, guarded: true,
      houses: houses.length, hint: 'In den Häusern stehen Truhen mit nützlichen Sachen.',
    });
  }

  // ---------------------------------------------------------------------------
  // Pflanzen
  // ---------------------------------------------------------------------------
  function leafAt(x, y, z, id) {
    if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1 || y >= H - 1) return;
    const i = idx(x, y, z);
    if (blocks[i] === ID.AIR || blocks[i] === ID.TALL_GRASS) blocks[i] = id;
  }
  function trunk(x, y0, h, z, id) {
    for (let y = y0; y < Math.min(H - 2, y0 + h); y++) blocks[idx(x, y, z)] = id;
  }
  function tree(x, z, type, rng) {
    if (x < 4 || z < 4 || x >= W - 4 || z >= W - 4) return false;
    if (reserved[z * W + x]) return false;
    const top = heightMap[z * W + x];
    const gb = blocks[idx(x, top, z)];
    if (type === 'cactus') {
      if (gb !== ID.SAND) return false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (blocks[idx(x + dx, top + 1, z + dz)] !== ID.AIR) return false;
      const h = 1 + Math.floor(rng() * 3);
      trunk(x, top + 1, h, z, ID.CACTUS);
      return true;
    }
    if (gb !== ID.GRASS && gb !== ID.DIRT && gb !== ID.SNOW_GRASS) return false;
    if (blocks[idx(x, top + 1, z)] !== ID.AIR) return false;
    // Abstand zu anderen Stämmen
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const b = blocks[idx(x + dx, top + 1, z + dz)];
        if (b === ID.LOG || b === ID.BIRCH_LOG || b === ID.SPRUCE_LOG || b === ID.JUNGLE_LOG) return false;
      }
    const y0 = top + 1;
    blocks[idx(x, top, z)] = ID.DIRT;
    if (type === 'oak' || type === 'birch') {
      const h = (type === 'oak' ? 4 : 5) + Math.floor(rng() * 3);
      const log = type === 'oak' ? ID.LOG : ID.BIRCH_LOG;
      const lf = type === 'oak' ? ID.LEAVES : ID.BIRCH_LEAVES;
      for (let ly = y0 + h - 3; ly <= y0 + h; ly++) {
        const r = ly >= y0 + h - 1 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && (ly >= y0 + h - 1 || rng() < 0.5)) continue;
            leafAt(x + dx, ly, z + dz, lf);
          }
      }
      trunk(x, y0, h, z, log);
    } else if (type === 'spruce') {
      const h = 6 + Math.floor(rng() * 4);
      const R = [0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3];
      for (let ly = y0 + h; ly >= y0 + 2; ly--) {
        const k = y0 + h - ly;
        const r = R[Math.min(k, R.length - 1)];
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
            leafAt(x + dx, ly, z + dz, ID.SPRUCE_LEAVES);
          }
      }
      trunk(x, y0, h, z, ID.SPRUCE_LOG);
    } else if (type === 'jungle') {
      const h = 8 + Math.floor(rng() * 6);
      const RR = [3, 3, 2, 1];
      for (let k = 0; k < 4; k++) {
        const ly = y0 + h - 2 + k;
        const r = RR[k];
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dz * dz > r * r + 1) continue;
            leafAt(x + dx, ly, z + dz, ID.JUNGLE_LEAVES);
          }
      }
      // Seitenbüschel
      for (let s = 0; s < 2; s++) {
        const ly = y0 + 3 + Math.floor(rng() * (h - 5));
        const dir = Math.floor(rng() * 4);
        const ox = [1, -1, 0, 0][dir] * 2, oz = [0, 0, 1, -1][dir] * 2;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) leafAt(x + ox + dx, ly, z + oz + dz, ID.JUNGLE_LEAVES);
      }
      trunk(x, y0, h, z, ID.JUNGLE_LOG);
    }
    return true;
  }

  function plantVegetation(rng) {
    for (let z = 2; z < W - 2; z++)
      for (let x = 2; x < W - 2; x++) {
        const b = biomeMap[z * W + x];
        const r = rng();
        let type = null, p = 0;
        switch (b) {
          case BIOME.PLAINS: p = 0.004; type = rng() < 0.85 ? 'oak' : 'birch'; break;
          case BIOME.FOREST: p = 0.05; type = rng() < 0.65 ? 'oak' : 'birch'; break;
          case BIOME.JUNGLE: p = 0.07; type = rng() < 0.8 ? 'jungle' : 'oak'; break;
          case BIOME.SNOW: p = 0.025; type = 'spruce'; break;
          case BIOME.MOUNTAIN: p = 0.008; type = 'spruce'; break;
          case BIOME.DESERT: p = 0.006; type = 'cactus'; break;
        }
        if (type && r < p) tree(x, z, type, rng);
      }
    // Gras, Blumen, tote Büsche
    for (let z = 1; z < W - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        if (reserved[z * W + x] === 2) continue;
        const top = heightMap[z * W + x];
        if (top + 1 >= H) continue;
        const above = idx(x, top + 1, z);
        if (blocks[above] !== ID.AIR) continue;
        const gb = blocks[idx(x, top, z)];
        const b = biomeMap[z * W + x];
        const r = rng();
        if (gb === ID.GRASS) {
          const pg = b === BIOME.PLAINS ? 0.14 : b === BIOME.JUNGLE ? 0.18 : b === BIOME.FOREST ? 0.07 : 0.04;
          const pf = b === BIOME.PLAINS ? 0.022 : b === BIOME.FOREST ? 0.01 : 0.003;
          if (r < pf) blocks[above] = rng() < 0.5 ? ID.FLOWER_RED : ID.FLOWER_YELLOW;
          else if (r < pf + pg) blocks[above] = ID.TALL_GRASS;
        } else if (gb === ID.SAND && b === BIOME.DESERT && r < 0.008) blocks[above] = ID.DEAD_BUSH;
      }
  }

  // ---------------------------------------------------------------------------
  // Höhenkarte (höchster Block, der Regen/Schnee aufhält)
  // ---------------------------------------------------------------------------
  function columnTop(x, z) {
    for (let y = H - 1; y >= 0; y--) {
      const b = blocks[idx(x, y, z)];
      if (b !== ID.AIR && defs[b].render !== 'cross' && b !== ID.TORCH) return y;
    }
    return 0;
  }
  World.recomputeHeightMap = () => {
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) heightMap[z * W + x] = columnTop(x, z);
  };

  // ---------------------------------------------------------------------------
  // Licht (Himmelslicht + Blocklicht, je 0..15)
  // ---------------------------------------------------------------------------
  const QSIZE = 1 << 22, QMASK = QSIZE - 1;
  const queue = new Int32Array(QSIZE);
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  function skyColumn(x, z) {
    let s = 15;
    for (let y = H - 1; y >= 0; y--) {
      const i = idx(x, y, z);
      const f = FILTER[blocks[i]];
      if (f >= 15) s = 0;
      else if (f > 0) s = Math.max(0, s - f);
      light[i] = (s << 4) | EMIT[blocks[i]];
    }
  }

  function propagate(head, tail, bounds) {
    // bounds: [x0,z0,x1,z1] oder null
    while (head !== tail) {
      const i = queue[head];
      head = (head + 1) & QMASK;
      const l = light[i];
      const s = l >> 4, bl = l & 15;
      if (s <= 1 && bl <= 1) continue;
      const y = (i / WW) | 0;
      const rem = i - y * WW;
      const z = (rem / W) | 0;
      const x = rem - z * W;
      for (let k = 0; k < 6; k++) {
        const nx = x + NB[k][0], ny = y + NB[k][1], nz = z + NB[k][2];
        if (nx < 0 || nz < 0 || nx >= W || nz >= W || ny < 0 || ny >= H) continue;
        if (bounds && (nx < bounds[0] || nz < bounds[1] || nx > bounds[2] || nz > bounds[3])) continue;
        const ni = idx(nx, ny, nz);
        const f = FILTER[blocks[ni]];
        if (f >= 15) continue;
        const nl = light[ni];
        let ns = s - 1 - f;
        if (k === 3 && s === 15 && f === 0) ns = 15;
        const nb = bl - 1 - f;
        let changed = false;
        let os = nl >> 4, ob = nl & 15;
        if (ns > os) { os = ns; changed = true; }
        if (nb > ob) { ob = nb; changed = true; }
        if (changed) {
          light[ni] = (os << 4) | ob;
          queue[tail] = ni;
          tail = (tail + 1) & QMASK;
        }
      }
    }
  }

  World.computeAllLight = () => {
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) skyColumn(x, z);
    // Startpunkte: Zellen mit Licht neben dunkleren, lichtdurchlässigen Zellen
    let head = 0, tail = 0;
    for (let y = 0; y < H; y++)
      for (let z = 0; z < W; z++)
        for (let x = 0; x < W; x++) {
          const i = idx(x, y, z);
          const l = light[i];
          if (l === 0) continue;
          const s = l >> 4, b = l & 15;
          if (s === 15 && b === 0) {
            // nur wenn ein seitlicher Nachbar dunkler und durchlässig ist
            let need = false;
            if (x > 0 && light[i - 1] >> 4 < 14 && FILTER[blocks[i - 1]] < 15) need = true;
            else if (x < W - 1 && light[i + 1] >> 4 < 14 && FILTER[blocks[i + 1]] < 15) need = true;
            else if (z > 0 && light[i - W] >> 4 < 14 && FILTER[blocks[i - W]] < 15) need = true;
            else if (z < W - 1 && light[i + W] >> 4 < 14 && FILTER[blocks[i + W]] < 15) need = true;
            else if (y > 0 && light[i - WW] >> 4 < 14 && FILTER[blocks[i - WW]] < 15) need = true;
            if (!need) continue;
          }
          queue[tail] = i;
          tail = (tail + 1) & QMASK;
          if (tail === head) { console.warn('Lichtwarteschlange voll'); break; }
        }
    propagate(head, tail, null);
  };

  // Licht in einem Bereich neu berechnen, gibt geänderte Grenzen zurück
  function relight(x0, z0, x1, z1) {
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(W - 1, x1); z1 = Math.min(W - 1, z1);
    const sx = x1 - x0 + 1, sz = z1 - z0 + 1;
    const old = new Uint8Array(sx * sz * H);
    for (let y = 0; y < H; y++)
      for (let z = z0; z <= z1; z++) {
        const base = idx(x0, y, z);
        old.set(light.subarray(base, base + sx), (y * sz + (z - z0)) * sx);
      }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) skyColumn(x, z);
    let head = 0, tail = 0;
    const push = (i) => { queue[tail] = i; tail = (tail + 1) & QMASK; };
    for (let y = 0; y < H; y++)
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (x < 0 || z < 0 || x >= W || z >= W) continue;
          const i = idx(x, y, z);
          if (light[i] > 0) {
            // Inneres: nur Ränder von Licht nötig; einfach alle mit Licht
            if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
              if (light[i] === 0xf0) {
                const s = light;
                let need = false;
                if (x > 0 && s[i - 1] >> 4 < 14 && FILTER[blocks[i - 1]] < 15) need = true;
                else if (x < W - 1 && s[i + 1] >> 4 < 14 && FILTER[blocks[i + 1]] < 15) need = true;
                else if (z > 0 && s[i - W] >> 4 < 14 && FILTER[blocks[i - W]] < 15) need = true;
                else if (z < W - 1 && s[i + W] >> 4 < 14 && FILTER[blocks[i + W]] < 15) need = true;
                else if (y > 0 && s[i - WW] >> 4 < 14 && FILTER[blocks[i - WW]] < 15) need = true;
                if (!need) continue;
              }
              push(i);
            } else push(i);
          }
        }
    propagate(head, tail, [x0, z0, x1, z1]);
    // Änderungen suchen
    let cx0 = 1e9, cz0 = 1e9, cx1 = -1e9, cz1 = -1e9;
    for (let y = 0; y < H; y++)
      for (let z = z0; z <= z1; z++) {
        const base = idx(x0, y, z);
        const ob = (y * sz + (z - z0)) * sx;
        for (let k = 0; k < sx; k++) {
          if (light[base + k] !== old[ob + k]) {
            const x = x0 + k;
            if (x < cx0) cx0 = x;
            if (x > cx1) cx1 = x;
            if (z < cz0) cz0 = z;
            if (z > cz1) cz1 = z;
          }
        }
      }
    return cx0 <= cx1 ? [cx0, cz0, cx1, cz1] : null;
  }

  // ---------------------------------------------------------------------------
  // Blöcke setzen (zur Laufzeit)
  // ---------------------------------------------------------------------------
  function markDirtyRange(x0, z0, x1, z1) {
    const c0x = Math.max(0, Math.floor(x0 / CS)), c1x = Math.min(NC - 1, Math.floor(x1 / CS));
    const c0z = Math.max(0, Math.floor(z0 / CS)), c1z = Math.min(NC - 1, Math.floor(z1 / CS));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) World.chunks[cz * NC + cx].dirty = true;
  }
  World.markDirtyRange = markDirtyRange;

  function afterChange(minX, minZ, maxX, maxZ) {
    for (let z = Math.max(0, minZ); z <= Math.min(W - 1, maxZ); z++)
      for (let x = Math.max(0, minX); x <= Math.min(W - 1, maxX); x++) heightMap[z * W + x] = columnTop(x, z);
    const ch = relight(minX - 15, minZ - 15, maxX + 15, maxZ + 15);
    markDirtyRange(minX - 1, minZ - 1, maxX + 1, maxZ + 1);
    if (ch) markDirtyRange(ch[0] - 1, ch[1] - 1, ch[2] + 1, ch[3] + 1);
    for (let z = Math.max(0, minZ); z <= Math.min(W - 1, maxZ + 1); z++)
      for (let x = Math.max(0, minX); x <= Math.min(W - 1, maxX); x++) World.updateMapColumn(x, z);
    World.mapDirty = true;
  }

  World.setBlock = (x, y, z, id) => {
    if (x < 0 || z < 0 || x >= W || z >= W || y < 0 || y >= H) return false;
    const i = idx(x, y, z);
    if (blocks[i] === id) return false;
    blocks[i] = id;
    World.mods.set(i, id);
    afterChange(x, z, x, z);
    return true;
  };
  World.setBlocks = (list) => {
    if (!list.length) return;
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    for (const [x, y, z, id] of list) {
      if (x < 0 || z < 0 || x >= W || z >= W || y < 0 || y >= H) continue;
      const i = idx(x, y, z);
      blocks[i] = id;
      World.mods.set(i, id);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    if (minX <= maxX) afterChange(minX, minZ, maxX, maxZ);
  };
  // Änderungen aus einem Speicherstand anwenden (vor dem Licht)
  World.applyMods = (pairs) => {
    for (const [i, id] of pairs) {
      if (i >= 0 && i < blocks.length && defs[id]) {
        blocks[i] = id;
        World.mods.set(i, id);
      }
    }
    World.recomputeHeightMap();
    World.computeAllLight();
    World.initMap();
  };

  // ---------------------------------------------------------------------------
  // Strahl-Test (Voxel-DDA)
  // ---------------------------------------------------------------------------
  World.raycast = (ox, oy, oz, dx, dy, dz, maxDist, solidOnly) => {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : 1e9;
    let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : 1e9;
    let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : 1e9;
    let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : 1e9;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let s = 0; s < 400; s++) {
      const id = World.get(x, y, z);
      if (id !== ID.AIR && id !== ID.WATER && (!solidOnly || OPAQUE[id] || SOLID[id])) {
        if (World.inside(x, z) || solidOnly) return { x, y, z, nx, ny, nz, dist: t, id };
      }
      if (solidOnly && !World.inside(x, z) && y <= SEA + 2) return { x, y, z, nx, ny, nz, dist: t, id: ID.STONE };
      if (tmx < tmy && tmx < tmz) {
        x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0;
      } else if (tmy < tmz) {
        y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0;
      } else {
        z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz;
      }
      if (t > maxDist) return null;
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // Chunk-Meshing
  // ---------------------------------------------------------------------------
  const PX = 18, PY = H + 2, SY = PX * PX;
  const pb = new Uint8Array(PX * PX * PY);
  const pl = new Uint8Array(PX * PX * PY);
  const pbiome = new Uint8Array(PX * PX);

  class MeshBuf {
    constructor() { this.cap = 4096; this.n = 0; this.alloc(this.cap); }
    alloc(cap) {
      const o = this.pos;
      const np = new Int16Array(cap * 12), nu = new Uint16Array(cap * 8), nc = new Uint8Array(cap * 12), nl = new Uint8Array(cap * 8), ni = new Uint32Array(cap * 6);
      if (o) {
        np.set(this.pos.subarray(0, this.n * 12)); nu.set(this.uv.subarray(0, this.n * 8));
        nc.set(this.col.subarray(0, this.n * 12)); nl.set(this.lit.subarray(0, this.n * 8)); ni.set(this.ind.subarray(0, this.n * 6));
      }
      this.pos = np; this.uv = nu; this.col = nc; this.lit = nl; this.ind = ni; this.cap = cap;
    }
    // p: 12 px-Koordinaten, uv: 8 (0..1), c: 12 (0..2), l: 8 (0..15)
    quad(p, uv, c, l, flip) {
      if (this.n >= this.cap) this.alloc(this.cap * 2);
      const n = this.n, v = n * 4;
      for (let k = 0; k < 12; k++) this.pos[n * 12 + k] = p[k];
      for (let k = 0; k < 8; k++) this.uv[n * 8 + k] = Math.round(uv[k] * 65535);
      for (let k = 0; k < 12; k++) this.col[n * 12 + k] = Math.min(255, Math.round(c[k] * 127.5));
      for (let k = 0; k < 8; k++) this.lit[n * 8 + k] = Math.round(l[k] * 17);
      const I = this.ind, o = n * 6;
      if (flip) { I[o] = v + 1; I[o + 1] = v + 2; I[o + 2] = v + 3; I[o + 3] = v + 1; I[o + 4] = v + 3; I[o + 5] = v; }
      else { I[o] = v; I[o + 1] = v + 1; I[o + 2] = v + 2; I[o + 3] = v; I[o + 4] = v + 2; I[o + 5] = v + 3; }
      this.n++;
    }
  }
  const mbSolid = new MeshBuf(), mbWater = new MeshBuf();

  const FACES = [
    { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.76 },
    { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.76 },
    { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 },
    { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.56 },
    { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.88 },
    { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.88 },
  ];
  const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const off = (dx, dy, dz) => dx + dz * PX + dy * SY;
  for (const f of FACES) {
    f.o = off(f.d[0], f.d[1], f.d[2]);
    const axes = [0, 1, 2].filter((a) => f.d[a] === 0);
    f.ao = f.c.map((c) => {
      const e1 = [0, 0, 0], e2 = [0, 0, 0];
      e1[axes[0]] = c[axes[0]] ? 1 : -1;
      e2[axes[1]] = c[axes[1]] ? 1 : -1;
      const s1 = off(f.d[0] + e1[0], f.d[1] + e1[1], f.d[2] + e1[2]);
      const s2 = off(f.d[0] + e2[0], f.d[1] + e2[1], f.d[2] + e2[2]);
      const cc = off(f.d[0] + e1[0] + e2[0], f.d[1] + e1[1] + e2[1], f.d[2] + e1[2] + e2[2]);
      return [s1, s2, cc];
    });
  }
  const AO_F = [0.42, 0.62, 0.82, 1.0];
  const EPS = 0.0004;

  // Gemeinsame Puffer für ein Quad
  const qp = new Array(12), quv = new Array(8), qc = new Array(12), ql = new Array(8);

  function fillPadded(cx, cz) {
    const x0 = cx * CS - 1, z0 = cz * CS - 1;
    for (let py = 0; py < PY; py++) {
      const y = py - 1;
      for (let pz = 0; pz < PX; pz++) {
        const z = z0 + pz;
        for (let px = 0; px < PX; px++) {
          const x = x0 + px;
          const pi = px + pz * PX + py * SY;
          if (y < 0) { pb[pi] = ID.BEDROCK; pl[pi] = 0; continue; }
          if (y >= H) { pb[pi] = ID.AIR; pl[pi] = 0xf0; continue; }
          if (x < 0 || z < 0 || x >= W || z >= W) {
            pb[pi] = y <= SEA ? ID.WATER : ID.AIR;
            pl[pi] = y <= SEA ? (Math.max(0, 15 - (SEA - y) * 2) << 4) : 0xf0;
            continue;
          }
          const i = idx(x, y, z);
          pb[pi] = blocks[i];
          pl[pi] = light[i];
        }
      }
    }
    for (let pz = 0; pz < PX; pz++)
      for (let px = 0; px < PX; px++) {
        const x = U.clamp(x0 + px, 0, W - 1), z = U.clamp(z0 + pz, 0, W - 1);
        pbiome[px + pz * PX] = biomeMap[z * W + x];
      }
  }

  function emitCube(mb, x, y, z, pi, d, fi, tileIdx, tint, yTop) {
    const f = FACES[fi];
    const t = B.tileUV(tileIdx);
    const ni = pi + f.o;
    let a0 = 0, a2 = 0, a1 = 0, a3 = 0;
    for (let k = 0; k < 4; k++) {
      const c = f.c[k];
      qp[k * 3] = (x + c[0]) * 16;
      qp[k * 3 + 1] = c[1] ? yTop : y * 16;
      qp[k * 3 + 2] = (z + c[2]) * 16;
      quv[k * 2] = U.lerp(t[0] + EPS, t[2] - EPS, UVC[k][0]);
      quv[k * 2 + 1] = U.lerp(t[1] + EPS, t[3] - EPS, UVC[k][1]);
      const ao = f.ao[k];
      const b1 = AOC[pb[pi + ao[0]]], b2 = AOC[pb[pi + ao[1]]], bc = AOC[pb[pi + ao[2]]];
      const lvl = b1 && b2 ? 0 : 3 - (b1 + b2 + bc);
      if (k === 0) a0 = lvl; else if (k === 1) a1 = lvl; else if (k === 2) a2 = lvl; else a3 = lvl;
      const shade = f.s * AO_F[lvl];
      qc[k * 3] = shade * tint[0];
      qc[k * 3 + 1] = shade * tint[1];
      qc[k * 3 + 2] = shade * tint[2];
      // weiches Licht: Mittel der lichtdurchlässigen Nachbarzellen
      let l = pl[ni];
      let ss = l >> 4, sb = l & 15, n = 1;
      const o1 = OPAQUE[pb[pi + ao[0]]], o2 = OPAQUE[pb[pi + ao[1]]];
      if (!o1) { l = pl[pi + ao[0]]; ss += l >> 4; sb += l & 15; n++; }
      if (!o2) { l = pl[pi + ao[1]]; ss += l >> 4; sb += l & 15; n++; }
      if (!(o1 && o2) && !OPAQUE[pb[pi + ao[2]]]) { l = pl[pi + ao[2]]; ss += l >> 4; sb += l & 15; n++; }
      ql[k * 2] = ss / n;
      ql[k * 2 + 1] = sb / n;
    }
    mb.quad(qp, quv, qc, ql, a0 + a2 < a1 + a3);
  }

  // Box-förmige Blöcke (Fackel, Kaktus, Truhe, Bett)
  function emitBox(mb, x, y, z, pi, d, frontFace) {
    const b = d.box;
    const l = pl[pi];
    const ls = l >> 4, lb = l & 15;
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
      // auf der Blockgrenze und Nachbar undurchsichtig -> weglassen
      const onEdge = (fi === 0 && b[3] === 16) || (fi === 1 && b[0] === 0) || (fi === 2 && b[4] === 16) ||
        (fi === 3 && b[1] === 0) || (fi === 4 && b[5] === 16) || (fi === 5 && b[2] === 0);
      if (onEdge && OPAQUE[pb[pi + f.o]]) continue;
      let tileIdx = d.faceTiles[fi];
      if (frontFace === fi && d.frontTile != null) tileIdx = d.frontTile;
      const t = B.tileUV(tileIdx);
      let nl = l;
      if (onEdge) nl = pl[pi + f.o];
      const fs = onEdge ? nl >> 4 : ls, fb = onEdge ? nl & 15 : lb;
      for (let k = 0; k < 4; k++) {
        const c = f.c[k];
        const px = c[0] ? b[3] : b[0], py = c[1] ? b[4] : b[1], pz = c[2] ? b[5] : b[2];
        qp[k * 3] = x * 16 + px;
        qp[k * 3 + 1] = y * 16 + py;
        qp[k * 3 + 2] = z * 16 + pz;
        let u, v;
        switch (fi) {
          case 0: u = 16 - pz; v = py; break;
          case 1: u = pz; v = py; break;
          case 2: u = px; v = 16 - pz; break;
          case 3: u = px; v = pz; break;
          case 4: u = px; v = py; break;
          default: u = 16 - px; v = py;
        }
        if (d.render === 'torch' && fi === 2) v += 1;
        quv[k * 2] = U.lerp(t[0] + EPS, t[2] - EPS, U.clamp(u / 16, 0, 1));
        quv[k * 2 + 1] = U.lerp(t[1] + EPS, t[3] - EPS, U.clamp(v / 16, 0, 1));
        qc[k * 3] = qc[k * 3 + 1] = qc[k * 3 + 2] = f.s;
        ql[k * 2] = fs;
        ql[k * 2 + 1] = d.light ? 15 : fb;
      }
      mb.quad(qp, quv, qc, ql, false);
    }
  }

  function emitCross(mb, x, y, z, pi, d, tint) {
    const t = B.tileUV(d.faceTiles[0]);
    const l = pl[pi];
    const ls = l >> 4, lb = l & 15;
    const quads = [
      [[2, 0, 2], [14, 0, 14], [14, 16, 14], [2, 16, 2]],
      [[14, 0, 14], [2, 0, 2], [2, 16, 2], [14, 16, 14]],
      [[2, 0, 14], [14, 0, 2], [14, 16, 2], [2, 16, 14]],
      [[14, 0, 2], [2, 0, 14], [2, 16, 14], [14, 16, 2]],
    ];
    for (const q of quads) {
      for (let k = 0; k < 4; k++) {
        qp[k * 3] = x * 16 + q[k][0];
        qp[k * 3 + 1] = y * 16 + q[k][1];
        qp[k * 3 + 2] = z * 16 + q[k][2];
        quv[k * 2] = U.lerp(t[0] + EPS, t[2] - EPS, UVC[k][0]);
        quv[k * 2 + 1] = U.lerp(t[1] + EPS, t[3] - EPS, UVC[k][1]);
        qc[k * 3] = 0.92 * tint[0]; qc[k * 3 + 1] = 0.92 * tint[1]; qc[k * 3 + 2] = 0.92 * tint[2];
        ql[k * 2] = ls;
        ql[k * 2 + 1] = lb;
      }
      mb.quad(qp, quv, qc, ql, false);
    }
  }

  const ONE = [1, 1, 1];
  const GRASS_PLANT = [0.62, 0.95, 0.4];
  World.buildChunk = (ch) => {
    const { cx, cz } = ch;
    fillPadded(cx, cz);
    mbSolid.n = 0;
    mbWater.n = 0;
    let maxY = 0;
    for (let z = cz * CS; z < cz * CS + CS; z++)
      for (let x = cx * CS; x < cx * CS + CS; x++) maxY = Math.max(maxY, heightMap[z * W + x]);
    maxY = Math.min(H - 1, maxY + 1);
    const tintTmp = [1, 1, 1];
    for (let y = 0; y <= maxY; y++)
      for (let lz = 0; lz < CS; lz++)
        for (let lx = 0; lx < CS; lx++) {
          const pi = (lx + 1) + (lz + 1) * PX + (y + 1) * SY;
          const id = pb[pi];
          if (id === 0) continue;
          const d = defs[id];
          const r = d.render;
          if (r === 'cube' || r === 'leaves' || r === 'glass') {
            for (let fi = 0; fi < 6; fi++) {
              const nid = pb[pi + FACES[fi].o];
              if (OPAQUE[nid]) continue;
              if (nid === id && r !== 'cube') continue;
              if (r === 'leaves' && defs[nid].render === 'leaves') continue;
              let tint = ONE;
              if (d.tint === 'biome') {
                if (fi === 2) {
                  const bt = BIOME_TINT[pbiome[(lx + 1) + (lz + 1) * PX]];
                  tintTmp[0] = bt[0]; tintTmp[1] = bt[1]; tintTmp[2] = bt[2];
                  tint = tintTmp;
                }
              } else if (d.tint) tint = d.tint;
              emitCube(mbSolid, lx, y, lz, pi, d, fi, d.faceTiles[fi], tint, (y + 1) * 16);
            }
          } else if (r === 'water') {
            const above = pb[pi + SY];
            const top = above === ID.WATER ? (y + 1) * 16 : y * 16 + 14;
            for (let fi = 0; fi < 6; fi++) {
              const nid = pb[pi + FACES[fi].o];
              if (nid === ID.WATER || OPAQUE[nid]) continue;
              if (fi === 3 && nid !== ID.AIR) continue;
              emitCube(mbWater, lx, y, lz, pi, d, fi, d.faceTiles[fi], ONE, top);
            }
          } else if (r === 'cross') {
            let tint = ONE;
            if (d.tint === 'biome') {
              const bt = BIOME_TINT[pbiome[(lx + 1) + (lz + 1) * PX]];
              tintTmp[0] = bt[0] * GRASS_PLANT[0]; tintTmp[1] = bt[1] * GRASS_PLANT[1]; tintTmp[2] = bt[2] * GRASS_PLANT[2];
              tint = tintTmp;
            }
            emitCross(mbSolid, lx, y, lz, pi, d, tint);
          } else if (r === 'box' || r === 'torch') {
            let front = -1;
            if (d.frontTile != null) {
              const order = [4, 5, 0, 1];
              for (const fi of order) if (!SOLID[pb[pi + FACES[fi].o]]) { front = fi; break; }
              if (front < 0) front = 4;
            }
            emitBox(mbSolid, lx, y, lz, pi, d, front);
          }
        }
    // alte Meshes entfernen
    disposeChunk(ch);
    ch.mesh = makeMesh(mbSolid, World.matSolid, cx, cz, maxY);
    ch.water = makeMesh(mbWater, World.matWater, cx, cz, maxY);
    if (ch.mesh) World.scene.add(ch.mesh);
    if (ch.water) { ch.water.renderOrder = 1; World.scene.add(ch.water); }
    ch.dirty = false;
    ch.built = true;
  };

  function freeArray() { this.array = null; }
  function makeMesh(mb, mat, cx, cz, maxY) {
    if (mb.n === 0) return null;
    const nv = mb.n * 4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mb.pos.slice(0, nv * 3), 3).onUpload(freeArray));
    g.setAttribute('uv', new THREE.BufferAttribute(mb.uv.slice(0, nv * 2), 2, true).onUpload(freeArray));
    g.setAttribute('aColor', new THREE.BufferAttribute(mb.col.slice(0, nv * 3), 3, true).onUpload(freeArray));
    g.setAttribute('aLight', new THREE.BufferAttribute(mb.lit.slice(0, nv * 2), 2, true).onUpload(freeArray));
    const ind = mb.ind.subarray(0, mb.n * 6);
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? ind.slice() : Uint16Array.from(ind), 1).onUpload(freeArray));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(128, (maxY * 16) / 2, 128), Math.sqrt(128 * 128 * 2 + (maxY * 8) ** 2) + 16);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(256, maxY * 16 + 16, 256));
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * CS, 0, cz * CS);
    m.scale.setScalar(1 / 16);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
  function disposeChunk(ch) {
    for (const k of ['mesh', 'water']) {
      if (ch[k]) {
        World.scene.remove(ch[k]);
        ch[k].geometry.dispose();
        ch[k] = null;
      }
    }
    ch.built = false;
  }

  // Chunks rund um die Kamera bauen / freigeben
  World.updateChunks = (px, pz, radius, budgetMs, force) => {
    const t0 = performance.now();
    const pcx = px / CS - 0.5, pcz = pz / CS - 0.5;
    const list = [];
    for (const ch of World.chunks) {
      const d = Math.hypot(ch.cx - pcx, ch.cz - pcz);
      if (d > radius + 1.5) {
        if (ch.built) disposeChunk(ch);
        continue;
      }
      if (d <= radius + 0.5 && (!ch.built || ch.dirty)) list.push({ ch, d: ch.built ? d + 2 : d });
    }
    list.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const { ch } of list) {
      World.buildChunk(ch);
      built++;
      if (!force && performance.now() - t0 > budgetMs) break;
    }
    return { built, pending: list.length - built };
  };
  World.disposeAll = () => {
    if (World.chunks) for (const ch of World.chunks) disposeChunk(ch);
  };

  // ---------------------------------------------------------------------------
  // Materialien (eigener Shader für Licht, Tag/Nacht und Nebel)
  // ---------------------------------------------------------------------------
  const VERT = `
    attribute vec3 aColor;
    attribute vec2 aLight;
    varying vec2 vUv;
    varying vec3 vColor;
    varying vec2 vLight;
    varying float vDist;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vColor = aColor * 2.0;
      vLight = aLight * 15.0;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    uniform sampler2D map;
    uniform float uSkyDrop;
    uniform vec3 uSkyTint;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uAlphaTest;
    uniform float uOpacity;
    uniform float uFlash;
    uniform float uTime;
    uniform float uWater;
    uniform float uGamma;
    varying vec2 vUv;
    varying vec3 vColor;
    varying vec2 vLight;
    varying float vDist;
    varying vec3 vWorld;
    void main() {
      vec4 t = texture2D(map, vUv);
      if (t.a < uAlphaTest) discard;
      float s = max(vLight.x - uSkyDrop, vLight.x * uFlash);
      float b = vLight.y;
      float L = clamp(max(s, b), 0.0, 15.0);
      float br = pow(0.84, 15.0 - L);
      br = max(br, 0.035) * uGamma;
      float torch = smoothstep(s - 1.5, s + 1.5, b);
      vec3 tint = mix(uSkyTint, vec3(1.08, 0.92, 0.72), torch);
      vec3 col = t.rgb * vColor * br * tint;
      if (uWater > 0.5) {
        col *= 0.92 + 0.08 * sin(uTime * 1.7 + vWorld.x * 0.8 + vWorld.z * 0.6);
      }
      float f = smoothstep(uFogNear, uFogFar, vDist);
      gl_FragColor = vec4(mix(col, uFogColor, f), t.a * uOpacity);
    }`;

  World.uniforms = {
    map: { value: B.texture },
    uSkyDrop: { value: 0 },
    uSkyTint: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
    uFogNear: { value: 40 },
    uFogFar: { value: 90 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uGamma: { value: 1 },
  };
  World.createMaterials = (scene) => {
    World.scene = scene;
    const u = World.uniforms;
    World.matSolid = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, u, { uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 }, uWater: { value: 0 } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    World.matWater = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, u, { uAlphaTest: { value: 0.01 }, uOpacity: { value: 0.72 }, uWater: { value: 1 } }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  };

  // ---------------------------------------------------------------------------
  // Karte (Draufsicht)
  // ---------------------------------------------------------------------------
  World.initMap = () => {
    if (!World.mapCanvas) {
      World.mapCanvas = U.canvas(W, W);
      World.mapCtx = World.mapCanvas.getContext('2d');
      World.mapImg = World.mapCtx.createImageData(W, W);
    }
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) World.updateMapColumn(x, z);
    World.mapCtx.putImageData(World.mapImg, 0, 0);
    World.mapDirty = false;
  };
  World.updateMapColumn = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= W) return;
    let y = H - 1, id = 0;
    for (; y > 0; y--) {
      id = blocks[idx(x, y, z)];
      if (id !== ID.AIR && id !== ID.TORCH && id !== ID.TALL_GRASS) break;
    }
    const d = defs[id];
    let c = d.map;
    let r = c[0], g = c[1], b = c[2];
    if (d.tint === 'biome') {
      const t = BIOME_TINT[biomeMap[z * W + x]];
      r *= t[0]; g *= t[1]; b *= t[2];
    }
    if (id === ID.WATER) {
      let depth = 0;
      while (depth < 12 && blocks[idx(x, y - depth - 1, z)] === ID.WATER) depth++;
      const f = 1 - depth * 0.035;
      r *= f; g *= f; b *= f;
    } else {
      const hn = z > 0 ? (() => { let yy = H - 1; for (; yy > 0; yy--) { const bb = blocks[idx(x, yy, z - 1)]; if (bb !== ID.AIR && bb !== ID.TORCH && bb !== ID.TALL_GRASS) break; } return yy; })() : y;
      const f = y > hn ? 1.12 : y < hn ? 0.84 : 1;
      r *= f; g *= f; b *= f;
    }
    const o = (z * W + x) * 4;
    const D = World.mapImg.data;
    D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = 255;
  };
  World.flushMap = () => {
    if (World.mapDirty) {
      World.mapCtx.putImageData(World.mapImg, 0, 0);
      World.mapDirty = false;
    }
  };

  // Spawn-Punkt in der Nähe des ersten Dorfes suchen
  World.findSpawn = () => {
    const v = World.structures.find((s) => s.type === 'village') || { x: W / 2, z: W / 2 };
    for (let r = 4; r < 120; r++) {
      for (let a = 0; a < 24; a++) {
        const x = Math.round(v.x + Math.cos((a / 24) * Math.PI * 2) * r);
        const z = Math.round(v.z + Math.sin((a / 24) * Math.PI * 2) * r);
        if (!World.inside(x, z) || reserved[z * W + x] === 2) continue;
        const y = heightMap[z * W + x];
        const b = blocks[idx(x, y, z)];
        if (y <= SEA || !SOLID[b] || defs[b].render === 'leaves') continue;
        if (World.isSolid(x, y + 1, z) || World.isSolid(x, y + 2, z)) continue;
        return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
    return { x: W / 2, y: H - 2, z: W / 2 };
  };
  World.surfaceY = (x, z) => surfaceY(U.clamp(Math.floor(x), 0, W - 1), U.clamp(Math.floor(z), 0, W - 1));
  World.isReserved = (x, z) => (World.inside(x, z) ? reserved[z * W + x] : 0);
})();
