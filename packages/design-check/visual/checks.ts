/**
 * The review pass, as a single function evaluated inside the page.
 *
 * It runs in the browser, so it is written as one self-contained string of DOM
 * code with no imports. Everything here is mechanically decidable from the DOM
 * and CSSOM. The judgements that are not — optical centring, whether a
 * hierarchy reads correctly, whether a heading collapse was the right call —
 * are deliberately absent, and belong to the side-by-side screenshots in the
 * report instead.
 */

export interface VisualFinding {
  rule: string;
  ruleTitle: string;
  message: string;
  offending: string;
  expected?: string;
  selector: string;
  box?: { x: number; y: number; width: number; height: number };
  /** Filled in after the audit runs, from a clipped screenshot. */
  cropDataUri?: string;
}

export interface PageAudit {
  findings: VisualFinding[];
  /** Geometry of every element, keyed by selector, for light/dark comparison. */
  geometry: Record<string, [number, number, number, number]>;
  /** The page-title element's typography, for cross-screen comparison. */
  pageTitle: Record<string, string> | null;
  /** Colours in use that are not in the design system's resolved palette. */
  offPaletteColours: string[];
  fontsLoaded: boolean;
  /** The family actually in use, so a failure says which font was missing. */
  fontFamily: string;
  /** Findings whose crop was skipped by the per-screen cap. */
  cropsOmitted?: number;
}

