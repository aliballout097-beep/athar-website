// All 2D artwork (label, logo, giant words, shadow, sparks) is drawn on <canvas>
// at runtime, so the site ships zero image files.
import * as THREE from 'three';

const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Instrument Sans", Arial, sans-serif';
const RUQAA = '"Aref Ruqaa", serif';

export async function loadFonts() {
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`italic 400 100px ${SERIF}`),
    document.fonts.load(`500 100px ${SANS}`),
    document.fonts.load(`700 100px ${RUQAA}`, 'أثر'),
  ]).catch(() => {});
}

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};

const toTexture = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

// Gold foil: a vertical gradient reads as metal even before lighting is applied
const goldFill = (ctx, y0, y1) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f6e2b0');
  g.addColorStop(0.45, '#d4a95f');
  g.addColorStop(0.55, '#b88a43');
  g.addColorStop(1, '#efd29a');
  return g;
};

const spaced = (ctx, text, x, y, spacing) => {
  // canvas letterSpacing is not everywhere yet, so draw glyph by glyph
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx + widths[i] / 2, y);
    cx += widths[i] + spacing;
  });
};

/** Gold-on-glass label printed on the flacon front. */
export function labelTexture(item) {
  const [c, ctx] = canvas(1024, 1024);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = goldFill(ctx, 120, 900);
  ctx.strokeStyle = ctx.fillStyle;

  ctx.font = `500 34px ${SANS}`;
  spaced(ctx, 'ATHAR', 512, 170, 26);
  ctx.font = `700 64px ${RUQAA}`;
  ctx.fillText('أثر', 512, 250);

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(392, 318);
  ctx.lineTo(632, 318);
  ctx.stroke();

  ctx.font = `italic 400 220px ${SERIF}`;
  ctx.fillText(item.name, 512, 470);
  ctx.font = `400 46px ${SERIF}`;
  ctx.fillText(`No. ${item.no}`, 512, 610);

  ctx.font = `500 28px ${SANS}`;
  spaced(ctx, 'EAU DE PARFUM', 512, 720, 12);
  ctx.font = `500 24px ${SANS}`;
  spaced(ctx, '100 ML  ·  3.4 FL.OZ', 512, 780, 8);
  spaced(ctx, 'BEYROUTH', 512, 850, 14);
  return toTexture(c);
}

/** Gold foil logo stamped on the case. */
export function caseLogoTexture() {
  const [c, ctx] = canvas(1024, 1536);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = goldFill(ctx, 0, 1536);
  ctx.fillStyle = goldFill(ctx, 300, 1200);
  ctx.lineWidth = 3;
  ctx.strokeRect(70, 70, 884, 1396);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(92, 92, 840, 1352);

  ctx.font = `700 300px ${RUQAA}`;
  ctx.fillText('أثر', 512, 640);
  ctx.font = `500 50px ${SANS}`;
  spaced(ctx, 'ATHAR', 512, 900, 34);
  ctx.font = `500 26px ${SANS}`;
  spaced(ctx, 'MAISON DE PARFUM', 512, 980, 12);
  ctx.font = `italic 400 44px ${SERIF}`;
  ctx.fillText('Beyrouth', 512, 1290);
  return toTexture(c);
}

/** Giant background word, white on black. Used as a mask in the backdrop shader. */
export function wordTexture(word, { arabic = false } = {}) {
  const [c, ctx] = canvas(2048, 1024);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 2048, 1024);
  if (word) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = arabic ? 760 : 820;
    const face = (s) => (arabic ? `700 ${s}px ${RUQAA}` : `italic 400 ${s}px ${SERIF}`);
    ctx.font = face(size);
    const w = ctx.measureText(word).width;
    if (w > 1900) {
      size *= 1900 / w;
      ctx.font = face(size);
    }
    ctx.fillText(word, 1024, arabic ? 470 : 560);
  }
  return toTexture(c, false);
}

/** Soft contact shadow under the bottle. */
export function shadowTexture() {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return toTexture(c);
}
