#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_contrast.mjs, the pure logic behind focus-contrast.mjs: ratios,
// alpha compositing, background stacks and every verdict. No browser needed.
// Usage: node evals/test_contrast.mjs   (exits 1 if any case behaves differently than expected)

import { analyze, flatten, linear, luminance, over, ratio } from "../skills/building-accessible-ui/scripts/_contrast.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const WHITE = hex("#ffffff"), BLACK = hex("#000000");

// ---- the arithmetic
check("black on white is 21:1 and white on white is 1:1", near(ratio(BLACK, WHITE), 21) && near(ratio(WHITE, WHITE), 1));
check("the ratio is symmetric", near(ratio(hex("#6aa6f0"), WHITE), ratio(WHITE, hex("#6aa6f0"))));
check("#767676 on white is 4.5422:1 (the usual 4.5 boundary color)", near(ratio(hex("#767676"), WHITE), 4.542224959605253, 1e-9));
check("#949494 on white is 3.0335:1 and #959595 is 2.9953:1: the boundary is not rounded", ratio(hex("#949494"), WHITE) >= 3 && ratio(hex("#959595"), WHITE) < 3);
check("luminance of mid grey and the sRGB curve match the WCAG formula", near(luminance([128, 128, 128]), 0.21586, 1e-4) && near(linear(255), 1) && near(linear(0), 0));
check("a half-transparent black over white is mid grey", over([0, 0, 0, 0.5], [255, 255, 255]).every((v) => near(v, 127.5)));
check("a fully transparent color changes nothing, an opaque one replaces it", over([10, 20, 30, 0], [200, 100, 50]).join() === "200,100,50" && over([10, 20, 30, 1], [200, 100, 50]).join() === "10,20,30");
check("flatten: transparent layers show the canvas, an opaque layer hides what is under it", flatten([[0, 0, 0, 0], [0, 0, 0, 0]]).join() === "255,255,255" && flatten([[10, 10, 10, 1], [200, 0, 0, 1]]).join() === "10,10,10");
check("flatten: a half-transparent layer over an opaque parent composites outward-in", flatten([[0, 0, 0, 0.5], [255, 0, 0, 1]]).map(Math.round).join() === "128,0,0");
check("flatten: a dark canvas can be passed in", flatten([[0, 0, 0, 0]], [18, 18, 18]).join() === "18,18,18");

// ---- building a control
const NONE_OUTLINE = { style: "none", width: 0, offset: 0, color: [0, 0, 0, 0] };
const sideNone = { style: "none", width: 0, color: [0, 0, 0, 0] };
const snap = (o = {}) => ({
  outline: NONE_OUTLINE, shadows: [], borders: { top: sideNone, right: sideNone, bottom: sideNone, left: sideNone },
  bgColor: [0, 0, 0, 0], bgImage: "none", other: "same", ...o,
});
const solid = (hexColor, width = 2, offset = 2) => ({ style: "solid", width, offset, color: hex(hexColor) });
const border = (hexColor, width = 2) => ({ top: { style: "solid", width, color: hex(hexColor) }, right: { style: "solid", width, color: hex(hexColor) }, bottom: { style: "solid", width, color: hex(hexColor) }, left: { style: "solid", width, color: hex(hexColor) } });
const bg = (hexColor) => ({ layers: [hex(hexColor)], image: false });
const control = (focus, extra = {}) => ({ focus, base: snap(), ownBg: bg("#ffffff"), parentBg: bg("#ffffff"), elsewhere: { ancestors: false, pseudo: false }, animating: false, ...extra });
const verdict = (c, opts) => analyze(c, opts).verdict;

// ---- outline
check("an outside ring that reaches 3:1 passes", verdict(control(snap({ outline: solid("#005fcc") }))) === "pass");
check("an outside ring under 3:1 fails, with its unrounded ratio", (() => { const r = analyze(control(snap({ outline: solid("#6aa6f0") }))); return r.verdict === "fail" && near(r.indicators[0].ratio, 2.5223481106365373, 1e-9); })());
check("just over and just under 3:1: #949494 passes, #959595 fails", verdict(control(snap({ outline: solid("#949494") }))) === "pass" && verdict(control(snap({ outline: solid("#959595") }))) === "fail");
check("an outline at offset 0 or positive sits on the parent's background", (() => { const c = control(snap({ outline: solid("#005fcc", 2, 0) }), { parentBg: bg("#005fcc"), ownBg: bg("#ffffff") }); const r = analyze(c); return r.indicators[0].sits === "outside" && r.verdict === "fail"; })());
check("a negative offset puts the ring inside, on the control's own background", (() => { const c = control(snap({ outline: solid("#005fcc", 2, -2) }), { parentBg: bg("#005fcc"), ownBg: bg("#ffffff") }); const r = analyze(c); return r.indicators[0].sits === "inside" && r.verdict === "pass"; })());
check("the browser's own focus ring (outline-style auto) is not measured", (() => { const r = analyze(control(snap({ outline: { style: "auto", width: 1, offset: 0, color: hex("#101010") } }))); return r.verdict === "ua-default" && r.indicators.length === 0; })());
check("an outline that was there before focus is not a focus indicator", verdict(control(snap({ outline: solid("#cccccc") }), { base: snap({ outline: solid("#cccccc") }) })) === "none");
check("a transparent outline is ignored", verdict(control(snap({ outline: { ...solid("#000000"), color: [0, 0, 0, 0] } }))) === "none");
check("a semi-transparent ring is composited over its background before measuring", (() => { const r = analyze(control(snap({ outline: { style: "solid", width: 2, offset: 2, color: [0, 0, 0, 0.1] } }))); return r.verdict === "fail" && r.indicators[0].indicator.join() === "230,230,230"; })());
check("the ring is measured against the stack of backgrounds, through transparent ancestors", (() => { const c = control(snap({ outline: solid("#ffffff") }), { parentBg: { layers: [[0, 0, 0, 0], hex("#202020")], image: false } }); return verdict(c) === "pass"; })());
check("a dark background with a dark ring fails", verdict(control(snap({ outline: solid("#333333") }), { parentBg: bg("#111111") })) === "fail");
check("min can be raised: a 4.5:1 requirement fails a 3.03:1 ring", verdict(control(snap({ outline: solid("#949494") })), { min: 4.5 }) === "fail");

