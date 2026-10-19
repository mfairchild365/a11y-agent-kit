#!/usr/bin/env node
// Behavior check for the "tooltip-toggletip" prompt: a settings form with an "API key" field, an info button beside it that
// opens an explanation (a toggletip), and an icon-only Copy button that shows its name as a tooltip.
//
// Toggletip (the info button: a button named like info, help, more, explain, about or "?", other than Copy):
//   it has aria-expanded, and it flips when the button is activated, with the panel visible right after the button in the DOM;
//   activating it again closes it; Escape closes it and puts focus back on the button; the panel is not wired in with
//   aria-describedby.
// Tooltip (the Copy button): no title attribute is used as the tooltip; the tooltip is a role="tooltip" element named by
//   aria-describedby; it shows on keyboard focus and on hover, Escape dismisses it, and it stays while the pointer moves onto it.
// A control it cannot find leaves its results inconclusive, so those expectations stay with the LLM grader.
//
// Usage: node tooltip.mjs <html file or url> [--json] [--max-ms 30000]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck, sleep, findControl, locatorFor } from "./_page.mjs";

const T_TOGGLE = "The info button is a native button whose panel is its next sibling in the DOM; it opens and closes on activation with aria-expanded kept in sync";
const T_ESC = "Pressing Escape closes the open toggletip and returns focus to its button";
const T_NODESC = "The toggletip panel is not referenced through aria-describedby on its button";
const T_SHOW = "The tooltip on the icon-only button appears on keyboard focus as well as on hover, can be dismissed with Escape, and stays visible while the pointer is over it";
const T_ASSOC = 'The tooltip is a separate element with role="tooltip" referenced by aria-describedby on its control, and no title attribute is used as a tooltip';

export const EXPECTATIONS = [
  { text: T_TOGGLE, ids: ["toggletip-no-aria-expanded", "toggletip-not-next-sibling", "toggletip-does-not-close"] },
  { text: T_ESC, ids: ["toggletip-escape-fails"] },
  { text: T_NODESC, ids: ["toggletip-described-by-panel"] },
  { text: T_SHOW, ids: ["tooltip-not-on-focus", "tooltip-not-on-hover", "tooltip-not-dismissible", "tooltip-not-hoverable"] },
  { text: T_ASSOC, ids: ["tooltip-not-associated", "title-attribute-tooltip"] },
];

