# Bear Ball — HTML5 recreation

A faithful rebuild of *Bear Ball* (Glowmonkey, 2009) that runs in a browser with no
Flash and no Ruffle. Everything on screen comes out of the original `bear_ball_game.swf`.

    python3 -m http.server 8792     # then open http://127.0.0.1:8792

## Where the fidelity comes from

Nothing here is eyeballed. Three things were pulled out of the SWF and reused directly:

| Source | Used for |
| --- | --- |
| `data/game.json` | Every sprite's per-frame display list, placement matrices, colour transforms, depths, frame labels, symbol exports, text runs and font code tables — parsed from the SWF binary |
| `assets/shapes/*.svg` | All 148 vector shapes, exported as SVG and drawn at their recorded bounds offsets |
| `assets/fonts`, `assets/sounds` | The embedded Hobo Std / Arial Black faces and the nine original sounds |

`swf.js` is a small display-list player: nested timelines, `play`/`stop`/`gotoAndPlay`/
`gotoAndStop`, `attachMovie` / `removeMovieClip` / `swapDepths`, bounding-box `hitTest`,
variable-bound text fields, and button states. It implements only what this game uses.

`bearball.js` is the ActionScript 2 of root frames 122–124 transcribed line for line,
plus every `DoAction` inside the sprites.

## Original behaviour that was kept on purpose

These look like bugs because they are, but they are what the game plays like:

- **The distance readout lags a frame.** `scoreboard.dist = dist` runs before `dist` is
  recomputed, so the on-screen distance is always one frame behind `best`.
- **One obstacle per removal is skipped.** `objectArray.splice(i, 1)` inside a forward
  loop doesn't rewind `i`, so the object that slides into the freed slot goes
  unchecked that frame.
- **Holding a boost spawns bowling pins.** `case 6` only `break`s inside its `if`, so
  when `boost >= 1` the switch falls straight through into `case 7`.
- **The plane always flies.** Its guard, `_y < -800 || _y > -2800`, is true for every
  possible value of `_y`.
- **Two off-screen text fields.** The root carries a second `dist` / `bestdist` pair at
  negative x, left over from an earlier layout. They are placed, and invisible.

## Added on top (`extras.js`)

Two things the 2009 game did not have. Both live in the page chrome below the stage,
so the 550×400 game itself stays pixel-faithful. They reach into the game through
three named hooks in `bearball.js` and nothing else.

- **Restart a bad run.** Press <kbd>R</kbd> or the button and the current run is
  abandoned in place: clock back to 60, distance to 0, obstacles and projectile
  cleared, camera and scrolling floor reset, a fresh catapult rolled in. No waiting
  out the remaining seconds after a duffed shot. On the menu or the lose screen the
  same key just moves you onward.
- **High scores that survive a reload.** Every finished run is recorded; the top five
  are kept in `localStorage` under `bearball.scores.v1` and shown under the stage.
  The in-game `Best:` field is seeded from the saved best at the start of a run
  rather than sitting at 0 until you beat it — the original had no way to persist a
  score other than the Mochi leaderboard, which is gone.

Clearing the saved scores is `localStorage.removeItem('bearball.scores.v1')` in the
console. Restarting a run does not erase a distance already reached — if the
abandoned run set a record, the record stands.

## Deliberate differences

- **The sponsor splash and the Mochi handshake are gone.** Frame 1 connected to
  `mochiads.com`, which has not existed for years. The game opens on its menu.
- **The lose screen stops by itself.** In the original that stop came from
  `MochiScores.showLeaderboard`, which called `MochiServices.clip.stop()` on the root.
  Without it the lose screen would flash for a single frame and bounce to the menu.
  There is no leaderboard to show, so the stop is done directly.
- **Two sound effects were transcoded.** The mud and bowling-pin hits were FLV inside
  the SWF; they are mp3 here. No browser plays FLV.
- **Timing is a fixed 30 fps accumulator**, driven by `requestAnimationFrame` when the
  page is visible and by a timer when it is not — rAF is suspended in a hidden tab and
  Flash kept playing there.