// ---- box-shadow
const shadow = (o) => ({ inset: false, x: 0, y: 0, blur: 0, spread: 3, color: hex("#005fcc"), ...o });
check("a box-shadow ring that reaches 3:1 passes, and one under 3:1 fails", verdict(control(snap({ shadows: [shadow()] }))) === "pass" && verdict(control(snap({ shadows: [shadow({ color: hex("#aaccee") })] }))) === "fail");
check("a plain drop shadow (an offset, no spread) is not an indicator", verdict(control(snap({ shadows: [shadow({ x: 2, y: 4, blur: 6, spread: 0, color: hex("#000000") })] }))) === "none");
check("a centered blurred glow counts as an indicator", analyze(control(snap({ shadows: [shadow({ blur: 8, spread: 0, color: hex("#005fcc") })] }))).indicators.length === 1);
check("a shadow that was already there before focus is not a focus indicator", verdict(control(snap({ shadows: [shadow({ color: hex("#aaccee") })] }), { base: snap({ shadows: [shadow({ color: hex("#aaccee") })] }) })) === "none");
check("an inset ring sits on the control's own background", analyze(control(snap({ shadows: [shadow({ inset: true })] }), { ownBg: bg("#e0e0ff") })).indicators[0].sits === "inside");
check("a two-tone ring passes when either tone reaches 3:1", verdict(control(snap({ outline: solid("#eeeeee", 2, 0), shadows: [shadow({ spread: 4, color: hex("#000000") })] }))) === "pass");
check("a two-tone ring where both tones are under 3:1 fails", verdict(control(snap({ outline: solid("#dddddd", 2, 0), shadows: [shadow({ spread: 4, color: hex("#cccccc") })] }))) === "fail");

// ---- border and background changes
check("a border that darkens on focus is measured, and a faint one fails", verdict(control(snap({ borders: border("#005fcc") }), { base: snap({ borders: border("#cccccc") }) })) === "pass" && verdict(control(snap({ borders: border("#bbbbbb") }), { base: snap({ borders: border("#dddddd") }) })) === "fail");
check("a border that did not change is not an indicator", verdict(control(snap({ borders: border("#bbbbbb") }), { base: snap({ borders: border("#bbbbbb") }) })) === "none");
check("a border is measured against the better of the control's own and its parent's background", verdict(control(snap({ borders: border("#ffffff") }), { base: snap({ borders: border("#eeeeee") }), ownBg: bg("#000000"), parentBg: bg("#ffffff") })) === "pass");
check("a background change is measured as focused fill against unfocused fill", (() => { const r = analyze(control(snap({ bgColor: hex("#000000") }), { base: snap({ bgColor: hex("#ffffff") }) })); return r.verdict === "pass" && near(r.indicators[0].ratio, 21); })());
check("a faint background change fails", verdict(control(snap({ bgColor: hex("#f0f0f0") }), { base: snap({ bgColor: hex("#ffffff") }) })) === "fail");
check("a background color unchanged on focus is not an indicator", verdict(control(snap({ bgColor: hex("#f0f0f0") }), { base: snap({ bgColor: hex("#f0f0f0") }) })) === "none");

// ---- what can't be measured, and what is not this script's business
check("an indicator over a background image or gradient is unmeasured, not failed", (() => { const r = analyze(control(snap({ outline: solid("#6aa6f0") }), { parentBg: { layers: [[0, 0, 0, 0]], image: true } })); return r.verdict === "unmeasured" && r.indicators[0].reason === "background-image"; })());
check("an indicator that passes elsewhere still passes when another one is unmeasured", verdict(control(snap({ outline: solid("#6aa6f0"), shadows: [shadow()] }), { parentBg: bg("#ffffff") })) === "pass");
check("an animation that never settles makes a failing ring unmeasured", verdict(control(snap({ outline: solid("#6aa6f0") }), { animating: true })) === "unmeasured");
check("an animation with no indicator found is unmeasured, not 'none'", verdict(control(snap(), { animating: true })) === "unmeasured");
check("a change to text color or underline only is 'other-change', not 'none'", verdict(control(snap({ other: "underlined" }), { base: snap({ other: "plain" }) })) === "other-change");
check("a ring that failed and another change elsewhere stays a failure", verdict(control(snap({ outline: solid("#6aa6f0"), other: "bold" }), { base: snap({ other: "plain" }) })) === "fail");
check("a ring on an ancestor (focus-within) or a pseudo-element is 'elsewhere'", verdict(control(snap(), { elsewhere: { ancestors: true, pseudo: false } })) === "elsewhere" && verdict(control(snap(), { elsewhere: { ancestors: false, pseudo: true } })) === "elsewhere");
check("nothing visible changing anywhere is 'none'", verdict(control(snap())) === "none");
check("with no baseline, an outline is still measured and border and background changes are skipped", (() => { const r = analyze({ ...control(snap({ outline: solid("#6aa6f0"), bgColor: hex("#000000"), borders: border("#000000") })), base: null }); return r.verdict === "fail" && r.indicators.length === 1; })());

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
