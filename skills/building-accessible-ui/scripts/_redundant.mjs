// Pure logic for the redundant-ARIA checks in tree-pass.mjs, plus the one function that reads the page.
// "Redundant" means the ARIA says what the markup or the visible text already says. It is never a WCAG
// failure: it is a Best practice, because it makes assistive technology repeat itself and a copied label
// drifts away from the text it copied. A value that disagrees with the native state is a conflict, not
// redundancy, and is left for axe and the reviewer.
//
// Findings, as ids "<check>@<key>":
//   redundant-role          an explicit role equal to the element's implicit role (<button role="button">)
//   redundant-aria-attr     an aria-* that copies a native attribute (aria-required="true" next to required)
//   redundant-name          an aria-label (or aria-labelledby) equal to the element's own visible text
//   named-region-with-heading  a region given a name while it already has a visible heading
// (description-repeats-name reads the accessibility tree, so tree-pass.mjs checks it with descriptionRepeatsName.)

export const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

// Roles whose accessible name is built from their content, so a label equal to the text adds nothing.
const NAMED_BY_TEXT = new Set(["button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "switch"]);

const INPUT_ROLE = {
  checkbox: "checkbox", radio: "radio", button: "button", submit: "button", reset: "button", image: "button",
  search: "searchbox", number: "spinbutton", range: "slider",
  text: "textbox", email: "textbox", tel: "textbox", url: "textbox", "": "textbox",
};

// The role the element has with no role attribute, or null when it has none or it depends on something this
// check can't settle (so it never calls a role redundant by guessing).
export function implicitRole(d) {
  const tag = d.tag;
  if (tag === "button") return "button";
  if (tag === "a") return d.href ? "link" : null;
  if (tag === "nav") return "navigation";
  if (tag === "main") return "main";
  if (tag === "aside") return "complementary";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "table") return "table";
  if (tag === "ul" || tag === "ol" || tag === "menu") return "list";
  if (tag === "li") return d.inList ? "listitem" : null;
  if (tag === "form") return d.named ? "form" : null;
  if (tag === "section") return d.named ? "region" : null;
  if (tag === "img") return d.alt ? "img" : null;
  if (tag === "textarea") return "textbox";
  if (tag === "hr") return "separator";
  if (tag === "article") return "article";
  if (tag === "dialog") return "dialog";
  if (tag === "fieldset") return "group";
  if (tag === "progress") return "progressbar";
  if (tag === "header") return d.scoped ? null : "banner";
  if (tag === "footer") return d.scoped ? null : "contentinfo";
  if (tag === "input") return d.hasList ? null : INPUT_ROLE[d.type || ""] || null;
  return null;
}

// A list that has list-style: none and role="list" is a deliberate fix (Safari with VoiceOver drops list
// semantics from unstyled lists), so it is not redundant.
function deliberateList(d, role) {
  return d.listStyleNone && (role === "list" || role === "listitem");
}

export function redundantRole(d) {
  if (!d.role) return false;
  const implicit = implicitRole(d);
  return !!implicit && d.role === implicit && !deliberateList(d, d.role);
}

// Only values that agree with the native state count; "aria-required=false" next to required is a conflict.
export function redundantAttrs(d) {
  const out = [];
  const on = (v) => v === "true";
  const native = !!(d.tag && /^(button|input|select|textarea|fieldset)$/.test(d.tag));
  if (native && on(d.ariaDisabled) && d.disabled) out.push("aria-disabled");
  if (native && on(d.ariaRequired) && d.required) out.push("aria-required");
  if (native && on(d.ariaReadonly) && d.readOnly) out.push("aria-readonly");
  if (d.tag === "input" && /^(checkbox|radio)$/.test(d.type) && d.ariaChecked != null && d.ariaChecked === String(!!d.checked)) out.push("aria-checked");
  if (/^h[1-6]$/.test(d.tag) && d.ariaLevel != null && Number(d.ariaLevel) === Number(d.tag[1])) out.push("aria-level");
  if (d.ariaHidden === "true" && (d.hiddenAttr || d.displayNone)) out.push("aria-hidden");
  return out;
}

export function labelRepeatsText(label, text) {
  const l = norm(label);
  return !!l && l === norm(text);
}

export function redundantName(d) {
  const role = d.role || implicitRole(d);
  if (!NAMED_BY_TEXT.has(role)) return false;
  return labelRepeatsText(d.ariaLabel, d.text) || labelRepeatsText(d.labelledbyText, d.text);
}

export function descriptionRepeatsName(name, description) {
  const n = norm(name);
  return !!n && n === norm(description);
}

export function namedRegionWithHeading(d) {
  const isRegion = d.role === "region" || (!d.role && d.tag === "section");
  return isRegion && !!d.named && !!d.hasHeading;
}

// Every finding for one described element, as { check, key }.
export function judgeElement(d) {
  const out = [];
  if (redundantRole(d)) out.push({ check: "redundant-role", key: d.selector, role: d.role });
  for (const attr of redundantAttrs(d)) out.push({ check: "redundant-aria-attr", key: `${d.selector}[${attr}]`, attr });
  if (redundantName(d)) out.push({ check: "redundant-name", key: d.selector, name: d.ariaLabel || d.labelledbyText, text: d.text });
  if (namedRegionWithHeading(d)) out.push({ check: "named-region-with-heading", key: d.selector });
  return out;
}

// ---- runs inside the page: one plain description per element that carries ARIA --------------------------
// Walks open shadow roots and same-origin frames. Hidden elements are skipped, except that aria-hidden on an
// already-hidden element is the thing to report, so those are described too. It stops at `limit` described
// elements and says so (capped), the same cap tree-pass puts on the tree.
export function collectDescriptions(makeSelector, limit) {
  const selector = makeSelector();
  const out = [];
  let capped = false;
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true }) : el.getClientRects().length > 0);
  const ARIA = ["aria-label", "aria-labelledby", "aria-disabled", "aria-required", "aria-readonly", "aria-checked", "aria-level", "aria-hidden"];
  const text = (el) => (el.localName === "input" && /^(button|submit|reset)$/i.test(el.type) ? el.value : (el.innerText != null ? el.innerText : el.textContent || "")).trim();
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (capped) return;
      if (el.shadowRoot) walk(el.shadowRoot);
      if (/^i?frame$/.test(el.localName)) { try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ } }
      if (!el.hasAttribute("role") && !ARIA.some((a) => el.hasAttribute(a))) continue;
      const style = getComputedStyle(el);
      const hiddenAttr = el.hasAttribute("hidden");
      const displayNone = style.display === "none";
      if (!visible(el) && !(el.getAttribute("aria-hidden") === "true" && (hiddenAttr || displayNone))) continue;
      if (el.closest("[inert]")) continue;
      const rootNode = el.getRootNode();
      const byId = (id) => (rootNode.getElementById ? rootNode.getElementById(id) : null);
      const labelledbyText = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map(byId).filter(Boolean).map((n) => n.textContent).join(" ").trim();
      const ariaLabel = (el.getAttribute("aria-label") || "").trim();
      const parent = el.parentElement;
      const listParent = el.localName === "li" ? parent : el;
      if (out.length >= limit) { capped = true; return; }
      out.push({
        selector: selector(el),
        tag: el.localName,
        type: el.localName === "input" ? (el.getAttribute("type") || "").toLowerCase() : "",
        hasList: el.localName === "input" && el.hasAttribute("list"),
        role: (el.getAttribute("role") || "").trim().split(/\s+/)[0].toLowerCase(),
        href: el.localName === "a" && el.hasAttribute("href"),
        alt: el.localName === "img" ? el.getAttribute("alt") || "" : null,
        inList: !!parent && /^(ul|ol|menu)$/.test(parent.localName),
        listStyleNone: !!listParent && /^(ul|ol|menu)$/.test(listParent.localName) && getComputedStyle(listParent).listStyleType === "none",
        scoped: !!el.closest("article, aside, main, nav, section, [role=article], [role=complementary], [role=main], [role=navigation], [role=region]"),
        named: !!ariaLabel || !!labelledbyText,
        ariaLabel,
        labelledbyText,
        text: text(el),
        ariaDisabled: el.getAttribute("aria-disabled"),
        ariaRequired: el.getAttribute("aria-required"),
        ariaReadonly: el.getAttribute("aria-readonly"),
        ariaChecked: el.getAttribute("aria-checked"),
        ariaLevel: el.getAttribute("aria-level"),
        ariaHidden: el.getAttribute("aria-hidden"),
        disabled: el.disabled === true,
        required: el.required === true,
        readOnly: el.readOnly === true,
        checked: el.checked === true,
        hiddenAttr,
        displayNone,
        hasHeading: [...el.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")].some(visible),
      });
    }
  };
  walk(document);
  return { items: out, capped };
}
