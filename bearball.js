"use strict";
/* ---------------------------------------------------------------------------
   bearball.js — the game logic, transcribed from the decompiled ActionScript 2
   of Bear Ball (Glowmonkey, 2009): root frames 122 (menu), 123 (game) and
   124 (lose), plus the clip event handlers attached to placed instances.

   The transcription is deliberately literal. Where the original does something
   odd, this does the same odd thing, and the comment says so — those quirks are
   what the game actually feels like:

     * `scoreboard.dist = dist` runs *before* `dist` is recomputed, so the
       on-screen distance is always one frame stale.
     * `objectArray.splice(i, 1)` inside a forward loop skips the element that
       slides into the freed slot, so one obstacle per removal goes unchecked
       that frame.
     * `case 6` only `break`s inside its `if`, so when a boost is already held
       the switch falls through into `case 7` and spawns bowling pins instead.
     * The plane's guard `_y < -800 || _y > -2800` is true for every possible
       value, so the plane always flies.
--------------------------------------------------------------------------- */

function installGame(stage) {
  const lib = stage.lib;
  const root = stage.root;
  const S = { width: 550, height: 400 };     // Stage.width / Stage.height

  /* ------------------------------------------------- sprite frame scripts
     Every DoAction inside a sprite, verbatim. Without these the objects
     would animate the moment they spawn instead of waiting to be hit. */
  const stop = function () { this.stop(); };
  lib.scripts = {
    root: { 122: menuFrame, 123: gameFrame, 124: loseFrame,
            125: () => root.gotoAndStop('menu') },

    72:  { 1: stop },                                   // pb (the bear)
    76:  { 1: stop },                                   // ball
    81:  { 1: stop },                                   // catapult arm
    92:  { 1: stop },                                   // cannon smoke
    120: { 1: stop },                                   // super_spring
    129: { 1: stop },                                   // trampoline
    153: { 10: stop },
    155: { 1: stop, 2: stop },                          // bird
    163: { 6: stop },
    165: { 1: stop },                                   // mud
    170: { 1: stop, 2: stop },                          // booster
    174: { 1: stop },                                   // bowling pins
    186: { 1: stop, 123: function () { this.gotoAndPlay(2); } },   // time warning
    202: { 2: function () { this.gotoAndPlay(1); },     // music toggle loop
           5: function () { this.stop(); } },
    220: { 1: stop, 3: function () { this.gotoAndStop(1); },
                    15: function () { this.gotoAndStop(1); } },    // sound_clip
    66:  { 10: function () {                            // end of boost anim
             root.boosting = false;
             this.parent.gotoAndStop('run');
           } },
  };

  /* ------------------------------------------------------------ frame 122 */
  function menuFrame() {
    root.stop();
    root.onEnterFrame = null;
    root._y = 0;
    // The "press me" clip at depth 65: on(release) { _root.play(); }
    const btn = root.children.get(65);
    if (btn) btn.onRelease = () => { root.play(); };
  }

  /* ------------------------------------------------------------ frame 124 */
  function loseFrame() {
    root._y = 0;
    root.stop();
    const btn = root.children.get(64);
    if (btn) {
      btn.onRelease = () => { root.play(); };
      // onClipEvent(enterFrame) { if (this._x < 222) this._x += 1; }
      btn.onEnterFrame = function () { if (this._x < 222) this._x += 1; };
    }
    // The original also called MochiScores.showLeaderboard() here; the ad
    // network is long dead, so there is nothing to show.
  }

  /* ------------------------------------------------------------ frame 123 */
  function gameFrame() {
    root.stop();

    const scoreboard = root.scoreboard;
    const floor = root.floor;
    const plane = root.plane;
    const sound_clip = root.sound_clip;

    root.windmill_bought = false;
    root.super_spring_bought = false;
    root.boost = 0;
    root.boosting = false;
    if (scoreboard && scoreboard.boost_button) scoreboard.boost_button._visible = false;
    root.time_count = 1800;
    root.objectArray = [];
    root.objectcount = 0;
    root.distance = 0;
    root.dist = 0;
    // Additions, not in the original: the best distance is seeded from saved
    // scores and shown straight away, rather than staying at 0 until beaten.
    if (root.bestdist === undefined) root.bestdist = stage.savedBest || 0;
    if (scoreboard) scoreboard.bestdist = root.bestdist;

    // plane: onClipEvent(enterFrame)
    if (plane) {
      plane.onEnterFrame = function () {
        if (root.projectile && (root.projectile._y < -800 || root.projectile._y > -2800)) {
          this._x += 20;
          if (this._x > 900) this._x = -300;
        }
      };
    }

    if (scoreboard && scoreboard.boost_button) {
      scoreboard.boost_button.onRelease = function () {
        root.boosting = true;
        root.projectile.dy = Math.abs((root.projectile.dy + 10) * 1.1);
        root.projectile.dx += 6;
        root.projectile.pb.gotoAndStop('boost');
        scoreboard.boost_button._visible = false;
        root.boost = 0;
      };
    }

    /* Addition, not in the original: abandon the current run and set up a
       fresh one in place, without waiting out the remaining clock. */
    root.restartRun = function () {
      root.onEnterFrame = null;
      root._y = 0;
      if (scoreboard) { scoreboard._y = 0; scoreboard.dist = 0; }
      if (root.launchbutton) root.launchbutton.removeMovieClip();
      root.boost = 0;
      root.boosting = false;
      if (scoreboard && scoreboard.boost_button) scoreboard.boost_button._visible = false;
      root.distance = 0;
      root.dist = 0;
      floor._x = 0;
      if (plane) plane._x = -341.9;
      newGame();
    };

    newGame();

    function byName(n) { return root[n]; }

    function newGame() {
      root.time_count = 1800;
      if (scoreboard) scoreboard.time = 60;
      for (let i = 0; i < root.objectArray.length; i++) {
        const o = byName(root.objectArray[i]);
        if (o) o.removeMovieClip();
      }
      root.objectArray = [];
      if (root.projectile) root.projectile.removeMovieClip();
      createCatapult();
    }

    function createCatapult() {
      if (root.catapult) root.catapult.removeMovieClip();
      root.attachMovie('catapult', 'catapult', root.getNextHighestDepth(), { _x: -60, _y: 250 });
      root.objectArray.push('catapult');
      const catapult = root.catapult;
      catapult.onEnterFrame = function () {
        catapult._x += 20;
        catapult.frontwheel._rotation += 5;
        catapult.backwheel._rotation += 5;
        if (catapult._x > 130) loadCatapult();
      };
    }

    function loadCatapult() {
      const catapult = root.catapult;
      catapult.onEnterFrame = function () {
        catapult.arm._rotation -= 2;
        if (catapult.arm._rotation <= -90) {
          displayLaunchButton();
          catapult.onEnterFrame = null;
        }
      };
    }

    function displayLaunchButton() {
      root.attachMovie('launchbutton', 'launchbutton', root.getNextHighestDepth(),
                       { _x: 275, _y: 240 });
      root.launchbutton.onPress = function () { releaseCatapult(); };
    }

    function releaseCatapult() {
      root.distance = 0;
      const catapult = root.catapult;
      catapult.onEnterFrame = function () {
        catapult.arm._rotation += 15;
        catapult.smoke.gotoAndPlay(2);
        if (catapult.arm._rotation >= 0) {
          catapult.onEnterFrame = null;
          fireProjectile();
        }
      };
    }

    function fireProjectile() {
      const catapult = root.catapult;
      catapult.arm.gotoAndStop(2);
      root.attachMovie('projectile', 'projectile', root.getNextHighestDepth(),
                       { _x: catapult._x, _y: catapult._y });
      const projectile = root.projectile;
      const sliderY = root.launchbutton.highorlong.highorlongslider._y;
      projectile.dx = sliderY / 5 + 0.5;
      projectile.dy = 20 - sliderY / 5;
      root.launchbutton.removeMovieClip();

      root.onEnterFrame = function () {
        const projectile = root.projectile;
        root.time_count -= 1;
        if (scoreboard) {
          scoreboard.time = Math.round(root.time_count / 30);
          if (scoreboard.time === 10) scoreboard.warning.gotoAndPlay(2);
        }
        root.distance += projectile.dx;

        // Stale by one frame, exactly as in the original.
        if (scoreboard) scoreboard.dist = root.dist;
        root.dist = Math.floor(root.distance);
        if (root.dist > root.bestdist) {
          root.bestdist = root.dist;
          if (scoreboard) scoreboard.bestdist = root.dist;
        }

        projectile.guts._rotation += projectile.dx / 2;
        projectile._x += projectile.dx;

        if (plane && projectile.hitTest(plane)) {
          projectile.dx += 0.3;
          sound_clip.gotoAndPlay(2);
        }
        if (projectile._y < -3000) projectile.dy = 0;
        projectile.dy -= 0.2;
        projectile._y -= projectile.dy;

        if (projectile._x >= S.width / 2) {
          shiftObjects(S.width / 2 - projectile._x);
          projectile._x = S.width / 2;
        }
        if (projectile._y < 150) shiftObjectsY(projectile.dy);
        if (projectile._y >= 150) { root._y = 0; if (scoreboard) scoreboard._y = 0; }

        if (projectile._y > S.height - 60) {
          projectile._y = S.height - 60;
          projectile.dy *= -0.7;
          projectile.dx *= 0.7;
          projectile.ball.gotoAndPlay(2);
        }
        if (projectile._y < S.height - 20) projectile.ball._yscale = 100;

        spawn();
        collide();

        if (projectile.dx > 0.9 && projectile.dx < 10 && !root.boosting) projectile.pb.gotoAndStop('walk');
        if (projectile.dx > 10 && !root.boosting) projectile.pb.gotoAndStop('run');
        if (projectile.dx < 0.9 && !root.boosting) projectile.pb.gotoAndStop(1);

        if (Math.abs(projectile.dy) < 0.1 && projectile.dx < 0.1) { root.onEnterFrame = null; loseGame(); }
        if (root.time_count < 1) { root.onEnterFrame = null; loseGame(); }
      };
    }

    function countOf(word) {
      let n = 0;
      for (let i = 0; i < root.objectArray.length; i++) {
        if (root.objectArray[i].indexOf(word) !== -1) n++;
      }
      return n;
    }

    function spawn() {
      switch (Math.floor(Math.random() * 100)) {
        case 0: if (countOf('trampoline') < 3) addObject('trampoline'); break;
        case 1: if (countOf('fan') < 3) addObject('fan'); break;
        case 2: if (countOf('windmill') < 3) addObject('windmill'); break;
        case 3: if (countOf('super_spring') < 3) addObject('super_spring'); break;
        case 4: if (countOf('mud') < 3) addObject('mud'); break;
        case 5: if (countOf('bird') < 2) addObject('bird'); break;
        case 6:
          if (root.boost < 1) {
            if (countOf('booster') < 1) addObject('booster');
            break;
          }
          // falls through to case 7 when a boost is already held — original bug
        case 7: if (countOf('bowling_pins') < 2) addObject('bowling_pins'); break;
      }
    }

    function collide() {
      const projectile = root.projectile;
      let i = 0;
      while (i < root.objectArray.length) {
        const nm = root.objectArray[i];
        const o = byName(nm);
        if (!o) { i++; continue; }

        if (o._x + o._width < 0) {
          o.removeMovieClip();
          root.objectArray.splice(i, 1);
          // No i-- here: the original skips the object that shifts into place.
        } else if (nm.indexOf('trampoline') !== -1) {
          if (projectile.block.hitTest(o)) {
            o.gotoAndPlay(2);
            projectile.dy = Math.abs(projectile.dy * 1.2);
          }
        } else if (nm.indexOf('fan') !== -1) {
          if (projectile.block.hitTest(o)) projectile.dx *= 1.2;
        } else if (nm.indexOf('windmill') !== -1) {
          if (projectile._y < 200 && projectile.block.hitTest(o)) {
            sound_clip.gotoAndPlay('windmill');
            projectile.dx *= 1.1;
          }
        } else if (nm.indexOf('super_spring') !== -1) {
          if (projectile.block.hitTest(o)) {
            o.gotoAndPlay(2);
            projectile.dy = Math.abs((projectile.dy + 0.5) * 1.9);
          }
        } else if (nm.indexOf('mud') !== -1) {
          if (projectile.block.hitTest(o)) {
            o.gotoAndStop(2);
            projectile.dy = Math.abs(projectile.dy * 0.5);
            projectile.dx *= 0.9;
          }
        } else if (nm.indexOf('bird') !== -1) {
          if (projectile.block.hitTest(o.block)) {
            o.gotoAndStop(2);
            projectile.dy = Math.abs(projectile.dy * -1);
          }
        } else if (nm.indexOf('booster') !== -1) {
          if (projectile.block.hitTest(o)) {
            o.gotoAndStop(2);
            root.boost = 1;
            if (scoreboard) scoreboard.boost_button._visible = true;
          }
        } else if (nm.indexOf('bowling_pins') !== -1) {
          if (projectile.block.hitTest(o)) {
            o.gotoAndStop(2);
            projectile.dy = Math.abs(projectile.dy * 0.5);
            projectile.dx *= 0.9;
          }
        }
        i++;
      }
    }

    function addObject(inputObject) {
      root.objectcount += 1;
      const name = inputObject + root.objectcount;
      root.objectArray.push(name);
      root.attachMovie(inputObject, name, root.getNextHighestDepth(),
                       { _x: S.width + 15, _y: floor._y });
      root.projectile.swapDepths(root.getNextHighestDepth());
    }

    function shiftObjects(shiftdistance) {
      for (let i = 0; i < root.objectArray.length; i++) {
        const o = byName(root.objectArray[i]);
        if (o) o._x += shiftdistance;
      }
      floor._x = (floor._x + shiftdistance) % (floor._width / 2);
    }

    function shiftObjectsY(shiftdistanceY) {
      root._y += shiftdistanceY;
      if (scoreboard) scoreboard._y -= shiftdistanceY;
    }

    function loseGame() {
      root._y = 0;
      if (scoreboard) scoreboard._y = 0;
      if (stage.onRunEnded) stage.onRunEnded(root.dist);   // addition: score keeping
      root.gotoAndStop('lose');
      for (let i = 0; i < root.objectArray.length; i++) {
        const o = byName(root.objectArray[i]);
        if (o) o.removeMovieClip();
      }
      root.objectArray = [];
      if (root.projectile) root.projectile.removeMovieClip();
    }
  }

  /* The original opens frame 1 with a sponsor splash and a Mochi handshake
     that no longer resolves; start where the game itself starts. */
  root.gotoAndStop('menu');
}

window.installGame = installGame;
