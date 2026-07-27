// Weapons: centered Quake-style viewmodels, hitscan shotgun, projectile
// nailgun, recoil, muzzle flash, wall/enemy hit resolution.
import * as THREE from 'three';
import { rayHitBoxes } from './collision.js';

const _ray = new THREE.Ray();
const _hitP = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }

function buildShotgun() {
  const g = new THREE.Group();
  const barrel = new THREE.BoxGeometry(4, 4, 30);
  const metal = lam(0x3f3f46);
  const b1 = new THREE.Mesh(barrel, metal); b1.position.set(-3, 2, -8);
  const b2 = new THREE.Mesh(barrel, metal); b2.position.set(3, 2, -8);
  const recv = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 12), lam(0x56565e));
  recv.position.set(0, 1, 10);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 16), lam(0x6b4a2a));
  grip.position.set(0, -4, 12);
  g.add(b1, b2, recv, grip);
  return g;
}

function buildNailgun() {
  const g = new THREE.Group();
  const metal = lam(0x6a6a74);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 34), metal); b1.position.set(-4, 2, -10);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 34), metal); b2.position.set(4, 2, -10);
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 4), lam(0xb8b8c8)); band1.position.set(-4, 2, -24);
  const band2 = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 4), lam(0xb8b8c8)); band2.position.set(4, 2, -24);
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), lam(0x8a6a3a));
  body.position.set(0, 0, 10);
  g.add(b1, b2, band1, band2, body);
  return g;
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.models = { shotgun: buildShotgun(), nailgun: buildNailgun() };
    this.group.add(this.models.shotgun);
    this.group.add(this.models.nailgun);
    this.group.position.set(0, -13, -22);
    game.camera.add(this.group);
    this.cooldown = 0;
    this.recoil = 0;
    this.switchT = 0; // >0 while lowering/raising
    this.pendingWeapon = null;
    this.nails = []; // active nail projectiles
    this.nailSide = 1;
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: game.textures.glow, color: 0xffe0a0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.flashSprite.scale.setScalar(0);
    this.flashSprite.position.set(0, 2, -26);
    this.group.add(this.flashSprite);
    this._syncVisibility();
  }

  _syncVisibility() {
    const w = this.game.player.weapon;
    this.models.shotgun.visible = w === 'shotgun';
    this.models.nailgun.visible = w === 'nailgun';
  }

  reset() {
    this.cooldown = 0; this.recoil = 0; this.switchT = 0; this.pendingWeapon = null;
    for (const n of this.nails) this.game.scene.remove(n.mesh);
    this.nails = [];
    this._syncVisibility();
  }

  trySwitch(name) {
    const p = this.game.player;
    if (p.dead || name === p.weapon || !p.weapons[name]) return;
    this.pendingWeapon = name;
    this.switchT = 0.001;
    this.game.sfx.weaponSwitch();
  }

  update(dt, input) {
    const g = this.game, p = g.player;
    this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 14);
    this.flashSprite.scale.setScalar(Math.max(0, this.flashSprite.scale.x - dt * 260));

    // weapon switch animation: lower, swap, raise
    if (this.switchT > 0 || this.pendingWeapon) {
      this.switchT += dt * 5;
      if (this.pendingWeapon && this.switchT >= 1) {
        p.weapon = this.pendingWeapon;
        this.pendingWeapon = null;
        this._syncVisibility();
      }
      if (this.switchT >= 2) { this.switchT = 0; }
    }
    const lowerT = this.pendingWeapon ? Math.min(1, this.switchT) : (this.switchT > 0 ? Math.max(0, 2 - this.switchT) : 0);

    // bob + recoil
    const bobY = Math.sin(p.bobT * 2) * 0.9 * (p.bobAmt || 0);
    const bobX = Math.cos(p.bobT) * 0.7 * (p.bobAmt || 0);
    this.group.position.set(bobX, -13 + bobY - lowerT * 14 + this.recoil * 1.2, -22 + this.recoil * 2.4);
    this.group.rotation.x = this.recoil * 0.12 + lowerT * 0.6;

    // fire
    if (input.fire && !p.dead && this.switchT === 0 && this.cooldown <= 0) {
      if (p.weapon === 'shotgun') this._fireShotgun();
      else this._fireNail();
    }

    // nails
    for (let i = this.nails.length - 1; i >= 0; i--) {
      const n = this.nails[i];
      n.life -= dt;
      const step = _dir.copy(n.vel).multiplyScalar(dt);
      const segLen = step.length();
      const dirN = step.clone().normalize();
      // world hit
      let wallD = rayHitBoxes(n.pos, dirN, segLen, g.level.colliders);
      // enemy hit
      let enemyHit = null, enemyD = Infinity;
      for (const e of g.enemies.list) {
        if (!e.alive) continue;
        _ray.origin.copy(n.pos); _ray.direction.copy(dirN);
        const hp = _ray.intersectBox(e.hitBox(), _hitP);
        if (hp) {
          const d = n.pos.distanceTo(hp);
          if (d < enemyD && d <= segLen) { enemyD = d; enemyHit = e; }
        }
      }
      let done = n.life <= 0;
      if (enemyHit && enemyD <= wallD) {
        enemyHit.damage(9, g, n.pos);
        g.sfx.fleshHit(n.pos.distanceTo(p.pos));
        done = true;
      } else if (wallD <= segLen) {
        const hitAt = n.pos.clone().addScaledVector(dirN, wallD);
        g.effects.puff(hitAt);
        g.sfx.ricochet(n.pos.distanceTo(p.pos));
        done = true;
      }
      if (done) {
        g.scene.remove(n.mesh);
        this.nails.splice(i, 1);
      } else {
        n.pos.add(step);
        n.mesh.position.copy(n.pos);
        n.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dirN);
      }
    }
  }

  _eyeRay(spreadDeg) {
    const cam = this.game.camera;
    _origin.copy(cam.position);
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (spreadDeg > 0) {
      const s = THREE.MathUtils.degToRad(spreadDeg);
      _dir.x += (Math.random() - 0.5) * s;
      _dir.y += (Math.random() - 0.5) * s;
      _dir.z += (Math.random() - 0.5) * s * 0.5;
      _dir.normalize();
    }
    return { origin: _origin, dir: _dir };
  }

  _hitscan(spreadDeg, dmg) {
    const g = this.game;
    const { origin, dir } = this._eyeRay(spreadDeg);
    const wallD = rayHitBoxes(origin, dir, 4096, g.level.colliders);
    _ray.origin.copy(origin); _ray.direction.copy(dir);
    let bestD = wallD, victim = null;
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const hp = _ray.intersectBox(e.hitBox(), _hitP);
      if (hp) {
        const d = origin.distanceTo(hp);
        if (d < bestD) { bestD = d; victim = e; }
      }
    }
    // shootable secret panel
    for (const s of g.level.shootables) {
      const hp = _ray.intersectBox(s.collider, _hitP);
      if (hp) {
        const d = origin.distanceTo(hp);
        if (d < bestD) { bestD = d; victim = null; s.onShot(); }
      }
    }
    const hitPoint = origin.clone().addScaledVector(dir, Math.min(bestD, 4000));
    if (victim) {
      victim.damage(dmg, g, hitPoint);
      g.effects.blood(hitPoint);
    } else if (bestD < 4000) {
      g.effects.puff(hitPoint);
      if (Math.random() < 0.5) g.effects.sparks(hitPoint);
    }
  }

  _muzzleWorld() {
    const v = new THREE.Vector3(0, 2, -26);
    return this.group.localToWorld(v);
  }

  _fireShotgun() {
    const g = this.game, p = g.player;
    if (p.shells <= 0) { g.sfx.noAmmo(); this.cooldown = 0.4; return; }
    p.shells--;
    this.cooldown = 0.5;
    this.recoil = 1;
    g.sfx.shotgun();
    this.flashSprite.scale.setScalar(14);
    g.effects.muzzle(this._muzzleWorld());
    g.alertEnemies(p.pos, 700);
    for (let i = 0; i < 6; i++) this._hitscan(4, 4);
    p.pitch += 0.012; // small kick
  }

  _fireNail() {
    const g = this.game, p = g.player;
    if (p.nails <= 0) { g.sfx.noAmmo(); this.cooldown = 0.3; return; }
    p.nails--;
    this.cooldown = 0.11;
    this.recoil = 0.5;
    g.sfx.nail();
    this.nailSide *= -1;
    this.flashSprite.scale.setScalar(9);
    this.flashSprite.position.x = this.nailSide * 4;
    g.effects.muzzle(this._muzzleWorld());
    g.alertEnemies(p.pos, 550);
    // spawn nail from gun barrel, in camera direction
    const start = new THREE.Vector3(this.nailSide * 4, 2, -26);
    this.group.localToWorld(start);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 10),
      new THREE.MeshBasicMaterial({ color: 0xd8d8e8 }));
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    g.scene.add(mesh);
    this.nails.push({ pos: start.clone(), vel: dir.multiplyScalar(1000), mesh, life: 1.6 });
  }
}
