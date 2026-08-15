"use strict";
/* ---------------------------------------------------------------------------
   swf.js — a very small SWF display-list player.

   It is not a general Flash emulator. It implements exactly the subset that
   Bear Ball (Glowmonkey, 2009) uses: nested sprites with keyframe display
   lists, PlaceObject matrices and colour transforms, frame labels,
   play/stop/gotoAndPlay/gotoAndStop, attachMovie/removeMovieClip/swapDepths,
   bounding-box hitTest, variable-bound text fields and button states.

   Everything it draws comes from data/game.json, which was parsed straight out
   of bear_ball_game.swf, plus the shape artwork exported as SVG. So placement,
   scale, depth order and timing are the original's, not a re-interpretation.
--------------------------------------------------------------------------- */

const DEG = Math.PI / 180;

/* ---- matrix helpers ------------------------------------------------------
   SWF and canvas share the same convention:
       x' = a*x + c*y + tx      y' = b*x + d*y + ty                        */
const Mat = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul(m, n) {                       // apply n, then m  (i.e. m ∘ n)
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  },
  apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
};

/* Transform a local [xmin,xmax,ymin,ymax] box through a matrix. */
function boxThrough(m, b) {
  if (!b) return null;
  const pts = [
    Mat.apply(m, b[0], b[2]), Mat.apply(m, b[1], b[2]),
    Mat.apply(m, b[0], b[3]), Mat.apply(m, b[1], b[3]),
  ];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}
function boxUnion(a, b) {
  if (!a) return b; if (!b) return a;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1]),
          Math.min(a[2], b[2]), Math.max(a[3], b[3])];
}
function boxHit(a, b) {
  return !!a && !!b && a[0] <= b[1] && b[0] <= a[1] && a[2] <= b[3] && b[2] <= a[3];
}

/* ---- display objects ---------------------------------------------------- */

class DisplayObject {
  constructor(lib, charId) {
    this.lib = lib;
    this.charId = charId;
    this.parent = null;
    this.depth = 0;
    this.name = null;
    this._m = Mat.id();
    this._alpha = 1;
    this._visible = true;
  }

  /* --- AS2 transform properties. The matrix is authoritative; the getters
         decompose it and the setters recompose, exactly like Flash. ------- */
  get _x() { return this._m[4]; }
  set _x(v) { this._m[4] = v; }
  get _y() { return this._m[5]; }
  set _y(v) { this._m[5] = v; }

  get scaleX() { return Math.sqrt(this._m[0] ** 2 + this._m[1] ** 2) * (this._m[0] < 0 ? -1 : 1); }
  get scaleY() { return Math.sqrt(this._m[2] ** 2 + this._m[3] ** 2) * (this._m[3] < 0 ? -1 : 1); }
  get rotationRad() { return Math.atan2(this._m[1], this._m[0]); }

  get _rotation() { return this.rotationRad / DEG; }
  set _rotation(deg) { this.recompose(this.scaleX, this.scaleY, deg * DEG); }
  get _xscale() { return this.scaleX * 100; }
  set _xscale(v) { this.recompose(v / 100, this.scaleY, this.rotationRad); }
  get _yscale() { return this.scaleY * 100; }
  set _yscale(v) { this.recompose(this.scaleX, v / 100, this.rotationRad); }

  recompose(sx, sy, r) {
    const c = Math.cos(r), s = Math.sin(r);
    this._m = [sx * c, sx * s, -sy * s, sy * c, this._m[4], this._m[5]];
  }

  /* Concatenated matrix up to (but not including) the stage. */
  globalMatrix() {
    let m = this._m, p = this.parent;
    while (p) { m = Mat.mul(p._m, m); p = p.parent; }
    return m;
  }
  globalAlpha() {
    let a = this._alpha, p = this.parent;
    while (p) { a *= p._alpha; p = p.parent; }
    return a;
  }

  localBounds() { return null; }
  bounds(space) {                      // bbox in `space`'s coords; null = global
    const b = this.localBounds();
    if (!b) return null;
    let m = this.globalMatrix();
    if (space) {
      const g = space.globalMatrix();
      const det = g[0] * g[3] - g[1] * g[2] || 1e-9;
      const inv = [g[3] / det, -g[1] / det, -g[2] / det, g[0] / det,
                   (g[2] * g[5] - g[3] * g[4]) / det, (g[1] * g[4] - g[0] * g[5]) / det];
      m = Mat.mul(inv, m);
    }
    return boxThrough(m, b);
  }
  get _width() {
    const b = this.localBounds();
    if (!b) return 0;
    const t = boxThrough(this._m, b);
    return t[1] - t[0];
  }
  get _height() {
    const b = this.localBounds();
    if (!b) return 0;
    const t = boxThrough(this._m, b);
    return t[3] - t[2];
  }

