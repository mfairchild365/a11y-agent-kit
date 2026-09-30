# Tooltip and toggletip

Supplementary text attached to a control (tooltip), or an info button that reveals extra content (toggletip).

## Principles

- **Tooltip:** brief, plain-text description of a control that is already in the focus order. It appears on hover **and** keyboard focus, and is programmatically associated as the control's description.
- Tooltip content that appears on hover/focus is dismissible without moving pointer or focus (Escape), hoverable, and stays until dismissed or no longer relevant (WCAG 1.4.13).
- **Toggletip:** when the info trigger is its own control (an "i" or "?" button), it opens and closes its content on activation, like a disclosure — not on focus.
- Toggletip content sits directly after its trigger in reading order, so screen reader users can find it with the reading cursor and hear its semantics (paragraphs, lists, links).
- Tooltips hold no interactive content; if content needs links or buttons, it's a toggletip.

## Web implementation

### General defaults

- Don't use the `title` attribute as a tooltip: it usually doesn't scale with browser zoom and often never shows on touch devices.
- Tooltip: a separate element with `role="tooltip"`, referenced by `aria-describedby` on the control (`<button aria-describedby="save-tip">Save</button>`). Show on `mouseenter` and `focus`; hide on `mouseleave`/`blur` and Escape. Keep it visible while the pointer is over the tooltip itself.
- Toggletip: `<button type="button" aria-expanded="false">` whose accessible name says what it explains ("More info: billing cycle"). The panel is the button's next sibling, toggled with `hidden`. Follow `disclosure-widget.md` for state and focus; Escape closes and returns focus to the button.
- Don't reference toggletip content via `aria-describedby`: long or rich content becomes one flat, verbose string with no semantics or cursor navigation.

### Minimal pattern

Toggletip:

```html
<label for="cycle">Billing cycle</label>
<select id="cycle">…</select>
<button type="button" class="toggletip" aria-expanded="false" aria-label="More info: billing cycle">
  <svg aria-hidden="true" focusable="false">…</svg>
</button>
<div class="toggletip-panel">
  <p>You're billed on the same day each period.</p>
  <p><a href="/help/billing">How proration works</a></p>
</div>

<script>
  document.querySelectorAll('.toggletip').forEach((btn) => {
    const panel = btn.nextElementSibling;
    panel.hidden = true;
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    btn.parentElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); }
    });
  });
</script>
```

### Review checklist

- No `title` attribute used as the tooltip.
- Tooltips are on focusable controls, show on both hover and focus, are linked via `aria-describedby`, and have `role="tooltip"`.
- Hover/focus tooltips can be dismissed with Escape and don't vanish when the pointer moves onto them.
- Standalone info buttons are toggletips: activate to open, `aria-expanded` in sync, panel immediately follows the button in the DOM.
- The toggletip button's name identifies the topic, not just "Info".
- Interactive or multi-paragraph content lives only in toggletips, never in hover/focus tooltips.

### Pitfalls

- An "i" button that shows its tooltip on focus and references it via `aria-describedby`. It works most of the time, but screen reader users activate the button, hear silence, and assume it's broken; long content is read as one flat description; links inside it can't be reached.
- Rendering the toggletip panel in a portal at the end of `<body>` — the reading cursor can't find it next to the trigger.
- Tooltip that only appears on `mouseenter`, leaving keyboard and touch users without it.
