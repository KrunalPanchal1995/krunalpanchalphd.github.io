/*
 * hero/streamlines.js -- full-width Canvas2D flow field behind the home-page headline.
 *
 * Particles are advected (RK2) through an incompressible 2-D velocity field derived
 * from a stream function psi(x, y, t):  u = dpsi/dy,  v = -dpsi/dx.  psi is a uniform
 * stream + a few drifting sinusoidal modes + a gentle counter-rotating vortex pair
 * (Gaussian psi) + a soft bump around the cursor.  Each particle keeps a short ring
 * buffer of past positions drawn as a fading streak (teal / sky, a few amber).
 *
 * API:   const hero = mount(el, opts);   hero.destroy();   (also hero.pause()/resume())
 *   el   -- the .hero element; a <canvas class="hero__canvas"> inside it is used (or created).
 *   opts -- { particles, trail, speed, dprCap, reducedMotion }  (all optional)
 *
 * Colours are read from CSS variables (--hero-accent, --hero-sky, --hero-amber,
 * --hero-flow-alpha) whenever the theme changes, so a theme switch re-colours live.
 * Runs only while visible (IntersectionObserver + page visibility); under
 * prefers-reduced-motion it pre-integrates and draws a single static frame.
 */

const TAU = Math.PI * 2;

