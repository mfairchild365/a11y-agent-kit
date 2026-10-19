// Shared by the behavior checks in this folder. A behavior check opens a page that a model built, drives it the way a
// user would (click, type, press a key), and says whether the behavior the skill asks for is there.
//
// Model-built pages differ, so a check finds controls by role and accessible name, never by class name or id. When it
// cannot find what it needs, it records "inconclusive" for that result and the expectation stays with the LLM grader:
// a check never guesses.
//
// Output of every check (printed by runCheck, as one JSON object):
//   { findings: [{ id, expectation, evidence }],   the failed results (this is what the fixture runner compares)
//     results:  [{ id, expectation, status, evidence }],   every result: "pass", "fail" or "inconclusive"
//     inconclusive: [id],   the results it declined to decide (the fixtures assert this too, so a check cannot quietly stop looking)
//     expectations: [{ text, ids }],   the expectation texts this check can decide, with the result ids behind each
//     stopReason: "complete" | "time-cap" | "load-timeout" }
// Every wait is bounded, and a page that blocks the main thread ends in "time-cap" instead of hanging.
//
// Usage of any check: node <check>.mjs <html file or url> [--json] [--max-ms 30000] [--load-timeout 8000] [--timer-wait 8000]
//   PW_CHANNEL=msedge (or chrome) uses an installed browser; Playwright is found from the current folder or NODE_PATH.

import { launch, toUrl } from "../../skills/building-accessible-ui/scripts/_browser.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LIVE_SEL = '[role="status"],[role="log"],[role="alert"],[aria-live]:not([aria-live="off"])';

// Installed before the page's own scripts run, so text that is added and removed within a few milliseconds is still seen.
// It records every change inside a live region (or a live region that was inserted), with the region's text at that time.
function recorder() {
  const LIVE = '[role="status"],[role="log"],[role="alert"],[aria-live]:not([aria-live="off"])';
  window.__ev = { live: [], muts: 0 };
  const regionOf = (n) => (n && (n.nodeType === 1 ? n : n.parentElement) ? (n.nodeType === 1 ? n : n.parentElement).closest(LIVE) : null);
  const note = (r) => {
    if (r) window.__ev.live.push({ t: performance.now(), tag: r.tagName.toLowerCase(), id: r.id || null, role: r.getAttribute("role"), text: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300) });
  };
  const start = () => {
    new MutationObserver((ms) => {
      for (const m of ms) {
        note(regionOf(m.target));
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          note(regionOf(n));
          n.querySelectorAll(LIVE).forEach(note);
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["role", "aria-live"] });
  };
  start();
  // any change at all to the page, so a check can tell that an action did something
  new MutationObserver((ms) => { window.__ev.muts += ms.length; }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
}

export const markNow = (page) => page.evaluate(() => performance.now());

// The live regions on the page right now, and whether each is exposed (not display:none, visibility:hidden, hidden, inert or aria-hidden).
export const liveRegions = (page) =>
  page.evaluate((sel) => {
    const exposed = (el) => {
      if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false;
      for (let e = el; e; e = e.parentElement) if (e.hidden || e.inert || e.getAttribute("aria-hidden") === "true") return false;
      return true;
    };
    return [...document.querySelectorAll(sel)].map((el, i) => ({
      i, tag: el.tagName.toLowerCase(), id: el.id || null, role: el.getAttribute("role"), ariaLive: el.getAttribute("aria-live"),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200), exposed: exposed(el),
    }));
  }, LIVE_SEL);

// Waits up to `ms` for a live region to receive non-empty text after `since` (a markNow value). Returns the event or null.
export async function waitForText(page, since, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const hit = await page.evaluate((s) => (window.__ev ? window.__ev.live.find((e) => e.t >= s && e.text) || null : null), since);
    if (hit || Date.now() >= end) return hit;
    await sleep(60);
  }
}

// Every change recorded in a live region since `since`.
export const liveEventsSince = (page, since) => page.evaluate((s) => (window.__ev ? window.__ev.live.filter((e) => e.t >= s) : []), since);

