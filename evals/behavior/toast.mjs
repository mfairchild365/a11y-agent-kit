#!/usr/bin/env node
// Behavior check for the "toast-archive-undo" prompt: a roster with an Archive button on each row, a status message
// after archiving, and a way to undo. It decides the expectations that can be read from behavior; "the message states its
// type in text" stays with the LLM grader.
//
// What it does, in order, on a freshly loaded page:
//   1. Looks at the live regions before anything happens (is there an exposed, empty one?).
//   2. Activates the first Archive control and checks that the message arrived in a live region, where Undo is (inside
//      that region or not, a native button or not), and whether focus was moved to the message.
//   3. Waits (--timer-wait, 8 s by default) and checks that the user can still recover: an Undo, Restore or similar
//      control is still on the page.
//   4. On a fresh load, archives, activates Undo with the keyboard, and checks focus did not fall back to <body>.
// Controls are found by accessible name. If there is no Archive control, nothing is decided.
//
// Usage: node toast.mjs <html file or url> [--json] [--max-ms 30000] [--timer-wait 8000]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck, sleep, liveRegions, findControl, locatorFor, describeFocus, markNow, waitForText } from "./_page.mjs";

const T_REGION = 'The status message is added to a role="status" (or role="log") element that is in the DOM, empty and not hidden, before the message is inserted';
const T_UNDO = "The Undo control is not inside the live region: it is inline on the affected row or in a persistent history list, and it is a native button reachable by keyboard";
const T_RECOVER = "The user can recover the message or the action after any timeout: a history list or an inline state, not only a timed toast";
const T_FOCUS = "Focus is not moved to the message, and after Undo it lands on a logical control, not <body>";

export const EXPECTATIONS = [
  { text: T_REGION, ids: ["live-region-missing", "live-region-hidden", "live-region-not-empty", "message-not-in-region"] },
  { text: T_UNDO, ids: ["undo-missing", "undo-in-live-region", "undo-not-native-button", "undo-not-keyboard-operable"] },
  { text: T_RECOVER, ids: ["undo-vanishes-on-timer"] },
  { text: T_FOCUS, ids: ["focus-moved-to-message", "focus-lost-after-undo"] },
];

