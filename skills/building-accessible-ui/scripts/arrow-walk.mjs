#!/usr/bin/env node
// Presses the arrow keys in each composite widget on a page, in a real browser, and checks that focus (or the
// aria-activedescendant) moves to the neighbouring item and stays inside the widget. It reports candidates for
// a reviewer to confirm. It is evidence, not a verdict.
//
// Widgets are found by role: tablist, toolbar, menubar, menu, listbox, tree, radiogroup, grid, treegrid.
// Native controls (a <select>, a group of <input type=radio>) answer the arrow keys themselves and are not the
// point; a radio group built from divs is. Only widgets that are on screen are tried: a menu that opens on a
// click has to be opened first.
//
// Checks (each finding has an id like "arrow-nav-no-move@#tabs"):
//   composite-not-focusable  2.1.1   its items can't take focus and it has no aria-activedescendant
//   arrow-nav-no-move        2.1.1   the key that should move to the next or previous item moved nothing
//   arrow-nav-leaves-widget  2.4.3   the key moved focus out of the widget
//   arrow-nav-wrong-order    2.4.3   focus moved inside the widget, but not to the neighbouring item
// Keys follow the widget's role and aria-orientation (see _arrow.mjs). It does not check Home and End,
// type-ahead, wrapping, selection, or what is announced. Those stay manual. A widget in a right-to-left
// context is skipped, since the keys swap.
//
// How it enters a widget: the item with tabindex 0, else the selected or checked one, else the first. A widget
// that uses aria-activedescendant is entered by focusing the widget itself.
//
// Usage: node arrow-walk.mjs <url or html file> [--json] [--max-widgets 30] [--max-ms 20000]
//        [--load-timeout 15000] [--wait 300]
//   stopReason: complete, widget-cap (only the first --max-widgets were tried), time-cap or load-timeout.
//   Same-origin frames and open shadow roots are covered. PW_CHANNEL=msedge (or chrome) uses an installed browser.

import { launch, toUrl } from "./_browser.mjs";
import { judgeWidget, keysFor } from "./_arrow.mjs";
import { makeSelector } from "./_tab-walk.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const VALUE_FLAGS = ["--max-widgets", "--max-ms", "--load-timeout", "--wait"];
const target = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node arrow-walk.mjs <url or html file> [--json] [--max-widgets 30] [--max-ms 20000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const maxWidgets = Number(opt("--max-widgets", 30));
const maxMs = Number(opt("--max-ms", 20000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));

// ---- runs in the page --------------------------------------------------------------------------------
const WIDGET_ROLES = ["tablist", "toolbar", "menubar", "menu", "listbox", "tree", "radiogroup", "grid", "treegrid"];
const ITEM_ROLES = { tablist: ["tab"], radiogroup: ["radio"], menubar: ["menuitem", "menuitemcheckbox", "menuitemradio"], menu: ["menuitem", "menuitemcheckbox", "menuitemradio"], listbox: ["option"], tree: ["treeitem"], grid: ["gridcell"], treegrid: ["gridcell"] };

// Lists the widgets on the page and remembers them, so later calls can name one by index.
function listWidgets(makeSelector, widgetRoles) {
  const selector = makeSelector();
  const reg = (window.__aw = { widgets: [] });
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const found = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll(widgetRoles.map((r) => `[role="${r}"]`).join(","))) {
      if (!visible(el) || el.closest("[inert]") || el.closest('[aria-hidden="true"]')) continue;
      found.push(el);
    }
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  reg.widgets = found;
  return found.map((el) => ({ selector: selector(el), role: el.getAttribute("role"), orientation: el.getAttribute("aria-orientation"), rtl: el.ownerDocument.defaultView.getComputedStyle(el).direction === "rtl" }));
}

