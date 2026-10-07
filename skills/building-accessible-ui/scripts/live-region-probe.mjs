#!/usr/bin/env node
// Records what happens to a status message in a real browser: which live region got the text, whether
// that region existed before and is exposed to assistive technology, and how long the text stayed.
// It installs a MutationObserver before the page's own scripts run, so text that is added and removed
// within milliseconds (a shared announcer) is still recorded.
//
// It shows what the browser exposes. It cannot tell whether a screen reader speaks the text, and it
// gives classes, not a pass or fail:
//   no-live-region     text changed with no live region involved
//   hidden-region      text went into a region that is not exposed to assistive technology
//   inserted-with-text a live region was created together with its text
//   transient          the text was removed or replaced before the end of the wait
//   present            an existing, exposed live region got the text and it stayed
//
// Usage: node live-region-probe.mjs <url or html file> [--click <selector> | --press <key>]... [--wait 1500] [--ax] [--json]
//   Steps run in order through Playwright's real click and keyboard, so focus behaves as it does for a user.
//   Run it on a page it loads itself: the observer has to be installed before the page's scripts.
//   PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.
//   Playwright is found from the current directory or NODE_PATH.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const steps = [];
let target = null, wait = 1500, json = false, ax = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--click") steps.push({ click: argv[++i] });
  else if (a === "--press") steps.push({ press: argv[++i] });
  else if (a === "--wait") wait = +argv[++i];
  else if (a === "--json") json = true;
  else if (a === "--ax") ax = true;
  else if (!a.startsWith("--") && !target) target = a;
}
if (!target || steps.some((s) => !(s.click || s.press))) {
  console.error("Usage: node live-region-probe.mjs <url or html file> [--click <selector> | --press <key>]... [--wait 1500] [--ax] [--json]");
  process.exit(2);
}
const url = /^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(path.resolve(target)).href;

function loadPlaywright() {
  const roots = [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)];
  for (const root of roots) {
    for (const name of ["playwright", "playwright-core"]) {
      try {
        const req = createRequire(path.join(root, fs.existsSync(path.join(root, "package.json")) ? "package.json" : "noop.js"));
        return req(name);
      } catch { /* try the next */ }
      try { return createRequire(path.join(root, "noop.js"))(path.join(root, name)); } catch { /* next */ }
    }
  }
  console.error("Cannot find Playwright. Run from a folder that has it installed, or set NODE_PATH to its node_modules folder.");
  process.exit(2);
}

