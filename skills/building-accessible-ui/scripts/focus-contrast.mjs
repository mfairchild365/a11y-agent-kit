#!/usr/bin/env node
// Measures the contrast of each control's focus indicator. It presses Tab through the page in a real browser,
// and at every control reads what changed on keyboard focus (outline, box-shadow ring, border, fill) from the
// computed styles, finds the background that indicator sits on, and reports the WCAG ratio, unrounded.
//
// An indicator counts as adequate when it reaches --min (default 3:1, as 1.4.11 asks of an author-styled focus
// indicator). A control with several indicators (a two-tone ring) passes when any one of them reaches it.
//   outline        sits on the parent's background; with a negative offset, on the control's own
//   box-shadow     a ring or glow; outside on the parent's background, inset on the control's own
//   border         a border that changed on focus; measured against the better of the two backgrounds
//   background     the focused fill against the unfocused fill
// The background is the stack of backgrounds behind the indicator, walked up through transparent ones
// (and through shadow roots and frames) to the first opaque one, or to white.
//
// Verdicts per control: pass, fail, unmeasured, ua-default, other-change, elsewhere, none.
// Findings (candidates, never verdicts):
//   focus-indicator-low-contrast@<control>   1.4.11   every measured indicator is under --min
//   focus-indicator-unmeasured@<control>     1.4.11   it sits on an image or gradient, or is still animating
//   focus-indicator-none@<control>           2.4.7    nothing visible changed on the control, an ancestor or a pseudo-element
// Not measured, and not reported: the browser's own ring (outline-style auto), a change of text color,
// underline, opacity or transform alone, and anything drawn by script. A ring that has no contrast on one
// background and plenty on another is reported per control, so two controls on two fills give two findings.
//
// Usage: node focus-contrast.mjs <url or html file> [--json] [--min 3] [--max-stops 200] [--max-ms 20000]
//        [--load-timeout 15000] [--wait 300]
//   stopReason: the walk's (complete, cycle, modal-cycle, stuck, stop-cap, time-cap) or load-timeout.
//   Same-origin frames and open shadow roots are covered. Run it on the state you want measured: a menu or
//   dialog that must be opened first has to be opened first.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.

import { launch, toUrl } from "./_browser.mjs";
import { analyze } from "./_contrast.mjs";
import { inPage as inPageSelector, installTabCapture, makeSelector, walkTab } from "./_tab-walk.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const VALUE_FLAGS = ["--min", "--max-stops", "--max-ms", "--load-timeout", "--wait"];
const target = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node focus-contrast.mjs <url or html file> [--json] [--min 3] [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const min = Number(opt("--min", 3));
const maxStops = Number(opt("--max-stops", 200));
const maxMs = Number(opt("--max-ms", 20000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));

// ---- runs in the page --------------------------------------------------------------------------------
function makeStyleTools() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // Any CSS color to [r, g, b, a]. Computed colors are almost always rgb()/rgba(); the canvas converts the rest.
  const rgba = (str) => {
    const text = String(str || "").trim();
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
    if (m) { let a = m[4] === undefined ? 1 : parseFloat(m[4]); if (m[5]) a /= 100; return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a]; }
    if (text === "transparent" || text === "") return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#010203";
    ctx.fillStyle = text;
    if (ctx.fillStyle === "#010203" && text.toLowerCase() !== "#010203") return [0, 0, 0, 0];
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const splitTop = (s) => { const out = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const shadows = (str) => {
    if (!str || str === "none") return [];
    return splitTop(str).map((part) => {
      const inset = /\binset\b/.test(part);
      const colorText = (/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/.exec(part) || [])[0] || "";
      const nums = part.replace(colorText, "").replace(/\binset\b/, "").trim().split(/\s+/).filter(Boolean).map(parseFloat);
      return { inset, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: rgba(colorText || "rgb(0, 0, 0)") };
    });
  };
  const gcs = (el, pseudo) => el.ownerDocument.defaultView.getComputedStyle(el, pseudo);
  const side = (cs, s) => ({ style: cs["border" + s + "Style"], width: parseFloat(cs["border" + s + "Width"]) || 0, color: rgba(cs["border" + s + "Color"]) });
  const snap = (el) => {
    const cs = gcs(el);
    return {
      outline: { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0, offset: parseFloat(cs.outlineOffset) || 0, color: rgba(cs.outlineColor) },
      shadows: shadows(cs.boxShadow),
      borders: { top: side(cs, "Top"), right: side(cs, "Right"), bottom: side(cs, "Bottom"), left: side(cs, "Left") },
      bgColor: rgba(cs.backgroundColor),
      bgImage: cs.backgroundImage,
      other: [cs.color, cs.textDecorationLine, cs.textDecorationColor, cs.opacity, cs.transform, cs.filter, cs.textShadow, cs.fontWeight].join("|"),
    };
  };
  // The parts of an ancestor or pseudo-element that could draw a focus indicator, as one comparable string.
  const sig = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderTopColor, cs.borderTopWidth, cs.borderTopStyle, cs.backgroundColor, cs.backgroundImage, cs.content, cs.display].join("|");
  const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || (el.ownerDocument.defaultView.frameElement) || null;
  const around = (el) => {
    const ancestors = [];
    for (let n = parentOf(el), i = 0; n && i < 4; n = parentOf(n), i++) ancestors.push(sig(gcs(n)));
    return { ancestors, before: sig(gcs(el, "::before")), after: sig(gcs(el, "::after")) };
  };
  // The backgrounds behind an element, from its own outward, stopping at the first opaque one.
  const backdrop = (start) => {
    const layers = [];
    let image = false;
    for (let n = start; n; n = parentOf(n)) {
      const cs = gcs(n);
      const c = rgba(cs.backgroundColor);
      if (cs.backgroundImage !== "none") { image = true; break; }
      layers.push(c);
      if (c[3] >= 1) break;
    }
    return { layers, image };
  };
  return { snap, around, backdrop, parentOf, candidates: 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]' };
}

