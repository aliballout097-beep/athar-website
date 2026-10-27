// The 3D world: a crystal flacon built from primitives and lit like a studio packshot.
// Everything is a pure function of scroll progress (+ time), so the same scroll
// position always gives the same picture (that's what makes the reel recordable).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLLECTION, NOTES } from './data.js';
import { labelTexture, caseLogoTexture, wordTexture, shadowTexture } from './textures.js';

const { clamp, lerp, smoothstep: ss } = THREE.MathUtils;
const smooth = (a, b, x) => ss(x, a, b);
const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const col = (hex) => new THREE.Color(hex);

const FOV = 24;
const GLASS = { w: 1.46, h: 1.86, d: 0.92 };
const LIQ = { w: 1.14, h: 1.3, d: 0.62, y: 0.91 };
// juice strata, bottom to top (heights add up to LIQ.h)
const SLICES = [
  { key: 'base', y: -0.43, h: 0.44 },
  { key: 'heart', y: 0.01, h: 0.44 },
  { key: 'top', y: 0.44, h: 0.42 },
];
// how far each part travels in the exploded view
const EXPLODE = { cap: 2.6, pump: 1.9, collar: 1.0 };

/* ---------------------------------------------------------------- materials */

// Studio lighting baked into an environment map: tall softboxes give the long
// vertical highlights you see on real perfume photography.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide })));
  const panel = (w, h, hex, power, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: col(hex).multiplyScalar(power), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 1, 0);
    env.add(m);
  };
  panel(1.6, 9, '#fff0da', 5, [-5, 2, 2.2]); // warm key strip
  panel(1.3, 9, '#e6eeff', 4, [5.5, 2, 2]); // cool fill strip
  panel(8, 3, '#ffffff', 1.6, [0, 8, 0]); // top
  panel(0.5, 9, '#ffd6a0', 6, [-2.4, 2, -6]); // back rims
  panel(0.5, 9, '#ffd6a0', 6, [2.4, 2, -6]);
  panel(6, 1, '#ffb070', 0.6, [0, -3, 2]); // warm floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.025).texture;
  pmrem.dispose();
  return tex;
}

const gold = () => new THREE.MeshPhysicalMaterial({ color: '#e7bd72', metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });

// Liquid: a cheap "subsurface" look. Deep at grazing angles and towards the edges of
// each face, glowing near the surface. It must be OPAQUE so the glass can refract it.
function liquidMaterial(c) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDeep: { value: col(c.deep) },
      uCore: { value: col(c.core) },
      uTop: { value: col(c.top) },
      uSize: { value: new THREE.Vector3(LIQ.w, LIQ.h, LIQ.d) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView; varying vec3 vLocal; varying vec3 vObjN;
      void main() {
        vLocal = position;
        vObjN = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep; uniform vec3 uCore; uniform vec3 uTop; uniform vec3 uSize; uniform float uTime;
      varying vec3 vN; varying vec3 vView; varying vec3 vLocal; varying vec3 vObjN;
      void main() {
        vec3 n = normalize(vN);
        float ndv = clamp(dot(n, normalize(vView)), 0.0, 1.0);
        float facing = pow(ndv, 0.8);
        vec3 q = abs(vLocal) / (uSize * 0.5);
        float lateral = abs(vObjN.z) > 0.5 ? q.x : q.z;       // across the visible face
        float h = clamp(vLocal.y / uSize.y + 0.5, 0.0, 1.0);
        vec3 c = mix(uDeep, uCore, facing);
        c *= 1.0 - 0.5 * smoothstep(0.35, 1.0, lateral);       // light dies towards the edges
        c *= mix(0.45, 1.0, smoothstep(0.0, 0.85, h));          // darker at the bottom
        c += uTop * 0.35 * smoothstep(0.62, 1.0, h) * facing * (1.0 - lateral * 0.6);
        c = mix(c, uTop * 0.9, smoothstep(0.85, 1.0, vObjN.y) * 0.7); // surface
        c *= 0.93 + 0.07 * sin(vLocal.y * 16.0 + vLocal.x * 5.0 + uTime * 0.8);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Each note becomes a block of coloured crystal: real transmission, so it bends the backdrop.
function noteGlassMaterial(dispersion) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, roughness: 0.05, thickness: 0.62, ior: 1.42,
    attenuationColor: col('#c9741c'), attenuationDistance: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.05,
    envMapIntensity: 1.0, specularIntensity: 0.8, emissive: col('#c9741c'), emissiveIntensity: 0.16, dispersion,
  });
}

