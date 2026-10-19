#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_overlay.mjs, the pure logic behind escape-return.mjs: how a
// trigger, an Escape and the focus afterward are judged. No browser needed.
// Usage: node evals/test_overlay.mjs   (exits 1 if any case behaves differently than expected)

import { judgeOverlay } from "../skills/building-accessible-ui/scripts/_overlay.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const base = (o = {}) => ({ trigger: "#open", opened: true, modal: false, focusInside: true, tabEscaped: null, closed: true, focusAfter: "trigger", focusAfterSelector: null, otherWayToClose: false, ...o });
const ids = (o) => judgeOverlay(base(o)).findings.map((f) => f.id);
const one = (o) => judgeOverlay(base(o)).findings[0];

check("an overlay that opens, closes on Escape and returns focus is ok", judgeOverlay(base()).verdict === "ok" && ids().length === 0);
check("a modal that takes focus, holds it, closes on Escape and returns focus is ok", ids({ modal: true }).length === 0);
check("a trigger that opened nothing is not judged, whatever else is reported", (() => { const r = judgeOverlay(base({ opened: false, closed: false, focusAfter: "body" })); return r.verdict === "not-opened" && r.findings.length === 0; })());
check("a modal that opened without moving focus into it is reported", ids({ modal: true, focusInside: false }).join() === "focus-not-moved-into-dialog@#open");
check("a menu or popup need not take focus on open: not reported when it isn't a modal", ids({ modal: false, focusInside: false }).length === 0);
check("Tab moving focus from a modal to the page behind is reported, with the control it reached", (() => { const f = one({ modal: true, tabEscaped: { selector: "#behind" } }); return f.id === "modal-focus-escapes@#open" && f.reachedSelector === "#behind"; })());
check("Tab leaving a non-modal popup is fine", ids({ modal: false, tabEscaped: { selector: "#behind" } }).length === 0);
check("Escape that leaves it open and no Close control is a 2.1.2 candidate", (() => { const f = one({ closed: false }); return f.id === "escape-does-not-close@#open" && f.criterion === "2.1.2" && f.class === "candidate"; })());
check("Escape that leaves it open with a Close control is only a best practice", (() => { const f = one({ closed: false, otherWayToClose: true }); return f.criterion === "best practice" && f.class === "best-practice-candidate"; })());
check("when Escape does not close it, focus return is not judged", ids({ closed: false, focusAfter: "body" }).join() === "escape-does-not-close@#open");
check("focus left on the body after closing is reported as lost", (() => { const f = one({ focusAfter: "body" }); return f.id === "focus-not-returned@#open" && f.focusAfter === "body" && /lost/.test(f.note); })());
check("focus sent to some other control after closing is reported, with that control", (() => { const f = one({ focusAfter: "other", focusAfterSelector: "#elsewhere" }); return f.id === "focus-not-returned@#open" && f.focusAfterSelector === "#elsewhere" && !/lost/.test(f.note); })());
check("several problems are all reported", ids({ modal: true, focusInside: false, tabEscaped: { selector: "#b" }, focusAfter: "body" }).sort().join() === ["focus-not-moved-into-dialog@#open", "focus-not-returned@#open", "modal-focus-escapes@#open"].join());
check("the verdict names the first problem", judgeOverlay(base({ modal: true, focusInside: false, focusAfter: "body" })).verdict === "focus-not-moved-into-dialog");
check("every finding is a candidate; criteria are 2.4.3 except the Escape one", (() => { const f = judgeOverlay(base({ modal: true, focusInside: false, tabEscaped: { selector: "#b" }, closed: false })).findings; return f.every((x) => x.class === "candidate" || x.class === "best-practice-candidate") && f.filter((x) => x.check !== "escape-does-not-close").every((x) => x.criterion === "2.4.3"); })());

console.log(`\n${failed ? `${failed} case(s) failed.` : "All cases behaved as expected."}`);
process.exit(failed ? 1 : 0);
