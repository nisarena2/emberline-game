// rounds.js — buy phase, economy, round wins, and the match. First to
// eight rounds takes the match. Rounds end by elimination, by the bomb
// exploding, by a defuse, or by the clock running out.
import { WEAPONS, WIN_ROUNDS, ROUND_TIME, BUY_TIME, PLANT_TIME, DEFUSE_TIME, BOMB_FUSE, addEvent, teamAlive, otherTeam } from './state.js';
import { MAP } from './map.js';
import { resetForRound } from './player.js';

export function startMatch(state) {
  state.score.ember = 0;
  state.score.warden = 0;
  state.round = 1;
  state.winner = null;
  state.roundWinner = null;
  startBuyPhase(state);
}

export function startBuyPhase(state) {
  state.phase = 'buy';
  state.phaseTime = 0;
  state.roundTime = BUY_TIME;
  state.bomb.state = 'carried';
  state.bomb.plantProgress = 0;
  state.bomb.defuseProgress = 0;
  state.bomb.fuse = 0;
  state.bomb.planterId = 0;
  state.bomb.defuserId = 0;
  state.grenades = [];
  let ei = 0, wi = 0;
  for (const p of state.players) {
    if (p.team === 'ember') resetForRound(p, state, ei++, 'ember');
    else resetForRound(p, state, wi++, 'warden');
  }
  // The first living Ember bot carries the bomb; the human gets it if alive.
  const human = state.players.find((p) => !p.isBot && p.team === 'ember');
  const carrier = human && human.alive ? human : state.players.find((p) => p.isBot && p.team === 'ember' && p.alive);
  if (carrier) {
    carrier.hasBomb = true;
    state.bomb.carrierId = carrier.id;
  }
  state.banner = `Round ${state.round} — buy phase`;
  state.bannerUntil = state.time + 3;
}

export function startPlayPhase(state) {
  state.phase = 'play';
  state.phaseTime = 0;
  state.roundTime = ROUND_TIME;
  state.banner = `Round ${state.round} — go!`;
  state.bannerUntil = state.time + 2;
}

export function endRound(state, winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'over') return;
  state.phase = 'roundEnd';
  state.phaseTime = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  for (const p of state.players) {
    if (!p.alive) continue;
    p.money += p.team === winner ? 1400 : 900;
  }
  const names = { ember: 'Ember', warden: 'Wardens' };
  state.banner = `${names[winner]} take round ${state.round} — ${reason}`;
  state.bannerUntil = state.time + 4;
  addEvent(state, `${names[winner]} win the round (${reason})`);
  if (state.score[winner] >= WIN_ROUNDS) {
    state.phase = 'over';
    state.winner = winner;
    state.banner = `${names[winner]} win the match ${state.score.ember}–${state.score.warden}`;
    state.bannerUntil = state.time + 10;
    return;
  }
  state.round += 1;
}

export function plantBomb(state, planter, dt, audio) {
  const bomb = state.bomb;
  if (bomb.state !== 'carried' || planter.id !== bomb.carrierId) return;
  const dSite = Math.hypot(planter.pos.x - MAP.site.x, planter.pos.z - MAP.site.z);
  if (dSite > 3.5 || !planter.alive) {
    bomb.plantProgress = 0;
    planter.planting = false;
    return;
  }
  bomb.plantProgress += dt;
  bomb.planterId = planter.id;
  if (audio) audio.beep(bomb.plantProgress / PLANT_TIME);
  if (bomb.plantProgress >= PLANT_TIME) {
    bomb.state = 'planted';
    bomb.fuse = BOMB_FUSE;
    bomb.pos.set(MAP.site.x, 0.4, MAP.site.z);
    planter.hasBomb = false;
    planter.planting = false;
    bomb.carrierId = 0;
    state.roundTime = BOMB_FUSE + 5;
    state.banner = 'Bomb planted at the Furnace!';
    state.bannerUntil = state.time + 3;
    addEvent(state, `${planter.name} planted the bomb`);
    if (audio) audio.planted();
  }
}

export function defuseBomb(state, defuser, dt, audio) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted' || !defuser.alive) return;
  const dSite = Math.hypot(defuser.pos.x - MAP.site.x, defuser.pos.z - MAP.site.z);
  if (dSite > 2.5) {
    bomb.defuseProgress = 0;
    defuser.defusing = false;
    return;
  }
  bomb.defuseProgress += dt;
  bomb.defuserId = defuser.id;
  if (audio) audio.beep(bomb.defuseProgress / DEFUSE_TIME);
  if (bomb.defuseProgress >= DEFUSE_TIME) {
    bomb.state = 'defused';
    defuser.defusing = false;
    defuser.money += 300;
    endRound(state, 'warden', 'bomb defused');
    if (audio) audio.win();
  }
}

// Called every fixed step while a round is live.
export function updateRounds(state, dt, audio) {
  if (state.phase === 'buy') {
    state.phaseTime += dt;
    state.roundTime = Math.max(0, BUY_TIME - state.phaseTime);
    if (state.phaseTime >= BUY_TIME) startPlayPhase(state);
    return;
  }
  if (state.phase !== 'play') {
    if (state.phase === 'roundEnd') {
      state.phaseTime += dt;
      if (state.phaseTime >= 4) startBuyPhase(state);
    }
    return;
  }
  state.phaseTime += dt;
  state.roundTime = Math.max(0, ROUND_TIME - state.phaseTime);

  // Bomb fuse counts down once planted.
  if (state.bomb.state === 'planted') {
    state.bomb.fuse -= dt;
    if (state.bomb.fuse <= 0) {
      state.bomb.state = 'exploded';
      endRound(state, 'ember', 'the Furnace blew');
      if (audio) audio.explosion();
      return;
    }
  }

  // Elimination check.
  const emberAlive = teamAlive(state, 'ember');
  const wardenAlive = teamAlive(state, 'warden');
  if (!emberAlive && !wardenAlive) {
    endRound(state, 'warden', 'both teams down');
    return;
  }
  if (!emberAlive) {
    if (state.bomb.state === 'planted') {
      // Wardens still have to survive the fuse or defuse; let the fuse run.
    } else {
      endRound(state, 'warden', 'Ember eliminated');
      return;
    }
  }
  if (!wardenAlive) {
    endRound(state, 'ember', 'Wardens eliminated');
    return;
  }

  // Clock: if time runs out with no plant, the defenders hold.
  if (state.roundTime <= 0 && state.bomb.state !== 'planted') {
    endRound(state, 'warden', 'time expired');
  }
}
