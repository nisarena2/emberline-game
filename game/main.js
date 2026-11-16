// main.js — bootstrap and the fixed-step 60 Hz simulation, kept apart from
// rendering. Input, bots, rounds, grenades and the bomb all advance in the
// step; the render loop only draws the current state.
import * as THREE from 'three';
import { createState, STEP, WIN_ROUNDS, addEvent } from './state.js';
import { buildMap, buildWaypoints, MAP } from './map.js';
import { createPlayer, buildPlayerMeshes, updatePlayer, eyePos, startReload, killPlayer } from './player.js';
import { tryFire, buyWeapon, throwGrenade, updateGrenades } from './weapons.js';
import { updateBot, makeBrain, hearShot } from './bots.js';
import { startMatch, updateRounds, plantBomb, defuseBomb } from './rounds.js';
import { buildHud, updateHud, showBuy, hideBuy, showMenu, showOver } from './hud.js';
import { audio } from './audio.js';
import { createFx } from './fx.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const TEST_MODE = params.has('test') || !!SHOT;

const state = createState();
const graph = { points: [], edges: [] };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c222c);
scene.fog = new THREE.Fog(0x1c222c, 30, 95);

const camera = new THREE.PerspectiveCamera(75, 1280 / 720, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const sun = new THREE.DirectionalLight(0xffb060, 1.25);
sun.position.set(24, 34, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 100;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x2e6a72, 0x3a2a1a, 0.6));
const fill = new THREE.PointLight(0x1e8a8a, 12, 30, 1.8);
fill.position.set(0, 6, 0);
scene.add(fill);

// A small light rides with the camera so the viewmodel stays bright.
const camLight = new THREE.PointLight(0xffe2b0, 5, 4, 1.5);
camLight.position.set(0.2, -0.1, -0.2);
camera.add(camLight);

const { colliders } = buildMap(scene);
const wp = buildWaypoints();
graph.points = wp.points;
graph.edges = wp.edges;

const fx = createFx(scene);
buildHud();

// Bomb prop: a small blinking box, shown when the bomb is down or planted.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 })
);
bombMesh.add(bombBody);
const bombLight = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff2211 })
);
bombLight.position.set(0, 0.2, 0);
bombMesh.add(bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// ---- Players ---------------------------------------------------------------
const local = createPlayer(state, 'ember', false, 'You');
state.localId = local.id;
const emberNames = ['Ash', 'Cinder', 'Flint', 'Slag'];
const wardenNames = ['Bram', 'Kestrel', 'Onyx', 'Pike', 'Rook'];
const emberBots = emberNames.map((n, i) => {
  const b = createPlayer(state, 'ember', true, n);
  b.brain = makeBrain([-14, 0, 14][i % 3], i === 0 ? 'carrier' : 'entry');
  return b;
});
const wardenBots = wardenNames.map((n, i) => {
  const b = createPlayer(state, 'warden', true, n);
  b.brain = makeBrain([-14, 0, 14][i % 3], i < 2 ? 'holder' : 'roamer');
  return b;
});
for (const p of state.players) {
  const vm = buildPlayerMeshes(scene, p, p === local);
  if (p === local) camera.add(vm);
}

// ---- Input -----------------------------------------------------------------
const keys = {};
let firing = false;
let buyOpen = false;
let plantKey = false;
let apiPlant = false;
let apiDefuse = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') {
    if (startReload(local, state.time)) audio.reload();
  }
  if (e.code === 'KeyB' && state.phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) showBuy(state, local); else hideBuy();
  }
  if (buyOpen && state.phase === 'buy') {
    const buys = ['sidearm', 'smg', 'rifle', 'heavy', 'grenade'];
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
    if (idx >= 0) {
      const res = buyWeapon(state, local, buys[idx]);
      if (res.ok) { audio.buy(); showBuy(state, local); }
      else audio.click();
    }
  }
  if (e.code === 'KeyG') {
    const g = throwGrenade(state, local, state.time);
    if (g) audio.click();
  }
  if (e.code === 'KeyE') plantKey = true;
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyE') plantKey = false;
});
addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) firing = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  local.yaw -= e.movementX * 0.0021;
  local.pitch -= e.movementY * 0.0021;
  local.pitch = Math.max(-1.45, Math.min(1.45, local.pitch));
});
renderer.domElement.addEventListener('click', () => {
  if (state.phase === 'play' || state.phase === 'buy') {
    try { renderer.domElement.requestPointerLock(); } catch { /* headless: ignore */ }
  }
});
document.getElementById('play-btn').addEventListener('click', () => {
  audio.ensureAudio();
  showMenu(false);
  startMatch(state);
  try { renderer.domElement.requestPointerLock(); } catch { /* headless: ignore */ }
});
document.getElementById('again-btn').addEventListener('click', () => {
  showOver(false, '', '');
  startMatch(state);
});

