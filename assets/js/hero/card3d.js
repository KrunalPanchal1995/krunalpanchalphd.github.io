/*
 * hero/card3d.js -- three.js card: a unit grid that continuously morphs under a smooth
 * coordinate transformation.
 *
 * The grid lives in the square [-1,1]^2.  A cycle of maps
 *     identity -> shear -> rotation+stretch -> polar-like -> identity
 * is blended with smoothstep (with holds), so the grid bends, rotates and wraps into a
 * fan.  Dots follow fixed paths in the *domain* and are pushed through the current map:
 * one amber dot with a trail (the "current trajectory"), plus a few sky secondary dots.
 * Teal = grid, rose = coordinate axes.  OrbitControls with damping; slow auto-rotate that
 * stops on first interaction; zoom/pan disabled so the card never hijacks page scroll.
 *
 * API:   const hero = await mount(el, opts);   hero.destroy();
 *   el   -- the .hero element containing .hero-card__stage (+ optional .hero-card__fallback img)
 *   opts -- { forceFallback, reducedMotion, dprCap }
 * Needs an import map for "three" (the include / preview page provide it).  Imported lazily
 * by switch.js, so pages that do not show this hero never download three.js.
 *
 * Colours come from CSS variables (--hero-accent/-amber/-rose/-sky/-panel) re-read on theme
 * change.  Without WebGL (or with opts.forceFallback) the placeholder <img> is shown.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SEG = 56; // samples per grid line
const NL = 17; // grid lines per direction
const TRAIL = 70;

// ---- the maps, all defined on [-1,1]^2 and scaled to sit in roughly the same box ----
const maps = [
  (x, y) => [x, y],
  (x, y) => [x + 0.75 * y, 0.9 * y],
  (x, y) => {
    const a = 0.62,
      c = Math.cos(a),
      s = Math.sin(a),
      sx = 1.25,
      sy = 0.7;
    return [c * sx * x - s * sy * y, s * sx * x + c * sy * y];
  },
  (x, y) => {
    const th = (x + 1) * 0.5 * Math.PI * 1.55 - Math.PI * 0.2; // fan angle
    const r = 0.35 + 0.8 * (y + 1) * 0.5;
    return [r * Math.cos(th) * 1.15 - 0.3, r * Math.sin(th) * 1.15 - 0.45];
  },
];
const HOLD = 1.4,
  MORPH = 2.6,
  STAGE = HOLD + MORPH;
const smooth = (u) => u * u * (3 - 2 * u);
function blendMap(time, out) {
  // returns [from, to, s]
  const n = maps.length;
  const k = time / STAGE;
  const i = ((Math.floor(k) % n) + n) % n;
  const ph = (k - Math.floor(k)) * STAGE;
  const s = ph < HOLD ? 0 : smooth((ph - HOLD) / MORPH);
  out.a = maps[i];
  out.b = maps[(i + 1) % n];
  out.s = s;
}
const bl = { a: maps[0], b: maps[0], s: 0 };
const tmpA = [0, 0],
  tmpB = [0, 0];
function T(x, y, out, off) {
  const pa = bl.a(x, y),
    pb = bl.b(x, y),
    s = bl.s;
  out[off] = pa[0] + (pb[0] - pa[0]) * s;
  out[off + 1] = pa[1] + (pb[1] - pa[1]) * s;
}

// domain paths of the trajectory dots
const paths = [
  (t) => [0.62 * Math.cos(t * 0.9), 0.62 * Math.sin(t * 1.3 + 0.4)], // main (amber)
  (t) => [0.85 * Math.cos(t * 0.5 + 1), 0.3 * Math.sin(t * 0.8)],
  (t) => [-0.5 + 0.35 * Math.sin(t * 0.7), 0.8 * Math.cos(t * 0.45 + 2)],
  (t) => [0.2 * Math.cos(t * 1.1), -0.7 + 0.25 * Math.sin(t * 0.6 + 1)],
  (t) => [0.75 * Math.sin(t * 0.4 + 3), 0.75 * Math.cos(t * 0.55)],
];

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

export async function mount(el, opts = {}) {
  const stage = el.querySelector(".hero-card__stage");
  const fallback = el.querySelector(".hero-card__fallback");
  const showFallback = () => {
    if (fallback) fallback.hidden = false;
    el.dataset.heroState = "fallback";
    return {
      destroy() {
        if (fallback) fallback.hidden = true;
        delete el.dataset.heroState;
      },
    };
  };
  if (!stage || opts.forceFallback || el.dataset.forceFallback != null || !webglOK()) return showFallback();

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => (opts.reducedMotion == null ? mq.matches : !!opts.reducedMotion);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) {
    return showFallback();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.dprCap || 2));
  renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement;
  cv.style.touchAction = "pan-y"; // vertical page scroll still works over the card on phones
  cv.setAttribute("aria-hidden", "true");
  stage.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.up.set(0, 0, 1);
  camera.position.set(1.7, -3.0, 2.2);
  const controls = new OrbitControls(camera, cv);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = !reduced();
  controls.autoRotateSpeed = 0.7;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.set(0, -0.1, 0);
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });
  controls.addEventListener("change", () => {
    if (!running) renderer.render(scene, camera);
  });

  // ---- grid: NL lines each way, vertices re-mapped on the CPU every frame ----
  const gridDomain = [];
  const mkLines = (axisLines) => {
    const pts = [];
    for (const [fixedIsX, v] of axisLines) {
      for (let k = 0; k < SEG; k++) {
        const u0 = -1 + (2 * k) / SEG,
          u1 = -1 + (2 * (k + 1)) / SEG;
        pts.push(fixedIsX ? [v, u0] : [u0, v], fixedIsX ? [v, u1] : [u1, v]);
      }
    }
    return pts;
  };
  const gridLines = [];
  for (let i = 0; i < NL; i++) {
    const v = -1 + (2 * i) / (NL - 1);
    if (Math.abs(v) < 1e-9) continue;
    gridLines.push([true, v], [false, v]);
  }
  const gridPts = mkLines(gridLines);
  const axisPts = mkLines([
    [true, 0],
    [false, 0],
  ]);
  const makeSeg = (pts, mat) => {
    const pos = new Float32Array(pts.length * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, mat);
    m.frustumCulled = false;
    scene.add(m);
    return { pts, pos, g, m };
  };
  const matGrid = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.55 });
  const matAxes = new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 1 });
  const grid = makeSeg(gridPts, matGrid);
  const axes = makeSeg(axisPts, matAxes);
  // an outline of the unit square's image, brighter
  const edgePts = mkLines([
    [true, -1],
    [true, 1],
    [false, -1],
    [false, 1],
  ]);
  const matEdge = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.95 });
  const edge = makeSeg(edgePts, matEdge);

  const zlift = (X, Y) => 0.12 * Math.sin(1.6 * X + 0.6) * Math.cos(1.4 * Y); // slight 3-D relief
  const tmp = [0, 0];
  function updateSeg(o) {
    const p = o.pts,
      a = o.pos;
    for (let i = 0; i < p.length; i++) {
      T(p[i][0], p[i][1], tmp, 0);
      a[i * 3] = tmp[0];
      a[i * 3 + 1] = tmp[1];
      a[i * 3 + 2] = zlift(tmp[0], tmp[1]);
    }
    o.g.attributes.position.needsUpdate = true;
  }

  // ---- trajectories ----
  const trailPos = new Float32Array(TRAIL * 3),
    trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  trail.frustumCulled = false;
  scene.add(trail);
  const dotGeo = new THREE.SphereGeometry(0.055, 18, 12);
  const mainDot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xf5a524 }));
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xf5a524, transparent: true, opacity: 0.22 })
  );
  scene.add(mainDot, halo);
  const sky = paths.slice(1).map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color: 0x60a5fa }));
    scene.add(m);
    return m;
  });
  // secondary stream "tubes": short sky polylines following the other paths
  const tubeLen = 26;
  const tubes = paths.slice(1).map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tubeLen * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.55 }));
    l.frustumCulled = false;
    scene.add(l);
    return l;
  });

  // ---- colours from CSS variables ----
  const C = {};
  const cA = new THREE.Color(),
    cBg = new THREE.Color();
  function readColors() {
    const cs = getComputedStyle(el);
    const g = (n, d) => cs.getPropertyValue(n).trim() || d;
    C.teal = g("--hero-accent", "#2dd4bf");
    C.amber = g("--hero-amber", "#f5a524");
    C.rose = g("--hero-rose", "#fb7185");
    C.sky = g("--hero-sky", "#60a5fa");
    C.bg = g("--hero-panel", "#151a21");
    const light = document.documentElement.dataset.theme === "light";
    matGrid.color.set(C.teal);
    matEdge.color.set(C.teal);
    matAxes.color.set(C.rose);
    matGrid.opacity = light ? 0.7 : 0.5;
    mainDot.material.color.set(C.amber);
    halo.material.color.set(C.amber);
    sky.forEach((m) => m.material.color.set(C.sky));
    tubes.forEach((l) => l.material.color.set(C.sky));
    cA.set(C.amber);
    cBg.set(C.bg);
    for (let i = 0; i < TRAIL; i++) {
      // oldest -> newest fades panel -> amber
      const f = Math.pow(i / (TRAIL - 1), 1.4);
      trailCol[i * 3] = cBg.r + (cA.r - cBg.r) * f;
      trailCol[i * 3 + 1] = cBg.g + (cA.g - cBg.g) * f;
      trailCol[i * 3 + 2] = cBg.b + (cA.b - cBg.b) * f;
    }
    trailGeo.attributes.color.needsUpdate = true;
  }

  let t0 = reduced() ? STAGE + HOLD + 1.2 : 0; // static view: mid-shear
  let time = t0,
    running = false,
    raf = 0,
    last = 0,
    visible = true,
    destroyed = false;
  const p3 = [0, 0];
  function update(dt) {
    time += dt;
    blendMap(time, bl);
    updateSeg(grid);
    updateSeg(axes);
    updateSeg(edge);
    const dstep = 0.035;
    for (let i = 0; i < TRAIL; i++) {
      const dp = paths[0](time - (TRAIL - 1 - i) * dstep);
      T(dp[0], dp[1], p3, 0);
      trailPos.set([p3[0], p3[1], zlift(p3[0], p3[1]) + 0.01], i * 3);
    }
    trailGeo.attributes.position.needsUpdate = true;
    mainDot.position.set(trailPos[(TRAIL - 1) * 3], trailPos[(TRAIL - 1) * 3 + 1], trailPos[(TRAIL - 1) * 3 + 2]);
    halo.position.copy(mainDot.position);
    for (let j = 0; j < sky.length; j++) {
      const f = paths[j + 1];
      const arr = tubes[j].geometry.attributes.position.array;
      for (let i = 0; i < tubeLen; i++) {
        const dp = f(time * 0.9 - (tubeLen - 1 - i) * 0.05);
        T(dp[0], dp[1], p3, 0);
        arr[i * 3] = p3[0];
        arr[i * 3 + 1] = p3[1];
        arr[i * 3 + 2] = zlift(p3[0], p3[1]) + 0.01;
      }
      tubes[j].geometry.attributes.position.needsUpdate = true;
      sky[j].position.set(arr[(tubeLen - 1) * 3], arr[(tubeLen - 1) * 3 + 1], arr[(tubeLen - 1) * 3 + 2]);
    }
  }
  function renderOnce() {
    controls.update();
    renderer.render(scene, camera);
  }
  function frame(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0.016));
    last = now;
    update(dt);
    renderOnce();
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

  function resize() {
    const w = Math.max(1, stage.clientWidth),
      h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    cv.style.width = "100%";
    cv.style.height = "100%";
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 46 : 38;
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    visible ? start() : stop();
  });
  io.observe(el);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  const mo = new MutationObserver(() => {
    readColors();
    if (!running) renderOnce();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-setting", "class"] });
  const onCtxLost = (e) => {
    e.preventDefault();
    stop();
    showFallback();
  };
  cv.addEventListener("webglcontextlost", onCtxLost);

  readColors();
  update(0);
  resize();
  renderOnce();
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
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cv.removeEventListener("webglcontextlost", onCtxLost);
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      cv.remove();
      delete el.dataset.heroState;
    },
  };
}
