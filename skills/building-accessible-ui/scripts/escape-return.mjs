#!/usr/bin/env node
// Opens each dialog, menu or popup on a page with the keyboard, presses Escape, and checks that it closes and
// that focus goes back to the control that opened it. For a modal dialog it also checks that focus moves into
// it and that Tab does not take focus out to the page behind. It reports candidates for a reviewer to confirm.
// It is evidence, not a verdict.
//
// Triggers are found by what they say about themselves: aria-haspopup (other than false), popovertarget, or an
// aria-controls that points at a dialog, alertdialog, menu or listbox. Add others with --trigger <css>
// (repeatable) when a control opens an overlay without saying so. A plain disclosure (a button that shows and
// hides a region) isn't a trigger: Escape isn't expected to close it. Overlays that open on hover or need a
// pointer can't be reached this way and stay manual.
//
// Checks (each finding has an id like "focus-not-returned@#open-menu"):
//   focus-not-moved-into-dialog  2.4.3   a modal opened and focus stayed on the trigger or the page
//   modal-focus-escapes          2.4.3   Tab moved focus from a modal to the page behind it
//   escape-does-not-close        2.1.2   Escape left it open and no Close control was found; with a Close control
//                                        it is a best practice only
//   focus-not-returned           2.4.3   it closed, but focus did not go back to the trigger (body = lost)
// Each trigger is tried on a fresh load of the page, so one that stays open can't affect the next.
//
// Usage: node escape-return.mjs <url or html file> [--json] [--trigger <css>]... [--max-triggers 12]
//        [--max-ms 40000] [--load-timeout 15000] [--wait 300]
//   stopReason: complete, trigger-cap, time-cap or load-timeout.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.

import { launch, toUrl } from "./_browser.mjs";
import { judgeOverlay } from "./_overlay.mjs";
import { makeSelector } from "./_tab-walk.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const explicit = argv.flatMap((a, i) => (a === "--trigger" ? [argv[i + 1]] : []));
const VALUE_FLAGS = ["--trigger", "--max-triggers", "--max-ms", "--load-timeout", "--wait"];
const target = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node escape-return.mjs <url or html file> [--json] [--trigger <css>]... [--max-triggers 12] [--max-ms 40000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const maxTriggers = Number(opt("--max-triggers", 12));
const maxMs = Number(opt("--max-ms", 40000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));

// ---- runs in the page --------------------------------------------------------------------------------
const OVERLAYS = '[role="dialog"], [role="alertdialog"], dialog[open], [popover]:popover-open, [role="menu"], [role="listbox"], [aria-modal="true"]';
const MODALS = 'dialog:modal, [aria-modal="true"], [role="dialog"], [role="alertdialog"]';

function listTriggers(makeSelector, explicitSelectors, overlays) {
  const selector = makeSelector();
  const reg = (window.__er = { triggers: [] });
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const found = new Set();
  const asksForOverlay = (el) => {
    const hp = el.getAttribute("aria-haspopup");
    if (hp && hp !== "false") return true;
    if (el.hasAttribute("popovertarget")) return true;
    const id = el.getAttribute("aria-controls");
    const t = id ? el.getRootNode().getElementById(id) : null;
    return !!t && /^(dialog|alertdialog|menu|listbox)$/.test(t.getAttribute("role") || "") || (!!t && t.localName === "dialog");
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll("button, [role=button], a[href], summary, input[type=button]")) {
      if (visible(el) && !el.closest("[inert]") && !el.closest('[aria-hidden="true"]') && asksForOverlay(el)) found.add(el);
    }
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  for (const css of explicitSelectors) { const el = document.querySelector(css); if (el) found.add(el); }
  reg.triggers = [...found].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return reg.triggers.map((el) => ({ selector: selector(el) }));
}

function openOverlays(overlays) {
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll(overlays)) if (visible(el) && !el.closest("[inert]") && !el.closest('[aria-hidden="true"]')) out.push(el);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  return out;
}

function prepare(makeSelector, index, overlays) {
  const reg = window.__er;
  const t = reg.triggers[index];
  reg.trigger = t;
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll(overlays)) if (visible(el)) out.push(el);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  reg.before = new Set(out);
  reg.expandedBefore = t.getAttribute("aria-expanded");
  t.focus({ preventScroll: true });
  return true;
}

