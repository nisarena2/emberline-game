// bots.js — bot brains: waypoint routes, hold positions, vision, hearing,
// burst fire, bomb planting and defusing. Bots think in the fixed step.
import * as THREE from 'three';
import { MAP, hasLineOfSight, findPath } from './map.js';
import { tryFire, throwGrenade } from './weapons.js';
import { eyePos, lookDir } from './player.js';

const LANES = [-14, 0, 14];
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

export function makeBrain(lane, role) {
  return {
    lane, // -14 | 0 | 14
    role, // 'carrier' | 'entry' | 'holder' | 'roamer'
    mode: 'route',
    path: [],
    pathI: 0,
    holdUntil: 0,
    targetId: 0,
    reactUntil: 0,
    burstLeft: 0,
    burstPauseUntil: 0,
    heardAt: null,
    heardUntil: 0,
    repathAt: 0,
    holdPos: null,
  };
}

function visibleEnemy(state, bot, maxDist = 30) {
  eyePos(bot, _eye);
  let best = null, bestD = maxDist;
  for (const p of state.players) {
    if (!p.alive || p.team === bot.team) continue;
    const d = bot.pos.distanceTo(p.pos);
    if (d > bestD) continue;
    // Vision cone: bots see what is roughly in front of them.
    _to.subVectors(p.pos, bot.pos).normalize();
    lookDir(bot, _dir);
    const facing = _to.x * _dir.x + _to.z * _dir.z;
    if (facing < 0.35 && d > 6) continue;
    if (!hasLineOfSight(bot.pos, p.pos)) continue;
    best = p;
    bestD = d;
  }
  return best;
}

function moveAlongPath(state, bot, dt, speedMul = 1) {
  const brain = bot.brain;
  if (!brain.path.length || brain.pathI >= brain.path.length) return { f: false, l: false, r: false, b: false };
  const wp = brain.path[brain.pathI];
  const dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.7) {
    brain.pathI += 1;
    brain.stuckT = 0;
    brain.lastDist = Infinity;
    return { f: false, l: false, r: false, b: false };
  }
  // Unstick: if we stop getting closer to the waypoint, skip it.
  if (brain.lastDist !== undefined && dist > brain.lastDist - 0.02) {
    brain.stuckT = (brain.stuckT || 0) + dt;
    if (brain.stuckT > 1.2) {
      brain.pathI += 1;
      brain.stuckT = 0;
      brain.lastDist = Infinity;
      return { f: false, l: false, r: false, b: false };
    }
  } else {
    brain.stuckT = 0;
  }
  brain.lastDist = dist;
  // Face the waypoint and walk toward it.
  const wantYaw = Math.atan2(-dx, -dz);
  let dy = wantYaw - bot.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dy));
  const fwd = Math.abs(dy) < 0.9;
  return { f: fwd, b: false, l: dy > 0.6, r: dy < -0.6, walk: false, crouch: false };
}

function repath(state, bot, tx, tz, graph) {
  bot.brain.path = findPath(graph, bot.pos.x, bot.pos.z, tx, tz);
  bot.brain.pathI = 0;
}

