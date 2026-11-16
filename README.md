[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/nisarena2/emberline-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/nisarena2/emberline-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Built for the best-game-01 bounty on make.fun: https://make.fun/bounty/best-game-01

# EMBERLINE — Foundry Yard

A complete round-based tactical shooter that runs in a browser tab. Ember
attacks the Furnace, Wardens hold it, first to 8 rounds wins the match.
Three lanes, one bombsite, and bots that play the objective instead of
wandering around.

I wanted the round loop I grew up playing — buy phase, plant, defuse,
economy — as something I could open and play with zero install. The whole
game is static files: three.js for rendering, plain ES modules, no build
step, no network calls at all. One match takes about fifteen minutes; the
first round teaches you everything, the rest is timing and nerve.

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static
server). Click **CLICK TO PLAY**, and the game locks your mouse.

- **WASD** move, **Shift** walk, **Ctrl** crouch, mouse to aim
- **Click** fire, **R** reload, **B** buy menu between rounds
- **G** throw a FRAG-7, **E** plant the bomb / defuse it

## The loop

- **Rounds**: a buy phase, then a 100-second round. Win by eliminating the
  other team, planting and blowing the Furnace, or — as Wardens — running
  the clock out or defusing in time.
- **Economy**: $1,400 for a round win, $900 for a loss, $300 a kill, $300
  for a defuse. Spend it on four guns and grenades in the buy menu.
- **Gunplay**: hitscan with headshots worth 4x, spread and recoil that grow
  when you fire on the move, so stopping to aim pays. No friendly fire.
- **Bots**: Ember bots push lanes and plant; Warden bots hold posts, patrol,
  hear gunfire, and run to defuse once the bomb is down. They fire in
  bursts with a real reaction delay, and they hunt you down if you go quiet.
- **Map**: Foundry Yard — North, Mid and South lanes into the Furnace
  bombsite, dusk light, amber and teal. Crates and divider walls make the
  corners worth clearing.
- **Tech**: fixed-step 60 Hz simulation kept apart from rendering, one
  module per job (`state`, `map`, `player`, `weapons`, `bots`, `rounds`,
  `hud`, `audio`, `fx`), procedural WebAudio sounds, pooled tracers and
  particles so the hot loops allocate nothing.

## Run it

```sh
# serve the game folder and open http://localhost:8080
npx --yes serve game
```

## License

MIT — see LICENSE.
