#!/usr/bin/env node
// A fixed pass over the browser's accessibility tree. Every screen reader reads this tree, so what it
// shows is what assistive technology is given. The pass reports candidates for a reviewer to confirm. It
// is evidence, not a verdict, and it can't tell what a screen reader speaks.
//
// Checks (each finding has an id like "interactive-no-name@#save"):
//   interactive-no-name          4.1.2   an exposed control with no accessible name
//   label-not-in-name            2.5.3   the visible text of a control is not part of its accessible name
//   repeated-link-name           2.4.4   links with one name and different destinations whose surroundings
//                                        (the nearest container with text of its own, preceding heading, aria-describedby)
//                                        do not tell them apart
//   repeated-control-name        best practice   buttons with one name and no distinguishing surroundings
//   aria-hidden-focusable        4.1.2   a focusable control inside aria-hidden content
//   duplicate-landmark-name      1.3.1   two landmarks of one role with the same name (or both unnamed)
//   multiple-main / no-main      1.3.1   not exactly one main landmark (top document only)
//   heading-level-skip, no-h1    best practice   the heading outline jumps a level, or has no level 1
//
// It does not check reading order, contrast or anything visual. A candidate needs a person (or the
// reviewing agent) to confirm it in the browser before it becomes a finding.
//
// Usage: node tree-pass.mjs <url or html file> [--json] [--max-nodes 5000] [--load-timeout 15000] [--wait 300]
//   stopReason: complete, node-cap (only the first --max-nodes tree nodes were checked) or load-timeout
//   (the page did not finish loading in time; what had loaded was checked).
//   Same-origin frames and open shadow roots are covered. Out-of-process frames are listed as skipped.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.

import { launch, toUrl } from "./_browser.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const target = argv.find((a, i) => !a.startsWith("--") && !["--max-nodes", "--load-timeout", "--wait"].includes(argv[i - 1]));
if (!target) {
  console.error("Usage: node tree-pass.mjs <url or html file> [--json] [--max-nodes 5000] [--load-timeout 15000] [--wait 300]");
  process.exit(2);
}
const maxNodes = Number(opt("--max-nodes", 5000));
const loadTimeout = Number(opt("--load-timeout", 15000));
const settleMs = Number(opt("--wait", 300));

const INTERACTIVE = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "slider", "spinbutton", "treeitem"]);
const LABELLED_BY_TEXT = new Set(["button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "switch"]);
const LANDMARKS = new Set(["banner", "navigation", "main", "complementary", "contentinfo", "search", "region", "form"]);

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

// ---- runs inside the page, on one element ------------------------------------------------------------
function describeInPage(el) {
  const normIn = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  function selector(n) {
    const parts = [];
    while (n && n.nodeType === 1) {
      const root = n.getRootNode();
      if (n.id && root.querySelectorAll && root.querySelectorAll("#" + esc(n.id)).length === 1) { parts.unshift("#" + esc(n.id)); if (root.host) return selector(root.host) + " >>> " + parts.join(" > "); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.localName === n.localName) : [n];
      parts.unshift(n.localName + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ""));
      if (!n.parentElement && n.parentNode && n.parentNode.host) return selector(n.parentNode.host) + " >>> " + parts.join(" > ");
      n = n.parentElement;
    }
    return parts.join(" > ");
  }
  const own = (el.innerText != null ? el.innerText : el.textContent || "").trim();
  const text = own || (el.localName === "input" && /^(button|submit|reset)$/i.test(el.type) ? el.value : "");
  // The nearest ancestor (up to four levels, never past main or body) that has text besides this control: a list
  // item, cell, card or paragraph. Text in the same container counts as context.
  let blockText = "";
  for (let up = el.parentElement, depth = 0; up && depth < 4 && !/^(body|main)$/.test(up.localName); up = up.parentElement, depth++) {
    blockText = normIn((up.innerText || up.textContent || "").replace(own, ""));
    if (blockText) break;
  }
  const root = el.getRootNode();
  const describedBy = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)
    .map((id) => (root.getElementById ? root.getElementById(id) : null)).filter(Boolean).map((n) => n.textContent).join(" ");
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")];
  let heading = "";
  for (const h of headings) { if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) heading = h.textContent; else break; }
  return { selector: selector(el), text, href: el.localName === "a" ? el.href : null, context: [blockText, normIn(describedBy), normIn(heading)].join("|") };
}