// Backdrop: warm glow + a giant word (from a mask texture). Lives in the scene, so the
// glass refracts it. That bending of the type is most of the "real" feel.
function backdropMaterial() {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uA: { value: null }, uB: { value: null }, uMix: { value: 0 },
      uWordAlpha: { value: 0 }, uWordColor: { value: col('#c9a46a') },
      uBase: { value: col('#070504') }, uGlow: { value: col('#a8642a') }, uGlowStrength: { value: 1 },
      uAspect: { value: 1 }, uWordScale: { value: 0.42 }, uCenter: { value: new THREE.Vector2() }, uGlowScale: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; uniform float uWordAlpha; uniform vec3 uWordColor;
      uniform vec3 uBase; uniform vec3 uGlow; uniform float uGlowStrength; uniform float uAspect; uniform float uWordScale; uniform vec2 uCenter; uniform float uGlowScale;
      varying vec2 vUv;
      float word(sampler2D t, vec2 uv){ return (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 0.0 : texture2D(t, uv).r; }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        vec2 d = p - uCenter;
        vec3 c = uBase;
        // tight hot core + wide soft halo, like a gelled spotlight on a backdrop
        vec2 dg = d * uGlowScale;
        c += uGlow * uGlowStrength * (exp(-dot(dg, dg) * 9.0) * 0.8 + exp(-dot(dg, dg) * 2.2) * 0.25);
        vec2 wuv = vec2(d.x / (2.0 * uWordScale), d.y / uWordScale) + 0.5;
        float w = mix(word(uA, wuv), word(uB, wuv), uMix);
        c += uWordColor * w * uWordAlpha;
        c *= 1.0 - smoothstep(0.3, 1.05, length(p * vec2(0.8, 1.0)));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Floating dust lit by the softboxes
function dust(count) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 1] = Math.random() * 7 - 1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 0.5;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: col('#ffd9a0') }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uPx; varying float vTw;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.05 + aSeed * 0.08) + 1.0, 7.0) - 1.0;
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + aSeed * 5.0) * uPx * (8.0 / -mv.z);
        vTw = 0.35 + 0.65 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 30.0) * 0.5 + 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; uniform vec3 uColor; varying float vTw;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor, a * a * uAlpha * vTw); }`,
  });
  return new THREE.Points(g, m);
}

// A ring of glowing motes orbiting one stratum (one "note")
function noteMotes(hex) {
  const n = 70;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const r = 1.05 + Math.random() * 0.35;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.75;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: col(hex), size: 0.035, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}

/* -------------------------------------------------------------------- world */

export class World {
  constructor(canvas, { rec = false, quality = 'high' } = {}) {
    this.rec = rec;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: rec }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.maxDpr = rec ? 3 : quality === 'low' ? 1.25 : 1.75;

    this.scene = new THREE.Scene();
    this.scene.environment = studioEnvironment(r);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
    this.scene.add(this.camera);
    this.colorTmp = new THREE.Color();

    this.#buildBackdrop();
    this.#buildBottle(quality);
    this.#buildCase();

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.6),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x000000, transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.scene.add(this.shadow);

    this.dust = dust(quality === 'low' ? 220 : 480);
    this.scene.add(this.dust);

    this.anchors = {};
    this.#anchor('cap', this.cap, -0.36, 0.42, 0);
    this.#anchor('pump', this.pump, 0.105, 0.33, 0);
    this.#anchor('collar', this.collar, -0.21, 0.07, 0);
    this.#anchor('flacon', this.glass, GLASS.w / 2, 0.55, 0);
    this.#anchor('juice', this.liquid, -LIQ.w / 2, 0.1, 0);
    this.#anchor('base', this.glass, GLASS.w / 2, -GLASS.h / 2 + 0.13, 0);
    this.slices.forEach((s, i) => this.#anchor(NOTES[2 - i].key, s, (i === 1 ? -1 : 1) * (LIQ.w / 2 + 0.02), 0, 0));
    this.v3 = new THREE.Vector3();
  }

  #anchor(name, parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.anchors[name] = o;
  }

  #buildBackdrop() {
    this.words = {
      hero: wordTexture('أثر', { arabic: true }),
      none: wordTexture(''),
      ...Object.fromEntries(COLLECTION.map((c) => [c.name, wordTexture(c.name)])),
    };
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial());
    this.backdrop.renderOrder = -1;
    this.backdrop.position.z = -40;
    this.camera.add(this.backdrop);
  }

  #buildBottle(quality) {
    this.bottle = new THREE.Group();
    this.scene.add(this.bottle);

    // crystal flacon
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.035, transmission: 1, thickness: 1.15, ior: 1.52,
      envMapIntensity: 1.35, specularIntensity: 1, clearcoat: 0.4, clearcoatRoughness: 0.04,
      attenuationColor: col('#fff3df'), attenuationDistance: 5, dispersion: quality === 'low' ? 0 : 0.22,
    });
    this.glass = new THREE.Mesh(new RoundedBoxGeometry(GLASS.w, GLASS.h, GLASS.d, 6, 0.14), this.glassMat);
    this.glass.position.y = GLASS.h / 2;
    this.bottle.add(this.glass);

    this.labels = COLLECTION.map(labelTexture);
    this.labelMat = new THREE.MeshStandardMaterial({
      map: this.labels[0], transparent: true, metalness: 0.75, roughness: 0.32,
      emissive: 0xffffff, emissiveMap: this.labels[0], emissiveIntensity: 0.55, depthWrite: false,
    });
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), this.labelMat);
    this.label.position.set(0, -0.12, GLASS.d / 2 + 0.004);
    this.glass.add(this.label);

    // juice: one block, plus three strata that take over in "The Notes"
    this.liquid = new THREE.Group();
    this.liquid.position.y = LIQ.y;
    this.bottle.add(this.liquid);
    this.liquidMat = liquidMaterial(COLLECTION[0].liquid);
    this.liquidWhole = new THREE.Mesh(new RoundedBoxGeometry(LIQ.w, LIQ.h, LIQ.d, 5, 0.09), this.liquidMat);
    this.liquid.add(this.liquidWhole);
    this.slices = SLICES.map((s) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(LIQ.w, s.h, LIQ.d, 5, 0.06), noteGlassMaterial(quality === 'low' ? 0 : 0.12));
      m.position.y = s.y;
      m.visible = false;
      const motes = noteMotes(NOTES.find((n) => n.key === s.key).glass);
      m.add(motes);
      m.userData = { motes, baseY: s.y };
      this.liquid.add(m);
      return m;
    });

    // hardware
    const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 96), mat);
    const top = GLASS.h;

    this.collar = new THREE.Group();
    this.collar.add(lathe([[0, 0], [0.2, 0], [0.208, 0.01], [0.208, 0.11], [0.19, 0.135], [0.07, 0.14], [0, 0.14]], gold()));
    this.collar.position.y = top;
    this.bottle.add(this.collar);

    this.pump = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 32), gold());
    stem.position.y = 0.2;
    const actuator = lathe([[0, 0], [0.1, 0], [0.105, 0.012], [0.105, 0.12], [0.094, 0.137], [0, 0.14]], gold());
    actuator.position.y = 0.27;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), new THREE.MeshStandardMaterial({ color: '#111' }));
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.35, 0.1);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.52, 12), new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.25 }));
    tube.position.y = -0.76 + 0.1;
    this.pump.add(stem, actuator, nozzle, tube);
    this.pump.position.y = top;
    this.bottle.add(this.pump);

    this.cap = new THREE.Group();
    const capMat = new THREE.MeshPhysicalMaterial({ color: '#0a0908', roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.5 });
    this.cap.add(lathe([[0, 0], [0.33, 0], [0.355, 0.012], [0.36, 0.04], [0.36, 0.64], [0.352, 0.69], [0.33, 0.716], [0.29, 0.726], [0, 0.726]], capMat));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.364, 0.364, 0.035, 96, 1, true), gold());
    band.position.y = 0.075;
    this.cap.add(band);
    this.cap.position.y = top;
    this.bottle.add(this.cap);
  }

  #buildCase() {
    this.case = new THREE.Group();
    const box = new THREE.Mesh(
      new RoundedBoxGeometry(1.9, 2.95, 1.3, 4, 0.03),
      new THREE.MeshPhysicalMaterial({ color: '#0e0c0b', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.35, sheen: 0.2, sheenColor: col('#4a3520'), envMapIntensity: 1.1 })
    );
    const logoTex = caseLogoTexture();
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 2.55),
      new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, metalness: 0.85, roughness: 0.3, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.3, depthWrite: false })
    );
    logo.position.z = 0.651;
    this.case.add(box, logo);
    this.case.visible = false;
    this.scene.add(this.case);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const bh = 2 * 40 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.04;
    this.backdrop.scale.set(bh * this.camera.aspect, bh, 1);
    const u = this.backdrop.material.uniforms;
    u.uAspect.value = this.camera.aspect;
    u.uWordScale.value = Math.min(0.44, (this.camera.aspect * 0.92) / 2);
    u.uGlowScale.value = this.camera.aspect < 0.9 ? 1.7 : 1;
    this.dust.material.uniforms.uPx.value = this.renderer.getPixelRatio() * (h / 900);
  }

  /** s = { intro, hero, anat, notes, case, coll, mouse:{x,y} }, t = seconds */
  update(s, t) {
    const portrait = s.portrait ?? this.camera.aspect < 0.9; // same breakpoint as the CSS
    const wide = this.camera.aspect > 1.25;

    /* ---- phase values ---- */
    const intro = easeIO(clamp(s.intro, 0, 1));
    const explodeA = easeIO(smooth(0.06, 0.62, s.anat));
    const outN = easeIO(smooth(0.0, 0.34, s.notes));
    const sepN = easeIO(smooth(0.3, 0.62, s.notes));
    const tintN = smooth(0.3, 0.55, s.notes);
    const merge = smooth(0.0, 0.2, s.case);
    const glassBack = easeIO(smooth(0.06, 0.32, s.case));
    const hwBack = easeIO(smooth(0.14, 0.42, s.case));
    const drop = smooth(0.44, 0.8, s.case);
    const push = easeIO(smooth(0.74, 1, s.case));
    const lift = easeIO(smooth(0.0, 0.14, s.coll));
    // collection index 0..3 with a hold on each fragrance
    const f = clamp((s.coll - 0.14) / 0.8, 0, 1) * 3;
    let c = 0;
    for (let k = 0; k < 3; k++) c += easeIO(smooth(0.22, 0.78, clamp(f - k, 0, 1)));
    this.collectionIndex = c;

    const explode = explodeA * (1 - hwBack);
    const hwOut = outN * (1 - hwBack);
    const glassOut = outN * (1 - glassBack);
    const sep = sepN * (1 - merge);
    const tint = tintN * (1 - merge);

    /* ---- bottle parts ---- */
    const bob = (k) => Math.sin(t * 1.1 + k) * 0.03 * explode;
    const top = GLASS.h;
    this.cap.position.y = top + EXPLODE.cap * explode + hwOut * 7 + bob(1);
    this.pump.position.y = top + EXPLODE.pump * explode + hwOut * 7 + bob(2);
    this.collar.position.y = top + EXPLODE.collar * explode + hwOut * 7 + bob(3);
    this.cap.rotation.y = explode * 0.6;
    this.glass.position.y = GLASS.h / 2 - glassOut * 7;
    this.glass.visible = glassOut < 0.99;

    // collection colours: blend liquid between fragrances
    const i0 = Math.min(Math.floor(c), 3);
    const i1 = Math.min(i0 + 1, 3);
    const k = smooth(0.25, 0.75, c - i0);
    const L0 = COLLECTION[i0].liquid;
    const L1 = COLLECTION[i1].liquid;
    const lu = this.liquidMat.uniforms;
    lu.uDeep.value.set(L0.deep).lerp(this.colorTmp.set(L1.deep), k);
    lu.uCore.value.set(L0.core).lerp(this.colorTmp.set(L1.core), k);
    lu.uTop.value.set(L0.top).lerp(this.colorTmp.set(L1.top), k);
    lu.uTime.value = t;
    // swap the printed label while the bottle shows its back (label is culled then)
    const labelIdx = Math.min(Math.floor(c + 0.5), 3);
    if (this.labelMat.map !== this.labels[labelIdx]) {
      this.labelMat.map = this.labelMat.emissiveMap = this.labels[labelIdx];
      this.labelMat.needsUpdate = true;
    }

    // juice + strata
    const liftJuice = sep * 0.25;
    this.liquid.position.y = LIQ.y + liftJuice;
    const useSlices = sep > 0.0005 || tint > 0.0005;
    this.liquidWhole.visible = !useSlices;
    this.slices.forEach((m, i) => {
      m.visible = useSlices;
      const dir = i - 1; // base -1, heart 0, top +1
      m.position.y = m.userData.baseY + dir * sep * 0.62;
      m.rotation.y = sep * [0.3, 0.1, 0.46][i] + sep * Math.sin(t * 0.5 + i * 2) * 0.1;
      m.rotation.z = sep * dir * 0.04;
      const mat = m.material;
      mat.attenuationColor.copy(lu.uCore.value).lerp(this.colorTmp.set(NOTES[2 - i].glass), tint);
      mat.emissive.copy(mat.attenuationColor);
      mat.color.setRGB(1, 1, 1).lerp(mat.attenuationColor, 0.25);
      const motes = m.userData.motes;
      motes.material.opacity = tint * sep * 0.9;
      motes.rotation.y = t * (0.25 + i * 0.07) * (i === 1 ? -1 : 1);
    });

    /* ---- bottle orientation ---- */
    const mx = s.mouse ? s.mouse.x : 0;
    let yaw = lerp(-1.5, -0.32, intro) + Math.sin(t * 0.4) * 0.16 + mx * 0.22;
    yaw = lerp(yaw, -0.3 + Math.sin(t * 0.3) * 0.06, explodeA);
    yaw = lerp(yaw, -0.2 + Math.sin(t * 0.35) * 0.1, outN);
    yaw = lerp(yaw, 0, hwBack);
    yaw = lerp(yaw, -0.18 + c * Math.PI * 2 + Math.sin(t * 0.4) * 0.07 + mx * 0.15, lift);
    this.bottle.rotation.y = yaw;

    /* ---- case ---- */
    const caseY = 1.475 + (1 - easeIO(drop)) * 9 + lift * 9;
    this.case.position.y = caseY;
    this.case.rotation.y = lerp(0, -0.25, push) + Math.sin(t * 0.3) * 0.03 * drop;
    this.case.visible = s.case > 0.4 && caseY < 11;

    this.shadow.material.opacity = (1 - glassOut) * 0.85;
    this.shadow.scale.setScalar(1 + (drop > 0.95 && lift < 0.5 ? 0.25 : 0));

    /* ---- camera ---- */
    // hh = half of the world height to fit on screen, sx = push the subject right by
    // this fraction of the screen width (leaves room for the copy on wide screens)
    const P = portrait ? 1.28 : 1;
    const cam = { sx: 0, y: 1.3, hh: 1.95 * P, hw: 1.05 };
    const mix = (to, a) => {
      for (const key in to) cam[key] = lerp(cam[key], to[key], a);
    };
    mix({ y: 1.15, hh: 1.45 * P }, 1 - intro); // start close, pull back
    mix({ sx: 0.05, y: portrait ? 2.75 : 2.62, hh: portrait ? 3.75 : 3.0 }, explodeA);
    mix({ sx: 0.07, y: LIQ.y + liftJuice, hh: portrait ? 2.45 : 1.95 }, outN);
    mix({ sx: 0.06, y: 1.42, hh: 2.05 * P }, glassBack);
    mix({ sx: 0.12, y: 1.62, hh: 1.4 * P }, push);
    mix({ sx: 0.17, y: portrait ? 0.3 : 1.3, hh: portrait ? 2.9 : 1.8 }, lift);
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = Math.max(cam.hh / tanH, cam.hw / (tanH * this.camera.aspect));
    const camX = wide ? -cam.sx * this.camera.aspect * 2 * cam.hh : 0;
    const my = s.mouse ? s.mouse.y : 0;
    this.camera.position.set(camX + mx * 0.12, cam.y + dist * 0.09 + my * 0.08, dist);
    this.camera.lookAt(camX, cam.y, 0);
    this.camera.updateMatrixWorld();

    /* ---- backdrop ---- */
    const bu = this.backdrop.material.uniforms;
    const heroWord = 1 - smooth(0.05, 0.5, s.hero);
    if (lift > 0.01) {
      bu.uA.value = this.words[COLLECTION[i0].name];
      bu.uB.value = this.words[COLLECTION[i1].name];
      bu.uMix.value = smooth(0.4, 0.6, c - i0);
      bu.uWordAlpha.value = 0.15 * lift;
    } else {
      // Arabic brand word in the hero, back again behind the crystal notes
      bu.uA.value = this.words.hero;
      bu.uB.value = this.words.none;
      bu.uMix.value = 0;
      bu.uWordAlpha.value = (0.2 * heroWord * intro + 0.16 * sep) * (1 - push);
    }
    // backdrop centre (glow + word) sits behind the subject, wherever the camera put it
    this.v3.set(0, cam.y, 0).project(this.camera);
    bu.uCenter.value.set((this.v3.x * this.camera.aspect) / 2, this.v3.y / 2 + (portrait && lift > 0.5 ? 0.04 : -0.02));
    // glow takes the colour of the juice
    bu.uGlow.value.copy(lu.uCore.value).lerp(this.colorTmp.set('#b89668'), tint * 0.35).multiplyScalar(0.3);
    bu.uGlowStrength.value = (0.3 + 0.7 * intro) * (1 + tint * 0.15);

    /* ---- dust ---- */
    const du = this.dust.material.uniforms;
    du.uTime.value = t;
    du.uAlpha.value = 0.55 * intro;

    this.renderer.toneMappingExposure = 0.25 + 0.85 * intro;
    // the studio lights drift around the bottle (and sweep across it as the lights come on),
    // so highlights glide over glass and gold even when nobody scrolls
    this.scene.environmentRotation.y = (1 - intro) * 1.6 + Math.sin(t * 0.32) * 0.42;
  }

  /** Screen position (CSS px) of each callout anchor */
  project() {
    const out = {};
    for (const [name, o] of Object.entries(this.anchors)) {
      o.getWorldPosition(this.v3).project(this.camera);
      out[name] = { x: (this.v3.x * 0.5 + 0.5) * this.w, y: (-this.v3.y * 0.5 + 0.5) * this.h, on: this.v3.z < 1 };
    }
    return out;
  }

  async warmup() {
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