  /* Flash's hitTest(target) is a bounding-box test in global space. */
  hitTest(other) {
    if (!other) return false;
    return boxHit(this.bounds(null), other.bounds(null));
  }

  removeMovieClip() {
    if (this.parent) this.parent.removeChildAtDepth(this.depth);
  }
  swapDepths(d) {
    const p = this.parent; if (!p) return;
    const other = p.children.get(d);
    p.children.delete(this.depth);
    if (other) { other.depth = this.depth; p.children.set(this.depth, other); }
    this.depth = d; p.children.set(d, this);
  }

  draw() {}
}

class ShapeObj extends DisplayObject {
  constructor(lib, id) { super(lib, id); this.def = lib.shapes[id]; }
  localBounds() { return this.def; }
  draw(ctx) {
    const img = this.lib.raster(this.charId);
    if (!img) return;
    const b = this.def;
    ctx.drawImage(img, b[0], b[2], b[1] - b[0], b[3] - b[2]);
  }
}

class StaticText extends DisplayObject {
  constructor(lib, id) { super(lib, id); this.def = lib.text[id]; }
  localBounds() { return this.def.bounds; }
  draw(ctx) {
    const d = this.def;
    ctx.save();
    ctx.transform(d.m[0], d.m[1], d.m[2], d.m[3], d.m[4], d.m[5]);
    for (const run of d.runs) {
      const f = this.lib.fonts[run.font];
      ctx.font = `${run.size}px ${this.lib.fontFamily(run.font)}`;
      ctx.fillStyle = run.color;
      ctx.textBaseline = 'alphabetic';
      let x = run.x;
      for (const [gi, adv] of run.g) {          // glyph-exact advances
        const code = f && f.codes[gi];
        if (code) ctx.fillText(String.fromCharCode(code), x, run.y);
        x += adv;
      }
    }
    ctx.restore();
  }
}

class EditTextObj extends DisplayObject {
  constructor(lib, id) {
    super(lib, id);
    this.def = lib.edit[id];
    this.text = this.def.initial !== undefined ? this.def.initial : '';
  }
  localBounds() { return this.def.bounds; }
  draw(ctx) {
    const d = this.def;
    // A bound field resolves its variable on the timeline that contains it,
    // which is how `scoreboard.time = 60` reaches the on-screen clock.
    const v = d.var && this.parent ? this.parent[d.var] : undefined;
    const s = v === undefined ? this.text : String(v);
    if (s === '') return;
    ctx.font = `${d.size}px ${this.lib.fontFamily(d.font)}`;
    ctx.fillStyle = d.color || '#000';
    ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(s).width;
    const inner = d.bounds;
    let x = inner[0] + 2;
    if (d.align === 1) x = inner[1] - 2 - w;              // right
    else if (d.align === 2) x = (inner[0] + inner[1]) / 2 - w / 2;  // centre
    ctx.fillText(s, x, inner[2] + d.size + 1);
  }
}

class ButtonObj extends DisplayObject {
  constructor(lib, id) {
    super(lib, id);
    this.def = lib.buttons[id];
    this.state = 'up';
    this.kids = { up: [], over: [], down: [], hit: [] };
    for (const r of this.def.records) {
      for (const st of ['up', 'over', 'down', 'hit']) {
        if (!r[st]) continue;
        const o = lib.instantiate(r.id);
        if (!o) continue;
        o.parent = this; o._m = r.m.slice();
        if (r.cx) o._alpha = r.cx[0][3];
        this.kids[st].push(o);
      }
    }
  }
  activeKids() {
    const k = this.kids[this.state];
    return k.length ? k : this.kids.up;
  }
  localBounds() {
    let b = null;
    for (const k of this.activeKids()) b = boxUnion(b, boxThrough(k._m, k.localBounds()));
    return b;
  }
  hitBounds() {
    const src = this.kids.hit.length ? this.kids.hit : this.kids.up;
    let b = null;
    for (const k of src) b = boxUnion(b, boxThrough(k._m, k.localBounds()));
    return b ? boxThrough(this.globalMatrix(), b) : null;
  }
  draw(ctx) {
    for (const k of this.activeKids()) {
      ctx.save();
      ctx.transform(...k._m);
      ctx.globalAlpha *= k._alpha;
      k.draw(ctx);
      ctx.restore();
    }
  }
}

