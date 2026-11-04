// Full-bleed WebGL nebula background (Three.js fragment shader).
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float u_time;
  uniform vec2 u_resolution;

  // 2D Simplex noise (Ashima Arts / Stefan Gustavson, MIT)
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x   + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 screen = gl_FragCoord.xy / u_resolution.xy;   // 0..1, used for the vignette
    vec2 uv = screen;
    uv.x *= u_resolution.x / u_resolution.y;

    vec3 baseColor = vec3(0.01, 0.01, 0.02);

    // Liquid coordinate deformation
    vec2 st = uv * 0.7;
    st += vec2(snoise(st + u_time * 0.05), snoise(st - u_time * 0.05)) * 0.3;

    // Sweeping high-contrast light channels
    float beam = smoothstep(0.1, 0.8, snoise(vec2(st.x + st.y * 1.5 - u_time * 0.15, u_time * 0.02)));

    // Soft secondary haze so the dark areas aren't flat
    float haze = smoothstep(-0.2, 0.9, snoise(st * 1.8 + vec2(u_time * 0.03, -u_time * 0.04))) * 0.22;

    vec3 glow = mix(vec3(0.15, 0.25, 0.85), vec3(0.4, 0.2, 0.9),
                    snoise(uv * 1.5 + u_time * 0.1) * 0.5 + 0.5);

    vec3 color = baseColor + glow * (beam * 0.7 + haze);

    // Vignette: darken towards the edges
    float vig = smoothstep(1.05, 0.25, distance(screen, vec2(0.5)));
    color *= mix(0.35, 1.0, vig);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function startBackground(canvas) {
  const noop = { pause() {}, resume() {} };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  } catch (err) {
    console.warn('WebGL unavailable, using the CSS fallback background.', err);
    canvas.remove();
    return noop;
  }

  // Save GPU for video on Meta Quest; otherwise clamp DPR at 2.
  const isQuest = /OculusBrowser|Quest/i.test(navigator.userAgent);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isQuest ? 1 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    u_time: { value: 0 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const size = new THREE.Vector2();
  const clock = new THREE.Clock();
  let paused = false;
  let frame = 0;

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.getDrawingBufferSize(size);
    uniforms.u_resolution.value.copy(size);
    if (reducedMotion.matches || paused) renderOnce();
  }

  function renderOnce() {
    if (reducedMotion.matches) uniforms.u_time.value = 14.0; // a still, pleasant frame
    renderer.render(scene, camera);
  }

  function loop() {
    frame = requestAnimationFrame(loop);
    uniforms.u_time.value += Math.min(clock.getDelta(), 0.1);
    renderer.render(scene, camera);
  }

  function start() {
    cancelAnimationFrame(frame);
    if (paused || document.hidden || reducedMotion.matches) {
      renderOnce();
      return;
    }
    clock.getDelta(); // skip the time spent paused
    loop();
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', start);
  reducedMotion.addEventListener?.('change', start);

  resize();
  start();

  return {
    pause() { paused = true; cancelAnimationFrame(frame); },
    resume() { paused = false; start(); },
  };
}
