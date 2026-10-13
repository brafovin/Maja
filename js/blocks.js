'use strict';
// Blöcke: Definitionen und prozedural gemalte 16x16-Pixel-Texturen
(function () {
  const U = G.U;
  const B = (G.B = {});
  const TS = 16, COLS = 16, ROWS = 8;
  B.TS = TS;
  B.COLS = COLS;
  B.ROWS = ROWS;

  // ---------------------------------------------------------------------------
  // Pixel-Helfer
  // ---------------------------------------------------------------------------
  const pix = () => new Uint8ClampedArray(TS * TS * 4);
  const copy = (P) => new Uint8ClampedArray(P);
  function put(P, x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    P[i] = c[0];
    P[i + 1] = c[1];
    P[i + 2] = c[2];
    P[i + 3] = a;
  }
  function shade(P, x, y, f) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    P[i] *= f;
    P[i + 1] *= f;
    P[i + 2] *= f;
  }
  function vary(c, f) {
    return [c[0] * f, c[1] * f, c[2] * f];
  }
  function noiseFill(P, c, v, rand, a = 255) {
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) put(P, x, y, vary(c, 1 + (rand() - 0.5) * v), a);
  }
  function specks(P, n, f, rand) {
    for (let i = 0; i < n; i++) shade(P, Math.floor(rand() * TS), Math.floor(rand() * TS), f);
  }
  function voronoi(P, nPts, palette, edge, rand) {
    const pts = [];
    for (let i = 0; i < nPts; i++)
      pts.push({ x: rand() * TS, y: rand() * TS, c: palette[Math.floor(rand() * palette.length)], f: 0.85 + rand() * 0.3 });
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        let d1 = 1e9, d2 = 1e9, best = null;
        for (const p of pts) {
          // kachelbar: auch verschobene Kopien prüfen
          for (let ox = -TS; ox <= TS; ox += TS)
            for (let oy = -TS; oy <= TS; oy += TS) {
              const dx = x + 0.5 - (p.x + ox), dy = y + 0.5 - (p.y + oy);
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
            }
        }
        if (d2 - d1 < 1.1) put(P, x, y, vary(edge, 0.9 + rand() * 0.2));
        else put(P, x, y, vary(best.c, best.f * (1 + (rand() - 0.5) * 0.12) * (d1 < 1.6 ? 1.1 : 1)));
      }
  }
  function rings(P, inner, outer, bark, rand) {
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.5) put(P, x, y, vary(bark, 0.85 + rand() * 0.3));
        else put(P, x, y, vary(Math.floor(d) % 2 ? inner : outer, 0.95 + rand() * 0.1));
      }
  }
  function bark(P, c, rand, stripe = 0.72) {
    for (let x = 0; x < TS; x++) {
      const sf = x % 4 === 0 || (x * 7 + 3) % 5 === 0 ? stripe : 1;
      for (let y = 0; y < TS; y++) put(P, x, y, vary(c, sf * (0.88 + rand() * 0.24)));
    }
  }
  function ore(base, color, clusters, rand) {
    const P = copy(base);
    for (let k = 0; k < clusters; k++) {
      const cx = 2 + Math.floor(rand() * 12), cy = 2 + Math.floor(rand() * 12);
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const x = cx + Math.floor(rand() * 3) - 1, y = cy + Math.floor(rand() * 3) - 1;
        put(P, x, y, vary(color, 0.8 + rand() * 0.35));
      }
      put(P, cx, cy, vary(color, 1.2));
    }
    return P;
  }

  // ---------------------------------------------------------------------------
  // Textur-Atlas
  // ---------------------------------------------------------------------------
  const atlas = U.canvas(TS * COLS, TS * ROWS);
  const actx = atlas.getContext('2d');
  const tiles = {};
  const tilePixels = [];
  let tileCount = 0;
  function tile(name, P) {
    const idx = tileCount++;
    const img = new ImageData(P, TS, TS);
    actx.putImageData(img, (idx % COLS) * TS, Math.floor(idx / COLS) * TS);
    tiles[name] = idx;
    tilePixels[idx] = P;
    return P;
  }
  const R = (name) => U.mulberry32(U.hashString(name));

  // Grund-Texturen
  let r = R('dirt');
  const dirt = pix();
  noiseFill(dirt, [134, 96, 67], 0.28, r);
  specks(dirt, 18, 0.72, r);
  specks(dirt, 10, 1.22, r);
  tile('dirt', dirt);

  r = R('grass_top');
  const grassTop = pix();
  noiseFill(grassTop, [104, 168, 66], 0.3, r);
  specks(grassTop, 30, 0.8, r);
  specks(grassTop, 14, 1.18, r);
  tile('grass_top', grassTop);

  r = R('grass_side');
  const grassSide = copy(dirt);
  for (let x = 0; x < TS; x++) {
    const h = 3 + Math.floor(r() * 2.6) + (x % 5 === 2 ? 1 : 0);
    for (let y = 0; y < h; y++) put(grassSide, x, y, vary([98, 160, 60], 0.85 + r() * 0.3));
    put(grassSide, x, h, vary([80, 120, 50], 0.9 + r() * 0.2));
  }
  tile('grass_side', grassSide);

  r = R('stone');
  const stone = pix();
  noiseFill(stone, [126, 126, 126], 0.18, r);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * TS), y = Math.floor(r() * TS), len = 2 + Math.floor(r() * 4);
    for (let k = 0; k < len; k++) shade(stone, (x + k) % TS, y, 0.84);
  }
  specks(stone, 12, 1.12, r);
  tile('stone', stone);

  r = R('cobble');
  const cobble = pix();
  voronoi(cobble, 9, [[128, 128, 128], [112, 112, 112], [142, 142, 142], [100, 100, 100]], [62, 62, 62], r);
  tile('cobble', cobble);

  r = R('sand');
  const sand = pix();
  noiseFill(sand, [219, 207, 160], 0.12, r);
  specks(sand, 16, 0.9, r);
  specks(sand, 8, 1.06, r);
  tile('sand', sand);

  r = R('gravel');
  const gravel = pix();
  voronoi(gravel, 22, [[140, 132, 128], [110, 104, 100], [160, 150, 145], [125, 110, 98]], [88, 82, 80], r);
  tile('gravel', gravel);

  r = R('sandstone_top');
  const ssTop = pix();
  noiseFill(ssTop, [218, 205, 158], 0.08, r);
  specks(ssTop, 12, 0.94, r);
  tile('sandstone_top', ssTop);

  r = R('sandstone_side');
  const ssSide = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      let c = [216, 202, 155];
      if (y < 3) c = [224, 212, 168];
      if (y === 3) c = [198, 184, 136];
      if (y >= 12) c = [204, 189, 140];
      if (y === 12) c = [186, 170, 122];
      put(ssSide, x, y, vary(c, 0.95 + r() * 0.1));
    }
  specks(ssSide, 14, 0.92, r);
  tile('sandstone_side', ssSide);

  r = R('sandstone_bottom');
  const ssBottom = pix();
  noiseFill(ssBottom, [210, 196, 148], 0.1, r);
  for (let i = 0; i < 3; i++) {
    let x = Math.floor(r() * TS), y = Math.floor(r() * TS);
    for (let k = 0; k < 5; k++) { shade(ssBottom, x, y, 0.85); x += r() < 0.5 ? 1 : 0; y += 1; }
  }
  tile('sandstone_bottom', ssBottom);

  r = R('chiseled_sandstone');
  const ssChisel = copy(ssTop);
  for (let i = 0; i < TS; i++) {
    shade(ssChisel, i, 0, 0.82); shade(ssChisel, i, 15, 0.82);
    shade(ssChisel, 0, i, 0.82); shade(ssChisel, 15, i, 0.82);
    shade(ssChisel, i, 2, 0.9); shade(ssChisel, i, 13, 0.9);
  }
  // Glyphe: Gesicht / Ankh-artiges Symbol
  const glyph = [
    '................',
    '................',
    '................',
    '....########....',
    '....#......#....',
    '....#.##.#.#....',
    '....#.##.#.#....',
    '....#......#....',
    '....#.####.#....',
    '....#.#..#.#....',
    '....#......#....',
    '....########....',
    '................',
    '................',
    '................',
    '................',
  ];
  glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') shade(ssChisel, x, y, 0.72); }));
  tile('chiseled_sandstone', ssChisel);

  r = R('water');
  const water = pix();
  noiseFill(water, [52, 98, 206], 0.1, r);
  for (let i = 0; i < 7; i++) {
    const y = Math.floor(r() * TS), x = Math.floor(r() * TS), len = 3 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) put(water, (x + k) % TS, y, [96, 146, 232]);
  }
  tile('water', water);

  r = R('log_side');
  const logSide = pix();
  bark(logSide, [104, 82, 50], r);
  tile('log_side', logSide);
  r = R('log_top');
  const logTop = pix();
  rings(logTop, [168, 134, 82], [186, 152, 96], [104, 82, 50], r);
  tile('log_top', logTop);

  r = R('birch_side');
  const birchSide = pix();
  noiseFill(birchSide, [216, 215, 206], 0.08, r);
  for (let i = 0; i < 9; i++) {
    const y = Math.floor(r() * TS), x = Math.floor(r() * TS), len = 2 + Math.floor(r() * 3);
    for (let k = 0; k < len; k++) put(birchSide, (x + k) % TS, y, vary([46, 44, 40], 0.8 + r() * 0.4));
  }
  tile('birch_side', birchSide);
  r = R('birch_top');
  const birchTop = pix();
  rings(birchTop, [196, 176, 124], [212, 192, 138], [216, 215, 206], r);
  tile('birch_top', birchTop);

  r = R('spruce_side');
  const spruceSide = pix();
  bark(spruceSide, [64, 44, 26], r, 0.75);
  tile('spruce_side', spruceSide);
  r = R('spruce_top');
  const spruceTop = pix();
  rings(spruceTop, [118, 86, 52], [132, 98, 60], [64, 44, 26], r);
  tile('spruce_top', spruceTop);

  r = R('jungle_side');
  const jungleSide = pix();
  bark(jungleSide, [88, 68, 28], r, 0.8);
  for (let i = 0; i < 10; i++) put(jungleSide, Math.floor(r() * TS), Math.floor(r() * TS), [70, 100, 40]);
  tile('jungle_side', jungleSide);
  r = R('jungle_top');
  const jungleTop = pix();
  rings(jungleTop, [168, 120, 72], [182, 132, 82], [88, 68, 28], r);
  tile('jungle_top', jungleTop);

  r = R('leaves');
  const leaves = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const v = r();
      if (v < 0.13) put(leaves, x, y, [0, 0, 0], 0);
      else {
        const g = 150 + r() * 80;
        put(leaves, x, y, [g, g, g]);
      }
    }
  specks(leaves, 30, 0.75, r);
  tile('leaves', leaves);

  r = R('planks');
  const planks = pix();
  for (let y = 0; y < TS; y++) {
    const board = Math.floor(y / 4);
    const bf = 0.92 + ((board * 37) % 10) / 60;
    for (let x = 0; x < TS; x++) {
      let c = vary([164, 132, 80], bf * (0.95 + r() * 0.1));
      if (y % 4 === 3) c = [112, 86, 50];
      const seam = board % 2 ? 3 : 11;
      if (x === seam && y % 4 !== 3) c = [120, 92, 54];
      put(planks, x, y, c);
    }
  }
  tile('planks', planks);

  r = R('spruce_planks');
  const sPlanks = pix();
  for (let y = 0; y < TS; y++) {
    const board = Math.floor(y / 4);
    for (let x = 0; x < TS; x++) {
      let c = vary([112, 80, 46], 0.94 + r() * 0.12);
      if (y % 4 === 3) c = [70, 48, 26];
      const seam = board % 2 ? 5 : 12;
      if (x === seam && y % 4 !== 3) c = [80, 56, 30];
      put(sPlanks, x, y, c);
    }
  }
  tile('spruce_planks', sPlanks);

  const glass = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      if (x === 0 || y === 0 || x === 15 || y === 15) put(glass, x, y, [214, 236, 240]);
      else put(glass, x, y, [0, 0, 0], 0);
    }
  [[3, 4], [4, 3], [5, 2], [11, 12], [12, 11], [12, 10], [10, 12]].forEach(([x, y]) => put(glass, x, y, [235, 248, 250]));
  tile('glass', glass);

  r = R('snow');
  const snow = pix();
  noiseFill(snow, [242, 246, 250], 0.05, r);
  for (let i = 0; i < 10; i++) put(snow, Math.floor(r() * TS), Math.floor(r() * TS), [222, 232, 246]);
  tile('snow', snow);

  r = R('snow_grass_side');
  const snowSide = copy(dirt);
  for (let x = 0; x < TS; x++) {
    const h = 3 + Math.floor(r() * 2.5);
    for (let y = 0; y < h; y++) put(snowSide, x, y, vary([242, 246, 250], 0.96 + r() * 0.05));
    put(snowSide, x, h, [214, 222, 232]);
  }
  tile('snow_grass_side', snowSide);

  r = R('ice');
  const ice = pix();
  noiseFill(ice, [150, 190, 250], 0.08, r);
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(r() * TS), y = Math.floor(r() * TS);
    for (let k = 0; k < 5; k++) { put(ice, x % TS, y % TS, [205, 225, 255]); x++; y++; }
  }
  tile('ice', ice);

  tile('coal_ore', ore(stone, [34, 34, 34], 5, R('coal')));
  tile('iron_ore', ore(stone, [216, 172, 140], 4, R('iron')));
  tile('gold_ore', ore(stone, [252, 236, 70], 4, R('gold')));
  tile('diamond_ore', ore(stone, [96, 236, 244], 4, R('diamond')));

  r = R('gold_block');
  const goldBlock = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      let c = vary([248, 206, 58], 0.97 + r() * 0.06);
      if (x === 0 || y === 0) c = [255, 240, 150];
      else if (x === 15 || y === 15) c = [196, 142, 26];
      else if (x === 1 || y === 1) c = [255, 226, 104];
      else if (x === 14 || y === 14) c = [222, 172, 40];
      put(goldBlock, x, y, c);
    }
  [[4, 4], [5, 5], [10, 7], [11, 8], [6, 11]].forEach(([x, y]) => put(goldBlock, x, y, [255, 250, 210]));
  tile('gold_block', goldBlock);

  r = R('bedrock');
  const bedrock = pix();
  const bedPal = [[52, 52, 52], [86, 86, 86], [30, 30, 30], [118, 118, 118]];
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) put(bedrock, x, y, bedPal[Math.floor(r() * bedPal.length)]);
  tile('bedrock', bedrock);

  r = R('cactus_side');
  const cactusSide = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      let c = [22, 122, 36];
      if (x % 4 === 1) c = [56, 158, 58];
      if (x <= 1 || x >= 14) c = [12, 84, 22];
      put(cactusSide, x, y, vary(c, 0.92 + r() * 0.16));
    }
  for (let i = 0; i < 12; i++) put(cactusSide, 1 + 4 * Math.floor(r() * 4) + 2, Math.floor(r() * TS), [226, 226, 190]);
  tile('cactus_side', cactusSide);
  r = R('cactus_top');
  const cactusTop = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      put(cactusTop, x, y, vary(d > 5.5 ? [16, 96, 28] : d > 3.5 ? [40, 140, 50] : [70, 170, 70], 0.94 + r() * 0.12));
    }
  tile('cactus_top', cactusTop);

  r = R('mossy_cobble');
  const mossy = copy(cobble);
  const mn = new U.Simplex(r);
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++)
      if (mn.noise2(x / 5, y / 5) > 0.15) put(mossy, x, y, vary([76, 118, 48], 0.8 + r() * 0.4));
  tile('mossy_cobble', mossy);

  r = R('stone_bricks');
  const sbricks = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      let c = vary([124, 124, 124], 0.93 + r() * 0.12);
      const row = y < 8 ? 0 : 1;
      const seams = row === 0 ? [7, 15] : [3, 11];
      if (y === 7 || y === 15 || seams.includes(x)) c = [78, 78, 78];
      else if (y === 0 || y === 8) c = vary(c, 1.12);
      put(sbricks, x, y, c);
    }
  tile('stone_bricks', sbricks);

  r = R('bricks');
  const bricks = pix();
  for (let y = 0; y < TS; y++) {
    const row = Math.floor(y / 4);
    for (let x = 0; x < TS; x++) {
      let c = vary([152, 72, 56], 0.88 + r() * 0.24);
      if (y % 4 === 3 || (row % 2 ? x % 8 === 3 : x % 8 === 7)) c = vary([176, 168, 156], 0.95 + r() * 0.1);
      put(bricks, x, y, c);
    }
  }
  tile('bricks', bricks);

  r = R('terracotta_orange');
  const tOrange = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      let c = [162, 84, 38];
      if (d > 5 && d < 7) c = [232, 176, 96];
      if (d < 2.6) c = [58, 98, 150];
      if (x === 0 || y === 0 || x === 15 || y === 15) c = [120, 60, 26];
      put(tOrange, x, y, vary(c, 0.95 + r() * 0.1));
    }
  tile('terracotta_orange', tOrange);

  r = R('terracotta_blue');
  const tBlue = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      let c = [52, 74, 140];
      if (d < 5 && d > 3) c = [226, 206, 150];
      if (Math.abs(x - 7.5) < 1 || Math.abs(y - 7.5) < 1) c = [226, 206, 150];
      put(tBlue, x, y, vary(c, 0.95 + r() * 0.1));
    }
  tile('terracotta_blue', tBlue);

  r = R('wool');
  const wool = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) put(wool, x, y, vary([234, 236, 236], ((x + y * 3) % 5 === 0 ? 0.9 : 1) * (0.96 + r() * 0.06)));
  tile('wool', wool);

  function chestBase(seed) {
    const rr = R(seed);
    const P = pix();
    for (let y = 0; y < TS; y++)
      for (let x = 0; x < TS; x++) {
        let c = vary([166, 114, 44], 0.9 + rr() * 0.2);
        if (x === 0 || y === 0 || x === 15 || y === 15) c = [72, 46, 16];
        put(P, x, y, c);
      }
    return P;
  }
  const chestTop = chestBase('chest_top');
  tile('chest_top', chestTop);
  const chestSide = chestBase('chest_side');
  for (let x = 0; x < TS; x++) put(chestSide, x, 5, [72, 46, 16]);
  tile('chest_side', chestSide);
  const chestFront = copy(chestSide);
  for (let y = 3; y <= 8; y++)
    for (let x = 6; x <= 9; x++)
      put(chestFront, x, y, x === 6 || x === 9 || y === 3 || y === 8 ? [60, 60, 66] : [206, 206, 214]);
  tile('chest_front', chestFront);

  const torch = pix();
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(torch, x, y, [0, 0, 0], 0);
  for (let y = 8; y < 16; y++) {
    put(torch, 7, y, [128, 96, 52]);
    put(torch, 8, y, [96, 70, 36]);
  }
  put(torch, 7, 6, [255, 236, 120]); put(torch, 8, 6, [255, 214, 80]);
  put(torch, 7, 7, [255, 180, 50]); put(torch, 8, 7, [240, 140, 30]);
  put(torch, 7, 5, [255, 250, 200]); put(torch, 8, 5, [255, 240, 160]);
  tile('torch', torch);

  function plant(name, draw) {
    const P = pix();
    for (let i = 0; i < TS * TS; i++) P[i * 4 + 3] = 0;
    draw(P, R(name));
    tile(name, P);
  }
  plant('flower_red', (P) => {
    for (let y = 8; y < 16; y++) put(P, 7, y, [52, 120, 36]);
    put(P, 6, 11, [60, 136, 40]); put(P, 8, 12, [60, 136, 40]); put(P, 5, 10, [60, 136, 40]);
    for (let y = 3; y <= 7; y++) for (let x = 5; x <= 9; x++) if (Math.abs(x - 7) + Math.abs(y - 5) <= 3) put(P, x, y, [206, 32, 30]);
    put(P, 7, 5, [60, 18, 18]); put(P, 6, 4, [236, 70, 60]);
  });
  plant('flower_yellow', (P) => {
    for (let y = 9; y < 16; y++) put(P, 7, y, [64, 132, 40]);
    put(P, 8, 12, [70, 146, 44]); put(P, 6, 13, [70, 146, 44]);
    for (let y = 5; y <= 8; y++) for (let x = 6; x <= 8; x++) put(P, x, y, [248, 220, 42]);
    put(P, 7, 4, [248, 230, 80]); put(P, 5, 6, [248, 230, 80]); put(P, 9, 7, [248, 230, 80]);
    put(P, 7, 6, [240, 170, 20]);
  });
  plant('tall_grass', (P, rr) => {
    for (let b = 0; b < 8; b++) {
      let x = 1 + Math.floor(rr() * 14);
      const h = 6 + Math.floor(rr() * 9);
      const lean = rr() < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) {
        put(P, x, 15 - k, vary([170, 170, 170], 0.75 + rr() * 0.35));
        if (k > h * 0.6 && rr() < 0.35) x += lean;
      }
    }
  });
  plant('dead_bush', (P, rr) => {
    const c = [122, 82, 40];
    for (let y = 9; y < 16; y++) put(P, 7, y, c);
    for (let k = 0; k < 5; k++) { put(P, 7 - k, 9 - k, c); put(P, 8 + k, 10 - k, c); }
    for (let k = 0; k < 3; k++) { put(P, 4 - k, 8 + k, c); put(P, 10 + k, 6 + k, c); put(P, 6, 4 - k, c); }
  });

  r = R('bed_top');
  const bedTop = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      let c = vary([178, 32, 34], 0.9 + r() * 0.15);
      if (y < 5 && x > 1 && x < 14) c = vary([236, 236, 236], 0.96 + r() * 0.05);
      if (y === 5 || y === 10) c = [140, 22, 24];
      if (x === 0 || x === 15) c = [150, 26, 28];
      put(bedTop, x, y, c);
    }
  tile('bed_top', bedTop);
  const bedSide = pix();
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      if (y < 7) put(bedSide, x, y, [0, 0, 0], 0);
      else if (y < 11) put(bedSide, x, y, vary([178, 32, 34], 0.9 + r() * 0.15));
      else if (y < 13) put(bedSide, x, y, vary([140, 100, 60], 0.9 + r() * 0.15));
      else if (x < 3 || x > 12) put(bedSide, x, y, [110, 78, 44]);
      else put(bedSide, x, y, [0, 0, 0], 0);
    }
  tile('bed_side', bedSide);

  r = R('bookshelf');
  const shelf = copy(planks);
  const bookCols = [[150, 40, 40], [40, 70, 150], [50, 120, 60], [170, 140, 50], [110, 50, 120], [90, 60, 40]];
  [[2, 6], [9, 13]].forEach(([y0, y1]) => {
    let x = 1;
    while (x < 15) {
      const w = r() < 0.7 ? 2 : 1;
      const c = bookCols[Math.floor(r() * bookCols.length)];
      const top = y0 + (r() < 0.3 ? 1 : 0);
      for (let xx = x; xx < Math.min(15, x + w); xx++)
        for (let y = top; y <= y1; y++) put(shelf, xx, y, vary(c, y === top ? 1.25 : 0.9 + r() * 0.15));
      x += w + (r() < 0.2 ? 1 : 0);
    }
  });
  tile('bookshelf', shelf);

  const craftTop = copy(planks);
  for (let i = 0; i < TS; i++) {
    put(craftTop, i, 0, [90, 60, 30]); put(craftTop, i, 15, [90, 60, 30]);
    put(craftTop, 0, i, [90, 60, 30]); put(craftTop, 15, i, [90, 60, 30]);
    if (i > 1 && i < 14) { put(craftTop, i, 5, [110, 76, 40]); put(craftTop, i, 10, [110, 76, 40]); put(craftTop, 5, i, [110, 76, 40]); put(craftTop, 10, i, [110, 76, 40]); }
  }
  tile('crafting_top', craftTop);
  const craftSide = copy(planks);
  for (let x = 0; x < TS; x++) { put(craftSide, x, 0, [90, 60, 30]); put(craftSide, x, 1, [120, 84, 46]); }
  // Säge und Hammer
  for (let x = 2; x < 8; x++) put(craftSide, x, 6, [190, 190, 196]);
  for (let x = 2; x < 8; x += 2) put(craftSide, x, 7, [150, 150, 156]);
  put(craftSide, 8, 6, [100, 66, 30]); put(craftSide, 9, 6, [100, 66, 30]);
  for (let y = 4; y < 13; y++) put(craftSide, 12, y, [100, 66, 30]);
  for (let x = 10; x < 15; x++) { put(craftSide, x, 4, [150, 150, 156]); put(craftSide, x, 5, [120, 120, 126]); }
  tile('crafting_side', craftSide);

  B.tiles = tiles;
  B.tilePixels = tilePixels;
  B.atlasCanvas = atlas;

  // ---------------------------------------------------------------------------
  // Block-Definitionen
  // ---------------------------------------------------------------------------
  const ID = (B.ID = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, SANDSTONE: 6, WATER: 7,
    LOG: 8, LEAVES: 9, PLANKS: 10, GLASS: 11, SNOW_GRASS: 12, SNOW: 13, ICE: 14,
    COAL_ORE: 15, IRON_ORE: 16, GOLD_ORE: 17, DIAMOND_ORE: 18, GOLD_BLOCK: 19, BEDROCK: 20,
    GRAVEL: 21, BIRCH_LOG: 22, BIRCH_LEAVES: 23, SPRUCE_LOG: 24, SPRUCE_LEAVES: 25,
    JUNGLE_LOG: 26, JUNGLE_LEAVES: 27, CACTUS: 28, MOSSY_COBBLE: 29, STONE_BRICKS: 30,
    CHISELED_SANDSTONE: 31, TERRA_ORANGE: 32, TERRA_BLUE: 33, WOOL: 34, BRICKS: 35,
    CHEST: 36, TORCH: 37, FLOWER_RED: 38, FLOWER_YELLOW: 39, TALL_GRASS: 40, DEAD_BUSH: 41,
    BED: 42, BOOKSHELF: 43, CRAFTING: 44, SPRUCE_PLANKS: 45,
  });

  const defs = (B.defs = []);
  // Faces: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
  function def(id, name, o) {
    const d = Object.assign(
      {
        id, name,
        solid: true, opaque: true, render: 'cube', hardness: 1, tool: null, tier: 0,
        drop: id, light: 0, filter: 0, tint: null, map: [128, 128, 128], aoCast: undefined,
        box: null, interact: null, placeable: true,
      },
      o
    );
    if (d.aoCast === undefined) d.aoCast = d.opaque || d.render === 'leaves';
    let t = d.tex || 'stone';
    if (typeof t === 'string') t = { top: t, side: t, bottom: t };
    const side = tiles[t.side];
    d.faceTiles = [side, side, tiles[t.top], tiles[t.bottom], side, side];
    d.frontTile = t.front ? tiles[t.front] : null;
    if (d.faceTiles.some((v) => v === undefined)) console.warn('Fehlende Textur für', name);
    d.iconTile = tiles[t.icon || t.side];
    d.iconTop = tiles[t.top];
    defs[id] = d;
  }

  def(ID.AIR, 'Luft', { solid: false, opaque: false, render: 'none', hardness: -1, placeable: false, map: [0, 0, 0] });
  def(ID.GRASS, 'Grasblock', { tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', drop: ID.DIRT, tint: 'biome', map: [96, 160, 58] });
  def(ID.DIRT, 'Erde', { tex: 'dirt', hardness: 0.5, tool: 'shovel', map: [134, 96, 67] });
  def(ID.STONE, 'Stein', { tex: 'stone', hardness: 1.5, tool: 'pickaxe', tier: 1, drop: ID.COBBLE, map: [118, 118, 118] });
  def(ID.COBBLE, 'Bruchstein', { tex: 'cobble', hardness: 2, tool: 'pickaxe', tier: 1, map: [112, 112, 112] });
  def(ID.SAND, 'Sand', { tex: 'sand', hardness: 0.5, tool: 'shovel', map: [219, 207, 160] });
  def(ID.SANDSTONE, 'Sandstein', { tex: { top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_bottom' }, hardness: 0.8, tool: 'pickaxe', tier: 1, map: [214, 200, 152] });
  def(ID.WATER, 'Wasser', { tex: 'water', solid: false, opaque: false, render: 'water', hardness: -1, filter: 2, placeable: false, map: [52, 98, 206] });
  def(ID.LOG, 'Eichenstamm', { tex: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, hardness: 2, tool: 'axe', map: [104, 82, 50] });
  def(ID.LEAVES, 'Eichenlaub', { tex: 'leaves', opaque: false, render: 'leaves', hardness: 0.2, filter: 1, tint: [0.44, 0.74, 0.26], drop: 'leaves', map: [66, 124, 40] });
  def(ID.PLANKS, 'Holzbretter', { tex: 'planks', hardness: 2, tool: 'axe', map: [164, 132, 80] });
  def(ID.GLASS, 'Glas', { tex: 'glass', opaque: false, render: 'glass', hardness: 0.3, drop: null, map: [200, 225, 230] });
  def(ID.SNOW_GRASS, 'Verschneites Gras', { tex: { top: 'snow', side: 'snow_grass_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', drop: ID.DIRT, map: [240, 245, 250] });
  def(ID.SNOW, 'Schneeblock', { tex: 'snow', hardness: 0.2, tool: 'shovel', map: [242, 246, 250] });
  def(ID.ICE, 'Eis', { tex: 'ice', hardness: 0.5, tool: 'pickaxe', drop: null, map: [150, 190, 250] });
  def(ID.COAL_ORE, 'Kohleerz', { tex: 'coal_ore', hardness: 3, tool: 'pickaxe', tier: 1, drop: 'coal', map: [90, 90, 90] });
  def(ID.IRON_ORE, 'Eisenerz', { tex: 'iron_ore', hardness: 3, tool: 'pickaxe', tier: 2, drop: 'iron', map: [150, 130, 118] });
  def(ID.GOLD_ORE, 'Golderz', { tex: 'gold_ore', hardness: 3, tool: 'pickaxe', tier: 3, drop: 'gold', map: [200, 180, 80] });
  def(ID.DIAMOND_ORE, 'Diamanterz', { tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', tier: 3, drop: 'diamond', map: [110, 200, 210] });
  def(ID.GOLD_BLOCK, 'Goldblock', { tex: 'gold_block', hardness: 3, tool: 'pickaxe', tier: 2, map: [248, 206, 58] });
  def(ID.BEDROCK, 'Grundgestein', { tex: 'bedrock', hardness: -1, placeable: false, map: [50, 50, 50] });
  def(ID.GRAVEL, 'Kies', { tex: 'gravel', hardness: 0.6, tool: 'shovel', map: [136, 128, 124] });
  def(ID.BIRCH_LOG, 'Birkenstamm', { tex: { top: 'birch_top', side: 'birch_side', bottom: 'birch_top' }, hardness: 2, tool: 'axe', map: [216, 215, 206] });
  def(ID.BIRCH_LEAVES, 'Birkenlaub', { tex: 'leaves', opaque: false, render: 'leaves', hardness: 0.2, filter: 1, tint: [0.54, 0.72, 0.36], drop: 'leaves', map: [96, 140, 64] });
  def(ID.SPRUCE_LOG, 'Fichtenstamm', { tex: { top: 'spruce_top', side: 'spruce_side', bottom: 'spruce_top' }, hardness: 2, tool: 'axe', map: [64, 44, 26] });
  def(ID.SPRUCE_LEAVES, 'Fichtennadeln', { tex: 'leaves', opaque: false, render: 'leaves', hardness: 0.2, filter: 1, tint: [0.28, 0.46, 0.32], drop: 'leaves', map: [44, 76, 52] });
  def(ID.JUNGLE_LOG, 'Tropenbaumstamm', { tex: { top: 'jungle_top', side: 'jungle_side', bottom: 'jungle_top' }, hardness: 2, tool: 'axe', map: [88, 68, 28] });
  def(ID.JUNGLE_LEAVES, 'Tropenlaub', { tex: 'leaves', opaque: false, render: 'leaves', hardness: 0.2, filter: 1, tint: [0.34, 0.84, 0.2], drop: 'leaves', map: [50, 140, 30] });
  def(ID.CACTUS, 'Kaktus', { tex: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, opaque: false, render: 'box', box: [1, 0, 1, 15, 16, 15], hardness: 0.4, map: [22, 122, 36] });
  def(ID.MOSSY_COBBLE, 'Bemooster Bruchstein', { tex: 'mossy_cobble', hardness: 2, tool: 'pickaxe', tier: 1, map: [96, 118, 86] });
  def(ID.STONE_BRICKS, 'Steinziegel', { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1, map: [122, 122, 122] });
  def(ID.CHISELED_SANDSTONE, 'Gemeißelter Sandstein', { tex: 'chiseled_sandstone', hardness: 0.8, tool: 'pickaxe', tier: 1, map: [210, 196, 150] });
  def(ID.TERRA_ORANGE, 'Orange Keramik', { tex: 'terracotta_orange', hardness: 1.4, tool: 'pickaxe', tier: 1, map: [162, 84, 38] });
  def(ID.TERRA_BLUE, 'Blaue Keramik', { tex: 'terracotta_blue', hardness: 1.4, tool: 'pickaxe', tier: 1, map: [52, 74, 140] });
  def(ID.WOOL, 'Wolle', { tex: 'wool', hardness: 0.8, map: [234, 236, 236] });
  def(ID.BRICKS, 'Ziegelsteine', { tex: 'bricks', hardness: 2, tool: 'pickaxe', tier: 1, map: [152, 72, 56] });
  def(ID.CHEST, 'Truhe', { tex: { top: 'chest_top', side: 'chest_side', bottom: 'chest_top', front: 'chest_front', icon: 'chest_front' }, opaque: false, render: 'box', box: [1, 0, 1, 15, 14, 15], hardness: 2.5, tool: 'axe', interact: 'chest', map: [166, 114, 44] });
  def(ID.TORCH, 'Fackel', { tex: 'torch', solid: false, opaque: false, render: 'torch', box: [7, 0, 7, 9, 10, 9], hardness: 0, light: 14, map: [255, 200, 80] });
  def(ID.FLOWER_RED, 'Mohnblume', { tex: 'flower_red', solid: false, opaque: false, render: 'cross', hardness: 0, map: [200, 40, 40] });
  def(ID.FLOWER_YELLOW, 'Löwenzahn', { tex: 'flower_yellow', solid: false, opaque: false, render: 'cross', hardness: 0, map: [240, 210, 40] });
  def(ID.TALL_GRASS, 'Gras', { tex: 'tall_grass', solid: false, opaque: false, render: 'cross', hardness: 0, tint: 'biome', drop: null, replaceable: true, map: [96, 160, 58] });
  def(ID.DEAD_BUSH, 'Toter Busch', { tex: 'dead_bush', solid: false, opaque: false, render: 'cross', hardness: 0, drop: 'stick', replaceable: true, map: [122, 82, 40] });
  def(ID.BED, 'Bett', { tex: { top: 'bed_top', side: 'bed_side', bottom: 'planks', icon: 'bed_top' }, opaque: false, render: 'box', box: [0, 0, 0, 16, 9, 16], hardness: 0.3, interact: 'bed', map: [178, 32, 34] });
  def(ID.BOOKSHELF, 'Bücherregal', { tex: { top: 'planks', side: 'bookshelf', bottom: 'planks' }, hardness: 1.5, tool: 'axe', map: [140, 100, 70] });
  def(ID.CRAFTING, 'Werkbank', { tex: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' }, hardness: 2.5, tool: 'axe', interact: 'craft', map: [150, 110, 60] });
  def(ID.SPRUCE_PLANKS, 'Dunkle Bretter', { tex: 'spruce_planks', hardness: 2, tool: 'axe', map: [112, 80, 46] });

  B.count = defs.length;
  // Schnelle Lookup-Tabellen für das Meshing
  B.SOLID = new Uint8Array(256);
  B.OPAQUE = new Uint8Array(256);
  B.AO = new Uint8Array(256);
  B.FILTER = new Uint8Array(256);
  B.EMIT = new Uint8Array(256);
  for (const d of defs) {
    if (!d) continue;
    B.SOLID[d.id] = d.solid ? 1 : 0;
    B.OPAQUE[d.id] = d.opaque ? 1 : 0;
    B.AO[d.id] = d.aoCast ? 1 : 0;
    // Lichtfilter: undurchsichtig blockiert alles
    B.FILTER[d.id] = d.opaque ? 15 : d.filter;
    B.EMIT[d.id] = d.light;
  }

  // Textur als THREE-Objekt
  B.texture = new THREE.CanvasTexture(atlas);
  B.texture.magFilter = THREE.NearestFilter;
  B.texture.minFilter = THREE.NearestFilter;
  B.texture.generateMipmaps = false;

  // UV-Rechteck einer Kachel (v nach oben)
  B.tileUV = (t) => {
    const u0 = (t % COLS) / COLS;
    const v1 = 1 - Math.floor(t / COLS) / ROWS;
    return [u0, v1 - 1 / ROWS, u0 + 1 / COLS, v1];
  };

  // Kachel als eigene kleine Canvas (für Icons, Partikel)
  B.tileCanvas = (t, tint) => {
    const c = U.canvas(TS, TS);
    const ctx = c.getContext('2d');
    const P = new Uint8ClampedArray(tilePixels[t]);
    if (tint) {
      for (let i = 0; i < P.length; i += 4) {
        P[i] *= tint[0];
        P[i + 1] *= tint[1];
        P[i + 2] *= tint[2];
      }
    }
    ctx.putImageData(new ImageData(P, TS, TS), 0, 0);
    return c;
  };

  // Durchschnittsfarbe einer Kachel (für Partikel)
  B.tileColor = (t) => {
    const P = tilePixels[t];
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < P.length; i += 4) {
      if (P[i + 3] < 128) continue;
      r += P[i]; g += P[i + 1]; b += P[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : [128, 128, 128];
  };

  // Risstexturen für den Abbau-Fortschritt
  B.crackTextures = [];
  for (let s = 0; s < 10; s++) {
    const c = U.canvas(TS, TS);
    const ctx = c.getContext('2d');
    const rr = U.mulberry32(777);
    const lines = 2 + s * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    for (let l = 0; l < lines; l++) {
      let x = 8 + Math.floor((rr() - 0.5) * 6), y = 8 + Math.floor((rr() - 0.5) * 6);
      const dx = rr() < 0.5 ? -1 : 1, dy = rr() < 0.5 ? -1 : 1;
      const len = 3 + Math.floor(rr() * (2 + s));
      for (let k = 0; k < len; k++) {
        ctx.fillRect(x, y, 1, 1);
        if (rr() < 0.6) x += dx; else y += dy;
        if (rr() < 0.3) y += dy;
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    B.crackTextures.push(tex);
  }
})();