const ARCHIVE = "^(?!.*(?:undo|unarchive|restore)).*archiv";
const UNDO = "\\bundo\\b";
const RECOVER = "undo|restore|unarchive|recover";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCheck(process.argv.slice(2), { maxMs: 30000, expectations: EXPECTATIONS }, async ({ page, url, add, args }) => {
    const settle = () => sleep(300);
    // Archives the first row and returns { event, since } (the first live-region text after the click) or null if there is no control.
    const archive = async () => {
      const a = await findControl(page, ARCHIVE, "i", "archive");
      if (!a.found) return null;
      const since = await markNow(page);
      try { await locatorFor(page, "archive").click({ timeout: 3000 }); } catch { return null; }
      return { since };
    };

    // 1. before anything happens
    await settle();
    const pre = await liveRegions(page);
    const exposed = pre.filter((r) => r.exposed);
    if (!pre.length) {
      add("live-region-missing", "fail", "no live region on the page before the action");
      add("live-region-hidden", "inconclusive", "no live region to look at");
      add("live-region-not-empty", "inconclusive", "no live region to look at");
    } else {
      add("live-region-missing", "pass", `${pre.length} live region(s)`);
      if (!exposed.length) {
        add("live-region-hidden", "fail", "every live region is hidden (display, visibility, hidden, inert or aria-hidden)");
        add("live-region-not-empty", "inconclusive", "the regions are hidden");
      } else {
        add("live-region-hidden", "pass", "an exposed live region exists");
        if (exposed.every((r) => r.text)) add("live-region-not-empty", "fail", `every exposed live region already holds text ("${exposed[0].text.slice(0, 40)}")`);
        else add("live-region-not-empty", "pass", "an exposed live region is empty");
      }
    }

    // 2. archive, then look at the message, Undo and focus
    const first = await archive();
    const skip = (ids, why) => ids.forEach((id) => add(id, "inconclusive", why));
    if (!first) {
      skip(["message-not-in-region", "undo-missing", "undo-in-live-region", "undo-not-native-button", "undo-not-keyboard-operable", "undo-vanishes-on-timer", "focus-moved-to-message", "focus-lost-after-undo"], "no Archive control was found or it could not be activated");
      return;
    }
    const clickedAt = Date.now();
    const ev = await waitForText(page, first.since, 1000);
    add("message-not-in-region", ev ? "pass" : "fail", ev ? `"${ev.text.slice(0, 50)}" went into a live region` : "no text reached any live region within 1 s of the click");
    await sleep(200);
    const f1 = await describeFocus(page);
    add("focus-moved-to-message", f1.inLive ? "fail" : "pass", f1.inLive ? "focus is inside a live region after archiving" : "focus is not in the live region");

    let undo = { found: false };
    for (const end = Date.now() + 800; ; ) {
      undo = await findControl(page, UNDO, "i", "undo");
      if (undo.found || Date.now() >= end) break;
      await sleep(80);
    }
    if (!undo.found) {
      add("undo-missing", "fail", "no Undo control appeared after archiving");
      skip(["undo-in-live-region", "undo-not-native-button", "undo-vanishes-on-timer"], "there is no Undo control");
    } else {
      add("undo-missing", "pass", `found "${undo.name}"`);
      add("undo-in-live-region", undo.inLive ? "fail" : "pass", undo.inLive ? "the Undo control is inside a live region" : "Undo is outside the live regions");
      add("undo-not-native-button", undo.native ? "pass" : "fail", undo.native ? "Undo is a native button" : `Undo is a <${undo.tag}>${undo.role ? ` with role="${undo.role}"` : ""}, not a native button`);

      // 3. wait, then see whether the user can still recover
      const wait = Math.max(0, args.timerWait - (Date.now() - clickedAt));
      await sleep(wait);
      const later = await findControl(page, RECOVER, "i", "recover");
      add("undo-vanishes-on-timer", later.found ? "pass" : "fail", later.found ? `"${later.name}" is still there after ${args.timerWait} ms` : `no Undo, Restore or similar control remains after ${args.timerWait} ms`);
    }

    // 4. on a fresh page, undo with the keyboard and see where focus goes
    await page.goto(url, { waitUntil: "load", timeout: args.loadTimeout });
    await settle();
    const again = await archive();
    let u2 = { found: false };
    if (again) {
      for (const end = Date.now() + 800; ; ) {
        u2 = await findControl(page, UNDO, "i", "undo");
        if (u2.found || Date.now() >= end) break;
        await sleep(80);
      }
    }
    if (!u2.found) { skip(["focus-lost-after-undo", "undo-not-keyboard-operable"], "no Undo control to use"); return; }
    let muts0 = 0;
    try {
      await locatorFor(page, "undo").focus({ timeout: 3000 });
      muts0 = await page.evaluate(() => window.__ev.muts);
      await page.keyboard.press("Enter");
    } catch { skip(["focus-lost-after-undo", "undo-not-keyboard-operable"], "the Undo control could not be focused"); return; }
    await sleep(300);
    // An Enter that changed nothing on the page did nothing for the keyboard.
    const changed = (await page.evaluate(() => window.__ev.muts)) > muts0;
    if (!changed) { add("undo-not-keyboard-operable", "fail", "pressing Enter on the focused Undo did nothing"); add("focus-lost-after-undo", "inconclusive", "Undo did not run, so there is no focus move to judge"); return; }
    add("undo-not-keyboard-operable", "pass", "Enter on the focused Undo ran it");
    const f2 = await describeFocus(page);
    add("focus-lost-after-undo", f2.none ? "fail" : "pass", f2.none ? "focus fell back to the page body after Undo" : `focus is on <${f2.tag}>`);
  });
}
