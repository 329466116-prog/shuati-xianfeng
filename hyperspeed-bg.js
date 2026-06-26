/* ============================================================================
 * Hyperspeed WebGL 背景动效（刷题先锋页面背景）
 * ----------------------------------------------------------------------------
 * 来源：React Bits (Hyperspeed 组件)
 * 移植：vanilla JS / ESM (刷题先锋无 React)
 * 日期：2026-06-26（多多要求把这个动效作为刷题先锋的页面背景）
 * ----------------------------------------------------------------------------
 * 依赖（通过 importmap CDN 加载）：
 *   - three@0.160.0        https://unpkg.com/three@0.160.0/build/three.module.js
 *   - postprocessing@6.34.2 https://unpkg.com/postprocessing@6.34.2/build/index.js
 * ----------------------------------------------------------------------------
 * 关键改造（vs React 原版）：
 *   1. 去掉所有 THREE.ShaderChunk['fog_*'] 引用（React 原版在 fog material.fog=false
 *      时 shader 编译会失败，雾效果去掉后视觉影响极小）
 *   2. 重排模板字符串：让 #include <getDistortion_vertex> 占位符独占一行
 *      （GLSL 预处理要求 # 指令必须在行首，否则报 "'#' : invalid character"）
 *   3. 把 distortion getDistortion 字符串里的 #define PI 提到独立行首
 *   4. WebGL 检测失败 → body.no-webgl 类隐藏 canvas，回退到 .bg-blobs
 * ============================================================================ */
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing';

// ==================== Hyperspeed 完整源码（vanilla 翻译）====================
const DEFAULT_EFFECT_OPTIONS = {
  onSpeedUp: () => {},
  onSlowDown: () => {},
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 4,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [400 * 0.03, 400 * 0.2],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0xffffff,
    brokenLines: 0xffffff,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3
  }
};

const mountainUniforms = {
  uFreq: { value: new THREE.Vector3(3, 6, 10) },
  uAmp: { value: new THREE.Vector3(30, 30, 20) }
};
const xyUniforms = {
  uFreq: { value: new THREE.Vector2(5, 2) },
  uAmp: { value: new THREE.Vector2(25, 15) }
};
const LongRaceUniforms = {
  uFreq: { value: new THREE.Vector2(2, 3) },
  uAmp: { value: new THREE.Vector2(35, 10) }
};
const turbulentUniforms = {
  uFreq: { value: new THREE.Vector4(4, 8, 8, 1) },
  uAmp: { value: new THREE.Vector4(25, 5, 10, 10) }
};
const deepUniforms = {
  uFreq: { value: new THREE.Vector2(4, 8) },
  uAmp: { value: new THREE.Vector2(10, 20) },
  uPowY: { value: new THREE.Vector2(20, 2) }
};
let nsin = val => Math.sin(val) * 0.5 + 0.5;

