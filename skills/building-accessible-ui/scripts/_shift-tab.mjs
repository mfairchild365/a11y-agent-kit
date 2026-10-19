// Pure logic for shift-tab-walk.mjs: compares the walk that pressed Tab with the walk that pressed Shift+Tab.
// No browser, no page: the script hands in the two lists of stops, and every decision is made here so it can
// be tested on its own.
//
// A walk is { stops: [{ key, selector }], ended, trap }:
//   key       identifies the stop across the two walks: the selector, or one shared key for all the members of a
//             radio group (Tab lands on the first member and Shift+Tab on the last)
//   ended     why the walk stopped: "complete", "cycle", "modal-cycle", "stuck", "stop-cap", "time-cap"
//   trap      { kind, selector } when a possible trap ended it
//
// What it reports, as ids "<check>@<selector>":
//   shift-tab-unreached      2.1.1   Tab reached the control, Shift+Tab never did
//   reached-only-by-shift-tab 2.4.3  Shift+Tab reached the control, Tab never did
//   shift-tab-order-differs  2.4.3   going backward does not retrace the forward order; reported once, at the
//                                    first stop where it departs from the exact reverse
//   shift-tab-trap-candidate 2.1.2   Shift+Tab cycled or stuck on a page where Tab did not
// Order and reach are only compared when both walks ran to the end: a walk that stopped early did not see the
// whole page, so it says nothing about what was missed.

const dedupe = (stops) => {
  const seen = new Set();
  return stops.filter((s) => (seen.has(s.key) ? false : seen.add(s.key)));
};

export function compareWalks(forward, backward) {
  const findings = [];
  const add = (check, criterion, selector, extra = {}) => findings.push({ id: `${check}@${selector}`, check, criterion, class: "candidate", element: selector, ...extra });

  if (backward.trap && !forward.trap) {
    add("shift-tab-trap-candidate", "2.1.2", backward.trap.selector, { kind: backward.trap.kind, note: "Shift+Tab was caught here but Tab was not. Confirm focus can leave going backward." });
  }

  const comparable = forward.ended === "complete" && backward.ended === "complete";
  if (!comparable) return { findings: findings.sort((a, b) => a.id.localeCompare(b.id)), comparable };

  const fwd = dedupe(forward.stops), bwd = dedupe(backward.stops);
  const inBwd = new Set(bwd.map((s) => s.key)), inFwd = new Set(fwd.map((s) => s.key));
  for (const s of fwd) if (!inBwd.has(s.key)) add("shift-tab-unreached", "2.1.1", s.selector, { note: "Tab reached it; Shift+Tab never did. Confirm with the keyboard." });
  for (const s of bwd) if (!inFwd.has(s.key)) add("reached-only-by-shift-tab", "2.4.3", s.selector, { note: "Shift+Tab reached it; Tab never did." });

  const expected = fwd.filter((s) => inBwd.has(s.key)).reverse();
  const got = bwd.filter((s) => inFwd.has(s.key));
  for (let i = 0; i < Math.min(expected.length, got.length); i++) {
    if (expected[i].key !== got[i].key) {
      add("shift-tab-order-differs", "2.4.3", got[i].selector, { position: i + 1, expected: expected[i].selector, got: got[i].selector, note: "Going backward should retrace the forward order. Confirm both orders with the keyboard." });
      break;
    }
  }
  return { findings: findings.sort((a, b) => a.id.localeCompare(b.id)), comparable };
}
