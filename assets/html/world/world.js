// Research world: a small drivable 3D showcase. No physics library, no network except same-origin files.
import * as THREE from "three";

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const EMBEDDED = (() => {
  try {
    return window.parent !== window;
  } catch (e) {
    return true;
  }
})();

const CATS = {
  apps: { key: "teal", label: "Apps" },
  education: { key: "rose", label: "Education" },
  combustion: { key: "amber", label: "Combustion" },
  optimization: { key: "teal", label: "Optimization" },
  uq: { key: "sky", label: "Uncertainty" },
  sciml: { key: "rose", label: "Scientific ML" },
  cfd: { key: "sky", label: "CFD" },
  experimental: { key: "amber", label: "Experimental" },
  visualization: { key: "muted", label: "Visualization" },
  software: { key: "muted", label: "Software" },
  "quantum-chemistry": { key: "muted", label: "Quantum chemistry" },
  photonics: { key: "sky", label: "Photonics" },
  electronics: { key: "amber", label: "Electronics" },
};
const catOf = (c) => CATS[c] || { key: "sky", label: c };

const PAL = {
  dark: {
    bg: "#0e1116",
    panel: "#151a21",
    border: "#29313c",
    text: "#e4eaf0",
    muted: "#93a1b0",
    teal: "#2dd4bf",
    amber: "#f5a524",
    rose: "#fb7185",
    sky: "#60a5fa",
    ground: "#131922",
    grid: "#2b3644",
    hill: "#18202a",
    hemiS: "#a9bdd2",
    hemiG: "#2b3542",
    hemi: 1.5,
    sun: 1.0,
  },
  light: {
    bg: "#f4f6f8",
    panel: "#ffffff",
    border: "#d5dce3",
    text: "#17202b",
    muted: "#5b6977",
    teal: "#0f9f8f",
    amber: "#c7780a",
    rose: "#d9465f",
    sky: "#2f7fd6",
    ground: "#e6ebf0",
    grid: "#bcc6d0",
    hill: "#dce2e8",
    hemiS: "#ffffff",
    hemiG: "#b7c2cd",
    hemi: 1.7,
    sun: 1.0,
  },
};

// ---------------------------------------------------------------- theme
let theme = "dark";
let P = PAL.dark;
const themed = []; // callbacks (P) => void

function parentTheme() {
  try {
    if (window.parent !== window) {
      const t = window.parent.document.documentElement.dataset.theme;
      if (t === "light" || t === "dark") return t;
    }
  } catch (e) {
    /* cross-origin */
  }
  return null;
}
function pickTheme() {
  const q = qs.get("theme");
  if (q === "light" || q === "dark") return q;
  return parentTheme() || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}
function setTheme(t) {
  theme = t;
  P = PAL[t];
  document.documentElement.dataset.theme = t;
  themed.forEach((f) => f(P));
}
try {
  if (window.parent !== window) {
    new MutationObserver(() => setTheme(pickTheme())).observe(window.parent.document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
} catch (e) {
  /* ignore */
}
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => setTheme(pickTheme()));
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "theme" && PAL[e.data.theme]) setTheme(e.data.theme);
});
setTheme(pickTheme());

// ---------------------------------------------------------------- data + list (works without WebGL)
const NAV = $("#items");
let projects = [];
function fitList() {
  NAV.textContent = "";
  for (const p of projects) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = p.url;
    a.target = "_top";
    const c = catOf(p.category);
    a.style.setProperty("--cc", `var(--${c.key === "muted" ? "text" : c.key})`);
    if (p.img) {
      const im = document.createElement("img");
      im.src = "../../../" + p.img;
      im.alt = "";
      im.loading = "lazy";
      im.width = 400;
      im.height = 250;
      im.onerror = () => im.remove();
      a.append(im);
    }
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = p.title;
    const k = document.createElement("span");
    k.className = "c";
    k.textContent = c.label;
    a.append(t, k);
    li.append(a);
    NAV.append(li);
  }
}
const list = $("#list");
function openList(open) {
  list.classList.toggle("open", open);
  if (open) {
    list.scrollTop = 0;
    list.focus();
  } else {
    $("#skip").focus({ preventScroll: true });
  }
}
$("#skip").addEventListener("click", (e) => {
  e.preventDefault();
  openList(true);
});
$("#back").addEventListener("click", () => openList(false));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && list.classList.contains("open")) openList(false);
});

function say(text) {
  const m = $("#msg");
  m.textContent = text;
  m.hidden = !text;
}
function navigate(url) {
  try {
    window.top.location.href = url;
  } catch (e) {
    window.location.href = url;
  }
}
function notifyReady(extra) {
  if (EMBEDDED) {
    try {
      window.parent.postMessage({ source: "research-world", type: "ready", ...extra }, "*");
    } catch (e) {
      /* ignore */
    }
  }
}