const distortions = {
  mountainDistortion: { uniforms: mountainUniforms, getDistortion: `uniform vec3 uAmp; uniform vec3 uFreq; #define PI 3.14159265358979 float nsin(float val){return sin(val) * 0.5 + 0.5;} vec3 getDistortion(float progress){ float movementProgressFix = 0.02; return vec3( cos(progress * PI * uFreq.x + uTime) * uAmp.x - cos(movementProgressFix * PI * uFreq.x + uTime) * uAmp.x, nsin(progress * PI * uFreq.y + uTime) * uAmp.y - nsin(movementProgressFix * PI * uFreq.y + uTime) * uAmp.y, nsin(progress * PI * uFreq.z + uTime) * uAmp.z - nsin(movementProgressFix * PI * uFreq.z + uTime) * uAmp.z ); }`, getJS: (progress, time) => { let movementProgressFix = 0.02; let uFreq = mountainUniforms.uFreq.value; let uAmp = mountainUniforms.uAmp.value; let distortion = new THREE.Vector3( Math.cos(progress * Math.PI * uFreq.x + time) * uAmp.x - Math.cos(movementProgressFix * Math.PI * uFreq.x + time) * uAmp.x, nsin(progress * Math.PI * uFreq.y + time) * uAmp.y - nsin(movementProgressFix * Math.PI * uFreq.y + time) * uAmp.y, nsin(progress * Math.PI * uFreq.z + time) * uAmp.z - nsin(movementProgressFix * Math.PI * uFreq.z + time) * uAmp.z ); let lookAtAmp = new THREE.Vector3(2, 2, 2); let lookAtOffset = new THREE.Vector3(0, 0, -5); return distortion.multiply(lookAtAmp).add(lookAtOffset); } },
  xyDistortion: { uniforms: xyUniforms, getDistortion: `uniform vec2 uFreq; uniform vec2 uAmp; #define PI 3.14159265358979 vec3 getDistortion(float progress){ float movementProgressFix = 0.02; return vec3( cos(progress * PI * uFreq.x + uTime) * uAmp.x - cos(movementProgressFix * PI * uFreq.x + uTime) * uAmp.x, sin(progress * PI * uFreq.y + PI/2. + uTime) * uAmp.y - sin(movementProgressFix * PI * uFreq.y + PI/2. + uTime) * uAmp.y, 0. ); }`, getJS: (progress, time) => { let movementProgressFix = 0.02; let uFreq = xyUniforms.uFreq.value; let uAmp = xyUniforms.uAmp.value; let distortion = new THREE.Vector3( Math.cos(progress * Math.PI * uFreq.x + time) * uAmp.x - Math.cos(movementProgressFix * Math.PI * uFreq.x + time) * uAmp.x, Math.sin(progress * Math.PI * uFreq.y + time + Math.PI / 2) * uAmp.y - Math.sin(movementProgressFix * Math.PI * uFreq.y + time + Math.PI / 2) * uAmp.y, 0 ); let lookAtAmp = new THREE.Vector3(2, 0.4, 1); let lookAtOffset = new THREE.Vector3(0, 0, -3); return distortion.multiply(lookAtAmp).add(lookAtOffset); } },
  LongRaceDistortion: { uniforms: LongRaceUniforms, getDistortion: `uniform vec2 uFreq; uniform vec2 uAmp; #define PI 3.14159265358979 vec3 getDistortion(float progress){ float camProgress = 0.0125; return vec3( sin(progress * PI * uFreq.x + uTime) * uAmp.x - sin(camProgress * PI * uFreq.x + uTime) * uAmp.x, sin(progress * PI * uFreq.y + uTime) * uAmp.y - sin(camProgress * PI * uFreq.y + uTime) * uAmp.y, 0. ); }`, getJS: (progress, time) => { let camProgress = 0.0125; let uFreq = LongRaceUniforms.uFreq.value; let uAmp = LongRaceUniforms.uAmp.value; let distortion = new THREE.Vector3( Math.sin(progress * Math.PI * uFreq.x + time) * uAmp.x - Math.sin(camProgress * Math.PI * uFreq.x + time) * uAmp.x, Math.sin(progress * Math.PI * uFreq.y + time) * uAmp.y - Math.sin(camProgress * Math.PI * uFreq.y + time) * uAmp.y, 0 ); let lookAtAmp = new THREE.Vector3(1, 1, 0); let lookAtOffset = new THREE.Vector3(0, 0, -5); return distortion.multiply(lookAtAmp).add(lookAtOffset); } },
  turbulentDistortion: { uniforms: turbulentUniforms, getDistortion: `#define PI 3.14159265358979\nuniform vec4 uFreq; uniform vec4 uAmp;\nfloat nsin(float val){return sin(val) * 0.5 + 0.5;}\nfloat getDistortionX(float progress){\n return ( cos(PI * progress * uFreq.r + uTime) * uAmp.r + pow(cos(PI * progress * uFreq.g + uTime * (uFreq.g / uFreq.r)), 2. ) * uAmp.g );\n}\nfloat getDistortionY(float progress){\n return ( -nsin(PI * progress * uFreq.b + uTime) * uAmp.b + -pow(nsin(PI * progress * uFreq.a + uTime / (uFreq.b / uFreq.a)), 5.) * uAmp.a );\n}\nvec3 getDistortion(float progress){\n return vec3( getDistortionX(progress) - getDistortionX(0.0125), getDistortionY(progress) - getDistortionY(0.0125), 0. );\n}`, getJS: (progress, time) => { const uFreq = turbulentUniforms.uFreq.value; const uAmp = turbulentUniforms.uAmp.value; const getX = p => Math.cos(Math.PI * p * uFreq.x + time) * uAmp.x + Math.pow(Math.cos(Math.PI * p * uFreq.y + time * (uFreq.y / uFreq.x)), 2) * uAmp.y; const getY = p => -nsin(Math.PI * p * uFreq.z + time) * uAmp.z - Math.pow(nsin(Math.PI * p * uFreq.w + time / (uFreq.z / uFreq.w)), 5) * uAmp.w; let distortion = new THREE.Vector3( getX(progress) - getX(progress + 0.007), getY(progress) - getY(progress + 0.007), 0 ); let lookAtAmp = new THREE.Vector3(-2, -5, 0); let lookAtOffset = new THREE.Vector3(0, 0, -10); return distortion.multiply(lookAtAmp).add(lookAtOffset); } },
  deepDistortion: { uniforms: deepUniforms, getDistortion: `#define PI 3.14159265358979\nuniform vec4 uFreq; uniform vec4 uAmp; uniform vec2 uPowY;\nfloat nsin(float val){return sin(val) * 0.5 + 0.5;}\nfloat getDistortionX(float progress){\n return ( sin(progress * PI * uFreq.x + uTime) * uAmp.x );\n}\nfloat getDistortionY(float progress){\n return ( pow(abs(progress * uPowY.x), uPowY.y) + sin(progress * PI * uFreq.y + uTime) * uAmp.y );\n}\nvec3 getDistortion(float progress){\n return vec3( getDistortionX(progress) - getDistortionX(0.02), getDistortionY(progress) - getDistortionY(0.02), 0. );\n}`, getJS: (progress, time) => { const uFreq = deepUniforms.uFreq.value; const uAmp = deepUniforms.uAmp.value; const uPowY = deepUniforms.uPowY.value; const getX = p => Math.sin(p * Math.PI * uFreq.x + time) * uAmp.x; const getY = p => Math.pow(p * uPowY.x, uPowY.y) + Math.sin(p * Math.PI * uFreq.y + time) * uAmp.y; let distortion = new THREE.Vector3( getX(progress) - getX(progress + 0.01), getY(progress) - getY(progress + 0.01), 0 ); let lookAtAmp = new THREE.Vector3(-2, -4, 0); let lookAtOffset = new THREE.Vector3(0, 0, -10); return distortion.multiply(lookAtAmp).add(lookAtOffset); } }
};

