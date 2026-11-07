/*
 * hero/fluid.js -- real-time GPU fluid / flame hero (vanilla WebGL2, no libraries, no network).
 *
 * A 2-D incompressible "stable fluids" solver running entirely in fragment shaders:
 *   semi-Lagrangian / MacCormack advection of velocity, dye and temperature, divergence,
 *   Jacobi pressure solve, gradient subtraction, vorticity confinement, temperature buoyancy
 *   (hot gas rises), a cylinder obstacle (no-through / no-slip) right of centre that sheds a
 *   Karman-style vortex street in the free stream, a burner (hot dye plume + gentle inflow)
 *   at the lower left, pointer splats, click bursts, scroll-velocity stirring and idle
 *   autonomous forcing.  The render pass colour-grades temperature/dye into a flame palette
 *   (graphite -> deep teal -> teal -> amber -> white-hot), adds a bloom chain, a subtle
 *   chromatic fringe, film grain and a vignette, and dims the field behind the headline.
 *
 * API:   const hero = await mount(el, opts);   hero.destroy();
 *   el   -- the .hero element; a <canvas class="hero__canvas"> inside it is used (or created).
 *   opts -- { tier (0..3), textRect, dprCap, reducedMotion, stream }   (all optional)
 *           textRect: CSS selector string (default ".hero__name, .hero__tagline, .hero__cta"),
 *                     array of {x,y,w,h} in px relative to el, or a function returning one.
 *   Query: ?nowebgl=1 forces the fallback, ?fluidtier=N forces a quality tier (debug).
 *
 * Fallback: without WebGL2 + float colour buffers (or with ?nowebgl=1) the Canvas2D
 * streamlines hero is mounted on the same element instead.
 * Colours: --teal/--amber/--rose/--sky/--bg/--viewport (falling back to --hero-*) are read at
 * mount and on every data-theme change.  Light backgrounds switch to an ink-and-flame mapping.
 * Quality: 4 tiers (sim grid 192/128/96/64, pressure iterations 24/16/10/6, bloom, DPR cap)
 * picked from the device, then adapted from measured frame times.  Pauses offscreen / hidden
 * tab; prefers-reduced-motion or <html data-fx="off"> => warm-up then one static frame.
 */

const TIERS = [
  { sim: 192, iters: 24, bloom: 5, dpr: 2, maxPx: 2.2e6, dye: 2, mac: true, warm: 220 },
  { sim: 128, iters: 16, bloom: 4, dpr: 1.5, maxPx: 1.3e6, dye: 2, mac: true, warm: 200 },
  { sim: 96, iters: 10, bloom: 3, dpr: 1.25, maxPx: 0.8e6, dye: 1.5, mac: true, warm: 160 },
  { sim: 64, iters: 6, bloom: 0, dpr: 1, maxPx: 0.4e6, dye: 1.5, mac: false, warm: 130 },
];

// ---------------------------------------------------------------- shaders
const VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
`;
const SOLID = `
uniform vec2 uCyl;      // centre (uv)
uniform vec2 uGeo;      // aspect, radius (height units)
bool solid(vec2 uv){ vec2 d = (uv - uCyl) * vec2(uGeo.x, 1.0); return dot(d, d) < uGeo.y * uGeo.y; }
`;
const FS = {};
FS.copy = HEAD + `uniform sampler2D uT; void main(){ o = texture(uT, vUv); }`;

FS.advect =
  HEAD +
  SOLID +
  `
uniform sampler2D uVel, uSrc;
uniform vec2 uInv; uniform float uDt; uniform vec4 uDiss; uniform float uIsVel;
void main(){
  vec2 back = vUv - uDt * texture(uVel, vUv).xy * uInv;
  vec4 r = texture(uSrc, back);
  r /= (1.0 + uDiss * uDt);
  if (solid(vUv)) r = vec4(0.0);
  o = r;
}`;
// second half of MacCormack: o = hat + 0.5 (src - advect_forward(hat)), clamped to the local range of src
FS.mac =
  HEAD +
  SOLID +
  `
uniform sampler2D uVel, uSrc, uHat;
uniform vec2 uInv, uTx; uniform float uDt; uniform vec4 uDiss;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec4 hat = texture(uHat, vUv);
  vec4 hat0 = texture(uHat, vUv + uDt * v * uInv);
  vec4 s0 = texture(uSrc, vUv);
  vec4 r = hat + 0.5 * (s0 - hat0);
  vec2 back = vUv - uDt * v * uInv;
  vec2 b = (floor(back / uTx - 0.5) + 0.5) * uTx;
  vec4 a = texture(uSrc, b), c = texture(uSrc, b + vec2(uTx.x, 0.0));
  vec4 d = texture(uSrc, b + vec2(0.0, uTx.y)), e = texture(uSrc, b + uTx);
  vec4 mn = min(min(a, c), min(d, e)), mx = max(max(a, c), max(d, e));
  r = clamp(r, mn, mx);
  r /= (1.0 + uDiss * uDt);
  if (solid(vUv)) r = vec4(0.0);
  o = r;
}`;
FS.curl =
  HEAD +
  `
