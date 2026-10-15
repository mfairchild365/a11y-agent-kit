#!/usr/bin/env node
// Walks the page twice in a real browser, once pressing Tab and once pressing Shift+Tab on a fresh load, and
// compares the two. It reports candidates for a reviewer to confirm. It is evidence, not a verdict.
//
// Checks (each finding has an id like "shift-tab-unreached@#save"):
//   shift-tab-unreached        2.1.1   Tab reached the control, Shift+Tab never did
//   reached-only-by-shift-tab  2.4.3   Shift+Tab reached a control that Tab never did
//   shift-tab-order-differs    2.4.3   going backward does not retrace the forward order, reported at the first
//                                      stop where it departs from the exact reverse
//   shift-tab-trap-candidate   2.1.2   Shift+Tab cycled or stuck on a page where Tab did not
// The members of a radio group count as one stop, because Tab lands on the first member and Shift+Tab on the last.
//
// Order and reach are compared only when both walks ran to the end; a walk that stopped early says nothing
// about what it missed. Forward-only problems (an unnamed control, an unreachable one, a Tab trap) are
// keyboard-walk.mjs's job.
//
// Usage: node shift-tab-walk.mjs <url or html file> [--json] [--max-stops 200] [--max-ms 20000]
//        [--load-timeout 15000] [--wait 300]
//   stopReason: the first walk's that did not complete (complete, cycle, modal-cycle, stuck, stop-cap,
//   time-cap), or load-timeout. --max-ms applies to each walk.
//   Same-origin frames and open shadow roots are walked. PW_CHANNEL=msedge (or chrome) uses an installed browser.

import { launch, toUrl } from "./_browser.mjs";
import { compareWalks } from "./_shift-tab.mjs";
import { installTabCapture, walkTab } from "./_tab-walk.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const VALUE_FLAGS = ["--max-stops", "--max-ms", "--load-timeout", "--wait"];
const target = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node shift-tab-walk.mjs <url or html file> [--json] [--max-stops 200] [--max-ms 20000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const maxStops = Number(opt("--max-stops", 200));
const maxMs = Number(opt("--max-ms", 20000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));

const browser = await launch();
let loadTimedOut = false;
let forward, backward;
try {
  const context = await browser.newContext();
  const walkOnce = async (isBackward) => {
    const page = await context.newPage();
    await installTabCapture(page);
    try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
    catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) loadTimedOut = true; else throw e; }
    await page.waitForTimeout(settleMs);
    await page.bringToFront();
    const stops = [];
    const { ended, trap } = await walkTab(page, {
      maxStops,
      maxMs,
      backward: isBackward,
      onStop: async (info) => { stops.push({ key: info.group || info.selector, selector: info.selector }); },
    });
    await page.close();
    return { stops, ended, trap: trap ? { kind: trap.kind, selector: trap.info.selector } : null };
  };
  forward = await walkOnce(false);
  backward = await walkOnce(true);
} finally {
  await browser.close();
}

const { findings, comparable } = compareWalks(forward, backward);
const stopReason = loadTimedOut ? "load-timeout" : forward.ended !== "complete" ? forward.ended : backward.ended;
const result = {
  findings,
  stopReason,
  comparable,
  forward: { ended: forward.ended, stops: forward.stops.map((s) => s.selector) },
  backward: { ended: backward.ended, stops: backward.stops.map((s) => s.selector) },
  stats: { forwardStops: forward.stops.length, backwardStops: backward.stops.length },
  note: "Candidates, not verdicts: confirm each with the keyboard before reporting it.",
};
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  console.log("Tab:       " + (forward.stops.map((s) => s.selector).join("  >  ") || "(no stops)"));
  console.log("Shift+Tab: " + (backward.stops.map((s) => s.selector).join("  >  ") || "(no stops)"));
  for (const f of findings) console.log(`candidate  ${f.criterion.padEnd(6)} ${f.id}`);
  console.log(`\n${findings.length} candidate(s). stopReason: ${stopReason}. Tab ${forward.ended}, Shift+Tab ${backward.ended}${comparable ? "" : " (not compared: a walk did not finish)"}.`);
}
