// Porträt als ASCII, gerechnet im Fragment-Shader. Idee aus Igors ASCII-Effekt:
// Bild in Zellen rastern, Helligkeit pro Zelle bestimmen, passendes Zeichen aus einem
// Glyphen-Atlas nehmen. Dunkle Stellen bekommen dichte Zeichen, die helle Wand bleibt leer.
// Unter der Maus liegt eine Lupe, die das echte Foto leicht gewölbt zeigt.

import { cssVar, toRgb, reducedMotion, imageReady } from './util.js';

const RAMP = ' .:-=+*%#@';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPhoto;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform vec2 uCover;
uniform float uCell;
uniform float uGlyphs;
uniform vec2 uMouse;
uniform float uLens;
uniform float uLensOn;
uniform float uReveal;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uBg;

vec2 cover(vec2 uv) { return (uv - 0.5) * uCover + 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 frag = vUv * uRes;
  vec2 cell = floor(frag / uCell);
  vec2 cuv = (cell + 0.5) * uCell / uRes;
  vec3 photo = texture2D(uPhoto, cover(cuv)).rgb;
  float l = luma(photo);

  // Kanten aus den Nachbarzellen: so bekommen Kinn, Nase und Ohren eine Kontur
  vec2 cellUv = uCell / uRes;
  float lx = luma(texture2D(uPhoto, cover(cuv + vec2(cellUv.x, 0.0))).rgb);
  float ly = luma(texture2D(uPhoto, cover(cuv + vec2(0.0, cellUv.y))).rgb);
  float edge = clamp((abs(l - lx) + abs(l - ly)) * 2.4, 0.0, 1.0);

  float v = pow(smoothstep(0.18, 0.88, 1.0 - l), 0.85);
  v = max(v, edge * 0.85);
  v *= mix(0.42, 1.0, smoothstep(0.0, 0.36, cuv.y));
  // beim Einblenden füllen sich die Zeichen von unten nach oben
  v *= smoothstep(cuv.y - 0.08, cuv.y, uReveal * 1.12);

  float idx = floor(v * (uGlyphs - 1.0) + 0.5);
  vec2 g = fract(frag / uCell);
  float a = texture2D(uAtlas, vec2((idx + g.x) / uGlyphs, 1.0 - g.y)).r;
  vec3 ascii = mix(uBg, uInk, a * (0.4 + 0.6 * v));
  // Das Foto bleibt in Graustufen sichtbar, die Zeichen liegen nur als Raster darüber
  float pg = luma(texture2D(uPhoto, cover(vUv)).rgb);
  vec3 gray = vec3(smoothstep(0.02, 0.98, pg));
  vec3 col = mix(gray * (0.82 + 0.18 * a), ascii, 0.16);
  col = mix(uBg, col, smoothstep(vUv.y - 0.08, vUv.y, uReveal * 1.12));

  float r = uLens * uLensOn;
  if (r > 1.0) {
    float d = distance(frag, uMouse);
    if (d < r + 2.0) {
      float q = clamp(d / r, 0.0, 1.0);
      vec2 m = uMouse / uRes;
      vec2 luv = m + (vUv - m) * (0.7 + 0.3 * q * q);
      vec3 real = texture2D(uPhoto, cover(luv)).rgb;
      float inside = 1.0 - smoothstep(r - 1.5, r + 0.5, d);
      col = mix(col, real, inside);
      float ring = 1.0 - smoothstep(0.0, 1.4, abs(d - r));
      col = mix(col, uAccent, ring);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function makeAtlas(px) {
  const c = document.createElement('canvas');
  c.width = px * RAMP.length;
  c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = `500 ${Math.round(px * 0.92)}px "Geist Mono", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...RAMP].forEach((ch, i) => g.fillText(ch, i * px + px / 2, px / 2 + px * 0.06));
  return c;
}

export async function initPortrait() {
  const canvas = document.getElementById('ascii');
  const figure = canvas?.closest('.portrait');
  const frame = canvas?.closest('.portrait-frame');
  const countEl = document.getElementById('ascii-count');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { figure.classList.add('no-webgl'); return; }

  const photo = new Image();
  photo.src = 'assets/img/portrait.jpg';
  await Promise.all([imageReady(photo), document.fonts.load('500 16px "Geist Mono"').catch(() => {})]);
  if (!photo.naturalWidth) { figure.classList.add('no-webgl'); return; }

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn('ASCII-Porträt:', err);
    figure.classList.add('no-webgl');
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uPhoto', 'uAtlas', 'uRes', 'uCover', 'uCell', 'uGlyphs', 'uMouse', 'uLens', 'uLensOn', 'uReveal', 'uInk', 'uAccent', 'uBg']
    .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  const texture = (unit, source, flip, filter) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  texture(0, photo, true, gl.LINEAR);
  gl.uniform1i(U.uPhoto, 0);
  let atlasTex = null;

  const ink = toRgb(cssVar('--fg')).map((x) => x / 255);
  const accent = toRgb(cssVar('--accent')).map((x) => x / 255);
  const bg = toRgb(cssVar('--bg')).map((x) => x / 255);
  gl.uniform3fv(U.uInk, ink);
  gl.uniform3fv(U.uAccent, accent);
  gl.uniform3fv(U.uBg, bg);
  gl.uniform1f(U.uGlyphs, RAMP.length);

  const state = {
    mx: 0, my: 0, tx: 0, ty: 0,
    lens: 0, lensTarget: 0,
    reveal: reducedMotion() ? 1 : 0,
    dpr: 1, cellPx: 8,
    raf: 0,
  };

  const resize = () => {
    const r = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    state.dpr = dpr;

    // Zellgrösse ganzzahlig in Gerätepixeln, damit die Zeichen scharf bleiben
    const css = 5;
    state.cellPx = Math.max(6, Math.round(css * dpr));
    if (atlasTex) gl.deleteTexture(atlasTex);
    atlasTex = texture(1, makeAtlas(state.cellPx), false, gl.NEAREST);
    gl.uniform1i(U.uAtlas, 1);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uCell, state.cellPx);
    gl.uniform1f(U.uLens, Math.round(Math.min(r.width * 0.2, 86) * dpr));
    const ca = canvas.width / canvas.height;
    const ia = photo.naturalWidth / photo.naturalHeight;
    gl.uniform2f(U.uCover, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);

    const cols = Math.floor(canvas.width / state.cellPx);
    const rows = Math.floor(canvas.height / state.cellPx);
    if (countEl) countEl.textContent = `${cols} × ${rows} Zeichen`;
    draw();
  };

  const draw = () => {
    gl.uniform2f(U.uMouse, state.mx, state.my);
    gl.uniform1f(U.uLensOn, state.lens);
    gl.uniform1f(U.uReveal, state.reveal);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  // nur rechnen, wenn sich etwas bewegt
  const animate = () => {
    state.raf = 0;
    const k = 0.22;
    state.mx += (state.tx - state.mx) * k;
    state.my += (state.ty - state.my) * k;
    state.lens += (state.lensTarget - state.lens) * 0.16;
    if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + 0.012);
    draw();
    const moving = Math.abs(state.tx - state.mx) > 0.3 || Math.abs(state.ty - state.my) > 0.3
      || Math.abs(state.lensTarget - state.lens) > 0.002 || state.reveal < 1;
    if (moving) state.raf = requestAnimationFrame(animate);
  };
  const kick = () => { if (!state.raf) state.raf = requestAnimationFrame(animate); };

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * state.dpr, (r.bottom - e.clientY) * state.dpr];
  };

  canvas.addEventListener('pointerenter', (e) => {
    const [x, y] = toLocal(e);
    if (state.lens < 0.05) { state.mx = x; state.my = y; }
    state.tx = x; state.ty = y;
    state.lensTarget = 1;
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toLocal(e);
    state.tx = x; state.ty = y;
    kick();
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    frame.classList.add('is-touching');
    const [x, y] = toLocal(e);
    state.mx = state.tx = x;
    state.my = state.ty = y;
    state.lensTarget = 1;
    kick();
  });
  const leave = (e) => {
    if (e.type === 'pointerleave' && e.pointerType !== 'mouse') return;
    frame.classList.remove('is-touching');
    state.lensTarget = 0;
    kick();
  };
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(e); });
  canvas.addEventListener('pointercancel', leave);

  new ResizeObserver(resize).observe(canvas);
  resize();

  // Zeichen erst einblenden, wenn das Bild in Sicht kommt
  if (state.reveal < 1) {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      kick();
    }, { threshold: 0.25 });
    io.observe(canvas);
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); figure.classList.add('no-webgl'); });
}
