// Headless gameplay-logic integration test (run: node test/logic.mjs)
// Exercises level, player, enemies, weapons and win/lose conditions without
// a browser. Textures/sfx/hud are stubbed; three.js math/scene run for real.
import * as THREE from 'three';
import { Level } from '../js/level.js';
import { Player } from '../js/player.js';
import { Enemies } from '../js/enemies.js';
import { Effects } from '../js/effects.js';
import { Weapons } from '../js/weapons.js';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}

const texStub = () => ({ offset: { x: 0, y: 0 }, repeat: { set() {} }, center: { set() {} }, rotation: 0 });
const textures = new Proxy({}, { get: () => texStub() });
const sfx = new Proxy({}, { get: () => () => {} });
const messages = [];
let completed = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, 16 / 9, 1, 12000);

const game = {
  scene, camera, textures, sfx,
  hud: { damageFlash() {}, setMood() {}, message() {}, tick() {} },
  message: (t) => messages.push(t),
  applyPickup(kind) { return this.player.give(kind); },
  onEnemyKilled() { this.enemies.killed++; },
  playerDied() { this.died = true; },
  levelComplete() { completed = true; },
  alertEnemies() {},
  died: false,
};

game.level = new Level(scene, textures, sfx);
game.player = new Player();
game.player.reset(game.level.playerStart);
game.effects = new Effects(scene, textures);
game.enemies = new Enemies(game);
game.weapons = new Weapons(game);

const DT = 1 / 60;
function sim(frames, input = {}) {
  const inp = Object.assign({ f: 0, b: 0, l: 0, r: 0, jump: 0, fire: 0 }, input);
  for (let i = 0; i < frames; i++) {
    game.player.update(DT, inp, game.level.colliders, game.level, game);
    game.level.update(DT, game);
    game.enemies.update(DT);
    game.weapons.update(DT, inp);
  }
}
function aimAt(x, y, z) {
  camera.position.copy(game.player.eyePos());
  camera.lookAt(x, y, z);
}

console.log('T1: level structure');
ok(game.level.doors.length === 6, '6 doors');
ok(game.level.spawns.length === 10, '10 enemy spawns');
ok(game.level.pickups.length >= 20, `${game.level.pickups.length} pickups (>=20)`);
ok(game.level.colliders.length > 60, `${game.level.colliders.length} colliders (>60)`);
ok(game.enemies.total === 10, '10 enemies live');

console.log('T2: door opens on approach');
game.player.pos.set(192, 0, 60);
sim(5);
ok(game.level.doors[0].state === 'opening' || game.level.doors[0].state === 'open', 'door 1 opening');
sim(80);
ok(game.level.doors[0].state === 'open', 'door 1 fully open');

console.log('T3: player walks through corridor');
game.player.pos.set(192, 0, 200);
game.player.vel.set(0, 0, 0);
sim(60, { f: 1 }); // walk north toward/through open door
ok(game.player.pos.z < 120, `advanced north (z=${game.player.pos.z.toFixed(0)})`);
ok(Math.abs(game.player.pos.y) < 1, 'stays on floor');

console.log('T4: collision keeps player inside walls');
game.player.pos.set(50, 0, 50);
sim(60, { l: 1 }); // push west into wall
ok(game.player.pos.x > 0, `wall stops player (x=${game.player.pos.x.toFixed(1)})`);

console.log('T5: grunt attacks player');
const grunt = game.enemies.list.find(e => e.type === 'grunt');
game.player.pos.set(grunt.pos.x, 0, grunt.pos.z + 120);
game.player.vel.set(0, 0, 0);
grunt._alert();
const hpBefore = game.player.health;
sim(240);
ok(game.player.health < hpBefore, `grunt shot player (${hpBefore} -> ${game.player.health})`);