class App {
  constructor(container, options = {}) {
    this.options = options;
    if (this.options.distortion == null) {
      this.options.distortion = { uniforms: distortion_uniforms, getDistortion: distortion_vertex };
    }
    this.container = container;
    this.hasValidSize = false;
    const initW = Math.max(1, container.offsetWidth);
    const initH = Math.max(1, container.offsetHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(initW, initH, false);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.composer = new EffectComposer(this.renderer);
    container.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(options.fov, initW / initH, 0.1, 10000);
    this.camera.position.z = -5;
    this.camera.position.y = 8;
    this.camera.position.x = 0;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.clock = new THREE.Clock();
    this.assets = {};
    this.disposed = false;
    this.road = new Road(this, options);
    this.leftCarLights = new CarLights(this, options, options.colors.leftCars, options.movingAwaySpeed, new THREE.Vector2(0, 1 - options.carLightsFade));
    this.rightCarLights = new CarLights(this, options, options.colors.rightCars, options.movingCloserSpeed, new THREE.Vector2(1, 0 + options.carLightsFade));
    this.leftSticks = new LightsSticks(this, options);
    this.fovTarget = options.fov;
    this.speedUpTarget = 0;
    this.speedUp = 0;
    this.timeOffset = 0;
    this.tick = this.tick.bind(this);
    this.init = this.init.bind(this);
    this.setSize = this.setSize.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize);
    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      this.hasValidSize = true;
    }
  }
  onWindowResize() {
    const width = this.container.offsetWidth;
    const height = this.container.offsetHeight;
    if (width <= 0 || height <= 0) { this.hasValidSize = false; return; }
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
    this.hasValidSize = true;
  }
  initPasses() {
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new EffectPass(this.camera, new BloomEffect({ luminanceThreshold: 0.2, luminanceSmoothing: 0, resolutionScale: 1 }));
    const smaaPass = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM, searchImage: SMAAEffect.searchImageDataURL, areaImage: SMAAEffect.areaImageDataURL }));
    this.renderPass.renderToScreen = false;
    this.bloomPass.renderToScreen = false;
    smaaPass.renderToScreen = true;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(smaaPass);
  }
  loadAssets() {
    const assets = this.assets;
    return new Promise(resolve => {
      const manager = new THREE.LoadingManager(resolve);
      const searchImage = new Image();
      const areaImage = new Image();
      assets.smaa = {};
      searchImage.addEventListener('load', function () { assets.smaa.search = this; manager.itemEnd('smaa-search'); });
      areaImage.addEventListener('load', function () { assets.smaa.area = this; manager.itemEnd('smaa-area'); });
      manager.itemStart('smaa-search');
      manager.itemStart('smaa-area');
      searchImage.src = SMAAEffect.searchImageDataURL;
      areaImage.src = SMAAEffect.areaImageDataURL;
    });
  }
  init() {
    this.initPasses();
    const options = this.options;
    this.road.init();
    this.leftCarLights.init();
    this.leftCarLights.mesh.position.setX(-options.roadWidth / 2 - options.islandWidth / 2);
    this.rightCarLights.init();
    this.rightCarLights.mesh.position.setX(options.roadWidth / 2 + options.islandWidth / 2);
    this.leftSticks.init();
    this.leftSticks.mesh.position.setX(-(options.roadWidth + options.islandWidth / 2));
    this.container.addEventListener('mousedown', this.onMouseDown);
    this.container.addEventListener('mouseup', this.onMouseUp);
    this.container.addEventListener('mouseout', this.onMouseUp);
    this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
    this.container.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    this.container.addEventListener('contextmenu', this.onContextMenu);
    this.tick();
  }
  onMouseDown(ev) { if (this.options.onSpeedUp) this.options.onSpeedUp(ev); this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
  onMouseUp(ev) { if (this.options.onSlowDown) this.options.onSlowDown(ev); this.fovTarget = this.options.fov; this.speedUpTarget = 0; }
  onTouchStart(ev) { if (this.options.onSpeedUp) this.options.onSpeedUp(ev); this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
  onTouchEnd(ev) { if (this.options.onSlowDown) this.options.onSlowDown(ev); this.fovTarget = this.options.fov; this.speedUpTarget = 0; }
  onContextMenu(ev) { ev.preventDefault(); }
  update(delta) {
    let lerpPercentage = Math.exp(-(-60 * Math.log2(1 - 0.1)) * delta);
    this.speedUp += lerp(this.speedUp, this.speedUpTarget, lerpPercentage, 0.00001);
    this.timeOffset += this.speedUp * delta;
    let time = this.clock.elapsedTime + this.timeOffset;
    this.rightCarLights.update(time);
    this.leftCarLights.update(time);
    this.leftSticks.update(time);
    this.road.update(time);
    let updateCamera = false;
    let fovChange = lerp(this.camera.fov, this.fovTarget, lerpPercentage);
    if (fovChange !== 0) { this.camera.fov += fovChange * delta * 6; updateCamera = true; }
    if (this.options.distortion.getJS) {
      const distortion = this.options.distortion.getJS(0.025, time);
      this.camera.lookAt(new THREE.Vector3(this.camera.position.x + distortion.x, this.camera.position.y + distortion.y, this.camera.position.z + distortion.z));
      updateCamera = true;
    }
    if (updateCamera) this.camera.updateProjectionMatrix();
  }
  render(delta) { this.composer.render(delta); }
  dispose() {
    this.disposed = true;
    if (this.scene) {
      this.scene.traverse(object => {
        const obj = object;
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose(); }
      });
      this.scene.clear();
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.composer) this.composer.dispose();
    window.removeEventListener('resize', this.onWindowResize);
    if (this.container) {
      this.container.removeEventListener('mousedown', this.onMouseDown);
      this.container.removeEventListener('mouseup', this.onMouseUp);
      this.container.removeEventListener('mouseout', this.onMouseUp);
      this.container.removeEventListener('touchstart', this.onTouchStart);
      this.container.removeEventListener('touchend', this.onTouchEnd);
      this.container.removeEventListener('touchcancel', this.onTouchEnd);
      this.container.removeEventListener('contextmenu', this.onContextMenu);
    }
  }
  setSize(width, height, updateStyles) {
    if (width <= 0 || height <= 0) { this.hasValidSize = false; return; }
    this.composer.setSize(width, height, updateStyles);
    this.hasValidSize = true;
  }
  tick() {
    if (this.disposed) return;
    if (!this.hasValidSize) {
      const w = this.container.offsetWidth;
      const h = this.container.offsetHeight;
      if (w > 0 && h > 0) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h); this.hasValidSize = true; }
      else { requestAnimationFrame(this.tick); return; }
    }
    if (resizeRendererToDisplaySize(this.renderer, this.setSize)) {
      const canvas = this.renderer.domElement;
      if (this.hasValidSize) { this.camera.aspect = canvas.clientWidth / canvas.clientHeight; this.camera.updateProjectionMatrix(); }
    }
    if (this.hasValidSize) { const delta = this.clock.getDelta(); this.render(delta); this.update(delta); }
    requestAnimationFrame(this.tick);
  }
}

