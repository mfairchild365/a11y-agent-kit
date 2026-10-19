// Pure contrast logic for focus-contrast.mjs: no browser, no page. The script reads computed styles in the
// page and hands them here; every decision about ratios, backgrounds and verdicts is made in this file so it
// can be tested on its own.
//
// Colors are [r, g, b, a] with r, g, b in 0..255 and a in 0..1. Ratios are WCAG 2.x, never rounded.

const clampByte = (n) => Math.max(0, Math.min(255, n));

export function linear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function ratio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// One color painted over an opaque one.
export function over([r, g, b, a = 1], [br, bg, bb]) {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)].map(clampByte);
}

// What a stack of backgrounds adds up to. layers[0] is the element's own background, then its parent's, and so
// on outward; the canvas (white unless told otherwise) sits under all of them.
export function flatten(layers, canvas = [255, 255, 255]) {
  let color = canvas;
  for (let i = layers.length - 1; i >= 0; i--) color = over(layers[i], color);
  return color;
}

const sameColor = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.5 / (i === 3 ? 255 : 1));
const sameShadow = (a, b) => a.inset === b.inset && a.x === b.x && a.y === b.y && a.blur === b.blur && a.spread === b.spread && sameColor(a.color, b.color);
const VISIBLE_STYLE = (s) => s && s !== "none" && s !== "hidden";

// A box-shadow counts as a focus indicator when it is a ring or a glow, not a plain drop shadow: it has a spread,
// or it is a blurred glow centered on the box.
const isRing = (s) => s.color[3] > 0 && (s.spread > 0 || (s.blur > 0 && s.x === 0 && s.y === 0));

// c: what the page reported for one control that took keyboard focus.
//   focus, base   a style snapshot with the control focused, and before any focus (base may be null)
//     { outline: {style,width,offset,color}, shadows: [{inset,x,y,blur,spread,color}],
//       borders: {top,right,bottom,left: {style,width,color}}, bgColor, bgImage, other: "<signature>" }
//   ownBg, parentBg   { layers: [rgba...], image: boolean }: the backgrounds behind the control and behind its parent
//   elsewhere         { ancestors: boolean, pseudo: boolean }: an ancestor or a ::before/::after changed on focus
//   animating         an animation on the control had not finished (or never ends)
// Returns { verdict, indicators: [...], best } where verdict is one of:
//   pass          an indicator reaches min
//   fail          every measured indicator is below min
//   unmeasured    an indicator sits on an image or gradient, or is still animating, so it can't be measured
//   ua-default    the browser's own focus ring is showing
//   other-change  only a change this script doesn't measure (text color, underline, opacity, transform...)
//   elsewhere     the visible change is on an ancestor or a pseudo-element
//   none          nothing visible changed
export function analyze(c, { min = 3, canvas = [255, 255, 255] } = {}) {
  const { focus, base } = c;
  const indicators = [];
  let uaDefault = false;
  let other = false;

  const measure = (kind, color, bgInfo, sits, extra = {}) => {
    if (bgInfo.image) { indicators.push({ kind, sits, ratio: null, reason: "background-image", ...extra }); return; }
    const bg = flatten(bgInfo.layers, canvas);
    const ink = over(color, bg);
    indicators.push({ kind, sits, ratio: ratio(ink, bg), indicator: ink.map(Math.round), background: bg.map(Math.round), ...extra });
  };

  // outline
  const o = focus.outline;
  const baseO = base && base.outline;
  const outlineChanged = !baseO || baseO.style !== o.style || baseO.width !== o.width || !sameColor(baseO.color, o.color);
  if (VISIBLE_STYLE(o.style) && o.width > 0 && outlineChanged) {
    if (o.style === "auto") uaDefault = true;
    else if (o.color[3] > 0) {
      const inside = o.offset < 0;
      measure("outline", o.color, inside ? c.ownBg : c.parentBg, inside ? "inside" : "outside");
    }
  }

  // box-shadow rings that were not there before focus
  for (const s of focus.shadows) {
    if (!isRing(s)) continue;
    if (base && base.shadows.some((b) => sameShadow(b, s))) continue;
    measure("box-shadow", s.color, s.inset ? c.ownBg : c.parentBg, s.inset ? "inside" : "outside");
  }

  // a border whose color or width changed on focus: measured against the better of the element's own and its parent's background
  if (base) {
    for (const side of ["top", "right", "bottom", "left"]) {
      const f = focus.borders[side], b = base.borders[side];
      if (!VISIBLE_STYLE(f.style) || !(f.width > 0)) continue;
      if (b && VISIBLE_STYLE(b.style) && b.width === f.width && sameColor(b.color, f.color)) continue;
      const parts = [c.ownBg, c.parentBg].map((bg) => {
        if (bg.image) return null;
        const flat = flatten(bg.layers, canvas);
        const ink = over(f.color, flat);
        return { r: ratio(ink, flat), ink, flat };
      });
      if (parts.some((p) => p === null) && parts.every((p) => p === null || p.r < min)) {
        indicators.push({ kind: "border", side, sits: "edge", ratio: null, reason: "background-image" });
      } else {
        const best = parts.filter(Boolean).sort((x, y) => y.r - x.r)[0];
        indicators.push({ kind: "border", side, sits: "edge", ratio: best.r, indicator: best.ink.map(Math.round), background: best.flat.map(Math.round) });
      }
      break; // one border indicator per control is enough: the sides change together
    }
  }

  // a background color change: the indicator is the difference between the focused and the unfocused fill
  if (base && !sameColor(base.bgColor, focus.bgColor)) {
    if (c.parentBg.image || focus.bgImage !== "none" || base.bgImage !== "none") indicators.push({ kind: "background", sits: "fill", ratio: null, reason: "background-image" });
    else {
      const behind = flatten(c.parentBg.layers, canvas);
      const before = over(base.bgColor, behind), after = over(focus.bgColor, behind);
      indicators.push({ kind: "background", sits: "fill", ratio: ratio(after, before), indicator: after.map(Math.round), background: before.map(Math.round) });
    }
  }

  if (base && (base.other !== focus.other || base.bgImage !== focus.bgImage)) other = true;

  const measured = indicators.filter((i) => i.ratio !== null);
  const best = measured.length ? Math.max(...measured.map((i) => i.ratio)) : null;
  let verdict;
  if (uaDefault) verdict = "ua-default";
  else if (best !== null && best >= min) verdict = "pass";
  else if (indicators.some((i) => i.ratio === null)) verdict = "unmeasured";
  else if (measured.length) verdict = "fail";
  else if (other) verdict = "other-change";
  else if (c.elsewhere && (c.elsewhere.ancestors || c.elsewhere.pseudo)) verdict = "elsewhere";
  else if (c.animating) verdict = "unmeasured";
  else verdict = "none";
  if (c.animating && verdict === "fail") verdict = "unmeasured";
  return { verdict, indicators, best };
}
