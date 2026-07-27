// Enemies: Grunt (hitscan soldier) and Ogre (grenade-lobbing brute),
// built from chunky boxes with simple Quake-like AI:
// idle -> alert -> chase -> attack (ranged windup / melee).
import * as THREE from 'three';
import { moveBox, rayHitBoxes, segmentClear } from './collision.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function bx(w, h, d, c, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
  m.position.set(x, y, z);
  return m;
}

function buildGrunt() {
  const g = new THREE.Group();
  g.add(bx(9, 20, 9, 0x4a3828, -6, 10, 0));   // legs
  g.add(bx(9, 20, 9, 0x4a3828, 6, 10, 0));
  g.add(bx(22, 22, 12, 0x5a5a40, 0, 31, 0));  // torso
  g.add(bx(7, 18, 7, 0x5a5a40, -14, 32, 0));  // left arm
  g.add(bx(6, 6, 20, 0x3a3a40, 12, 34, 8));   // gun arm
  g.add(bx(10, 10, 10, 0xc8a080, 0, 47, 0));  // head
  g.add(bx(12, 5, 12, 0x3a3a30, 0, 53, 0));   // helmet
  return g;
}

function buildOgre() {
  const g = new THREE.Group();
  g.add(bx(13, 26, 13, 0x8a6a48, -9, 13, 0));  // legs
  g.add(bx(13, 26, 13, 0x8a6a48, 9, 13, 0));
  g.add(bx(32, 30, 18, 0xc09868, 0, 41, 0));   // torso
  g.add(bx(10, 22, 10, 0xc09868, -21, 42, 0)); // left arm
  g.add(bx(9, 9, 26, 0x505058, 20, 44, 8));    // chainsaw arm
  g.add(bx(11, 3, 28, 0xb8b8c0, 20, 44, 10));  // blade
  g.add(bx(15, 13, 15, 0xc09868, 0, 62, 0));   // head
  g.add(bx(4, 8, 4, 0xe8e0d0, -6, 71, 0));     // horns
  g.add(bx(4, 8, 4, 0xe8e0d0, 6, 71, 0));
  return g;
}

let nextId = 1;

class Enemy {
  constructor(type, x, y, z, game) {
    this.id = nextId++;
    this.type = type;
    this.game = game;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * 6.28;
    if (type === 'grunt') {
      this.half = 16; this.height = 56; this.hp = 30; this.speed = 130;
      this.eyeH = 44; this.mesh = buildGrunt();
    } else {
      this.half = 22; this.height = 76; this.hp = 200; this.speed = 110;
      this.eyeH = 58; this.mesh = buildOgre();
    }
    this.maxHp = this.hp;
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.attackCd = 1 + Math.random();
    this.alerted = false;
    this.deadT = 0;
    this.unstickT = 0;
    this.unstickDir = 0;
    this._box = new THREE.Box3();
    game.scene.add(this.mesh);
    this._syncMesh();
  }

  _syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  hitBox() {
    this._box.min.set(this.pos.x - this.half, this.pos.y, this.pos.z - this.half);
    this._box.max.set(this.pos.x + this.half, this.pos.y + this.height, this.pos.z + this.half);
    return this._box;
  }

