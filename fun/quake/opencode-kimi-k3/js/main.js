// QUAKE: BROWSER EDITION — main game orchestrator.
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { SoundFX } from './audio.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { Enemies } from './enemies.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';

const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false; // manual clears: world pass + viewmodel pass
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140f0c, 0.0016);
    this.camera = new THREE.PerspectiveCamera(90, innerWidth / innerHeight, 1, 12000);

    // lighting: murky brown ambient + cool moonlight for the open arena
    this.scene.add(new THREE.AmbientLight(0x9a8874, 0.62));
    const hemi = new THREE.HemisphereLight(0x6a5a70, 0x2a2018, 0.35);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x8a7ab0, 0.4);
    moon.position.set(400, 1500, -900);
    this.scene.add(moon);

    // viewmodel scene rendered on top (no wall clipping)
    this.viewScene = new THREE.Scene();
    this.viewScene.add(new THREE.AmbientLight(0xbbbbbb, 0.9));
    const vl = new THREE.DirectionalLight(0xffe0b0, 0.8);
    vl.position.set(1, 2, 0.5);
    this.viewScene.add(vl);
    this.viewScene.add(this.camera);

    this.textures = makeTextures();
    this.sfx = new SoundFX();
    this.hud = new HUD();
    this.player = new Player();
    this.level = new Level(this.scene, this.textures, this.sfx);
    this.level.onSecret = () => {
      this.message('A secret is revealed!');
      this.sfx.secret();
    };
    this.effects = new Effects(this.scene, this.textures);
    this.enemies = new Enemies(this);
    this.weapons = new Weapons(this);

    const st = this.level.playerStart;
    this.player.reset(st);

    this.state = 'menu'; // menu | playing | paused | dead | complete
    this.time = 0;
    this.input = { f: 0, b: 0, l: 0, r: 0, jump: 0, fire: 0 };
    this.clock = new THREE.Clock();
    this._deathT = 0;

    this._bindInput();
    this._bindScreens();
    window.__game = this;
    if (TEST) {
      this.start(true);
      const w = params.get('warp');
      if (w) {
        const [x, z] = w.split(',').map(Number);
        this.player.pos.set(x, 0, z);
      }
      if (params.get('yaw')) this.player.yaw = Number(params.get('yaw'));
      if (params.get('pitch')) this.player.pitch = Number(params.get('pitch'));
    }
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _resize() {
    const scale = 3.2; // chunky pixels
    const w = Math.max(320, Math.round(innerWidth / scale));
    const h = Math.max(200, Math.round(innerHeight / scale));
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    }
  }

  _bindInput() {
    const keymap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'jump' };
    addEventListener('keydown', e => {
      if (e.code in keymap) { this.input[keymap[e.code]] = 1; e.preventDefault(); }
      if (e.code === 'Digit1') this.weapons.trySwitch('shotgun');
      if (e.code === 'Digit2') this.weapons.trySwitch('nailgun');
      if (e.code === 'KeyM') {
        const m = this.sfx.toggleMute();
        this.message(m ? 'Sound muted' : 'Sound on');
      }
    });
    addEventListener('keyup', e => {
      if (e.code in keymap) this.input[keymap[e.code]] = 0;
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.canvas && (this.state === 'playing' || this.state === 'dead')) {
        this.player.look(e.movementX, e.movementY);
      }
    });
    addEventListener('mousedown', e => {
      if (e.button === 0 && document.pointerLockElement === this.canvas && this.state === 'playing') {
        this.input.fire = 1;
      }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.input.fire = 0; });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.state === 'playing') {
        this.state = 'paused';
        this.input.fire = 0;
        this._show('pause');
      }
    });
  }

  _bindScreens() {
    const click = id => document.getElementById(id).addEventListener('click', () => {
      if (id === 'menu') this.start();
      else if (id === 'pause') this._resume();
      else if (id === 'death') { this.restart(); }
      else if (id === 'complete') { this.restart(); }
    });
    for (const id of ['menu', 'pause', 'death', 'complete']) click(id);
  }

  _show(name) {
    for (const id of ['menu', 'pause', 'death', 'complete']) {
      document.getElementById(id).classList.toggle('visible', id === name);
    }
    document.getElementById('hud').classList.toggle('visible', name === null);
    document.getElementById('crosshair').classList.toggle('visible', name === null);
  }

  _lockPointer() {
    const el = this.canvas;
    const req = el.requestPointerLock || el.webkitRequestPointerLock;
    if (!req) return;
    try {
      const p = req.call(el);
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable — keyboard still works */ }
  }

  start(skipLock = false) {
    this.sfx.init();
    this.state = 'playing';
    this.time = 0;
    this._show(null);
    if (!skipLock) this._lockPointer();
    this.message('Find the exit portal', 'The Slipgate Complex');
  }

  _resume() {
    this.state = 'playing';
    this._show(null);
    this._lockPointer();
  }

  restart() {
    // rebuild level & enemies from scratch
    this.scene.remove(this.level.group);
    this.level = new Level(this.scene, this.textures, this.sfx);
    this.level.onSecret = () => {
      this.message('A secret is revealed!');
      this.sfx.secret();
    };
    this.effects.reset();
    this.enemies.reset();
    this.weapons.reset();
    this.player.reset(this.level.playerStart);
    this.time = 0;
    this._deathT = 0;
    this.state = 'playing';
    this._show(null);
    if (!TEST) this._lockPointer();
  }

  message(text, sub = '') {
    this.hud.message(text, sub);
  }

  alertEnemies(pos, radius) {
    for (const e of this.enemies.list) {
      if (e.alive && !e.alerted && e.pos.distanceTo(pos) < radius) e._alert();
    }
  }

  applyPickup(kind) {
    const p = this.player;
    const hadWeapon = kind === 'shotgun' ? p.weapons.shotgun : kind === 'nailgun' ? p.weapons.nailgun : true;
    if (!p.give(kind)) return false;
    switch (kind) {
      case 'shotgun':
        if (!hadWeapon) { this.message('You got the Shotgun!'); this.weapons.trySwitch('shotgun'); }
        else this.message('You got 10 shells');
        this.sfx.pickupWeapon(); break;
      case 'nailgun':
        if (!hadWeapon) { this.message('You got the Nailgun!'); this.weapons.trySwitch('nailgun'); }
        else this.message('You got 25 nails');
        this.sfx.pickupWeapon(); break;
      case 'shells': this.message('You got 10 shells'); this.sfx.pickupAmmo(); break;
      case 'nails': this.message('You got 25 nails'); this.sfx.pickupAmmo(); break;
      case 'health15': this.message('You get 15 health'); this.sfx.pickupHealth(); break;
      case 'health25': this.message('You get 25 health'); this.sfx.pickupHealth(); break;
      case 'megahealth': this.message('You get 100 health!'); this.sfx.pickupHealth(); break;
      case 'armor': this.message('You got armor!'); this.sfx.pickupArmor(); break;
      case 'key': this.message('You got the gold key!'); this.sfx.pickupKey(); break;
    }
    return true;
  }

  onEnemyKilled(e) {
    this.enemies.killed++;
    if (this.enemies.killed === this.enemies.total) {
      this.message('All hostiles eliminated');
    }
  }

  playerDied() {
    this.state = 'dead';
    this._deathT = 0;
  }

  levelComplete() {
    if (this.state !== 'playing') return;
    this.state = 'complete';
    this.sfx.portal();
    this.sfx.sting();
    document.exitPointerLock?.();
    const mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
    document.getElementById('stat-time').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    document.getElementById('stat-kills').textContent = `${this.enemies.killed} / ${this.enemies.total}`;
    document.getElementById('stat-secrets').textContent = `${this.level.secretsFound} / ${this.level.secretsTotal}`;
    this._show('complete');
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === 'playing') {
      this.time += dt;
      this.player.update(dt, this.input, this.level.colliders, this.level, this);
      this.level.update(dt, this);
      this.enemies.update(dt);
      this.weapons.update(dt, this.input);
    } else if (this.state === 'dead') {
      this._deathT += dt;
      this.player.update(dt, this.input, this.level.colliders, this.level, this);
      this.enemies.update(dt);
      if (this._deathT > 1.4 && !document.getElementById('death').classList.contains('visible')) {
        document.exitPointerLock?.();
        this._show('death');
      }
    } else if (this.state === 'menu') {
      // idle camera drift over the arena for the menu backdrop
      const t = performance.now() * 0.0001;
      this.camera.position.set(192 + Math.sin(t) * 200, 180, -1500 + Math.cos(t) * 180);
      this.camera.lookAt(192, 40, -1500);
    }
    // effects always tick so gibs/particles finish
    this.effects.update(dt);
    this.hud.tick(dt, this.player);

    if (this.state !== 'menu') this.player.applyCamera(this.camera);
    this.camera.updateMatrixWorld(true);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'menu') {
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.camera);
    }
  }
}

new Game();
