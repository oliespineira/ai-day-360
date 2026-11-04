// The 360° gallery: a space you stand inside, with the films floating around you.
// On a computer or phone you drag to look around. In a VR headset (Meta Quest)
// you press "Enter VR", point at a film with the controller and press the trigger.
// The films themselves still play on YouTube.
import * as THREE from 'three';
import { thumb } from './playlist.js';

// ---------- Sizes (in metres) ----------
const EYE = 1.6;                 // eye height when not in VR
const PANEL_W = 1.5;
const CANVAS_W = 1024;
const CANVAS_H = 780;
const PANEL_H = PANEL_W * CANVAS_H / CANVAS_W;
const GAP = 0.4;                 // space between films
const ROW_GAP = 0.22;
const MAX_PER_ROW = 10;
const MIN_RADIUS = 3.2;
const HEAD_CANVAS_H = 300;
const HEAD_W = 2.6;

// ---------- Sky: the site's nebula, painted once all the way around ----------
const SNOISE_3D = /* glsl */ `
  // 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

const bakeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Same colours and shapes as js/background.js, but computed from a direction
// so the picture wraps around the viewer with no seam.
const bakeFragment = /* glsl */ `
  varying vec2 vUv;
  ${SNOISE_3D}
  void main() {
    float lon = (vUv.x - 0.5) * 6.2831853;
    float lat = (vUv.y - 0.5) * 3.1415927;
    vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));

    vec3 p = d * 1.4;
    p += vec3(snoise(p + 3.1), snoise(p - 7.4), snoise(p + 11.2)) * 0.35;

    float beam = smoothstep(0.1, 0.8, snoise(vec3(p.x + p.y * 1.5, p.z * 1.2, 0.4)));
    float haze = smoothstep(-0.2, 0.9, snoise(p * 1.8 + 5.0)) * 0.22;
    vec3 glow = mix(vec3(0.15, 0.25, 0.85), vec3(0.4, 0.2, 0.9), snoise(d * 1.5) * 0.5 + 0.5);

    vec3 color = vec3(0.01, 0.01, 0.02) + glow * (beam * 0.7 + haze);
    // Darker below the horizon, so there is a sense of ground under your feet.
    color *= mix(0.3, 1.0, smoothstep(-0.65, 0.12, d.y));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const skyVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(map, vUv); }
