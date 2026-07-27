// Level construction: rooms, corridors, doors, pickups, torches, slime pit,
// gold-key door, secret alcove and the exit portal. All geometry is
// axis-aligned boxes (Quake-style brush work) which double as colliders.
import * as THREE from 'three';

const WALL_T = 32;

// Scale a BoxGeometry's UVs so texel density is ~64 units per tile.
function scaleBoxUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * fw / 64, uv.getY(i) * fh / 64);
    }
  }
  uv.needsUpdate = true;
}

export class Level {
  constructor(scene, textures, sfx) {
    this.scene = scene;
    this.tex = textures;
    this.sfx = sfx;
    this.group = new THREE.Group();
    this.colliders = [];
    this.doors = [];
    this.pickups = [];
    this.torches = [];
    this.shootables = [];
    this.slimeRegions = [];
    this.spawns = [];
    this.time = 0;
    this.secretsTotal = 1;
    this.secretsFound = 0;
    this._mats = {};
    this._build();
    scene.add(this.group);
  }

  _mat(name) {
    if (!this._mats[name]) {
      this._mats[name] = new THREE.MeshLambertMaterial({ map: this.tex[name] });
    }
    return this._mats[name];
  }

  // Add a solid box: center (x,z), base y, size w,h,d. Returns mesh.
  _box(x, y, z, w, h, d, texName, collide = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(geo, w, h, d);
    const m = new THREE.Mesh(geo, this._mat(texName));
    m.position.set(x, y + h / 2, z);
    this.group.add(m);
    if (collide) {
      const b = new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2));
      m.userData.collider = b;
      this.colliders.push(b);
    }
    return m;
  }

  // Wall along X at fixed z (wall center zc), spanning x0..x1, height h,
  // with gaps [{at, w, h}].
  _wallX(x0, x1, zc, h, tex, gaps = []) {
    let cuts = [[x0, x1]];
    const segs = [];
    for (const g of gaps) {
      const next = [];
      for (const [a, b] of cuts) {
        const g0 = g.at - g.w / 2, g1 = g.at + g.w / 2;
        if (g1 <= a || g0 >= b) { next.push([a, b]); continue; }
        if (g0 > a) next.push([a, g0]);
        if (g1 < b) next.push([g1, b]);
        if (g.h < h) segs.push([g0, g1, g.h, h]); // lintel above gap
      }
      cuts = next;
    }
    for (const [a, b] of cuts) segs.push([a, b, 0, h]);
    for (const [a, b, y0, y1] of segs) {
      if (b - a < 1 || y1 - y0 < 1) continue;
      this._box((a + b) / 2, y0, zc, b - a, y1 - y0, WALL_T, tex);
    }
  }

  // Wall along Z at fixed x.
  _wallZ(z0, z1, xc, h, tex, gaps = []) {
    let cuts = [[z0, z1]];
    const segs = [];
    for (const g of gaps) {
      const next = [];
      for (const [a, b] of cuts) {
        const g0 = g.at - g.w / 2, g1 = g.at + g.w / 2;
        if (g1 <= a || g0 >= b) { next.push([a, b]); continue; }
        if (g0 > a) next.push([a, g0]);
        if (g1 < b) next.push([g1, b]);
        if (g.h < h) segs.push([g0, g1, g.h, h]);
      }
      cuts = next;
    }
    for (const [a, b] of cuts) segs.push([a, b, 0, h]);
    for (const [a, b, y0, y1] of segs) {
      if (b - a < 1 || y1 - y0 < 1) continue;
      this._box(xc, y0, (a + b) / 2, WALL_T, y1 - y0, b - a, tex);
    }
  }

  _room({ x0, z0, x1, z1, h, floor = 'floor', wall = 'brick', ceil = true, gapsN = [], gapsS = [], gapsE = [], gapsW = [] }) {
    if (floor) {
      this._box((x0 + x1) / 2, -WALL_T, (z0 + z1) / 2, (x1 - x0) + 2 * WALL_T, WALL_T, (z1 - z0) + 2 * WALL_T, floor);
    }
    if (ceil) {
      this._box((x0 + x1) / 2, h, (z0 + z1) / 2, (x1 - x0) + 2 * WALL_T, WALL_T, (z1 - z0) + 2 * WALL_T, wall);
    }
    this._wallX(x0, x1, z0 - WALL_T / 2, h, wall, gapsN); // north wall
    this._wallX(x0, x1, z1 + WALL_T / 2, h, wall, gapsS); // south wall
    this._wallZ(z0, z1, x0 - WALL_T / 2, h, wall, gapsW);
    this._wallZ(z0, z1, x1 + WALL_T / 2, h, wall, gapsE);
  }

  _door(x, z, h, locked = null) {
    const w = 128, t = 24;
    const geo = new THREE.BoxGeometry(w, h, t);
    scaleBoxUVs(geo, w, h, t);
    const mesh = new THREE.Mesh(geo, this._mat('door'));
    mesh.position.set(x, h / 2, z);
    this.group.add(mesh);
    const collider = new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - t / 2),
      new THREE.Vector3(x + w / 2, h, z + t / 2));
    this.colliders.push(collider);
    const trigger = new THREE.Box3(
      new THREE.Vector3(x - w / 2 - 48, 0, z - 64),
      new THREE.Vector3(x + w / 2 + 48, h, z + 64));
    this.doors.push({
      mesh, collider, trigger, baseY: 0, h, openT: 0, state: 'closed',
      locked, msgCooldown: 0, timer: 0,
    });
  }

  _torch(x, y, z) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
    b.position.set(x, y - 8, z);
    this.group.add(b);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.flame, color: 0xffc060, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flame.position.set(x, y + 8, z);
    flame.scale.setScalar(26);
    this.group.add(flame);
    const light = new THREE.PointLight(0xff8a35, 1.5, 340, 1.9);
    light.position.set(x, y + 14, z);
    this.group.add(light);
    this.torches.push({ flame, light, seed: Math.random() * 100 });
  }

  _pickupMesh(kind) {
    const g = new THREE.Group();
    const lam = (c, e = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const box = (w, h, d, m, y = 0, x = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh); return mesh;
    };
    switch (kind) {
      case 'shells':
        box(22, 10, 22, lam(0x8a6a3a), 5);
        box(22, 4, 22, lam(0xc8a860), 12);
        break;
      case 'nails':
        box(22, 10, 22, lam(0x6a6a72), 5);
        box(18, 4, 18, lam(0xb8b8c0), 12);
        break;
      case 'health15': case 'health25': case 'megahealth': {
        const s = kind === 'health15' ? 18 : kind === 'health25' ? 24 : 30;
        box(s, s, s, lam(0xd8d0c0), s / 2);
        box(s * 0.6, 3, s * 0.2, lam(0xb02018, 0x300505), s + 1);
        box(s * 0.2, 3, s * 0.6, lam(0xb02018, 0x300505), s + 1);
        if (kind === 'megahealth') {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.tex.glow, color: 0x80c0ff, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
          }));
          glow.scale.setScalar(60); glow.position.y = s / 2;
          g.add(glow);
        }
        break;
      }
      case 'armor':
        box(30, 16, 24, lam(0x2a6a2a), 8);
        box(24, 8, 18, lam(0x3f9a3f), 19);
        break;
      case 'key':
        box(6, 20, 6, lam(0xd8b830, 0x443300), 10);
        box(16, 6, 6, lam(0xd8b830, 0x443300), 17);
        break;
      case 'shotgun':
        box(8, 8, 34, lam(0x4a4a52), 8);
        box(10, 10, 16, lam(0x6b4a2a), 6, 0, 10);
        break;
      case 'nailgun':
        box(6, 6, 30, lam(0x707078), 10, -5);
        box(6, 6, 30, lam(0x707078), 10, 5);
        box(14, 10, 14, lam(0x8a6a3a), 5, 0, 8);
        break;
    }
    return g;
  }

  _pickup(kind, x, y, z) {
    const mesh = this._pickupMesh(kind);
    mesh.position.set(x, y + 8, z);
    this.group.add(mesh);
    this.pickups.push({
      kind, mesh, baseY: y + 8, phase: Math.random() * 6.28, taken: false,
      box: new THREE.Box3(new THREE.Vector3(x - 26, y - 10, z - 26), new THREE.Vector3(x + 26, y + 46, z + 26)),
    });
  }

  _build() {
    const T = this.tex;

    // ---- Rooms ----
    // A: start
    this._room({ x0: 0, z0: 0, x1: 384, z1: 384, h: 192, wall: 'brick', floor: 'floor', gapsN: [{ at: 192, w: 128, h: 128 }] });
    // corridor 1
    this._room({ x0: 128, z0: -288, x1: 256, z1: 0, h: 128, wall: 'metal', floor: 'metalFloor', gapsS: [{ at: 192, w: 128, h: 128 }], gapsN: [{ at: 192, w: 128, h: 128 }] });
    // B: pillar hall
    this._room({ x0: -128, z0: -704, x1: 512, z1: -288, h: 256, wall: 'brick2', floor: 'floor', gapsS: [{ at: 192, w: 128, h: 128 }], gapsN: [{ at: 320, w: 128, h: 128 }] });
    // corridor 2
    this._room({ x0: 256, z0: -960, x1: 384, z1: -704, h: 160, wall: 'metal', floor: 'metalFloor', gapsS: [{ at: 320, w: 128, h: 128 }], gapsN: [{ at: 320, w: 128, h: 128 }] });
    // C: slime bridge room (custom pit floor)
    this._room({ x0: -64, z0: -1216, x1: 448, z1: -960, h: 192, wall: 'brick', floor: false, gapsS: [{ at: 320, w: 128, h: 128 }], gapsN: [{ at: 320, w: 128, h: 128 }] });
    this._slimePit();
    // D: arena, open sky, secret gap in east wall
    this._room({ x0: -192, z0: -1728, x1: 576, z1: -1216, h: 320, wall: 'brick2', floor: 'floor', ceil: false, gapsS: [{ at: 320, w: 128, h: 128 }], gapsN: [{ at: 320, w: 128, h: 128 }], gapsE: [{ at: -1504, w: 64, h: 128 }] });
    // exit room
    this._room({ x0: 192, z0: -1984, x1: 448, z1: -1728, h: 160, wall: 'metal', floor: 'metalFloor', gapsS: [{ at: 320, w: 128, h: 128 }] });
    // secret alcove behind D's east wall
    this._room({ x0: 608, z0: -1536, x1: 688, z1: -1472, h: 128, wall: 'brick2', floor: 'floor', gapsW: [{ at: -1504, w: 64, h: 128 }] });

    // ---- Doors ----
    this._door(192, 0, 128);
    this._door(192, -288, 128);
    this._door(320, -704, 128);
    this._door(320, -960, 128);
    this._door(320, -1216, 128);
    this._door(320, -1728, 128, 'gold');

    // ---- Secret panel (shoot to open) ----
    {
      const geo = new THREE.BoxGeometry(32, 128, 64);
      scaleBoxUVs(geo, 32, 128, 64);
      const mesh = new THREE.Mesh(geo, this._mat('brick2'));
      mesh.position.set(592, 64, -1504);
      this.group.add(mesh);
      const collider = new THREE.Box3(new THREE.Vector3(576, 0, -1536), new THREE.Vector3(608, 128, -1472));
      this.colliders.push(collider);
      this.secretPanel = { mesh, collider, openT: 0, opening: false, opened: false };
      const self = this;
      this.shootables.push({ collider, onShot: () => self._openSecret() });
    }

    // ---- B room pillars ----
    for (const [px, pz] of [[32, -400], [352, -400], [32, -608], [352, -608]]) {
      this._box(px, 0, pz, 64, 256, 64, 'metal');
    }

    // ---- D crates ----
    this._box(160, 0, -1424, 64, 64, 64, 'wood');
    this._box(256, 0, -1504, 64, 64, 64, 'wood');
    this._box(256, 64, -1504, 64, 64, 64, 'wood');
    this._box(80, 0, -1584, 64, 64, 64, 'wood');
    this._box(480, 0, -1424, 64, 64, 64, 'wood');
    this._box(480, 64, -1424, 64, 64, 64, 'wood');
    // gold key pedestal
    this._box(320, 0, -1560, 40, 48, 40, 'metal');

    // ---- Slipgate decor behind player start ----
    {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(96, 128),
        new THREE.MeshBasicMaterial({ map: T.portal }));
      m.position.set(192, 64, 381);
      m.rotation.y = Math.PI;
      this.group.add(m);
      this._box(192 - 56, 0, 376, 12, 140, 12, 'metal', false);
      this._box(192 + 56, 0, 376, 12, 140, 12, 'metal', false);
    }

    // ---- Exit portal ----
    {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(96, 128),
        new THREE.MeshBasicMaterial({ map: T.portal }));
      m.position.set(320, 64, -1978);
      this.group.add(m);
      this._box(320 - 56, 0, -1978, 12, 140, 12, 'metal', false);
      this._box(320 + 56, 0, -1978, 12, 140, 12, 'metal', false);
      this.exitBox = new THREE.Box3(
        new THREE.Vector3(288, 0, -1984), new THREE.Vector3(352, 96, -1940));
    }

    // ---- Sky ----
    {
      T.sky.repeat.set(6, 3);
      const m = new THREE.Mesh(new THREE.BoxGeometry(7000, 7000, 7000),
        new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false }));
      m.name = 'sky';
      m.position.set(192, 500, -900);
      this.group.add(m);
    }

    // ---- Torches ----
    this._torch(20, 110, 128); this._torch(364, 110, 256);
    this._torch(144, 80, -144);
    this._torch(-108, 130, -512); this._torch(492, 130, -384); this._torch(492, 130, -640); this._torch(128, 130, -684);
    this._torch(276, 100, -832);
    this._torch(-44, 110, -1000); this._torch(428, 110, -1176);
    this._torch(-172, 160, -1250); this._torch(556, 160, -1250); this._torch(-172, 160, -1690); this._torch(556, 160, -1690);
    this._torch(224, 100, -1952);

    // ---- Pickups ----
    this._pickup('shotgun', 192, 0, 240);
    this._pickup('shells', 128, 0, 320); this._pickup('shells', 256, 0, 320);
    this._pickup('armor', 64, 0, -640);
    this._pickup('health25', 448, 0, -352); this._pickup('health25', 448, 0, -672);
    this._pickup('health15', 0, 0, -352);
    this._pickup('shells', 256, 0, -352); this._pickup('shells', 256, 0, -672);
    this._pickup('nails', 320, 0, -840);
    this._pickup('nailgun', 320, 0, -1088);
    this._pickup('nails', 320, 0, -1000); this._pickup('nails', 320, 0, -1176);
    this._pickup('health15', 128, 0, -1000); this._pickup('health15', 128, 0, -1176);
    this._pickup('shells', 64, 0, -1360); this._pickup('shells', 512, 0, -1360);
    this._pickup('health25', -128, 0, -1500); this._pickup('health25', 512, 0, -1664);
    this._pickup('nails', 192, 0, -1300);
    this._pickup('key', 320, 48, -1560);
    this._pickup('megahealth', 648, 0, -1504); this._pickup('nails', 660, 0, -1520);
    this._pickup('health25', 240, 0, -1900);

    // ---- Enemy spawns ----
    this.spawns = [
      { type: 'grunt', x: 192, y: 0, z: -160 },
      { type: 'grunt', x: 64, y: 0, z: -352 },
      { type: 'grunt', x: 420, y: 0, z: -620 },
      { type: 'ogre', x: 320, y: 0, z: -512 },
      { type: 'grunt', x: 320, y: 0, z: -1160 },
      { type: 'grunt', x: 128, y: 0, z: -1000 },
      { type: 'grunt', x: 0, y: 0, z: -1360 },
      { type: 'grunt', x: 480, y: 0, z: -1360 },
      { type: 'ogre', x: 128, y: 0, z: -1600 },
      { type: 'ogre', x: 448, y: 0, z: -1500 },
    ];

    this.playerStart = { x: 192, y: 0, z: 320, yaw: 0 };
  }

  // Room C floor: strips around a 40-deep slime pit with a wood bridge.
  _slimePit() {
    // pit spans x -32..416, z -1152..-1024
    // floor strips, top y=0, 40 thick (their inner faces are the pit walls)
    this._box(192, -40, -976, 576, 40, 96, 'floor');   // north strip z -1024..-928
    this._box(192, -40, -1200, 576, 40, 96, 'floor');  // south strip z -1248..-1152
    this._box(-64, -40, -1088, 64 + 32, 40, 128, 'floor');       // west strip
    this._box(448, -40, -1088, 64 + 32, 40, 128, 'floor');       // east strip
    // pit floor
    this._box(192, -72, -1088, 448, 32, 128, 'floor');
    // bridge
    this._box(320, -16, -1088, 96, 16, 256, 'wood');
    // slime surface
    const m = new THREE.Mesh(new THREE.PlaneGeometry(448, 128),
      new THREE.MeshLambertMaterial({
        map: this.tex.slime, transparent: true, opacity: 0.92,
        emissive: 0x1a3308,
      }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(192, -34, -1088);
    this.group.add(m);
    this.tex.slime.repeat.set(4, 1);
    this.slimeRegions.push(new THREE.Box3(
      new THREE.Vector3(-32, -38, -1152), new THREE.Vector3(416, -28, -1024)));
  }

  _openSecret() {
    if (this.secretPanel.opening) return;
    this.secretPanel.opening = true;
    this.secretsFound++;
    if (this.onSecret) this.onSecret();
  }

  update(dt, game) {
    this.time += dt;
    const p = game.player;
    const pPos = new THREE.Vector3(p.pos.x, p.pos.y + 28, p.pos.z);

    // doors
    for (const d of this.doors) {
      d.msgCooldown -= dt;
      const inside = d.trigger.containsPoint(pPos);
      if (inside && d.state === 'closed') {
        if (d.locked === 'gold' && !p.hasGoldKey) {
          if (d.msgCooldown <= 0) {
            game.message('You need the gold key');
            this.sfx.locked();
            d.msgCooldown = 2.5;
          }
        } else {
          d.state = 'opening';
          this.sfx.door();
        }
      }
      if (d.state === 'opening') {
        d.openT = Math.min(1, d.openT + dt * 2.2);
        if (d.openT >= 1) { d.state = 'open'; d.timer = 2.5; }
      } else if (d.state === 'open') {
        if (!inside) {
          d.timer -= dt;
          if (d.timer <= 0) { d.state = 'closing'; this.sfx.door(); }
        } else d.timer = 2.5;
      } else if (d.state === 'closing') {
        d.openT = Math.max(0, d.openT - dt * 2.2);
        if (d.openT <= 0) d.state = 'closed';
      }
      const lift = d.openT * (d.h - 8);
      d.mesh.position.y = d.baseY + d.h / 2 + lift;
      d.collider.min.y = d.baseY + lift;
      d.collider.max.y = d.baseY + d.h + lift;
    }

    // secret panel slides up
    const sp = this.secretPanel;
    if (sp.opening && sp.openT < 1) {
      sp.openT = Math.min(1, sp.openT + dt * 1.4);
      sp.mesh.position.y = 64 + sp.openT * 118;
      sp.collider.min.y = sp.openT * 118;
      sp.collider.max.y = 128 + sp.openT * 118;
    }

    // pickups bob, spin, collect
    _pbox.min.set(p.pos.x - 16, p.pos.y, p.pos.z - 16);
    _pbox.max.set(p.pos.x + 16, p.pos.y + 56, p.pos.z + 16);
    for (const it of this.pickups) {
      if (it.taken) continue;
      it.mesh.position.y = it.baseY + Math.sin(this.time * 2.4 + it.phase) * 5;
      if (it.kind === 'armor' || it.kind === 'key' || it.kind === 'shotgun' || it.kind === 'nailgun') {
        it.mesh.rotation.y += dt * 1.8;
      }
      if (it.box.intersectsBox(_pbox)) {
        if (game.applyPickup(it.kind)) {
          it.taken = true;
          this.group.remove(it.mesh);
        }
      }
    }

    // torch flicker
    for (const t of this.torches) {
      const f = Math.sin(this.time * 11 + t.seed) * 0.25 + Math.sin(this.time * 23 + t.seed * 2) * 0.15;
      t.light.intensity = 1.5 + f;
      t.flame.scale.setScalar(24 + f * 8);
    }

    // animate slime & portal textures
    this.tex.slime.offset.x = (this.time * 0.02) % 1;
    this.tex.slime.offset.y = (this.time * 0.013) % 1;
    this.tex.portal.center.set(0.5, 0.5);
    this.tex.portal.rotation = this.time * 0.4;

    // exit
    if (this.exitBox.containsPoint(pPos)) {
      game.levelComplete();
    }
  }
}

const _pbox = new THREE.Box3();