uniform sampler2D uVel; uniform vec2 uTx;
void main(){
  float L = texture(uVel, vUv - vec2(uTx.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTx.x, 0.0)).y;
  float T = texture(uVel, vUv + vec2(0.0, uTx.y)).x, B = texture(uVel, vUv - vec2(0.0, uTx.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;
FS.force =
  HEAD +
  SOLID +
  `
uniform sampler2D uVel, uCurl, uScal;
uniform vec2 uTx, uBurner, uGust, uWakeP;
uniform float uDt, uEps, uBuoy, uWeight, uStream, uTime, uAspect, uJet, uWake, uBS;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  float L = texture(uCurl, vUv - vec2(uTx.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTx.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTx.y)).x, B = texture(uCurl, vUv - vec2(0.0, uTx.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001;
  f *= uEps * C; f.y *= -1.0;
  v += f * uDt;
  vec2 s = texture(uScal, vUv).xy;
  v.y += uDt * (uBuoy * s.y - uWeight * s.x);
  float xh = vUv.x * uAspect;
  float w = 1.0 - smoothstep(0.0, 0.14, xh);
  v = mix(v, vec2(uStream, 0.0), w * min(1.0, uDt * 6.0));
  v.x += (uStream - v.x) * uDt * 0.55;   // wind-tunnel drive: keeps the free stream alive everywhere
  vec2 d = (vUv - uBurner) * vec2(uAspect, 1.0);
  float g = exp(-dot(d, d) / (0.0055 * uBS));
  v = mix(v, vec2(uStream * 0.2 + 0.22 * sin(uTime * 5.3) * sin(uTime * 1.9 + 0.7), uJet * (0.85 + 0.15 * sin(uTime * 3.1))), g * min(1.0, uDt * 9.0));
  v += uGust * uDt * sin(xh * 5.0 + vUv.y * 3.0 + uTime * 1.3);
  vec2 dw = (vUv - uWakeP) * vec2(uAspect, 1.0);
  v.y += uWake * sin(uTime * 3.1) * exp(-dot(dw, dw) / 0.012) * uDt;
  float l = length(v); if (l > 4.0) v *= 4.0 / l;
  if (solid(vUv)) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;
FS.source =
  HEAD +
  SOLID +
  `
uniform sampler2D uScal;
uniform vec2 uBurner, uCyl2; uniform float uDt, uAspect, uFlick, uR2, uBS;
void main(){
  vec2 s = texture(uScal, vUv).xy;   // x = dye, y = temperature
  vec2 d = (vUv - uBurner) * vec2(uAspect, 1.0);
  float g = exp(-dot(d, d) / (0.0042 * uBS)) * min(1.0, uDt * 12.0);
  s.y = max(s.y, mix(s.y, 0.82 * uFlick, g));
  s.x = max(s.x, mix(s.x, 0.55, g));
  float xh = vUv.x * uAspect;
  float wl = 1.0 - smoothstep(0.0, 0.03, xh);
  float rake = smoothstep(0.86, 0.985, sin(vUv.y * 6.2831853 * 6.0 + 1.1));
  s.x = max(s.x, 0.42 * rake * wl);
  // smoke wires just upstream of the cylinder: make the vortex street visible
  float xw = uCyl2.x * uAspect - uR2 * 3.0;
  float ww = 1.0 - smoothstep(0.0, 0.014, abs(xh - xw));
  float band = smoothstep(0.1, 0.2, vUv.y) * (1.0 - smoothstep(0.8, 0.9, vUv.y));
  float rk2 = smoothstep(0.82, 0.97, sin((vUv.y - uCyl2.y) * 6.2831853 * 7.0 + 0.3));
  s.x = max(s.x, 0.7 * rk2 * ww * band);
  s *= 1.0 - min(1.0, uDt * 6.0 * smoothstep(0.55, 1.0, vUv.y));   // sponge layer at the top edge
  if (solid(vUv)) s = vec2(0.0);
  o = vec4(s, 0.0, 1.0);
}`;
FS.splat =
  HEAD +
  `
uniform sampler2D uT; uniform vec2 uP, uMax; uniform vec4 uC; uniform float uR, uAspect;
void main(){
  vec2 d = (vUv - uP) * vec2(uAspect, 1.0);
  float g = exp(-dot(d, d) / uR);
  vec4 b = texture(uT, vUv) + uC * g;
  b.xy = clamp(b.xy, -uMax, uMax);
  o = b;
}`;
FS.div =
  HEAD +
  SOLID +
  `
uniform sampler2D uVel; uniform vec2 uTx; uniform float uStream;
vec2 nb(vec2 uv, vec2 c){
  if (uv.x < 0.0) return vec2(uStream, 0.0);
  if (uv.x > 1.0) return c;
  if (uv.y < 0.0 || uv.y > 1.0) return vec2(c.x, -c.y);
  if (solid(uv)) return vec2(0.0);
  return texture(uVel, uv).xy;
}
void main(){
  vec2 c = texture(uVel, vUv).xy;
  vec2 L = nb(vUv - vec2(uTx.x, 0.0), c), R = nb(vUv + vec2(uTx.x, 0.0), c);
  vec2 T = nb(vUv + vec2(0.0, uTx.y), c), B = nb(vUv - vec2(0.0, uTx.y), c);
  float dv = 0.5 * (R.x - L.x + T.y - B.y);
  if (solid(vUv)) dv = 0.0;
  o = vec4(dv, 0.0, 0.0, 1.0);
}`;
const PN = `
float pn(vec2 uv, float c){
  if (uv.x > 1.0) return 0.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.y > 1.0) return c;
  if (solid(uv)) return c;
  return texture(uP, uv).x;
}`;
FS.press =
  HEAD +
  SOLID +
  `uniform sampler2D uP, uDiv; uniform vec2 uTx;` +
  PN +
  `
void main(){
  float c = texture(uP, vUv).x;
  float L = pn(vUv - vec2(uTx.x, 0.0), c), R = pn(vUv + vec2(uTx.x, 0.0), c);
  float T = pn(vUv + vec2(0.0, uTx.y), c), B = pn(vUv - vec2(0.0, uTx.y), c);
  float p = (L + R + B + T - texture(uDiv, vUv).x) * 0.25;
  if (solid(vUv)) p = 0.0;
  o = vec4(p, 0.0, 0.0, 1.0);
}`;
FS.grad =
  HEAD +
  SOLID +
  `uniform sampler2D uP, uVel; uniform vec2 uTx;` +
  PN +
  `
void main(){
  float c = texture(uP, vUv).x;
  float L = pn(vUv - vec2(uTx.x, 0.0), c), R = pn(vUv + vec2(uTx.x, 0.0), c);
  float T = pn(vUv + vec2(0.0, uTx.y), c), B = pn(vUv - vec2(0.0, uTx.y), c);
  vec2 v = texture(uVel, vUv).xy - 0.5 * vec2(R - L, T - B);
  if (solid(vUv)) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;
FS.scale = HEAD + `uniform sampler2D uT; uniform float uK; void main(){ o = texture(uT, vUv) * uK; }`;

FS.render =
  HEAD +
  `
uniform sampler2D uScal;
uniform vec2 uScalTx, uCyl;
uniform vec3 uStops[5];
uniform vec3 uDyeCol, uCylBody, uCylRim, uBg;
uniform vec4 uRects[4];
uniform float uMode, uAspect, uPx, uR, uScrim, uFeather, uGain;
void main(){
  vec2 sz = 1.0 / uScalTx;
  vec2 pf = vUv * sz - 0.5;
  vec2 ip = floor(pf), fp = fract(pf);
  fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  vec2 s = texture(uScal, (ip + 0.5 + fp) * uScalTx).xy;
  vec2 sb = 0.25 * (texture(uScal, vUv + vec2(uScalTx.x * 1.5, 0.0)).xy + texture(uScal, vUv - vec2(uScalTx.x * 1.5, 0.0)).xy
                  + texture(uScal, vUv + vec2(0.0, uScalTx.y * 1.5)).xy + texture(uScal, vUv - vec2(0.0, uScalTx.y * 1.5)).xy);
  vec2 sd = max(s + 0.4 * (s - sb), 0.0);
  float dye = sd.x, T = sd.y;
  vec2 q = vUv - 0.5;
  float vig = 1.0 - 0.55 * smoothstep(0.42, 0.95, length(q * vec2(0.9, 1.25)));
  float inner = 0.0, halo = 0.0;
  for (int i = 0; i < 4; i++){
    vec4 r = uRects[i];
    if (r.z > r.x){
      vec2 dd = max(r.xy - vUv, vUv - r.zw);
      float dist = length(max(dd * vec2(uAspect, 1.0), 0.0));
      inner = max(inner, 1.0 - smoothstep(0.0, uFeather, dist));
      halo = max(halo, 1.0 - smoothstep(0.0, uFeather * 6.0, dist));
    }
  }
  float m = (1.0 - uScrim * inner) * (1.0 - 0.3 * halo) * vig;
  dye *= m; T *= m;
  float t = T * uGain;
  vec3 col = uStops[0];
  const float k[5] = float[5](0.04, 0.12, 0.22, 0.42, 1.1);
  for (int i = 0; i < 4; i++) col = mix(col, uStops[i + 1], smoothstep(k[i], k[i + 1], t));
  float dm = clamp(dye * 1.1, 0.0, 1.0);
  if (uMode < 0.5) col += uDyeCol * dm * (1.0 - 0.6 * smoothstep(0.2, 0.7, t));
  else col = mix(col, uDyeCol, clamp(dm * 0.8, 0.0, 0.8) * (1.0 - smoothstep(0.25, 0.8, t)));
  // obstacle
  vec2 dc = (vUv - uCyl) * vec2(uAspect, 1.0);
  float rr = length(dc);
  float body = (1.0 - smoothstep(uR - uPx, uR + uPx, rr)) * (1.0 - 0.92 * inner);
  float rim = body * smoothstep(uR - 2.6 * uPx, uR - 0.6 * uPx, rr);
  vec3 bc = uCylBody * (0.85 + 0.3 * clamp(dc.y / uR * 0.5 + 0.5, 0.0, 1.0));
  col = mix(col, bc, body);
  col = mix(col, uCylRim, rim * 0.85);
  float a = max(t, dye * 0.55) * (1.0 - body);
  o = vec4(col, a);
}`;
FS.bright =
  HEAD +
  `
uniform sampler2D uT; uniform vec2 uTx; uniform float uThr;
void main(){
  vec4 c = 0.25 * (texture(uT, vUv + uTx * vec2(-0.5, -0.5)) + texture(uT, vUv + uTx * vec2(0.5, -0.5))
                 + texture(uT, vUv + uTx * vec2(-0.5, 0.5)) + texture(uT, vUv + uTx * vec2(0.5, 0.5)));
  float w = smoothstep(uThr, uThr + 0.55, c.a);
  o = vec4(c.rgb * w, w);
}`;
FS.down =
  HEAD +
  `
uniform sampler2D uT; uniform vec2 uTx;
void main(){
  o = 0.25 * (texture(uT, vUv + uTx * vec2(-0.5, -0.5)) + texture(uT, vUv + uTx * vec2(0.5, -0.5))
            + texture(uT, vUv + uTx * vec2(-0.5, 0.5)) + texture(uT, vUv + uTx * vec2(0.5, 0.5)));
}`;
FS.up =
  HEAD +
  `
uniform sampler2D uA, uB; uniform vec2 uTx; uniform float uK;
void main(){
  vec4 u = texture(uB, vUv + uTx * vec2(-0.5, -0.5)) + texture(uB, vUv + uTx * vec2(0.5, -0.5))
         + texture(uB, vUv + uTx * vec2(-0.5, 0.5)) + texture(uB, vUv + uTx * vec2(0.5, 0.5));
  o = texture(uA, vUv) + uK * 0.25 * u;
}`;
FS.comp =
  HEAD +
  `
uniform sampler2D uScene, uBloom;
uniform vec2 uRes; uniform float uBloomG, uTime, uMode, uGrain;
uniform vec3 uBg;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 d = vUv - 0.5;
  vec2 off = d * (0.0012 + 0.006 * dot(d, d));
  vec3 c = vec3(texture(uScene, vUv + off).r, texture(uScene, vUv).g, texture(uScene, vUv - off).b);
  vec4 bl = texture(uBloom, vUv);
  if (uMode < 0.5) c += bl.rgb * uBloomG;
  else { vec3 bc = bl.rgb / max(bl.a, 0.001); c = mix(c, bc, clamp(bl.a * uBloomG, 0.0, 0.5)); }
  float n = hash(gl_FragCoord.xy + fract(uTime * 0.37) * 311.0) - 0.5;
  c += n * uGrain;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Stats probe (home "Under the hood" panel). Compiled lazily, only while a probe is requested; never part of the frame loop otherwise.
// Reduces 8x8 blocks of three fields to their maxima: r = max|div| before the pressure solve, g = max|div| after it, b = max |u|.
const FS_PROBE =
  HEAD +
  `
uniform sampler2D uB, uA, uV; uniform vec2 uSz;
void main(){
  ivec2 b = ivec2(gl_FragCoord.xy) * 8;
  ivec2 lim = ivec2(uSz) - 1;
  float mb = 0.0, ma = 0.0, mv = 0.0;
  for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++){
    ivec2 c = min(b + ivec2(i, j), lim);
    mb = max(mb, abs(texelFetch(uB, c, 0).x));
    ma = max(ma, abs(texelFetch(uA, c, 0).x));
    mv = max(mv, length(texelFetch(uV, c, 0).xy));
  }
  o = vec4(mb, ma, mv, 1.0);
}`;

// ---------------------------------------------------------------- helpers
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

let probeCtx = null;
function parseColor(str, fallback) {
  try {
    if (!str) return fallback;
    probeCtx = probeCtx || document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    probeCtx.canvas.width = probeCtx.canvas.height = 1;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = "#000";
    probeCtx.fillStyle = str.trim();
    probeCtx.fillRect(0, 0, 1, 1);
    const d = probeCtx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  } catch (e) {
    return fallback;
  }
}
const hexc = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (names, fb) => {
    for (const n of names) {
      const v = cs.getPropertyValue(n);
      if (v && v.trim()) return parseColor(v, hexc(fb));
    }
    return hexc(fb);
  };
  const bg = get(["--bg", "--hero-bg"], "#0e1116");
  const light = lumOf(bg) > 0.45;
  return {
    light,
    bg,
    viewport: get(["--viewport", "--hero-bg-2"], light ? "#eaeef2" : "#12171e"),
    teal: get(["--teal", "--hero-accent"], light ? "#0f9f8f" : "#2dd4bf"),
    amber: get(["--amber", "--hero-amber"], light ? "#c7780a" : "#f5a524"),
    rose: get(["--rose", "--hero-rose"], light ? "#d9465f" : "#fb7185"),
    sky: get(["--sky", "--hero-sky"], light ? "#2f7fd6" : "#60a5fa"),
  };
}

function stopsFor(p) {
  const white = [1.0, 0.97, 0.9];
  if (!p.light) {
    return {
      stops: [p.bg, mixc(p.bg, mulc(p.teal, 0.55), 0.62), p.teal, mixc(p.amber, p.rose, 0.12), mulc(mixc(p.amber, white, 0.82), 1.25)],
      dye: mulc(mixc(p.teal, p.sky, 0.5), 0.62),
      body: mixc(p.bg, [0, 0, 0], 0.35),
      rim: mulc(p.teal, 0.55),
      gain: 1.0,
      bloom: 0.85,
      grain: 0.028,
      thr: 0.3,
    };
  }
  const ink = [0.09, 0.125, 0.17];
  return {
    stops: [p.bg, mixc(p.bg, p.teal, 0.3), mulc(p.teal, 0.82), mixc(mixc(p.amber, [1.0, 0.6, 0.08], 0.45), p.rose, 0.12), mulc(p.rose, 0.8)],
    dye: mixc(mulc(p.teal, 0.7), mulc(p.sky, 0.7), 0.45),
    body: mixc(p.bg, ink, 0.93),
    rim: mixc(p.teal, ink, 0.3),
    gain: 1.0,
    bloom: 0.5,
    grain: 0.02,
    thr: 0.4,
  };
}

// ---------------------------------------------------------------- mount
export async function mount(el, opts = {}) {
  const q = new URLSearchParams(location.search);
  let canvas = el.querySelector("canvas.hero__canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "hero__canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);
  }
  const freshCanvas = () => {
    const c = document.createElement("canvas");
    c.className = canvas.className;
    c.setAttribute("aria-hidden", "true");
    canvas.replaceWith(c);
    canvas = c;
    return c;
  };

  let gl = null;
  if (q.get("nowebgl") !== "1") {
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      if (gl && !gl.getExtension("EXT_color_buffer_float")) gl = null;
    } catch (e) {
      gl = null;
    }
  }
  if (!gl) return fallback(el, canvas, freshCanvas, opts);

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fxOff = () => document.documentElement.dataset.fx === "off";
  const isStatic = () => (opts.reducedMotion == null ? mq.matches : !!opts.reducedMotion) || fxOff();

  // ---- state
  let pal = readPalette();
  let tierIdx = 0;
  let baseTier = 0;
  let T = TIERS[0];
  let W = 0,
    H = 0,
    aspect = 2;
  let sim = null; // {w,h,dw,dh,vel,scal,...}
  let progs = {};
  let vao = null;
  let scene = null,
    bloomDown = [],
    bloomUp = [];
  let time = 0,
    raf = 0,
    last = 0,
    running = false,
    visible = true,
    destroyed = false,
    lost = false,
    warmLeft = 0,
    staticDone = false,
    frameCount = 0;
  const stats = { ms: 0, medians: [], tierHistory: [], stepsPerFrame: 0, errors: 0 };
  // stats probe state (see api.probe / api.getStats); idle (probeOn=false) costs nothing per frame beyond one boolean test in step()
  let probeOn = false,
    probeLast = 0,
    probeRes = null;
  let times = [];
  let goodWindows = 0;
  const failed = new Set();
  let rects = new Float32Array(16);
  let rectTimer = 0;
  const ptr = { x: 0, y: 0, lt: 0, has: false };
  const queue = [];
  let gust = [0, 0];
  let lastScrollY = window.scrollY,
    lastScrollY2 = window.scrollY,
    lastScrollT = performance.now();
  let nextIdle = 1.2;
  let rng = 1234567;
  const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296;

  function choosePreferredTier() {
    if (opts.tier != null) return clamp(opts.tier | 0, 0, 3);
    const qt = q.get("fluidtier");
    if (qt != null && qt !== "") return clamp(parseInt(qt, 10) || 0, 0, 3);
    let t = 0;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const save = navigator.connection && navigator.connection.saveData;
    if (coarse) t = Math.max(t, 1);
    if (cores <= 4) t = Math.max(t, 1);
    if (cores <= 2 || mem <= 2) t = Math.max(t, 2);
    if (save) t = 3;
    if (fxOff()) t = 3;
    if (isStatic() && !fxOff()) t = Math.min(t, 1);
    return t;
  }

  // ---- GL objects
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  function makeProgram(fsSrc) {
    const p = gl.createProgram();
    const v = compile(gl.VERTEX_SHADER, VS),
      f = compile(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    gl.deleteShader(v);
    gl.deleteShader(f);
    return { id: p, loc: {}, unit: 0 };
  }
  function setU(p, name, v) {
    let loc = p.loc[name];
    if (loc === undefined) loc = p.loc[name] = gl.getUniformLocation(p.id, name);
    if (loc == null) return;
    if (typeof v === "number") gl.uniform1f(loc, v);
    else if (v instanceof WebGLTexture) {
      gl.activeTexture(gl.TEXTURE0 + p.unit);
      gl.bindTexture(gl.TEXTURE_2D, v);
      gl.uniform1i(loc, p.unit++);
    } else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4 || v.length === 16) gl.uniform4fv(loc, v);
    else gl.uniform3fv(loc, v); // arrays of vec3 (flattened)
  }
  function mkTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("fbo incomplete");
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  const mkDouble = (w, h) => {
    const d = { a: mkTarget(w, h), b: mkTarget(w, h) };
    d.read = d.a;
    d.write = d.b;
    d.swap = () => {
      const t = d.read;
      d.read = d.write;
      d.write = t;
    };
    return d;
  };
  const freeTarget = (t) => {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  };
  const freeDouble = (d) => {
    if (!d) return;
    freeTarget(d.a);
    freeTarget(d.b);
  };

  function use(p) {
    gl.useProgram(p.id);
    p.unit = 0;
  }
  function pass(p, target, uni) {
    use(p);
    for (const k in uni) setU(p, k, uni[k]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    if (target) gl.viewport(0, 0, target.w, target.h);
    else gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function initGL() {
    progs = {};
    for (const k of Object.keys(FS)) progs[k] = makeProgram(FS[k]);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  function freeSim() {
    if (!sim) return;
    freeDouble(sim.vel);
    freeDouble(sim.scal);
    freeDouble(sim.press);
    freeTarget(sim.div);
    freeTarget(sim.curl);
    freeTarget(sim.tmpV);
    freeTarget(sim.tmpS);
    freeTarget(sim.probeA);
    freeTarget(sim.probeR);
    sim = null;
  }
  function freeBloom() {
    freeTarget(scene);
    scene = null;
    for (const t of bloomDown) freeTarget(t);
    for (const t of bloomUp) freeTarget(t);
    bloomDown = [];
    bloomUp = [];
  }

  function allocSim(keep) {
    const h = T.sim;
    const w = Math.max(16, Math.round(h * aspect));
    const dh = Math.round(h * T.dye),
      dw = Math.max(16, Math.round(w * T.dye));
    const old = sim;
    const s = {
      w,
      h,
      dw,
      dh,
      tx: [1 / w, 1 / h],
      dtx: [1 / dw, 1 / dh],
      vel: mkDouble(w, h),
      scal: mkDouble(dw, dh),
      press: mkDouble(w, h),
      div: mkTarget(w, h),
      curl: mkTarget(w, h),
      tmpV: mkTarget(w, h),
      tmpS: mkTarget(dw, dh),
    };
    if (keep && old) {
      pass(progs.copy, s.vel.read, { uT: old.vel.read.tex });
      pass(progs.copy, s.scal.read, { uT: old.scal.read.tex });
    }
    freeSim();
    sim = s;
  }

  function allocRender() {
    freeBloom();
    scene = mkTarget(W, H);
    const levels = T.bloom;
    let w = W,
      h = H;
    for (let i = 0; i < levels; i++) {
      w = Math.max(2, w >> 1);
      h = Math.max(2, h >> 1);
      bloomDown.push(mkTarget(w, h));
      if (i < levels - 1) bloomUp.push(mkTarget(w, h));
    }
  }

  // ---- geometry of the scene
  function geo() {
    const narrow = aspect < 1.2;
    return {
      cyl: narrow ? [0.66, 0.2] : [0.77, 0.5],
      r: narrow ? 0.07 : 0.088,
      burner: [narrow ? 0.16 : 0.085, narrow ? 0.08 : 0.11],
      bs: narrow ? 0.45 : 1.0,
    };
  }

  // ---- sizing
  function canvasSize() {
    const r = el.getBoundingClientRect();
    const cssW = Math.max(1, r.width),
      cssH = Math.max(1, r.height);
    let dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap || T.dpr, T.dpr);
    let w = cssW * dpr,
      h = cssH * dpr;
    const px = w * h;
    if (px > T.maxPx) {
      const k = Math.sqrt(T.maxPx / px);
      w *= k;
      h *= k;
    }
    return [Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), cssW, cssH];
  }
  function resize(force) {
    const [w, h] = canvasSize();
    if (!force && w === W && h === H) return;
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    const a = W / H;
    const needSim = !sim || Math.abs(a - aspect) / aspect > 0.03 || force;
    aspect = a;
    allocRender();
    if (needSim) allocSim(!!sim);
    computeRects();
    if (!running) drawOnce();
  }

  // ---- text scrim rectangles
  function computeRects() {
    rects.fill(0);
    const er = el.getBoundingClientRect();
    if (!er.width || !er.height) return;
    let list = [];
    const sel = opts.textRect == null ? ".hero__name, .hero__tagline, .hero__cta" : opts.textRect;
    try {
      if (typeof sel === "function") list = sel(el) || [];
      else if (Array.isArray(sel)) list = sel;
      else
        el.querySelectorAll(sel).forEach((n) => {
          let r;
          if (n.matches(".hero__cta")) r = n.getBoundingClientRect();
          else {
            const rg = document.createRange();
            rg.selectNodeContents(n);
            r = rg.getBoundingClientRect();
          }
          if (r.width > 0) list.push({ x: r.left - er.left, y: r.top - er.top, w: r.width, h: r.height });
        });
    } catch (e) {}
    list = list.slice(0, 4);
    const padX = 28,
      padY = 14;
    list.forEach((r, i) => {
      const x0 = (r.x - padX) / er.width,
        x1 = (r.x + r.w + padX) / er.width;
      const y0 = 1 - (r.y + r.h + padY) / er.height,
        y1 = 1 - (r.y - padY) / er.height;
      rects.set([x0, y0, x1, y1], i * 4);
    });
  }

  // ---- simulation step
  // One throttled (<= 1 Hz) measurement, run inside step() right after the projection (velocity = u after the pressure solve):
  //   before = max|div u*| of the field that went INTO the pressure solve (the S.div texture the solver already built),
  //   after  = max|div u|  of the field that came OUT (a second run of the same divergence pass),
  //   speed  = max |u| after the solve.
  // The grid is reduced on the GPU (8x8 block maxima), so the CPU reads (w/8)*(h/8) texels, not the whole field.
  function runProbe(S, dt, stream, cylU) {
    const now = performance.now();
    if (now - probeLast < 1000) return;
    probeLast = now;
    if (!progs.probe) progs.probe = makeProgram(FS_PROBE);
    if (!S.probeA) {
      S.probeA = mkTarget(S.w, S.h);
      S.probeR = mkTarget(Math.ceil(S.w / 8), Math.ceil(S.h / 8));
    }
    pass(progs.div, S.probeA, { uVel: S.vel.read.tex, uTx: S.tx, uStream: stream, ...cylU });
    pass(progs.probe, S.probeR, { uB: S.div.tex, uA: S.probeA.tex, uV: S.vel.read.tex, uSz: [S.w, S.h] });
    const n = S.probeR.w * S.probeR.h;
    const buf = new Float32Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.probeR.fbo);
    gl.readPixels(0, 0, S.probeR.w, S.probeR.h, gl.RGBA, gl.FLOAT, buf);
    let b = 0,
      a = 0,
      v = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i] > b) b = buf[i];
      if (buf[i + 1] > a) a = buf[i + 1];
      if (buf[i + 2] > v) v = buf[i + 2];
    }
    // texture units are cell-size-1 units: velocity differences per cell. Physical divergence = value / h with h = 1/simH (heights/cell).
    probeRes = {
      t: now,
      divBefore: b * S.h,
      divAfter: a * S.h,
      speed: v,
      dt,
      cfl: dt * v * S.h,
      grid: [S.w, S.h],
      iters: T.iters,
      reduced: [S.probeR.w, S.probeR.h],
    };
  }
  function splat(target, p, c, radius, max) {
    pass(progs.splat, target.write, { uT: target.read.tex, uP: p, uC: c, uR: radius, uAspect: aspect, uMax: max });
    target.swap();
  }
  function step(dt) {
    const g = geo();
    const stream = (opts.stream != null ? opts.stream : 0.36) * (1 + 0.12 * Math.sin(time * 0.35));
    const S = sim;
    time += dt;
    const cylU = { uCyl: g.cyl, uGeo: [aspect, g.r] };
    // pointer / queued splats (velocity + dye)
    while (queue.length) {
      const e = queue.shift();
      splat(S.vel, [e.x, e.y], [e.dx, e.dy, 0, 0], e.r * e.r, [4, 4]);
      splat(S.scal, [e.x, e.y], [e.dye, e.heat, 0, 0], e.r * e.r * 0.8, [1.4, 2.0]);
    }
    // vorticity
    pass(progs.curl, S.curl, { uVel: S.vel.read.tex, uTx: S.tx });
    pass(progs.force, S.vel.write, {
      uVel: S.vel.read.tex,
      uCurl: S.curl.tex,
      uScal: S.scal.read.tex,
      uTx: S.tx,
      uBurner: g.burner,
      uGust: gust,
      uWakeP: [g.cyl[0] - (g.r * 1.6) / aspect, g.cyl[1] + 0.02],
      uDt: dt,
      uEps: 3.0 + (tierIdx >= 3 ? 3 : 0),
      uBuoy: 4.2,
      uWeight: 0.25,
      uStream: stream,
      uTime: time,
      uAspect: aspect,
      uJet: 0.9,
      uBS: g.bs,
      uWake: 0.7,
      ...cylU,
    });
    S.vel.swap();
    // scalar sources (burner flame, smoke rakes)
    const flick = 0.82 + 0.18 * Math.sin(time * 9.0) * Math.sin(time * 2.7 + 1.0) + 0.06 * (rand() - 0.5);
    pass(progs.source, S.scal.write, {
      uScal: S.scal.read.tex,
      uBurner: g.burner,
      uDt: dt,
      uAspect: aspect,
      uFlick: flick,
      uCyl2: g.cyl,
      uR2: g.r,
      uBS: g.bs,
      ...cylU,
    });
    S.scal.swap();
    // projection
    pass(progs.div, S.div, { uVel: S.vel.read.tex, uTx: S.tx, uStream: stream, ...cylU });
    pass(progs.scale, S.press.write, { uT: S.press.read.tex, uK: 0.8 });
    S.press.swap();
    for (let i = 0; i < T.iters; i++) {
      pass(progs.press, S.press.write, { uP: S.press.read.tex, uDiv: S.div.tex, uTx: S.tx, ...cylU });
      S.press.swap();
    }
    pass(progs.grad, S.vel.write, { uP: S.press.read.tex, uVel: S.vel.read.tex, uTx: S.tx, ...cylU });
    S.vel.swap();
    if (probeOn) {
      try {
        runProbe(S, dt, stream, cylU);
      } catch (e) {
        probeOn = false; // a failed probe must never cost a frame
      }
    }
    // advection
    const inv = [1 / aspect, 1];
    const vtex = S.vel.read.tex;
    if (T.mac) {
      pass(progs.advect, S.tmpV, { uVel: vtex, uSrc: vtex, uInv: inv, uDt: dt, uDiss: [0.05, 0.05, 0, 0], ...cylU });
      pass(progs.mac, S.vel.write, { uVel: vtex, uSrc: vtex, uHat: S.tmpV.tex, uInv: inv, uTx: S.tx, uDt: dt, uDiss: [0.05, 0.05, 0, 0], ...cylU });
      pass(progs.advect, S.tmpS, { uVel: vtex, uSrc: S.scal.read.tex, uInv: inv, uDt: dt, uDiss: [0.5, 0.6, 0, 0], ...cylU });
      pass(progs.mac, S.scal.write, {
        uVel: vtex,
        uSrc: S.scal.read.tex,
        uHat: S.tmpS.tex,
        uInv: inv,
        uTx: S.dtx,
        uDt: dt,
        uDiss: [0.5, 0.6, 0, 0],
        ...cylU,
      });
    } else {
      pass(progs.advect, S.vel.write, { uVel: vtex, uSrc: vtex, uInv: inv, uDt: dt, uDiss: [0.1, 0.1, 0, 0], ...cylU });
      pass(progs.advect, S.scal.write, { uVel: vtex, uSrc: S.scal.read.tex, uInv: inv, uDt: dt, uDiss: [0.5, 0.6, 0, 0], ...cylU });
    }
    S.vel.swap();
    S.scal.swap();
    // decay stirring
    gust[0] *= Math.exp(-dt * 1.6);
    gust[1] *= Math.exp(-dt * 1.6);
  }

  // ---- forcing inputs
  function pushSplat(x, y, dx, dy, dye, heat, r) {
    if (queue.length < 24) queue.push({ x, y, dx, dy, dye, heat, r });
  }
  function idleForcing(dt) {
    nextIdle -= dt;
    if (nextIdle > 0) return;
    nextIdle = 1.6 + rand() * 2.4;
    const x = 0.2 + rand() * 0.6,
      y = 0.15 + rand() * 0.7;
    const a = rand() * Math.PI * 2;
    pushSplat(x, y, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.25, 0.1, 0.04);
  }
  const onPointer = (e) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const x = (e.clientX - r.left) / r.width,
      y = 1 - (e.clientY - r.top) / r.height;
    const now = performance.now();
    if (ptr.has && now - ptr.lt < 300) {
      const dtm = Math.max(8, now - ptr.lt) / 1000;
      // velocity in height units per second
      const dx = ((x - ptr.x) * (r.width / r.height)) / dtm,
        dy = (y - ptr.y) / dtm;
      const sp = Math.hypot(dx, dy);
      const k = Math.min(1, 2.2 / (sp + 1e-4));
      pushSplat(x, y, dx * k * 0.9, dy * k * 0.9, 0.16, 0.09, 0.05);
    }
    ptr.x = x;
    ptr.y = y;
    ptr.lt = now;
    ptr.has = true;
  };
  const onLeave = () => (ptr.has = false);
  const onDown = (e) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const x = (e.clientX - r.left) / r.width,
      y = 1 - (e.clientY - r.top) / r.height;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pushSplat(x + (Math.cos(a) * 0.012) / aspect, y + Math.sin(a) * 0.012, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.3, 0.9, 0.034);
    }
    pushSplat(x, y, 0, 0.5, 0.4, 1.2, 0.05);
  };
  const onScroll = () => {
    const now = performance.now();
    const y = window.scrollY;
    const dtm = Math.max(8, now - lastScrollT) / 1000;
    const v = (y - lastScrollY) / dtm; // px / s
    lastScrollY = y;
    lastScrollT = now;
    const hgt = el.getBoundingClientRect().height || 500;
    // scrolling stirs the flow: distance-based so it works however the browser batches scroll events
    const dyPx = y - lastScrollY2;
    lastScrollY2 = y;
    const f = clamp((dyPx / hgt) * 6, -9, 9);
    gust[1] = clamp(gust[1] + f, -9, 9);
    gust[0] = clamp(gust[0] + Math.abs(f) * 0.3, -9, 9);
    if (Math.abs(f) > 0.05) pushSplat(0.15 + rand() * 0.7, 0.5 + rand() * 0.3, 0, clamp(f, -2.5, 2.5) * 0.8, 0.2, 0.05, 0.05);
  };

  // ---- render
  function renderFrame() {
    if (!sim || !scene || lost) return;
    const g = geo();
    const st = stopsFor(pal);
    const flatStops = new Float32Array(15);
    st.stops.forEach((c, i) => flatStops.set(c, i * 3));
    gl.disable(gl.BLEND);
    pass(progs.render, scene, {
      uScal: sim.scal.read.tex,
      uScalTx: sim.dtx,
      uCyl: g.cyl,
      uStops: flatStops,
      uDyeCol: st.dye,
      uCylBody: st.body,
      uCylRim: st.rim,
      uBg: pal.bg,
      uRects: rects,
      uMode: pal.light ? 1 : 0,
      uAspect: aspect,
      uPx: 1 / H,
      uR: g.r,
      uScrim: q.get("fluidscrim") === "0" ? 0 : pal.light ? 0.97 : 0.94,
      uFeather: 0.05,
      uGain: st.gain,
    });
    let bloomTex = scene.tex;
    if (T.bloom > 0 && bloomDown.length) {
      pass(progs.bright, bloomDown[0], { uT: scene.tex, uTx: [1 / scene.w, 1 / scene.h], uThr: st.thr });
      for (let i = 1; i < bloomDown.length; i++) {
        const s = bloomDown[i - 1];
        pass(progs.down, bloomDown[i], { uT: s.tex, uTx: [1 / s.w, 1 / s.h] });
      }
      let acc = bloomDown[bloomDown.length - 1];
      for (let i = bloomDown.length - 2; i >= 0; i--) {
        const tgt = bloomUp[i];
        pass(progs.up, tgt, { uA: bloomDown[i].tex, uB: acc.tex, uTx: [1 / acc.w, 1 / acc.h], uK: 0.9 });
        acc = tgt;
      }
      bloomTex = acc.tex;
    }
    pass(progs.comp, null, {
      uScene: scene.tex,
      uBloom: bloomTex,
      uRes: [W, H],
      uBloomG: T.bloom > 0 ? st.bloom : 0,
      uTime: time,
      uMode: pal.light ? 1 : 0,
      uGrain: st.grain,
      uBg: pal.bg,
    });
  }
  function drawOnce() {
    try {
      renderFrame();
    } catch (e) {}
  }

  // ---- tiers
  function setTier(n, keepField = true) {
    n = clamp(n | 0, 0, 3);
    if (n === tierIdx && sim) return;
    tierIdx = n;
    T = TIERS[n];
    stats.tierHistory.push(n);
    el.dataset.fluidTier = String(n);
    const [w, h] = canvasSize();
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    allocRender();
    allocSim(keepField);
    computeRects();
    times = [];
    goodWindows = 0;
  }

  function adapt(frameMs) {
    if (opts.adapt === false || q.get("fluidadapt") === "0") return;
    times.push(frameMs);
    const probe = frameCount < 16 && times.length >= 3 && tierIdx < 3;
    if (times.length < 40 && !probe) return;
    const sorted = times.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    stats.ms = med;
    stats.medians.push(+med.toFixed(1));
    el.dataset.fluidMs = med.toFixed(1);
    times = [];
    if (med > 30 && tierIdx < 3) {
      failed.add(tierIdx);
      goodWindows = 0;
      // very slow machines jump straight down instead of grinding through every tier
      setTier(tierIdx + (med > 400 ? 3 : med > 110 ? 2 : 1));
    } else if (med < 19.5 && tierIdx > baseTier && !failed.has(tierIdx - 1)) {
      if (++goodWindows >= 3) {
        goodWindows = 0;
        setTier(tierIdx - 1);
      }
    } else goodWindows = 0;
  }

  // ---- loop
  function frame(now) {
    raf = 0;
    if (!running || destroyed) return;
    const ms = now - last;
    last = now;
    const dt = clamp(ms / 1000 || 0.016, 1 / 120, 1 / 30);
    frameCount++;
    const tw = performance.now();
    try {
      if (warmLeft > 0) {
        const t0 = performance.now();
        let n = 0;
        const budget = frameCount <= 5 ? 1 : 14;
        do {
          idleForcing(1 / 30);
          step(1 / 30);
          warmLeft--;
          n++;
        } while (warmLeft > 0 && performance.now() - t0 < budget && n < 10);
        stats.stepsPerFrame = n;
      } else {
        idleForcing(dt);
        step(dt);
        stats.stepsPerFrame = 1;
      }
      renderFrame();
      if (frameCount > 1) adapt(frameCount <= 16 ? Math.max(ms, performance.now() - tw) : ms);
      if (frameCount % 30 === 0 && gl.getError() !== gl.NO_ERROR) stats.errors++;
    } catch (e) {
      stats.errors++;
    }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || destroyed || lost || !visible || document.hidden || isStatic()) return;
    running = true;
    last = performance.now();
    times = [];
    raf = requestAnimationFrame(frame);
    el.dataset.heroState = "running";
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const syncPx = new Float32Array(4);
  function syncGPU() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.vel.read.fbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, syncPx);
  }
  // static (reduced motion / fx off): warm up in chunks, draw one frame
  let staticToken = 0;
  function runStatic() {
    stop();
    const my = ++staticToken;
    el.dataset.heroState = "static";
    staticDone = false;
    delete el.dataset.fluidReady;
    let total = Math.min(T.warm, 150);
    let n = 0;
    let perChunk = 1;
    const deadline = performance.now() + 6000;
    const chunk = () => {
      if (destroyed || my !== staticToken || lost) return;
      const t0 = performance.now();
      try {
        for (let i = 0; i < perChunk && n < total; i++) {
          step(1 / 30);
          n++;
        }
        syncGPU(); // GL is asynchronous: a real sync point is needed to learn the cost of a step
        const cost = (performance.now() - t0) / Math.max(1, perChunk);
        if (cost > 90 && tierIdx < 3) {
          // slow machine: drop to a cheaper tier before spending the whole warm-up
          setTier(tierIdx + (cost > 450 ? 3 : cost > 200 ? 2 : 1));
          total = Math.min(T.warm, 150);
          n = 0;
          perChunk = 1;
        } else perChunk = clamp(Math.floor(20 / Math.max(cost, 0.5)), 1, 24);
        if (n >= total || performance.now() > deadline) {
          computeRects();
          renderFrame();
          staticDone = true;
          el.dataset.fluidReady = "1";
          return;
        }
      } catch (e) {
        stats.errors++;
        return;
      }
      requestAnimationFrame(chunk);
    };
    requestAnimationFrame(chunk);
  }
  function refreshMode() {
    if (isStatic()) {
      if (running || !staticDone) {
        if (fxOff() && tierIdx !== 3) setTier(3, true);
        runStatic();
      }
    } else if (!running) {
      staticToken++;
      delete el.dataset.fluidReady;
      start();
    }
  }

  // ---- observers
  const onVis = () => (document.hidden ? stop() : start());
  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    visible ? start() : stop();
  });
  let rsz = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(rsz);
    rsz = requestAnimationFrame(() => {
      if (!destroyed && !lost) resize(false);
    });
  });
  const mo = new MutationObserver(() => {
    pal = readPalette();
    if (!running) drawOnce();
    refreshMode();
  });
  const onMq = () => refreshMode();
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    stop();
  };
  const onRestored = () => {
    try {
      lost = false;
      sim = null;
      scene = null;
      bloomDown = [];
      bloomUp = [];
      initGL();
      const [w, h] = canvasSize();
      W = w;
      H = h;
      allocRender();
      allocSim(false);
      computeRects();
      warmLeft = T.warm;
      isStatic() ? runStatic() : start();
    } catch (err) {
      stats.errors++;
    }
  };

  // ---- init
  try {
    initGL();
    baseTier = choosePreferredTier();
    tierIdx = baseTier;
    T = TIERS[tierIdx];
    stats.tierHistory.push(tierIdx);
    el.dataset.fluidTier = String(tierIdx);
    const [w, h] = canvasSize();
    W = w;
    H = h;
    aspect = W / H;
    canvas.width = W;
    canvas.height = H;
    allocRender();
    allocSim(false);
  } catch (e) {
    // float render targets unusable: hand over to the 2-D fallback
    try {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch (e2) {}
    return fallback(el, canvas, freshCanvas, opts);
  }
  computeRects();
  warmLeft = T.warm;
  el.addEventListener("pointermove", onPointer, { passive: true });
  el.addEventListener("pointerleave", onLeave, { passive: true });
  el.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  mq.addEventListener?.("change", onMq);
  io.observe(el);
  ro.observe(el);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-setting", "class", "data-fx"] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => !destroyed && computeRects());
  rectTimer = setInterval(() => !destroyed && computeRects(), 1500);

  el.dataset.heroState = isStatic() ? "static" : "running";
  if (isStatic()) runStatic();
  else start();

  function meanVelocity() {
    const S = sim;
    const buf = new Float32Array(S.w * S.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.read.fbo);
    gl.readPixels(0, 0, S.w, S.h, gl.RGBA, gl.FLOAT, buf);
    let sx = 0,
      sy = 0,
      n = 0;
    for (let i = 0; i < buf.length; i += 4) {
      sx += buf[i];
      sy += buf[i + 1];
      n++;
    }
    return [sx / n, sy / n];
  }
  function sampleVelocity(u, v) {
    const S = sim;
    const px = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.read.fbo);
    gl.readPixels(clamp(Math.round(u * S.w), 0, S.w - 1), clamp(Math.round(v * S.h), 0, S.h - 1), 1, 1, gl.RGBA, gl.FLOAT, px);
    return [px[0], px[1]];
  }

  const api = {
    pause: stop,
    resume: start,
    get running() {
      return running;
    },
    get tier() {
      return tierIdx;
    },
    setTier,
    stats: () => ({
      tier: tierIdx,
      baseTier,
      ms: stats.ms,
      medians: stats.medians.slice(),
      tierHistory: stats.tierHistory.slice(),
      errors: stats.errors,
      warmLeft,
      grid: sim ? [sim.w, sim.h] : null,
      canvas: [W, H],
      gust: gust.slice(),
    }),
    // Under-the-hood panel hooks. probe(true) starts the <= 1 Hz divergence measurement (first result on the next simulated frame);
    // probe(false) stops it. getStats() is a plain snapshot, no GPU work.
    probe(on) {
      probeOn = !!on;
      if (probeOn) probeLast = 0;
    },
    getStats: () => ({
      t: performance.now(),
      frames: frameCount,
      running,
      static: isStatic(),
      tier: tierIdx,
      grid: sim ? [sim.w, sim.h] : null,
      dyeGrid: sim ? [sim.dw, sim.dh] : null,
      iters: T.iters,
      msMedian: stats.ms,
      stepsPerFrame: stats.stepsPerFrame,
      warmLeft,
      probe: probeRes,
    }),
    splat: (x, y, dx, dy) => pushSplat(x, 1 - y, dx, -dy, 0.3, 0.2, 0.05),
    debug: {
      gl,
      meanVelocity,
      sampleVelocity,
      geo: () => geo(),
      step: (n = 1) => {
        for (let i = 0; i < n; i++) step(1 / 30);
        drawOnce();
      },
    },
    destroyError: null,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      staticToken++;
      stop();
      clearInterval(rectTimer);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      mq.removeEventListener?.("change", onMq);
      try {
        if (!lost) {
          freeSim();
          freeBloom();
          for (const k in progs) gl.deleteProgram(progs[k].id);
          gl.deleteVertexArray(vao);
          api.destroyError = gl.getError();
        }
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch (e) {}
      progs = {};
      freshCanvas(); // a lost context can never be re-acquired on the same canvas
      delete el.dataset.heroState;
      delete el.dataset.fluidTier;
      delete el.dataset.fluidMs;
      delete el.dataset.fluidReady;
      delete el.__fluid;
    },
  };
  el.__fluid = api;
  return api;
}

// ---------------------------------------------------------------- fallback
async function fallback(el, canvas, freshCanvas, opts) {
  const c = freshCanvas(); // a canvas whose webgl attempt failed must not be reused for 2d
  const mod = await import(new URL("./streamlines.js", import.meta.url).href);
  const api = mod.mount(el, opts);
  el.dataset.fluidFallback = "1";
  return {
    pause: api.pause,
    resume: api.resume,
    get running() {
      return api.running;
    },
    fallback: true,
    destroy() {
      api.destroy();
      delete el.dataset.fluidFallback;
    },
  };
}
