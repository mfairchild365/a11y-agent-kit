**Fix first**
1. Make the initials bubbles keyboard-reachable and named (#1)
2. Fix the "+5" hover and open contrast (#3)
3. Name the close button (#4)

Critical 3 · Moderate 3 · Minor 1 · Best practice 1 · Needs verification 1
Checks: axe, keyboard, hover, 320px reflow and contrast run. No screen reader.

#1 · Critical · 2.1.1 · Tooltip bubbles (3) — can't be reached by keyboard → make them focusable, named buttons
#3 · Critical · 1.4.3 · "+5" button — hover and open state is 3.83:1 → use a darker fill or text
#4 · Critical · 4.1.2 · Close button — no accessible name → add aria-label="Close"
#2 · Moderate · 1.4.13 · Tooltip bubbles (3) — tooltip can't be dismissed and vanishes when hovered → keep open on hover, close on Escape
#5 · Moderate · 1.4.10 · Dropdown — overflows at 320px → max-width: 100% and let names wrap
#6 · Moderate · 2.5.3 · "JD" button — name "John Doe" lacks the visible "JD" → aria-label="JD, John Doe"
#7 · Minor · 1.3.1 · Lists (2) — list-style: none drops list semantics in Safari → add role="list"
#8 · Best practice · Initials bubbles — no reduced-motion block for the hover scale → add a prefers-reduced-motion rule
#9 · Needs verification · 4.1.3 · Status message — live region may announce twice → test with NVDA and VoiceOver

Full report: evals/audit_fixture/sample/good/report.html
Open it: shown in the app (sample: no real file was opened)
