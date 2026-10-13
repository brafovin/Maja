'use strict';
// Gegenstände, Werkzeuge, Rezepte und Inventar
(function () {
  const U = G.U, B = G.B, ID = B.ID;
  const I = (G.Items = {});

  const IT = (I.ID = {
    STICK: 100, COAL: 101, IRON: 102, GOLD: 103, DIAMOND: 104, APPLE: 105, BREAD: 106,
    MEAT: 107, FEATHER: 108, LEATHER: 109, BONE: 110, STRING: 111, GUNPOWDER: 112,
    BUCKET: 113, WATER_BUCKET: 114,
    WOOD_PICK: 120, STONE_PICK: 121, IRON_PICK: 122, DIAMOND_PICK: 123,
    WOOD_AXE: 124, STONE_AXE: 125, IRON_AXE: 126, DIAMOND_AXE: 127,
    WOOD_SHOVEL: 128, STONE_SHOVEL: 129, IRON_SHOVEL: 130, DIAMOND_SHOVEL: 131,
    WOOD_SWORD: 132, STONE_SWORD: 133, IRON_SWORD: 134, DIAMOND_SWORD: 135,
  });

  const defs = (I.defs = {});

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  const iconCanvases = {};
  const iconURLs = {};

  function blockIcon(d) {
    const c = U.canvas(32, 32);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (d.render === 'cross' || d.render === 'torch') {
      const tint = d.tint === 'biome' ? [0.62, 0.95, 0.4] : null;
      ctx.drawImage(B.tileCanvas(d.faceTiles[0], tint), 0, 0, 32, 32);
      return c;
    }
    let tint = null;
    if (Array.isArray(d.tint)) tint = d.tint;
    const topTint = d.tint === 'biome' ? [1, 1, 1] : tint;
    const top = B.tileCanvas(d.iconTop, topTint);
    const side = B.tileCanvas(d.iconTile, tint);
    const front = d.frontTile != null ? B.tileCanvas(d.frontTile, tint) : side;
    // Isometrischer Würfel
    const faces = [
      { img: top, t: [14 / 16, -7 / 16, 14 / 16, 7 / 16, 2, 9], dark: 0 },
      { img: front, t: [14 / 16, 7 / 16, 0, 15 / 16, 2, 9], dark: 0.22 },
      { img: side, t: [14 / 16, -7 / 16, 0, 15 / 16, 16, 16], dark: 0.4 },
    ];
    for (const f of faces) {
      ctx.setTransform(...f.t);
      ctx.drawImage(f.img, 0, 0);
      if (f.dark) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(0,0,0,${f.dark})`;
        ctx.fillRect(0, 0, 16, 16);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  // 16x16-Pixelbild als Funktion zeichnen, auf 32x32 skaliert
  function pixelIcon(draw) {
    const s = U.canvas(16, 16);
    const sctx = s.getContext('2d');
    const P = sctx.createImageData(16, 16);
    const put = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const i = (y * 16 + x) * 4;
      P.data[i] = c[0]; P.data[i + 1] = c[1]; P.data[i + 2] = c[2]; P.data[i + 3] = 255;
    };
    draw(put);
    sctx.putImageData(P, 0, 0);
    const c = U.canvas(32, 32);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, 0, 0, 32, 32);
    return c;
  }

  const STICK_D = [92, 64, 30], STICK_L = [146, 104, 52];
  function handle(put, x0, y0, len) {
    for (let i = 0; i < len; i++) {
      put(x0 + i, y0 - i, STICK_D);
      put(x0 + i + 1, y0 - i, STICK_L);
    }
  }
  const MATS = {
    wood: { h: [150, 116, 64], H: [196, 156, 96], k: [98, 74, 40] },
    stone: { h: [128, 128, 128], H: [176, 176, 176], k: [78, 78, 78] },
    iron: { h: [214, 214, 214], H: [255, 255, 255], k: [140, 140, 140] },
    diamond: { h: [74, 222, 214], H: [186, 255, 250], k: [26, 140, 132] },
  };
  function toolIcon(kind, mat) {
    const m = MATS[mat];
    return pixelIcon((put) => {
      if (kind === 'pickaxe') {
        handle(put, 2, 13, 8);
        for (let a = 0; a <= 1; a += 0.02) {
          const ang = (88 - a * 86) * Math.PI / 180;
          const x1 = 2.5 + 11 * Math.cos(ang), y1 = 13.5 - 11 * Math.sin(ang);
          const x2 = 2.5 + 10 * Math.cos(ang), y2 = 13.5 - 10 * Math.sin(ang);
          put(x2, y2, m.h);
          put(x1, y1, a > 0.15 && a < 0.6 ? m.H : m.k);
        }
      } else if (kind === 'axe') {
        handle(put, 2, 13, 10);
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const dx = x - 8, dy = y - 4;
            if (dx * dx + dy * dy < 13 && x + y <= 14) put(x, y, (x + y === 14) ? m.k : (dx < -1 ? m.H : m.h));
          }
      } else if (kind === 'shovel') {
        handle(put, 2, 13, 8);
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const dx = x - 11.2, dy = y - 4.2;
            const d = dx * dx + dy * dy;
            if (d < 9) put(x, y, d < 3 ? m.H : m.h);
            else if (d < 12) put(x, y, m.k);
          }
      } else if (kind === 'sword') {
        for (let i = 1; i < 10; i++) {
          put(4 + i, 11 - i, m.H);
          put(5 + i, 11 - i, m.h);
          put(4 + i, 12 - i, m.k);
        }
        put(14, 1, m.H);
        for (let j = -2; j <= 2; j++) put(4 + j, 11 + j, [70, 50, 30]);
        put(3, 12, STICK_L); put(2, 13, STICK_D); put(1, 14, STICK_L);
        put(0, 15, [70, 50, 30]);
      }
    });
  }

  function blob(put, cx, cy, rx, ry, c, hl) {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) {
          let col = c;
          if (hl && (x - cx) / rx + (y - cy) / ry < -0.9 && d < 0.7) col = hl;
          else if (d > 0.72) col = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
          put(x, y, col);
        }
      }
  }

  const itemIcons = {
    [IT.STICK]: () => pixelIcon((put) => handle(put, 3, 13, 10)),
    [IT.COAL]: () => pixelIcon((put) => {
      blob(put, 8, 8.5, 5, 4.5, [44, 44, 46], [96, 96, 100]);
      [[6, 7], [10, 9], [8, 11]].forEach(([x, y]) => put(x, y, [20, 20, 22]));
    }),
    [IT.IRON]: () => ingot([214, 214, 220], [255, 255, 255], [140, 140, 150]),
    [IT.GOLD]: () => ingot([250, 212, 60], [255, 246, 170], [190, 140, 20]),
    [IT.DIAMOND]: () => pixelIcon((put) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const d = Math.abs(x - 7.5) + Math.abs(y - 7.5) * 1.15;
          if (d < 6.5) put(x, y, d > 5.4 ? [26, 140, 132] : x < 7 && y < 8 ? [190, 255, 250] : [80, 228, 220]);
        }
    }),
    [IT.APPLE]: () => pixelIcon((put) => {
      blob(put, 8, 9.5, 5, 4.6, [214, 36, 40], [255, 140, 130]);
      put(8, 4, [92, 64, 30]); put(8, 3, [92, 64, 30]);
      put(9, 3, [60, 150, 40]); put(10, 2, [60, 150, 40]); put(10, 3, [80, 180, 50]);
    }),
    [IT.BREAD]: () => pixelIcon((put) => {
      blob(put, 8, 9, 7, 3.6, [196, 134, 62], [236, 190, 110]);
      [[5, 8], [6, 7], [9, 8], [10, 7]].forEach(([x, y]) => put(x, y, [150, 96, 40]));
    }),
    [IT.MEAT]: () => pixelIcon((put) => {
      for (let i = 0; i < 5; i++) { put(9 + i, 9 + i, [230, 222, 200]); put(10 + i, 9 + i, [200, 190, 170]); }
      put(14, 13, [240, 235, 220]); put(13, 14, [240, 235, 220]);
      blob(put, 7, 7, 5, 4, [200, 86, 76], [240, 150, 140]);
    }),
    [IT.FEATHER]: () => pixelIcon((put) => {
      for (let i = 0; i < 11; i++) {
        put(3 + i, 13 - i, [150, 150, 150]);
        if (i > 1) { put(3 + i, 12 - i, [240, 240, 240]); put(4 + i, 13 - i, [220, 220, 224]); }
        if (i > 3 && i < 10) { put(2 + i, 12 - i, [250, 250, 250]); put(5 + i, 13 - i, [236, 236, 240]); }
      }
    }),
    [IT.LEATHER]: () => pixelIcon((put) => {
      for (let y = 3; y < 13; y++)
        for (let x = 3; x < 13; x++) {
          if ((x === 3 || x === 12) && (y === 3 || y === 12)) continue;
          put(x, y, (x + y) % 5 === 0 ? [120, 70, 36] : [156, 94, 52]);
        }
    }),
    [IT.BONE]: () => pixelIcon((put) => {
      for (let i = 0; i < 9; i++) { put(4 + i, 11 - i, [236, 232, 214]); put(5 + i, 11 - i, [206, 200, 180]); }
      [[3, 11], [4, 12], [3, 12], [13, 3], [12, 2], [13, 2]].forEach(([x, y]) => put(x, y, [246, 244, 232]));
    }),
    [IT.STRING]: () => pixelIcon((put) => {
      for (let x = 2; x < 14; x++) put(x, Math.round(8 + Math.sin(x * 0.9) * 2.5), [236, 236, 236]);
    }),
    [ID.BED]: () => pixelIcon((put) => {
      const wood = [120, 84, 46], dark = [80, 54, 28], red = [196, 38, 42], redD = [150, 26, 30], white = [240, 240, 236];
      for (let y = 3; y <= 13; y++) { put(1, y, dark); put(2, y, wood); }
      for (let y = 7; y <= 13; y++) { put(13, y, wood); put(14, y, dark); }
      for (let x = 1; x <= 14; x++) { put(x, 10, wood); put(x, 11, dark); }
      for (let x = 3; x <= 12; x++) for (let y = 7; y <= 9; y++) put(x, y, y === 7 ? red : x > 5 ? (y === 9 ? redD : red) : white);
      for (let x = 3; x <= 5; x++) put(x, 6, white);
      put(1, 12, dark); put(1, 13, dark); put(14, 12, dark); put(14, 13, dark);
    }),
    [IT.BUCKET]: () => bucket(false),
    [IT.WATER_BUCKET]: () => bucket(true),
    [IT.GUNPOWDER]: () => pixelIcon((put) => {
      const r = U.mulberry32(5);
      for (let y = 6; y < 14; y++)
        for (let x = 2; x < 14; x++)
          if (Math.abs(x - 7.5) < (y - 5) * 0.9 && r() < 0.8) put(x, y, r() < 0.5 ? [80, 80, 80] : [120, 120, 120]);
    }),
  };
  function bucket(water) {
    return pixelIcon((put) => {
      for (let x = 3; x <= 12; x++) put(x, 4 - Math.round(2.6 * Math.sin((Math.PI * (x - 3)) / 9)), [90, 90, 96]);
      for (let y = 4; y <= 13; y++) {
        const inset = Math.floor((y - 4) / 4);
        for (let x = 3 + inset; x <= 12 - inset; x++) {
          let c = [196, 196, 204];
          if (x === 3 + inset) c = [236, 236, 242];
          if (x === 12 - inset || y === 13) c = [120, 120, 128];
          if (y === 4) c = [80, 80, 88];
          if (water && y >= 5 && y <= 6 && x > 3 + inset && x < 12 - inset) c = y === 5 ? [120, 170, 250] : [52, 98, 206];
          put(x, y, c);
        }
      }
    });
  }
  function ingot(c, hl, dk) {
    return pixelIcon((put) => {
      for (let y = 5; y < 12; y++)
        for (let x = 2; x < 14; x++) {
          const inset = y === 5 ? 2 : y === 6 ? 1 : 0;
          if (x < 2 + inset || x > 13 - inset) continue;
          let col = c;
          if (y <= 6) col = hl;
          if (y === 11 || x === 13 - inset) col = dk;
          put(x, y, col);
        }
    });
  }

  // ---------------------------------------------------------------------------
  // Definitionen
  // ---------------------------------------------------------------------------
  function defItem(id, name, o) {
    defs[id] = Object.assign({ id, name, stack: 64, kind: 'item' }, o);
  }

  // Blöcke als Gegenstände
  for (const d of B.defs) {
    if (!d || !d.placeable) continue;
    defItem(d.id, d.name, { kind: 'block', block: d.id });
  }

  defItem(IT.STICK, 'Stock', {});
  defItem(IT.COAL, 'Kohle', {});
  defItem(IT.IRON, 'Eisenbarren', {});
  defItem(IT.GOLD, 'Goldbarren', { gold: 1 });
  defItem(IT.DIAMOND, 'Diamant', {});
  defItem(IT.APPLE, 'Apfel', { food: 4 });
  defItem(IT.BREAD, 'Brot', { food: 5 });
  defItem(IT.MEAT, 'Fleisch', { food: 6 });
  defItem(IT.FEATHER, 'Feder', {});
  defItem(IT.LEATHER, 'Leder', {});
  defItem(IT.BONE, 'Knochen', {});
  defItem(IT.STRING, 'Faden', {});
  defItem(IT.GUNPOWDER, 'Schwarzpulver', {});
  defItem(IT.BUCKET, 'Eimer', { stack: 16 });
  defItem(IT.WATER_BUCKET, 'Wassereimer', { stack: 1 });
  defs[ID.GOLD_BLOCK].gold = 9;
  defs[ID.GOLD_ORE] && (defs[ID.GOLD_ORE].gold = 1);

  const TIERS = [
    { key: 'wood', name: 'Holz', tier: 1, speed: 2, dur: 60 },
    { key: 'stone', name: 'Stein', tier: 2, speed: 4, dur: 132 },
    { key: 'iron', name: 'Eisen', tier: 3, speed: 6, dur: 251 },
    { key: 'diamond', name: 'Diamant', tier: 4, speed: 8, dur: 1562 },
  ];
  const TOOL_KINDS = [
    { kind: 'pickaxe', name: 'spitzhacke', base: IT.WOOD_PICK, dmg: 2 },
    { kind: 'axe', name: 'axt', base: IT.WOOD_AXE, dmg: 3 },
    { kind: 'shovel', name: 'schaufel', base: IT.WOOD_SHOVEL, dmg: 1.5 },
    { kind: 'sword', name: 'schwert', base: IT.WOOD_SWORD, dmg: 4 },
  ];
  for (const k of TOOL_KINDS)
    TIERS.forEach((t, i) => {
      defItem(k.base + i, t.name + k.name, {
        kind: 'tool', tool: k.kind, tier: t.tier, speed: t.speed, maxDur: t.dur,
        damage: k.dmg + i, stack: 1, mat: t.key,
      });
    });

  // Icons erzeugen
  for (const id in defs) {
    const d = defs[id];
    let c;
    if (itemIcons[id]) c = itemIcons[id]();
    else if (d.kind === 'block') c = blockIcon(B.defs[d.block]);
    else if (d.kind === 'tool') c = toolIcon(d.tool, d.mat);
    else c = pixelIcon(() => {});
    iconCanvases[id] = c;
  }
  I.iconCanvas = (id) => iconCanvases[id];
  I.iconURL = (id) => {
    if (!iconURLs[id]) iconURLs[id] = iconCanvases[id].toDataURL();
    return iconURLs[id];
  };
  const iconTex = {};
  I.iconTexture = (id) => {
    if (!iconTex[id]) {
      const t = new THREE.CanvasTexture(iconCanvases[id]);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      iconTex[id] = t;
    }
    return iconTex[id];
  };
  I.name = (id) => (defs[id] ? defs[id].name : '?');

  // ---------------------------------------------------------------------------
  // Abbau-Regeln
  // ---------------------------------------------------------------------------
  const TIER_NAMES = ['', 'Holzspitzhacke', 'Steinspitzhacke', 'Eisenspitzhacke', 'Diamantspitzhacke'];
  I.tierName = (t) => TIER_NAMES[t] || '';

  // Liefert {canMine, time} für Block mit dem gehaltenen Gegenstand
  I.mineInfo = (blockId, held) => {
    const bd = B.defs[blockId];
    if (!bd || bd.hardness < 0) return { canMine: false, time: Infinity, reason: 'Dieser Block lässt sich nicht abbauen.' };
    const td = held ? defs[held.id] : null;
    const isTool = td && td.kind === 'tool';
    const right = isTool && bd.tool && td.tool === bd.tool;
    if (bd.tier > 0) {
      const tier = right ? td.tier : 0;
      if (tier < bd.tier)
        return { canMine: false, time: Infinity, reason: 'Du brauchst mindestens eine ' + TIER_NAMES[bd.tier] + '!' };
    }
    let time = bd.hardness * 1.5;
    if (right) time /= td.speed;
    else if (isTool && td.tool === 'sword' && (bd.render === 'leaves')) time /= 2;
    return { canMine: true, time: Math.max(time, 0.05) };
  };

  // Was fällt beim Abbau heraus?
  I.blockDrops = (blockId) => {
    const bd = B.defs[blockId];
    const d = bd.drop;
    if (d === null) return [];
    if (d === 'leaves') {
      const r = Math.random();
      if (r < 0.06) return [[IT.APPLE, 1]];
      if (r < 0.1) return [[IT.STICK, 1]];
      return [];
    }
    if (d === 'coal') return [[IT.COAL, 1]];
    if (d === 'iron') return [[IT.IRON, 1]];
    if (d === 'gold') return [[IT.GOLD, 1 + (Math.random() < 0.3 ? 1 : 0)]];
    if (d === 'diamond') return [[IT.DIAMOND, 1]];
    if (d === 'stick') return Math.random() < 0.5 ? [[IT.STICK, 1]] : [];
    if (typeof d === 'number' && defs[d]) return [[d, 1]];
    return [];
  };

  // ---------------------------------------------------------------------------
  // Rezepte
  // ---------------------------------------------------------------------------
  const LOGS = [ID.LOG, ID.BIRCH_LOG, ID.SPRUCE_LOG, ID.JUNGLE_LOG];
  const STONES = [ID.COBBLE, ID.MOSSY_COBBLE];
  const PLANKS = [ID.PLANKS, ID.SPRUCE_PLANKS];
  const R = (out, n, ins) => ({ out, n, ins: ins.map(([ids, c]) => ({ ids: Array.isArray(ids) ? ids : [ids], n: c })) });
  I.recipes = [
    R(ID.PLANKS, 4, [[[ID.LOG, ID.BIRCH_LOG, ID.JUNGLE_LOG], 1]]),
    R(ID.SPRUCE_PLANKS, 4, [[ID.SPRUCE_LOG, 1]]),
    R(IT.STICK, 4, [[PLANKS, 2]]),
    R(ID.CRAFTING, 1, [[PLANKS, 4]]),
    R(ID.TORCH, 4, [[IT.COAL, 1], [IT.STICK, 1]]),
    R(IT.WOOD_PICK, 1, [[PLANKS, 3], [IT.STICK, 2]]),
    R(IT.WOOD_SWORD, 1, [[PLANKS, 2], [IT.STICK, 1]]),
    R(IT.WOOD_AXE, 1, [[PLANKS, 3], [IT.STICK, 2]]),
    R(IT.WOOD_SHOVEL, 1, [[PLANKS, 1], [IT.STICK, 2]]),
    R(IT.STONE_PICK, 1, [[STONES, 3], [IT.STICK, 2]]),
    R(IT.STONE_SWORD, 1, [[STONES, 2], [IT.STICK, 1]]),
    R(IT.STONE_AXE, 1, [[STONES, 3], [IT.STICK, 2]]),
    R(IT.STONE_SHOVEL, 1, [[STONES, 1], [IT.STICK, 2]]),
    R(IT.IRON_PICK, 1, [[IT.IRON, 3], [IT.STICK, 2]]),
    R(IT.IRON_SWORD, 1, [[IT.IRON, 2], [IT.STICK, 1]]),
    R(IT.IRON_AXE, 1, [[IT.IRON, 3], [IT.STICK, 2]]),
    R(IT.IRON_SHOVEL, 1, [[IT.IRON, 1], [IT.STICK, 2]]),
    R(IT.DIAMOND_PICK, 1, [[IT.DIAMOND, 3], [IT.STICK, 2]]),
    R(IT.DIAMOND_SWORD, 1, [[IT.DIAMOND, 2], [IT.STICK, 1]]),
    R(IT.DIAMOND_AXE, 1, [[IT.DIAMOND, 3], [IT.STICK, 2]]),
    R(IT.DIAMOND_SHOVEL, 1, [[IT.DIAMOND, 1], [IT.STICK, 2]]),
    R(ID.CHEST, 1, [[PLANKS, 8]]),
    R(IT.BUCKET, 1, [[IT.IRON, 3]]),
    R(ID.BED, 1, [[ID.WOOL, 3], [PLANKS, 3]]),
    R(ID.WOOL, 1, [[IT.STRING, 4]]),
    R(ID.GLASS, 2, [[ID.SAND, 2], [IT.COAL, 1]]),
    R(ID.STONE_BRICKS, 4, [[ID.COBBLE, 4]]),
    R(ID.SANDSTONE, 1, [[ID.SAND, 4]]),
    R(ID.BRICKS, 2, [[ID.DIRT, 2], [IT.COAL, 1]]),
    R(ID.BOOKSHELF, 1, [[PLANKS, 6], [IT.LEATHER, 1]]),
    R(ID.GOLD_BLOCK, 1, [[IT.GOLD, 9]]),
    R(IT.GOLD, 9, [[ID.GOLD_BLOCK, 1]]),
    R(IT.BREAD, 1, [[IT.APPLE, 2]]),
  ];

  // ---------------------------------------------------------------------------
  // Inventar
  // ---------------------------------------------------------------------------
  I.stackSize = (id) => (defs[id] ? defs[id].stack : 64);
  I.makeStack = (id, n = 1) => {
    const d = defs[id];
    const s = { id, n };
    if (d && d.kind === 'tool') s.dur = d.maxDur;
    return s;
  };

  class Inventory {
    constructor(size) {
      this.slots = new Array(size).fill(null);
    }
    // Fügt hinzu, gibt Rest zurück
    add(id, n, dur) {
      const max = I.stackSize(id);
      if (max > 1) {
        for (let i = 0; i < this.slots.length && n > 0; i++) {
          const s = this.slots[i];
          if (s && s.id === id && s.n < max) {
            const k = Math.min(n, max - s.n);
            s.n += k;
            n -= k;
          }
        }
      }
      for (let i = 0; i < this.slots.length && n > 0; i++) {
        if (!this.slots[i]) {
          const k = Math.min(n, max);
          this.slots[i] = I.makeStack(id, k);
          if (dur !== undefined && this.slots[i].dur !== undefined) this.slots[i].dur = dur;
          n -= k;
        }
      }
      return n;
    }
    count(ids) {
      if (!Array.isArray(ids)) ids = [ids];
      let c = 0;
      for (const s of this.slots) if (s && ids.includes(s.id)) c += s.n;
      return c;
    }
    remove(ids, n) {
      if (!Array.isArray(ids)) ids = [ids];
      for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
        const s = this.slots[i];
        if (s && ids.includes(s.id)) {
          const k = Math.min(n, s.n);
          s.n -= k;
          n -= k;
          if (s.n <= 0) this.slots[i] = null;
        }
      }
      return n === 0;
    }
    serialize() {
      return this.slots.map((s) => (s ? [s.id, s.n, s.dur === undefined ? -1 : s.dur] : 0));
    }
    load(arr) {
      for (let i = 0; i < this.slots.length; i++) {
        const v = arr && arr[i];
        if (v && defs[v[0]]) {
          this.slots[i] = { id: v[0], n: v[1] };
          if (v[2] >= 0) this.slots[i].dur = v[2];
        } else this.slots[i] = null;
      }
    }
  }
  I.Inventory = Inventory;

  I.canCraft = (inv, r) => r.ins.every((ing) => inv.count(ing.ids) >= ing.n);
  I.craft = (inv, r) => {
    if (!I.canCraft(inv, r)) return false;
    for (const ing of r.ins) inv.remove(ing.ids, ing.n);
    const left = inv.add(r.out, r.n);
    return { ok: true, left };
  };

  I.goldValue = (inv) => {
    let g = 0;
    for (const s of inv.slots) if (s && defs[s.id] && defs[s.id].gold) g += defs[s.id].gold * s.n;
    return g;
  };
})();