// ---- runs in every frame before the page's scripts ------------------------------------------------
function installObserver() {
  const lp = (window.__lp = { events: [], ids: new WeakMap(), nextId: 1, seen: new WeakSet(), born: new WeakMap(), regions: new Map(), roots: [] });
  const now = () => Math.round(performance.now() * 10) / 10;
  const up = (n) => (n.parentElement ? n.parentElement : (n.getRootNode && n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null));
  const idOf = (el) => { if (!lp.ids.has(el)) { lp.ids.set(el, lp.nextId++); lp.regions.set(lp.ids.get(el), el); } return lp.ids.get(el); };
  const desc = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "") + (el.className && typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : ""));
  const liveInfo = (el) => {
    for (let n = el; n && n.nodeType === 1; n = up(n)) {
      const live = n.getAttribute("aria-live"), role = n.getAttribute("role");
      if (live) return live === "off" ? null : { el: n, how: "aria-live=" + live, level: live };
      if (role === "alert") return { el: n, how: "role=alert", level: "assertive" };
      if (role === "status") return { el: n, how: "role=status", level: "polite" };
      if (role === "log") return { el: n, how: "role=log", level: "polite" };
    }
    return null;
  };
  const exposed = (el) => {
    for (let n = el; n && n.nodeType === 1; n = up(n)) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || n.hidden || n.getAttribute("aria-hidden") === "true" || n.inert) return false;
    }
    return true;
  };
  const mark = (root, state) => { root.querySelectorAll("*").forEach((x) => { if (!lp.seen.has(x)) { lp.seen.add(x); lp.born.set(x, state); } if (x.shadowRoot) markShadow(x.shadowRoot, state); }); };
  const markShadow = (sr, state) => { mark(sr, state); observe(sr); };
  const push = (e) => lp.events.push(e);
  const record = (target, kind, text) => {
    const li = liveInfo(target);
    push({ t: now(), kind, text, node: desc(target), live: li ? li.how : null, level: li ? li.level : null,
      region: li ? desc(li.el) : null, regionId: li ? idOf(li.el) : null,
      existed: li ? lp.born.get(li.el) || "before" : null, exposed: exposed(target), atomic: li ? li.el.getAttribute("aria-atomic") : null, relevant: li ? li.el.getAttribute("aria-relevant") : null });
  };
  const observed = new WeakSet();
  function observe(root) {
    if (observed.has(root)) return; observed.add(root); if (root !== document) lp.roots.push(root);
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") { record(r.target, `attribute ${r.attributeName} changed`, r.target.getAttribute(r.attributeName)); continue; }
        let coveredByRegion = false;
        for (const added of r.addedNodes) {
          if (added.nodeType !== 1) continue;
          const fresh = !lp.seen.has(added);
          if (fresh) { lp.seen.add(added); lp.born.set(added, "inserted with this change"); }
          mark(added, "inserted with this change");
          if (added.shadowRoot) markShadow(added.shadowRoot, "inserted with this change");
          const regions = [added, ...added.querySelectorAll("*")].filter((x) => liveInfo(x) && liveInfo(x).el === x);
          for (const reg of regions) if (fresh && reg.textContent.trim()) { record(reg, "region inserted with text", reg.textContent.trim()); coveredByRegion = true; }
        }
        const target = r.target.nodeType === 1 ? r.target : up(r.target);
        if (!target) continue;
        if (r.type === "characterData") record(target, "text changed", r.target.data.trim());
        else {
          const add = [...r.addedNodes].map((n) => n.textContent).join("").trim();
          const rem = [...r.removedNodes].map((n) => n.textContent).join("").trim();
          if (add && !coveredByRegion) record(target, "text added", add); else if (!add && rem) record(target, "text removed", rem);
        }
      }
    }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-live", "role"] });
  }
  observe(document);
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) { const sr = orig.call(this, init); observe(sr); return sr; };
  lp.baseline = () => { lp.events.length = 0; for (const root of [document, ...lp.roots]) root.querySelectorAll("*").forEach((x) => { lp.seen.add(x); lp.born.set(x, "before"); }); };
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let result;
try {
  const page = await browser.newPage();
  await page.addInitScript(installObserver);
  await page.goto(url, { waitUntil: "load" });
  for (const f of page.frames()) await f.evaluate(() => window.__lp && window.__lp.baseline()).catch(() => {});
  const focusNotes = [];
  for (const s of steps) {
    const before = await page.evaluate(() => { const a = document.activeElement; return a ? (a.id ? "#" + a.id : a.tagName.toLowerCase()) : null; });
    if (s.click) await page.click(s.click); else await page.keyboard.press(s.press);
    await page.waitForTimeout(50);
    const info = await page.evaluate((sel) => {
      const a = document.activeElement;
      const desc = a ? (a.id ? "#" + a.id : a.tagName.toLowerCase()) : null;
      const acted = sel ? document.querySelector(sel) : null;
      return { desc, movedAway: !!(a && a !== document.body && acted && a !== acted && !acted.contains(a)) };
    }, s.click || null);
    focusNotes.push({ step: s.click ? `click ${s.click}` : `press ${s.press}`, before, after: info.desc, movedToAnotherElement: s.click ? info.movedAway : info.desc !== before });
  }
  await page.waitForTimeout(wait);
  const events = [];
  const finals = {};
  for (const f of page.frames()) {
    const got = await f.evaluate(() => (window.__lp ? { events: window.__lp.events, finals: Object.fromEntries([...window.__lp.regions].map(([id, el]) => [id, el.textContent.trim()])) } : null)).catch(() => null);
    if (!got) continue;
    for (const e of got.events) events.push({ ...e, frame: f === page.mainFrame() ? "main" : f.url() });
    Object.assign(finals, got.finals);
  }
  events.sort((a, b) => a.t - b.t);
  // group the text arrivals into messages and classify
  const messages = [];
  for (const e of events) {
    if (!["text added", "text changed", "region inserted with text"].includes(e.kind) || !e.text) continue;
    const next = events.find((x) => x.t >= e.t && x !== e && x.regionId === e.regionId && x.regionId !== null && (x.kind === "text removed" || (x.kind === "text changed" && x.text !== e.text)));
    const sameTask = events.filter((x) => x.regionId === e.regionId && x.regionId !== null && Math.abs(x.t - e.t) < 4).length;
    const stillThere = e.regionId !== null ? (finals[e.regionId] || "").includes(e.text) : null;
    let cls;
    if (e.live === null) cls = "no-live-region";
    else if (!e.exposed) cls = "hidden-region";
    else if (e.kind === "region inserted with text") cls = "inserted-with-text";
    else if (stillThere === false) cls = "transient";
    else cls = "present";
    messages.push({ text: e.text, class: cls, node: e.node, region: e.region, live: e.live, level: e.level, existedBeforeTheAction: e.existed === "before", exposedToAT: e.exposed,
      dwellMs: stillThere === false && next ? Math.round(next.t - e.t) : stillThere ? "still there after the wait" : null, mutationsInSameTask: sameTask, atomic: e.atomic, relevant: e.relevant, frame: e.frame, atMs: e.t });
  }
  // text-less events (live attributes changed)
  const attrs = events.filter((e) => e.kind.startsWith("attribute"));
  let axNodes = null;
  if (ax) {
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Accessibility.enable");
      const tree = await cdp.send("Accessibility.getFullAXTree");
      axNodes = tree.nodes.filter((n) => (n.properties || []).some((p) => p.name === "live" && p.value.value !== "off")).map((n) => ({ role: n.role && n.role.value, ignored: !!n.ignored, ...Object.fromEntries((n.properties || []).filter((p) => /^(live|atomic|relevant|container-live|busy)$/.test(p.name)).map((p) => [p.name, p.value.value])) }));
    } catch (err) { axNodes = `unavailable: ${err.message}`; }
  }
  result = { url, steps: focusNotes, messages, attributeChanges: attrs.map((a) => ({ atMs: a.t, node: a.node, change: a.kind, value: a.text })), axLiveNodes: axNodes,
    caveat: "This shows what the browser exposes. Whether a screen reader speaks it needs a screen reader." };
} finally {
  await browser.close();
}

