#!/usr/bin/env node
// Behavior check for the "loading-status" prompt: a "Load results" button that fetches a list (a simulated delay of about two
// seconds) and shows a spinner while it waits.
//
// On a freshly loaded page it checks, in order:
//   - there is an exposed live region before anything happens (a loading message that arrives in a region created on the fly is
//     not reliably announced);
//   - activating the load button puts text into a live region within 800 ms (loading is announced);
//   - once the results arrive, a later, different message reaches a live region (completion is announced, not only the spinner
//     disappearing);
//   - focus is never lost to <body> (a button that disables itself while loading does this);
//   - a spinner that is on the page while loading is hidden from assistive technology (aria-hidden) or has nothing to expose.
// A control or spinner it cannot find leaves that result inconclusive, so the expectation stays with the LLM grader.
//
// Usage: node loading.mjs <html file or url> [--json] [--max-ms 30000] [--timer-wait 8000]   (--timer-wait: the longest it waits for completion)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck, sleep, liveRegions, findControl, locatorFor, describeFocus, markNow, waitForText } from "./_page.mjs";

const T_REGION = "There is a live region (role=\"status\" or aria-live) in the DOM, not hidden, before the Load button is activated";
const T_LOADING = "Loading is announced: text enters a live region shortly after the button is activated";
const T_DONE = "Completion is announced when the results arrive, with a message in a live region, not only by the spinner disappearing";
const T_FOCUS = "Focus is never lost to <body> while loading or after the results arrive";
const T_SPINNER = "The spinner graphic is hidden from assistive technology (aria-hidden) or exposes nothing of its own";

export const EXPECTATIONS = [
  { text: T_REGION, ids: ["announcer-missing"] },
  { text: T_LOADING, ids: ["loading-not-announced"] },
  { text: T_DONE, ids: ["completion-not-announced"] },
  { text: T_FOCUS, ids: ["focus-lost-on-load"] },
  { text: T_SPINNER, ids: ["spinner-not-hidden"] },
];

const LOAD = "load|fetch|get |show|refresh|search|results";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCheck(process.argv.slice(2), { maxMs: 30000, expectations: EXPECTATIONS }, async ({ page, add, args }) => {
    const skip = (ids, why) => ids.forEach((id) => add(id, "inconclusive", why));
    await sleep(300);
    const pre = await liveRegions(page);
    const exposed = pre.filter((r) => r.exposed);
    add("announcer-missing", exposed.length ? "pass" : "fail", exposed.length ? `${exposed.length} exposed live region(s) before the click` : pre.length ? "every live region is hidden before the click" : "no live region on the page before the click");

    const btn = await findControl(page, LOAD, "i", "load");
    if (!btn.found) { skip(["loading-not-announced", "completion-not-announced", "focus-lost-on-load", "spinner-not-hidden"], "no load button was found"); return; }
    const since = await markNow(page);
    try { await locatorFor(page, "load").click({ timeout: 3000 }); } catch { skip(["loading-not-announced", "completion-not-announced", "focus-lost-on-load", "spinner-not-hidden"], "the load button could not be activated"); return; }

    const first = await waitForText(page, since, 800);
    add("loading-not-announced", first ? "pass" : "fail", first ? `"${first.text.slice(0, 50)}" reached a live region` : "no text reached a live region within 800 ms of the click");

    // a spinner on the page while it loads
    const spin = await page.evaluate(() => {
      const vis = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
      const looksLike = (e) => /spin|load|busy|progress/i.test(`${e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className} ${e.id}`) || e.getAttribute("role") === "progressbar" || e.getAnimations().some((a) => a.effect && a.effect.getComputedTiming().iterations === Infinity);
      // a control that is named or classed like a loading state ("load-results", "is-loading") is the button, not the spinner
      const control = "button,a,input,select,textarea,summary,[role=button]";
      const c = [...document.querySelectorAll("body *")].filter((e) => vis(e) && looksLike(e) && !e.matches(control) && !e.closest(control) && !e.querySelector(`${control},li`));
      if (!c.length) return null;
      // the innermost candidate, so a wrapper called "loading" does not stand for its spinner
      const el = c.find((e) => !c.some((o) => o !== e && e.contains(o))) || c[0];
      const hidden = !!el.closest('[aria-hidden="true"]');
      const exposes = !hidden && ((el.innerText || "").trim().length > 0 || ["img", "progressbar", "status", "alert"].includes(el.getAttribute("role")) || (el.tagName.toLowerCase() === "svg" && !!el.querySelector("title")));
      return { hidden, exposes, tag: el.tagName.toLowerCase() };
    });
    if (!spin) add("spinner-not-hidden", "inconclusive", "no spinner was identified while loading");
    else add("spinner-not-hidden", spin.exposes ? "fail" : "pass", spin.exposes ? `the <${spin.tag}> spinner is exposed to assistive technology` : spin.hidden ? "the spinner is aria-hidden" : "the spinner exposes nothing of its own");

    await sleep(300); // a button that disables itself loses focus at the next rendering step, not at once
    const f1 = await describeFocus(page);
    // wait for the results: a later, different message in a live region
    const end = Date.now() + Math.min(args.timerWait, 8000);
    let done = null;
    for (;;) {
      done = await page.evaluate(({ s, t }) => (window.__ev ? window.__ev.live.find((e) => e.t > s && e.text && e.text !== t) || null : null), { s: first ? first.t : since, t: first ? first.text : "" });
      if (done || Date.now() >= end) break;
      await sleep(150);
    }
    add("completion-not-announced", done ? "pass" : "fail", done ? `"${done.text.slice(0, 50)}" reached a live region` : "no later message reached a live region after the results should have arrived");
    await sleep(300);
    const f2 = await describeFocus(page);
    add("focus-lost-on-load", f1.none || f2.none ? "fail" : "pass", f1.none ? "focus fell to <body> when loading started" : f2.none ? "focus fell to <body> when the results arrived" : "focus stayed on a control");
  });
}
