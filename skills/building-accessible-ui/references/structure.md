# Structure and semantics

Regions/landmarks, heading outline, and view title.

## Web implementation

### Landmarks

- Use `<header>`, `<nav>`, `<main>`, `<footer>` for their semantic roles. Avoid `role="banner"`, `role="navigation"`, `role="main"`, `role="contentinfo"` on generic elements unless a native landmark can't be used.
- Exactly one `<main>` per page. On multi-page sites, make `<main id="maincontent" tabindex="-1">` the bypass-block target.
- If multiple landmarks of the same kind exist (e.g., two `<nav>`), give each a unique accessible name via `aria-label` or `aria-labelledby`.
- Name a landmark only when the name tells it apart from another of the same kind. See "Redundant ARIA" for the named `<section>`.
- Complementary content uses `<aside>`. Search regions use `role="search"` on a `<form>` or a wrapping element.

### Redundant ARIA

ARIA that repeats what the markup or the visible text already says makes screen readers say things twice, and a copied label drifts away from the text after the next copy change. Leave it out:

- **A role the element already has:** `<button role="button">`, `<nav role="navigation">`, `<main role="main">`, `<a href role="link">`, `<h2 role="heading">`, `<input type="checkbox" role="checkbox">`, a body-level `<header role="banner">`. Put a landmark role on a generic element only when no native landmark element fits.
- **An `aria-*` that copies a native attribute:** `aria-required="true"` with `required`, `aria-disabled="true"` with `disabled`, `aria-readonly` with `readonly`, `aria-checked` on a native checkbox or radio, `aria-level` equal to the `<h1>`–`<h6>` level, `aria-hidden="true"` on an element that is already `hidden`.
- **A name that repeats the visible text:** `aria-label="Save"` on `<button>Save</button>`. Drop the label. Keep one only when it adds context ("Remove item: Socks").
- **A description that repeats the name:** `aria-describedby` pointing at text equal to the control's name.
- **A name on a section that already has a visible heading:** `<section aria-labelledby="h">` with the heading `h` inside. It becomes a landmark that screen readers announce next to the heading. An unnamed `<section>` isn't a landmark.
- **Not redundant:** `role="list"` on a list with `list-style: none` (it keeps list semantics in Safari with VoiceOver), `role="img"` on an `<svg>`, `role="region"` on an unnamed `<section>`, a `role` on a custom element, `aria-required` on a custom control, and names that tell apart two landmarks of one kind.

### Heading outline

- One `<h1>` per page, typically the first heading inside `<main>` describing the page topic.
- Do not skip levels (no `<h1>` → `<h3>`). Nest sections by level.
- Headings label sections of content, not decorative breaks. Do not use heading tags purely for styling.
- Visually hidden headings may label regions for AT; keep them short and descriptive.

### Page title

- Every document has a descriptive `<title>`. Prefer `Unique page — section — site` (most specific first).
- The title changes when the primary content changes (including in single-page apps).

## Quick checks

- [ ] Major regions use native landmarks: `<header>`, `<nav>`, `<main>`, `<footer>` (and `<aside>` / `role="search"` when applicable).
- [ ] Exactly one `<main>` per view.
- [ ] Duplicated landmarks (e.g., multiple `<nav>`) each have a unique accessible name via `aria-label` or `aria-labelledby`.
- [ ] Sections that have a visible heading aren't also given `aria-label` or `aria-labelledby`.
- [ ] No redundant ARIA: no role the element already has, no `aria-*` that copies a native attribute, no `aria-label` or description that repeats the text or name.
- [ ] Exactly one `<h1>` per view, describing the view topic.
- [ ] Heading levels are nested and never skipped (no `<h1>` → `<h3>`).
- [ ] Headings are used for sections of content, not for visual styling of decorative text.
- [ ] Every document has a descriptive, unique `<title>`; in SPAs, the title updates on primary navigation changes.
- [ ] Visually hidden headings used to label regions are short and descriptive.
- [ ] The view can be understood using only landmarks and headings (the outline isn't too flat or too noisy).