// ---- Simulation ------------------------------------------------------------
const _eye = new THREE.Vector3();

function localInput() {
  return {
    f: !!keys['KeyW'] || !!keys['ArrowUp'],
    b: !!keys['KeyS'] || !!keys['ArrowDown'],
    l: !!keys['KeyA'] || !!keys['ArrowLeft'],
    r: !!keys['KeyD'] || !!keys['ArrowRight'],
    crouch: !!keys['ControlLeft'] || !!keys['KeyC'],
    walk: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
  };
}

function simStep(dt) {
  state.time += dt;
  for (const p of state.players) p.stateTime = state.time;

  if (state.phase === 'play') {
    // Human.
    if (local.alive) {
      updatePlayer(local, dt, localInput());
      if (firing && state.phase === 'play') {
        const ammoBefore = local.ammo;
        tryFire(state, local, state.time, fx, audio);
        if (local.ammo < ammoBefore) hearShot(state, local.pos.x, local.pos.z);
      }
      const wantUse = plantKey || apiPlant || apiDefuse;
      if (wantUse && state.phase === 'play') {
        if (local.hasBomb) local.planting = true;
        else if (state.bomb.state === 'planted') local.defusing = true;
      } else {
        local.planting = false;
        local.defusing = false;
      }
      if (local.planting) plantBomb(state, local, dt, audio);
      if (local.defusing) defuseBomb(state, local, dt, audio);
      if (state.bomb.state === 'planted') apiPlant = false;
      if (state.bomb.state === 'defused' || state.bomb.state === 'exploded') apiDefuse = false;
    }
    // Bots.
    for (const b of [...emberBots, ...wardenBots]) {
      if (!b.alive) continue;
      const input = updateBot(state, b, dt, graph, fx, audio);
      updatePlayer(b, dt, input);
      if (b.planting) plantBomb(state, b, dt, audio);
      if (b.defusing) defuseBomb(state, b, dt, audio);
    }
    updateGrenades(state, dt, fx, audio);
  }

  updateRounds(state, dt, audio);
  fx.update(dt);

  // Round-end and match-end overlays.
  if (state.phase === 'over') {
    const names = { ember: 'Ember', warden: 'Wardens' };
    showOver(true, `${names[state.winner]} win the match`, `${state.score.ember} – ${state.score.warden} · first to ${WIN_ROUNDS}`);
  }
  if (buyOpen && state.phase !== 'buy') {
    buyOpen = false;
    hideBuy();
  }
}

function render() {
  // Meshes follow state here (not in the step) so frozen shot tableaus,
  // menus and live play all draw the same positions.
  for (const p of state.players) {
    if (!p.mesh) continue;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw + Math.PI;
    p.mesh.visible = p.alive && p !== local;
  }
  if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
    bombMesh.visible = true;
    bombMesh.position.copy(state.bomb.pos);
    bombLight.material.color.setHex(Math.sin(state.time * 8) > 0 ? 0xff2211 : 0x551111);
  } else {
    bombMesh.visible = false;
  }
  eyePos(local, _eye);
  camera.position.copy(_eye);
  camera.rotation.y = local.yaw;
  camera.rotation.x = local.pitch + local.recoil;
  if (local.viewmodel) {
    local.viewmodel.position.y = -0.28 + Math.sin(state.time * 2) * 0.004 - (local.crouched ? 0.05 : 0);
    local.viewmodel.rotation.z = local.moving ? Math.sin(state.time * 9) * 0.012 : 0;
  }
  // In the combat shot scene, keep a tracer down Mid lane so the frame
  // always reads as a firefight (tracers otherwise fade in a tenth of a second).
  if (SHOT === 'combat') {
    fx.tracer(new THREE.Vector3(-15, 1.6, 0), new THREE.Vector3(-8, 1.2, 1));
  }
  updateHud(state, local);
  renderer.render(scene, camera);
}

let last = performance.now();
let acc = 0;
let frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Shot scenes are frozen tableaus: the scene is arranged by setupShot and
  // must not drift while headless Chrome takes its time rendering frames.
  if (!SHOT) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      simStep(STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
  }
  render();
  frames += 1;
  if (frames === 3 && SHOT) window.__shotReady = true;
  if (frames === 3 && TEST_MODE) window.__gameReady = true;
}