export function mount(el, opts = {}) {
  const o = Object.assign({ trail: 28, speed: 1.1, dprCap: 1.5, reducedMotion: null }, opts);
  let canvas = el.querySelector("canvas.hero__canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "hero__canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);
  }
  const ctx = canvas.getContext("2d");
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => (o.reducedMotion == null ? mq.matches : !!o.reducedMotion);

  let W = 0,
    H = 0,
    dpr = 1,
    N = 0,
    head = 0;
  let px, py, hist, age, life, kind; // particle state (typed arrays)
  let colors = { a: "#2dd4bf", b: "#60a5fa", c: "#f5a524", alpha: 0.85 };
  let t = 0,
    raf = 0,
    last = 0,
    running = false,
    visible = true,
    destroyed = false;
  const TR = o.trail;
  // pointer (in hero-local CSS px) and smoothed pointer velocity
  const ptr = { x: -1e3, y: -1e3, vx: 0, vy: 0, power: 0, lx: 0, ly: 0, lt: 0 };

  // ----- stream function field, in units of hero height (x in [0, W/H], y in [0, 1]) -----
  const modes = [
    { kx: 5.1, ky: 3.3, w: 0.35, p: 0.4, a: 0.011 },
    { kx: -3.4, ky: 6.2, w: -0.28, p: 2.1, a: 0.009 },
    { kx: 8.3, ky: -2.6, w: 0.22, p: 4.0, a: 0.006 },
    { kx: 2.2, ky: 9.5, w: 0.31, p: 5.3, a: 0.005 },
  ];
  const U = 0.11; // mean stream (heights / s), left to right
  let aspect = 2;
  const vel = { u: 0, v: 0 };
  function field(x, y, time, out) {
    let psx = 0,
      psy = U; // d psi / dx, d psi / dy  (psi0 = U*y)
    for (const m of modes) {
      const c = Math.cos(m.kx * x + m.ky * y + m.w * time + m.p) * m.a;
      psx += c * m.kx;
      psy += c * m.ky;
    }
    // gentle vortex pair drifting on slow Lissajous paths
    const cxm = aspect * (0.66 + 0.06 * Math.sin(time * 0.11));
    const cym = 0.5 + 0.05 * Math.sin(time * 0.17 + 1);
    const sep = 0.2 + 0.03 * Math.sin(time * 0.13);
    for (let s = -1; s <= 1; s += 2) {
      const dx = x - cxm,
        dy = y - (cym + s * sep);
      const sg = 0.2,
        G = -s * 0.016;
      const g = G * Math.exp(-(dx * dx + dy * dy) / (sg * sg));
      psx += (g * (-2 * dx)) / (sg * sg);
      psy += (g * (-2 * dy)) / (sg * sg);
    }
    // cursor: soft vortex bump + a push along the pointer's motion
    if (ptr.power > 0.002) {
      const dx = x - ptr.x / H,
        dy = y - ptr.y / H;
      const sg = 0.16,
        G = 0.02 * ptr.power;
      const e = Math.exp(-(dx * dx + dy * dy) / (sg * sg));
      psx += (G * e * (-2 * dx)) / (sg * sg);
      psy += (G * e * (-2 * dy)) / (sg * sg);
      out.u = psy + 0.0008 * ptr.vx * e;
      out.v = -psx + 0.0008 * ptr.vy * e;
      return;
    }
    out.u = psy;
    out.v = -psx;
  }

  const k1 = { u: 0, v: 0 },
    k2 = { u: 0, v: 0 };
  function advect(i, dt) {
    const x = px[i] / H,
      y = py[i] / H;
    field(x, y, t, k1);
    field(x + 0.5 * dt * k1.u, y + 0.5 * dt * k1.v, t + 0.5 * dt, k2);
    px[i] += k2.u * dt * H;
    py[i] += k2.v * dt * H;
  }

  function spawn(i, anywhere) {
    px[i] = anywhere || Math.random() < 0.3 ? Math.random() * W : -Math.random() * 20;
    py[i] = Math.random() * H;
    age[i] = 0;
    life[i] = 6 + Math.random() * 9; // seconds
    kind[i] = Math.random() < 0.07 ? 2 : Math.random() < 0.45 ? 1 : 0;
    if (anywhere) age[i] = Math.random() * life[i];
    for (let k = 0; k < TR; k++) {
      hist[(i * TR + k) * 2] = px[i];
      hist[(i * TR + k) * 2 + 1] = py[i];
    }
  }

  function readColors() {
    const cs = getComputedStyle(el);
    const g = (n, d) => cs.getPropertyValue(n).trim() || d;
    colors = {
      a: g("--hero-accent", "#2dd4bf"),
      b: g("--hero-sky", "#60a5fa"),
      c: g("--hero-amber", "#f5a524"),
      alpha: parseFloat(g("--hero-flow-alpha", "0.85")) || 0.85,
    };
  }

  function resize() {
    const r = el.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, o.dprCap);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    aspect = W / H;
    N = o.particles || Math.max(600, Math.min(1200, Math.round((W * H) / 900)));
    px = new Float32Array(N);
    py = new Float32Array(N);
    age = new Float32Array(N);
    life = new Float32Array(N);
    kind = new Uint8Array(N);
    hist = new Float32Array(N * TR * 2);
    head = 0;
    for (let i = 0; i < N; i++) spawn(i, true);
    if (reduced()) {
      for (let s = 0; s < 70; s++) step(1 / 30, true);
    }
    draw();
  }

  function step(dt, silent) {
    t += dt;
    head = (head + 1) % TR;
    for (let i = 0; i < N; i++) {
      advect(i, dt * o.speed);
      age[i] += dt;
      if (age[i] > life[i] || px[i] > W + 20 || px[i] < -40 || py[i] < -30 || py[i] > H + 30) {
        spawn(i, false);
      } else {
        hist[(i * TR + head) * 2] = px[i];
        hist[(i * TR + head) * 2 + 1] = py[i];
      }
    }
    // cursor influence relaxes when the pointer stops
    ptr.power *= Math.pow(0.35, dt);
    ptr.vx *= Math.pow(0.2, dt);
    ptr.vy *= Math.pow(0.2, dt);
    if (silent) return;
  }

  // Draw trails in 3 alpha tiers x 3 colours -> 9 strokes per frame.
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    const P = [0, 1, 2].map(() => [0, 1, 2].map(() => new Path2D()));
    const seg = Math.max(1, Math.floor(TR / 3));
    for (let i = 0; i < N; i++) {
      // trails grow after birth and shrink before death
      const fade = Math.min(1, age[i] / 1.2, (life[i] - age[i]) / 1.2);
      if (fade <= 0.02) continue;
      const len = Math.max(2, Math.floor((TR - 1) * fade));
      const kd = kind[i];
      for (let k = 0; k < len; k++) {
        const a = (head - k + TR) % TR,
          b = (head - k - 1 + TR) % TR;
        const x0 = hist[(i * TR + a) * 2],
          y0 = hist[(i * TR + a) * 2 + 1];
        const x1 = hist[(i * TR + b) * 2],
          y1 = hist[(i * TR + b) * 2 + 1];
        if (x0 === x1 && y0 === y1) continue;
        const tier = Math.min(2, Math.floor(k / seg)); // 0 = newest (brightest)
        const p = P[tier][kd];
        p.moveTo(x0, y0);
        p.lineTo(x1, y1);
      }
    }
    const cols = [colors.a, colors.b, colors.c];
    const alphas = [1, 0.55, 0.22];
    const widths = [1.9, 1.6, 1.3];
    for (let tier = 2; tier >= 0; tier--) {
      for (let kd = 0; kd < 3; kd++) {
        ctx.globalAlpha = alphas[tier] * colors.alpha * (kd === 2 ? 1 : 0.8);
        ctx.strokeStyle = cols[kd];
        ctx.lineWidth = widths[tier] * (kd === 2 ? 1.15 : 1);
        ctx.stroke(P[tier][kd]);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0.016));
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || destroyed || reduced() || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // ----- events -----
  const onPointer = (e) => {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    const now = performance.now();
    if (ptr.lt) {
      const dt = Math.max(8, now - ptr.lt) / 1000;
      ptr.vx = 0.6 * ptr.vx + 0.4 * ((x - ptr.lx) / dt);
      ptr.vy = 0.6 * ptr.vy + 0.4 * ((y - ptr.ly) / dt);
    }
    ptr.lx = ptr.x = x;
    ptr.ly = ptr.y = y;
    ptr.lt = now;
    ptr.power = Math.min(1, Math.hypot(ptr.vx, ptr.vy) / 600 + 0.15);
  };
  const onLeave = () => {
    ptr.lt = 0;
  };
  el.addEventListener("pointermove", onPointer, { passive: true });
  el.addEventListener("pointerleave", onLeave, { passive: true });

  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    visible ? start() : stop();
  });
  io.observe(el);
  const ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect();
    if (Math.round(r.width) !== W || Math.round(r.height) !== H) resize();
  });
  ro.observe(el);
  // theme switch: re-read colours (and repaint when static)
  const mo = new MutationObserver(() => {
    readColors();
    if (!running) draw();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-setting", "class"] });
  const onMq = () => {
    if (reduced()) {
      stop();
      draw();
    } else start();
  };
  mq.addEventListener?.("change", onMq);

  readColors();
  resize();
  start();
  el.dataset.heroState = reduced() ? "static" : "running";

  return {
    pause: stop,
    resume: start,
    get running() {
      return running;
    },
    destroy() {
      destroyed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      mq.removeEventListener?.("change", onMq);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      delete el.dataset.heroState;
    },
  };
}
