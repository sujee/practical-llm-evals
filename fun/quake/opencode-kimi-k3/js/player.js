// Player: Quake-style movement (fast, ground accel, slight air control),
// AABB collision, health/armor/ammo inventory.
import * as THREE from 'three';
import { moveBox } from './collision.js';

const SPEED = 300;
const GRAVITY = 800;
const JUMP_VEL = 275;
const EYE = 46;

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.half = 16; this.height = 56;
    this.grounded = false;
    this.bobT = 0;
    this.dead = false;
    this.slimeTimer = 0;
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  reset(start) {
    this.pos.set(start.x, start.y, start.z);
    this.vel.set(0, 0, 0);
    this.yaw = start.yaw; this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.shells = 25;
    this.nails = 0;
    this.weapons = { shotgun: true, nailgun: false };
    this.weapon = 'shotgun';
    this.hasGoldKey = false;
    this.dead = false;
    this.bobT = 0;
    this.slimeTimer = 0;
    this.deadT = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  // returns events {landed}
  update(dt, input, colliders, level, game) {
    if (this.dead) {
      this.deadT += dt;
      // corpse fall: sink camera toward floor
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this.vel.y -= GRAVITY * dt;
      moveBox(this.pos, this.half, this.height, this.vel.clone().multiplyScalar(dt), colliders);
      if (this.pos.y < 0) this.pos.y = 0;
      return {};
    }

    // wish direction in world space
    let wx = 0, wz = 0;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    if (input.f) { wx -= s; wz -= c; }
    if (input.b) { wx += s; wz += c; }
    if (input.l) { wx -= c; wz += s; }
    if (input.r) { wx += c; wz -= s; }
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    const accel = this.grounded ? 12 : 1.6;
    this.vel.x += (wx * SPEED - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz * SPEED - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= GRAVITY * dt;

    if (input.jump && this.grounded) {
      this.vel.y = JUMP_VEL;
      this.grounded = false;
      game.sfx.jump();
    }

    const wasAirborne = !this.grounded;
    const fallVel = this.vel.y;
    const delta = this.vel.clone().multiplyScalar(dt);
    const res = moveBox(this.pos, this.half, this.height, delta, colliders);
    let landed = false;
    if (res.grounded) {
      if (wasAirborne && fallVel < -380) { landed = true; game.sfx.land(); }
      this.grounded = true;
      this.vel.y = 0;
    } else if (!res.grounded && delta.y !== 0) {
      this.grounded = false;
    }
    if (res.head) this.vel.y = Math.min(this.vel.y, 0);

    // head bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hSpeed > 30) this.bobT += dt * (hSpeed / 38);
    this.bobAmt = this.grounded ? Math.min(1, hSpeed / SPEED) : 0;

    // slime damage
    let inSlime = false;
    for (const r of level.slimeRegions) {
      if (this.pos.x > r.min.x && this.pos.x < r.max.x &&
          this.pos.z > r.min.z && this.pos.z < r.max.z &&
          this.pos.y < r.max.y) { inSlime = true; break; }
    }
    if (inSlime) {
      this.slimeTimer -= dt;
      if (this.slimeTimer <= 0) {
        this.slimeTimer = 0.55;
        game.sfx.slimeHurt();
        this.damage(8, game);
      }
    } else this.slimeTimer = 0;

    return { landed };
  }

  applyCamera(camera) {
    const bobY = Math.sin(this.bobT * 2) * 1.6 * this.bobAmt;
    const bobX = Math.cos(this.bobT) * 1.2 * this.bobAmt;
    if (this.dead) {
      const t = Math.min(1, this.deadT * 1.5);
      camera.position.set(this.pos.x, this.pos.y + EYE - t * 30, this.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(this.pitch, this.yaw, t * 0.6);
      return;
    }
    camera.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + EYE + bobY, this.pos.z - bobX * Math.sin(this.yaw));
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch, this.yaw, 0);
  }

  damage(amount, game) {
    if (this.dead) return;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.ceil(dmg * 0.4));
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    game.sfx.playerPain();
    game.hud.damageFlash();
    game.hud.setMood('pain');
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deadT = 0;
      game.sfx.playerDie();
      game.playerDied();
    }
  }

  // Returns true if the pickup should be consumed.
  give(kind) {
    switch (kind) {
      case 'shells':
        if (this.shells >= 100) return false;
        this.shells = Math.min(100, this.shells + 10); return true;
      case 'nails':
        if (this.nails >= 200) return false;
        this.nails = Math.min(200, this.nails + 25); return true;
      case 'health15':
        if (this.health >= 100) return false;
        this.health = Math.min(100, this.health + 15); return true;
      case 'health25':
        if (this.health >= 100) return false;
        this.health = Math.min(100, this.health + 25); return true;
      case 'megahealth':
        if (this.health >= 250) return false;
        this.health = Math.min(250, this.health + 100); return true;
      case 'armor':
        if (this.armor >= 150) return false;
        this.armor = Math.min(150, this.armor + 100); return true;
      case 'shotgun':
        if (this.weapons.shotgun) {
          if (this.shells >= 100) return false;
          this.shells = Math.min(100, this.shells + 10); return true;
        }
        this.weapons.shotgun = true;
        this.shells = Math.min(100, this.shells + 6);
        return true;
      case 'nailgun':
        if (this.weapons.nailgun) {
          if (this.nails >= 200) return false;
          this.nails = Math.min(200, this.nails + 25); return true;
        }
        this.weapons.nailgun = true;
        this.nails = Math.min(200, this.nails + 25);
        return true;
      case 'key':
        this.hasGoldKey = true; return true;
    }
    return false;
  }

  currentAmmo() {
    return this.weapon === 'shotgun' ? this.shells : this.nails;
  }
}
