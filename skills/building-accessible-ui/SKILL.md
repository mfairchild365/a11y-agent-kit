---
name: building-accessible-ui
description: MUST BE USED for UI work: creating or changing anything users see or operate (pages, forms, dialogs, menus, tables, color and style changes), reviewing UI code, and writing specs, plans, or acceptance criteria for UI features. Invoke this skill first, before writing code or planning the work. It encodes the accessibility (WCAG 2.2 AA) requirements every UI change must satisfy. Do not use for backend, data, build/CI, non-UI tests, or frontend logic that doesn't change what users see or operate.
---

# building-accessible-ui

Checklist for producing and reviewing accessible UIs. Each rule leads with the platform-agnostic principle and, where relevant, the Web (HTML + ARIA + CSS) implementation. Apply the web guidance only when the output is web.

Detailed rationale lives in `references/`; widget-specific guidance in `components/`. Every file opened and every line a tool prints stays in context, so don't preload or re-read.

## Accessibility constitution

Ground rules for resolving conflicts and deciding how much custom work is justified.

- **Core outcome.** A UI inaccessible to realistic users isn't done; treat accessibility like correctness, performance, and security. If scope must be cut, record the gap. Never claim "fully accessible": state what was addressed and known limitations.
- **Design for real users:** screen reader, keyboard-only, low-vision, cognitive, deaf/hard of hearing, motor/voice/switch, situational. If a decision breaks one, justify it and offer an alternative.
- **Implementation priority** (highest that fits): 1) existing accessible component in the codebase/design system, 2) component library, 3) native semantics, 4) native element + minimum ARIA, 5) custom ARIA widget only with full APG keyboard, focus, and state behavior. No ARIA beats bad ARIA. Don't duplicate native semantics, use `role="menu"` for site navigation, or invent a pattern when a standard one exists.
- **No trade-offs against accessibility.** Performance, security/privacy, and visual polish don't justify removing labels, focus, or semantic structure: redesign the optimization. Names must not leak secrets, so find a labeling approach that doesn't. Surface genuine conflicts.
- **Respect existing code.** Don't rewrite existing components or shared utilities just to improve them. Note out-of-scope issues (issue, affected users, fix) and ask before changing. Fix in place only when the task requires it and the change is localized and low-risk. Never silently remove existing affordances (labels, landmarks, focus management, live regions) without an equal-or-better replacement.

## How to use this checklist

First, what does the task produce?

- **UI code (new or changed):** work the checklist below.
- **A review of existing UI:** report issues (issue, affected users, suggested fix); don't rewrite. "Respect existing code" applies.
- **A plan or spec (no code yet):** write the accessibility contract into the spec or plan, in the project's existing format → `references/specs-documentation.md`. Don't write the implementation or run tests. Make each item concrete and verifiable, name the testing strategy, and list known limitations.

For code, open `components/<name>.md` once for each widget the output contains (form, checkbox group, radio group, disclosure, modal, full view). Open a `references/` file only for the checklist item you're implementing.

## Checklist

- **Prefer existing components.** If available, reuse existing UI components rather than creating new ones from scratch or custom implementations.
- **Platform-native semantics.** Prefer native platform controls and structures over custom constructs; add accessibility overrides only when a native control genuinely can't be used. → `references/structure.md`.
  - **Web:** Prefer semantic HTML (`<button>`, `<a>`, `<input>`, `<label>`, `<fieldset>`/`<legend>`, `<nav>`, `<main>`, `<header>`, `<footer>`, `<h1>`–`<h6>`) over `<div>`/`<span>` with ARIA. Use ARIA only when no native element fits.
- **Regions / landmarks.** View structure is exposed via semantic regions/landmarks; duplicated landmarks have unique accessible names.
  - **Web:** Exactly one `<main>`; `<header>`, `<nav>`, `<footer>` used when applicable.
- **Headings.** Logical outline labels sections without skipping levels; one top-level heading per view. → `references/structure.md`.
  - **Web:** One `<h1>`, typically the first heading in `<main>`. Set a descriptive `<title>`.
- **Bypass blocks on web pages.** Provide a mechanism to skip repeated navigation when delivering traditional web pages. (Not required for Electron or non-web surfaces.) → `references/keyboard-focus.md`.
  - **Web:** A "Skip to main content" link as the first focusable element
- **Name / role / value.** Every interactive element exposes an accurate accessible name; role matches purpose; dynamic states (pressed, expanded, selected, checked, disabled, invalid) stay in sync with visuals.
  - **Web:** Prefer native attributes over ARIA. If necessary, use the minimum ARIA needed and update state attributes alongside DOM/visual changes. `aria-label`/`aria-labelledby` only on elements that can take a name (controls, landmarks, `role="img"`), never on a plain `<div>`, `<span>`, or `<p>`.
