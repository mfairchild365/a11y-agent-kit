#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_shift-tab.mjs, the pure logic that compares a Tab walk with a
// Shift+Tab walk. No browser needed.
// Usage: node evals/test_shift_tab.mjs   (exits 1 if any case behaves differently than expected)

import { compareWalks } from "../skills/building-accessible-ui/scripts/_shift-tab.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const walk = (keys, ended = "complete", trap = null) => ({ stops: keys.map((k) => ({ key: k, selector: "#" + k })), ended, trap });
const ids = (r) => r.findings.map((f) => f.id);
const same = (r, ...expected) => JSON.stringify(ids(r)) === JSON.stringify(expected.sort());

check("the exact reverse gives no findings", same(compareWalks(walk(["a", "b", "c"]), walk(["c", "b", "a"]))));
check("a single stop in both walks gives no findings", same(compareWalks(walk(["a"]), walk(["a"]))));
check("an empty page in both walks gives no findings", same(compareWalks(walk([]), walk([]))));
check("a control Shift+Tab never reached is reported", same(compareWalks(walk(["a", "b", "c"]), walk(["c", "a"])), "shift-tab-unreached@#b"));
check("a control only Shift+Tab reached is reported", same(compareWalks(walk(["a", "c"]), walk(["c", "b", "a"])), "reached-only-by-shift-tab@#b"));
check("a backward order that is not the reverse is reported once, at the first departure", (() => { const r = compareWalks(walk(["a", "b", "c", "d"]), walk(["d", "b", "c", "a"])); return same(r, "shift-tab-order-differs@#b") && r.findings[0].position === 2 && r.findings[0].expected === "#c" && r.findings[0].got === "#b"; })());
check("the same order going both ways (not reversed) is an order difference", same(compareWalks(walk(["a", "b", "c"]), walk(["a", "b", "c"])), "shift-tab-order-differs@#a"));
check("order is judged only on the controls both walks reached", same(compareWalks(walk(["a", "b", "c", "d"]), walk(["d", "c", "a"])), "shift-tab-unreached@#b"));
check("a radio group is one stop: Tab lands on the first member, Shift+Tab on the last", (() => {
  const f = { stops: [{ key: "a", selector: "#a" }, { key: "radio:-:size", selector: "#small" }, { key: "z", selector: "#z" }], ended: "complete", trap: null };
  const b = { stops: [{ key: "z", selector: "#z" }, { key: "radio:-:size", selector: "#large" }, { key: "a", selector: "#a" }], ended: "complete", trap: null };
  return same(compareWalks(f, b));
})());
check("a stop that appears twice in a walk counts once", same(compareWalks(walk(["a", "b", "a"]), walk(["b", "a"]))));
check("a Shift+Tab trap on a page where Tab has none is a candidate", (() => { const r = compareWalks(walk(["a", "b"]), walk(["b"], "cycle", { kind: "cycle", selector: "#b" })); return ids(r).includes("shift-tab-trap-candidate@#b") && r.findings.find((f) => f.check === "shift-tab-trap-candidate").kind === "cycle"; })());
check("a trap that Tab also has is not reported again as a Shift+Tab trap", !ids(compareWalks(walk(["a"], "stuck", { kind: "stuck", selector: "#a" }), walk(["a"], "stuck", { kind: "stuck", selector: "#a" }))).some((i) => i.startsWith("shift-tab-trap")));
check("a walk that did not finish is not compared for order or reach", (() => { const r = compareWalks(walk(["a", "b", "c"], "stop-cap"), walk(["c", "a"])); return r.comparable === false && ids(r).length === 0; })());
check("a backward walk that did not finish is not compared either", (() => { const r = compareWalks(walk(["a", "b"]), walk(["b"], "time-cap")); return r.comparable === false && ids(r).length === 0; })());
check("a modal's loop going backward is expected: no trap finding, and no comparison", (() => { const r = compareWalks(walk(["a", "b"]), walk(["b", "a"], "modal-cycle")); return ids(r).length === 0 && r.comparable === false; })());
check("findings are sorted by id and flagged as candidates", (() => { const r = compareWalks(walk(["a", "b", "c"]), walk(["c"])); return ids(r).join() === ["shift-tab-unreached@#a", "shift-tab-unreached@#b"].join() && r.findings.every((f) => f.class === "candidate"); })());
check("criteria: unreached is 2.1.1, order and reached-only are 2.4.3, a trap is 2.1.2", (() => { const u = compareWalks(walk(["a", "b"]), walk(["a"])).findings[0]; const o = compareWalks(walk(["a", "b"]), walk(["a", "b"])).findings[0]; const t = compareWalks(walk(["a"]), walk(["a"], "stuck", { kind: "stuck", selector: "#a" })).findings[0]; return u.criterion === "2.1.1" && o.criterion === "2.4.3" && t.criterion === "2.1.2"; })());

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