`;

// ---------- Canvas drawing helpers ----------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsize(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrapLines(ctx, text, max, maxLines) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let w = 0; w < words.length; w++) {
    const test = line ? `${line} ${words[w]}` : words[w];
    if (!line || ctx.measureText(test).width <= max) { line = test; continue; }
    lines.push(line);
    if (lines.length === maxLines) {
      lines[maxLines - 1] = ellipsize(ctx, `${line} ${words.slice(w).join(' ')}`, max);
      return lines;
    }
    line = words[w];
  }
  if (line) lines.push(line);
  return lines.map((l) => ellipsize(ctx, l, max));
}

const FONT_DISPLAY = '"Unbounded", "Segoe UI", system-ui, sans-serif';
const FONT_BODY = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = Promise.all([
    document.fonts.load(`700 72px ${FONT_DISPLAY}`),
    document.fonts.load(`500 40px ${FONT_DISPLAY}`),
    document.fonts.load(`500 30px ${FONT_BODY}`),
  ]).catch(() => {});
  return Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

// Thumbnails, loaded once and shared.
const images = new Map();
function loadThumb(id) {
  if (images.has(id)) return images.get(id);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // YouTube's image server allows this, so WebGL can use it
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = thumb(id, 'hqdefault');
  });
  images.set(id, promise);
  return promise;
}

function drawPanel(ctx, item, label, badge, img) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const IMG_H = 576;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 40);
  ctx.clip();

  ctx.fillStyle = '#0a0c1e';
  ctx.fillRect(0, 0, W, H);

  if (img) {
    // hqdefault is 480×360 with black bars; take the 16:9 middle.
    ctx.drawImage(img, 0, 45, 480, 270, 0, 0, W, IMG_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, IMG_H);
    g.addColorStop(0, '#1b2580');
    g.addColorStop(1, '#3a1f86');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, IMG_H);
  }

  // Thin glow line between picture and text
  const line = ctx.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, 'rgba(107, 134, 255, 0)');
  line.addColorStop(0.5, 'rgba(140, 160, 255, 0.9)');
  line.addColorStop(1, 'rgba(154, 134, 255, 0)');
  ctx.fillStyle = line;
  ctx.fillRect(0, IMG_H, W, 3);

  // 360° badge
  ctx.font = `600 30px ${FONT_BODY}`;
  const bw = ctx.measureText(badge).width + 40;
  roundRectPath(ctx, 28, 28, bw, 54, 27);
  ctx.fillStyle = 'rgba(3, 3, 5, 0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 165, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#e8ebff';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, 48, 56);

  // Group and title
  ctx.textBaseline = 'alphabetic';
  const pad = 40;
  const max = W - pad * 2;
  let y = IMG_H + 62;
  if (item.group) {
    ctx.font = `500 32px ${FONT_BODY}`;
    ctx.fillStyle = '#9ba3cc';
    ctx.fillText(ellipsize(ctx, item.group, max), pad, y);
    y += 58;
  } else {
    y += 8;
  }
  ctx.font = `500 42px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#e8ebff';
  for (const l of wrapLines(ctx, label, max, 2)) {
    ctx.fillText(l, pad, y);
    y += 52;
  }
  ctx.restore();

  // Border
  roundRectPath(ctx, 1.5, 1.5, W - 3, H - 3, 39);
  ctx.strokeStyle = 'rgba(150, 165, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawHeading(ctx, title, hint) {
  const W = CANVAS_W;
  ctx.clearRect(0, 0, W, HEAD_CANVAS_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let size = 84;
  ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
  while (size > 40 && ctx.measureText(title).width > W - 60) {
    size -= 4;
    ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
  }
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.15, '#ffffff');
  g.addColorStop(0.5, '#cdd5ff');
  g.addColorStop(0.85, '#9a86ff');
  ctx.shadowColor = 'rgba(91, 123, 255, 0.55)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = g;
  ctx.fillText(title, W / 2, 130);
  ctx.shadowBlur = 0;

  ctx.font = `500 38px ${FONT_BODY}`;
  ctx.fillStyle = '#c3c9ea';
  ctx.fillText(ellipsize(ctx, hint, W - 60), W / 2, 220);
}

