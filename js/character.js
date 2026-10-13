'use strict';
// Figur im Körperbau von Steve (Kopf 8x8x8, Körper 8x12x4, Arme/Beine 4x12x4)
// mit Knie- und Ellbogengelenken für eine realistischere Laufanimation.
(function () {
  const U = G.U;
  const C = (G.Char = {});
  const P = 1.8 / 32; // Meter pro Pixel (Figur ist 1,8 m groß)
  C.P = P;

  // ---------------------------------------------------------------------------
  // Texturen
  // ---------------------------------------------------------------------------
  function rgb(c) {
    return typeof c === 'string' ? U.hexToRgb(c) : c;
  }
  // Zeichnet eine w x h Pixel-Fläche; fn(x,y) liefert [r,g,b] oder null
  C.makeTex = (w, h, fn, seed = 1) => {
    const c = U.canvas(w, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const r = U.mulberry32(seed);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const col = fn(x, y, r);
        const i = (y * w + x) * 4;
        if (!col) { img.data[i + 3] = 0; continue; }
        const v = col[3] === undefined ? 1 + (r() - 0.5) * 0.08 : col[3];
        img.data[i] = col[0] * v;
        img.data[i + 1] = col[1] * v;
        img.data[i + 2] = col[2] * v;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  };
  C.mat = (tex, color) => {
    const m = new THREE.MeshLambertMaterial({ map: tex || null, color: color || 0xffffff });
    m.userData.base = new THREE.Color(color || 0xffffff);
    return m;
  };
  // Alle sechs Flächen eines Quaders liegen nebeneinander in EINER Textur.
  // So braucht jeder Quader nur einen Zeichenaufruf.
  // Reihenfolge wie bei THREE.BoxGeometry: +X, -X, +Y, -Y, +Z(vorne), -Z(hinten)
  const FACE_NAMES = ['left', 'right', 'top', 'bottom', 'front', 'back'];
  function faceLayout(w, h, d) {
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    let x = 0;
    const rects = dims.map(([fw, fh]) => { const r = { x, fw, fh }; x += fw; return r; });
    return { rects, cw: x, ch: Math.max(h, d) };
  }
  C.boxMats = (w, h, d, faceFn, seed = 1) => {
    w = Math.round(w); h = Math.round(h); d = Math.round(d);
    const L = faceLayout(w, h, d);
    const c = U.canvas(L.cw, L.ch);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(L.cw, L.ch);
    const r = U.mulberry32(seed);
    L.rects.forEach((rc, i) => {
      for (let y = 0; y < rc.fh; y++)
        for (let x = 0; x < rc.fw; x++) {
          const col = faceFn(FACE_NAMES[i], x, y, rc.fw, rc.fh, r);
          const o = (y * L.cw + rc.x + x) * 4;
          if (!col) continue;
          const v = col[3] === undefined ? 1 + (r() - 0.5) * 0.08 : col[3];
          img.data[o] = col[0] * v;
          img.data[o + 1] = col[1] * v;
          img.data[o + 2] = col[2] * v;
          img.data[o + 3] = 255;
        }
    });
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    const m = C.mat(t);
    m.userData.layout = L;
    return m;
  };
  // Quader mit Pivot-Versatz; mat aus C.boxMats (oder normales Material)
  C.box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const g = new THREE.BoxGeometry(w * P, h * P, d * P);
    const L = mat && mat.userData && mat.userData.layout;
    if (L) {
      const uv = g.attributes.uv;
      const e = 0.02; // halbes Texel Abstand gegen Ausfransen
      for (let i = 0; i < 6; i++) {
        const rc = L.rects[i];
        for (let k = 0; k < 4; k++) {
          const vi = i * 4 + k;
          const u0 = uv.getX(vi), v0 = uv.getY(vi);
          const px = rc.x + U.clamp(u0 * rc.fw, e, rc.fw - e);
          const py = U.clamp((1 - v0) * rc.fh, e, rc.fh - e);
          uv.setXY(vi, px / L.cw, 1 - py / L.ch);
        }
      }
      g.clearGroups();
    }
    const m = new THREE.Mesh(g, mat);
    m.position.set(x * P, y * P, z * P);
    return m;
  };

  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

  function headFace(look) {
    const skin = rgb(look.skin), hair = rgb(look.hair), eye = rgb(look.eyes);
    const style = look.hairStyle || 'kurz';
    const long = style === 'lang';
    return (face, x, y) => {
      if (face === 'top') return hair;
      if (face === 'bottom') return mul(skin, 0.9);
      if (face === 'front') {
        if (y === 0) return hair;
        if (y === 1 && (x <= 1 || x >= 6 || long)) return hair;
        if (long && (x === 0 || x === 7) && y < 7) return hair;
        if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return mul(hair, 0.8);
        if (y === 4) {
          if (x === 1 || x === 6) return [245, 245, 245, 1];
          if (x === 2 || x === 5) return [eye[0], eye[1], eye[2], 1];
        }
        if (y === 5 && (x === 3 || x === 4)) return mul(skin, 0.82);
        if (y === 6 && (x === 3 || x === 4)) return mul(skin, 0.62);
        if (y === 6 && (x === 2 || x === 5)) return mul(skin, 0.84);
        return skin;
      }
      if (face === 'back') {
        if (long || y <= 5) return hair;
        return skin;
      }
      // Seiten
      if (y <= 2 || long) return hair;
      if (style === 'zopf' && y <= 3) return hair;
      if (y >= 4 && y <= 5 && (x === 3 || x === 4)) return mul(skin, 0.85);
      return skin;
    };
  }
  function torsoFace(look) {
    const skin = rgb(look.skin), shirt = rgb(look.shirt);
    return (face, x, y, w, h) => {
      if (face === 'front') {
        if (y === 0 && (x === 3 || x === 4)) return skin;
        if (y === 1 && (x === 3 || x === 4)) return mul(skin, 0.92);
        if (y === h - 1) return mul(shirt, 0.82);
        return shirt;
      }
      if (face === 'top') return y >= 1 && y <= 2 && x >= 3 && x <= 4 ? skin : shirt;
      if (y === h - 1 && (face === 'back' || face === 'left' || face === 'right')) return mul(shirt, 0.82);
      return shirt;
    };
  }
  function upperArmFace(look) {
    const skin = rgb(look.skin), shirt = rgb(look.shirt);
    return (face, x, y) => {
      if (face === 'top') return shirt;
      if (face === 'bottom') return skin;
      return y <= 3 ? (y === 3 ? mul(shirt, 0.85) : shirt) : skin;
    };
  }
  function lowerArmFace(look) {
    const skin = rgb(look.skin);
    return (face, x, y) => (face === 'bottom' ? mul(skin, 0.9) : y >= 4 ? mul(skin, 0.95) : skin);
  }
  function upperLegFace(look) {
    const pants = rgb(look.pants);
    return (face, x, y) => (face === 'front' && y === 0 ? mul(pants, 0.85) : pants);
  }
  function lowerLegFace(look) {
    const pants = rgb(look.pants), shoes = rgb(look.shoes);
    return (face, x, y) => {
      if (face === 'bottom') return mul(shoes, 0.75);
      if (face === 'top') return pants;
      if (y >= 3) return y === 3 ? mul(shoes, 1.15) : shoes;
      return pants;
    };
  }
  function hairFace(look) {
    const hair = rgb(look.hair);
    return (face, x, y) => mul(hair, face === 'front' ? 0.85 : 1);
  }

  // ---------------------------------------------------------------------------
  // Modell
  // ---------------------------------------------------------------------------
  C.createHumanoid = (look, opts = {}) => {
    const lw = opts.limbW || 4;
    const root = new THREE.Group();
    const pelvis = new THREE.Group();
    pelvis.position.y = 12 * P;
    root.add(pelvis);
    const torso = new THREE.Group();
    pelvis.add(torso);
    const neck = new THREE.Group();
    neck.position.y = 12 * P;
    torso.add(neck);
    const head = new THREE.Group();
    neck.add(head);

    const m = {
      root, pelvis, torso, neck, head, lw, look, skeleton: !!opts.skeleton,
      anim: { phase: 0, amp: 0, run: 0, air: 0, swim: 0, t: Math.random() * 10, swingT: -1, lastStep: 0, hold: 0, holdL: 0 },
      meshes: {},
    };

    // Beine: Hüfte -> Oberschenkel -> Knie -> Unterschenkel
    const legX = lw === 4 ? 2 : 2;
    m.legs = [];
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * legX * P, 0, 0);
      pelvis.add(hip);
      const knee = new THREE.Group();
      knee.position.y = -6 * P;
      hip.add(knee);
      m.legs.push({ hip, knee, side });
    }
    // Arme: Schulter -> Oberarm -> Ellbogen -> Unterarm -> Hand
    const armX = lw === 4 ? 6 : 5;
    m.arms = [];
    for (const side of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(side * armX * P, 10 * P, 0);
      torso.add(sh);
      const elbow = new THREE.Group();
      elbow.position.y = -4 * P;
      sh.add(elbow);
      const hand = new THREE.Group();
      hand.position.y = -6 * P;
      elbow.add(hand);
      m.arms.push({ sh, elbow, hand, side });
    }
    // Rechte Hand der Figur ist -X (Figur schaut nach +Z)
    m.rightArm = m.arms[1];
    m.leftArm = m.arms[0];
    m.rightLeg = m.legs[1];
    m.leftLeg = m.legs[0];

    C.applyLook(m, look);
    return m;
  };

  function disposeMesh(mesh) {
    if (!mesh) return;
    mesh.parent && mesh.parent.remove(mesh);
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mt of mats) {
      if (mt.map) mt.map.dispose();
      mt.dispose();
    }
  }

  // Texturen und Teile (neu) erzeugen
  C.applyLook = (m, look) => {
    m.look = look;
    for (const k in m.meshes) {
      const v = m.meshes[k];
      if (Array.isArray(v)) v.forEach(disposeMesh);
      else disposeMesh(v);
    }
    m.meshes = {};
    if (m.skeleton) {
      applySkeleton(m);
      return;
    }
    const lw = m.lw;
    const seed = 3;
    const headMats = C.boxMats(8, 8, 8, headFace(look), seed);
    m.meshes.head = C.box(8, 8, 8, headMats, 0, 4, 0);
    m.head.add(m.meshes.head);
    const style = look.hairStyle || 'kurz';
    if (style === 'lang') {
      const hm = C.boxMats(8, 10, 1, hairFace(look), seed + 5);
      m.meshes.hair = C.box(8.4, 10, 1.2, hm, 0, 3, -4.5);
      m.head.add(m.meshes.hair);
    } else if (style === 'zopf') {
      const hm = C.boxMats(2, 6, 2, hairFace(look), seed + 5);
      m.meshes.hair = C.box(2.2, 6, 2.2, hm, 0, 2, -5);
      m.meshes.hair.rotation.x = 0.25;
      m.head.add(m.meshes.hair);
    }
    const torsoMats = C.boxMats(8, 12, 4, torsoFace(look), seed + 1);
    m.meshes.torso = C.box(8, 12, 4, torsoMats, 0, 6, 0);
    m.torso.add(m.meshes.torso);

    const uaMats = C.boxMats(lw, 6, lw, upperArmFace(look), seed + 2);
    const laMats = C.boxMats(lw, 6, lw, lowerArmFace(look), seed + 3);
    const ulMats = C.boxMats(lw, 6, lw, upperLegFace(look), seed + 4);
    const llMats = C.boxMats(lw, 6, lw, lowerLegFace(look), seed + 6);
    m.meshes.limbs = [];
    for (const a of m.arms) {
      const up = C.box(lw, 6, lw, uaMats, 0, -1, 0);
      const lo = C.box(lw, 6, lw, laMats, 0, -3, 0);
      a.sh.add(up);
      a.elbow.add(lo);
      m.meshes.limbs.push(up, lo);
    }
    for (const l of m.legs) {
      const up = C.box(lw, 6, lw, ulMats, 0, -3, 0);
      const lo = C.box(lw, 6, lw, llMats, 0, -3, 0);
      l.hip.add(up);
      l.knee.add(lo);
      m.meshes.limbs.push(up, lo);
    }
    // Materialien sammeln (für Helligkeit / Treffer-Effekt)
    m.materials = [];
    m.root.traverse((o) => {
      if (o.isMesh && o.material && !o.userData.isItem) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) if (!m.materials.includes(mt)) m.materials.push(mt);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // Skelett: echte Knochen statt Kästen (gleiches Gelenk-Gerüst wie die Figur)
  // ---------------------------------------------------------------------------
  // Mehrere Quader [b, h, t, x, y, z] (in Pixeln) zu einer Geometrie zusammenfassen
  function mergeBoxes(list) {
    const pos = [], nor = [], uv = [], ind = [];
    let off = 0;
    for (const [w, h, d, x, y, z] of list) {
      const g = new THREE.BoxGeometry(w * P, h * P, d * P);
      g.translate(x * P, y * P, z * P);
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      uv.push(...g.attributes.uv.array);
      for (const i of g.index.array) ind.push(i + off);
      off += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    geo.computeBoundingSphere();
    return geo;
  }
  C.mergeBoxes = mergeBoxes;

  const BONE = [224, 218, 198], BONE_D = [186, 180, 160], HOLE = [26, 22, 20];
  function skullFace(face, x, y) {
    if (face === 'front') {
      if ((y === 2 || y === 3) && (x === 1 || x === 2 || x === 5 || x === 6)) return HOLE; // Augenhöhlen
      if (y === 1 && (x >= 1 && x <= 2 || x >= 5 && x <= 6)) return BONE_D; // Brauenbogen
      if (y === 4 && (x === 3 || x === 4)) return HOLE; // Nasenloch
      if (y === 5 && (x === 3 || x === 4)) return BONE_D;
      if (y === 6) return x === 0 || x === 7 ? BONE_D : x % 2 ? [242, 238, 222, 1] : HOLE; // obere Zähne
      return BONE;
    }
    if (face === 'bottom') return HOLE;
    if (face === 'left' || face === 'right') return y >= 2 && y <= 4 && (x === 2 || x === 5) ? BONE_D : BONE;
    if (face === 'back' && y >= 5) return BONE_D;
    return BONE;
  }
  function jawFace(face, x, y) {
    if (face === 'top') return HOLE;
    if (face === 'front' && y === 0) return x === 0 || x === 5 ? BONE_D : x % 2 ? HOLE : [242, 238, 222, 1]; // untere Zähne
    return y === 1 ? BONE_D : BONE;
  }

  function applySkeleton(m) {
    const boneTex = C.makeTex(8, 8, (x, y, r) => {
      const v = 0.9 + r() * 0.12;
      return [BONE[0] * v, BONE[1] * v, BONE[2] * v, 1];
    }, 77);
    const bone = C.mat(boneTex);
    m.meshes.limbs = [];
    const add = (parent, list) => {
      const mesh = new THREE.Mesh(mergeBoxes(list), bone);
      parent.add(mesh);
      m.meshes.limbs.push(mesh);
      return mesh;
    };
    // Schädel und beweglicher Unterkiefer
    m.meshes.head = C.box(8, 7, 8, C.boxMats(8, 7, 8, skullFace, 81), 0, 4.6, 0.2);
    m.head.add(m.meshes.head);
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, 1.3 * P, -2.2 * P);
    m.head.add(jawPivot);
    m.meshes.jaw = C.box(6, 1.6, 6, C.boxMats(6, 2, 6, jawFace, 82), 0, -0.6, 2.6);
    jawPivot.add(m.meshes.jaw);
    m.jaw = jawPivot;
    // Wirbelsäule, Schlüsselbein, Brustbein und Rippen
    const torso = [
      [2, 12.6, 2, 0, 6.3, -1.3],
      [10.6, 1.2, 1.4, 0, 11.4, 0],
      [1.4, 6.2, 1, 0, 8.1, 1.8],
      [2, 1.8, 2, 0, 13, -0.5],
    ];
    for (let i = 0; i < 5; i++) {
      const yr = 10.1 - i * 1.85;
      const w = i < 3 ? 7.2 : 6;
      torso.push([w, 0.9, 0.9, 0, yr, 1.7], [0.9, 0.9, 3.4, w / 2, yr, 0.1], [0.9, 0.9, 3.4, -w / 2, yr, 0.1]);
    }
    add(m.torso, torso);
    // Becken
    add(m.pelvis, [[7, 2.4, 3, 0, 0.4, -0.2], [2, 1.6, 2, 0, 1.8, -1.1], [1.6, 1, 1.6, 2.6, -0.8, 0.4], [1.6, 1, 1.6, -2.6, -0.8, 0.4]]);
    // Arme: Oberarmknochen, Elle und Speiche, Hand mit Fingern
    for (const a of m.arms) {
      add(a.sh, [[2.4, 2, 2.4, 0, 1, 0], [1.4, 5, 1.4, 0, -1.5, 0], [2, 1.4, 2, 0, -3.9, 0]]);
      add(a.elbow, [
        [0.8, 5.4, 0.8, -0.45, -2.8, 0], [0.8, 5.4, 0.8, 0.45, -2.8, 0],
        [2, 1.6, 1.2, 0, -5.7, 0],
        [0.5, 1.6, 0.5, -0.65, -7.1, 0.2], [0.5, 1.8, 0.5, 0, -7.2, 0.2], [0.5, 1.6, 0.5, 0.65, -7.1, 0.2],
      ]);
    }
    // Beine: Oberschenkelknochen mit Knie, Schien- und Wadenbein, Fuß
    for (const l of m.legs) {
      add(l.hip, [[2.4, 2, 2.4, 0, -0.6, 0], [1.8, 5, 1.8, 0, -3, 0], [2.4, 1.6, 2.4, 0, -5.6, 0]]);
      add(l.knee, [[1.2, 5.2, 1.2, -0.35, -3, 0], [0.7, 5.2, 0.7, 0.6, -3, -0.2], [2.2, 1, 3.8, 0, -5.5, 0.9]]);
    }
    m.materials = [];
    m.root.traverse((o) => {
      if (o.isMesh && o.material && !o.userData.isItem && !m.materials.includes(o.material)) m.materials.push(o.material);
    });
  }

  // Bogen (für Skelette)
  C.bowModel = () => {
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5530 });
    wood.userData.base = new THREE.Color(0x7a5530);
    const arc = [];
    for (let i = -6; i <= 6; i++) {
      const z = (1 - (i / 6.4) ** 2) * 3.4 - 3.4;
      arc.push([0.9, 1.3, 0.9, 0, i * 1.05, z]);
    }
    arc.push([1.4, 2.6, 1.4, 0, 0, 0]);
    // Spitzen leicht nach hinten gebogen
    arc.push([0.8, 1, 0.8, 0, 6.9, -3.9], [0.8, 1, 0.8, 0, -6.9, -3.9]);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mergeBoxes(arc), wood));
    const string = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
    string.userData.base = new THREE.Color(0xf2efe6);
    g.add(new THREE.Mesh(mergeBoxes([[0.35, 13.6, 0.35, 0, 0, -3.8]]), string));
    return g;
  };

  // Helligkeit (Licht an der Position) und rotes Aufblinken bei Treffer
  C.setTint = (m, bright, hurt) => {
    for (const mt of m.materials) {
      const c = mt.userData.base;
      const r = c ? c.r : 1, g = c ? c.g : 1, bl = c ? c.b : 1;
      mt.color.setRGB(r * bright, g * bright * (1 - hurt * 0.55), bl * bright * (1 - hurt * 0.55));
      if (mt.emissive) mt.emissive.setRGB(hurt * 0.45, 0, 0);
    }
  };

  // ---------------------------------------------------------------------------
  // Gegenstand in der Hand
  // ---------------------------------------------------------------------------
  const cubeGeoCache = {};
  function blockItemMesh(blockId, size = 0.3) {
    const B = G.B;
    const d = B.defs[blockId];
    if (!cubeGeoCache[blockId]) {
      const mats = [0, 1, 2, 3, 4, 5].map((fi) => {
        let t = d.faceTiles[fi];
        if (fi === 4 && d.frontTile != null) t = d.frontTile;
        const tint = Array.isArray(d.tint) ? d.tint : null;
        const tex = new THREE.CanvasTexture(B.tileCanvas(t, tint));
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        return new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
      });
      cubeGeoCache[blockId] = mats;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), cubeGeoCache[blockId]);
    return mesh;
  }
  // Würfel mit Block-Texturen (z.B. für fallenden Sand); Materialien sind geteilt
  C.blockCube = blockItemMesh;
  // flat = true: Bild zeigt zur Kamera (Ich-Sicht), sonst seitlich in der Hand
  C.itemMesh = (itemId, size = 0.55, flat = false) => {
    const I = G.Items;
    const d = I.defs[itemId];
    if (!d) return null;
    const grp = new THREE.Group();
    if (d.kind === 'block') {
      const bd = G.B.defs[d.block];
      if (bd.render === 'cube' || bd.render === 'leaves' || bd.render === 'glass' || bd.render === 'box') {
        const cube = blockItemMesh(d.block);
        cube.position.set(0, 0.06, 0.1);
        cube.rotation.y = Math.PI / 4;
        grp.add(cube);
        grp.userData.cube = true;
        return grp;
      }
    }
    const mat = new THREE.MeshLambertMaterial({ map: I.iconTexture(itemId), alphaTest: 0.5, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    if (!flat) {
      plane.rotation.y = -Math.PI / 2;
      plane.position.set(0, 0.28 * size, 0.28 * size);
    }
    grp.add(plane);
    return grp;
  };
  // Fackel als kleines 3D-Modell mit leuchtender Flamme
  let glowTex = null;
  function getGlowTex() {
    if (glowTex) return glowTex;
    const c = U.canvas(64, 64);
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,230,160,1)');
    gr.addColorStop(0.35, 'rgba(255,160,60,0.45)');
    gr.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  }
  C.torchModel = (size = 1) => {
    const g = new THREE.Group();
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x7a5530 });
    stickMat.userData.base = new THREE.Color(0x7a5530);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), stickMat);
    stick.position.y = 0.1;
    g.add(stick);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.085), new THREE.MeshBasicMaterial({ color: 0xffc54a }));
    flame.position.y = 0.355;
    g.add(flame);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.045), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    core.position.y = 0.37;
    g.add(core);
    // weicher Lichtschein um die Flamme
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.position.y = 0.37;
    glow.scale.setScalar(0.42);
    glow.userData.glow = true;
    g.add(glow);
    g.scale.setScalar(size);
    g.userData.torch = { flame, core, glow, stick };
    return g;
  };
  // Flamme flackern lassen
  C.flickerTorch = (g, t) => {
    const d = g && g.userData.torch;
    if (!d) return;
    const f = 1 + Math.sin(t * 19) * 0.07 + Math.sin(t * 31 + 1.7) * 0.05;
    d.flame.scale.set(f, f * (1 + Math.sin(t * 23) * 0.12), f);
    d.glow.material.opacity = 0.5 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.06;
    d.glow.scale.setScalar(0.42 * (1 + Math.sin(t * 11.3) * 0.06));
  };
  // Gegenstand in der linken Hand (z.B. Fackel)
  C.setHeldLeft = (m, itemId) => {
    if (m.heldLeftId === itemId) return;
    m.heldLeftId = itemId;
    const hand = m.leftArm.hand;
    if (m.heldLeftMesh) {
      hand.remove(m.heldLeftMesh);
      m.heldLeftMesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!Array.isArray(o.material) && !m.heldLeftShared) o.material.dispose(); } });
      m.heldLeftMesh = null;
    }
    if (!itemId) return;
    let g;
    if (itemId === G.B.ID.TORCH) {
      g = C.torchModel(0.9);
      g.rotation.x = Math.PI / 2 - 0.35;
      g.position.set(0, -0.03, 0.03);
    } else {
      g = C.itemMesh(itemId);
      if (!g) return;
      g.rotation.x = g.userData.cube ? 0 : -0.35;
      g.position.set(0, -0.02, 0.04);
    }
    g.traverse((o) => (o.userData.isItem = true));
    hand.add(g);
    m.heldLeftMesh = g;
  };

  C.setHeld = (m, itemId) => {
    if (m.heldId === itemId) return;
    m.heldId = itemId;
    const hand = m.rightArm.hand;
    if (m.heldMesh) {
      hand.remove(m.heldMesh);
      m.heldMesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!Array.isArray(o.material)) o.material.dispose(); } });
      m.heldMesh = null;
    }
    if (itemId) {
      const torch = itemId === G.B.ID.TORCH;
      const g = torch ? C.torchModel(0.9) : C.itemMesh(itemId);
      if (g) {
        g.traverse((o) => (o.userData.isItem = true));
        if (torch) {
          g.rotation.x = Math.PI / 2 - 0.35;
          g.position.set(0, -0.03, 0.03);
        } else {
          g.rotation.x = g.userData.cube ? 0 : -0.35;
          g.position.set(0, -0.02, 0.04);
        }
        hand.add(g);
        m.heldMesh = g;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const SEG = 6 * P; // Länge Ober-/Unterschenkel
  const LEG = 12 * P;

  // s: { speed, onGround, swim, sprint, swing(0..1 oder -1), headYaw, headPitch, holding, zombie, dead }
  C.animate = (m, dt, s) => {
    const a = m.anim;
    a.t += dt;
    const moving = s.speed > 0.12;
    const ground = s.onGround || s.swim;
    // Weiche Übergänge
    const ampT = moving && ground ? U.clamp(0.3 + 0.4 * Math.min(1, s.speed / 4.3) + (s.sprint ? 0.22 : 0), 0, 1) : 0;
    a.amp += (ampT - a.amp) * Math.min(1, dt * 7);
    a.run += ((s.sprint && moving ? 1 : 0) - a.run) * Math.min(1, dt * 5);
    a.air += ((s.onGround || s.swim ? 0 : 1) - a.air) * Math.min(1, dt * 10);
    a.swim += ((s.swim ? 1 : 0) - a.swim) * Math.min(1, dt * 5);
    a.hold += ((s.holding ? 1 : 0) - a.hold) * Math.min(1, dt * 8);
    a.holdL = (a.holdL || 0) + ((s.holdingLeft ? 1 : 0) - (a.holdL || 0)) * Math.min(1, dt * 8);

    // Phase über die zurückgelegte Strecke -> Füße rutschen nicht
    let step = false;
    const prev = a.phase;
    if (moving && ground) {
      a.phase += (s.speed * dt) / (LEG * Math.max(a.amp, 0.3));
    } else if (a.amp < 0.05) {
      // Beine kehren in Ruhestellung zurück
      const target = Math.round(a.phase / Math.PI) * Math.PI;
      a.phase += (target - a.phase) * Math.min(1, dt * 6);
    }
    if (Math.floor((a.phase - Math.PI / 2) / Math.PI) !== Math.floor((prev - Math.PI / 2) / Math.PI) && moving && s.onGround) step = true;

    const A = a.amp;
    const p = a.phase;
    const run = a.run;
    const kneeAmp = Math.min(1.9, (1.05 + 0.75 * run) * (A / 0.7));

    // Beine
    let extMax = 0;
    for (const leg of m.legs) {
      const off = leg === m.leftLeg ? 0 : Math.PI;
      const ph = (((p + off) % TAU) + TAU) % TAU;
      let hip = A * Math.sin(ph);
      let knee = kneeAmp * Math.pow(Math.max(0, Math.cos(ph + 0.5)), 1.5);
      if (ph > Math.PI / 2 && ph < Math.PI) knee += 0.3 * A * Math.sin(2 * (ph - Math.PI / 2));
      knee += 0.04 * A;
      // In der Luft: ein Bein vorne angewinkelt
      const airHip = leg === m.leftLeg ? 0.55 : -0.25;
      const airKnee = leg === m.leftLeg ? 0.9 : 0.35;
      hip = U.lerp(hip, airHip, a.air * (1 - a.swim));
      knee = U.lerp(knee, airKnee, a.air * (1 - a.swim));
      // Schwimmen: Kraulbeine
      if (a.swim > 0.01) {
        hip = U.lerp(hip, 0.35 * Math.sin(a.t * 7 + off), a.swim);
        knee = U.lerp(knee, 0.25 + 0.2 * Math.sin(a.t * 7 + off + 1), a.swim);
      }
      leg.hip.rotation.x = -hip;
      leg.hip.rotation.z = leg.side * 0.015;
      leg.knee.rotation.x = knee;
      const lowerAbs = hip - knee;
      const ext = SEG * Math.cos(hip) + SEG * Math.cos(lowerAbs) + 2 * P * Math.abs(Math.sin(lowerAbs)) - 2 * P * 0;
      if (ext > extMax) extMax = ext;
    }
    // Becken: Höhe folgt dem Standbein (natürliches Auf und Ab)
    const groundY = Math.min(LEG, extMax);
    const pelvisY = U.lerp(groundY, LEG, a.air);
    m.pelvis.position.y = pelvisY + 0.012 * Math.sin(a.t * 1.6) * (1 - A);
    m.pelvis.rotation.y = -0.12 * A * Math.sin(p);
    m.pelvis.rotation.z = 0.035 * A * Math.sin(p);

    // Oberkörper: Vorlage beim Rennen, Gegenrotation zu den Hüften
    const lean = 0.05 * A + 0.2 * run + 0.15 * a.swim;
    m.torso.rotation.x = lean;
    m.torso.rotation.y = 0.3 * A * Math.sin(p);
    m.torso.rotation.z = -0.05 * A * Math.sin(p);
    const breathe = Math.sin(a.t * 1.6) * 0.01 * (1 - A);
    m.torso.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe);

    // Kopf: stabilisiert, schaut in Blickrichtung
    const netTwist = 0.18 * A * Math.sin(p);
    m.neck.rotation.y = -netTwist + (s.headYaw || 0);
    m.neck.rotation.x = -lean * 0.8 + (s.headPitch || 0) + 0.02 * Math.sin(a.t * 0.9) * (1 - A);
    m.neck.rotation.z = 0.05 * A * Math.sin(p);

    // Arme
    const armA = A * (0.85 + 0.45 * run);
    for (const arm of m.arms) {
      const isLeft = arm === m.leftArm;
      const fwd = (isLeft ? -1 : 1) * armA * Math.sin(p);
      let sx = -fwd;
      let sz = arm.side * (0.06 + 0.08 * run + 0.03 * (1 - A) * (1 + Math.sin(a.t * 1.3 + (isLeft ? 0 : 2))));
      let el = 0.14 + 0.35 * Math.max(0, fwd) + 1.15 * run;
      if (a.air > 0.01 && !s.swim) {
        sx = U.lerp(sx, -0.35, a.air);
        sz = U.lerp(sz, arm.side * 0.45, a.air);
        el = U.lerp(el, 0.5, a.air);
      }
      if (a.swim > 0.01) {
        const sw = Math.sin(a.t * 5 + (isLeft ? 0 : Math.PI));
        sx = U.lerp(sx, -1.6 - 0.5 * sw, a.swim);
        sz = U.lerp(sz, arm.side * (0.5 + 0.4 * sw), a.swim);
        el = U.lerp(el, 0.3, a.swim);
      }
      if (s.zombie) {
        sx = -1.45 + 0.08 * Math.sin(a.t * 3 + (isLeft ? 0 : 1));
        sz = arm.side * 0.05;
        el = 0.05;
      }
      // Linke Hand: Fackel (oder anderes) nach vorne halten
      if (isLeft && !s.zombie && a.holdL > 0.01) {
        sx = U.lerp(sx, -0.55 - 0.08 * A * Math.sin(p), a.holdL);
        el = U.lerp(el, 0.8, a.holdL);
        sz = U.lerp(sz, 0.1, a.holdL);
      }
      // Rechte Hand: Gegenstand halten / zuschlagen
      if (!isLeft && !s.zombie) {
        sx = U.lerp(sx, -0.35 - 0.1 * A * Math.sin(p), a.hold);
        el = U.lerp(el, 0.35, a.hold);
        if (s.swing >= 0) {
          const k = s.swing;
          const up = Math.sin(k * Math.PI);
          sx = -(0.5 + 1.7 * up * (1 - 0.5 * k));
          el = 0.25 + 0.4 * (1 - up);
          sz = -0.1 - 0.25 * up;
          m.torso.rotation.y += 0.28 * up;
        }
      }
      arm.sh.rotation.x = sx;
      arm.sh.rotation.z = sz;
      arm.elbow.rotation.x = -el;
    }
    if (s.dead) {
      m.root.rotation.z = U.lerp(m.root.rotation.z, Math.PI / 2, Math.min(1, dt * 6));
    } else m.root.rotation.z = 0;
    return step;
  };

  // ---------------------------------------------------------------------------
  // Arm für die Ich-Perspektive
  // ---------------------------------------------------------------------------
  C.createFPArm = (look) => {
    const g = new THREE.Group();
    const mats = C.boxMats(4, 12, 4, (face, x, y) => {
      const skin = rgb(look.skin), shirt = rgb(look.shirt);
      if (face === 'top') return shirt;
      if (face === 'bottom') return mul(skin, 0.9);
      return y <= 3 ? shirt : skin;
    }, 9);
    const arm = C.box(0.12 / P, 0.42 / P, 0.12 / P, mats, 0, -0.21 / P, 0);
    // immer sichtbar, auch direkt vor einer Wand
    mats.depthTest = false;
    arm.renderOrder = 999;
    g.add(arm);
    const hand = new THREE.Group();
    hand.position.y = -0.42;
    g.add(hand);
    g.userData.hand = hand;
    g.userData.mats = [mats];
    return g;
  };
})();