const distortion_uniforms = {
  uDistortionX: { value: new THREE.Vector2(80, 3) },
  uDistortionY: { value: new THREE.Vector2(-40, 2.5) }
};
const distortion_vertex = `#define PI 3.14159265358979 uniform vec2 uDistortionX; uniform vec2 uDistortionY; float nsin(float val){return sin(val) * 0.5 + 0.5;} vec3 getDistortion(float progress){ progress = clamp(progress, 0., 1.); float xAmp = uDistortionX.r; float xFreq = uDistortionX.g; float yAmp = uDistortionY.r; float yFreq = uDistortionY.g; return vec3( xAmp * nsin(progress * PI * xFreq - PI / 2.), yAmp * nsin(progress * PI * yFreq - PI / 2.), 0. ); }`;

const random = base => { if (Array.isArray(base)) return Math.random() * (base[1] - base[0]) + base[0]; return Math.random() * base; };
const pickRandom = arr => { if (Array.isArray(arr)) return arr[Math.floor(Math.random() * arr.length)]; return arr; };
function lerp(current, target, speed = 0.1, limit = 0.001) { let change = (target - current) * speed; if (Math.abs(change) < limit) { change = target - current; } return change; }

class CarLights {
  constructor(webgl, options, colors, speed, fade) { this.webgl = webgl; this.options = options; this.colors = colors; this.speed = speed; this.fade = fade; }
  init() {
    const options = this.options;
    let curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
    let geometry = new THREE.TubeGeometry(curve, 40, 1, 8, false);
    let instanced = new THREE.InstancedBufferGeometry().copy(geometry);
    instanced.instanceCount = options.lightPairsPerRoadWay * 2;
    let laneWidth = options.roadWidth / options.lanesPerRoad;
    let aOffset = []; let aMetrics = []; let aColor = [];
    let colors = this.colors;
    if (Array.isArray(colors)) colors = colors.map(c => new THREE.Color(c));
    else colors = new THREE.Color(colors);
    for (let i = 0; i < options.lightPairsPerRoadWay; i++) {
      let radius = random(options.carLightsRadius);
      let length = random(options.carLightsLength);
      let speed = random(this.speed);
      let carLane = i % options.lanesPerRoad;
      let laneX = carLane * laneWidth - options.roadWidth / 2 + laneWidth / 2;
      let carWidth = random(options.carWidthPercentage) * laneWidth;
      let carShiftX = random(options.carShiftX) * laneWidth;
      laneX += carShiftX;
      let offsetY = random(options.carFloorSeparation) + radius * 1.3;
      let offsetZ = -random(options.length);
      aOffset.push(laneX - carWidth / 2, offsetY, offsetZ);
      aOffset.push(laneX + carWidth / 2, offsetY, offsetZ);
      aMetrics.push(radius, length, speed); aMetrics.push(radius, length, speed);
      let color = pickRandom(colors);
      aColor.push(color.r, color.g, color.b); aColor.push(color.r, color.g, color.b);
    }
    instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 3, false));
    instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 3, false));
    instanced.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));
    let material = new THREE.ShaderMaterial({
      fragmentShader: carLightsFragment,
      vertexShader: carLightsVertex,
      transparent: true,
      uniforms: Object.assign({ uTime: { value: 0 }, uTravelLength: { value: options.length }, uFade: { value: this.fade } }, options.distortion.uniforms)
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', options.distortion.getDistortion);
    };
    let mesh = new THREE.Mesh(instanced, material);
    mesh.frustumCulled = false;
    this.webgl.scene.add(mesh);
    this.mesh = mesh;
  }
  update(time) { this.mesh.material.uniforms.uTime.value = time; }
}
const carLightsFragment = `varying vec3 vColor; varying vec2 vUv; uniform vec2 uFade; void main() { vec3 color = vec3(vColor); float alpha = smoothstep(uFade.x, uFade.y, vUv.x); gl_FragColor = vec4(color, alpha); if (gl_FragColor.a < 0.0001) discard; }`;
const carLightsVertex = `attribute vec3 aOffset;
attribute vec3 aMetrics;
attribute vec3 aColor;
uniform float uTravelLength;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
#include <getDistortion_vertex>
void main() {
 vec3 transformed = position.xyz;
 float radius = aMetrics.r;
 float myLength = aMetrics.g;
 float speed = aMetrics.b;
 transformed.xy *= radius;
 transformed.z *= myLength;
 transformed.z += myLength - mod(uTime * speed + aOffset.z, uTravelLength);
 transformed.xy += aOffset.xy;
 float progress = abs(transformed.z / uTravelLength);
 transformed.xyz += getDistortion(progress);
 vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
 gl_Position = projectionMatrix * mvPosition;
 vUv = uv;
 vColor = aColor;
}`;