function afterOpen(makeSelector, overlays, modals) {
  const reg = window.__er;
  const t = reg.trigger;
  const selector = makeSelector();
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const now = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll(overlays)) if (visible(el) && !el.closest("[inert]")) now.push(el);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
    }
  };
  walk(document);
  const overlay = now.find((el) => !reg.before.has(el)) || null;
  const expanded = t.getAttribute("aria-expanded") === "true" && reg.expandedBefore !== "true";
  reg.overlay = overlay;
  const opened = !!overlay || expanded;
  const deepActive = () => { let el = document.activeElement; for (;;) { if (el && el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue; } if (el && /^i?frame$/.test(el.localName)) { try { const d = el.contentDocument; if (d && d.activeElement && d.activeElement !== d.body) { el = d.activeElement; continue; } } catch { /* cross-origin */ } } break; } return el; };
  const active = deepActive();
  const modal = !!overlay && overlay.matches(modals);
  const focusInside = !!overlay && !!active && (overlay === active || overlay.contains(active));
  const names = (el) => `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.trim();
  const otherWayToClose = !!overlay && [...overlay.querySelectorAll("button, [role=button], a[href], input[type=button]")].some((el) => visible(el) && /^(x|×|close|dismiss|cancel|done|ok|got it)\b|\bclose\b/i.test(names(el).trim()));
  const focusables = overlay ? overlay.querySelectorAll("button, a[href], input, select, textarea, [tabindex]").length : 0;
  return { opened, modal, focusInside, otherWayToClose, focusables, overlaySelector: overlay ? selector(overlay) : null };
}

// Where is focus: inside the overlay, on the body, or on page content behind it?
function whereIsFocus(makeSelector) {
  const reg = window.__er;
  const selector = makeSelector();
  let el = document.activeElement;
  for (;;) { if (el && el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue; } if (el && /^i?frame$/.test(el.localName)) { try { const d = el.contentDocument; if (d && d.activeElement && d.activeElement !== d.body) { el = d.activeElement; continue; } } catch { /* cross-origin */ } } break; }
  const body = !el || el === document.body || el === document.documentElement;
  const inside = !!reg.overlay && !!el && (reg.overlay === el || reg.overlay.contains(el));
  return { body, inside, selector: body ? null : selector(el) };
}

function refocusInside(makeSelector) {
  const o = window.__er.overlay;
  if (!o) return false;
  const first = o.querySelector("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  (first || o).focus({ preventScroll: true });
  return true;
}

async function afterEscape(makeSelector, overlays) {
  const reg = window.__er;
  const selector = makeSelector();
  const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
  const o = reg.overlay;
  const finite = o && o.getAnimations ? o.getAnimations({ subtree: true }).filter((a) => { try { return a.effect.getComputedTiming().endTime !== Infinity; } catch { return false; } }) : [];
  if (finite.length) await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), timeout(1500)]);
  await timeout(150);
  const t = reg.trigger;
  const visible = (el) => (el.isConnected && (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0));
  const gone = !o || !visible(o) || (o.localName === "dialog" && !o.open);
  // With an overlay to look at, closed means it is gone (a stale aria-expanded is a state bug for other checks);
  // a trigger that only flips aria-expanded is judged by that.
  const closed = o ? gone : t.getAttribute("aria-expanded") !== "true";
  let el = document.activeElement;
  for (;;) { if (el && el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue; } if (el && /^i?frame$/.test(el.localName)) { try { const d = el.contentDocument; if (d && d.activeElement && d.activeElement !== d.body) { el = d.activeElement; continue; } } catch { /* cross-origin */ } } break; }
  const body = !el || el === document.body || el === document.documentElement;
  const focusAfter = el === t ? "trigger" : body ? "body" : "other";
  return { closed, focusAfter, focusAfterSelector: focusAfter === "other" ? selector(el) : null };
}

const inPage = (fn, ...args) => `(${fn.toString()})(${makeSelector.toString()}${args.map((a) => ", " + JSON.stringify(a)).join("")})`;

const browser = await launch();
const findings = [];
const triggers = [];
let stopReason = "complete";
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const open = async () => {
    try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
    catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) stopReason = "load-timeout"; else throw e; }
    await page.waitForTimeout(settleMs);
    await page.bringToFront();
  };
  await open();
  const listed = await page.evaluate(inPage(listTriggers, explicit, OVERLAYS));
  const started = Date.now();
  for (const [index, info] of listed.entries()) {
    if (index >= maxTriggers) { if (stopReason === "complete") stopReason = "trigger-cap"; break; }
    if (Date.now() - started > maxMs) { if (stopReason === "complete") stopReason = "time-cap"; break; }
    if (index > 0) { await open(); await page.evaluate(inPage(listTriggers, explicit, OVERLAYS)); }
    await page.evaluate(inPage(prepare, index, OVERLAYS));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(350);
    const opened = await page.evaluate(inPage(afterOpen, OVERLAYS, MODALS));
    let tabEscaped = null;
    if (opened.opened && opened.modal) {
      for (let n = 0; n < Math.min(opened.focusables + 3, 12) && !tabEscaped; n++) {
        await page.keyboard.press("Tab");
        const w = await page.evaluate(inPage(whereIsFocus));
        if (!w.body && !w.inside) tabEscaped = { selector: w.selector };
      }
    }
    let result = { closed: null, focusAfter: null, focusAfterSelector: null };
    if (opened.opened) {
      await page.evaluate(inPage(refocusInside));
      await page.keyboard.press("Escape");
      result = await page.evaluate(inPage(afterEscape, OVERLAYS));
    }
    const judged = judgeOverlay({ trigger: info.selector, opened: opened.opened, modal: opened.modal, focusInside: opened.focusInside, tabEscaped, closed: opened.opened ? result.closed : null, focusAfter: result.focusAfter, focusAfterSelector: result.focusAfterSelector, otherWayToClose: opened.otherWayToClose });
    findings.push(...judged.findings);
    triggers.push({ selector: info.selector, verdict: judged.verdict, opened: opened.opened, modal: opened.modal, closed: result.closed, focusAfter: result.focusAfter });
  }
} finally {
  await browser.close();
}

const seen = new Set();
const unique = findings.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).sort((a, b) => a.id.localeCompare(b.id));
const result = { findings: unique, stopReason, triggers, stats: { triggers: triggers.length }, note: "Candidates, not verdicts: confirm each with the keyboard before reporting it." };
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  for (const t of triggers) console.log(`${t.verdict.padEnd(26)} ${t.selector}${t.opened ? `   opened${t.modal ? " (modal)" : ""}, ${t.closed ? "closed" : "still open"} after Escape, focus ${t.focusAfter}` : "   (nothing detected opening)"}`);
  for (const f of unique) console.log(`${f.class === "candidate" ? "candidate" : "best practice"}  ${String(f.criterion).padEnd(13)} ${f.id}`);
  console.log(`\n${unique.length} candidate(s). stopReason: ${stopReason}. ${triggers.length} trigger(s) tried.`);
}
