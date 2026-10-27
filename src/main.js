// ATHAR — entry point.
// Scroll (Lenis + GSAP ScrollTrigger) -> progress per chapter -> 3D world + HUD + text reveals.
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { World } from './scene.js';
import { loadFonts } from './textures.js';
import { ANATOMY, NOTES, COLLECTION } from './data.js';

gsap.registerPlugin(ScrollTrigger);

const REC = new URLSearchParams(location.search).has('rec'); // used by the reel recorder
const root = document.documentElement;
if (REC) root.classList.add('rec');
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ----------------------------------------------------------- state */
// Every visual on the page is derived from these numbers (0 → 1 per chapter).
const state = { intro: 0, hero: 0, anat: 0, notes: 0, case: 0, coll: 0, page: 0, mouse: { x: 0, y: 0 } };
const mouseTarget = { x: 0, y: 0 };
let portrait = false;
let vw = innerWidth;
let vh = innerHeight;

/* ----------------------------------------------------------- scroll */
const track = (trigger, key, start = 'top top', end = 'bottom bottom') =>
  ScrollTrigger.create({ trigger, start, end, onUpdate: (self) => (state[key] = self.progress) });

track('#top', 'hero', 'top top', 'bottom top');
track('#anatomy', 'anat');
track('#notes', 'notes');
track('#case', 'case');
track('#collection', 'coll');
ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => (state.page = self.progress) });

let lenis = null;
if (!REC) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  lenis = new Lenis({ lerp: reduced ? 1 : 0.085, smoothWheel: !reduced });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Nav links land on the most telling moment of each chapter (data-go = chapter progress)
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const at = parseFloat(a.dataset.go ?? '0');
    const y = target.offsetTop + at * Math.max(0, target.offsetHeight - innerHeight);
    lenis ? lenis.scrollTo(y, { duration: 2.4 }) : scrollTo(0, y);
  });
});

/* ----------------------------------------------------------- text reveals */
// data-r="chapter:inStart:inEnd:outStart:outEnd" (-1 = always in / never out)
// data-rm = the same, but for portrait screens
let reveals = [];
const parseReveals = () => {
  reveals = [...document.querySelectorAll('[data-r]')].map((el) => {
    const [key, a, b, c, d] = ((portrait && el.dataset.rm) || el.dataset.r).split(':');
    return { el, key, a: +a, b: +b, c: +c, d: +d };
  });
};
const applyReveals = () => {
  for (const r of reveals) {
    const p = state[r.key];
    const inP = r.a < 0 ? 1 : smooth(r.a, r.b, p);
    const outP = r.c < 0 ? 0 : smooth(r.c, r.d, p);
    const op = inP * (1 - outP);
    r.el.style.opacity = op.toFixed(3);
    r.el.style.transform = `translate3d(0, ${((1 - inP) * 36 - outP * 24).toFixed(1)}px, 0)`;
    r.el.style.visibility = op < 0.005 ? 'hidden' : 'visible';
  }
};

/* ----------------------------------------------------------- HUD callouts */
const svgNS = 'http://www.w3.org/2000/svg';
const lines = $('hudLines');
const tagsBox = $('hudTags');
const makeTag = ({ no, title, text, side, cls = '' }) => {
  const el = document.createElement('div');
  el.className = `tag tag--${side} ${cls}`;
  el.innerHTML = `<span class="tag-no">${no}</span><strong>${title}</strong><span class="tag-text">${text}</span>`;
  tagsBox.appendChild(el);
  const line = document.createElementNS(svgNS, 'line');
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('r', '3');
  const ring = document.createElementNS(svgNS, 'circle');
  ring.setAttribute('class', 'ring');
  lines.append(line, ring, dot);
  return { el, line, dot, ring, side };
};
const anatomyTags = ANATOMY.map((a) => ({ ...a, ui: makeTag(a) }));
const noteTags = NOTES.map((n) => ({
  ...n,
  ui: makeTag({ no: n.time, title: n.title, text: n.notes, side: n.key === 'heart' ? 'left' : 'right', cls: 'tag--note' }),
}));

const placeTag = (ui, p, op) => {
  const { el, line, dot, ring, side } = ui;
  if (op < 0.005 || !p.on) {
    el.style.opacity = 0;
    line.style.opacity = dot.style.opacity = ring.style.opacity = 0;
    return;
  }
  const dir = side === 'left' ? -1 : 1;
  const gap = portrait ? 16 : clamp(vw * 0.05, 36, 90);
  const x2 = p.x + dir * gap * (0.4 + 0.6 * op);
  line.setAttribute('x1', p.x);
  line.setAttribute('y1', p.y);
  line.setAttribute('x2', x2 - dir * 8);
  line.setAttribute('y2', p.y);
  dot.setAttribute('cx', p.x);
  dot.setAttribute('cy', p.y);
  ring.setAttribute('cx', p.x);
  ring.setAttribute('cy', p.y);
  ring.setAttribute('r', 3 + 6 * op);
  line.style.opacity = dot.style.opacity = op;
  ring.style.opacity = op * 0.6;
  if (portrait) el.style.maxWidth = `${Math.max(60, dir < 0 ? x2 - 10 : vw - x2 - 10)}px`;
  el.style.opacity = op;
  el.style.transform = `translate3d(${x2}px, ${p.y}px, 0) translate(${dir < 0 ? '-100%' : '0'}, -50%) translateY(${(1 - op) * 10}px)`;
};

