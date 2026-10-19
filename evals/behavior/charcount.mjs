#!/usr/bin/env node
// Behavior check for the "character-count" prompt: a feedback form whose "Comments" textarea is limited to 280 characters, with a
// character count shown to the user.
//
//   - The textarea's accessible description (the elements named by aria-describedby) states the limit, so it is heard on first
//     focus.
//   - Typing does not announce the count on every keystroke: typing ten characters changes a live region, or the text that
//     describes the textarea, fewer than 5 times. (Announcing near the limit and at the limit is a best practice; it is not decided
//     here and stays with the LLM grader.)
// No textarea leaves both results inconclusive.
//
// Usage: node charcount.mjs <html file or url> [--json] [--max-ms 30000]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck, sleep, markNow, liveEventsSince } from "./_page.mjs";

const T_DESC = "The textarea's accessible description states the 280-character limit (aria-describedby points at text that contains it)";
const T_KEYS = "The count is not announced on every keystroke: typing does not repeatedly change a live region or the text that describes the textarea";

export const EXPECTATIONS = [
  { text: T_DESC, ids: ["count-not-in-description"] },
  { text: T_KEYS, ids: ["count-announced-every-keystroke"] },
];

const LIMIT = 280;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCheck(process.argv.slice(2), { maxMs: 30000, expectations: EXPECTATIONS }, async ({ page, add }) => {
    await sleep(300);
    const info = await page.evaluate((limit) => {
      const vis = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
      const ta = [...document.querySelectorAll("textarea")].find(vis);
      if (!ta) return { found: false };
      ta.setAttribute("data-eval-mark", "ta");
      const ids = (ta.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const text = ids.map((i) => (document.getElementById(i) || { textContent: "" }).textContent).join(" ").replace(/\s+/g, " ").trim();
      return { found: true, ids, text: text.slice(0, 120), hasLimit: new RegExp(`(^|\\D)${limit}(\\D|$)`).test(text) };
    }, LIMIT);
    if (!info.found) { add("count-not-in-description", "inconclusive", "no textarea was found"); add("count-announced-every-keystroke", "inconclusive", "no textarea was found"); return; }
    add("count-not-in-description", info.hasLimit ? "pass" : "fail", info.hasLimit ? `the description says "${info.text}"` : info.ids.length ? `the description ("${info.text}") does not state the limit of ${LIMIT}` : "the textarea has no aria-describedby");

    // type ten characters, one at a time, and count how often a live region or the description text changes
    const ta = page.locator('[data-eval-mark="ta"]').first();
    try { await ta.focus({ timeout: 3000 }); } catch { add("count-announced-every-keystroke", "inconclusive", "the textarea could not be focused"); return; }
    await sleep(200);
    const since = await markNow(page);
    const readDesc = () => page.evaluate(() => { const ta = document.querySelector('[data-eval-mark="ta"]'); return (ta.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map((i) => (document.getElementById(i) || { textContent: "" }).textContent).join("|"); });
    let last = await readDesc(), descChanges = 0;
    for (const ch of "abcdefghij") {
      await page.keyboard.type(ch, { delay: 20 });
      await sleep(120);
      const now = await readDesc();
      if (now !== last) descChanges++;
      last = now;
    }
    await sleep(300);
    const events = (await liveEventsSince(page, since)).filter((e) => e.text);
    let live = 0, prev = null;
    for (const e of events) { if (e.text !== prev) live++; prev = e.text; }
    const worst = Math.max(live, descChanges);
    add("count-announced-every-keystroke", worst >= 5 ? "fail" : "pass", `typing 10 characters changed ${live} live-region message(s) and ${descChanges} description text(s)`);
  });
}