function hasWebGL() {
  if (qs.get("nowebgl") === "1") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

async function main() {
  try {
    const r = await fetch("projects.json");
    projects = await r.json();
    fitList();
  } catch (e) {
    /* static list stays */
  }

  if (!hasWebGL()) return fallback("WebGL is not available in this browser, so here is the plain project list instead.");
  try {
    start();
  } catch (err) {
    console.warn("3D init failed", err);
    fallback("The 3D world could not start here, so here is the plain project list instead.");
  }
}
function fallback(msg) {
  document.body.classList.add("no-gl");
  list.classList.add("open");
  $("#sub").textContent = msg;
  window.__world = { getState: () => ({ webgl: false, theme }) };
  notifyReady({ webgl: false });
}

// ---------------------------------------------------------------- the world
function start() {
  const canvas = $("#gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 70, 300);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(40, 80, 25);
  scene.add(hemi, sun);

  const col = (k) => new THREE.Color(P[k]);
  function mat(key, opts = {}) {
    const m = new THREE.MeshLambertMaterial({ flatShading: true, ...opts });
    themed.push(() => m.color.set(P[key]));
    m.color.set(P[key]);
    return m;
  }
  function basic(key, opts = {}) {
    const m = new THREE.MeshBasicMaterial(opts);
    themed.push(() => m.color.set(P[key]));
    m.color.set(P[key]);
    return m;
  }
  themed.push(() => {
    scene.background = col("bg");
    scene.fog.color.copy(col("bg"));
    hemi.color.set(P.hemiS);
    hemi.groundColor.set(P.hemiG);
    hemi.intensity = P.hemi;
    sun.intensity = P.sun;
  });

  // ---- ground with faint blueprint grid + calm horizon
  const R_WORLD = 84;
  const gridTex = new THREE.CanvasTexture(document.createElement("canvas"));
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(70, 70);
  gridTex.anisotropy = 8;
  const gctx = gridTex.image.getContext("2d");
  gridTex.image.width = gridTex.image.height = 256;
  themed.push(() => {
    gctx.fillStyle = P.ground;
    gctx.fillRect(0, 0, 256, 256);
    gctx.fillStyle = P.grid;
    gctx.globalAlpha = 0.5;
    for (let i = 1; i < 4; i++) {
      gctx.fillRect(i * 64 - 0.5, 0, 1, 256);
      gctx.fillRect(0, i * 64 - 0.5, 256, 1);
    }
    gctx.globalAlpha = 1;
    gctx.fillRect(0, 0, 2, 256);
    gctx.fillRect(0, 0, 256, 2);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    gridTex.needsUpdate = true;
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(320, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gridTex }));
  scene.add(ground);
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(R_WORLD - 0.2, R_WORLD + 0.2, 128).rotateX(-Math.PI / 2),
    basic("muted", { transparent: true, opacity: 0.35 })
  );
  edge.position.y = 0.03;
  scene.add(edge);

  const hillMat = mat("hill");
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2,
      h = 14 + ((i * 37) % 17) * 1.6,
      r = 20 + ((i * 53) % 13) * 2.2;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5, 1), hillMat);
    hill.position.set(Math.cos(a) * 200, h / 2 - 1, Math.sin(a) * 200);
    hill.rotation.y = i;
    scene.add(hill);
  }

  // ---- obstacles & anchors (to avoid when scattering)
  const colliders = [];
  const anchors = [];
  const circle = (x, z, r) => {
    colliders.push({ x, z, r });
  };

  // ---- sprites (canvas text)
  function label(text, { w = 7, px = 44, key = "text", big = false, accent = null } = {}) {
    const cv = document.createElement("canvas");
    cv.width = big ? 1024 : 768;
    cv.height = big ? 160 : 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ctx = cv.getContext("2d");
    const mt = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      let t = text;
      const font = `600 ${px}px "Public Sans", system-ui, sans-serif`;
      ctx.font = font;
      const maxW = cv.width - 90;
      while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2);
      if (t !== text) t = t.trimEnd() + "…";
      const tw = ctx.measureText(t).width,
        bw = tw + 60,
        bh = cv.height - 24,
        x = (cv.width - bw) / 2;
      ctx.fillStyle = P.panel;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(x, 12, bw, bh, 22);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent ? P[accent] : P.border;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = P[key];
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(t, cv.width / 2, cv.height / 2 + 2);
      tex.needsUpdate = true;
    };
    themed.push(draw);
    draw();
    const s = new THREE.Sprite(mt);
    s.scale.set(w, (w * cv.height) / cv.width, 1);
    return s;
  }

  // ---- stations grouped by category into districts
  const catsInUse = [...new Set(projects.map((p) => p.category))];
  const ordered = [...Object.keys(CATS).filter((c) => catsInUse.includes(c)), ...catsInUse.filter((c) => !CATS[c])];
  const R_D = ordered.length > 6 ? 51 : 46,
    SP = 11.5,
    RING_D = 6.5,
    TRIG = 3.1;
  const stations = [];
  stations.districts = [];
  const loader = new THREE.TextureLoader();
  const postGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.6, 8);
  const frameGeo = new THREE.BoxGeometry(5.4, 3.5, 0.3);
  const faceGeo = new THREE.PlaneGeometry(5, 3.1);
  const ringGeo = new THREE.TorusGeometry(2.6, 0.12, 8, 48).rotateX(Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2);
  const postMat = mat("muted");

  ordered.forEach((cat, ci) => {
    const items = projects.filter((p) => p.category === cat);
    const ang = (((ci / ordered.length) * 360 + 20) * Math.PI) / 180;
    const cx = Math.cos(ang) * R_D,
      cz = Math.sin(ang) * R_D;
    const tx = -Math.sin(ang),
      tz = Math.cos(ang);
    const ck = catOf(cat).key;
    stations.districts.push({ x: cx * 0.93, z: cz * 0.93, ck, n: items.length });

    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(10 + items.length * 3.2, 48).rotateX(-Math.PI / 2),
      basic(ck, { transparent: true, opacity: 0.09, depthWrite: false })
    );
    patch.position.set(cx * 0.93, 0.02, cz * 0.93);
    scene.add(patch);
    const dl = label(catOf(cat).label.toUpperCase(), { w: 15, px: 70, key: ck, big: true, accent: ck });
    dl.position.set(cx * 1.04, 11.5, cz * 1.04);
    scene.add(dl);

    items.forEach((p, k) => {
      const off = (k - (items.length - 1) / 2) * SP;
      const x = cx + tx * off,
        z = cz + tz * off;
      const dx = -x,
        dz = -z,
        dl2 = Math.hypot(dx, dz),
        ux = dx / dl2,
        uz = dz / dl2;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(ux, uz);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(0, 1.8, -0.45);
      g.add(post);
      const frame = new THREE.Mesh(frameGeo, mat(ck));
      frame.position.y = 3.75;
      g.add(frame);
      const faceMat = new THREE.MeshBasicMaterial({});
      const state = { loaded: false };
      themed.push(() => {
        if (!state.loaded) faceMat.color.set(P[ck]).multiplyScalar(0.55);
      });
      faceMat.color.set(P[ck]).multiplyScalar(0.55);
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(0, 3.75, 0.16);
      g.add(face);
      if (!p.img) {
        const pc = document.createElement("canvas");
        pc.width = 320;
        pc.height = 200;
        const ptex = new THREE.CanvasTexture(pc);
        ptex.colorSpace = THREE.SRGBColorSpace;
        const pctx = pc.getContext("2d");
        themed.push(() => {
          pctx.fillStyle = P.panel;
          pctx.fillRect(0, 0, 320, 200);
          pctx.strokeStyle = P[ck];
          pctx.globalAlpha = 0.35;
          pctx.lineWidth = 1;
          for (let i = 0; i <= 320; i += 20) {
            pctx.beginPath();
            pctx.moveTo(i + 0.5, 0);
            pctx.lineTo(i + 0.5, 200);
            pctx.stroke();
          }
          for (let i = 0; i <= 200; i += 20) {
            pctx.beginPath();
            pctx.moveTo(0, i + 0.5);
            pctx.lineTo(320, i + 0.5);
            pctx.stroke();
          }
          pctx.globalAlpha = 1;
          pctx.lineWidth = 3;
          pctx.strokeRect(14, 14, 292, 172);
          ptex.needsUpdate = true;
        });
        pctx.fillStyle = P.panel;
        pctx.fillRect(0, 0, 320, 200);
        faceMat.map = ptex;
        faceMat.color.set(0xffffff);
        state.loaded = true;
      } else
        loader.load(
          "../../../" + p.img,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            const ia = tex.image.width / tex.image.height,
              pa = 5 / 3.1; // cover-fit
            if (ia > pa) {
              tex.repeat.x = pa / ia;
              tex.offset.x = (1 - tex.repeat.x) / 2;
            } else {
              tex.repeat.y = ia / pa;
              tex.offset.y = (1 - tex.repeat.y) / 2;
            }
            faceMat.map = tex;
            faceMat.color.set(0xffffff);
            faceMat.needsUpdate = true;
            state.loaded = true;
          },
          undefined,
          () => {
            /* keep flat plate */
          }
        );
      const t = label(p.title, { w: 6.4, px: 40, accent: null });
      t.position.y = 6.3;
      g.add(t);
      scene.add(g);

      const ringMat = basic(ck, { transparent: true, opacity: 0.85 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const disc = new THREE.Mesh(discGeo, basic(ck, { transparent: true, opacity: 0.14, depthWrite: false }));
      const rx = x + ux * RING_D,
        rz = z + uz * RING_D;
      ring.position.set(rx, 0.15, rz);
      disc.position.set(rx, 0.04, rz);
      scene.add(ring, disc);
      circle(x, z, 0.9);
      anchors.push([x, z, 9]);
      stations.push({ ...p, x: rx, z: rz, px: x, pz: z, ring, disc, ringMat, ck, label: t });
    });
  });

  // ---- set pieces
  const polar = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
  const tmp = new THREE.Object3D();

  // eigenvalue ring
  const [ex, ez] = polar(50, 22);
  anchors.push([ex, ez, 9]);
  const NE = 28;
  const eig = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshLambertMaterial({}), NE);
  const eigG = new THREE.Group();
  eigG.position.set(ex, 0, ez);
  eigG.add(eig);
  scene.add(eigG);
  const eigC = new THREE.Color();
  themed.push(() => {
    for (let i = 0; i < NE; i++) eig.setColorAt(i, eigC.copy(col("teal")).lerp(col("rose"), i / (NE - 1)));
    eig.instanceColor.needsUpdate = true;
  });
  const eigUpdate = (t) => {
    for (let i = 0; i < NE; i++) {
      const a = (i / NE) * Math.PI * 2,
        s = 0.6 + 1.2 * Math.pow(i / (NE - 1), 2);
      tmp.position.set(Math.cos(a) * 6.5, 1.3 + 2.4 * (i / (NE - 1)) + Math.sin(t * 1.3 + i) * 0.12, Math.sin(a) * 6.5);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      eig.setMatrixAt(i, tmp.matrix);
    }
    eig.instanceMatrix.needsUpdate = true;
  };
  eigUpdate(0);
  const eigL = label("λ spectrum", { w: 5, px: 40, key: "teal" });
  eigL.position.set(ex, 5.8, ez);
  scene.add(eigL);

  // stiff-ODE ramps: exponentially growing steps
  const [rx0, rz0] = polar(170, 22);
  anchors.push([rx0, rz0, 9]);
  const ramps = new THREE.Group();
  ramps.position.set(rx0, 0, rz0);
  ramps.rotation.y = 0.6;
  scene.add(ramps);
  const rampMats = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.4 * Math.pow(1.5, i);
    const m = new THREE.MeshLambertMaterial({ flatShading: true });
    themed.push(() => m.color.set(P.sky).lerp(col("rose"), i / 5));
    m.color.set(P.sky).lerp(col("rose"), i / 5);
    rampMats.push(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, 2.1), m);
    b.position.set(0, h / 2, (i - 2.5) * 2.2);
    ramps.add(b);
  }
  for (let i = 0; i < 6; i += 2) {
    const lz = (i - 2.5 + 0.5) * 2.2;
    circle(rx0 + Math.sin(0.6) * lz, rz0 + Math.cos(0.6) * lz, 3.4);
  }
  const rl = label("stiff-ODE ramps", { w: 6, px: 40, key: "sky" });
  rl.position.set(rx0, 6.2, rz0);
  scene.add(rl);

  // burner with flame
  const [fx, fz] = polar(290, 22);
  anchors.push([fx, fz, 9]);
  const burner = new THREE.Group();
  burner.position.set(fx, 0, fz);
  scene.add(burner);
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 10), mat("muted"));
  bb.position.y = 0.35;
  burner.add(bb);
  const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 10), mat("text"));
  bn.position.y = 1.2;
  burner.add(bn);
  const flameO = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.4, 8), basic("amber", { transparent: true, opacity: 0.85 }));
  const flameI = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 8), basic("sky", { transparent: true, opacity: 0.95 }));
  flameO.position.y = 3.2;
  flameI.position.y = 2.65;
  burner.add(flameO, flameI);
  circle(fx, fz, 1.6);
  const fl = label("burner", { w: 3.4, px: 40, key: "amber" });
  fl.position.set(fx, 5.8, fz);
  scene.add(fl);

  // scattered "data points"
  const NP = 70,
    pts = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshLambertMaterial({ flatShading: true }), NP);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ptKeys = ["teal", "sky", "muted"],
    ptSel = [];
  for (let i = 0, n = 0; n < NP && i < 2000; i++) {
    const a = rnd() * 6.283,
      r = 14 + rnd() * 66,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (anchors.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar + 2)) continue;
    const s = 0.5 + rnd() * 1.1;
    tmp.position.set(x, 0.5 * s, z);
    tmp.rotation.set(0, rnd() * 3, 0);
    tmp.scale.set(s, s * (1 + rnd()), s);
    tmp.updateMatrix();
    pts.setMatrixAt(n, tmp.matrix);
    ptSel.push(ptKeys[n % 3]);
    n++;
  }
  tmp.rotation.set(0, 0, 0);
  themed.push(() => {
    ptSel.forEach((k, i) => pts.setColorAt(i, col(k)));
    pts.instanceColor.needsUpdate = true;
  });
  pts.count = ptSel.length;
  scene.add(pts);

  // ---- flow field ribbons (potential flow past a cylinder; shader animates pulses)
  {
    const pos = [],
      uu = [],
      sd = [],
      idx = [];
    const A = 16,
      N = 34;
    for (let i = 0; i < N; i++) {
      let x = -100,
        z = (i % 2 ? 1 : -1) * (4 + Math.floor(i / 2) * 2.1);
      const h = 8 + ((i * 7) % 11) * 1.1,
        start = pos.length / 3,
        seedv = (i % 7) / 6,
        pts2 = [];
      for (let s = 0; s < 260 && x < 100; s++) {
        const r2 = x * x + z * z,
          r4 = r2 * r2 + 1e-6;
        let u = 1 - (A * A * (x * x - z * z)) / r4,
          v = (-2 * A * A * x * z) / r4;
        const m = Math.hypot(u, v) || 1;
        u /= m;
        v /= m;
        x += u * 0.8;
        z += v * 0.8;
        pts2.push([x, h + Math.sin(x * 0.07 + i) * 0.9, z]);
      }
      pts2.forEach((p, j) => {
        const q = pts2[Math.min(j + 1, pts2.length - 1)],
          pq = pts2[Math.max(j - 1, 0)];
        let tx = q[0] - pq[0],
          tz = q[2] - pq[2];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const bx = -tz * 0.7,
          bz = tx * 0.7,
          w = 0.15,
          u0 = j / (pts2.length - 1);
        pos.push(p[0] + bx * w, p[1] + 0.7 * w, p[2] + bz * w, p[0] - bx * w, p[1] - 0.7 * w, p[2] - bz * w);
        uu.push(u0, u0);
        sd.push(seedv, seedv);
        if (j) {
          const a = start + (j - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aU", new THREE.Float32BufferAttribute(uu, 1));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    const rm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uO: { value: 0.6 } },
      vertexShader:
        "attribute float aU;attribute float aS;varying float vU;varying float vS;void main(){vU=aU;vS=aS;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "uniform float uT;uniform vec3 uA;uniform vec3 uB;uniform float uO;varying float vU;varying float vS;void main(){float p=pow(fract(vU*2.0-uT*0.1+vS*3.7),2.5);float e=smoothstep(0.0,0.1,vU)*smoothstep(1.0,0.9,vU);gl_FragColor=vec4(mix(uA,uB,vS),(0.14+0.86*p)*e*uO);\n#include <colorspace_fragment>\n}",
    });
    themed.push(() => {
      rm.uniforms.uA.value.copy(col("teal"));
      rm.uniforms.uB.value.copy(col("sky"));
      rm.uniforms.uO.value = theme === "light" ? 0.55 : 0.4;
    });
    const ribbons = new THREE.Mesh(g, rm);
    ribbons.frustumCulled = false;
    scene.add(ribbons);
    scene.userData.ribbons = rm;
  }

  // ---- vehicle
  const car = new THREE.Group();
  scene.add(car);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 3.3), mat("amber"));
  body.position.y = 0.7;
  car.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.5), mat("teal"));
  cab.position.set(0, 1.2, -0.3);
  car.add(cab);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.6), mat("text"));
  nose.position.set(0, 0.55, 1.75);
  car.add(nose);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lampM);
    l.position.set(sx, 0.8, 1.66);
    car.add(l);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.36, 14).rotateZ(Math.PI / 2);
  const wheelMat = mat("text");
  const wheels = [];
  for (const [wx, wz] of [
    [-1.05, 1.05],
    [1.05, 1.05],
    [-1.05, -1.05],
    [1.05, -1.05],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.45, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(w);
    car.add(pivot);
    wheels.push({ pivot, w, front: wz > 0 });
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadow.scale.set(1, 1, 1.6);
  shadow.position.y = 0.04;
  car.add(shadow);

  // ---- state / physics (arcade, hand-written)
  const gentle = REDUCED ? 0.65 : 1;
  const V = { ACC: 15 * gentle, BRAKE: 28, DRAG: 0.35, ROLL: 3.5, MAX: 17 * gentle, REV: 6, STEER: 1.9 * (REDUCED ? 0.8 : 1) };
  const S = { x: 0, z: -4, h: 0, v: 0, steer: 0, near: null, roll: 0 };
  const input = { t: 0, s: 0 };
  const keys = new Set();
  const stick = { x: 0, y: 0 };

  function step(dt) {
    const { gx, gy } = pad();
    const kt = (keys.has("up") ? 1 : 0) - (keys.has("down") ? 1 : 0),
      ks = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    const lock = list.classList.contains("open");
    const pick = (a, b, c) => [a, b, c].reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    input.t = lock ? 0 : pick(kt, gy, stick.y);
    input.s = lock ? 0 : pick(ks, gx, stick.x);
    if (tour.on) {
      if (lock || input.t || input.s) stopTour();
      else {
        const a = tourDrive(dt);
        input.t = a.t;
        input.s = a.s;
      }
    }

    const th = input.t;
    if (th !== 0) S.v += th * (Math.sign(th) !== Math.sign(S.v) && S.v !== 0 ? V.BRAKE : V.ACC) * dt;
    else {
      const r = V.ROLL * dt;
      S.v = Math.abs(S.v) < r ? 0 : S.v - Math.sign(S.v) * r;
    }
    S.v -= S.v * V.DRAG * dt;
    S.v = clamp(S.v, -V.REV, V.MAX);
    S.steer += (input.s - S.steer) * Math.min(1, dt * 9);
    const grip = clamp(Math.abs(S.v) / 3.2, 0, 1) / (1 + Math.abs(S.v) / 20);
    S.h -= S.steer * V.STEER * grip * Math.sign(S.v || 1) * dt * (S.v < 0 ? 1 : 1) * 1.15;
    S.x += Math.sin(S.h) * S.v * dt;
    S.z += Math.cos(S.h) * S.v * dt;
    S.roll += (S.v * dt) / 0.45;

    // soft boundary
    const r = Math.hypot(S.x, S.z),
      SOFT = R_WORLD - 6;
    if (r > SOFT) {
      const k = (r - SOFT) / 6,
        nx = S.x / r,
        nz = S.z / r;
      S.x -= nx * k * 10 * dt;
      S.z -= nz * k * 10 * dt;
      S.v *= 1 - Math.min(0.9, k * 1.5 * dt * 3);
      if (r > R_WORLD + 4) {
        S.x = nx * (R_WORLD + 4);
        S.z = nz * (R_WORLD + 4);
      }
      say("Edge of the world. Turn around.");
    } else if ($("#msg").textContent.startsWith("Edge")) say("");
    for (const c of colliders) {
      const dx = S.x - c.x,
        dz = S.z - c.z,
        d = Math.hypot(dx, dz),
        min = c.r + 1.2;
      if (d < min && d > 1e-4) {
        S.x = c.x + (dx / d) * min;
        S.z = c.z + (dz / d) * min;
        S.v *= Math.max(0, 1 - 7 * dt);
      }
    }

    // nearest station
    let best = null,
      bd = TRIG;
    for (const s of stations) {
      const d = Math.hypot(S.x - s.x, S.z - s.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best !== S.near) {
      S.near = best;
      showPrompt(best);
    }
  }

  const prompt = $("#prompt");
  function showPrompt(s) {
    prompt.hidden = !s;
    if (s) {
      $("#ptitle").textContent = s.title;
      $("#pchip").style.background = `var(--${s.ck})`;
      $("#pcat").textContent = catOf(s.category).label;
      const idx = stations.indexOf(s) + 1;
      $("#pnum").textContent = `${String(idx).padStart(2, "0")} / ${String(stations.length).padStart(2, "0")}`;
      $("#studio").hidden = !s.studio;
      $("#app").hidden = !s.app;
    }
  }
  const openNear = () => {
    if (S.near && !list.classList.contains("open")) navigate(S.near.url);
  };
  const studioNear = () => {
    if (S.near && S.near.studio && !list.classList.contains("open")) navigate(S.near.studio);
  };
  $("#open").addEventListener("click", openNear);
  $("#studio").addEventListener("click", studioNear);
  const appNear = () => {
    if (S.near && S.near.app && !list.classList.contains("open")) navigate(S.near.app);
  };
  $("#app").addEventListener("click", appNear);

  // ---- input
  const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  addEventListener("keydown", (e) => {
    const tg = e.target && e.target.tagName,
      interactive = tg === "A" || tg === "BUTTON";
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "KeyT" && !interactive && !e.repeat) {
      tour.on ? stopTour() : startTour();
      return;
    }
    if (e.code === "Escape" && tour.on) {
      stopTour();
      return;
    }
    // any other key hands manual control back (Tab / modifiers excepted)
    if (tour.on && !/^(Tab|Shift|Control|Alt|Meta|CapsLock)/.test(e.code) && !(interactive && (e.code === "Enter" || e.code === "Space"))) stopTour();
    if (e.code === "KeyS" && S.near && S.near.studio && Math.abs(S.v) < 0.8 && !list.classList.contains("open")) {
      e.preventDefault();
      studioNear();
      return;
    }
    const k = KEYMAP[e.code];
    if (k && !e.ctrlKey && !e.metaKey && !e.altKey) {
      keys.add(k);
      if (!interactive || e.code.startsWith("Arrow")) {
        if (!list.classList.contains("open")) e.preventDefault();
      }
      return;
    }
    if ((e.code === "Enter" || e.code === "Space") && !interactive && S.near) {
      e.preventDefault();
      openNear();
    } else if (e.code === "KeyR" && !interactive) reset();
  });
  addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  addEventListener("blur", () => keys.clear());

  let padPrev = false;
  function pad() {
    let gx = 0,
      gy = 0;
    try {
      const g = navigator.getGamepads && [...navigator.getGamepads()].find(Boolean);
      if (g) {
        gx = Math.abs(g.axes[0]) > 0.15 ? g.axes[0] : 0;
        gy = Math.abs(g.axes[1]) > 0.15 ? -g.axes[1] : 0;
        if (g.buttons[7] && g.buttons[7].value > 0.1) gy = Math.max(gy, g.buttons[7].value);
        if (g.buttons[6] && g.buttons[6].value > 0.1) gy = Math.min(gy, -g.buttons[6].value);
        const a = !!(g.buttons[0] && g.buttons[0].pressed);
        if (a && !padPrev) openNear();
        padPrev = a;
      }
    } catch (e) {
      /* ignore */
    }
    return { gx, gy };
  }

  // touch joystick
  const touchUI = qs.get("touch") === "1" || matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (touchUI) {
    document.body.classList.add("touch-ui");
    $("#touch").hidden = false;
    const st = $("#stick"),
      kn = $("#knob");
    let pid = null;
    const move = (e) => {
      const b = st.getBoundingClientRect(),
        R = b.width / 2 - 8;
      let dx = e.clientX - (b.left + b.width / 2),
        dy = e.clientY - (b.top + b.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > R) {
        dx *= R / m;
        dy *= R / m;
      }
      kn.style.transform = `translate(${dx}px,${dy}px)`;
      const nx = dx / R,
        ny = -dy / R;
      stick.x = Math.abs(nx) < 0.12 ? 0 : nx;
      stick.y = Math.abs(ny) < 0.12 ? 0 : ny;
    };
    st.addEventListener("pointerdown", (e) => {
      if (tour.on) stopTour();
      pid = e.pointerId;
      st.setPointerCapture(pid);
      move(e);
      e.preventDefault();
    });
    st.addEventListener("pointermove", (e) => {
      if (e.pointerId === pid) move(e);
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      stick.x = stick.y = 0;
      kn.style.transform = "";
    };
    st.addEventListener("pointerup", end);
    st.addEventListener("pointercancel", end);
  }

  function reset() {
    if (tour.on) stopTour();
    Object.assign(S, { x: 0, z: -4, h: 0, v: 0, steer: 0 });
    snapCam = true;
  }
  $("#reset").addEventListener("click", () => {
    reset();
    $("#reset").blur();
  });

  // ---- autopilot tour: path follower through every station in district order
  const tour = { on: false, path: [], i: 0, dwell: 0, stuck: 0, best: 1e9, visited: new Set(), scale: { dwell: 1, speed: 1 }, done: false };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const tourBtn = $("#tour"),
    tourbar = $("#tourbar");
  function buildPath() {
    const pts = [];
    const push = (x, z, st = null, via = false) => pts.push({ x, z, st, via });
    let prev = { x: S.x, z: S.z };
    stations.forEach((s, k) => {
      const ux = (s.x - s.px) / RING_D,
        uz = (s.z - s.pz) / RING_D; // unit vector from the post towards the ring and the world centre
      const ax = s.x + ux * 9,
        az = s.z + uz * 9;
      // go round set pieces / posts that sit on the straight line from the previous point
      const cur = { x: ax, z: az };
      for (const c of colliders) {
        const vx = cur.x - prev.x,
          vz = cur.z - prev.z,
          L2 = vx * vx + vz * vz || 1;
        const t = clamp(((c.x - prev.x) * vx + (c.z - prev.z) * vz) / L2, 0, 1);
        const px = prev.x + vx * t,
          pz = prev.z + vz * t;
        const d = Math.hypot(c.x - px, c.z - pz),
          need = c.r + 4.5;
        if (d < need && t > 0.02 && t < 0.98) {
          const L = Math.sqrt(L2),
            nx = -vz / L,
            nz = vx / L,
            side = (c.x - px) * nx + (c.z - pz) * nz > 0 ? -1 : 1;
          push(c.x + nx * side * (need + 1.5), c.z + nz * side * (need + 1.5), null, true);
        }
      }
      push(ax, az, null, true);
      push(s.x, s.z, s);
      prev = { x: s.x, z: s.z };
    });
    return pts;
  }
  function startTour() {
    if (tour.on) return;
    if (list.classList.contains("open")) openList(false);
    tour.path = buildPath();
    tour.i = 0;
    tour.dwell = 0;
    tour.stuck = 0;
    tour.best = 1e9;
    tour.done = false;
    tour.visited.clear();
    tour.on = true;
    tourBtn.textContent = "Stop tour";
    tourBtn.setAttribute("aria-pressed", "true");
    tourbar.hidden = false;
    document.body.classList.add("touring");
    updTourBar();
    say("");
  }
  function stopTour() {
    if (!tour.on) return;
    tour.on = false;
    tourBtn.textContent = "Tour";
    tourBtn.setAttribute("aria-pressed", "false");
    tourbar.hidden = true;
    document.body.classList.remove("touring");
    keys.clear();
    stick.x = stick.y = 0;
  }
  function updTourBar() {
    const nx = tour.path.slice(tour.i).find((w) => w.st);
    const n = nx ? stations.indexOf(nx.st) + 1 : stations.length;
    const txt = `Tour ${String(n).padStart(2, "0")} / ${String(stations.length).padStart(2, "0")}`;
    if ($("#tourn").textContent !== txt) $("#tourn").textContent = txt;
  }
  const tourWp = () => tour.path[tour.i] || null;
  function tourDrive(dt) {
    const w = tourWp();
    updTourBar();
    if (!w) {
      tour.done = true;
      stopTour();
      say("Tour complete. You have the wheel.");
      setTimeout(() => $("#msg").textContent.startsWith("Tour complete") && say(""), 4000);
      return { t: 0, s: 0 };
    }
    const dx = w.x - S.x,
      dz = w.z - S.z,
      dist = Math.hypot(dx, dz);
    const err = wrapA(Math.atan2(dx, dz) - S.h);
    const vmax = V.MAX * 0.82 * tour.scale.speed;
    let vt = vmax * clamp(1 - Math.abs(err) / 1.1, 0.22, 1);
    const stop = !w.via;
    if (stop) vt = Math.min(vt, Math.sqrt(2 * 7 * Math.max(0, dist - 0.8)) + 0.4);
    else vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, dist)) + vmax * 0.45);
    // arrival
    if (stop) {
      if (dist < 1.9 && Math.abs(S.v) < 2.4) {
        tour.dwell += dt;
        if (tour.dwell === dt) {
          tour.visited.add(w.st.slug);
          updTourBar();
        }
        if (tour.dwell >= 2.5 * tour.scale.dwell) {
          tour.i++;
          tour.dwell = 0;
          tour.stuck = 0;
          tour.best = 1e9;
        }
        return { t: clamp(-S.v * 0.8, -1, 0.2), s: 0 };
      }
    } else if (dist < 4.5) {
      tour.i++;
      tour.stuck = 0;
      tour.best = 1e9;
      return { t: 0.5, s: 0 };
    }
    // stuck guard: no progress for 5 s -> skip this waypoint
    if (dist < tour.best - 1) {
      tour.best = dist;
      tour.stuck = 0;
    } else if ((tour.stuck += dt) > 5) {
      tour.i++;
      tour.stuck = 0;
      tour.best = 1e9;
    }
    const ramp = clamp((vt - S.v) * 0.9, -1, 1);
    return { t: ramp, s: clamp(-err * 2.4, -1, 1) };
  }
  tourBtn.addEventListener("click", () => (tour.on ? stopTour() : startTour()));
  $("#tourstop").addEventListener("click", stopTour);

  // ---- minimap
  const mini = $("#mini"),
    mctx = mini.getContext("2d"),
    mapwrap = $("#mapwrap");
  const MS = 140;
  let miniDraws = 0,
    miniCollapsed = matchMedia("(max-width: 520px)").matches;
  mapwrap.hidden = false;
  function applyMapState() {
    mapwrap.classList.toggle("collapsed", miniCollapsed);
    $("#maptoggle").setAttribute("aria-expanded", String(!miniCollapsed));
  }
  applyMapState();
  $("#maptoggle").addEventListener("click", () => {
    miniCollapsed = !miniCollapsed;
    applyMapState();
  });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  mini.width = mini.height = MS * dpr;
  const mk = (x, z) => [MS / 2 + (x / (R_WORLD + 6)) * (MS / 2 - 4), MS / 2 + (z / (R_WORLD + 6)) * (MS / 2 - 4)];
  function drawMini() {
    if (miniCollapsed) return;
    miniDraws++;
    const c = mctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, MS, MS);
    c.fillStyle = P.panel;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(MS / 2, MS / 2, MS / 2 - 1, 0, 7);
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = P.border;
    c.lineWidth = 1.5;
    c.stroke();
    for (const d of stations.districts) {
      const [x, z] = mk(d.x, d.z);
      c.fillStyle = P[d.ck === "muted" ? "muted" : d.ck];
      c.globalAlpha = 0.2;
      c.beginPath();
      c.arc(x, z, 8 + d.n * 2, 0, 7);
      c.fill();
    }
    c.globalAlpha = 1;
    const nxt = tour.on ? tourWp() : null;
    for (const s of stations) {
      const [x, z] = mk(s.x, s.z);
      c.fillStyle = P[s.ck];
      c.beginPath();
      c.arc(x, z, tour.visited.has(s.slug) ? 3.6 : 2.6, 0, 7);
      c.fill();
      if (s === S.near) {
        c.strokeStyle = P.text;
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(x, z, 5.5, 0, 7);
        c.stroke();
      }
    }
    if (nxt) {
      const [x, z] = mk(nxt.x, nxt.z);
      c.strokeStyle = P.amber;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x - 5, z);
      c.lineTo(x + 5, z);
      c.moveTo(x, z - 5);
      c.lineTo(x, z + 5);
      c.stroke();
    }
    const [vx, vz] = mk(S.x, S.z);
    c.save();
    c.translate(vx, vz);
    c.rotate(Math.PI - S.h);
    c.fillStyle = P.amber;
    c.strokeStyle = P.bg;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4.2, 4.5);
    c.lineTo(-4.2, 4.5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  // ---- camera
  const camPos = new THREE.Vector3(),
    camLook = new THREE.Vector3();
  let snapCam = true,
    baseFov = 58;
  function updateCamera(dt) {
    const fx = Math.sin(S.h),
      fz = Math.cos(S.h),
      sp = clamp(S.v, -V.REV, V.MAX);
    const dist = 9 + sp * 0.12,
      want = new THREE.Vector3(S.x - fx * dist, 4.8 + Math.abs(sp) * 0.04, S.z - fz * dist);
    const look = new THREE.Vector3(S.x + fx * (3 + sp * 0.45), 1.3, S.z + fz * (3 + sp * 0.45));
    if (snapCam) {
      camPos.copy(want);
      camLook.copy(look);
      snapCam = false;
    } else {
      camPos.lerp(want, 1 - Math.exp(-3.2 * dt));
      camLook.lerp(look, 1 - Math.exp(-5 * dt));
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fov = baseFov + (REDUCED ? 0 : Math.abs(sp) * 0.35);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  function resize() {
    const w = innerWidth,
      h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w / h < 0.8 ? 72 : 58;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  setTheme(theme); // apply palette to everything built above

  // ---- loop
  const spd = $("#spd");
  let last = performance.now(),
    time = 0,
    raf = 0,
    firstFrame = true,
    lastSpd = -1;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    time += dt;
    car.position.set(S.x, 0, S.z);
    car.rotation.y = S.h;
    for (const w of wheels) {
      w.w.rotation.x = S.roll;
      if (w.front) w.pivot.rotation.y = -S.steer * 0.4;
    }
    car.rotation.z = -S.steer * clamp(S.v / 17, -1, 1) * 0.05; // gentle body roll
    updateCamera(dt);
    const sv = Math.round(Math.abs(S.v) * 3.6);
    if (sv !== lastSpd) {
      spd.textContent = sv;
      lastSpd = sv;
    }
    if (!REDUCED) {
      scene.userData.ribbons.uniforms.uT.value = time;
      eigG.rotation.y = time * 0.15;
      eigUpdate(time);
      const f = 1 + Math.sin(time * 13) * 0.08 + Math.sin(time * 7.3) * 0.06;
      flameO.scale.set(1, f, 1);
      flameI.scale.set(1, 2 - f, 1);
      for (const s of stations) {
        const on = s === S.near;
        s.ring.scale.setScalar(on ? 1 + Math.sin(time * 6) * 0.06 : 1);
      }
    }
    if (!miniCollapsed && ((miniDraws + 1) % 2 === 0 || miniDraws < 2)) drawMini();
    else if (!miniCollapsed) miniDraws++;
    for (const s of stations) {
      const on = s === S.near;
      s.ringMat.opacity = on ? 1 : 0.7;
      s.disc.material.opacity = on ? 0.3 : 0.14;
    }
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      notifyReady({ webgl: true });
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  raf = requestAnimationFrame(frame);

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    fallback("The graphics context was lost, so here is the plain project list instead.");
  });

  window.__world = {
    getState: () => ({
      webgl: true,
      x: S.x,
      z: S.z,
      heading: S.h,
      speed: S.v,
      near: S.near ? S.near.slug : null,
      theme,
      stations: stations.length,
      reduced: REDUCED,
      tour: { on: tour.on, index: tour.i, total: tour.path.length, visited: [...tour.visited], done: tour.done },
      minimap: { collapsed: miniCollapsed, draws: miniDraws },
    }),
    stations: stations.map((s) => ({ slug: s.slug, x: s.x, z: s.z })),
    teleportTo(slug) {
      const s = stations.find((q) => q.slug === slug);
      if (!s) return false;
      S.x = s.x;
      S.z = s.z;
      S.v = 0;
      S.h = Math.atan2(s.px - s.x, s.pz - s.z);
      snapCam = true;
      return true;
    },
    reset,
    setTheme,
    startTour,
    stopTour,
    setTourScale: (o) => Object.assign(tour.scale, o),
  };
}

main();