  eye() { return _v.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  canSeePlayer() {
    const g = this.game;
    const a = this.eye().clone();
    const b = g.player.eyePos();
    return segmentClear(a, b, g.level.colliders) === Infinity;
  }

  distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  damage(amount, game, point) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.deadT = 0;
      const center = new THREE.Vector3(this.pos.x, this.pos.y + this.height / 2, this.pos.z);
      const dist = this.pos.distanceTo(game.player.pos);
      if (this.hp < -40) { // gibbed!
        game.effects.gibs(center);
        game.sfx.gib(dist);
        game.scene.remove(this.mesh);
      } else {
        game.effects.blood(center, true);
        if (this.type === 'grunt') game.sfx.gruntDie(dist); else game.sfx.ogreDie(dist);
      }
      game.onEnemyKilled(this);
      return;
    }
    // pain flinch
    const chance = this.type === 'grunt' ? 0.45 : 0.12;
    if (Math.random() < chance && this.state !== 'pain') {
      this.state = 'pain';
      this.stateT = this.type === 'grunt' ? 0.28 : 0.35;
      const dist = this.pos.distanceTo(game.player.pos);
      if (this.type === 'grunt') game.sfx.gruntPain(dist); else game.sfx.ogrePain(dist);
    }
    if (!this.alerted) this._alert();
  }

  _alert() {
    this.alerted = true;
    this.state = 'chase';
    const dist = this.pos.distanceTo(this.game.player.pos);
    if (this.type === 'grunt') this.game.sfx.gruntAlert(dist);
    else this.game.sfx.ogreAlert(dist);
  }

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      // death fall
      if (this.mesh.parent) {
        this.deadT += dt;
        const t = Math.min(1, this.deadT * 3);
        this.mesh.rotation.x = -t * Math.PI / 2 * 0.9;
        this.mesh.position.y = this.pos.y + Math.sin(t * Math.PI) * 2;
      }
      return;
    }

    const p = g.player;
    const dist = this.distToPlayer();
    const sees = !p.dead && this.canSeePlayer();

    if (!this.alerted) {
      if (sees && dist < 700) this._alert();
      this.vel.x = 0; this.vel.z = 0;
    } else if (this.state === 'pain') {
      this.stateT -= dt;
      this.vel.x = 0; this.vel.z = 0;
      if (this.stateT <= 0) this.state = 'chase';
    } else if (this.state === 'attack') {
      this.stateT -= dt;
      this.vel.x = 0; this.vel.z = 0;
      // face player
      this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (this.stateT <= 0) {
        this._attackHit(dist);
        this.state = 'chase';
      }
    } else { // chase
      this.attackCd -= dt;
      if (p.dead) {
        this.vel.x = 0; this.vel.z = 0;
      } else if (this.type === 'grunt' && sees && dist < 640 && this.attackCd <= 0) {
        this.state = 'attack'; this.stateT = 0.45;
        this.attackCd = 1.4 + Math.random() * 1.2;
      } else if (this.type === 'ogre') {
        if (dist < 80 && this.attackCd <= 0) {
          this.state = 'attack'; this.stateT = 0.4;
          this.attackCd = 1.0;
        } else if (sees && dist > 140 && dist < 900 && this.attackCd <= 0) {
          this.state = 'attack'; this.stateT = 0.5;
          this.attackCd = 2.2 + Math.random();
        }
      }
      if (this.state === 'chase') {
        // steer toward player (last seen position not tracked — simple)
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        let mx = dx / d, mz = dz / d;
        this.yaw = Math.atan2(mx, mz);
        if (this.unstickT > 0) {
          this.unstickT -= dt;
          const a = this.unstickDir;
          const rx = mx * Math.cos(a) - mz * Math.sin(a);
          const rz = mx * Math.sin(a) + mz * Math.cos(a);
          mx = rx; mz = rz;
        }
        // ogres stop to lob when far — keep some distance
        const stop = this.type === 'ogre' && sees && dist > 200 && this.attackCd < 1.2;
        if (stop) { this.vel.x = 0; this.vel.z = 0; }
        else {
          this.vel.x = mx * this.speed;
          this.vel.z = mz * this.speed;
        }
      }
    }

    // physics
    this.vel.y -= 800 * dt;
    const before = _v2.copy(this.pos);
    const res = moveBox(this.pos, this.half, this.height, this.vel.clone().multiplyScalar(dt), g.level.colliders);
    if (res.grounded) this.vel.y = 0;
    // stuck detection
    if ((this.state === 'chase') && (Math.abs(this.vel.x) + Math.abs(this.vel.z) > 10)) {
      const moved = _v2.sub(this.pos).length();
      if (moved < this.speed * dt * 0.25 && this.unstickT <= 0) {
        this.unstickT = 0.6;
        this.unstickDir = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
    }
    this._syncMesh();
  }

  _attackHit(dist) {
    const g = this.game, p = g.player;
    if (p.dead) return;
    if (this.type === 'grunt') {
      if (!this.canSeePlayer() || dist > 700) return;
      g.sfx.gruntShoot(dist);
      // muzzle sparks
      const gun = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 20, this.pos.y + 34, this.pos.z + Math.cos(this.yaw) * 20);
      g.effects.sparks(gun);
      // 4 pellets at player eye with spread
      for (let i = 0; i < 4; i++) {
        const from = new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
        const to = p.eyePos();
        to.x += (Math.random() - 0.5) * 40;
        to.y += (Math.random() - 0.5) * 30;
        to.z += (Math.random() - 0.5) * 40;
        const dir = to.sub(from);
        const len = dir.length();
        dir.divideScalar(len);
        const wallD = rayHitBoxes(from, dir, len, g.level.colliders);
        if (wallD >= len - 30) { // reaches near player
          p.damage(4, g);
        }
      }
    } else { // ogre
      if (dist < 90) {
        g.sfx.chainsaw(dist);
        p.damage(14, g);
      } else {
        // lob grenade
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 50, this.pos.z);
        const target = p.pos.clone(); target.y += 20;
        const t = THREE.MathUtils.clamp(dist / 420, 0.8, 1.7);
        const vel = new THREE.Vector3(
          (target.x - from.x) / t,
          (target.y - from.y + 0.5 * 800 * t * t) / t,
          (target.z - from.z) / t);
        g.enemies.spawnGrenade(from, vel);
        g.sfx.ogrePain(dist); // grunt effort
      }
    }
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.grenades = [];
    this.grenadeGeo = new THREE.BoxGeometry(8, 8, 8);
    this.grenadeMat = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });
    for (const s of game.level.spawns) {
      this.list.push(new Enemy(s.type, s.x, s.y, s.z, game));
    }
    this.total = this.list.length;
    this.killed = 0;
  }

  spawnGrenade(pos, vel) {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.grenades.push({ pos: pos.clone(), vel: vel.clone(), mesh, fuse: 3, bounced: false });
  }

  _explode(pos) {
    const g = this.game;
    const distP = pos.distanceTo(g.player.pos);
    g.effects.explosion(pos);
    g.sfx.explosion(distP);
    const R = 150;
    if (!g.player.dead && distP < R) {
      g.player.damage(Math.ceil((1 - distP / R) * 80) + 8, g);
    }
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = new THREE.Vector3(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
      const d = pos.distanceTo(c);
      if (d < R) e.damage(Math.ceil((1 - d / R) * 80) + 8, g, c);
    }
    // explosions can open the secret panel
    for (const s of g.level.shootables) {
      const c = new THREE.Vector3();
      s.collider.getCenter(c);
      if (pos.distanceTo(c) < R + 40) s.onShot();
    }
  }

  update(dt) {
    const g = this.game;
    for (const e of this.list) e.update(dt);

    // separation (cheap n^2, few enemies)
    const alive = this.list.filter(e => e.alive);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.half + b.half + 4;
      if (d > 0.01 && d < min && Math.abs(a.pos.y - b.pos.y) < 60) {
        const push = (min - d) / 2;
        a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
        b.pos.x += dx / d * push; b.pos.z += dz / d * push;
        a._syncMesh(); b._syncMesh();
      }
    }

    // grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i];
      n.fuse -= dt;
      n.vel.y -= 800 * dt;
      const step = _v.copy(n.vel).multiplyScalar(dt);
      const segLen = step.length();
      const dir = step.clone().normalize();
      const wallD = rayHitBoxes(n.pos, dir, segLen, g.level.colliders);
      // direct hit on player?
      const pBox = new THREE.Box3(
        new THREE.Vector3(g.player.pos.x - 20, g.player.pos.y, g.player.pos.z - 20),
        new THREE.Vector3(g.player.pos.x + 20, g.player.pos.y + 60, g.player.pos.z + 20));
      _ray.origin.copy(n.pos); _ray.direction.copy(dir);
      const hitP = _ray.intersectBox(pBox, _hit);
      const hitPlayer = hitP && n.pos.distanceTo(hitP) <= segLen && !g.player.dead;
      let boom = n.fuse <= 0 || hitPlayer;
      if (!boom && wallD <= segLen) {
        // move to contact point
        n.pos.addScaledVector(dir, Math.max(0, wallD - 1));
        if (!n.bounced && n.vel.y < 0) {
          n.vel.y *= -0.45; n.vel.x *= 0.65; n.vel.z *= 0.65;
          n.bounced = true;
          g.sfx.grenadeBounce(n.pos.distanceTo(g.player.pos));
        } else boom = true;
      } else if (!boom) {
        n.pos.add(step);
      }
      if (boom) {
        g.scene.remove(n.mesh);
        this.grenades.splice(i, 1);
        this._explode(n.pos);
      } else {
        n.mesh.position.copy(n.pos);
        n.mesh.rotation.x += dt * 6; n.mesh.rotation.z += dt * 4;
      }
    }
  }

  reset() {
    for (const e of this.list) e.dispose();
    for (const n of this.grenades) this.game.scene.remove(n.mesh);
    this.grenades = [];
    this.list = [];
    for (const s of this.game.level.spawns) {
      this.list.push(new Enemy(s.type, s.x, s.y, s.z, this.game));
    }
    this.killed = 0;
  }
}
