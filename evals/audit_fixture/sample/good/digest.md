**Fix first**
1. Make the initials bubbles keyboard-reachable and named (#1)
2. Fix the "+5" hover and open contrast (#3)
3. Darken the filter input's border to 3:1 (#4)

Critical 6 · Moderate 6 · Minor 1 · Best practice 6 · Needs verification 1
Checks: axe, keyboard, hover, 320px reflow and contrast run. No screen reader.
Triage: fix now #1 #3 #4 #5 #6 #8 #10 #11 #14 #17 #19 #20 · ticket #2 #7 #9 #12 #13 #15 #18 · investigate #16
Guards: 11 automatable, 1 manual. Ask me to fix these and add the tests.

#1 · Critical · 2.1.1 · Tooltip bubbles (3) — can't be reached by keyboard → make them focusable, named buttons
#3 · Critical · 1.4.3 · "+5" button — hover and open state is 3.83:1 → use a darker fill or text
#4 · Critical · 1.4.11 · Filter input — its only visual cue is a 1.7:1 border → darken the border to 3:1 or more
#17 · Critical · 1.4.11 · Notice links — focus ring is 2.52:1 and 2.59:1 on the info and error fills → use a ring of at least 3:1 on every fill
#6 · Critical · 1.4.11 · Snackbar warning icon — 2.66:1 against the snackbar → use a color of at least 3:1
#5 · Critical · 4.1.2 · Close button — no accessible name → add aria-label="Close"
#2 · Moderate · 1.4.13 · Tooltip bubbles (3) — tooltip can't be dismissed and vanishes when hovered → keep open on hover, close on Escape
#18 · Moderate · 1.4.1 · Info and error notices — type shown by fill color alone → add an icon or a visible type word
#9 · Moderate · 1.4.10 · Dropdown — overflows at 320px → max-width: 100% and let names wrap
#10 · Moderate · 2.5.3 · "JD" button — name "John Doe" lacks the visible "JD" → aria-label="JD, John Doe"
#7 · Moderate · 2.2.1 · Snackbar after "Archive Priya" — Undo disappears after 5 seconds → don't auto-dismiss actionable messages, and let users re-open them
#8 · Moderate · 1.1.1 · Snackbar warning icon — hidden, and the text doesn't say it is a warning → add a text alternative or state the type
#19 · Minor · 1.4.10 · Info notice link — label cut off at the left edge at 320px → let the link wrap
#11 · Best practice · Initials bubbles — no reduced-motion block for the hover scale → add a prefers-reduced-motion rule
#12 · Best practice · Export list button — its 1.7:1 border isn't required (the text identifies it) → optionally darken it
#13 · Best practice · Snackbar Undo button — inside the live region, its role isn't announced → move Undo next to the row or into a history
#14 · Best practice · More students dropdown — named section with a visible heading → remove aria-labelledby
#15 · Best practice · "Mute alerts" button — inner text change isn't announced by some screen readers → keep the text, use aria-pressed
#20 · Best practice · "Learn more" link — generic name, context is in the same container → add aria-describedby
#16 · Needs verification · 4.1.3 · "Add student" announcer — message removed after about 110ms (probe: transient) → test with NVDA and VoiceOver

Full report: evals/audit_fixture/sample/good/report.html
Open it: shown in the app (sample: no real file was opened)