/* ----------------------------------------------------------- collection panel */
const list = $('collList');
COLLECTION.forEach((c, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<b>${c.no}</b>${c.name}<i></i>`;
  list.appendChild(li);
});
const items = [...list.children];
let shown = -1;
const showItem = (i) => {
  if (i === shown) return;
  shown = i;
  const c = COLLECTION[i];
  $('cdFamily').textContent = c.family;
  $('cdName').textContent = c.name;
  $('cdAr').textContent = c.ar;
  $('cdNotes').textContent = c.notes;
  $('cdStory').textContent = c.story;
  $('cdPrice').textContent = `$${c.price}`;
  items.forEach((li, k) => li.classList.toggle('on', k === i));
};
showItem(0);

/* ----------------------------------------------------------- bag + toast */
let bag = 0;
const toast = $('toast');
let toastTimer;
$('addBtn').addEventListener('click', () => {
  const c = COLLECTION[shown];
  bag += 1;
  $('bagCount').textContent = bag;
  gsap.fromTo('#bagCount', { scale: 1.6 }, { scale: 1, duration: 0.6, ease: 'back.out(3)' });
  toast.innerHTML = `<i></i>${c.name} No.${c.no} · 100 ml added to your bag`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
});

/* ----------------------------------------------------------- cursor + mouse */
if (!REC && matchMedia('(pointer: fine)').matches) {
  const cursor = $('cursor');
  addEventListener('pointermove', (e) => {
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    mouseTarget.x = (e.clientX / vw) * 2 - 1;
    mouseTarget.y = -((e.clientY / vh) * 2 - 1);
  });
  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('pointerenter', () => cursor.classList.add('big'));
    el.addEventListener('pointerleave', () => cursor.classList.remove('big'));
  });
}

/* ----------------------------------------------------------- frame */
let world = null;
const vialFill = $('vialFill');
const vialMl = $('vialMl');
const nav = $('nav');
const atelier = $('atelier');

function frame(t) {
  state.mouse.x += (mouseTarget.x - state.mouse.x) * 0.05;
  state.mouse.y += (mouseTarget.y - state.mouse.y) * 0.05;

  // staggered intro (nav, title, details)
  const it = state.intro;
  root.style.setProperty('--i1', smooth(0.25, 0.7, it).toFixed(3));
  root.style.setProperty('--i2', smooth(0.35, 0.8, it).toFixed(3));
  root.style.setProperty('--i3', smooth(0.45, 0.9, it).toFixed(3));
  root.style.setProperty('--i4', smooth(0.65, 1, it).toFixed(3));

  applyReveals();

  vialFill.style.height = `${(state.page * 100).toFixed(1)}%`;
  vialMl.textContent = `${Math.round(state.page * 100)} ml`;
  nav.classList.toggle('solid', atelier.getBoundingClientRect().top < 70);

  if (!world) return;
  world.update(state, t);

  const P = world.project();
  const notesOut = smooth(0, 0.1, state.notes);
  anatomyTags.forEach((a, i) => {
    const op = smooth(0.42 + i * 0.035, 0.52 + i * 0.035, state.anat) * (1 - notesOut);
    placeTag(a.ui, P[a.part], op);
  });
  noteTags.forEach((n, i) => {
    const op = smooth(0.56 + i * 0.04, 0.68 + i * 0.04, state.notes) * (1 - smooth(0, 0.12, state.case));
    placeTag(n.ui, P[n.key], op);
  });

  // collection: which fragrance is on stage, and how settled it is
  const c = world.collectionIndex;
  const idx = Math.round(c);
  showItem(idx);
  $('collDetail').style.opacity = (1 - smooth(0.12, 0.42, Math.abs(c - idx))).toFixed(3);
  items.forEach((li, k) => li.querySelector('i').style.setProperty('--p', clamp(c - k + 1).toFixed(3)));

  world.render();
}

function resize() {
  vw = innerWidth;
  vh = innerHeight;
  portrait = vw / vh < 0.9 || vw <= 760;
  state.portrait = portrait;
  parseReveals();
  world?.resize(vw, vh);
}

/* ----------------------------------------------------------- boot */
async function boot() {
  const loaderFill = $('loaderFill');
  const pct = $('loaderPct');
  const setLoad = (v) => {
    loaderFill.style.setProperty('--load', v);
    pct.textContent = String(Math.round(v * 100)).padStart(2, '0');
  };
  setLoad(0.1);
  await loadFonts();
  setLoad(0.35);

  try {
    const low = !REC && (matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4);
    world = new World($('gl'), { rec: REC, quality: low ? 'low' : 'high' });
  } catch (err) {
    console.warn('WebGL unavailable, showing the flat version.', err);
    root.classList.add('no-gl');
  }
  resize();
  addEventListener('resize', resize);
  setLoad(0.65);
  if (world) {
    world.update(state, 0);
    await world.warmup();
    world.render();
  }
  setLoad(1);
  ScrollTrigger.refresh();

  if (REC) {
    // The recorder scrolls the page itself and asks for one frame at a time.
    window.__rec = {
      frame(t, intro = 1) {
        state.intro = intro;
        ScrollTrigger.update();
        frame(t);
      },
      tint: () => '#' + world.liquidMat.uniforms.uCore.value.getHexString(),
      sections() {
        const s = {};
        for (const id of ['top', 'anatomy', 'notes', 'case', 'collection', 'atelier']) {
          const el = $(id);
          s[id] = { top: el.offsetTop, height: el.offsetHeight };
        }
        return { s, vh: innerHeight, max: document.documentElement.scrollHeight - innerHeight };
      },
    };
    window.__ready = true;
    return;
  }

  await new Promise((r) => setTimeout(r, 450));
  $('loader').classList.add('done');
  const start = performance.now() + 250;
  gsap.ticker.add(() => {
    const now = performance.now();
    state.intro = clamp((now - start) / 2600);
    frame(now / 1000);
  });
}

boot();
