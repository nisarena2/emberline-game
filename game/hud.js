// hud.js — health, ammo, round timer, score, money, kill feed, buy menu,
// banners and the start screen. Plain DOM, updated from state each frame.
import { WEAPONS, GRENADE } from './state.js';

const $ = (id) => document.getElementById(id);

export function buildHud() {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="crosshair"><span></span><span></span><span></span><span></span><i></i></div>
    <div id="topbar">
      <div id="score"><b id="score-ember">0</b><span>EMBER vs WARDENS</span><b id="score-warden">0</b></div>
      <div id="timer">0:00</div>
      <div id="round-label">Round 1</div>
    </div>
    <div id="health-wrap"><div id="health-bar"></div><span id="health-num">100</span></div>
    <div id="ammo"><span id="ammo-mag">12</span><span id="ammo-res">/ 36</span><div id="weapon-name">P9 Sidearm</div></div>
    <div id="money">$1000</div>
    <div id="grenades"></div>
    <div id="feed"></div>
    <div id="banner"></div>
    <div id="hint">WASD move · Mouse aim · Click fire · R reload · B buy · G grenade · E plant / defuse · Ctrl crouch</div>
    <div id="damage"></div>`;
  document.body.appendChild(hud);

  const buy = document.createElement('div');
  buy.id = 'buy-menu';
  buy.innerHTML = `<h2>BUY — Round <span id="buy-round">1</span></h2>
    <p>Press 1–4 for a weapon, 5 for a FRAG-7, B to close. Money: <b id="buy-money">$0</b></p>
    <div id="buy-list"></div>`;
  document.body.appendChild(buy);

  const menu = document.createElement('div');
  menu.id = 'menu';
  menu.innerHTML = `
    <h1>EMBERLINE</h1>
    <p class="tag">A round-based tactical shooter in the Foundry Yard.</p>
    <p>Ember attacks the Furnace. Wardens hold it. First to 8 rounds wins.</p>
    <p class="controls">WASD move · Shift walk · Ctrl crouch · Mouse aim · Click fire<br>
    R reload · B buy menu · G throw FRAG-7 · E plant / defuse the bomb</p>
    <button id="play-btn">CLICK TO PLAY</button>
    <p class="small">Single player against bots. No account, no download, no network.</p>`;
  document.body.appendChild(menu);

  const over = document.createElement('div');
  over.id = 'over';
  over.innerHTML = `<h1 id="over-title"></h1><p id="over-score"></p><button id="again-btn">PLAY AGAIN</button>`;
  document.body.appendChild(over);
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let lastFeedLen = 0;
let lastHp = -1;

export function updateHud(state, local) {
  $('score-ember').textContent = state.score.ember;
  $('score-warden').textContent = state.score.warden;
  $('timer').textContent = fmtTime(state.roundTime);
  $('round-label').textContent = `Round ${state.round}`;
  $('health-num').textContent = Math.max(0, Math.ceil(local.hp));
  const bar = $('health-bar');
  bar.style.width = `${Math.max(0, local.hp)}%`;
  bar.style.background = local.hp > 50 ? '#e8a33d' : local.hp > 25 ? '#d86a1e' : '#c22e2e';
  const w = WEAPONS[local.weaponId];
  $('ammo-mag').textContent = local.reloading ? '––' : local.ammo;
  $('ammo-res').textContent = `/ ${local.reserve}`;
  $('weapon-name').textContent = local.reloading ? 'Reloading…' : w.name;
  $('money').textContent = `$${local.money}`;
  $('grenades').textContent = local.grenades > 0 ? `FRAG-7 × ${local.grenades}` : '';
  const banner = $('banner');
  if (state.time < state.bannerUntil && state.banner) {
    banner.textContent = state.banner;
    banner.style.opacity = '1';
  } else {
    banner.style.opacity = '0';
  }
  if (state.events.length !== lastFeedLen) {
    lastFeedLen = state.events.length;
    $('feed').innerHTML = state.events.slice(-4).map((e) => `<div>${e.text}</div>`).join('');
  }
  if (local.hp !== lastHp) {
    lastHp = local.hp;
    const dmg = $('damage');
    dmg.style.opacity = local.hp < 35 ? '0.45' : local.hp < 70 ? '0.18' : '0';
  }
  // Crosshair spreads while moving, so stopping to aim reads at a glance.
  const spread = local.moving ? 14 : 6;
  document.documentElement.style.setProperty('--ch', `${spread}px`);
}

export function showBuy(state, local) {
  const menu = $('buy-menu');
  menu.style.display = 'block';
  $('buy-round').textContent = state.round;
  $('buy-money').textContent = `$${local.money}`;
  const rows = Object.values(WEAPONS).map((w, i) => {
    const owned = local.weaponId === w.id;
    const afford = local.money >= w.price;
    return `<div class="buy-row ${owned ? 'owned' : ''} ${!afford && !owned ? 'poor' : ''}">
      <b>${i + 1}</b> ${w.name} — $${w.price} ${owned ? '(equipped)' : ''}</div>`;
  }).join('');
  const g = `<div class="buy-row ${local.money < GRENADE.price ? 'poor' : ''}"><b>5</b> FRAG-7 Grenade — $${GRENADE.price} (own ${local.grenades})</div>`;
  $('buy-list').innerHTML = rows + g;
}

export function hideBuy() {
  $('buy-menu').style.display = 'none';
}

export function showMenu(show) {
  $('menu').style.display = show ? 'flex' : 'none';
}

export function showOver(show, title, score) {
  const over = $('over');
  over.style.display = show ? 'flex' : 'none';
  if (show) {
    $('over-title').textContent = title;
    $('over-score').textContent = score;
  }
}
