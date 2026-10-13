'use strict';
// Himmel, Tag/Nacht, Wetter (Regen, Gewitter mit Blitzen, Schnee)
(function () {
  const U = G.U, World = G.World;
  const Sky = (G.Sky = {
    time: 0.04, // 0 = Sonnenaufgang, 0.25 = Mittag, 0.5 = Sonnenuntergang, 0.75 = Mitternacht
    dayLength: 600, // Sekunden für einen ganzen Tag
    weather: 'klar',
    weatherTimer: 150,
    rainI: 0, snowI: 0, stormI: 0, cloudI: 0,
    daylight: 1,
    skyDrop: 0,
    flash: 0,
    bolts: [],
    nextBolt: 5,
  });

  Sky.WEATHER_NAMES = { klar: 'Klar', regen: 'Regen', gewitter: 'Gewitter', schnee: 'Schnee' };

  const tmpC = new THREE.Color();
  const col = (r, g, b) => new THREE.Color(r, g, b);
  const DAY_TOP = col(0.33, 0.56, 0.95), DAY_HOR = col(0.68, 0.82, 1.0);
  const NIGHT_TOP = col(0.01, 0.015, 0.045), NIGHT_HOR = col(0.035, 0.045, 0.1);
  const SET_TOP = col(0.28, 0.33, 0.6), SET_HOR = col(0.98, 0.52, 0.28);
  const STORM = col(0.4, 0.42, 0.47), SNOWSKY = col(0.74, 0.77, 0.82);

  // ---------------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------------
  function pixelTex(size, draw) {
    const c = U.canvas(size, size);
    const ctx = c.getContext('2d');
    draw(ctx, size);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  Sky.init = (scene) => {
    Sky.scene = scene;
    // Himmelskuppel
    Sky.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: DAY_TOP.clone() },
        uHor: { value: DAY_HOR.clone() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uGlow: { value: col(1, 0.6, 0.3) },
        uGlowK: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uGlow; uniform float uGlowK;
        varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(uHor, uTop, smoothstep(-0.02, 0.45, h));
          c = mix(c, uHor * 0.7, smoothstep(0.0, -0.4, h));
          float g = pow(max(dot(normalize(vDir), normalize(uSun)), 0.0), 5.0) * uGlowK * smoothstep(-0.3, 0.2, h);
          c += uGlow * g;
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    Sky.dome = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), Sky.domeMat);
    Sky.dome.renderOrder = -10;
    Sky.dome.frustumCulled = false;
    scene.add(Sky.dome);

    // Sonne und Mond (eckig, wie im Pixel-Stil)
    const sunTex = pixelTex(16, (ctx) => {
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#ffe066'; ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(5, 5, 4, 4);
    });
    const moonTex = pixelTex(16, (ctx) => {
      ctx.fillStyle = '#d8dbe6'; ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = '#b9bdcc'; ctx.fillRect(5, 5, 2, 2); ctx.fillRect(9, 8, 3, 2); ctx.fillRect(6, 10, 2, 1);
      ctx.fillStyle = '#eef0f6'; ctx.fillRect(3, 3, 10, 1);
    });
    const mk = (tex, s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      m.renderOrder = -9;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    Sky.sun = mk(sunTex, 34);
    Sky.moon = mk(moonTex, 22);

    // Sterne
    const n = 900, pos = new Float32Array(n * 3);
    const rr = U.mulberry32(42);
    for (let i = 0; i < n; i++) {
      const u = rr() * 2 - 1, a = rr() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * 300;
      pos[i * 3 + 1] = u * 300;
      pos[i * 3 + 2] = Math.sin(a) * s * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    Sky.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
    Sky.stars = new THREE.Points(sg, Sky.starMat);
    Sky.stars.renderOrder = -9;
    Sky.stars.frustumCulled = false;
    scene.add(Sky.stars);

    // Wolken
    Sky.cloudTex = new THREE.CanvasTexture(U.canvas(64, 64));
    Sky.cloudTex.wrapS = Sky.cloudTex.wrapT = THREE.RepeatWrapping;
    Sky.cloudTex.magFilter = THREE.NearestFilter;
    Sky.cloudTex.minFilter = THREE.NearestFilter;
    Sky.cloudTex.generateMipmaps = false;
    Sky.cloudMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: Sky.cloudTex }, uColor: { value: col(1, 1, 1) }, uOpacity: { value: 0.8 }, uOffset: { value: new THREE.Vector2() }, uRepeat: { value: 3.0 } },
      vertexShader: `varying vec2 vUv; varying float vD; uniform vec2 uOffset; uniform float uRepeat;
        void main(){ vUv = uv * uRepeat + uOffset; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = length(mv.xz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vD;
        void main(){ vec4 t = texture2D(map, vUv); float a = t.a * uOpacity * (1.0 - smoothstep(180.0, 420.0, vD)); if (a < 0.02) discard; gl_FragColor = vec4(uColor * t.rgb, a); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    Sky.clouds = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), Sky.cloudMat);
    Sky.clouds.renderOrder = 3;
    Sky.clouds.frustumCulled = false;
    scene.add(Sky.clouds);
    Sky.drawClouds(0.5);

    // Meer außerhalb der Insel
    Sky.oceanMat = new THREE.MeshBasicMaterial({ color: 0x2c55c4, fog: true });
    const W = World.W, E = 2000, y = World.SEA + 0.82;
    const rect = (x0, z0, x1, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, Sky.oceanMat);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      scene.add(m);
    };
    rect(-E, -E, W + E, 0);
    rect(-E, W, W + E, W + E);
    rect(-E, 0, 0, W);
    rect(W, 0, W + E, W);

    // Niederschlag
    Sky.rainN = 1500;
    const rg = new THREE.BufferGeometry();
    Sky.rainPos = new Float32Array(Sky.rainN * 6);
    Sky.rainVel = new Float32Array(Sky.rainN);
    rg.setAttribute('position', new THREE.BufferAttribute(Sky.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    Sky.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb2d8, transparent: true, opacity: 0.55, fog: true }));
    Sky.rain.frustumCulled = false;
    scene.add(Sky.rain);
    Sky.snowN = 1700;
    const sgeo = new THREE.BufferGeometry();
    Sky.snowPos = new Float32Array(Sky.snowN * 3);
    Sky.snowVel = new Float32Array(Sky.snowN);
    sgeo.setAttribute('position', new THREE.BufferAttribute(Sky.snowPos, 3).setUsage(THREE.DynamicDrawUsage));
    const flake = pixelTex(8, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(2, 2, 4, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(1, 3, 6, 2); ctx.fillRect(3, 1, 2, 6);
    });
    Sky.snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ map: flake, size: 0.16, transparent: true, alphaTest: 0.3, depthWrite: false, fog: true }));
    Sky.snow.frustumCulled = false;
    scene.add(Sky.snow);
    Sky.precipInit = false;

    // Lichter für Figuren
    Sky.ambient = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(Sky.ambient);
    Sky.dirLight = new THREE.DirectionalLight(0xffffff, 0.48);
    Sky.dirLight.position.set(0.5, 1, 0.35);
    scene.add(Sky.dirLight);
  };

  // Wolkentextur: dichtere Wolken bei schlechtem Wetter
  Sky.drawClouds = (cover) => {
    const c = Sky.cloudTex.image;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(64, 64);
    const n = new U.Simplex(U.mulberry32(7));
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        // kachelbares Rauschen über einen Torus
        const a = (x / 64) * Math.PI * 2, b = (y / 64) * Math.PI * 2;
        const v = n.noise2(Math.cos(a) * 1.6 + Math.sin(b) * 0.9, Math.sin(a) * 1.6 + Math.cos(b) * 1.3) * 0.7 +
          n.noise2(Math.cos(a) * 4 + 9, Math.sin(b) * 4 + Math.sin(a)) * 0.3;
        const on = v > 0.35 - cover * 0.9;
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = on ? 235 : 0;
      }
    ctx.putImageData(img, 0, 0);
    Sky.cloudTex.needsUpdate = true;
    Sky.cloudCover = cover;
  };

  // ---------------------------------------------------------------------------
  // Wetter
  // ---------------------------------------------------------------------------
  Sky.setWeather = (type, duration, silent) => {
    if (!Sky.WEATHER_NAMES[type]) return;
    const changed = type !== Sky.weather;
    Sky.weather = type;
    Sky.weatherTimer = duration || (type === 'klar' ? U.rand(150, 300) : U.rand(70, 150));
    if (changed && !silent && G.UI) {
      const msg = { klar: 'Der Himmel klart auf.', regen: 'Es fängt an zu regnen …', gewitter: 'Ein Gewitter zieht auf!', schnee: 'Es fängt an zu schneien!' }[type];
      G.UI.toast(msg);
    }
    Sky.nextBolt = U.rand(2, 6);
  };
  function pickWeather() {
    if (Sky.weather !== 'klar') return 'klar';
    const r = Math.random();
    return r < 0.42 ? 'regen' : r < 0.7 ? 'gewitter' : 'schnee';
  }

  // Art des Niederschlags am Ort des Spielers
  function precipKind(x, y, z) {
    const b = World.biomeAt(x, z);
    if (Sky.weather === 'schnee') return 'snow';
    if (Sky.weather === 'klar') return 'none';
    if (b === World.BIOME.SNOW || (b === World.BIOME.MOUNTAIN && y > World.SEA + 22)) return 'snow';
    if (b === World.BIOME.DESERT) return 'none';
    return 'rain';
  }
  Sky.precip = () => Sky.rainI;

  // ---------------------------------------------------------------------------
  // Blitze
  // ---------------------------------------------------------------------------
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 1, fog: false, depthWrite: false });
  function strike(px, pz, forceNear) {
    const a = Math.random() * Math.PI * 2;
    const r = forceNear ? U.rand(6, 14) : U.rand(14, 70);
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    const gy = World.heightAt(x, z) + 1;
    const grp = new THREE.Group();
    const seg = (x0, y0, z0, x1, y1, z1, w) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), boltMat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.lookAt(x1, y1, z1);
      m.rotateX(Math.PI / 2);
      grp.add(m);
    };
    let cx = x, cy = gy + 90, cz = z;
    const pts = [];
    while (cy > gy) {
      const ny = Math.max(gy, cy - U.rand(4, 9));
      const nx = cx + U.rand(-3, 3), nz = cz + U.rand(-3, 3);
      pts.push([cx, cy, cz, nx, ny, nz]);
      cx = nx; cy = ny; cz = nz;
    }
    // Ende genau am Einschlag
    const last = pts[pts.length - 1];
    last[3] = x; last[5] = z;
    for (const p of pts) {
      seg(...p, 0.7);
      if (Math.random() < 0.3) {
        let bx = p[3], by = p[4], bz = p[5];
        for (let k = 0; k < 3; k++) {
          const nx = bx + U.rand(-4, 4), ny = by - U.rand(3, 7), nz = bz + U.rand(-4, 4);
          seg(bx, by, bz, nx, ny, nz, 0.32);
          bx = nx; by = ny; bz = nz;
        }
      }
    }
    Sky.scene.add(grp);
    Sky.bolts.push({ grp, t: 0 });
    Sky.flash = 1;
    const dist = Math.hypot(x - px, z - pz);
    setTimeout(() => G.Audio.play('thunder', null, U.clamp(1.2 - dist / 90, 0.25, 1)), Math.min(2500, dist * 25));
    G.Ent.burst(x, gy + 0.2, z, [255, 240, 200], 14, 3, 'spark', 0.12);
    const P = G.Player;
    if (P.alive && Math.hypot(P.pos.x - x, P.pos.z - z) < 3 && Math.abs(P.pos.y - gy) < 4) P.hurt(6, x, z, 'Blitz');
    for (const m of G.Mobs.list) if (!m.dead && Math.hypot(m.pos.x - x, m.pos.z - z) < 3) m.damage(12, x, z, false);
  }
  Sky.strike = strike;

  // ---------------------------------------------------------------------------
  // Helligkeit wie im Block-Shader (für Figuren und Partikel)
  // ---------------------------------------------------------------------------
  Sky.entityBrightness = (sky, block) => {
    const s = Math.max(sky - Sky.skyDrop, sky * Sky.flash);
    const L = U.clamp(Math.max(s, block), 0, 15);
    return Math.max(0.1, Math.pow(0.84, 15 - L)) * (G.Game ? G.Game.gamma : 1);
  };

  Sky.hours = () => (6 + Sky.time * 24) % 24;
  Sky.clock = () => {
    const h = Sky.hours();
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(Math.floor(mm / 10) * 10).padStart(2, '0');
  };
  Sky.isNight = () => Sky.daylight < 0.35;

  // ---------------------------------------------------------------------------
  // Pro Frame
  // ---------------------------------------------------------------------------
  const sunDir = new THREE.Vector3();
  Sky.update = (dt, camera, player, renderer) => {
    Sky.time = (Sky.time + dt / Sky.dayLength) % 1;
    const ang = Sky.time * Math.PI * 2;
    sunDir.set(Math.cos(ang), Math.sin(ang), 0.28).normalize();
    const sinA = Math.sin(ang);
    Sky.daylight = U.smoothstep(-0.16, 0.2, sinA);

    // Wetterwechsel
    Sky.weatherTimer -= dt;
    if (Sky.weatherTimer <= 0) Sky.setWeather(pickWeather());
    const kind = precipKind(player.pos.x, player.pos.y, player.pos.z);
    const wet = Sky.weather !== 'klar';
    const approach = (v, t, k) => v + (t - v) * Math.min(1, dt * k);
    Sky.rainI = approach(Sky.rainI, kind === 'rain' ? 1 : 0, 0.5);
    Sky.snowI = approach(Sky.snowI, kind === 'snow' ? 1 : 0, 0.5);
    Sky.stormI = approach(Sky.stormI, Sky.weather === 'gewitter' ? 1 : 0, 0.4);
    Sky.cloudI = approach(Sky.cloudI, wet ? 1 : 0, 0.3);
    // Wolkendecke nur ab und zu neu zeichnen (das Neuzeichnen ist teuer)
    const wantCover = wet ? (Sky.weather === 'gewitter' ? 1 : 0.8) : 0.45;
    Sky.cloudRedraw = (Sky.cloudRedraw || 0) - dt;
    if (Math.abs(wantCover - Sky.cloudCover) > 0.01 && Sky.cloudRedraw <= 0) {
      Sky.cloudRedraw = 0.6;
      const step = U.clamp(wantCover - Sky.cloudCover, -0.08, 0.08);
      Sky.drawClouds(Sky.cloudCover + step);
    }

    // Himmelsfarben
    const sunset = U.smoothstep(0.4, 0.0, Math.abs(sinA)) * (Math.cos(ang) > -2 ? 1 : 0);
    const top = new THREE.Color().copy(NIGHT_TOP).lerp(DAY_TOP, Sky.daylight);
    const hor = new THREE.Color().copy(NIGHT_HOR).lerp(DAY_HOR, Sky.daylight);
    top.lerp(SET_TOP, sunset * 0.5 * Sky.daylight + sunset * 0.2);
    hor.lerp(SET_HOR, sunset * 0.75 * U.smoothstep(-0.25, 0.1, sinA));
    const gray = Sky.weather === 'schnee' ? SNOWSKY : STORM;
    const wk = Sky.cloudI * (0.55 + Sky.stormI * 0.35);
    tmpC.copy(gray).multiplyScalar(0.12 + Sky.daylight * 0.88);
    top.lerp(tmpC, wk);
    hor.lerp(tmpC, wk);
    // Blitz erhellt den Himmel
    Sky.flash = Math.max(0, Sky.flash - dt * 4);
    const fl = Sky.flash > 0 ? (Math.sin(Sky.flash * 30) > -0.3 ? Sky.flash : Sky.flash * 0.3) : 0;
    top.lerp(col(0.8, 0.85, 1), fl * 0.7);
    hor.lerp(col(0.85, 0.9, 1), fl * 0.7);

    Sky.domeMat.uniforms.uTop.value.copy(top);
    Sky.domeMat.uniforms.uHor.value.copy(hor);
    Sky.domeMat.uniforms.uSun.value.copy(sunDir);
    Sky.domeMat.uniforms.uGlowK.value = sunset * 0.8 * (1 - wk);

    // Licht-Abzug in der Nacht und bei Unwetter
    Sky.skyDrop = (1 - Sky.daylight) * 10.5 + Sky.cloudI * (1.2 + Sky.stormI * 2.2) * Sky.daylight;
    const u = World.uniforms;
    u.uSkyDrop.value = Sky.skyDrop;
    u.uFlash.value = fl;
    const tint = new THREE.Color(1, 1, 1).lerp(col(0.72, 0.8, 1.05), 1 - Sky.daylight).lerp(col(1.08, 0.94, 0.84), sunset * 0.5);
    u.uSkyTint.value.copy(tint);
    u.uTime.value += dt;

    // Nebel
    const vd = G.Game.viewDist;
    let far = vd - 6, near = vd * 0.5;
    const wf = 1 - Sky.rainI * 0.25 - Sky.stormI * 0.15 - Sky.snowI * 0.4;
    far *= wf; near *= wf;
    let fogC = hor.clone();
    if (player.headInWater) {
      fogC = col(0.08, 0.2, 0.5).multiplyScalar(0.25 + Sky.daylight * 0.75);
      near = 1; far = 16;
    }
    u.uFogColor.value.copy(fogC);
    u.uFogNear.value = near;
    u.uFogFar.value = far;
    if (Sky.scene.fog) {
      Sky.scene.fog.color.copy(fogC);
      Sky.scene.fog.near = near;
      Sky.scene.fog.far = far;
    }
    renderer.setClearColor(hor);

    // Kuppel, Sonne, Mond, Sterne folgen der Kamera
    const cp = camera.position;
    Sky.dome.position.copy(cp);
    Sky.sun.position.copy(cp).addScaledVector(sunDir, 260);
    Sky.sun.lookAt(cp);
    Sky.moon.position.copy(cp).addScaledVector(sunDir, -260);
    Sky.moon.lookAt(cp);
    Sky.sun.material.opacity = 1 - Sky.cloudI * 0.85;
    Sky.moon.material.opacity = 1 - Sky.cloudI * 0.85;
    Sky.stars.position.copy(cp);
    Sky.stars.rotation.z = ang;
    Sky.starMat.opacity = U.clamp(1 - Sky.daylight * 1.6, 0, 1) * (1 - Sky.cloudI * 0.9);
    Sky.stars.visible = Sky.starMat.opacity > 0.01;

    // Wolken
    Sky.clouds.position.set(cp.x, 98, cp.z);
    const cu = Sky.cloudMat.uniforms;
    Sky.windX = (Sky.windX || 0) + dt * (0.8 + Sky.stormI * 2.5);
    cu.uOffset.value.set((cp.x + Sky.windX) / 900 * 3, -cp.z / 900 * 3);
    const cb = 0.18 + Sky.daylight * 0.82;
    const cc = col(1, 1, 1).lerp(col(0.5, 0.52, 0.56), wk * 1.1).multiplyScalar(cb);
    cc.lerp(col(1, 0.7, 0.55), sunset * 0.4 * (1 - wk));
    cu.uColor.value.copy(cc);
    cu.uOpacity.value = 0.78 + Sky.cloudI * 0.2;

    // Meer
    const ob = Sky.entityBrightness(15, 0);
    Sky.oceanMat.color.setRGB(0.17 * ob, 0.33 * ob, 0.76 * ob);

    // Licht für Figuren
    Sky.ambient.intensity = 0.72 + fl * 0.5;
    Sky.dirLight.intensity = 0.48;

    updatePrecip(dt, camera);

    // Blitze
    if (Sky.weather === 'gewitter' && Sky.stormI > 0.6) {
      Sky.nextBolt -= dt;
      if (Sky.nextBolt <= 0) {
        strike(player.pos.x, player.pos.z, Math.random() < 0.08);
        Sky.nextBolt = U.rand(4, 11);
      }
    }
    for (let i = Sky.bolts.length - 1; i >= 0; i--) {
      const b = Sky.bolts[i];
      b.t += dt;
      b.grp.visible = b.t < 0.08 || (b.t > 0.14 && b.t < 0.32);
      if (b.t > 0.4) {
        Sky.scene.remove(b.grp);
        b.grp.traverse((o) => o.isMesh && o.geometry.dispose());
        Sky.bolts.splice(i, 1);
      }
    }
    G.Audio.setAmbience(Sky.rainI * (player.headInWater ? 0.2 : 1), Sky.snowI * 0.6 + Sky.stormI * 0.3);
  };

  // Regentropfen und Schneeflocken rund um die Kamera
  function updatePrecip(dt, camera) {
    const cp = camera.position;
    const R = 22;
    const ground = (x, z) => World.heightAt(x, z) + 1;
    if (!Sky.precipInit) {
      for (let i = 0; i < Sky.rainN; i++) {
        Sky.rainPos[i * 6] = cp.x + U.rand(-R, R);
        Sky.rainPos[i * 6 + 1] = cp.y + U.rand(-10, 20);
        Sky.rainPos[i * 6 + 2] = cp.z + U.rand(-R, R);
        Sky.rainVel[i] = U.rand(20, 26);
      }
      for (let i = 0; i < Sky.snowN; i++) {
        Sky.snowPos[i * 3] = cp.x + U.rand(-R, R);
        Sky.snowPos[i * 3 + 1] = cp.y + U.rand(-10, 20);
        Sky.snowPos[i * 3 + 2] = cp.z + U.rand(-R, R);
        Sky.snowVel[i] = U.rand(1.4, 2.6);
      }
      Sky.precipInit = true;
    }
    const nRain = Math.floor(Sky.rainN * Sky.rainI * (0.6 + Sky.stormI * 0.4));
    Sky.rain.visible = nRain > 0;
    if (nRain > 0) {
      const P = Sky.rainPos;
      const wind = 1.5 + Sky.stormI * 3;
      for (let i = 0; i < nRain; i++) {
        let x = P[i * 6], y = P[i * 6 + 1], z = P[i * 6 + 2];
        y -= Sky.rainVel[i] * dt;
        x += wind * dt;
        if (x - cp.x > R) x -= 2 * R; else if (x - cp.x < -R) x += 2 * R;
        if (z - cp.z > R) z -= 2 * R; else if (z - cp.z < -R) z += 2 * R;
        const g = ground(x, z);
        if (y < g || y < cp.y - 14) {
          if (y < g && g > cp.y - 14 && Math.random() < 0.06) G.Ent.burst(x, g + 0.05, z, [160, 180, 230], 1, 0.5, 'block', 0.05);
          x = cp.x + U.rand(-R, R);
          z = cp.z + U.rand(-R, R);
          y = Math.max(cp.y + U.rand(6, 20), ground(x, z) + U.rand(0, 4));
        }
        P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x - wind * 0.03; P[i * 6 + 4] = y + 0.6; P[i * 6 + 5] = z;
      }
      Sky.rain.geometry.setDrawRange(0, nRain * 2);
      Sky.rain.geometry.attributes.position.needsUpdate = true;
      const rb = 0.35 + Sky.daylight * 0.65;
      Sky.rain.material.color.setRGB(0.62 * rb, 0.7 * rb, 0.85 * rb);
    }
    const nSnow = Math.floor(Sky.snowN * Sky.snowI);
    Sky.snow.visible = nSnow > 0;
    if (nSnow > 0) {
      const P = Sky.snowPos;
      const t = World.uniforms.uTime.value;
      for (let i = 0; i < nSnow; i++) {
        let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        y -= Sky.snowVel[i] * dt;
        x += Math.sin(t * 0.9 + i) * 0.6 * dt + 0.4 * dt;
        z += Math.cos(t * 0.7 + i * 1.3) * 0.6 * dt;
        if (x - cp.x > R) x -= 2 * R; else if (x - cp.x < -R) x += 2 * R;
        if (z - cp.z > R) z -= 2 * R; else if (z - cp.z < -R) z += 2 * R;
        if (y < ground(x, z) || y < cp.y - 14) {
          x = cp.x + U.rand(-R, R);
          z = cp.z + U.rand(-R, R);
          y = Math.max(cp.y + U.rand(4, 18), ground(x, z) + U.rand(0, 3));
        }
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      }
      Sky.snow.geometry.setDrawRange(0, nSnow);
      Sky.snow.geometry.attributes.position.needsUpdate = true;
      const sb = 0.3 + Sky.daylight * 0.7;
      Sky.snow.material.color.setRGB(sb, sb, sb);
    }
  }
})();