// ---- Shot scenes ------------------------------------------------------------
function setupShot(name) {
  startMatch(state);
  if (name === 'title') {
    state.phase = 'menu';
    state.banner = '';
    state.bannerUntil = 0;
    showMenu(true);
    local.pos.set(-24, 0, -6);
    local.yaw = -Math.PI / 2.6;
    return;
  }
  showMenu(false);
  if (name === 'buy') {
    local.pos.set(-28, 0, 0);
    local.yaw = -Math.PI / 2;
    local.money = 3200;
    showBuy(state, local);
    buyOpen = true;
    return;
  }
  // Play-phase scenes: jump straight into the round.
  state.phase = 'play';
  state.phaseTime = 0;
  state.roundTime = 96;
  state.banner = '';
  state.bannerUntil = 0;
  if (name === 'combat') {
    local.pos.set(-16, 0, 0);
    local.yaw = -Math.PI / 2;
    local.pitch = 0;
    const w1 = wardenBots[0], w2 = wardenBots[1];
    w1.pos.set(-8, 0, 1); w1.yaw = Math.PI / 2; w1.alive = true;
    w2.pos.set(-3, 0, -2.5); w2.yaw = Math.PI / 2; w2.alive = true;
    for (const b of wardenBots.slice(2)) { b.pos.set(20 + b.id, 0, 8); }
    for (const b of emberBots) { b.pos.set(-20 - b.id, 0, -6 + b.id); }
    return;
  }
  if (name === 'site') {
    local.pos.set(20, 0, 3);
    local.yaw = -Math.PI / 2.4;
    state.bomb.state = 'planted';
    state.bomb.fuse = 28;
    state.bomb.pos.set(MAP.site.x, 0.4, MAP.site.z);
    state.banner = 'Bomb planted at the Furnace!';
    state.bannerUntil = state.time + 30;
    const w = wardenBots[0];
    w.pos.set(MAP.site.x - 1, 0, MAP.site.z + 1);
    w.defusing = true;
    state.bomb.defuseProgress = 2.1;
    for (const b of wardenBots.slice(1)) { b.pos.set(18 + b.id, 0, -8 + b.id * 3); }
    for (const b of emberBots) { b.pos.set(12, 0, -10 + b.id * 4); }
    return;
  }
  if (name === 'win') {
    state.phase = 'roundEnd';
    state.score.ember = 1;
    state.roundWinner = 'ember';
    state.banner = 'Ember take round 1 — Wardens eliminated';
    state.bannerUntil = state.time + 30;
    local.pos.set(-10, 0, 0);
    local.yaw = -Math.PI / 2;
    for (const b of wardenBots) { b.alive = false; if (b.mesh) b.mesh.visible = false; }
    for (const b of emberBots) { b.pos.set(-14 - b.id, 0, -4 + b.id * 2); }
    return;
  }
}

// ---- Test API ---------------------------------------------------------------
window.__game = {
  state,
  get ready() { return frames > 0; },
  step(n) {
    for (let i = 0; i < n; i++) simStep(STEP);
    render();
  },
  start() { startMatch(state); },
  api: {
    killTeam(team) {
      for (const p of state.players) {
        if (p.team === team && p.alive) {
          p.hp = 0;
          killPlayer(state, p, null);
        }
      }
    },
    killBots(team) {
      for (const p of state.players) {
        if (p.isBot && p.team === team && p.alive) {
          p.hp = 0;
          killPlayer(state, p, null);
        }
      }
    },
    setPos(id, x, z, yaw) {
      const p = state.players.find((q) => q.id === id);
      if (!p) return false;
      p.pos.set(x, 0, z);
      if (yaw !== undefined) p.yaw = yaw;
      return true;
    },
    plant() {
      const carrier = state.players.find((p) => p.hasBomb && p.alive);
      if (!carrier) return false;
      carrier.pos.set(MAP.site.x - 1, 0, MAP.site.z);
      carrier.planting = true;
      apiPlant = true;
      return true;
    },
    defuse() {
      const d = state.players.find((p) => p.team === 'warden' && p.alive);
      if (!d || state.bomb.state !== 'planted') return false;
      d.pos.set(MAP.site.x - 1, 0, MAP.site.z);
      d.defusing = true;
      apiDefuse = true;
      return true;
    },
    stopUse() { apiPlant = false; apiDefuse = false; },
    buy(id) { return buyWeapon(state, local, id); },
    grenadeAt(x, z) {
      const g = throwGrenade(state, local, state.time);
      if (!g) return false;
      g.pos.set(x, 1.0, z);
      g.vel.set(0, 0, 0);
      g.fuse = 0.05;
      return true;
    },
  },
};

if (SHOT) {
  setupShot(SHOT);
} else if (TEST_MODE) {
  showMenu(false);
  startMatch(state);
}
requestAnimationFrame(loop);
window.__gameReady = false;
