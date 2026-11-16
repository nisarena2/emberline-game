// weapons.js — four guns plus the FRAG-7 grenade. Hitscan shots against
// body and head spheres, headshots deal four times damage, and spread plus
// recoil punish firing on the move. Shots never hit the shooter's own team.
import * as THREE from 'three';
import { WEAPONS, GRENADE, addEvent } from './state.js';
import { rayHitWorld } from './map.js';
import { eyePos, lookDir, killPlayer } from './player.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

function raySphere(origin, dir, center, radius) {
  _toTarget.subVectors(center, origin);
  const tca = _toTarget.dot(dir);
  if (tca < 0) return Infinity;
  const d2 = _toTarget.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

// One hitscan pellet. Returns {hit, target, head, point, dist} or null.
function traceShot(state, shooter, dir, maxDist) {
  eyePos(shooter, _origin);
  let bestT = rayHitWorld(_origin, dir, maxDist);
  let bestTarget = null;
  let bestHead = false;
  for (const p of state.players) {
    if (!p.alive || p === shooter || p.team === shooter.team) continue; // no friendly fire
    _hitPoint.set(p.pos.x, 1.0, p.pos.z);
    const tBody = raySphere(_origin, dir, _hitPoint, 0.5);
    _hitPoint.set(p.pos.x, 1.62, p.pos.z);
    const tHead = raySphere(_origin, dir, _hitPoint, 0.3);
    if (tHead < bestT) { bestT = tHead; bestTarget = p; bestHead = true; }
    else if (tBody < bestT) { bestT = tBody; bestTarget = p; bestHead = false; }
  }
  if (bestT === Infinity || bestT > maxDist) return null;
  _hitPoint.copy(_origin).addScaledVector(dir, bestT);
  return { target: bestTarget, head: bestHead, point: _hitPoint.clone(), dist: bestT };
}

export function applyDamage(state, target, amount, attacker) {
  if (!target.alive) return;
  if (!(amount > 0)) return; // damage is never negative: it can never heal
  target.hp -= amount;
  if (target.hp <= 0) {
    target.hp = 0;
    killPlayer(state, target, attacker);
    addEvent(state, `${attacker ? attacker.name : 'World'} ▸ ${target.name}`);
  }
}

export function tryFire(state, shooter, now, fx, audio) {
  const w = WEAPONS[shooter.weaponId];
  if (!shooter.alive || shooter.reloading) return false;
  if (now - shooter.lastShot < w.rate) return false;
  if (shooter.ammo <= 0) {
    if (audio) audio.click();
    shooter.lastShot = now;
    return false;
  }
  shooter.lastShot = now;
  shooter.ammo -= 1;
  state.stats.shots += 1;
  // Spread grows while moving or airborne; standing still and aiming pays.
  const movePenalty = shooter.moving ? w.moveSpread : 0;
  const spread = w.spread + movePenalty + shooter.recoil * 0.6;
  const pellets = w.pellets || 1;
  let hitAny = false;
  for (let i = 0; i < pellets; i++) {
    lookDir(shooter, _dir);
    _dir.x += (Math.random() - 0.5) * 2 * spread;
    _dir.y += (Math.random() - 0.5) * 2 * spread;
    _dir.z += (Math.random() - 0.5) * 2 * spread;
    _dir.normalize();
    const res = traceShot(state, shooter, _dir, w.range);
    eyePos(shooter, _origin);
    const end = res ? res.point : _origin.clone().addScaledVector(_dir, w.range);
    if (fx) fx.tracer(_origin, end);
    if (res && res.target) {
      const dmg = w.damage * (res.head ? w.headMul : 1);
      applyDamage(state, res.target, dmg, shooter);
      state.stats.hits += 1;
      hitAny = true;
      if (fx) fx.impact(res.point, res.head);
      if (audio) audio.hit();
    }
  }
  shooter.recoil = Math.min(0.09, shooter.recoil + w.recoil);
  shooter.pitch += w.recoil * 0.55; // kick the view up a little
  if (fx) fx.muzzle(shooter);
  if (audio) audio.shot(shooter.weaponId);
  return hitAny;
}

export function buyWeapon(state, p, id) {
  if (state.phase !== 'buy') return { ok: false, why: 'not buy phase' };
  if (id === 'grenade') {
    if (p.grenades >= 2) return { ok: false, why: 'max grenades' };
    if (p.money < GRENADE.price) return { ok: false, why: 'insufficient funds' };
    p.money -= GRENADE.price;
    p.grenades += 1;
    return { ok: true };
  }
  const w = WEAPONS[id];
  if (!w) return { ok: false, why: 'unknown weapon' };
  if (p.weaponId === id) return { ok: false, why: 'already owned' };
  if (p.money < w.price) return { ok: false, why: 'insufficient funds' };
  p.money -= w.price;
  p.weaponId = id;
  p.ammo = w.mag;
  p.reserve = w.reserve;
  p.reloading = false;
  return { ok: true };
}

// ---- Grenades ---------------------------------------------------------------
export function throwGrenade(state, p, now) {
  if (p.grenades <= 0 || !p.alive) return null;
  p.grenades -= 1;
  lookDir(p, _dir);
  eyePos(p, _origin);
  const g = {
    pos: _origin.clone(),
    vel: _dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: GRENADE.fuse,
    owner: p,
    exploded: false,
  };
  state.grenades.push(g);
  return g;
}

export function updateGrenades(state, dt, fx, audio) {
  for (const g of state.grenades) {
    if (g.exploded) continue;
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.25) {
      g.pos.y = 0.25;
      g.vel.multiplyScalar(0.45);
      g.vel.y = Math.abs(g.vel.y) * 0.35;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      g.exploded = true;
      explodeGrenade(state, g, fx, audio);
    }
  }
  state.grenades = state.grenades.filter((g) => !g.exploded);
}

function explodeGrenade(state, g, fx, audio) {
  if (fx) fx.explosion(g.pos);
  if (audio) audio.explosion();
  for (const p of state.players) {
    if (!p.alive) continue;
    if (g.owner && p.team === g.owner.team) continue; // no friendly fire
    const d = p.pos.distanceTo(g.pos);
    if (d > GRENADE.radius) continue;
    const falloff = 1 - (d / GRENADE.radius) * 0.55;
    applyDamage(state, p, Math.round(GRENADE.damage * falloff), g.owner);
  }
}