export function updateBot(state, bot, dt, graph, fx, audio) {
  if (!bot.alive) return { f: false, b: false, l: false, r: false };
  const brain = bot.brain;
  const now = state.time;

  // Hearing: a recent shot nearby pulls the bot toward the noise.
  // (Set by main.js when a shot fires; bots check it here.)
  if (brain.heardAt && now < brain.heardUntil && !brain.targetId) {
    if (now >= brain.repathAt) {
      repath(state, bot, brain.heardAt.x, brain.heardAt.z, graph);
      brain.repathAt = now + 2.5;
    }
  }

  const bomb = state.bomb;
  const enemy = visibleEnemy(state, bot);
  if (enemy) brain.lastSeenAt = now;

  // --- Objective modes -------------------------------------------------------
  if (bomb.state === 'planted' && bot.team === 'warden') {
    // Go defuse: nearest Warden runs to the site and channels the defuse.
    const dSite = Math.hypot(bot.pos.x - MAP.site.x, bot.pos.z - MAP.site.z);
    if (dSite > 1.6) {
      if (now >= brain.repathAt) { repath(state, bot, MAP.site.x, MAP.site.z, graph); brain.repathAt = now + 1.5; }
      return moveAlongPath(state, bot, dt);
    }
    bot.defusing = true;
    bot.yaw = Math.atan2(-(MAP.site.x - bot.pos.x), -(MAP.site.z - bot.pos.z));
    return { f: false, b: false, l: false, r: false };
  }
  if (bot.hasBomb && bot.team === 'ember' && bomb.state === 'carried') {
    const dSite = Math.hypot(bot.pos.x - MAP.site.x, bot.pos.z - MAP.site.z);
    if (dSite > 2.5) {
      if (now >= brain.repathAt) { repath(state, bot, MAP.site.x, MAP.site.z, graph); brain.repathAt = now + 1.5; }
      return moveAlongPath(state, bot, dt);
    }
    // At the site: plant, unless an enemy is right on top of us.
    if (!enemy || bot.pos.distanceTo(enemy.pos) > 9) {
      bot.planting = true;
      bot.yaw = -Math.PI / 2;
    }
    return { f: false, b: false, l: false, r: false };
  }

  // --- Combat ----------------------------------------------------------------
  if (enemy) {
    if (!brain.targetId || brain.targetId !== enemy.id) {
      brain.targetId = enemy.id;
      brain.reactUntil = now + 0.35 + Math.random() * 0.3; // reaction time
      brain.burstLeft = 0;
    }
    // Aim at the enemy's chest, with error that grows with distance.
    const d = bot.pos.distanceTo(enemy.pos);
    _to.subVectors(enemy.pos, bot.pos);
    const wantYaw = Math.atan2(-_to.x, -_to.z);
    let dy = wantYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += Math.max(-4 * dt, Math.min(4 * dt, dy));
    const aimErr = Math.min(0.09, 0.02 + d * 0.002);
    // Chest sits below the bot's eye line, so the pitch tilts slightly down.
    bot.pitch = Math.atan2(-0.57, Math.max(1, d)) + (Math.random() - 0.5) * aimErr;
    if (now >= brain.reactUntil && Math.abs(dy) < 0.25) {
      if (brain.burstLeft <= 0) {
        if (now >= brain.burstPauseUntil) {
          brain.burstLeft = 3 + Math.floor(Math.random() * 3);
          brain.burstPauseUntil = now + 0.9 + Math.random() * 0.7;
        }
      } else {
        tryFire(state, bot, now, fx, audio);
        brain.burstLeft -= 1;
      }
    }
    // Strafe a little while fighting, and hold ground rather than charging.
    const strafe = Math.sin(now * 1.3 + bot.id * 2.1) > 0;
    return { f: false, b: false, l: strafe, r: !strafe, walk: true, crouch: d > 18 };
  }
  brain.targetId = 0;
  bot.planting = false;
  bot.defusing = false;

  // --- Patrol / hold ---------------------------------------------------------
  if (bot.team === 'warden') {
    if (!brain.holdPos) {
      // Holders post up near the site or mid; roamers patrol a lane.
      brain.holdPos = brain.role === 'holder'
        ? { x: 16 + Math.random() * 8, z: (Math.random() - 0.5) * 16 }
        : { x: -6 + Math.random() * 10, z: brain.lane };
    }
    const dHold = Math.hypot(bot.pos.x - brain.holdPos.x, bot.pos.z - brain.holdPos.z);
    if (dHold > 1.2) {
      if (now >= brain.repathAt) { repath(state, bot, brain.holdPos.x, brain.holdPos.z, graph); brain.repathAt = now + 2; }
      return moveAlongPath(state, bot, dt);
    }
    // On post: slowly scan the lanes.
    bot.yaw += Math.sin(now * 0.5 + bot.id) * 0.4 * dt;
    return { f: false, b: false, l: false, r: false };
  }
  // Ember: push down the assigned lane toward the site. If nothing has been
  // seen for a while, hunt a random living enemy instead of wandering.
  if (!brain.path.length || brain.pathI >= brain.path.length) {
    if (now >= brain.repathAt) {
      const foes = state.players.filter((p) => p.alive && p.team !== bot.team);
      const hunt = foes.length && now - (brain.lastSeenAt || 0) > 8
        ? foes[Math.floor(Math.random() * foes.length)] : null;
      const tx = hunt ? hunt.pos.x : MAP.site.x - 2 + Math.random() * 3;
      const tz = hunt ? hunt.pos.z : (Math.random() - 0.5) * 8;
      repath(state, bot, tx, tz, graph);
      brain.repathAt = now + 3;
    }
  }
  return moveAlongPath(state, bot, dt);
}

// Let every living bot hear a shot at (x,z).
export function hearShot(state, x, z) {
  for (const p of state.players) {
    if (!p.alive || !p.isBot) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < 26) {
      p.brain.heardAt = { x, z };
      p.brain.heardUntil = state.time + 1.6;
    }
  }
}
