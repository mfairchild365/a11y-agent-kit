#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_arrow.mjs, the pure logic behind arrow-walk.mjs: which keys each
// widget role expects and how the trials are judged. No browser needed.
// Usage: node evals/test_arrow.mjs   (exits 1 if any case behaves differently than expected)

import { judgeWidget, keysFor, ROLES } from "../skills/building-accessible-ui/scripts/_arrow.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const keys = (r, o) => JSON.stringify(keysFor(r, o));
const widget = (o = {}) => ({ role: "tablist", selector: "#w", items: 3, mode: "roving", trials: [], ...o });
const trial = (o = {}) => ({ dir: "next", key: "ArrowRight", from: 0, to: 1, moved: true, left: false, ...o });
const verdict = (w) => judgeWidget(w).verdict;

// ---- keys
check("a tab list answers Right and Left by default", keys("tablist") === JSON.stringify({ axis: "horizontal", next: ["ArrowRight"], prev: ["ArrowLeft"] }));
check("a tab list with aria-orientation vertical answers Down and Up", keysFor("tablist", "vertical").next[0] === "ArrowDown" && keysFor("tablist", "vertical").prev[0] === "ArrowUp");
check("a menu, listbox and tree answer Down and Up by default", ["menu", "listbox", "tree"].every((r) => keysFor(r).next[0] === "ArrowDown"));
check("a menu bar and a toolbar answer Right and Left by default", ["menubar", "toolbar"].every((r) => keysFor(r).next[0] === "ArrowRight"));
check("a horizontal listbox answers Right and Left", keysFor("listbox", "horizontal").next[0] === "ArrowRight");
check("a vertical toolbar answers Down and Up", keysFor("toolbar", "vertical").next[0] === "ArrowDown");
check("a radio group and a grid answer both axes, so either key of a pair counts", keysFor("radiogroup").next.join() === "ArrowRight,ArrowDown" && keysFor("grid").prev.join() === "ArrowLeft,ArrowUp");
check("aria-orientation is ignored by a radio group and a grid", keysFor("radiogroup", "vertical").axis === "both" && keysFor("grid", "horizontal").axis === "both");
check("an unknown orientation falls back to the role's default", keysFor("tablist", "diagonal").axis === "horizontal");
check("an unknown role has no keys", keysFor("button") === null);
check("every role in the table has keys for next and previous", Object.keys(ROLES).every((r) => keysFor(r).next.length && keysFor(r).prev.length));

// ---- judging
check("a widget whose keys move focus to the neighbour is ok", verdict(widget({ trials: [trial(), trial({ dir: "prev", key: "ArrowLeft", from: 1, to: 0 })] })) === "ok");
check("with no trials there is nothing to fault", verdict(widget({ trials: [] })) === "ok");
check("a key that moves nothing is arrow-nav-no-move, with the key named", (() => { const r = judgeWidget(widget({ trials: [trial({ moved: false, to: 0 })] })); return r.verdict === "no-move" && r.findings[0].id === "arrow-nav-no-move@#w" && r.findings[0].key === "ArrowRight"; })());
check("a key that moves focus out of the widget is arrow-nav-leaves-widget", (() => { const r = judgeWidget(widget({ trials: [trial({ left: true, to: null })] })); return r.verdict === "leaves" && r.findings[0].id === "arrow-nav-leaves-widget@#w"; })());
check("leaving is judged before 'did not move'", verdict(widget({ trials: [trial({ left: true, moved: true })] })) === "leaves");
check("focus that lands two items away is arrow-nav-wrong-order, with expected and got", (() => { const r = judgeWidget(widget({ trials: [trial({ to: 2 })] })); return r.verdict === "wrong-order" && r.findings[0].expected === 1 && r.findings[0].to === 2; })());
check("going backward is judged against the previous item", verdict(widget({ trials: [trial({ dir: "prev", key: "ArrowLeft", from: 2, to: 1 })] })) === "ok" && verdict(widget({ trials: [trial({ dir: "prev", key: "ArrowLeft", from: 2, to: 0 })] })) === "wrong-order");
check("a grid only has to move: it is not judged on which neighbour", verdict(widget({ role: "grid", trials: [trial({ to: 4 })] })) === "ok" && verdict(widget({ role: "grid", trials: [trial({ moved: false })] })) === "no-move");
check("an activedescendant widget is judged the same way", verdict(widget({ mode: "activedescendant", trials: [trial({ moved: false })] })) === "no-move");
check("a widget with nothing active to start with is not judged on which item the first key lands on", verdict(widget({ mode: "activedescendant", trials: [trial({ from: null, to: 1 })] })) === "ok" && verdict(widget({ mode: "activedescendant", trials: [trial({ from: null, moved: false, to: null })] })) === "no-move");
check("an unknown destination (to is null) that did move is not called wrong-order", verdict(widget({ trials: [trial({ to: null })] })) === "ok");
check("items that can't take focus, with no activedescendant, are composite-not-focusable", (() => { const r = judgeWidget(widget({ mode: "none" })); return r.verdict === "not-focusable" && r.findings[0].id === "composite-not-focusable@#w" && r.findings[0].criterion === "2.1.1"; })());
check("a widget with fewer than two items is not judged", verdict(widget({ items: 1, mode: "none" })) === "too-few-items" && verdict(widget({ items: 0 })) === "too-few-items");
check("an unknown role is not judged", verdict(widget({ role: "button" })) === "unknown-role");
check("the first failing trial is the one reported", (() => { const r = judgeWidget(widget({ trials: [trial(), trial({ dir: "prev", key: "ArrowLeft", from: 1, moved: false, to: 1 }), trial({ left: true })] })); return r.verdict === "no-move" && r.findings.length === 1; })());
check("criteria: reach and movement are 2.1.1, leaving and order are 2.4.3, and every finding is a candidate", (() => {
  const f = [widget({ mode: "none" }), widget({ trials: [trial({ moved: false })] }), widget({ trials: [trial({ left: true })] }), widget({ trials: [trial({ to: 2 })] })].map((w) => judgeWidget(w).findings[0]);
  return f.map((x) => x.criterion).join() === "2.1.1,2.1.1,2.4.3,2.4.3" && f.every((x) => x.class === "candidate");
})());

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
