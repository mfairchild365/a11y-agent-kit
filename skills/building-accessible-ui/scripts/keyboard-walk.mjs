#!/usr/bin/env node
// Presses Tab through a page in a real browser and records where focus lands. It reports candidates for a
// reviewer to confirm. It is evidence, not a verdict: it can't judge whether the order makes sense, whether
// a focus indicator is visible, or what a screen reader says.
//
// Checks (each finding has an id like "focus-no-name@#save"):
//   focus-no-name            4.1.2        a control that took focus has no accessible name
//   tabindex-positive        best practice   tabindex above 0 on a tabbable element (it reorders the page)
//   unreachable-by-tab       2.1.1        a visible, enabled, tabbable control focus never reached, though
//                                         the walk ran to the end (script-driven focus, a blur on focus, ...)
//   focus-cycle-candidate    2.1.2        focus came back to a control it had already visited before the
//                                         page ended, outside a modal dialog (a possible keyboard trap)
//   focus-stuck-candidate    2.1.2        Tab twice in a row did not move focus (a possible keyboard trap)
//
// How it stops. It never loops without a bound, and it always says why it stopped:
//   complete      focus wrapped to the first stop, or left the page and stayed out for two presses
//   cycle         a control was visited twice before the walk wrapped (see focus-cycle-candidate)
//   modal-cycle   the same, inside a modal dialog: expected, no finding
//   stuck         Tab did not move focus twice in a row
//   stop-cap      --max-stops presses reached        time-cap   --max-ms elapsed
//   load-timeout  the page did not finish loading in time; what had loaded was walked
// A walk that did not end as "complete" never reports unreachable-by-tab, since it didn't see the whole page.
//
// Usage: node keyboard-walk.mjs <url or html file> [--json] [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--wait 300]
//   Same-origin frames and open shadow roots are walked. Cross-origin frames are treated as one stop.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.

import { launch, toUrl } from "./_browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const target = argv.find((a, i) => !a.startsWith("--") && !["--max-stops", "--max-ms", "--load-timeout", "--wait"].includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node keyboard-walk.mjs <url or html file> [--json] [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const maxStops = Number(opt("--max-stops", 200));
const maxMs = Number(opt("--max-ms", 20000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));
const NAMED_ROLES = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "slider", "spinbutton", "treeitem"]);

