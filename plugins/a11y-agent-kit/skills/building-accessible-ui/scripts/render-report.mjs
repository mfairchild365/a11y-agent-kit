#!/usr/bin/env node
// Renders an accessibility audit report (Markdown, in the format of
// references/audit-report.template.md) as one self-contained HTML page.
//
// - No dependencies. Needs only Node.
// - Every image the report references is inlined as a data: URI, so the page works anywhere.
// - Each card's Evidence folds in a <details>; a table of contents links to every issue;
//   severity is shown as a word as well as a color; light and dark themes; reflows at 320px.
//
// Usage: node render-report.mjs <report.md> [out.html] [--open]
//   out.html defaults to report.html next to report.md.
//   --open  also opens the page in the default browser (skipped on CI and on a headless Linux box).
// Prints the output path and a file:// URL.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [mdPath, outArg] = args.filter((a) => !a.startsWith("--"));
if (!mdPath) {
  console.error("Usage: node render-report.mjs <report.md> [out.html] [--open]");
  process.exit(2);
}
const mdFile = path.resolve(mdPath);
const outFile = path.resolve(outArg || path.join(path.dirname(mdFile), "report.html"));
const baseDir = path.dirname(mdFile);
const lines = fs.readFileSync(mdFile, "utf8").replace(/\r\n/g, "\n").split("\n");

// ---------- inline ----------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
const missing = [];
function imageTag(alt, src) {
  const file = path.isAbsolute(src) ? src : path.join(baseDir, src);
  try {
    const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    return `<img src="data:${mime};base64,${fs.readFileSync(file).toString("base64")}" alt="${esc(alt)}">`;
  } catch {
    missing.push(src);
    return `<em>(screenshot not found: ${esc(src)})</em>`;
  }
}
function inline(text) {
  const keep = [];
  const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => hold(imageTag(alt, src.trim())));
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sevClass = (w) => `sev sev-${w.toLowerCase()}`;

