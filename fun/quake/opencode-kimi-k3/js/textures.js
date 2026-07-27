// Procedural Quake-style pixel textures — all generated on canvas, no assets.
import * as THREE from 'three';

// Deterministic RNG so the level looks the same every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, rng, n, colors, size = 64, maxR = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    const s = 1 + ((rng() * maxR) | 0);
    ctx.fillRect((rng() * size) | 0, (rng() * size) | 0, s, s);
  }
}

function brickWall(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#3a2f24'; x.fillRect(0, 0, 64, 64); // mortar
  const browns = ['#5f4c38', '#6b5741', '#54432f', '#63513c', '#4e3e2d'];
  for (let row = 0; row < 4; row++) {
    const y = row * 16;
    const off = (row % 2) * 16;
    for (let col = -1; col < 3; col++) {
      const bx = col * 32 + off;
      x.fillStyle = browns[(rng() * browns.length) | 0];
      x.fillRect(bx + 1, y + 1, 30, 14);
      // top highlight / bottom shade
      x.fillStyle = 'rgba(255,230,190,0.10)';
      x.fillRect(bx + 1, y + 1, 30, 2);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(bx + 1, y + 12, 30, 3);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,180,0.07)';
        x.fillRect(bx + 1 + ((rng() * 28) | 0), y + 1 + ((rng() * 12) | 0), 2, 2);
      }
    }
  }
  speckle(x, rng, 40, ['rgba(0,0,0,0.22)', 'rgba(120,100,70,0.20)']);
  return toTex(c);
}

function metalWall(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#4b4a50'; x.fillRect(0, 0, 64, 64);
  const grays = ['#56555c', '#605f66', '#4e4d54', '#595860'];
  // 2x2 riveted panels
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const bx = px * 32, by = py * 32;
    x.fillStyle = grays[(rng() * grays.length) | 0];
    x.fillRect(bx + 1, by + 1, 30, 30);
    x.fillStyle = 'rgba(255,255,255,0.09)';
    x.fillRect(bx + 1, by + 1, 30, 2); x.fillRect(bx + 1, by + 1, 2, 30);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(bx + 1, by + 28, 30, 3); x.fillRect(bx + 28, by + 1, 3, 30);
    x.fillStyle = '#2e2d33';
    for (const [rx, ry] of [[4, 4], [27, 4], [4, 27], [27, 27]]) x.fillRect(bx + rx - 1, by + ry - 1, 3, 3);
    x.fillStyle = 'rgba(255,255,255,0.15)';
    x.fillRect(bx + 3, by + 3, 1, 1); x.fillRect(bx + 26, by + 3, 1, 1);
  }
  speckle(x, rng, 50, ['rgba(0,0,0,0.25)', 'rgba(140,140,150,0.15)', 'rgba(90,70,50,0.25)']);
  return toTex(c);
}

function stoneFloor(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#2f2b26'; x.fillRect(0, 0, 64, 64);
  const tones = ['#4c453c', '#544c41', '#463f37', '#5a5145', '#403a32'];
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const bx = tx * 32, by = ty * 32;
    x.fillStyle = tones[(rng() * tones.length) | 0];
    x.fillRect(bx + 1, by + 1, 30, 30);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(200,180,150,0.06)';
      x.fillRect(bx + 1 + ((rng() * 28) | 0), by + 1 + ((rng() * 28) | 0), 2, 2);
    }
  }
  speckle(x, rng, 30, ['rgba(0,0,0,0.3)']);
  return toTex(c);
}

function metalFloor(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#3d3c42'; x.fillRect(0, 0, 64, 64);
  // tread plates
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const bx = px * 32, by = py * 32;
    x.fillStyle = ['#494850', '#51504f'][(rng() * 2) | 0];
    x.fillRect(bx + 1, by + 1, 30, 30);
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.fillRect(bx + 1, by + 29, 30, 2); x.fillRect(bx + 29, by + 1, 2, 30);
    x.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 4; i++) x.fillRect(bx + 5 + i * 7, by + 6, 4, 20);
  }
  speckle(x, rng, 60, ['rgba(0,0,0,0.3)', 'rgba(150,150,160,0.10)']);
  return toTex(c);
}

