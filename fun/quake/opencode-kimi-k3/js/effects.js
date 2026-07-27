// Chunky square-particle effects, Quake style. Uses THREE.Points with no
// texture map so particles render as crisp squares.
import * as THREE from 'three';

class Burst {
  constructor(scene, pos, opts) {
    const { count = 12, colors = [0xaa0000], speed = 160, gravity = 600, size = 4,
      life = 0.7, upBias = 0.3, spread = 1 } = opts;
    this.life = life;
    this.maxLife = life;
    this.gravity = gravity;
    const n = count;
    this.vel = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.vel[i * 3] = Math.cos(th) * Math.cos(ph) * s;
      this.vel[i * 3 + 1] = Math.sin(ph) * s + speed * upBias;
      this.vel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * s;
      c.setHex(colors[(Math.random() * colors.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({
      size, vertexColors: true, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(dt) {
    this.life -= dt;
    const p = this.points.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      this.vel[i * 3 + 1] -= this.gravity * dt;
      p.array[i * 3] += this.vel[i * 3] * dt;
      p.array[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      p.array[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (p.array[i * 3 + 1] < 2) { p.array[i * 3 + 1] = 2; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.7; this.vel[i * 3 + 2] *= 0.7; }
    }
    p.needsUpdate = true;
    this.mat.opacity = Math.max(0, this.life / this.maxLife);
    return this.life > 0;
  }
  dispose(scene) {
    scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

export class Effects {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.bursts = [];
    this.muzzleLight = new THREE.PointLight(0xffc36a, 0, 500, 1.8);
    scene.add(this.muzzleLight);
    this.explLight = new THREE.PointLight(0xff9040, 0, 900, 1.6);
    scene.add(this.explLight);
    this._sprites = [];
  }

  blood(pos, big = false) {
    this.bursts.push(new Burst(this.scene, pos, {
      count: big ? 22 : 10, colors: [0xa01008, 0x7a0a04, 0xc02818],
      speed: big ? 240 : 170, size: big ? 5 : 4, life: 0.6, upBias: 0.35,
    }));
  }

  gibs(pos) {
    this.bursts.push(new Burst(this.scene, pos, {
      count: 34, colors: [0xa01008, 0x6a0803, 0xc02818, 0x8a5a3a],
      speed: 320, size: 7, life: 1.1, upBias: 0.55,
    }));
  }

  sparks(pos) {
    this.bursts.push(new Burst(this.scene, pos, {
      count: 8, colors: [0xffe080, 0xffc040, 0x9a9aa0],
      speed: 220, size: 3, life: 0.35, upBias: 0.4,
    }));
  }

  puff(pos) { // gray wall-impact dust
    this.bursts.push(new Burst(this.scene, pos, {
      count: 6, colors: [0x8a8578, 0x6a6558], speed: 90, size: 4,
      life: 0.4, upBias: 0.5, gravity: 120,
    }));
  }

  slimeSplash(pos) {
    this.bursts.push(new Burst(this.scene, pos, {
      count: 14, colors: [0x527a2e, 0x68913a, 0x3f6126], speed: 200, size: 5, life: 0.6, upBias: 0.7,
    }));
  }

  explosion(pos) {
    this.bursts.push(new Burst(this.scene, pos, {
      count: 30, colors: [0xffd060, 0xff8020, 0xd03010, 0x505050],
      speed: 420, size: 8, life: 0.55, upBias: 0.35, gravity: 260,
    }));
    this.explLight.position.copy(pos);
    this.explLight.position.y += 20;
    this.explLight.intensity = 6;
    this._flash(pos, 90, 0.28);
  }

  muzzle(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 4;
  }

  _flash(pos, scale, life) { // short-lived glow sprite
    const m = new THREE.SpriteMaterial({
      map: this.textures.glow, color: 0xffc080, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(scale);
    this.scene.add(s);
    this._sprites.push({ s, life, maxLife: life, grow: scale * 3 });
  }

  update(dt) {
    this.bursts = this.bursts.filter(b => {
      if (!b.update(dt)) { b.dispose(this.scene); return false; }
      return true;
    });
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);
    this.explLight.intensity = Math.max(0, this.explLight.intensity - dt * 22);
    this._sprites = this._sprites.filter(o => {
      o.life -= dt;
      o.s.scale.addScalar(o.grow * dt);
      o.s.material.opacity = Math.max(0, o.life / o.maxLife);
      if (o.life <= 0) { this.scene.remove(o.s); o.s.material.dispose(); return false; }
      return true;
    });
  }

  reset() {
    for (const b of this.bursts) b.dispose(this.scene);
    this.bursts = [];
    for (const o of this._sprites) { this.scene.remove(o.s); o.s.material.dispose(); }
    this._sprites = [];
    this.muzzleLight.intensity = 0;
    this.explLight.intensity = 0;
  }
}
