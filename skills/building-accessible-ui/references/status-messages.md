# Status messages (WCAG 4.1.3)

Announcing dynamic content changes (toasts, inline validation summaries, loading/progress, cart/count changes) to assistive tech without moving focus. WCAG defines a status message as a change in content that tells the user about the success or result of an action, the waiting state of an app, the progress of a process, or the existence of errors, and that doesn't change context. Because focus does not move, the user needs another channel (a live region or role) for the change to be perceivable. Keep messages short and specific; avoid duplicate announcements; do not announce *and* move focus — pick one. If a UI/component library provides an announcement primitive, prefer it.

## What counts

- **Removal can be the status message.** A spinner disappearing means "loaded"; an error clearing means "the field/form is now valid". Announce it ("Results loaded", "Email is valid") — a vanished element announces nothing on its own.
- **Brief loading still counts.** An unannounced spinner technically fails 4.1.3 even if it usually shows for a moment (low real-world impact when it truly is brief). Load time depends on server load, client load, and network, so never assume it's short — announce loading and its completion.

## Web implementation

- Choose politeness by urgency:
  - `role="status"` (implies `aria-live="polite"`, `aria-atomic="true"`) — success, progress, loading, counts, search results.
  - `role="alert"` (implies `aria-live="assertive"`, `aria-atomic="true"`) — errors and time-sensitive warnings only (validation summary without focus move, session expiry, destructive warnings).
  - Prefer the roles over raw `aria-live`; don't combine `role="alert"` with `aria-live="assertive"`.
- The live region must exist in the DOM *before* text is inserted, with its final politeness. Mutate the text, not the element or its `aria-live` value. In frameworks, render it on initial mount, not conditionally.
- Never hide a live region with `display: none` / `hidden` — use the `.sr-only` CSS in `keyboard-focus.md`.

### Single page announcer (best practice)

Many live regions on one page override and interrupt each other and are hard to manage. Prefer one visually hidden announcer rendered once at the end of `<body>`, plus a helper that queues messages at either politeness and clears the region after a short pause (so repeating the same message announces again). Extra regions are fine when justified — e.g., a component that owns its own persistent `role="alert"` error text.

```html
  <div class="sr-only">
    <div id="announce-polite" role="status"></div>
    <div id="announce-assertive" role="alert"></div>
  </div>
</body>
```

```js
const regions = {
  polite: document.getElementById('announce-polite'),
  assertive: document.getElementById('announce-assertive'),
};
const queue = [];
let busy = false;

export function announce(message, { politeness = 'polite' } = {}) {
  const item = { message, politeness };
  politeness === 'assertive' ? queue.unshift(item) : queue.push(item);
  if (!busy) next();
}

function next() {
  const item = queue.shift();
  if (!item) { busy = false; return; }
  busy = true;
  regions[item.politeness].textContent = item.message;
  setTimeout(() => {
    regions[item.politeness].textContent = '';
    setTimeout(next, 100);
  }, 1000);
}
```

### Many loading indicators (best practice)

When many regions load at once (micro-frontends, dashboards of widgets), don't announce per spinner. Aggregate into a few milestones through the announcer: "Content is loading" → optionally "Some content has loaded" → "All content has loaded". Spinner graphics stay `aria-hidden="true"`.

### Common mistakes

- **Inserting a new element with `role="status"` at the same time as its text.** Some AT will miss the announcement. Render the region empty first, then update its text.
- **Announcing on focus move.** If submit moves focus to an error summary heading, the heading is read by the focus change — don't also wrap it in `role="alert"`.
- **One live region per component.** Regions compete; messages get cut off or dropped. Route through the shared announcer.

## Quick checks

- [ ] Does the update happen without a focus change? If yes, it's announced via a live region.
- [ ] Is `status` used for routine updates and `alert` only for urgent ones?
- [ ] Is the live region in the DOM *before* the message text is inserted, with `aria-live` never toggled?
- [ ] Is the message concise, specific, and not duplicated (no identical repeat renders, no `role="alert"` + `aria-live="assertive"`)?
- [ ] Is loading announced regardless of expected duration, and is completion announced (not just the spinner disappearing)?
- [ ] When a removal conveys status (spinner gone, error cleared), is it announced?
- [ ] Do announcements go through one shared announcer unless a separate region is justified?
- [ ] With many concurrent loaders, are announcements aggregated into a few milestones?
- [ ] Does submitting a form with validation errors either (a) move focus to the summary/first invalid field, or (b) announce the error count via `role="alert"` — but not both?