function woodBox(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#5d4226'; x.fillRect(0, 0, 64, 64);
  const tones = ['#6b4d2c', '#77552f', '#634628', '#704f2e'];
  for (let p = 0; p < 4; p++) {
    x.fillStyle = tones[(rng() * tones.length) | 0];
    x.fillRect(0, p * 16 + 1, 64, 14);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, p * 16 + 13, 64, 2);
    for (let i = 0; i < 10; i++) {
      x.fillStyle = 'rgba(40,25,10,0.35)';
      x.fillRect((rng() * 62) | 0, p * 16 + 2 + ((rng() * 10) | 0), 3 + ((rng() * 8) | 0), 1);
    }
  }
  // frame
  x.fillStyle = '#3c2a16';
  x.fillRect(0, 0, 64, 3); x.fillRect(0, 61, 64, 3); x.fillRect(0, 0, 3, 64); x.fillRect(61, 0, 3, 64);
  return toTex(c);
}

function doorMetal(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#585861'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#4b4b53'; x.fillRect(4, 4, 56, 56);
  x.fillStyle = '#63636d'; x.fillRect(8, 8, 48, 20);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(8, 26, 48, 3);
  // hazard stripes
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#b99a2e' : '#1c1c1e';
    x.save(); x.beginPath(); x.rect(0, 44, 64, 16); x.clip();
    x.translate(i * 16 - 8, 44); x.rotate(Math.PI / 4);
    x.fillRect(0, -8, 8, 32); x.restore();
  }
  x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, 60, 64, 4);
  x.fillStyle = '#8a2a1e'; x.fillRect(28, 34, 8, 6); // lock light
  speckle(x, rng, 40, ['rgba(0,0,0,0.3)', 'rgba(160,160,170,0.12)']);
  return toTex(c);
}

function skyTex(seed) {
  const rng = mulberry32(seed);
  const c = canvas(128), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#241c2e'); g.addColorStop(0.55, '#3b2a38'); g.addColorStop(1, '#55352e');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // turbulent purple-brown cloud blobs
  for (let i = 0; i < 90; i++) {
    const cx = rng() * 128, cy = rng() * 128, r = 6 + rng() * 22;
    const grad = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rng() < 0.55;
    grad.addColorStop(0, dark ? 'rgba(20,12,26,0.35)' : 'rgba(122,84,88,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const t = toTex(c);
  return t;
}

function slimeTex(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#2e4a1e'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 120; i++) {
    const g = ['#3f6126', '#527a2e', '#263d18', '#68913a'][(rng() * 4) | 0];
    x.fillStyle = g;
    const s = 2 + ((rng() * 6) | 0);
    x.fillRect((rng() * 62) | 0, (rng() * 62) | 0, s, s);
  }
  for (let i = 0; i < 14; i++) { // bubbles
    x.fillStyle = 'rgba(180,220,120,0.35)';
    const r = 1 + ((rng() * 3) | 0);
    x.beginPath(); x.arc(rng() * 64, rng() * 64, r, 0, 7); x.fill();
  }
  return toTex(c);
}

function portalTex(seed) {
  const rng = mulberry32(seed);
  const c = canvas(64), x = c.getContext('2d');
  x.fillStyle = '#0c0a14'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r0 = rng() * 6, r1 = 12 + rng() * 30;
    x.strokeStyle = ['#6a4fd0', '#9a7ff0', '#3d2a80', '#c0b0ff'][(rng() * 4) | 0];
    x.lineWidth = 1 + rng() * 2;
    x.beginPath();
    x.arc(32, 32, r1, a, a + 1.1 + rng() * 1.5);
    x.stroke();
    x.beginPath(); x.arc(32, 32, r0 + 3, a, a + 2); x.stroke();
  }
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 14);
  grad.addColorStop(0, 'rgba(200,190,255,0.9)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
  return toTex(c);
}

function flameTex() {
  const c = canvas(32), x = c.getContext('2d');
  const g = x.createRadialGradient(16, 20, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.35, 'rgba(255,170,60,0.9)');
  g.addColorStop(0.7, 'rgba(200,70,20,0.45)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return toTex(c, false);
}

function glowTex() {
  const c = canvas(32), x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,230,170,1)');
  g.addColorStop(0.4, 'rgba(255,180,90,0.55)');
  g.addColorStop(1, 'rgba(255,140,50,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return toTex(c, false);
}

export function makeTextures() {
  return {
    brick: brickWall(101),
    brick2: brickWall(207),
    metal: metalWall(303),
    floor: stoneFloor(401),
    metalFloor: metalFloor(505),
    wood: woodBox(607),
    door: doorMetal(709),
    sky: skyTex(811),
    slime: slimeTex(913),
    portal: portalTex(1017),
    flame: flameTex(),
    glow: glowTex(),
  };
}
