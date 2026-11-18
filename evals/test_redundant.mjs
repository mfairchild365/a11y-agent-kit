#!/usr/bin/env node
// Tests skills/building-accessible-ui/scripts/_redundant.mjs, the pure logic behind the redundant-ARIA checks
// in tree-pass.mjs: what counts as redundant and, as important, what does not. No browser needed.
// Usage: node evals/test_redundant.mjs   (exits 1 if any case behaves differently than expected)

import {
  descriptionRepeatsName, implicitRole, judgeElement, labelRepeatsText, namedRegionWithHeading, redundantAttrs,
  redundantName, redundantRole,
} from "../skills/building-accessible-ui/scripts/_redundant.mjs";

let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };
const el = (o = {}) => ({ selector: "#x", tag: "div", type: "", role: "", text: "", ...o });
const ids = (d) => judgeElement(d).map((f) => f.check).sort().join(",");

// ---- implicit roles
check("button, nav, main, aside, h2, table have implicit roles", ["button:button", "nav:navigation", "main:main", "aside:complementary", "h2:heading", "table:table"].every((p) => { const [t, r] = p.split(":"); return implicitRole(el({ tag: t })) === r; }));
check("a link has the link role only with an href", implicitRole(el({ tag: "a", href: true })) === "link" && implicitRole(el({ tag: "a", href: false })) === null);
check("a form or section is a landmark only when it has a name", implicitRole(el({ tag: "form", named: true })) === "form" && implicitRole(el({ tag: "form" })) === null && implicitRole(el({ tag: "section", named: true })) === "region" && implicitRole(el({ tag: "section" })) === null);
check("header and footer are banner and contentinfo only when not scoped", implicitRole(el({ tag: "header" })) === "banner" && implicitRole(el({ tag: "header", scoped: true })) === null && implicitRole(el({ tag: "footer" })) === "contentinfo" && implicitRole(el({ tag: "footer", scoped: true })) === null);
check("input roles follow the type", implicitRole(el({ tag: "input", type: "checkbox" })) === "checkbox" && implicitRole(el({ tag: "input", type: "radio" })) === "radio" && implicitRole(el({ tag: "input", type: "email" })) === "textbox" && implicitRole(el({ tag: "input", type: "submit" })) === "button" && implicitRole(el({ tag: "input", type: "range" })) === "slider");
check("an input with a datalist (list attribute) is left alone: its role is a combobox", implicitRole(el({ tag: "input", type: "text", hasList: true })) === null);
check("an img has a role only with alt text", implicitRole(el({ tag: "img", alt: "Logo" })) === "img" && implicitRole(el({ tag: "img", alt: "" })) === null);
check("an li is a listitem only inside a list", implicitRole(el({ tag: "li", inList: true })) === "listitem" && implicitRole(el({ tag: "li", inList: false })) === null);
check("a div and a span have no implicit role", implicitRole(el({ tag: "div" })) === null && implicitRole(el({ tag: "span" })) === null);

// ---- redundant-role
check("button role=button is redundant", redundantRole(el({ tag: "button", role: "button" })));
check("nav role=navigation is redundant", redundantRole(el({ tag: "nav", role: "navigation" })));
check("a[href] role=link is redundant", redundantRole(el({ tag: "a", href: true, role: "link" })));
check("main role=main and h2 role=heading are redundant", redundantRole(el({ tag: "main", role: "main" })) && redundantRole(el({ tag: "h2", role: "heading" })));
check("input type=checkbox role=checkbox is redundant", redundantRole(el({ tag: "input", type: "checkbox", role: "checkbox" })));
check("body-level header role=banner is redundant", redundantRole(el({ tag: "header", role: "banner" })));
check("a scoped header role=banner is not redundant (it needs the role to be a banner)", !redundantRole(el({ tag: "header", scoped: true, role: "banner" })));
check("a div role=button is not redundant", !redundantRole(el({ tag: "div", role: "button" })));
check("a different role is not redundant (a button that is a switch)", !redundantRole(el({ tag: "button", role: "switch" })));
check("svg role=img is not redundant", !redundantRole(el({ tag: "svg", role: "img" })));
check("an unnamed section role=region is not redundant: the role is what makes it a landmark", !redundantRole(el({ tag: "section", role: "region", named: false })));
check("a custom element role=button is not redundant", !redundantRole(el({ tag: "my-button", role: "button" })));
check("ul role=list on a list that keeps its markers is redundant", redundantRole(el({ tag: "ul", role: "list" })));
check("ul role=list on a list-style: none list is deliberate, not redundant", !redundantRole(el({ tag: "ul", role: "list", listStyleNone: true })));
check("li role=listitem in a list-style: none list is deliberate, not redundant", !redundantRole(el({ tag: "li", role: "listitem", inList: true, listStyleNone: true })));
check("no role attribute is never redundant", !redundantRole(el({ tag: "button", role: "" })));