export const AUDIT_SCRIPT = `(() => {
  const findings = [];
  const add = (rule, ruleTitle, message, offending, el, expected) => {
    const r = el ? el.getBoundingClientRect() : null;
    findings.push({
      rule, ruleTitle, message, offending, expected,
      selector: el ? selectorFor(el) : "",
      box: r ? { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } : undefined,
    });
  };

  /* A short, stable-ish path used to name an element in the report and to key
     geometry across themes. Not a unique selector — a readable one. */
  const selectorFor = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && depth < 4; depth += 1) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(part + "#" + node.id); break; }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
      depth += 1;
    }
    return parts.join(">");
  };

  const elements = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0;
  });

  const px = (v) => Math.round(parseFloat(v) || 0);

  /* --- overflow ------------------------------------------------------
     Measured per element, NOT via documentElement.scrollWidth: globals.css
     sets \`body { overflow-x: hidden }\`, which hides the scrollbar and makes
     the document report no overflow at all while content is still cut off. */
  const viewportWidth = document.documentElement.clientWidth;
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) continue;
    if (rect.right <= viewportWidth + 1 && rect.left >= -1) continue;

    // Ignore anything deliberately clipped or scrolled by an ancestor.
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "hidden" || o === "auto" || o === "scroll") { clipped = true; break; }
    }
    if (clipped) continue;

    const amount = Math.round(Math.max(rect.right - viewportWidth, -rect.left));
    if (amount < 2) continue;
    add(
      "overflow",
      "Something runs off the side of the screen",
      "This element extends " + amount + " pixels past the edge of the screen, so part of " +
        "it cannot be seen and the page can be dragged sideways.",
      amount + "px past the edge",
      el,
    );
  }

  /* --- equal padding -------------------------------------------------
     Near-equal padding is almost always a mistake rather than a decision, so
     a 1–4px difference is reported and an obviously deliberate asymmetry is
     not. */
  for (const el of elements) {
    const s = getComputedStyle(el);
    const [l, r] = [px(s.paddingLeft), px(s.paddingRight)];
    if (l === r) continue;
    const diff = Math.abs(l - r);
    if (diff === 0 || diff > 4) continue;
    if (l === 0 || r === 0) continue;
    add(
      "uneven-padding",
      "The space inside a box is uneven",
      "The space inside this box is " + l + " pixels on the left and " + r + " on the " +
        "right. A gap that small is almost never deliberate — it reads as slightly " +
        "off-centre without it being obvious why.",
      l + "px / " + r + "px",
      el,
      "the same on both sides",
    );
  }

  /* --- centring (geometric only) ------------------------------------- */
  for (const el of elements) {
    const s = getComputedStyle(el);
    const centred =
      (s.marginLeft === "auto" && s.marginRight === "auto") ||
      s.justifyContent === "center" ||
      s.textAlign === "center";
    if (!centred) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    if (s.marginLeft !== "auto") continue;

    const a = el.getBoundingClientRect();
    const b = parent.getBoundingClientRect();
    const ps = getComputedStyle(parent);
    const left = a.left - (b.left + px(ps.paddingLeft));
    const right = (b.right - px(ps.paddingRight)) - a.right;
    if (Math.abs(left - right) <= 1) continue;
    if (a.width === 0 || b.width === 0) continue;

    add(
      "off-centre",
      "Something meant to be centred is not",
      "This is set to sit in the middle, but there are " + Math.round(left) + " pixels of " +
        "space on its left and " + Math.round(right) + " on its right.",
      Math.round(left) + "px / " + Math.round(right) + "px",
      el,
      "equal space on both sides",
    );
  }

  /* --- alignment -----------------------------------------------------
     The classic bug humans miss: an edge that is close to a shared line but
     not on it. Exact matches pass, and a clearly intentional indent (8px or
     more) passes. */
  /* Elements inside an <svg> are drawing instructions, not laid-out siblings —
     comparing the x of two <path>s says nothing about whether the interface is
     aligned. */
  const laidOut = elements.filter((el) => !el.closest("svg"));
  const parents = new Set(laidOut.map((el) => el.parentElement).filter(Boolean));
  for (const parent of parents) {
    if (parent.closest("svg")) continue;
    const children = Array.from(parent.children).filter(
      (c) => c.getClientRects().length > 0 && c.getBoundingClientRect().width > 0,
    );
    if (children.length < 3) continue;

    const lefts = children.map((c) => Math.round(c.getBoundingClientRect().left));
    const counts = new Map();
    for (const l of lefts) counts.set(l, (counts.get(l) || 0) + 1);

    let dominant = null;
    let dominantCount = 0;
    for (const [value, count] of counts) {
      if (count > dominantCount) { dominant = value; dominantCount = count; }
    }
    if (dominantCount < 3) continue;

    children.forEach((child, i) => {
      const left = lefts[i];
      const off = Math.abs(left - dominant);
      if (off === 0 || off < 1 || off >= 8) return;
      add(
        "near-alignment",
        "Something is almost, but not quite, lined up",
        "This sits " + off + " pixels away from the line its neighbours share. It is close " +
          "enough to look like a mistake rather than a choice — either line it up or move " +
          "it far enough that it reads as deliberate.",
        off + "px out",
        child,
        "aligned with its neighbours",
      );
    });
  }

  /* --- image sharpness ----------------------------------------------- */
  for (const img of Array.from(document.images)) {
    const rect = img.getBoundingClientRect();
    if (!img.naturalWidth || rect.width === 0) continue;
    // A vector scales without loss, and its naturalWidth is an arbitrary
    // authoring size rather than a resolution.
    // Plain string tests rather than a regex: this whole block lives inside a
    // template literal, so every backslash would need double-escaping and a
    // broken pattern only shows up at run time.
    const source = (img.currentSrc || img.src || "").toLowerCase();
    const path = source.split("?")[0];
    if (path.endsWith(".svg") || source.startsWith("data:image/svg")) continue;

    /* Compared against the CSS size, not the device-pixel size. Flagging
       everything below 2× would report every 1× asset in the app as a defect,
       which is a delivery decision rather than a design one. Below 1× the
       image is genuinely being stretched, and that is not arguable. */
    if (img.naturalWidth >= rect.width - 1) continue;
    add(
      "soft-image",
      "An image is being stretched past its real size",
      "This image is only " + img.naturalWidth + " pixels wide but is being shown " +
        Math.round(rect.width) + " pixels wide, so it is being stretched and will look soft.",
      img.naturalWidth + "px shown at " + Math.round(rect.width) + "px",
      img,
      "an image at least " + Math.round(rect.width) + " pixels wide",
    );
  }

  /* --- font weight ---------------------------------------------------
     Metropolis ships every weight, so synthetic bolding means a weight was
     asked for that the family does not have loaded. */
  const LOADED_WEIGHTS = [100,200,300,400,500,600,700,800,900];
  for (const el of elements) {
    if (!el.textContent || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    const weight = parseInt(s.fontWeight, 10);
    if (LOADED_WEIGHTS.includes(weight)) continue;
    add(
      "font-weight",
      "Text uses a weight the font does not have",
      "This text asks for weight " + weight + ", which is not one of the weights the font " +
        "provides. The browser fakes it by smearing the letters, which looks subtly wrong.",
      String(weight),
      el,
      "one of the real weights",
    );
  }

  /* --- contrast ------------------------------------------------------ */
  const parseRgb = (value) => {
    const m = value.match(/-?[\\d.]+/g);
    return m && m.length >= 3 ? [ +m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1 ] : null;
  };
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  /* Returns the solid colour behind an element, or null when it cannot be
     known. Gradients, background images and video all sit between the text and
     any solid colour further up, and guessing past them produced thousands of
     confident, wrong findings on the marketing page — where white text sits on
     a dark photograph that this code cannot see. Reporting nothing is the
     correct answer when the backdrop is genuinely unknown. */
  /* Hex first. parseRgb pulls runs of digits out of a string, which is right
     for "rgb(30, 30, 30)" and badly wrong for "#f5f5f5" — that yields [5,5,5]
     and every palette colour then fails to match anything on screen. */
  const normalise = (v) => {
    const value = String(v).trim().toLowerCase();
    if (value.startsWith("#")) {
      const hex = value.slice(1);
      if (hex.length === 3) return "#" + hex.split("").map((ch) => ch + ch).join("");
      if (hex.length >= 6) return "#" + hex.slice(0, 6);
      return value;
    }
    const c = parseRgb(value);
    if (!c) return value;
    return "#" + [c[0],c[1],c[2]].map((n) => n.toString(16).padStart(2,"0")).join("");
  };

  const backdropOf = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parseRgb(s.backgroundColor);
      if (c && c[3] > 0.9) return c;
    }
    return parseRgb(getComputedStyle(document.body).backgroundColor) || [255,255,255,1];
  };

  for (const el of elements) {
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!ownText) continue;

    const s = getComputedStyle(el);
    const fg = parseRgb(s.color);
    if (!fg || fg[3] < 0.9) continue;
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;

    const backdrop = backdropOf(el);
    if (!backdrop) continue;
    const ratio = contrast(fg, backdrop);
    if (ratio >= required) continue;
    // Naming both colours is what turns a thousand findings into the handful
    // of palette decisions actually behind them.
    const pair = normalise(s.color) + " on " + normalise("rgb(" + backdrop.slice(0,3).join(",") + ")");
    add(
      "contrast",
      "Text is too faint to read comfortably",
      pair + " gives a contrast of " + ratio.toFixed(1) + " to 1. The accessibility " +
        "standard asks for at least " + required + " to 1 at this size, below which it " +
        "becomes hard to read for anyone with less than perfect eyesight.",
      pair + " (" + ratio.toFixed(1) + ":1)",
      el,
      "at least " + required + ":1",
    );
  }

  /* --- heading order (the authoritative check) ------------------------
     This sees the real tree, so composition resolves for free: a heading
     rendered by a shared component is just a heading here. */
  const headings = Array.from(
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]"),
  ).filter((el) => el.getClientRects().length > 0);
  const levelOf = (el) => {
    const tag = /^H([1-6])$/.exec(el.tagName);
    if (tag) return +tag[1];
    return parseInt(el.getAttribute("aria-level") || "2", 10);
  };
  const h1s = headings.filter((h) => levelOf(h) === 1);
  if (h1s.length === 0 && headings.length > 0) {
    add("heading-order", "This screen has no main heading",
      "There is no top-level heading on this screen, so nothing announces what the page is.",
      "no <h1>", headings[0], "one <h1>");
  }
  if (h1s.length > 1) {
    add("heading-order", "This screen has more than one main heading",
      "There are " + h1s.length + " top-level headings on this screen. There should be one.",
      h1s.length + " × <h1>", h1s[1], "one <h1>");
  }
  for (let i = 1; i < headings.length; i += 1) {
    const previous = levelOf(headings[i - 1]);
    const current = levelOf(headings[i]);
    if (current <= previous + 1) continue;
    add("heading-order", "A heading level is skipped",
      "This screen goes from a level " + previous + " heading straight to level " + current +
        ", leaving a gap in the outline.",
      "<h" + current + ">", headings[i], "<h" + (previous + 1) + ">");
  }
  for (const h of headings) {
    if (h.textContent && h.textContent.trim()) continue;
    add("heading-order", "A heading is empty",
      "This heading has no text in it, so it adds a rung to the outline that says nothing.",
      "empty heading", h);
  }

  /* --- geometry and palette, for the light/dark comparison ------------ */
  const geometry = {};
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    geometry[selectorFor(el)] = [
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
    ];
  }

  const root = getComputedStyle(document.documentElement);
  const palette = new Set();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of Array.from(rules || [])) {
      if (!rule.style) continue;
      for (const prop of Array.from(rule.style)) {
        if (!prop.startsWith("--ds-")) continue;
        const value = root.getPropertyValue(prop).trim();
        if (value) palette.add(value.replace(/\\s+/g, ""));
      }
    }
  }
  const paletteHexes = new Set(Array.from(palette).map(normalise));
  const offPalette = new Set();
  for (const el of elements) {
    const s = getComputedStyle(el);
    for (const prop of ["color", "backgroundColor", "borderTopColor"]) {
      const c = parseRgb(s[prop]);
      if (!c || c[3] < 0.95) continue;
      const hex = normalise(s[prop]);
      if (paletteHexes.has(hex)) continue;
      offPalette.add(hex);
    }
  }

  /* --- did the real font actually load? -------------------------------
     next/font/local generates its own family name (a hash), so checking for
     a literal "Metropolis" always fails. The body's own computed family is
     the only reliable handle. This matters because if the font fell back,
     every weight and size finding above was measured against the wrong
     typeface and is worthless. */
  const bodyFamily = getComputedStyle(document.body).fontFamily
    .split(",")[0].trim().replace(/^["']|["']$/g, "");
  const fontsLoaded =
    document.fonts.status === "loaded" &&
    (document.fonts.check('600 15px "' + bodyFamily + '"') ||
      Array.from(document.fonts).some(
        (f) => f.family.replace(/^["']|["']$/g, "") === bodyFamily && f.status === "loaded",
      ));

  const title = h1s[0] || headings[0] || null;
  const titleStyle = title
    ? (() => {
        const s = getComputedStyle(title);
        return {
          fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing, color: s.color, marginBottom: s.marginBottom,
        };
      })()
    : null;

  return {
    findings,
    geometry,
    pageTitle: titleStyle,
    offPaletteColours: Array.from(offPalette),
    fontFamily: bodyFamily,
    fontsLoaded,
  };
})()`;