class MovieClip extends DisplayObject {
  constructor(lib, id) {
    super(lib, id);
    const def = id === null ? lib.root : lib.sprites[id];
    this.def = def;
    this.totalFrames = def.frames;
    this.labels = def.labels || {};
    this.children = new Map();          // depth -> DisplayObject
    this.vars = Object.create(null);    // AS2 timeline variables
    this.currentFrame = 0;
    this.playing = true;
    this.onEnterFrame = null;
    this.onPress = null;
    this.onRelease = null;
    this._byFrame = null;
  }

  /* Commands grouped per frame, built lazily. */
  frameCmds(f) {
    if (!this._byFrame) {
      this._byFrame = new Map();
      for (const o of this.def.dl) {
        if (!this._byFrame.has(o.f)) this._byFrame.set(o.f, []);
        this._byFrame.get(o.f).push(o);
      }
    }
    return this._byFrame.get(f) || [];
  }

  applyFrame(f) {
    for (const o of this.frameCmds(f)) {
      if (o.snd !== undefined) { this.lib.playSound(o.snd); continue; }
      if (o.rm) { this.removeChildAtDepth(o.d, true); continue; }
      const existing = this.children.get(o.d);
      if (o.mv && existing && (o.id === undefined || existing.charId === o.id)) {
        if (o.m) existing._m = o.m.slice();
        if (o.cx) existing._alpha = o.cx[0][3];
        continue;
      }
      if (existing && existing.fromTimeline) this.children.delete(o.d);
      if (o.id === undefined) continue;
      const inst = this.lib.instantiate(o.id);
      if (!inst) continue;
      inst.parent = this; inst.depth = o.d; inst.fromTimeline = true;
      inst._m = o.m ? o.m.slice() : Mat.id();
      if (o.cx) inst._alpha = o.cx[0][3];
      if (o.n) { inst.name = o.n; this[o.n] = inst; }
      this.children.set(o.d, inst);
      // A clip shows its own frame 1 on the frame it is placed.
      if (inst instanceof MovieClip) {
        inst.applyFrame(1); inst.currentFrame = 1; inst.runFrameScript();
      }
    }
  }

  /* Frame scripts (the DoAction tags) live in lib.scripts, keyed by character
     id then frame number; the root's are under "root". Only the frame the
     playhead lands on runs — Flash doesn't fire scripts it scrubs past. */
  runFrameScript() {
    const t = this.lib.scripts[this.charId === null ? 'root' : this.charId];
    const fn = t && t[this.currentFrame];
    if (fn) fn.call(this, this);
  }

  /* Flash rebuilds the display list from frame 1 when you jump backwards. */
  gotoFrame(f) {
    f = Math.max(1, Math.min(this.totalFrames, f));
    if (f === this.currentFrame) return;
    if (f === this.currentFrame + 1) { this.currentFrame = f; this.applyFrame(f); }
    else {
      for (const [d, c] of [...this.children]) if (c.fromTimeline) this.children.delete(d);
      for (let i = 1; i <= f; i++) this.applyFrame(i);
      this.currentFrame = f;
    }
    this.runFrameScript();
  }

  resolveFrame(x) {
    if (typeof x === 'string') return this.labels[x] !== undefined ? this.labels[x] : 1;
    return x | 0;
  }
  gotoAndStop(x) { this.gotoFrame(this.resolveFrame(x)); this.playing = false; }
  gotoAndPlay(x) { this.gotoFrame(this.resolveFrame(x)); this.playing = true; }
  play() { this.playing = true; }
  stop() { this.playing = false; }

  advance() {
    if (this.playing && this.totalFrames > 1) {
      let n = this.currentFrame + 1;
      if (n > this.totalFrames) {
        // Looping back to the top rebuilds the timeline's own display list.
        n = 1;
        for (const [d, c] of [...this.children]) if (c.fromTimeline) this.children.delete(d);
      }
      this.currentFrame = n;
      this.applyFrame(n);
      this.runFrameScript();
    }
    if (this.onEnterFrame) this.onEnterFrame.call(this);
    for (const c of [...this.children.values()]) if (c instanceof MovieClip) c.advance();
  }