// Finds a control whose accessible name matches /source/flags and marks it with data-eval-mark="<mark>" so it can be
// driven through a locator. Prefers a native button, then anything that behaves as one (role=button, a link, a click or
// tabindex handler), then any short leaf element whose own text matches (a clickable span), unless it is inside a live region (that is a message, not a control). Only visible elements count.
export const findControl = (page, source, flags, mark) =>
  page.evaluate(({ source, flags, mark, sel }) => {
    document.querySelectorAll(`[data-eval-mark="${mark}"]`).forEach((e) => e.removeAttribute("data-eval-mark"));
    const re = new RegExp(source, flags);
    const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const nameOf = (el) => {
      const by = el.getAttribute("aria-labelledby");
      return (el.getAttribute("aria-label") || (by ? by.split(/\s+/).map((id) => (document.getElementById(id) || { textContent: "" }).textContent).join(" ") : "") || text(el) || el.value || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    };
    // A control counts only if a sighted user can see it, so opacity counts here (it does not for exposure to assistive technology).
    const visible = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, checkOpacity: true, opacityProperty: true }) && !el.closest("[hidden],[inert]");
    const pick = (css, native) => {
      const el = [...document.querySelectorAll(css)].filter(visible).find((e) => re.test(nameOf(e)));
      return el ? { el, native } : null;
    };
    const hit = pick('button,input[type="button"],input[type="submit"],summary', true) || pick('[role="button"],a[href],[onclick],[tabindex]', false)
      || (() => { const el = [...document.querySelectorAll("span,div,li,p,i,b,em,label")].filter((e) => !e.children.length && visible(e) && !e.closest(sel) && text(e).length <= 40).find((e) => re.test(text(e))); return el ? { el, native: false } : null; })();
    if (!hit) return { found: false };
    hit.el.setAttribute("data-eval-mark", mark);
    return { found: true, tag: hit.el.tagName.toLowerCase(), role: hit.el.getAttribute("role"), native: hit.native, inLive: !!hit.el.closest(sel), name: nameOf(hit.el).slice(0, 80) };
  }, { source, flags, mark, sel: LIVE_SEL });

export const locatorFor = (page, mark) => page.locator(`[data-eval-mark="${mark}"]`).first();

// Where keyboard focus is: on nothing (body or null), inside a live region, or on a named control.
export const describeFocus = (page) =>
  page.evaluate((sel) => {
    const a = document.activeElement;
    const none = !a || a === document.body || a === document.documentElement;
    return { none, tag: a ? a.tagName.toLowerCase() : null, id: a && a.id ? a.id : null, inLive: !!(a && a.closest && a.closest(sel)) };
  }, LIVE_SEL);

// Runs one check. `spec`: { maxMs, expectations: [{ text, ids }] }. `body({ page, url, add, args, left })`: drive the page
// and call add(id, status, evidence) for each result. The browser is always closed, and the output is always printed.
export async function runCheck(argv, spec, body) {
  const VALUE = ["--max-ms", "--load-timeout", "--timer-wait"];
  const opt = (name, dflt) => (argv.includes(name) ? Number(argv[argv.indexOf(name) + 1]) : dflt);
  const target = argv.find((a, i) => !a.startsWith("--") && !VALUE.includes(argv[i - 1]));
  if (!target) { console.error("Usage: node <check>.mjs <html file or url> [--json] [--max-ms N] [--load-timeout N] [--timer-wait N]"); process.exit(2); }
  const args = { maxMs: opt("--max-ms", spec.maxMs || 30000), loadTimeout: opt("--load-timeout", 8000), timerWait: opt("--timer-wait", 8000) };
  if (![args.maxMs, args.loadTimeout, args.timerWait].every((n) => n > 0)) { console.error("--max-ms, --load-timeout and --timer-wait need positive numbers"); process.exit(2); }

  const owner = new Map();
  for (const e of spec.expectations) for (const id of e.ids) owner.set(id, e.text);
  const results = [];
  let stopReason = "complete", browser = null, printed = false;
  const started = Date.now();
  const left = () => args.maxMs - (Date.now() - started);
  const add = (id, status, evidence = "") => {
    if (!owner.has(id)) throw new Error(`check bug: result id "${id}" is not in any expectation`);
    const i = results.findIndex((r) => r.id === id);
    const r = { id, expectation: owner.get(id), status, evidence };
    if (i >= 0) results[i] = r; else results.push(r);
  };
  const finish = async (code) => {
    if (printed) return;
    printed = true;
    const fails = results.filter((r) => r.status === "fail");
    const out = { findings: fails.map(({ id, expectation, evidence }) => ({ id, expectation, evidence })), inconclusive: results.filter((r) => r.status === "inconclusive").map((r) => r.id).sort(), results, expectations: spec.expectations, stopReason };
    if (argv.includes("--json")) console.log(JSON.stringify(out));
    else {
      for (const r of results) console.log(`${r.status.toUpperCase().padEnd(12)} ${r.id}${r.evidence ? `  (${r.evidence})` : ""}`);
      console.log(`stopReason: ${stopReason}`);
    }
    try { if (browser) await Promise.race([browser.close(), sleep(2000)]); } catch { /* the process is ending anyway */ }
    process.exit(code);
  };
  const timer = setTimeout(() => { stopReason = "time-cap"; finish(0); }, args.maxMs);
  try {
    browser = await launch();
    const page = await browser.newPage();
    // (A page that calls alert, confirm or prompt is fine: with no dialog listener Playwright dismisses them itself.)
    await page.addInitScript(recorder);
    const url = toUrl(target);
    try { await page.goto(url, { waitUntil: "load", timeout: args.loadTimeout }); }
    catch { stopReason = "load-timeout"; clearTimeout(timer); return await finish(0); }
    await body({ page, url, add, args, left });
  } catch (e) {
    console.error(`check error: ${e.message}`);
    stopReason = "error";
    clearTimeout(timer);
    return await finish(1);
  }
  clearTimeout(timer);
  await finish(0);
}