// ---- runs in the page --------------------------------------------------------------------------------
function makeSelector() {
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

function describeActive(makeSelector) {
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
  return { uid: reg.map.get(el), selector: selector(el), prevented, inModal: !!el.closest('dialog:modal, [aria-modal="true"]') };
}

function scanPage(makeSelector) {
  const reg = window.__kw || { map: new WeakMap() };
  const selector = makeSelector();
  const CANDIDATES = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
  const out = { positive: [], unreached: [] };
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const tabbable = (el) => {
    const t = el.getAttribute("tabindex");
    if (t !== null && Number(t) < 0) return false;
    if (el.matches(":disabled") || el.closest("[inert]") || !visible(el)) return false;
    if (el.localName === "summary" && !(el.parentElement && el.parentElement.localName === "details" && el.parentElement.querySelector(":scope > summary") === el)) return false;
    return true;
  };
  const radioGroupVisited = (el) => {
    if (!(el.localName === "input" && el.type === "radio" && el.name)) return false;
    const scope = el.form || el.getRootNode();
    return [...scope.querySelectorAll("input[type=radio]")].some((r) => r.name === el.name && reg.map.has(r));
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll(CANDIDATES)) {
      if (!tabbable(el)) continue;
      const t = el.getAttribute("tabindex");
      if (t !== null && Number(t) > 0) out.positive.push(selector(el));
      if (!reg.map.has(el) && !radioGroupVisited(el)) out.unreached.push(selector(el));
    }
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  return out;
}

const browser = await launch();
const findings = [];
const add = (check, criterion, cls, key, extra = {}) => findings.push({ id: `${check}@${key}`, check, criterion, class: cls, ...extra });
const stops = [];
let stopReason = "complete";
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The page functions are sent as source, and makeSelector is passed to each so they share it.
  const inPage = (fn) => `(${fn.toString()})(${makeSelector.toString()})`;
  // Remember the last Tab keydown (capture phase, so a page that stops propagation is still seen). Whether a
  // script cancelled it is read after the press, when the event has finished dispatching.
  await page.addInitScript(() => {
    window.addEventListener("keydown", (e) => { if (e.key === "Tab") { try { window.top.__kwTab = e; } catch { /* cross-origin */ } } }, true);
  });
  try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
  catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) stopReason = "load-timeout"; else throw e; }
  await page.waitForTimeout(settleMs);
  await page.bringToFront();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Accessibility.enable");

  const axOfActive = async () => {
    try {
      const { result } = await cdp.send("Runtime.evaluate", { expression: "window.__kw && window.__kw.active" });
      if (!result.objectId) return {};
      const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { objectId: result.objectId, fetchRelatives: false });
      const n = nodes[0] || {};
      return { role: n.role && n.role.value, name: ((n.name && n.name.value) || "").trim() };
    } catch { return {}; }
  };

  const started = Date.now();
  const seen = new Map();
  let first = null, prev = null, stillCount = 0, noneStreak = 0, ended = null;
  for (let press = 1; ; press++) {
    if (press > maxStops) { ended = "stop-cap"; break; }
    if (Date.now() - started > maxMs) { ended = "time-cap"; break; }
    await page.keyboard.press("Tab");
    const info = await page.evaluate(inPage(describeActive));
    if (info.none) { if (++noneStreak >= 2) { ended = "complete"; break; } continue; }
    noneStreak = 0;
    // Focus on the same control as the last press. With a single tab stop the browser wraps back to it, so
    // that alone is not a trap. It is one when a script cancelled the Tab key (info.prevented) twice running.
    if (prev !== null && info.uid === prev) {
      if (!info.prevented && info.uid === first) { ended = "complete"; break; }
      if (++stillCount >= 2) { ended = "stuck"; add("focus-stuck-candidate", "2.1.2", "candidate", info.selector, { element: info.selector, note: "A script cancelled Tab and focus did not move. Confirm focus can leave." }); break; }
      continue;
    }
    stillCount = 0;
    if (first === null) first = info.uid;
    else if (info.uid === first) { ended = "complete"; break; }
    prev = info.uid;
    if (seen.has(info.uid)) {
      if (info.inModal) { ended = "modal-cycle"; break; }
      ended = "cycle";
      add("focus-cycle-candidate", "2.1.2", "candidate", info.selector, { element: info.selector, note: "If a modal dialog is open this is expected; otherwise confirm focus can leave." });
      break;
    }
    const ax = await axOfActive();
    seen.set(info.uid, true);
    stops.push({ selector: info.selector, role: ax.role || null, name: ax.name ?? null });
    if (ax.name === "" && NAMED_ROLES.has(ax.role)) add("focus-no-name", "4.1.2", "candidate", info.selector, { role: ax.role, element: info.selector });
  }
  if (stopReason === "complete") stopReason = ended || "complete"; else if (ended && ended !== "complete") stopReason = ended;

  const scanned = await page.evaluate(inPage(scanPage));
  for (const s of [...new Set(scanned.positive)]) add("tabindex-positive", "best practice", "best-practice-candidate", s, { element: s });
  if (ended === "complete") for (const s of [...new Set(scanned.unreached)]) add("unreachable-by-tab", "2.1.1", "candidate", s, { element: s, note: "Visible, enabled and tabbable, but the walk never landed on it. Confirm with the keyboard." });
} finally {
  await browser.close();
}

const seenIds = new Set();
const unique = findings.filter((f) => (seenIds.has(f.id) ? false : seenIds.add(f.id))).sort((a, b) => a.id.localeCompare(b.id));
const result = { findings: unique, stopReason, stops, stats: { stops: stops.length }, note: "Candidates, not verdicts: confirm each with the keyboard before reporting it." };
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  stops.forEach((s, i) => console.log(`${String(i + 1).padStart(3)}  ${(s.role || "?").padEnd(10)} ${JSON.stringify(s.name)}  ${s.selector}`));
  for (const f of unique) console.log(`${f.class === "candidate" ? "candidate" : "best practice"}  ${f.criterion.padEnd(13)} ${f.id}`);
  console.log(`\n${unique.length} candidate(s). stopReason: ${stopReason}. ${stops.length} stop(s).`);
}
