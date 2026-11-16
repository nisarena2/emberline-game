// state.js — one place for all game state. Nothing here touches the
// renderer; every other module reads and writes this object only.
import * as THREE from 'three';

export const STEP = 1 / 60;
export const WIN_ROUNDS = 8;
export const ROUND_TIME = 100;
export const BUY_TIME = 20;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_FUSE = 35;
export const GRENADE_DAMAGE = 120;

export const WEAPONS = {
  sidearm: { id: 'sidearm', name: 'P9 Sidearm', price: 0, damage: 26, headMul: 4, rate: 0.22, auto: false, mag: 12, reserve: 36, spread: 0.012, moveSpread: 0.05, recoil: 0.011, range: 60, reload: 1.1 },
  smg: { id: 'smg', name: 'RUST-9 SMG', price: 700, damage: 22, headMul: 4, rate: 0.085, auto: true, mag: 28, reserve: 84, spread: 0.02, moveSpread: 0.07, recoil: 0.008, range: 45, reload: 1.5 },
  rifle: { id: 'rifle', name: 'VK-9 Rifle', price: 1400, damage: 33, headMul: 4, rate: 0.11, auto: true, mag: 25, reserve: 75, spread: 0.008, moveSpread: 0.055, recoil: 0.014, range: 70, reload: 1.8 },
  heavy: { id: 'heavy', name: 'FURNACE-12', price: 900, damage: 15, headMul: 4, rate: 0.9, auto: false, mag: 6, reserve: 18, spread: 0.05, moveSpread: 0.09, recoil: 0.05, range: 22, reload: 2.2, pellets: 7 },
};

export const GRENADE = { id: 'grenade', name: 'FRAG-7 Grenade', price: 300, damage: GRENADE_DAMAGE, radius: 6.5, fuse: 1.4 };

export function createState() {
  return {
    phase: 'menu', // menu | buy | play | roundEnd | over
    time: 0,
    round: 1,
    roundTime: 0,
    phaseTime: 0,
    score: { ember: 0, warden: 0 },
    players: [],
    nextId: 1,
    bomb: { state: 'carried', carrierId: 0, plantProgress: 0, defuseProgress: 0, fuse: 0, pos: new THREE.Vector3(0, 0.4, 0), planterId: 0, defuserId: 0 },
    events: [], // kill feed: {text, t}
    banner: '',
    bannerUntil: 0,
    winner: null,
    roundWinner: null,
    roundReason: '',
    grenades: [],
    tracers: [],
    localId: 0,
    stats: { shots: 0, hits: 0, kills: 0 },
  };
}

export function alivePlayers(state, team) {
  return state.players.filter((p) => p.alive && (!team || p.team === team));
}

export function otherTeam(team) {
  return team === 'ember' ? 'warden' : 'ember';
}

export function addEvent(state, text) {
  state.events.push({ text, t: state.time });
  if (state.events.length > 6) state.events.shift();
}

export function teamAlive(state, team) {
  return state.players.some((p) => p.alive && p.team === team);
}