if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Page: ${result.url}`);
  for (const s of result.steps) console.log(`Step: ${s.step}. Focus: ${s.before} -> ${s.after}${s.movedToAnotherElement ? "  (moved to another element: a change of context, not a status message)" : ""}`);
  if (!result.messages.length) console.log("\nNo text change was recorded after the steps.");
  for (const m of result.messages) {
    console.log(`\n[${m.class}] "${m.text.slice(0, 80)}"`);
    console.log(`  region: ${m.region || "none"}${m.live ? ` (${m.live}, ${m.level})` : ""}  existed before: ${m.existedBeforeTheAction ? "yes" : "no"}  exposed to AT: ${m.exposedToAT ? "yes" : "no"}`);
    console.log(`  text stayed: ${typeof m.dwellMs === "number" ? `about ${m.dwellMs}ms, then it was removed or replaced` : m.dwellMs || "n/a"}  mutations in the same task: ${m.mutationsInSameTask}${m.atomic ? `  aria-atomic=${m.atomic}` : ""}${m.relevant ? `  aria-relevant=${m.relevant}` : ""}${m.frame !== "main" ? `  frame: ${m.frame}` : ""}`);
  }
  for (const a of result.attributeChanges) console.log(`\nLive attribute change at ${a.atMs}ms on ${a.node}: ${a.change} = ${a.value}`);
  if (result.axLiveNodes) console.log(`\nChromium accessibility tree, live nodes: ${JSON.stringify(result.axLiveNodes)}`);
  console.log(`\n${result.caveat}`);
}
