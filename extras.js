"use strict";
/* ---------------------------------------------------------------------------
   extras.js — the two things the 2009 game did not have.

   Both live outside the 550x400 stage, in the page chrome, so the game itself
   stays pixel-faithful. The only touch points inside the game are three hooks
   in bearball.js: stage.savedBest (seeds the Best field), stage.onRunEnded
   (records a finished run) and root.restartRun (abandons the current one).

     1. Restart a bad run — R, or the button, without waiting out the clock.
     2. High scores that survive a reload, kept in localStorage.

   The original had neither: a duffed shot meant sitting through the remaining
   60 seconds, and the score went to a Mochi leaderboard that no longer exists.
--------------------------------------------------------------------------- */

const STORE_KEY = 'bearball.scores.v1';
const KEEP = 5;

function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter(n => Number.isFinite(n) && n >= 0)
              .sort((a, b) => b - a).slice(0, KEEP);
  } catch (e) { return []; }        // private mode, or someone else's data
}

function saveScores(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
}

function installExtras(stage) {
  let scores = loadScores();
  stage.savedBest = scores.length ? scores[0] : 0;

  const listEl = document.getElementById('scorelist');
  const bestEl = document.getElementById('bestvalue');
  const btn = document.getElementById('restart');
  const note = document.getElementById('runnote');

  const fmt = n => n.toLocaleString();

  function paint(justAdded) {
    bestEl.textContent = scores.length ? fmt(scores[0]) : '—';
    listEl.textContent = '';
    if (!scores.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'no runs yet';
      listEl.append(li);
      return;
    }
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = fmt(s);
      if (justAdded !== undefined && s === justAdded && i === scores.indexOf(justAdded)) {
        li.className = 'fresh';
      }
      listEl.append(li);
    });
  }

  stage.onRunEnded = function (distance) {
    const d = Math.max(0, Math.floor(distance || 0));
    const beatBest = scores.length === 0 || d > scores[0];
    scores = [...scores, d].sort((a, b) => b - a).slice(0, KEEP);
    saveScores(scores);
    stage.savedBest = scores[0];
    paint(d);
    note.textContent = beatBest ? `New best — ${fmt(d)}` : `Run ended at ${fmt(d)}`;
  };

  function restart() {
    const root = stage.root;
    if (root.currentFrame === 123 && root.restartRun) {
      root.restartRun();
      note.textContent = 'Run restarted';
    } else {
      // Not mid-run: send the menu or the lose screen onward instead.
      root.play();
      note.textContent = '';
    }
    stage.render();
  }

  btn.addEventListener('click', restart);
  window.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
      if (e.metaKey || e.ctrlKey || e.altKey) return;   // leave reload alone
      e.preventDefault();
      restart();
    }
  });

  paint();
}

window.installExtras = installExtras;