// ---------- blocks ----------
const isTableLine = (l) => /^\s*\|/.test(l);
const bulletRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function parseList(start) {
  // returns { html, next }. A list is a run of bullet lines plus their indented continuation lines.
  const items = [];
  let i = start;
  const stack = []; // {indent, item}
  while (i < lines.length) {
    const l = lines[i];
    const m = l.match(bulletRe);
    if (m) {
      const indent = m[1].length;
      const item = { ordered: /\d/.test(m[2]), text: [m[3]], kids: [], indent };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (stack.length) stack[stack.length - 1].item.kids.push(item);
      else items.push(item);
      stack.push({ indent, item });
      i++;
    } else if (l.trim() && /^\s+\S/.test(l) && stack.length) {
      stack[stack.length - 1].item.text.push(l.trim());
      i++;
    } else if (!l.trim() && i + 1 < lines.length && (bulletRe.test(lines[i + 1]) || /^\s{2,}\S/.test(lines[i + 1])) && stack.length) {
      i++;
    } else break;
  }
  return { html: renderItems(items), next: i };
}
function renderItems(items) {
  if (!items.length) return "";
  const tag = items[0].ordered ? "ol" : "ul";
  return `<${tag}>${items.map(renderItem).join("")}</${tag}>`;
}
function renderItem(it) {
  const text = it.text.join(" ");
  if (/^\*\*Evidence:\*\*$/.test(text.trim()) && it.kids.length) {
    return `<li class="evidence"><details><summary>Evidence</summary>${renderItems(it.kids)}</details></li>`;
  }
  return `<li>${inline(text)}${it.kids.length ? renderItems(it.kids) : ""}</li>`;
}
function parseTable(start) {
  const rows = [];
  let i = start;
  while (i < lines.length && isTableLine(lines[i])) {
    rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    i++;
  }
  const head = rows[0];
  const body = rows.slice(/^\s*:?-+/.test((rows[1] || [""])[0]) ? 2 : 1);
  const html = `<table><thead><tr>${head.map((h) => `<th scope="col">${inline(h)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return { html, next: i };
}

let title = "Accessibility audit";
const toc = [];
const out = [];
let inArticle = false;
const closeArticle = () => { if (inArticle) { out.push("</article>"); inArticle = false; } };
const MAIN_SECTIONS = new Set(["minor issues", "best practices", "needs verification"]);

for (let i = 0; i < lines.length;) {
  const l = lines[i];
  let m;
  if (!l.trim()) { i++; continue; }
  if ((m = l.match(/^#\s+(.*)$/))) { title = m[1]; out.push(`<h1>${inline(m[1])}</h1>`); i++; continue; }
  if ((m = l.match(/^##\s+(.*)$/))) {
    closeArticle();
    const id = slug(m[1]);
    if (MAIN_SECTIONS.has(m[1].trim().toLowerCase())) toc.push({ id, label: m[1], level: 2 });
    out.push(`<h2 id="${id}">${inline(m[1])}</h2>`); i++; continue;
  }
  if ((m = l.match(/^###\s+(.*)$/))) { closeArticle(); out.push(`<h3>${inline(m[1])}</h3>`); i++; continue; }
  if ((m = l.match(/^####\s+(\d+)\.\s+(.*)$/))) {
    closeArticle();
    const n = m[1];
    const parts = m[2].split(" · ");
    const sev = /^(Blocker|Critical|Moderate|Minor)$/.test(parts[0]) ? parts[0] : "";
    const headline = sev ? `<span class="${sevClass(sev)}">${sev}</span> · ${inline(parts.slice(1).join(" · "))}` : inline(m[2]);
    const label = parts[parts.length - 1];
    toc.push({ id: `issue-${n}`, label: `${n}. ${label}`, level: 4, sev });
    out.push(`<article id="issue-${n}"><h4>${n}. ${headline}</h4>`);
    inArticle = true; i++; continue;
  }
  if (isTableLine(l)) { const t = parseTable(i); out.push(t.html); i = t.next; continue; }
  if (bulletRe.test(l)) { const t = parseList(i); out.push(t.html); i = t.next; continue; }
  // paragraph: gather until blank line or a block start
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !isTableLine(lines[i]) && !bulletRe.test(lines[i])) para.push(lines[i++].trim());
  out.push(`<p>${inline(para.join(" "))}</p>`);
}
closeArticle();

const tocHtml = toc.length
  ? `<nav aria-label="Issues in this report"><h2>Contents</h2><ul>${toc.map((t) => `<li><a href="#${t.id}">${inline(t.label)}</a>${t.sev ? ` <span class="${sevClass(t.sev)}">${t.sev}</span>` : ""}</li>`).join("")}</ul></nav>`
  : "";
// put the table of contents after the Summary section (before "Findings"), or at the top
let body = out.join("\n");
const findingsAt = body.indexOf('<h2 id="findings">');
body = findingsAt >= 0 ? body.slice(0, findingsAt) + tocHtml + "\n" + body.slice(findingsAt) : tocHtml + body;

const css = `:root{--bg:#fff;--fg:#1a1a1a;--muted:#595959;--line:#767676;--code:#f2f4f7;--link:#0b3d91;--blocker:#8a0000;--critical:#a40000;--moderate:#7a4a00;--minor:#2f4f2f}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#ececec;--muted:#b5b5b5;--line:#8c8c8c;--code:#222;--link:#8ab4ff;--blocker:#ff9e9e;--critical:#ff9e9e;--moderate:#ffd28a;--minor:#a9d8a9}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}
main{max-width:56rem;margin:0 auto;padding:1rem}h1{font-size:1.6rem;line-height:1.25}h2{margin-top:2rem;border-bottom:1px solid var(--line);padding-bottom:.25rem}h3{margin-top:1.5rem}
h4{font-size:1.05rem;margin:.25rem 0 .5rem}a{color:var(--link)}code{background:var(--code);padding:.05em .3em;border-radius:3px;overflow-wrap:anywhere}
article{border-top:1px solid var(--line);margin-top:1rem;padding-top:.5rem}img{max-width:100%;height:auto;border:1px solid var(--line);display:block;margin:.5rem 0}
table{border-collapse:collapse;width:100%;table-layout:auto}th,td{border:1px solid var(--line);padding:.3rem .5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.sev{font-weight:700}.sev-blocker{color:var(--blocker)}.sev-critical{color:var(--critical)}.sev-moderate{color:var(--moderate)}.sev-minor{color:var(--minor)}
details{margin:.25rem 0}summary{cursor:pointer;font-weight:600}li.evidence{list-style:none;margin-left:-1.25rem}nav ul{padding-left:1.25rem}
:focus-visible{outline:3px solid var(--link);outline-offset:2px}@media print{details{display:block}}`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.replace(/^Accessibility audit:\s*/i, "Audit: "))}</title><style>${css}</style></head>
<body><main>
${body}
</main></body></html>
`;
fs.writeFileSync(outFile, html);
console.log(`Report: ${outFile}`);
console.log(`URL: ${pathToFileURL(outFile).href}`);
if (missing.length) console.error(`Warning: ${missing.length} screenshot(s) not found: ${missing.join(", ")}`);

if (flags.has("--open")) {
  const headless = process.env.CI || (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY);
  if (headless) console.log("Not opened: no display.");
  else {
    const [cmd, cargs] = process.platform === "win32" ? ["cmd", ["/c", "start", "", outFile]] : process.platform === "darwin" ? ["open", [outFile]] : ["xdg-open", [outFile]];
    try { spawn(cmd, cargs, { detached: true, stdio: "ignore" }).on("error", () => {}).unref(); console.log("Opened in the default browser."); }
    catch { console.log("Could not open a browser."); }
  }
}