class LightsSticks {
  constructor(webgl, options) { this.webgl = webgl; this.options = options; }
  init() {
    const options = this.options;
    const geometry = new THREE.PlaneGeometry(1, 1);
    let instanced = new THREE.InstancedBufferGeometry().copy(geometry);
    let totalSticks = options.totalSideLightSticks;
    instanced.instanceCount = totalSticks;
    let stickoffset = options.length / (totalSticks - 1);
    const aOffset = []; const aColor = []; const aMetrics = [];
    let colors = options.colors.sticks;
    if (Array.isArray(colors)) colors = colors.map(c => new THREE.Color(c));
    else colors = new THREE.Color(colors);
    for (let i = 0; i < totalSticks; i++) {
      let width = random(options.lightStickWidth);
      let height = random(options.lightStickHeight);
      aOffset.push((i - 1) * stickoffset * 2 + stickoffset * Math.random());
      let color = pickRandom(colors);
      aColor.push(color.r, color.g, color.b);
      aMetrics.push(width, height);
    }
    instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 1, false));
    instanced.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));
    instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 2, false));
    const material = new THREE.ShaderMaterial({
      fragmentShader: sideSticksFragment,
      vertexShader: sideSticksVertex,
      side: THREE.DoubleSide,
      uniforms: Object.assign({ uTravelLength: { value: options.length }, uTime: { value: 0 } }, options.distortion.uniforms)
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', options.distortion.getDistortion);
    };
    const mesh = new THREE.Mesh(instanced, material);
    mesh.frustumCulled = false;
    this.webgl.scene.add(mesh);
    this.mesh = mesh;
  }
  update(time) { this.mesh.material.uniforms.uTime.value = time; }
}
const sideSticksVertex = `attribute float aOffset;
attribute vec3 aColor;
attribute vec2 aMetrics;
uniform float uTravelLength;
uniform float uTime;
varying vec3 vColor;
mat4 rotationY( in float angle ) {
 return mat4( cos(angle), 0, sin(angle), 0, 0, 1.0, 0, 0, -sin(angle), 0, cos(angle), 0, 0, 0, 0, 1);
}
#include <getDistortion_vertex>
void main(){
 vec3 transformed = position.xyz;
 float width = aMetrics.x;
 float height = aMetrics.y;
 transformed.xy *= vec2(width, height);
 float time = mod(uTime * 60. * 2. + aOffset, uTravelLength);
 transformed = (rotationY(3.14/2.) * vec4(transformed,1.)).xyz;
 transformed.z += - uTravelLength + time;
 float progress = abs(transformed.z / uTravelLength);
 transformed.xyz += getDistortion(progress);
 transformed.y += height / 2.;
 transformed.x += -width / 2.;
 vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
 gl_Position = projectionMatrix * mvPosition;
 vColor = aColor;
}`;
const sideSticksFragment = `varying vec3 vColor; void main(){ vec3 color = vec3(vColor); gl_FragColor = vec4(color,1.); }`;

