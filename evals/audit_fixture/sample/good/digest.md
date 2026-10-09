**Fix first**
1. Make the initials bubbles keyboard-reachable and named (#1)
2. Fix the "+5" hover and open contrast (#3)
3. Darken the filter input's border to 3:1 (#4)

Critical 5 · Moderate 5 · Minor 0 · Best practice 2 · Needs verification 1
Checks: axe, keyboard, hover, 320px reflow and contrast run. No screen reader.

#1 · Critical · 2.1.1 · Tooltip bubbles (3) — can't be reached by keyboard → make them focusable, named buttons
#3 · Critical · 1.4.3 · "+5" button — hover and open state is 3.83:1 → use a darker fill or text
#4 · Critical · 1.4.11 · Filter input — its only visual cue is a 1.7:1 border → darken the border to 3:1 or more
#6 · Critical · 1.4.11 · Snackbar warning icon — 2.66:1 against the snackbar → use a color of at least 3:1
#5 · Critical · 4.1.2 · Close button — no accessible name → add aria-label="Close"
#2 · Moderate · 1.4.13 · Tooltip bubbles (3) — tooltip can't be dismissed and vanishes when hovered → keep open on hover, close on Escape
#9 · Moderate · 1.4.10 · Dropdown — overflows at 320px → max-width: 100% and let names wrap
#10 · Moderate · 2.5.3 · "JD" button — name "John Doe" lacks the visible "JD" → aria-label="JD, John Doe"
#7 · Moderate · 2.2.1 · Snackbar after "Archive Priya" — Undo disappears after 5 seconds → don't auto-dismiss actionable messages, and let users re-open them
#8 · Moderate · 1.1.1 · Snackbar warning icon — hidden, and the text doesn't say it is a warning → add a text alternative or state the type
#11 · Best practice · Initials bubbles — no reduced-motion block for the hover scale → add a prefers-reduced-motion rule
#12 · Best practice · Export list button — its 1.7:1 border isn't required (the text identifies it) → optionally darken it
#13 · Needs verification · 4.1.3 · "Add student" announcer — message removed after about 110ms (probe: transient) → test with NVDA and VoiceOver

Full report: evals/audit_fixture/sample/good/report.html
Open it: shown in the app (sample: no real file was opened)
