// Shared by keyboard-walk.mjs and focus-contrast.mjs: presses Tab through a page in a real browser, one
// press at a time, and says where focus landed and why the walk stopped.
//
// It never loops without a bound. walkTab() stops, and returns why:
//   complete      focus wrapped to the first stop, or left the page and stayed out for two presses
//   cycle         a control was visited twice before the walk wrapped (a possible keyboard trap)
//   modal-cycle   the same, inside a modal dialog: expected
//   stuck         Tab did not move focus twice in a row, with a script cancelling the key
//   stop-cap      maxStops presses reached        time-cap   maxMs elapsed

// ---- runs in the page --------------------------------------------------------------------------------
export function makeSelector() {
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const selector = (n) => {
    const parts = [];
    while (n && n.nodeType === 1) {
      const root = n.getRootNode();
      if (n.id && root.querySelectorAll && root.querySelectorAll("#" + esc(n.id)).length === 1) {
        parts.unshift("#" + esc(n.id));
        if (root.host) return selector(root.host) + " >>> " + parts.join(" > ");
        break;
      }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.localName === n.localName) : [n];
      parts.unshift(n.localName + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ""));
      if (!n.parentElement && n.parentNode && n.parentNode.host) return selector(n.parentNode.host) + " >>> " + parts.join(" > ");
      n = n.parentElement;
    }
    const win = n ? n.ownerDocument.defaultView : null;
    const joined = parts.join(" > ");
    return win && win.frameElement ? selector(win.frameElement) + " >>> " + joined : joined;
  };
  return selector;
}

export function describeActive(makeSelector) {
  const reg = window.__kw || (Object.defineProperty(window, "__kw", { value: { map: new WeakMap(), n: 0, active: null } }), window.__kw);
  let el = document.activeElement;
  for (;;) {
    if (!el) break;
    if (el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue; }
    if (/^i?frame$/.test(el.localName)) {
      try { const d = el.contentDocument; if (d && d.activeElement && d.activeElement !== d.body) { el = d.activeElement; continue; } } catch { /* cross-origin: one stop */ }
    }
    break;
  }
  const tabEvent = window.__kwTab;
  window.__kwTab = null;
  const prevented = !!(tabEvent && tabEvent.defaultPrevented);
  if (!el || el === document.body || el === document.documentElement) return { none: true, prevented };
  if (!reg.map.has(el)) reg.map.set(el, ++reg.n);
  reg.active = el;
  const selector = makeSelector();
  // Tab and Shift+Tab pick different members of an unchecked radio group (the first, then the last), so the
  // members of a group share a key.
  const group = el.localName === "input" && el.type === "radio" && el.name ? `radio:${el.form ? [...document.forms].indexOf(el.form) : "-"}:${el.name}` : null;
  return { uid: reg.map.get(el), selector: selector(el), group, prevented, inModal: !!el.closest('dialog:modal, [aria-modal="true"]') };
}

// ---- runs in node ------------------------------------------------------------------------------------
// The page functions are sent as source, and makeSelector is passed to each so they share it.
export const inPage = (fn, ...extra) => `(${fn.toString()})(${makeSelector.toString()}${extra.map((e) => ", " + JSON.stringify(e)).join("")})`;

// Remember the last Tab keydown (capture phase, so a page that stops propagation is still seen). Whether a
// script cancelled it is read after the press, when the event has finished dispatching.
export async function installTabCapture(page) {
  await page.addInitScript(() => {
    window.addEventListener("keydown", (e) => { if (e.key === "Tab") { try { window.top.__kwTab = e; } catch { /* cross-origin */ } } }, true);
  });
}

// Presses Tab (or Shift+Tab with backward: true) until the walk ends. onStop(info) runs once for each newly visited control, while it still has
// focus. Returns { ended, trap }, where trap is { kind: "stuck" | "cycle", info } when a possible trap ended it.
export async function walkTab(page, { maxStops, maxMs, onStop, backward = false }) {
  const key = backward ? "Shift+Tab" : "Tab";
  const started = Date.now();
  const seen = new Set();
  let first = null, prev = null, stillCount = 0, noneStreak = 0;
  for (let press = 1; ; press++) {
    if (press > maxStops) return { ended: "stop-cap", trap: null };
    if (Date.now() - started > maxMs) return { ended: "time-cap", trap: null };
    await page.keyboard.press(key);
    const info = await page.evaluate(inPage(describeActive));
    if (info.none) { if (++noneStreak >= 2) return { ended: "complete", trap: null }; continue; }
    noneStreak = 0;
    // Focus on the same control as the last press. With a single tab stop the browser wraps back to it, so
    // that alone is not a trap. It is one when a script cancelled the Tab key (info.prevented) twice running.
    if (prev !== null && info.uid === prev) {
      if (!info.prevented && info.uid === first) return { ended: "complete", trap: null };
      if (++stillCount >= 2) return { ended: "stuck", trap: { kind: "stuck", info } };
      continue;
    }
    stillCount = 0;
    if (first === null) first = info.uid;
    else if (info.uid === first) return { ended: "complete", trap: null };
    prev = info.uid;
    if (seen.has(info.uid)) {
      if (info.inModal) return { ended: "modal-cycle", trap: null };
      return { ended: "cycle", trap: { kind: "cycle", info } };
    }
    seen.add(info.uid);
    await onStop(info);
  }
}