class Road {
  constructor(webgl, options) { this.webgl = webgl; this.options = options; this.uTime = { value: 0 }; }
  createPlane(side, width, isRoad) {
    const options = this.options;
    let segments = 100;
    const geometry = new THREE.PlaneGeometry(isRoad ? options.roadWidth : options.islandWidth, options.length, 20, segments);
    let uniforms = { uTravelLength: { value: options.length }, uColor: { value: new THREE.Color(isRoad ? options.colors.roadColor : options.colors.islandColor) }, uTime: this.uTime };
    if (isRoad) {
      uniforms = Object.assign(uniforms, {
        uLanes: { value: options.lanesPerRoad },
        uBrokenLinesColor: { value: new THREE.Color(options.colors.brokenLines) },
        uShoulderLinesColor: { value: new THREE.Color(options.colors.shoulderLines) },
        uShoulderLinesWidthPercentage: { value: options.shoulderLinesWidthPercentage },
        uBrokenLinesLengthPercentage: { value: options.brokenLinesLengthPercentage },
        uBrokenLinesWidthPercentage: { value: options.brokenLinesWidthPercentage }
      });
    }
    const material = new THREE.ShaderMaterial({
      fragmentShader: isRoad ? roadFragment : islandFragment,
      vertexShader: roadVertex,
      side: THREE.DoubleSide,
      uniforms: Object.assign(uniforms, options.distortion.uniforms)
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', options.distortion.getDistortion);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -options.length / 2;
    mesh.position.x += (this.options.islandWidth / 2 + options.roadWidth / 2) * side;
    this.webgl.scene.add(mesh);
    return mesh;
  }
  init() {
    this.leftRoadWay = this.createPlane(-1, this.options.roadWidth, true);
    this.rightRoadWay = this.createPlane(1, this.options.roadWidth, true);
    this.island = this.createPlane(0, this.options.islandWidth, false);
  }
  update(time) { this.uTime.value = time; }
}

const roadBaseFragment = `varying vec2 vUv; uniform vec3 uColor; uniform float uTime; #include <roadMarkings_vars> void main() { vec2 uv = vUv; vec3 color = vec3(uColor); #include <roadMarkings_fragment> gl_FragColor = vec4(color, 1.); }`;
const islandFragment = roadBaseFragment.replace('#include <roadMarkings_fragment>', '').replace('#include <roadMarkings_vars>', '');
const roadMarkings_vars = `uniform float uLanes; uniform vec3 uBrokenLinesColor; uniform vec3 uShoulderLinesColor; uniform float uShoulderLinesWidthPercentage; uniform float uBrokenLinesWidthPercentage; uniform float uBrokenLinesLengthPercentage; highp float random(vec2 co) { highp float a = 12.9898; highp float b = 78.233; highp float c = 43758.5453; highp float dt = dot(co.xy, vec2(a,b)); highp float sn = mod(dt, 3.14); return fract(sin(sn) * c); }`;
const roadMarkings_fragment = `uv.y = mod(uv.y + uTime * 0.05, 1.); float laneWidth = 1.0 / uLanes; float brokenLineWidth = laneWidth * uBrokenLinesWidthPercentage; float laneEmptySpace = 1. - uBrokenLinesLengthPercentage; float brokenLines = step(1.0 - brokenLineWidth, fract(uv.x * 2.0)) * step(laneEmptySpace, fract(uv.y * 10.0)); float sideLines = step(1.0 - brokenLineWidth, fract((uv.x - laneWidth * (uLanes - 1.0)) * 2.0)) + step(brokenLineWidth, uv.x); brokenLines = mix(brokenLines, sideLines, uv.x);`;
const roadFragment = roadBaseFragment.replace('#include <roadMarkings_fragment>', roadMarkings_fragment).replace('#include <roadMarkings_vars>', roadMarkings_vars);
const roadVertex = `uniform float uTime;
uniform float uTravelLength;
varying vec2 vUv;
#include <getDistortion_vertex>
void main() {
 vec3 transformed = position.xyz;
 vec3 distortion = getDistortion((transformed.y + uTravelLength / 2.) / uTravelLength);
 transformed.x += distortion.x;
 transformed.z += distortion.y;
 transformed.y += -1. * distortion.z;
 vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.);
 gl_Position = projectionMatrix * mvPosition;
 vUv = uv;
}`;

function resizeRendererToDisplaySize(renderer, setSize) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return false;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) setSize(width, height, false);
  return needResize;
}

