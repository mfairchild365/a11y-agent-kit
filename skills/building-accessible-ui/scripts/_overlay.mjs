// Pure logic for escape-return.mjs: how to judge what happened when a control opened a dialog, menu or popup,
// Escape was pressed, and focus was looked at. No browser, no page: the script reports what it saw and every
// decision is made here so it can be tested on its own.
//
// A trial describes one trigger:
//   trigger           selector of the control that opens the overlay
//   opened            an overlay appeared, or the trigger's aria-expanded turned true
//   modal             the overlay is dialog-like (role dialog or alertdialog, aria-modal, a modal <dialog>)
//   focusInside       after opening, focus was inside the overlay
//   tabEscaped        for a modal: null, or { selector } of the page control that took focus when Tab was pressed
//                     past the end of the overlay (focus going to the browser's own UI is not an escape)
//   closed            after Escape, the overlay is gone and aria-expanded is no longer true
//   focusAfter        where focus is after it closed: "trigger", "body" (focus was lost) or "other"
//   focusAfterSelector the selector when it is "other"
//   otherWayToClose   the overlay has a visible control named like Close, Dismiss, Cancel, Done or OK
//
// Findings, as ids "<check>@<trigger selector>":
//   focus-not-moved-into-dialog  2.4.3   a modal opened and focus stayed on the trigger or page
//   modal-focus-escapes          2.4.3   Tab moved focus from a modal to the page behind it
//   escape-does-not-close        2.1.2 or best practice
//                                        Escape left it open. WCAG asks for a keyboard way out (2.1.2), and
//                                        Escape is the usual one (APG), not the only one: with a Close control
//                                        the keyboard can still leave, so it is a best practice only
//   focus-not-returned           2.4.3   it closed, but focus did not go back to the trigger ("body" means
//                                        focus was lost, which is worse)
// A trigger that opened nothing this script can detect is not judged. Widgets that open on hover, or that need a
// pointer, are out of reach and stay manual.

export function judgeOverlay(t) {
  if (!t.opened) return { verdict: "not-opened", findings: [] };
  const findings = [];
  const add = (check, criterion, cls, extra = {}) => findings.push({ id: `${check}@${t.trigger}`, check, criterion, class: cls, element: t.trigger, ...extra });

  if (t.modal && !t.focusInside) add("focus-not-moved-into-dialog", "2.4.3", "candidate", { note: "A modal opened and focus did not move into it. Confirm with the keyboard." });
  if (t.modal && t.tabEscaped) add("modal-focus-escapes", "2.4.3", "candidate", { reachedSelector: t.tabEscaped.selector, note: "Tab moved focus from the modal to the page behind it. Confirm with the keyboard." });

  if (t.closed === false) {
    if (t.otherWayToClose) add("escape-does-not-close", "best practice", "best-practice-candidate", { note: "Escape did not close it, but a Close control is there. Escape is the usual key, not a requirement." });
    else add("escape-does-not-close", "2.1.2", "candidate", { note: "Escape did not close it and no Close control was found. Confirm the keyboard can leave." });
  }
  if (t.closed === true && t.focusAfter !== "trigger") {
    add("focus-not-returned", "2.4.3", "candidate", { focusAfter: t.focusAfter, focusAfterSelector: t.focusAfterSelector || null, note: t.focusAfter === "body" ? "Focus was lost when it closed. Confirm with the keyboard." : "Focus did not go back to the trigger when it closed. Confirm with the keyboard." });
  }
  return { verdict: findings.length ? findings[0].check : "ok", findings };
}