  removeChildAtDepth(d, timelineOnly) {
    const c = this.children.get(d);
    if (!c) return;
    if (timelineOnly && !c.fromTimeline) return;
    if (c.name && this[c.name] === c) delete this[c.name];
    this.children.delete(d);
  }

  getNextHighestDepth() {
    let m = 0;
    for (const d of this.children.keys()) if (d >= m) m = d + 1;
    return m;
  }

  attachMovie(exportName, instName, depth, init) {
    const id = this.lib.exports[exportName];
    if (id === undefined) return null;
    const mc = this.lib.instantiate(id);
    mc.parent = this; mc.depth = depth; mc.name = instName;
    if (init) for (const k in init) mc[k] = init[k];
    this.children.set(depth, mc);
    this[instName] = mc;
    mc.applyFrame(1); mc.currentFrame = 1; mc.runFrameScript();
    return mc;
  }

  localBounds() {
    let b = null;
    for (const c of this.children.values()) {
      if (!c._visible) continue;
      const cb = c.localBounds();
      if (cb) b = boxUnion(b, boxThrough(c._m, cb));
    }
    return b;
  }

  draw(ctx) {
    const depths = [...this.children.keys()].sort((a, z) => a - z);
    for (const d of depths) {
      const c = this.children.get(d);
      if (!c._visible) continue;
      ctx.save();
      ctx.transform(c._m[0], c._m[1], c._m[2], c._m[3], c._m[4], c._m[5]);
      const oa = ctx.globalAlpha;
      ctx.globalAlpha = oa * c._alpha;
      c.draw(ctx);
      ctx.globalAlpha = oa;
      ctx.restore();
    }
  }

  /* Depth-first, topmost-first search for a clip/button that wants clicks. */
  pickPressable(gx, gy, out) {
    const depths = [...this.children.keys()].sort((a, z) => z - a);
    for (const d of depths) {
      const c = this.children.get(d);
      if (!c._visible) continue;
      if (c instanceof MovieClip) { if (c.pickPressable(gx, gy, out)) return true; }
      if (c instanceof ButtonObj) {
        const hb = c.hitBounds();
        if (hb && gx >= hb[0] && gx <= hb[1] && gy >= hb[2] && gy <= hb[3]) { out.hit = c; return true; }
      }
      if ((c.onPress || c.onRelease) && c instanceof MovieClip) {
        const b = c.bounds(null);
        if (b && gx >= b[0] && gx <= b[1] && gy >= b[2] && gy <= b[3]) { out.hit = c; return true; }
      }
    }
    return false;
  }
}

/* ---- library ------------------------------------------------------------ */

class Library {
  constructor(data, basePath) {
    this.data = data;
    this.base = basePath;
    this.shapes = {}; for (const k in data.shapes) this.shapes[k] = data.shapes[k];
    this.text = data.text;
    this.edit = data.edit;
    this.buttons = data.buttons;
    this.sprites = data.sprites;
    this.fonts = data.fonts;
    this.exports = data.exports;
    this.root = data.root;
    this.rasters = {};
    this.audio = {};
    this.muted = false;
    this.scripts = {};      // charId | "root"  ->  { frameNumber: fn }
  }
  fontFamily(id) {
    const f = this.fonts[id];
    if (!f) return 'sans-serif';
    return /Arial Black/i.test(f.name) ? '"BB Arial Black", sans-serif'
                                       : '"BB Hobo", sans-serif';
  }
  raster(id) { return this.rasters[id] || null; }

  instantiate(id) {
    if (this.sprites[id]) return new MovieClip(this, id);
    if (this.shapes[id]) return new ShapeObj(this, id);
    if (this.text[id]) return new StaticText(this, id);
    if (this.edit[id]) return new EditTextObj(this, id);
    if (this.buttons[id]) return new ButtonObj(this, id);
    return null;
  }

  playSound(id) {
    if (this.muted) return;
    const a = this.audio[id];
    if (!a) return;
    try { const n = a.cloneNode(); n.volume = a.volume; n.play().catch(() => {}); } catch (e) {}
  }