// ==================== Bootstrap ====================
function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

function isLowPerfDevice() {
  // 移动端/低端设备跳过 Hyperspeed，避免掉帧
  // 简单判断：navigator.hardwareConcurrency <= 4 或 userAgent 含 Mobile
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
         (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
}

function bootHyperspeed() {
  const container = document.getElementById('lights');
  if (!container) {
    console.warn('[Hyperspeed] lights container not found, fallback to CSS bg');
    return;
  }
  if (!detectWebGL()) {
    console.warn('[Hyperspeed] WebGL not available, fallback to CSS bg');
    document.body.classList.add('no-webgl');
    return;
  }
  if (isLowPerfDevice()) {
    console.log('[Hyperspeed] Low-perf device detected, skipping Hyperspeed');
    document.body.classList.add('no-webgl');
    return;
  }

  const options = { ...DEFAULT_EFFECT_OPTIONS };
  options.distortion = distortions[options.distortion];
  const myApp = new App(container, options);

  // SMAA 资源加载超时保护（5 秒超时则 fallback，避免一直黑屏）
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('SMAA load timeout')), 5000));

  Promise.race([myApp.loadAssets(), timeout]).then(() => {
    myApp.init();
    console.log('[Hyperspeed] initialized OK');
  }).catch(err => {
    console.error('[Hyperspeed] init failed, fallback to CSS bg:', err);
    document.body.classList.add('no-webgl');
    if (container.parentNode) container.parentNode.removeChild(container);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootHyperspeed);
} else {
  bootHyperspeed();
}
