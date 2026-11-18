/**
 * Perceptual colour distance.
 *
 * We use CIEDE2000 (ΔE00) over CIELAB rather than Euclidean RGB or HSL
 * distance, and the choice is load-bearing rather than academic:
 *
 * - Euclidean RGB gets this palette backwards. It rates #000000 vs #111111 as
 *   far apart (17 units) and --ds-accent #f95616 vs --ds-accent-hot #ff5a1f as
 *   close (10 units), when the eye says the opposite.
 * - HSL distance is discontinuous at the hue wrap and meaningless at low
 *   chroma. This palette is mostly greys, where hue is pure noise.
 *
 * ΔE00's hue-rotation and neutral-region corrections are specifically what
 * make it trustworthy for the near-grey cluster where every duplicate in this
 * design system actually lives.
 */

export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** sRGB companding — the inverse of the gamma transfer function. */
function linearise(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB (D65) → CIELAB (D65). No chromatic adaptation needed: same illuminant. */
export function rgbToLab([R, G, B]: RGB): Lab {
  const r = linearise(R);
  const g = linearise(G);
  const b = linearise(B);

  // sRGB → XYZ, then normalise by the D65 white point.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;

  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deg = (rad: number): number => (rad * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * CIEDE2000, per Sharma, Wu & Dalal (2005). kL = kC = kH = 1 (reference
 * conditions). Returns 0 for identical colours; ~2.3 is the classic
 * just-noticeable difference for two separated patches.
 */
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  // G expands the a* axis in the low-chroma region — this is the correction
  // that makes ΔE00 reliable for the greys in this palette.
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (bb: number, ap: number): number => {
    if (bb === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(bb, ap));
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const RT = -RC * Math.sin(rad(2 * dTheta));

  const Lbarp50 = (Lbarp - 50) ** 2;
  const SL = 1 + (0.015 * Lbarp50) / Math.sqrt(20 + Lbarp50);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH),
  );
}

/** Convenience: ΔE00 straight from two sRGB triples. */
export function rgbDistance(a: RGB, b: RGB): number {
  return deltaE00(rgbToLab(a), rgbToLab(b));
}

/*
 * There is deliberately no WCAG contrast helper here. The contrast check runs
 * inside the browser (visual/checks.ts), which is a template literal handed to
 * page.evaluate and therefore cannot import anything. A second copy on this
 * side would be a formula nothing calls, drifting away from the one that does.
 */
