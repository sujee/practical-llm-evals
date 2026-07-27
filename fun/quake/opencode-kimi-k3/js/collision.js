// AABB collision helpers. Entities are boxes defined by feet-center position,
// horizontal half-extent and height.
import * as THREE from 'three';

const EPS = 0.01;
const TOUCH = 0.001; // contact below this margin does not count as overlap
const _tmp = new THREE.Vector3();

export function entityBox(pos, half, height, out) {
  out.min.set(pos.x - half, pos.y, pos.z - half);
  out.max.set(pos.x + half, pos.y + height, pos.z + half);
  return out;
}

const _box = new THREE.Box3();

// Strict overlap: unlike Box3.intersectsBox, merely touching faces (gap <
// TOUCH) does not count — prevents false clamps when sliding flush along
// a floor or wall.
function overlaps(a, b) {
  return a.min.x < b.max.x - TOUCH && a.max.x > b.min.x + TOUCH &&
         a.min.y < b.max.y - TOUCH && a.max.y > b.min.y + TOUCH &&
         a.min.z < b.max.z - TOUCH && a.max.z > b.min.z + TOUCH;
}

// Move `pos` by `delta`, sliding along colliders. Returns collision flags.
export function moveBox(pos, half, height, delta, colliders) {
  const res = { grounded: false, head: false, wall: false };
  // X axis
  pos.x += delta.x;
  entityBox(pos, half, height, _box);
  for (const c of colliders) {
    if (c.disabled || !overlaps(_box, c)) continue;
    if (delta.x > 0) pos.x = c.min.x - half - EPS;
    else if (delta.x < 0) pos.x = c.max.x + half + EPS;
    if (delta.x !== 0) res.wall = true;
    entityBox(pos, half, height, _box);
  }
  // Z axis
  pos.z += delta.z;
  entityBox(pos, half, height, _box);
  for (const c of colliders) {
    if (c.disabled || !overlaps(_box, c)) continue;
    if (delta.z > 0) pos.z = c.min.z - half - EPS;
    else if (delta.z < 0) pos.z = c.max.z + half + EPS;
    if (delta.z !== 0) res.wall = true;
    entityBox(pos, half, height, _box);
  }
  // Y axis
  pos.y += delta.y;
  entityBox(pos, half, height, _box);
  for (const c of colliders) {
    if (c.disabled || !overlaps(_box, c)) continue;
    if (delta.y > 0) { pos.y = c.min.y - height - EPS; res.head = true; }
    else if (delta.y < 0) { pos.y = c.max.y + EPS; res.grounded = true; }
    else {
      // spawned inside something: push up
      pos.y = c.max.y + EPS; res.grounded = true;
    }
    entityBox(pos, half, height, _box);
  }
  return res;
}

const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

// Nearest hit distance of a ray against collider boxes, or Infinity.
export function rayHitBoxes(origin, dir, maxDist, colliders) {
  _ray.origin.copy(origin);
  _ray.direction.copy(dir);
  let best = Infinity;
  for (const c of colliders) {
    if (c.disabled) continue;
    const p = _ray.intersectBox(c, _hit);
    if (p) {
      const d = origin.distanceTo(p);
      if (d < best && d <= maxDist) best = d;
    }
  }
  return best;
}

// Does segment a->b stay clear of all colliders? Returns nearest hit distance.
export function segmentClear(a, b, colliders) {
  _tmp.subVectors(b, a);
  const len = _tmp.length();
  if (len < 1e-6) return Infinity;
  _tmp.divideScalar(len);
  return rayHitBoxes(a, _tmp, len, colliders);
}