const INFO = "info|help|more|explain|about|what|^\\s*\\?\\s*$|^\\s*i\\s*$";
const COPY = "copy";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCheck(process.argv.slice(2), { maxMs: 30000, expectations: EXPECTATIONS }, async ({ page, url, add, args }) => {
    const skip = (ids, why) => ids.forEach((id) => add(id, "inconclusive", why));
    await sleep(300);

    // ---- the toggletip
    const info = await page.evaluate(({ INFO, COPY }) => {
      const re = new RegExp(INFO, "i"), no = new RegExp(COPY, "i");
      const nameOf = (el) => (el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? el.getAttribute("aria-labelledby").split(/\s+/).map((i) => (document.getElementById(i) || { textContent: "" }).textContent).join(" ") : "") || el.textContent || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      const vis = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
      const btns = [...document.querySelectorAll("button,[role=button]")].filter(vis).filter((b) => !no.test(nameOf(b)));
      const el = btns.find((b) => b.hasAttribute("aria-expanded")) || btns.find((b) => re.test(nameOf(b)));
      if (!el) return { found: false };
      el.setAttribute("data-eval-mark", "info");
      return { found: true, native: el.tagName === "BUTTON", name: nameOf(el).slice(0, 60) };
    }, { INFO, COPY });
    const ids1 = ["toggletip-no-aria-expanded", "toggletip-not-next-sibling", "toggletip-does-not-close", "toggletip-escape-fails", "toggletip-described-by-panel"];
    if (!info.found) skip(ids1, "no info button was found");
    else {
      // What is on the page now. A panel counts as open only when a sibling shows text it did not show before the first activation
      // (a hint that is always visible right after the button is not a panel).
      const raw = () => page.evaluate(() => {
        const b = document.querySelector('[data-eval-mark="info"]');
        const vis = (el) => !!el && el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }) && !el.closest("[hidden],[inert]");
        const sibs = [b.nextElementSibling, b.parentElement && b.parentElement.children.length === 1 ? b.parentElement.nextElementSibling : null].filter(Boolean);
        const by = (b.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)).filter(Boolean);
        return { expanded: b.getAttribute("aria-expanded"), sibs: sibs.map((s) => (vis(s) ? (s.innerText || "").trim() : "")), describedByPanel: by.some((e) => sibs.includes(e) || sibs.some((s) => s.contains(e)) || e.contains(b.nextElementSibling || b)), bodyLen: document.body.innerText.length };
      });
      const before = await raw();
      const probe = async () => {
        const p = await raw();
        const i = p.sibs.findIndex((t, k) => t && t !== before.sibs[k]);
        return { ...p, panelOpen: i >= 0, panelText: i >= 0 ? p.sibs[i].slice(0, 40) : "" };
      };
      const btn = locatorFor(page, "info");
      let clicked = true;
      try { await btn.click({ timeout: 3000 }); } catch { clicked = false; }
      if (!clicked) skip(ids1, "the info button could not be activated");
      else if (!(await page.locator('[data-eval-mark="info"]').count())) skip(ids1, "the info button disappeared when activated");
      else {
        await sleep(300);
        const open = await probe();
        if (open.expanded !== "true") add("toggletip-no-aria-expanded", "fail", open.expanded === null ? "the info button has no aria-expanded" : `aria-expanded is "${open.expanded}" after opening it`);
        else add("toggletip-no-aria-expanded", "pass", "aria-expanded is true when open");
        if (open.panelOpen) add("toggletip-not-next-sibling", "pass", `the panel ("${open.panelText}") follows the button`);
        else if (open.bodyLen > before.bodyLen + 10) add("toggletip-not-next-sibling", "fail", "text appeared when the button was activated, but not in the element after it");
        else add("toggletip-not-next-sibling", "inconclusive", "nothing visible appeared after activating the button");
        add("toggletip-described-by-panel", open.describedByPanel ? "fail" : "pass", open.describedByPanel ? "the button points to its panel with aria-describedby" : "the panel is not an aria-describedby target");
        // close by activating again
        await btn.click({ timeout: 3000 }).catch(() => {});
        await sleep(300);
        const closed = await probe();
        if (!open.panelOpen) add("toggletip-does-not-close", "inconclusive", "no panel to see close");
        else add("toggletip-does-not-close", closed.panelOpen || closed.expanded === "true" ? "fail" : "pass", closed.panelOpen ? "the panel is still open after a second activation" : "the second activation closes it");
        // Escape
        await btn.click({ timeout: 3000 }).catch(() => {});
        await sleep(300);
        const reopened = await probe();
        if (!reopened.panelOpen) add("toggletip-escape-fails", "inconclusive", "the toggletip did not reopen");
        else {
          await page.keyboard.press("Escape");
          await sleep(300);
          const after = await probe();
          const onBtn = await page.evaluate(() => document.activeElement === document.querySelector('[data-eval-mark="info"]'));
          add("toggletip-escape-fails", !after.panelOpen && onBtn ? "pass" : "fail", after.panelOpen ? "Escape left the panel open" : onBtn ? "Escape closed it and focus is on the button" : "Escape closed it, but focus is not on the button");
        }
      }
    }

    // ---- the tooltip on the Copy button (a fresh page, so nothing is left open)
    await page.goto(url, { waitUntil: "load", timeout: args.loadTimeout });
    await sleep(300);
    const copy = await findControl(page, COPY, "i", "copy");
    const ids2 = ["tooltip-not-associated", "title-attribute-tooltip", "tooltip-not-on-focus", "tooltip-not-on-hover", "tooltip-not-dismissible", "tooltip-not-hoverable"];
    if (!copy.found) { skip(ids2, "no Copy control was found"); return; }
    const assoc = await page.evaluate(() => {
      const b = document.querySelector('[data-eval-mark="copy"]');
      const tip = (b.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map((i) => document.getElementById(i)).find((e) => e && e.getAttribute("role") === "tooltip");
      const vis = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
      const titled = [...document.querySelectorAll("button,a[href],input,select,textarea,[tabindex],[role=button]")].filter(vis).filter((e) => e.hasAttribute("title") && e.getAttribute("title").trim());
      return { hasTip: !!tip, titled: titled.map((e) => e.tagName.toLowerCase()).slice(0, 3) };
    });
    add("tooltip-not-associated", assoc.hasTip ? "pass" : "fail", assoc.hasTip ? "a role=tooltip element is referenced by aria-describedby" : 'no role="tooltip" element is referenced by aria-describedby on the Copy button');
    add("title-attribute-tooltip", assoc.titled.length ? "fail" : "pass", assoc.titled.length ? `a title attribute is used on: ${assoc.titled.join(", ")}` : "no title attribute on a control");

    // Is a tooltip showing? It is the described-by tooltip when there is one; otherwise any new visible text.
    const flag = () => page.evaluate(() => { document.querySelectorAll("[data-eval-seen]").forEach((e) => e.removeAttribute("data-eval-seen")); const vis = (el) => el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }); document.querySelectorAll("body *").forEach((e) => { if (vis(e)) e.setAttribute("data-eval-seen", "1"); }); });
    const tip = () => page.evaluate(() => {
      const vis = (el) => el && el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }) && !el.closest("[hidden]");
      const b = document.querySelector('[data-eval-mark="copy"]');
      const named = (b.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map((i) => document.getElementById(i)).find(Boolean);
      let el = named && vis(named) ? named : null;
      if (!el) { const t = document.querySelector('[role="tooltip"]'); if (vis(t)) el = t; }
      if (!el) el = [...document.querySelectorAll("body *")].find((e) => vis(e) && !e.hasAttribute("data-eval-seen") && (e.innerText || "").trim().length > 1 && !e.contains(b));
      if (!el) return { shown: false };
      const r = el.getBoundingClientRect();
      return { shown: true, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    });
    const copyBtn = locatorFor(page, "copy");
    await page.mouse.move(0, 0);
    await flag();
    // keyboard focus
    await copyBtn.focus({ timeout: 3000 }).catch(() => {});
    await sleep(350);
    const onFocus = await tip();
    add("tooltip-not-on-focus", onFocus.shown ? "pass" : "fail", onFocus.shown ? "a tooltip shows on keyboard focus" : "nothing shows when the Copy button takes keyboard focus");
    if (onFocus.shown) {
      await page.keyboard.press("Escape");
      await sleep(350);
      const afterEsc = await tip();
      add("tooltip-not-dismissible", afterEsc.shown ? "fail" : "pass", afterEsc.shown ? "Escape did not dismiss the tooltip" : "Escape dismisses the tooltip");
    } else add("tooltip-not-dismissible", "inconclusive", "no tooltip showed to dismiss");
    // hover
    await copyBtn.evaluate((e) => e.blur());
    await page.mouse.move(0, 0);
    await sleep(350);
    await flag();
    await copyBtn.hover({ timeout: 3000 }).catch(() => {});
    await sleep(450);
    const onHover = await tip();
    add("tooltip-not-on-hover", onHover.shown ? "pass" : "fail", onHover.shown ? "a tooltip shows on hover" : "nothing shows when the pointer rests on the Copy button");
    if (onHover.shown && onHover.w > 0 && onHover.h > 0) {
      const box = await copyBtn.boundingBox();
      if (box) {
        await page.mouse.move(onHover.x, onHover.y, { steps: 12 });
        await sleep(500);
        const stays = await tip();
        add("tooltip-not-hoverable", stays.shown ? "pass" : "fail", stays.shown ? "the tooltip stays while the pointer is over it" : "the tooltip disappears when the pointer moves onto it");
      } else add("tooltip-not-hoverable", "inconclusive", "the button has no box");
    } else add("tooltip-not-hoverable", "inconclusive", "no tooltip showed on hover to move onto");
  });
}