// ---------- The space ----------
export function createSpace({ getItems, t, onSelect, onOpen, onClose }) {
  const $ = (id) => document.getElementById(id);
  const root = $('space');
  const canvas = $('spaceCanvas');
  const hintEl = $('spaceHint');
  const vrBtn = $('vrBtn');
  const live = $('spaceLive');
  const pageParts = [
    document.querySelector('.site-header'),
    document.querySelector('main'),
    document.querySelector('.site-footer'),
  ];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');

  let renderer = null;
  let scene, camera, world, cosmos, filmsGroup, heading;
  let panels = [];
  let panelIds = '';
  let isOpen = false;
  let lastFocus = null;
  let vrSupported = false;
  let xrSession = null;
  let pendingSelect = null;

  // Looking around (when not in VR)
  let yaw = 0;
  let pitch = 0;
  let targetYaw = null;
  let hovered = -1;
  let focused = 0;
  let keyboardMode = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tmpMatrix = new THREE.Matrix4();
  const controllers = [];
  const clock = new THREE.Clock();

  // ---------- Is VR available? ----------
  const vrCheck = (navigator.xr && navigator.xr.isSessionSupported)
    ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false)
    : Promise.resolve(false);
  vrCheck.then((ok) => {
    vrSupported = Boolean(ok);
    vrBtn.hidden = !vrSupported;
    renderHint();
  });

  // ---------- Build the scene (once) ----------
  function build() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (err) {
      console.warn('WebGL unavailable, the 360° gallery cannot open.', err);
      renderer = null;
      return false;
    }
    const isQuest = /OculusBrowser|Quest/i.test(navigator.userAgent);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isQuest ? 1 : 2));
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030305);
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    world = new THREE.Group();
    scene.add(world);

    // Sky: bake the nebula into a texture once, then wrap it around a big sphere.
    const target = new THREE.WebGLRenderTarget(2048, 1024);
    const bakeScene = new THREE.Scene();
    const bakeMat = new THREE.ShaderMaterial({ vertexShader: bakeVertex, fragmentShader: bakeFragment });
    bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat));
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(null);
    bakeMat.dispose();

    cosmos = new THREE.Group();
    world.add(cosmos);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 64, 32),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { map: { value: target.texture } },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    cosmos.add(sky);

    // Stars
    const STARS = 1400;
    const positions = new Float32Array(STARS * 3);
    const colors = new Float32Array(STARS * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < STARS; i++) {
      v.randomDirection().multiplyScalar(52 + Math.random() * 5);
      positions.set([v.x, v.y, v.z], i * 3);
      const b = 0.35 + Math.random() * 0.65;
      colors.set([b * 0.85, b * 0.9, b], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cosmos.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    })));

    // A glowing ring where you stand
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.585, 96),
      new THREE.MeshBasicMaterial({ color: 0x6b86ff, transparent: true, opacity: 0.6 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    world.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 96),
      new THREE.MeshBasicMaterial({ color: 0x2640d9, transparent: true, opacity: 0.12 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.005;
    world.add(disc);

    // Films
    filmsGroup = new THREE.Group();
    world.add(filmsGroup);

    // Heading
    const headCanvas = document.createElement('canvas');
    headCanvas.width = CANVAS_W;
    headCanvas.height = HEAD_CANVAS_H;
    const headTex = new THREE.CanvasTexture(headCanvas);
    headTex.colorSpace = THREE.SRGBColorSpace;
    heading = new THREE.Mesh(
      new THREE.PlaneGeometry(HEAD_W, HEAD_W * HEAD_CANVAS_H / CANVAS_W),
      new THREE.MeshBasicMaterial({ map: headTex, transparent: true, depthWrite: false }),
    );
    heading.userData = { canvas: headCanvas, ctx: headCanvas.getContext('2d'), texture: headTex };
    world.add(heading);

    // VR controllers: a thin ray from each, trigger to choose.
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.8 }));
      ray.visible = false;
      controller.add(ray);
      controller.userData = { ray, source: null, hit: -1 };
      controller.addEventListener('connected', (event) => {
        controller.userData.source = event.data;
        ray.visible = event.data.targetRayMode === 'tracked-pointer';
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.source = null;
        ray.visible = false;
      });
      controller.addEventListener('select', () => {
        const hit = intersect(rayFromController(controller));
        if (hit >= 0) chooseInVR(hit);
      });
      scene.add(controller);
      controllers.push(controller);
    }

    renderer.xr.addEventListener('sessionend', onSessionEnd);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', () => { if (!drag) setHovered(-1); });
    canvas.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', resize);

    waitForFonts().then(() => {
      redrawAll();
    });
    return true;
  }

  // ---------- Films as panels ----------
  function labelFor(item, i) { return item.title || t('untitled', i + 1); }

  function layout(count) {
    const rows = count > MAX_PER_ROW ? 2 : 1;
    const perRow = Math.max(1, Math.ceil(count / rows));
    const radius = Math.max(MIN_RADIUS, (perRow * (PANEL_W + GAP)) / (Math.PI * 2));
    const step = (PANEL_W + GAP) / radius;
    const centreY = rows === 2 ? 1.55 : 1.45;
    const rowY = (row) => centreY + ((rows - 1) / 2 - row) * (PANEL_H + ROW_GAP);
    const places = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const col = i - row * perRow;
      // Whole steps, so there is always a film straight ahead.
      const angle = (col - Math.floor((inRow - 1) / 2)) * step;
      places.push({ angle, x: radius * Math.sin(angle), y: rowY(row), z: -radius * Math.cos(angle) });
    }
    return { places, radius, top: rowY(0) + PANEL_H / 2 };
  }

  const panelGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const glowGeo = new THREE.PlaneGeometry(PANEL_W + 0.09, PANEL_H + 0.09);

  function rebuildPanels() {
    const items = getItems();
    for (const p of panels) {
      p.material.map.dispose();
      p.material.dispose();
      p.userData.glow.material.dispose();
    }
    filmsGroup.clear();
    panels = [];

    const { places, radius, top } = layout(items.length);
    items.forEach((item, i) => {
      const c = document.createElement('canvas');
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: 0x6b86ff, transparent: true, opacity: 0, depthWrite: false,
      }));
      glow.position.z = -0.01;
      mesh.add(glow);
      const place = places[i];
      mesh.position.set(place.x, place.y, place.z);
      mesh.lookAt(0, place.y, 0);
      mesh.userData = { index: i, item, ctx: c.getContext('2d'), texture, glow, angle: place.angle, img: null };
      filmsGroup.add(mesh);
      panels.push(mesh);
      loadThumb(item.id).then((img) => {
        if (mesh.userData.item.id !== item.id) return;
        mesh.userData.img = img;
        drawOne(mesh);
      });
    });

    heading.position.set(0, top + 0.45, -radius);
    heading.lookAt(0, heading.position.y, 0);
    focused = Math.min(focused, Math.max(0, panels.length - 1));
    redrawAll();
  }

  function drawOne(mesh) {
    const { ctx, item, index, img, texture } = mesh.userData;
    drawPanel(ctx, item, labelFor(item, index), t('badge'), img);
    texture.needsUpdate = true;
  }

  function drawHead() {
    if (!heading) return;
    const { ctx, texture } = heading.userData;
    drawHeading(ctx, t('heroTitle'), xrSession ? t('spaceHintVR') : t('spaceHintScreen'));
    texture.needsUpdate = true;
  }

  function redrawAll() {
    if (!renderer) return;
    panels.forEach(drawOne);
    drawHead();
  }

  // ---------- Choosing ----------
  function rayFromController(controller) {
    tmpMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
    return raycaster;
  }

  function intersect(caster) {
    const hits = caster.intersectObjects(panels, false);
    return hits.length ? hits[0].object.userData.index : -1;
  }

  function setHovered(index) {
    if (index === hovered) return;
    hovered = index;
    canvas.classList.toggle('is-pointing', index >= 0 && !xrSession);
  }

  function choose(index) {
    if (index < 0 || !getItems()[index]) return;
    onSelect && onSelect(index);
  }

  function chooseInVR(index) {
    pendingSelect = index;
    if (xrSession) xrSession.end();
  }

  // ---------- Pointer: drag to look, click to choose ----------
  let drag = null;

  function pointerToNdc(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }

  function onPointerDown(event) {
    if (xrSession) return;
    drag = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    targetYaw = null;
    keyboardMode = false;
  }

  function onPointerMove(event) {
    if (xrSession) return;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) {
        canvas.classList.add('is-dragging');
        const speed = (camera.fov / 70) * 0.0045;
        yaw += dx * speed;
        pitch = THREE.MathUtils.clamp(pitch + dy * speed, -1.1, 1.1);
        setHovered(-1);
      }
      return;
    }
    if (event.pointerType === 'mouse') {
      keyboardMode = false;
      pointerToNdc(event);
      setHovered(intersect(raycaster));
    }
  }

  function onPointerUp(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const wasClick = drag.moved <= 6 && event.type === 'pointerup';
    drag = null;
    canvas.classList.remove('is-dragging');
    if (wasClick) {
      pointerToNdc(event);
      choose(intersect(raycaster));
    }
  }

  // ---------- Keyboard: arrows move between films, Enter watches ----------
  function focusFilm(index) {
    const items = getItems();
    if (!panels.length) return;
    focused = (index + panels.length) % panels.length;
    keyboardMode = true;
    targetYaw = -panels[focused].userData.angle;
    pitch = 0;
    live.textContent = t('spaceFilm', labelFor(items[focused], focused), focused + 1, items.length);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowRight') { event.preventDefault(); focusFilm(keyboardMode ? focused + 1 : focused); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusFilm(keyboardMode ? focused - 1 : focused); }
    else if ((event.key === 'Enter' || event.key === ' ') && keyboardMode) { event.preventDefault(); choose(focused); }
  }

  function onDocKey(event) {
    if (isOpen && !xrSession && event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onDocKey);

  // ---------- VR ----------
  function enterVR() {
    if (!vrSupported || xrSession || !navigator.xr) return;
    // Must be called straight from a tap or click.
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] })
      .then(async (session) => {
        const floor = !session.enabledFeatures || session.enabledFeatures.includes('local-floor');
        renderer.xr.setReferenceSpaceType(floor ? 'local-floor' : 'local');
        world.position.y = floor ? 0 : -EYE; // without floor tracking, place things around the head
        xrSession = session;
        await renderer.xr.setSession(session);
        hovered = -1;
        drawHead();
      })
      .catch((err) => {
        console.warn('Could not enter VR:', err);
        xrSession = null;
      });
  }

  function onSessionEnd() {
    xrSession = null;
    world.position.y = 0;
    for (const c of controllers) c.userData.hit = -1;
    hovered = -1;
    drawHead();
    resize();
    const index = pendingSelect;
    pendingSelect = null;
    if (index !== null) choose(index);
  }

  // ---------- Frame loop ----------
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);

    if (xrSession) {
      // Point with either controller (or hand)
      let hit = -1;
      for (const c of controllers) {
        if (!c.userData.source) continue;
        const h = intersect(rayFromController(c));
        const hits = h >= 0 ? raycaster.intersectObject(panels[h], false) : [];
        c.userData.ray.scale.z = hits.length ? hits[0].distance : 8;
        if (h >= 0 && h !== c.userData.hit) {
          const haptic = c.userData.source.gamepad && c.userData.source.gamepad.hapticActuators;
          try { haptic && haptic[0] && haptic[0].pulse(0.25, 25); } catch { /* not supported */ }
        }
        c.userData.hit = h;
        if (h >= 0) hit = h;
      }
      hovered = hit;
    } else {
      if (targetYaw !== null) {
        const diff = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
        yaw += reducedMotion.matches ? diff : diff * Math.min(1, dt * 5);
        if (Math.abs(diff) < 0.001) targetYaw = null;
      }
      camera.position.set(0, EYE, 0);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      if (!reducedMotion.matches) cosmos.rotation.y += dt * 0.006;
    }

    const highlight = hovered >= 0 ? hovered : (keyboardMode && !xrSession ? focused : -1);
    for (const p of panels) {
      const on = p.userData.index === highlight;
      const s = THREE.MathUtils.lerp(p.scale.x, on ? 1.06 : 1, Math.min(1, dt * 12));
      p.scale.setScalar(s);
      const g = p.userData.glow.material;
      g.opacity = THREE.MathUtils.lerp(g.opacity, on ? 0.9 : 0, Math.min(1, dt * 12));
    }

    renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer || xrSession) return;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 85 : 70;
    camera.updateProjectionMatrix();
  }

  function renderHint() {
    hintEl.textContent = coarse.matches ? t('spaceHintTouch') : t('spaceHint');
  }

  // ---------- Open and close ----------
  function open({ vr = false } = {}) {
    if (!getItems().length) return;
    if (!build()) return;
    if (!isOpen) {
      lastFocus = document.activeElement;
      isOpen = true;
      root.hidden = false;
      document.body.classList.add('space-open');
      pageParts.forEach((el) => { if (el) el.inert = true; });
      onOpen && onOpen();
    }

    const ids = getItems().map((item) => item.id).join(',');
    if (ids !== panelIds) {
      panelIds = ids;
      rebuildPanels();
    }
    renderHint();
    resize();

    // A short turn towards the films as the space opens.
    yaw = reducedMotion.matches ? 0 : 0.7;
    pitch = 0;
    targetYaw = 0;
    keyboardMode = false;
    clock.getDelta();
    renderer.setAnimationLoop(frame);
    canvas.focus({ preventScroll: true });

    if (vr) enterVR();
  }

  function close() {
    if (!isOpen) return;
    if (xrSession) xrSession.end();
    isOpen = false;
    renderer && renderer.setAnimationLoop(null);
    root.hidden = true;
    document.body.classList.remove('space-open');
    pageParts.forEach((el) => { if (el) el.inert = false; });
    setHovered(-1);
    onClose && onClose();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $('spaceBack').addEventListener('click', close);
  vrBtn.addEventListener('click', enterVR);
  coarse.addEventListener?.('change', renderHint);

  return {
    open,
    close,
    isOpen: () => isOpen,
    vrReady: () => vrCheck,
    // Call when the playlist or the language changes.
    refresh() {
      renderHint();
      if (!renderer) return;
      const ids = getItems().map((item) => item.id).join(',');
      if (ids !== panelIds) {
        panelIds = ids;
        if (isOpen && !getItems().length) { close(); return; }
        rebuildPanels();
      } else {
        // Titles may have changed even when the IDs haven't.
        getItems().forEach((item, i) => { if (panels[i]) panels[i].userData.item = item; });
        redrawAll();
      }
    },
  };
}