// ---- runs inside one frame ----------------------------------------------------------------------------
function ariaHiddenFocusableInFrame() {
  const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable=true]';
  const out = [];
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const selector = (n) => {
    const parts = [];
    while (n && n.nodeType === 1) {
      const root = n.getRootNode();
      if (n.id && root.querySelectorAll && root.querySelectorAll("#" + esc(n.id)).length === 1) { parts.unshift("#" + esc(n.id)); if (root.host) return selector(root.host) + " >>> " + parts.join(" > "); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.localName === n.localName) : [n];
      parts.unshift(n.localName + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ""));
      if (!n.parentElement && n.parentNode && n.parentNode.host) return selector(n.parentNode.host) + " >>> " + parts.join(" > ");
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const reachable = (el) => {
    if (el.matches(":disabled") || el.getAttribute("tabindex") === "-1" || el.closest("[inert]")) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const walk = (root) => {
    for (const hidden of root.querySelectorAll('[aria-hidden="true"]')) {
      for (const el of [hidden, ...hidden.querySelectorAll(FOCUSABLE)]) {
        if (el.matches(FOCUSABLE) && reachable(el)) out.push(selector(el));
      }
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(document);
  return [...new Set(out)];
}

const browser = await launch();
const findings = [];
const add = (check, criterion, cls, key, extra) => findings.push({ id: `${check}@${key}`, check, criterion, class: cls, ...extra });
let stopReason = "complete";
const skippedFrames = [];
let axTotal = 0;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  try { await page.goto(toUrl(target), { waitUntil: "load", timeout: loadTimeout }); }
  catch (e) { if (/timeout/i.test(`${e.name} ${e.message}`)) stopReason = "load-timeout"; else throw e; }
  await page.waitForTimeout(settleMs);

  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("Accessibility.enable");
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const frameIds = [];
  (function walk(t) { frameIds.push(t.frame.id); (t.childFrames || []).forEach(walk); })(frameTree);

  const describe = async (backendNodeId) => {
    try {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
      const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true, functionDeclaration: `function(){ return (${describeInPage.toString()})(this); }` });
      return result.value || null;
    } catch { return null; }
  };

  let budget = maxNodes;
  for (const [frameIndex, frameId] of frameIds.entries()) {
    const isTop = frameIndex === 0;
    let nodes;
    try { ({ nodes } = await cdp.send("Accessibility.getFullAXTree", { frameId })); }
    catch { skippedFrames.push(frameId); continue; }
    axTotal += nodes.length;
    if (nodes.length > budget) { nodes = nodes.slice(0, Math.max(budget, 0)); stopReason = "node-cap"; }
    budget -= nodes.length;

    const live = nodes.filter((n) => !n.ignored && n.role && n.backendDOMNodeId);
    const roleOf = (n) => n.role.value;
    const nameOf = (n) => ((n.name && n.name.value) || "").trim();

    // 1 and 2: names
    const links = [], buttons = [];
    for (const n of live.filter((n) => INTERACTIVE.has(roleOf(n)))) {
      const name = nameOf(n);
      if (!name) {
        const d = await describe(n.backendDOMNodeId);
        add("interactive-no-name", "4.1.2", "candidate", d ? d.selector : `${roleOf(n)}#${n.nodeId}`, { role: roleOf(n), name: "", element: d && d.selector });
        continue;
      }
      if (roleOf(n) === "link") links.push({ n, name });
      if (roleOf(n) === "button") buttons.push({ n, name });
      if (LABELLED_BY_TEXT.has(roleOf(n))) {
        const d = await describe(n.backendDOMNodeId);
        const visible = norm(d && d.text);
        if (d && /[\p{L}\p{N}]/u.test(visible) && !norm(name).includes(visible)) {
          add("label-not-in-name", "2.5.3", "candidate", d.selector, { role: roleOf(n), name, visibleText: d.text });
        }
      }
    }

    // 3: repeated names, judged by the surroundings that a program can read
    const group = (items) => {
      const by = new Map();
      for (const it of items) by.set(norm(it.name), [...(by.get(norm(it.name)) || []), it]);
      return [...by].filter(([, list]) => list.length > 1);
    };
    for (const [name, list] of group(links)) {
      const described = [];
      for (const it of list) described.push({ ...it, d: await describe(it.n.backendDOMNodeId) });
      const ok = described.filter((x) => x.d);
      const clash = ok.some((a, i) => ok.some((b, j) => j > i && a.d.href !== b.d.href && a.d.context === b.d.context));
      if (clash) add("repeated-link-name", "2.4.4", "candidate", name, { name, count: ok.length, elements: ok.map((x) => x.d.selector) });
    }
    for (const [name, list] of group(buttons)) {
      const described = [];
      for (const it of list) described.push({ ...it, d: await describe(it.n.backendDOMNodeId) });
      const ok = described.filter((x) => x.d);
      const clash = ok.some((a, i) => ok.some((b, j) => j > i && a.d.context === b.d.context));
      if (clash) add("repeated-control-name", "best practice", "best-practice-candidate", name, { name, count: ok.length, elements: ok.map((x) => x.d.selector) });
    }

    // 5: landmarks
    const marks = live.filter((n) => LANDMARKS.has(roleOf(n)));
    const byMark = new Map();
    for (const n of marks) { const k = `${roleOf(n)}:${norm(nameOf(n)) || "(unnamed)"}`; byMark.set(k, (byMark.get(k) || 0) + 1); }
    for (const [k, count] of byMark) if (count > 1 && !k.startsWith("main:")) add("duplicate-landmark-name", "1.3.1", "candidate", k, { count });
    const mains = marks.filter((n) => roleOf(n) === "main").length;
    if (mains > 1) add("multiple-main", "1.3.1", "candidate", `frame-${frameIndex}`, { count: mains });
    if (isTop && mains === 0 && live.length > 2) add("no-main", "1.3.1", "candidate", "document", {});

    // 6: headings
    const levelOf = (n) => { const p = (n.properties || []).find((x) => x.name === "level"); return p ? Number(p.value.value) : 0; };
    const headings = live.filter((n) => roleOf(n) === "heading" && levelOf(n) > 0);
    let prev = 0;
    for (const h of headings) {
      if (prev && levelOf(h) > prev + 1) add("heading-level-skip", "best practice", "best-practice-candidate", `h${levelOf(h)}:${norm(nameOf(h))}`, { from: prev, to: levelOf(h), name: nameOf(h) });
      prev = levelOf(h);
    }
    if (isTop && headings.length && !headings.some((h) => levelOf(h) === 1)) add("no-h1", "best practice", "best-practice-candidate", "document", {});
  }

  // 4: aria-hidden content that can still take focus (DOM, every same-origin frame)
  for (const [i, frame] of page.frames().entries()) {
    let selectors = [];
    try { selectors = await frame.evaluate(ariaHiddenFocusableInFrame); } catch { if (i > 0) skippedFrames.push(frame.url()); }
    for (const s of selectors) add("aria-hidden-focusable", "4.1.2", "candidate", s, { element: s });
  }
} finally {
  await browser.close();
}

const seen = new Set();
const unique = findings.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).sort((a, b) => a.id.localeCompare(b.id));
const result = { findings: unique, stopReason, stats: { axNodes: axTotal, skippedFrames }, note: "Candidates, not verdicts: confirm each in the browser before reporting it." };
if (argv.includes("--json")) console.log(JSON.stringify(result));
else {
  for (const f of unique) console.log(`${f.class === "candidate" ? "candidate" : "best practice"}  ${f.criterion.padEnd(13)} ${f.id}`);
  console.log(`\n${unique.length} candidate(s). stopReason: ${stopReason}. ${axTotal} tree nodes${skippedFrames.length ? `, ${skippedFrames.length} frame(s) skipped` : ""}.`);
}