- **Name-label match.** The accessible name of each interactive element contains the visible label text.
  - **Web:** If `aria-label` is used, include the visible label text. For multiple controls that share a label (e.g., "Remove"), add context ("Remove item: Socks").
- **Labels and help text.** Every form control has a programmatic label describing its purpose; help/error text is programmatically associated with its control. → `components/forms.md`.
  - **Web:** `<label for>` or wrapping `<label>`; never placeholder alone. Associate help/error via `aria-describedby` / `aria-errormessage`.
- **Grouping.** Related options (checkboxes, radios) are grouped so their shared name is part of the accessible name of each option. Group-level help/error text is associated with the group itself — not with each option and not with an intermediate wrapper.
  - **Web:** `<fieldset>` with a `<legend>`. Put `aria-describedby` on the `<fieldset>` (not on a child `<div>`, and never on an extra `<div role="group">` inside the fieldset — `<fieldset>` already is the group).
- **Required fields.** Marked both visually and programmatically; not indicated by color alone.
  - **Web:** Use an asterisk to indicate required fields. Native `required` on the control or `aria-required="true"`.
- **Keyboard operability.** Every interactive element is keyboard operable; tab order matches reading/visual order; expected keys work (activation, arrow keys inside composite widgets, Escape closes overlays); no keyboard traps; static content is not sequentially focusable.
  - **Web:** Do not remove focus outlines without equal-or-better replacement. Use `tabindex="-1"` only for elements that need programmatic (not sequential) focus. → `references/keyboard-focus.md`.
- **Focus management.** Focus is always visible. Overlays/dialogs/disclosures move focus appropriately and restore it on close; no focus traps outside modals.
- **Hidden content.** Content hidden from assistive technology is not focusable and is hidden consistently across visual, semantic, and focus layers.
  - **Web:** `hidden` / `display: none` / `aria-hidden="true"` used consistently. Nothing focusable inside `aria-hidden`.
- **Graphics.** Informative graphics have meaningful text alternatives; decorative graphics are hidden from AT. → `references/images-graphics.md`.
  - **Web:** `<img>` informative → `alt`; decorative → `alt=""`. Informative `<svg>` → `role="img"` + accessible name. Other decorative → `aria-hidden="true"`. 
- **Contrast.** Text ≥ 4.5:1 (3:1 large); focus indicators and key boundaries ≥ 3:1. Never color-only cues. Before finishing, list every text/background pair you used and compute its ratio (formula and vetted pairs in the reference); don't judge by eye. → `references/contrast-forced-colors.md`.
- **Respect OS accessibility settings.** Never override OS high contrast, reduced-motion, or color-scheme preferences; adapt to forced-colors / high-contrast. → `references/contrast-forced-colors.md`.
- **Reflow.** Content adapts to narrow viewports (target 320 CSS px) without two-dimensional scrolling for multi-line text; controls remain operable. → `references/reflow.md`.
- **Navigation.** Uses semantic navigation grouping with state-exposing toggles for expandable menus. → `references/navigation.md`.
  - **Web:** `<nav>`, not `role="menu"`; `aria-expanded` on triggers.
- **Tables / grids.** Static tabular data uses table semantics with header/cell associations; interactive grids only when truly warranted. → `references/tables-grids.md`.
- **Status messages.** Provide status messages for dynamic content updates that are relevant to the user (loading indicators, form submission results, etc.). → `references/status-messages.md`
  - **Web:** Use `aria-live="polite"` or `aria-live="assertive"`.
- **Testing.** Add and run automated accessibility tests unless the project explicitly opts out. Writing or configuring a test is not enough — execution, fixes, and a result report are part of the deliverable. **The final automated test run must be on the exact artifact you submit: any edit after a passing test invalidates that test, so re-run before submitting.** **Open `references/testing.md` before writing any test code** for the opt-out signals, strategy precedence, runtime probe order, and reporting rules.
  - **Web:** Prefer `@axe-core/*` bindings that match the existing test runner; render the component/page fully so interactive state, focus, and live regions are evaluated.
  - **Other platforms:** Use the platform's native audit (Android `AccessibilityChecks`, iOS `XCUIAccessibilityAudit`, .NET `AccessibilityInsights`) under the same precedence.
- **Specs/Documentation.** Follow the project's documentation pattern and document accessibility considerations for each view, component, and interaction. → `references/specs-documentation.md`.