// Describes one widget: its items, and how a keyboard user gets in.
function describeWidget(makeSelector, index, itemRoles) {
  const w = window.__aw.widgets[index];
  const role = w.getAttribute("role");
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const focusable = (el) => el.hasAttribute("tabindex") || /^(button|a|input|select|textarea|summary)$/.test(el.localName) && !el.disabled && (el.localName !== "a" || el.hasAttribute("href"));
  const roles = itemRoles[role];
  const all = roles
    ? [...w.querySelectorAll(roles.map((r) => `[role="${r}"]`).join(",")), ...(role === "radiogroup" ? w.querySelectorAll('input[type="radio"]') : [])]
    : [...w.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]')];
  const items = all.filter((el) => visible(el) && !el.disabled && !el.closest('[aria-hidden="true"]')).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  window.__aw.items = items;
  const usingAD = w.hasAttribute("aria-activedescendant");
  const anyFocusable = items.some(focusable);
  const mode = usingAD && focusable(w) ? "activedescendant" : anyFocusable ? "roving" : "none";
  let entry = items.findIndex((el) => el.getAttribute("tabindex") === "0");
  if (entry < 0) entry = items.findIndex((el) => el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true" || el.checked);
  if (entry < 0) entry = items.findIndex(focusable);
  return { items: items.length, mode, entry: Math.max(entry, 0) };
}

function focusEntry(makeSelector, index, mode, entry) {
  const w = window.__aw.widgets[index];
  const el = mode === "activedescendant" ? w : window.__aw.items[entry];
  el.focus({ preventScroll: true });
  return true;
}

// Where focus is now, in terms of the widget's items.
function readState(makeSelector, index, mode) {
  const w = window.__aw.widgets[index];
  const items = window.__aw.items;
  let el = w.ownerDocument.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  const inside = !!el && (el === w || w.contains(el));
  const activeIndex = items.indexOf(el);
  const adId = w.getAttribute("aria-activedescendant");
  const adEl = adId ? w.getRootNode().getElementById(adId) : null;
  const ad = adEl ? items.indexOf(adEl) : -1;
  return { inside, activeIndex, ad };
}

const inPage = (fn, ...args) => `(${fn.toString()})(${makeSelector.toString()}${args.map((a) => ", " + JSON.stringify(a)).join("")})`;

const browser = await launch();
const findings = [];
const widgets = [];
let stopReason = "complete";
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
  catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) stopReason = "load-timeout"; else throw e; }
  await page.waitForTimeout(settleMs);
  await page.bringToFront();

  const listed = await page.evaluate(inPage(listWidgets, WIDGET_ROLES));
  const started = Date.now();
  let cap = false;
  for (const [index, info] of listed.entries()) {
    if (index >= maxWidgets) { cap = true; break; }
    if (Date.now() - started > maxMs) { stopReason = stopReason === "complete" ? "time-cap" : stopReason; break; }
    if (info.rtl) { widgets.push({ selector: info.selector, role: info.role, verdict: "skipped-rtl" }); continue; }
    const d = await page.evaluate(inPage(describeWidget, index, ITEM_ROLES));
    const keys = keysFor(info.role, info.orientation);
    const trials = [];
    if (d.items >= 2 && d.mode !== "none") {
      const read = async () => page.evaluate(inPage(readState, index, d.mode));
      const startAt = async () => { await page.evaluate(inPage(focusEntry, index, d.mode, d.entry)); return read(); };
      const position = (s) => (d.mode === "roving" ? s.activeIndex : s.ad);
      const tryDir = async (dir) => {
        const first = await read();
        const from = position(first) >= 0 ? position(first) : null;
        for (const [i, key] of keys[dir].entries()) {
          if (i > 0) { const s = await startAt(); if (position(s) !== (from ?? -1)) break; }
          await page.keyboard.press(key);
          await page.waitForTimeout(40);
          const after = await read();
          const left = !after.inside;
          const pos = left ? -1 : position(after);
          const moved = left || pos !== (from ?? -1);
          const last = i === keys[dir].length - 1;
          if (moved || last) { trials.push({ dir, key, from, to: left || pos < 0 ? null : pos, moved, left }); return { moved, left, from }; }
        }
        return { moved: false, left: false, from: null };
      };
      const atEnd = d.entry >= d.items - 1;
      await startAt();
      const order = atEnd ? ["prev", "next"] : ["next", "prev"];
      const a = await tryDir(order[0]);
      // Going back is only a fair test when we know where we started: from an unknown start (a listbox with
      // nothing active yet) the first key may land on the first item, and the way back has nowhere to go.
      if (a.moved && !a.left && a.from !== null) await tryDir(order[1]);
    }
    const judged = judgeWidget({ role: info.role, selector: info.selector, items: d.items, mode: d.mode, trials });
    findings.push(...judged.findings);
    widgets.push({ selector: info.selector, role: info.role, mode: d.mode, items: d.items, verdict: judged.verdict });
  }
  if (cap && stopReason === "complete") stopReason = "widget-cap";
} finally {
  await browser.close();
}

const seen = new Set();
const unique = findings.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).sort((a, b) => a.id.localeCompare(b.id));
const result = { findings: unique, stopReason, widgets, stats: { widgets: widgets.length }, note: "Candidates, not verdicts: confirm each with the keyboard before reporting it." };
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  for (const w of widgets) console.log(`${w.verdict.padEnd(16)} ${w.role.padEnd(11)} ${w.selector}${w.items ? `   ${w.items} items, ${w.mode}` : ""}`);
  for (const f of unique) console.log(`candidate  ${f.criterion.padEnd(6)} ${f.id}`);
  console.log(`\n${unique.length} candidate(s). stopReason: ${stopReason}. ${widgets.length} widget(s).`);
}