// ---- redundant-aria-attr
const attrs = (o) => redundantAttrs(el(o)).join(",");
check("aria-required=true next to required is redundant", attrs({ tag: "input", type: "text", ariaRequired: "true", required: true }) === "aria-required");
check("aria-required=true without required is how you mark a custom control: not redundant", attrs({ tag: "input", type: "text", ariaRequired: "true", required: false }) === "");
check("aria-required=false next to required is a conflict, not redundancy", attrs({ tag: "input", type: "text", ariaRequired: "false", required: true }) === "");
check("aria-disabled=true next to disabled is redundant", attrs({ tag: "button", ariaDisabled: "true", disabled: true }) === "aria-disabled");
check("aria-disabled=true on a button that is not disabled is not redundant (a deliberate pattern)", attrs({ tag: "button", ariaDisabled: "true", disabled: false }) === "");
check("aria-readonly=true next to readonly is redundant", attrs({ tag: "input", type: "text", ariaReadonly: "true", readOnly: true }) === "aria-readonly");
check("aria-checked equal to a native checkbox's state is redundant; a different value is not", attrs({ tag: "input", type: "checkbox", ariaChecked: "true", checked: true }) === "aria-checked" && attrs({ tag: "input", type: "checkbox", ariaChecked: "false", checked: true }) === "");
check("aria-checked on a div role=checkbox is not redundant", attrs({ tag: "div", role: "checkbox", ariaChecked: "true" }) === "");
check("aria-level equal to the heading level is redundant; a different level is not", attrs({ tag: "h2", ariaLevel: "2" }) === "aria-level" && attrs({ tag: "h2", ariaLevel: "3" }) === "");
check("aria-level on a div role=heading is not redundant", attrs({ tag: "div", role: "heading", ariaLevel: "2" }) === "");
check("aria-hidden=true on a hidden or display:none element is redundant", attrs({ tag: "div", ariaHidden: "true", hiddenAttr: true }) === "aria-hidden" && attrs({ tag: "div", ariaHidden: "true", displayNone: true }) === "aria-hidden");
check("aria-hidden=true on a visible decorative icon is not redundant", attrs({ tag: "span", ariaHidden: "true" }) === "");
check("two redundant attributes on one element are both reported", attrs({ tag: "input", type: "text", ariaRequired: "true", required: true, ariaDisabled: "true", disabled: true }) === "aria-disabled,aria-required");

// ---- redundant-name
const name = (o) => redundantName(el({ tag: "button", ...o }));
check("aria-label equal to the button's text is redundant", name({ ariaLabel: "Save", text: "Save" }));
check("case, punctuation and spacing don't hide it", name({ ariaLabel: "save changes!", text: "Save  Changes" }));
check("aria-labelledby that resolves to the element's own text is redundant", name({ labelledbyText: "Save", text: "Save" }));
check("a label that adds context is not redundant (Remove item: Socks)", !name({ ariaLabel: "Remove item: Socks", text: "Remove" }));
check("a label on a control with no visible text (an icon button) is not redundant", !name({ ariaLabel: "Close", text: "" }));
check("a link with a repeated label is redundant too", redundantName(el({ tag: "a", href: true, ariaLabel: "Pricing", text: "Pricing" })));
check("a div role=button with a repeated label is redundant", redundantName(el({ tag: "div", role: "button", ariaLabel: "Save", text: "Save" })));
check("a role named from author, not content, is skipped (textbox label equal to its value)", !redundantName(el({ tag: "input", type: "text", ariaLabel: "Name", text: "Name" })));
check("labelRepeatsText ignores an empty label", !labelRepeatsText("", "") && !labelRepeatsText("  ", "x"));

// ---- description-repeats-name
check("a description equal to the name is redundant", descriptionRepeatsName("Delete", "delete."));
check("a description that adds information is not", !descriptionRepeatsName("Delete", "Delete this file permanently"));
check("an empty name or description is never redundant", !descriptionRepeatsName("", "") && !descriptionRepeatsName("Save", ""));

// ---- named-region-with-heading
check("a named section with a visible heading is reported", namedRegionWithHeading(el({ tag: "section", named: true, hasHeading: true })));
check("a role=region div with a name and heading is reported", namedRegionWithHeading(el({ tag: "div", role: "region", named: true, hasHeading: true })));
check("a named section with no heading is needed, not reported", !namedRegionWithHeading(el({ tag: "section", named: true, hasHeading: false })));
check("an unnamed section with a heading is not a landmark: fine", !namedRegionWithHeading(el({ tag: "section", named: false, hasHeading: true })));
check("a named nav with a heading is not reported: its name tells it from another nav", !namedRegionWithHeading(el({ tag: "nav", named: true, hasHeading: true })));

// ---- judgeElement
check("judgeElement reports one finding per problem", ids(el({ tag: "button", role: "button", ariaLabel: "Save", text: "Save" })) === "redundant-name,redundant-role");
check("judgeElement is quiet on clean markup", ids(el({ tag: "button", text: "Save" })) === "" && ids(el({ tag: "div", role: "button", ariaLabel: "Save changes", text: "Save" })) === "");
check("a finding's key is the selector, and an attribute finding adds the attribute", judgeElement(el({ selector: "#a", tag: "button", role: "button" }))[0].key === "#a" && judgeElement(el({ selector: "#b", tag: "input", type: "text", ariaRequired: "true", required: true }))[0].key === "#b[aria-required]");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