  /* Rasterise every SVG at 2x so scaled-up draws stay crisp. */
  async load(onProgress) {
    const ids = Object.keys(this.shapes);
    let done = 0;
    const SS = 2;
    await Promise.all(ids.map(id => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const b = this.shapes[id];
        const w = Math.max(1, Math.round((b[1] - b[0]) * SS));
        const h = Math.max(1, Math.round((b[3] - b[2]) * SS));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        this.rasters[id] = cv;
        if (onProgress) onProgress(++done, ids.length);
        res();
      };
      img.onerror = () => { if (onProgress) onProgress(++done, ids.length); res(); };
      img.src = `${this.base}/assets/shapes/${id}.svg`;
    })));
  }

  loadSounds(map) {
    for (const id in map) {
      const a = new Audio(`${this.base}/assets/sounds/${map[id]}`);
      a.preload = 'auto';
      this.audio[id] = a;
    }
  }
}

/* ---- stage -------------------------------------------------------------- */

class Stage {
  constructor(canvas, lib) {
    this.canvas = canvas;
    this.lib = lib;
    this.ctx = canvas.getContext('2d');
    this.width = lib.data.stage[1];
    this.height = lib.data.stage[3];
    this.fps = lib.data.fps;
    this.bg = lib.data.bg;
    this.root = new MovieClip(lib, null);
    this.root.vars = Object.create(null);
    this.pressed = null;
    this.resize();
    canvas.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mouseup', e => this.onUp(e));
    canvas.addEventListener('mousemove', e => this.onMove(e));
    canvas.addEventListener('touchstart', e => { e.preventDefault(); this.onDown(e.touches[0]); }, { passive: false });
    window.addEventListener('touchend', e => this.onUp(e.changedTouches[0]));
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
  }

  toStage(e) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;      // laid out at zero size
    return [(e.clientX - r.left) * (this.width / r.width),
            (e.clientY - r.top) * (this.height / r.height)];
  }

  /* Pointer handling in stage coordinates, so it can be driven directly. */
  press(x, y) {
    const out = {};
    this.root.pickPressable(x, y, out);
    this.pressed = out.hit || null;
    if (this.pressed) {
      if (this.pressed instanceof ButtonObj) this.pressed.state = 'down';
      if (this.pressed.onPress) this.pressed.onPress.call(this.pressed);
    }
    return this.pressed;
  }
  release() {
    if (!this.pressed) return;
    const p = this.pressed; this.pressed = null;
    if (p instanceof ButtonObj) p.state = 'up';
    if (p.onRelease) p.onRelease.call(p);
  }

  onDown(e) { const p = this.toStage(e); if (p) this.press(p[0], p[1]); }
  onUp() { this.release(); }
  onMove(e) {
    const p = this.toStage(e);
    if (!p) return;
    const out = {};
    this.root.pickPressable(p[0], p[1], out);
    this.canvas.style.cursor = out.hit ? 'pointer' : 'default';
  }

  tick() {
    this.root.advance();
  }

  render() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = this.bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.scale(this.dpr, this.dpr);
    c.beginPath(); c.rect(0, 0, this.width, this.height); c.clip();
    c.transform(...this.root._m);
    c.globalAlpha = 1;
    this.root.draw(c);
    c.restore();
  }

  /* Fixed 30 fps logic, decoupled from the display refresh rate.
     Driven by rAF when the page is visible and by a timer when it is not —
     rAF is suspended in a hidden tab, and Flash kept playing there. */
  run() {
    const step = 1000 / this.fps;
    let acc = 0, last = performance.now();
    const pump = () => {
      const now = performance.now();
      acc += now - last; last = now;
      if (acc > step * 5) acc = step;      // don't spiral after a stall
      let ran = false;
      while (acc >= step) { acc -= step; this.tick(); ran = true; }
      if (ran) this.render();
    };
    /* rAF drives the visible page; the timer is only a watchdog. Running both
       unconditionally meant ~90 calls a second racing over one accumulator,
       and the uneven pacing shows up as stutter on a phone. Gating the timer
       on document.hidden instead would be worse: rAF is also throttled while
       the page still calls itself visible (low power mode, some scroll and
       background states), and the game would simply stop. So: let the timer
       fire on the same interval, but only pump when rAF has actually gone
       quiet. The two can then never step on each other. */
    let lastRaf = performance.now();
    const raf = () => { requestAnimationFrame(raf); lastRaf = performance.now(); pump(); };
    requestAnimationFrame(raf);
    setInterval(() => { if (performance.now() - lastRaf > step * 2) pump(); }, step);
    this.pump = pump;
  }
}

window.SWF = { Library, Stage, MovieClip, Mat, boxHit };