// Records how every focusable control looks before anything has focus.
function scanBaseline(makeSelector, makeStyleTools) {
  const reg = window.__kw || (Object.defineProperty(window, "__kw", { value: { map: new WeakMap(), n: 0, active: null } }), window.__kw);
  const t = makeStyleTools();
  reg.base = new WeakMap();
  const walk = (root) => {
    for (const el of root.querySelectorAll(t.candidates)) reg.base.set(el, { snap: t.snap(el), around: t.around(el) });
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  return true;
}

// Reads the focused control after its transitions have finished.
async function collectFocus(makeSelector, makeStyleTools) {
  const reg = window.__kw;
  const el = reg.active;
  const t = makeStyleTools();
  const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
  const anims = () => (el.getAnimations ? el.getAnimations({ subtree: true }) : []);
  const endless = (a) => { try { return a.effect.getComputedTiming().endTime === Infinity; } catch { return false; } };
  const finite = anims().filter((a) => !endless(a));
  if (finite.length) await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), timeout(1500)]);
  const animating = anims().some((a) => endless(a) || a.playState === "running");
  const known = reg.base && reg.base.get(el);
  const focus = t.snap(el);
  const now = t.around(el);
  const elsewhere = known
    ? { ancestors: now.ancestors.some((s, i) => s !== known.around.ancestors[i]), pseudo: now.before !== known.around.before || now.after !== known.around.after }
    : { ancestors: false, pseudo: false };
  const parent = t.parentOf(el);
  return {
    selector: makeSelector()(el),
    focus,
    base: known ? known.snap : null,
    ownBg: t.backdrop(el),
    parentBg: parent ? t.backdrop(parent) : { layers: [], image: false },
    elsewhere,
    animating,
  };
}

const inPage = (fn) => `(${fn.toString()})(${makeSelector.toString()}, ${makeStyleTools.toString()})`;

const browser = await launch();
const findings = [];
const controls = [];
let stopReason = "complete";
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installTabCapture(page);
  try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
  catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) stopReason = "load-timeout"; else throw e; }
  await page.waitForTimeout(settleMs);
  await page.bringToFront();
  await page.mouse.move(0, 0);
  await page.evaluate(inPage(scanBaseline));

  const { ended } = await walkTab(page, {
    maxStops,
    maxMs,
    onStop: async () => {
      const c = await page.evaluate(inPage(collectFocus));
      const r = analyze(c, { min });
      controls.push({ selector: c.selector, verdict: r.verdict, best: r.best, indicators: r.indicators });
      const detail = { element: c.selector, min, best: r.best, indicators: r.indicators };
      if (r.verdict === "fail") findings.push({ id: `focus-indicator-low-contrast@${c.selector}`, check: "focus-indicator-low-contrast", criterion: "1.4.11", class: "candidate", ...detail });
      if (r.verdict === "unmeasured") findings.push({ id: `focus-indicator-unmeasured@${c.selector}`, check: "focus-indicator-unmeasured", criterion: "1.4.11", class: "candidate", ...detail, note: "It sits on an image or gradient, or is still animating. Measure it by hand." });
      if (r.verdict === "none") findings.push({ id: `focus-indicator-none@${c.selector}`, check: "focus-indicator-none", criterion: "2.4.7", class: "candidate", element: c.selector, note: "Nothing visible changed on the control, an ancestor or a pseudo-element. Confirm with a screenshot." });
    },
  });
  if (stopReason === "complete") stopReason = ended; else if (ended !== "complete") stopReason = ended;
} finally {
  await browser.close();
}

const seen = new Set();
const unique = findings.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).sort((a, b) => a.id.localeCompare(b.id));
const result = { findings: unique, stopReason, controls, stats: { controls: controls.length, min }, note: "Candidates, not verdicts: confirm each with the keyboard and a screenshot before reporting it." };
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  for (const c of controls) {
    const ratios = c.indicators.map((i) => (i.ratio === null ? `${i.kind} n/a` : `${i.kind} ${i.ratio.toFixed(4)}:1`)).join(", ");
    console.log(`${c.verdict.padEnd(12)} ${c.selector}${ratios ? `   ${ratios}` : ""}`);
  }
  for (const f of unique) console.log(`candidate  ${f.criterion.padEnd(7)} ${f.id}`);
  console.log(`\n${unique.length} candidate(s). stopReason: ${stopReason}. ${controls.length} control(s), minimum ${min}:1.`);
}
