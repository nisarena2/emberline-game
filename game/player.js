// player.js — the human and bot bodies: acceleration movement, crouch,
// pointer-lock mouse look, the viewmodel gun, and bomb planting.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { collideCircle, MAP } from './map.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.12;
export const PLAYER_RADIUS = 0.42;

let nextId = 1;

export function createPlayer(state, team, isBot, name) {
  const p = {
    id: nextId++,
    name,
    team,
    isBot,
    pos: new THREE.Vector3(team === 'ember' ? MAP.emberSpawn.x : MAP.wardenSpawn.x, 0, MAP.emberSpawn.z),
    yaw: team === 'ember' ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    vel: new THREE.Vector3(),
    hp: 100,
    alive: true,
    crouched: false,
    moving: false,
    speed: 0,
    money: 1000,
    weaponId: 'sidearm',
    ammo: WEAPONS.sidearm.mag,
    reserve: WEAPONS.sidearm.reserve,
    grenades: 0,
    kills: 0,
    deaths: 0,
    lastShot: -10,
    reloadUntil: 0,
    reloading: false,
    recoil: 0,
    hasBomb: false,
    planting: false,
    defusing: false,
    spawnPos: new THREE.Vector3(),
    brain: null, // bots only
    mesh: null,
    viewmodel: null,
  };
  p.spawnPos.copy(p.pos);
  state.players.push(p);
  return p;
}

export function resetForRound(p, state, index, team) {
  const laneZ = [-14, 0, 14][index % 3];
  const off = (index % 2 === 0 ? 1 : -1) * (Math.floor(index / 2) * 2);
  if (team === 'ember') {
    p.pos.set(MAP.emberSpawn.x + 1.5, 0, laneZ + off * 0.4);
    p.yaw = -Math.PI / 2;
  } else {
    p.pos.set(MAP.wardenSpawn.x - 3, 0, laneZ + off * 0.4);
    p.yaw = Math.PI / 2;
  }
  p.vel.set(0, 0, 0);
  p.hp = 100;
  p.alive = true;
  p.crouched = false;
  p.reloading = false;
  p.reloadUntil = 0;
  p.planting = false;
  p.defusing = false;
  p.hasBomb = false;
  p.recoil = 0;
  p.spawnPos.copy(p.pos);
}

// Build the third-person body mesh (bots) and the first-person viewmodel.
export function buildPlayerMeshes(scene, p, isLocal) {
  const color = p.team === 'ember' ? 0xc46a12 : 0x1f7a7a;
  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 0.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  body.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b48f, roughness: 0.7 })
  );
  head.position.y = 1.72;
  head.castShadow = true;
  body.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 })
  );
  visor.position.set(0, 1.74, 0.24);
  body.add(visor);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 })
  );
  legs.position.y = 0.3;
  body.add(legs);
  body.position.copy(p.pos);
  body.visible = !isLocal;
  scene.add(body);
  p.mesh = body;

  // Viewmodel: a chunky gun held low-right, bright materials plus its own
  // small light at the camera so it never goes dark.
  const vm = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.35, metalness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xd88a1e, roughness: 0.4, metalness: 0.5, emissive: 0x442200, emissiveIntensity: 0.4 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55), gunMat);
  barrel.position.set(0, 0, -0.3);
  vm.add(barrel);
  const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.34), gunMat);
  bodyBox.position.set(0, 0.02, 0.02);
  vm.add(bodyBox);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), accentMat);
  grip.position.set(0, -0.1, 0.1);
  grip.rotation.x = 0.3;
  vm.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), accentMat);
  sight.position.set(0, 0.13, -0.05);
  vm.add(sight);
  vm.position.set(0.32, -0.28, -0.55);
  vm.visible = isLocal;
  p.viewmodel = vm;
  return vm;
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// input: {f, b, l, r, crouch, walk} in -1..1 / booleans. Fixed-step update.
export function updatePlayer(p, dt, input) {
  if (!p.alive) return;
  const w = WEAPONS[p.weaponId];
  p.crouched = !!input.crouch;
  const maxSpeed = p.crouched ? 2.2 : input.walk ? 3.0 : 5.4;
  _forward.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  _wish.set(0, 0, 0)
    .addScaledVector(_forward, (input.f ? 1 : 0) - (input.b ? 1 : 0))
    .addScaledVector(_right, (input.r ? 1 : 0) - (input.l ? 1 : 0));
  if (_wish.lengthSq() > 0) _wish.normalize();
  const accel = _wish.lengthSq() > 0 ? 42 : 30;
  p.vel.x += _wish.x * accel * dt;
  p.vel.z += _wish.z * accel * dt;
  // Friction when no input, so stopping is quick but not instant.
  const damp = Math.exp(-8 * dt);
  if (_wish.lengthSq() === 0) {
    p.vel.x *= damp;
    p.vel.z *= damp;
  }
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (sp > maxSpeed) {
    p.vel.x *= maxSpeed / sp;
    p.vel.z *= maxSpeed / sp;
  }
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  collideCircle(p.pos, PLAYER_RADIUS);
  p.moving = sp > 0.8;
  p.speed = sp;
  // Recoil settles back toward zero.
  p.recoil *= Math.exp(-6 * dt);
  if (p.recoil < 0.0005) p.recoil = 0;
  // Reload completes.
  if (p.reloading && p.stateTime >= p.reloadUntil) {
    const need = w.mag - p.ammo;
    const take = Math.min(need, p.reserve);
    p.ammo += take;
    p.reserve -= take;
    p.reloading = false;
  }
}

export function eyePos(p, out) {
  out.set(p.pos.x, p.crouched ? EYE_CROUCH : EYE_STAND, p.pos.z);
  return out;
}

export function lookDir(p, out) {
  const cp = Math.cos(p.pitch + p.recoil);
  out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch + p.recoil), -Math.cos(p.yaw) * cp);
  return out;
}

export function startReload(p, now) {
  const w = WEAPONS[p.weaponId];
  if (p.reloading || p.ammo >= w.mag || p.reserve <= 0) return false;
  p.reloading = true;
  p.reloadUntil = now + w.reload;
  return true;
}

export function killPlayer(state, p, killer) {
  if (!p.alive) return;
  p.alive = false;
  p.deaths += 1;
  p.planting = false;
  p.defusing = false;
  if (killer && killer !== p) {
    killer.kills += 1;
    killer.money += 300;
  }
  if (p.hasBomb) {
    // Bomb plant progress resets when the carrier dies; the bomb drops.
    p.hasBomb = false;
    state.bomb.state = 'dropped';
    state.bomb.carrierId = 0;
    state.bomb.plantProgress = 0;
    state.bomb.pos.copy(p.pos);
    state.bomb.pos.y = 0.4;
  }
  if (p.mesh) p.mesh.visible = false;
}