console.log('T6: shotgun kills a grunt');
game.player.health = 100;
game.player.pos.set(grunt.pos.x, 0, grunt.pos.z + 100);
game.player.vel.set(0, 0, 0);
const gruntHp = grunt.hp;
for (let i = 0; i < 6 && grunt.alive; i++) {
  aimAt(grunt.pos.x, grunt.pos.y + 30, grunt.pos.z);
  game.weapons.cooldown = 0;
  game.weapons._fireShotgun();
}
ok(grunt.hp < gruntHp, `grunt damaged (${gruntHp} -> ${grunt.hp})`);
ok(!grunt.alive, 'grunt died');
ok(game.enemies.killed === 1, 'kill counted');

console.log('T7: nailgun kills an ogre');
const ogre = game.enemies.list.find(e => e.type === 'ogre' && e.alive);
game.player.weapon = 'nailgun';
game.player.weapons.nailgun = true;
game.player.nails = 200;
game.player.pos.set(ogre.pos.x, 0, ogre.pos.z + 220);
game.player.vel.set(0, 0, 0);
aimAt(ogre.pos.x, ogre.pos.y + 40, ogre.pos.z);
for (let i = 0; i < 600 && ogre.alive; i++) {
  aimAt(ogre.pos.x, ogre.pos.y + 40, ogre.pos.z);
  game.weapons.update(DT, { fire: 1 });
  game.enemies.update(DT);
}
ok(!ogre.alive, `nailgun killed ogre (nails left: ${game.player.nails})`);

console.log('T8: ogre grenade hurts player');
game.player.health = 100;
game.player.pos.set(320, 0, -1400);
game.player.vel.set(0, 0, 0);
game.enemies.spawnGrenade(new THREE.Vector3(320, 40, -1420), new THREE.Vector3(0, 50, 60));
sim(240);
ok(game.player.health < 100, `grenade damaged player (health=${game.player.health})`);

console.log('T9: slime hurts');
game.player.health = 100;
game.player.dead = false; game.died = false; // revive from T8
game.player.pos.set(200, -40, -1088);
game.player.vel.set(0, 0, 0);
sim(150);
ok(game.player.health < 100, `slime damaged player (health=${game.player.health})`);
ok(game.player.pos.y < -20, 'player is down in the pit');

console.log('T10: gold key door');
game.player.health = 100;
game.player.dead = false; game.died = false;
game.player.pos.set(320, 0, -1690);
game.player.vel.set(0, 0, 0);
game.player.hasGoldKey = false;
const goldDoor = game.level.doors[5];
sim(30);
ok(goldDoor.state === 'closed', 'locked without key');
ok(messages.some(m => m.includes('gold key')), 'locked message shown');
game.player.give('key');
sim(90);
ok(goldDoor.state === 'open' || goldDoor.state === 'opening', 'opens with key');

console.log('T11: secret panel');
ok(game.level.shootables.length === 1, 'one shootable');
game.level.shootables[0].onShot();
ok(game.level.secretPanel.opening, 'secret opening');
ok(game.level.secretsFound === 1, 'secret counted');

console.log('T12: pickups apply');
game.player.dead = false; game.died = false;
game.player.health = 50;
ok(game.player.give('health25') === true && game.player.health === 75, 'health25 heals');
game.player.health = 100;
ok(game.player.give('health25') === false, 'health refused at 100');
ok(game.player.give('megahealth') === true && game.player.health === 200, 'megahealth overheals');
ok(game.player.give('armor') === true && game.player.armor === 100, 'armor pickup');
const armorBefore = game.player.armor;
game.player.damage(20, game);
ok(game.player.armor < armorBefore && game.player.health < 200, 'armor absorbs damage');

console.log('T13: exit portal completes level');
for (const d of game.level.doors) { d.state = 'open'; d.openT = 1; }
game.player.pos.set(320, 0, -1962);
game.player.vel.set(0, 0, 0);
sim(3);
ok(completed, 'level complete triggered');

console.log('T14: player death');
completed = false;
game.player.health = 5;
game.player.armor = 0;
game.player.damage(50, game);
ok(game.player.dead && game.died, 'death flows through');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
