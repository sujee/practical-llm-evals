// Quake-style HUD: bottom status bar (armor / face / health / ammo),
// crosshair, center messages, red damage flash, pixel-art ranger face.
export class HUD {
  constructor() {
    this.elArmor = document.getElementById('hud-armor');
    this.elHealth = document.getElementById('hud-health');
    this.elAmmo = document.getElementById('hud-ammo');
    this.elWeapon = document.getElementById('hud-weapon');
    this.elMsg = document.getElementById('message');
    this.elMsgSub = document.getElementById('message-sub');
    this.elFlash = document.getElementById('damage-flash');
    this.elKeys = document.getElementById('hud-key');
    this.faceCanvas = document.getElementById('hud-face');
    this.fctx = this.faceCanvas.getContext('2d');
    this.msgT = 0;
    this.flashV = 0;
    this.mood = 'normal';
    this.moodT = 0;
    this._last = {};
    this.drawFace('normal', 100);
  }

  message(text, sub = '') {
    this.elMsg.textContent = text;
    this.elMsgSub.textContent = sub;
    this.elMsg.classList.add('visible');
    this.msgT = 2.4;
  }

  damageFlash() {
    this.flashV = Math.min(0.55, this.flashV + 0.35);
  }

  setMood(m) { this.mood = m; this.moodT = 0.9; }

  tick(dt, player) {
    // message fade
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.elMsg.classList.remove('visible');
    }
    // damage flash decay
    if (this.flashV > 0) {
      this.flashV = Math.max(0, this.flashV - dt * 1.6);
      this.elFlash.style.opacity = this.flashV.toFixed(3);
    }
    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.mood = 'normal';
    }
    // numbers (only touch DOM on change)
    const ammo = player.currentAmmo();
    const L = this._last;
    if (L.health !== player.health) {
      this.elHealth.textContent = player.health;
      this.elHealth.classList.toggle('low', player.health <= 25);
      L.health = player.health;
    }
    if (L.armor !== player.armor) {
      this.elArmor.textContent = player.armor;
      this.elArmor.parentElement.style.opacity = player.armor > 0 ? 1 : 0.35;
      L.armor = player.armor;
    }
    if (L.ammo !== ammo) {
      this.elAmmo.textContent = ammo;
      this.elAmmo.classList.toggle('low', ammo <= 5);
      L.ammo = ammo;
    }
    if (L.weapon !== player.weapon) {
      this.elWeapon.textContent = player.weapon === 'shotgun' ? 'SHOTGUN' : 'NAILGUN';
      L.weapon = player.weapon;
    }
    if (L.key !== player.hasGoldKey) {
      this.elKeys.style.visibility = player.hasGoldKey ? 'visible' : 'hidden';
      L.key = player.hasGoldKey;
    }
    const moodEff = player.dead ? 'dead' : (this.mood === 'pain' ? 'pain' : (player.health <= 25 ? 'hurt' : 'normal'));
    if (L.mood !== moodEff || L.faceHp !== (player.health <= 25)) {
      this.drawFace(moodEff, player.health);
      L.mood = moodEff;
      L.faceHp = player.health <= 25;
    }
  }

  drawFace(mood, hp) {
    const x = this.fctx;
    x.clearRect(0, 0, 40, 40);
    const skin = mood === 'dead' ? '#8a7a68' : (hp <= 25 ? '#c09878' : '#c8a080');
    const skinDark = mood === 'dead' ? '#6a5c4c' : '#a07858';
    // head
    x.fillStyle = skin;
    x.fillRect(8, 6, 24, 28);
    x.fillStyle = skinDark;
    x.fillRect(8, 30, 24, 4); // jaw shadow
    // hair
    x.fillStyle = '#4a3820';
    x.fillRect(8, 6, 24, 6);
    x.fillRect(8, 6, 4, 14); x.fillRect(28, 6, 4, 14);
    if (mood === 'dead') {
      // X eyes
      x.fillStyle = '#1a1210';
      for (const ex of [13, 23]) {
        x.fillRect(ex, 15, 2, 2); x.fillRect(ex + 2, 17, 2, 2); x.fillRect(ex, 19, 2, 2);
        x.fillRect(ex + 4, 15, 2, 2); x.fillRect(ex + 4, 19, 2, 2);
      }
      x.fillStyle = '#5a1010';
      x.fillRect(15, 27, 10, 3); // open mouth
      return;
    }
    // eyes
    x.fillStyle = '#1a1210';
    if (mood === 'pain') {
      x.fillRect(12, 16, 6, 2); x.fillRect(22, 16, 6, 2); // squeezed
    } else {
      x.fillRect(13, 15, 4, 4); x.fillRect(23, 15, 4, 4);
      x.fillStyle = '#fff';
      x.fillRect(13, 15, 1, 1); x.fillRect(23, 15, 1, 1);
    }
    // nose
    x.fillStyle = skinDark;
    x.fillRect(19, 20, 3, 4);
    // mouth
    x.fillStyle = mood === 'pain' ? '#5a1010' : '#3a2818';
    if (mood === 'pain') x.fillRect(14, 27, 12, 4);
    else x.fillRect(16, 28, 8, 2);
    // blood when hurt
    if (hp <= 25 || mood === 'pain') {
      x.fillStyle = '#8a1210';
      x.fillRect(28, 10, 3, 8);
      x.fillRect(29, 18, 2, 6);
    }
  }
}
