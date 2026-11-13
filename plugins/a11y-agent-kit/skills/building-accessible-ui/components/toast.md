# Toast / snackbar

A short message that appears over the page and usually goes away on its own. "Snackbar", "notification" and "growl" are the same pattern. Users miss toasts, so treat one as a courtesy, never the only place a message lives.

## Principles

Work down this list and stop at the first option that fits.

- **Is the message needed?** Skipping it is valid when the page already shows the result (the row moved, the count changed). Errors still need their own messages (3.3.1, 3.3.3).
- **Prefer an inline message or a static message region.** A visible, dismissible message near the change, or at the top of the view, can't time out and every user can find it.
- **A toast is supplementary.** Missing it must have no effect: the same information is also somewhere persistent (the changed item, a history, an inline message).
- **Anything that can vanish on a timer can be recovered.** Offer a history the user can reach (WCAG 2.2.1 accepts "an alternative that does not rely on a timer"). Pausing the timer on hover or focus helps, but users may not get there in time, so it is not the fix.
- **No actions in a toast.** Put Undo and other actions next to the affected item or in the history. A message with an action, several lines or several choices is a non-modal dialog or a message region, not a toast. Dismiss is the only control a toast holds.
- **A toast with a title marks it up as a heading** (`<h2>` to `<h6>`, at the level that fits the outline), not bold text (1.3.1).
- **Show a change of state without rewriting a focused button's text.** Some screen readers don't announce inner text changes. Use `aria-pressed` or another state attribute, a separate status message, or move focus to a control whose name says the result.
- **The message type is in text.** "Success: …", "Error: …". A status icon that is the only carrier of the type gets a text alternative (1.1.1); an icon beside text that states the type is decorative. Icon and text meet contrast (`references/contrast.md`).

## Web implementation

### General defaults

- Announce it as a status message: follow `references/status-messages.md` (a `role="status"` region that exists at page load and is never hidden). `role="alert"` is for errors that need interrupting, not confirmations. The history is a heading and a plain list, not a live region: it is for finding messages again, and announcing each entry is noise.
- Don't move focus to the toast. Don't rely on `popover` alone: it is not a live region and has no role.
- Dismiss is a real `button` with a name ("Dismiss notification"). Escape may also close it. After dismissing or undoing, put focus back at a logical place (the control that started the action), never on `<body>`.
- A message the user needs to read stays until dismissed, or has an adjustable or extendable timer. Short confirmations may time out only when the result is also visible elsewhere.
- Don't name the history's wrapper (`aria-label` or `aria-labelledby` on a `section` or `role="region"`) when it already has a heading: screen reader users hear the name twice. Use a heading and a list.
- Don't cover the focused control (2.4.11), keep it readable at 320px, and don't let it land on an open tooltip (it can dismiss the tooltip by accident).

### Minimal pattern

Archive a row: a text-only toast, the Archive button doubles as the undo (pressing it again restores the row, and its text never changes), and a history list.

```html
<ul id="roster">
  <li><span id="name">Priya Rao</span> <button type="button" id="archive" aria-pressed="false">Archive</button></li>
</ul>
<div id="toasts" role="status"></div>
<div>
  <h2>Recent activity</h2>
  <ul id="history"></ul>
</div>

<script>
  const name = document.getElementById('name'), archive = document.getElementById('archive');
  const toasts = document.getElementById('toasts'), history = document.getElementById('history');
  function notify(text) {
    const li = document.createElement('li');
    li.textContent = text;
    history.prepend(li);
    const toast = document.createElement('p');
    toast.append(text + ' ');
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss notification';
    dismiss.addEventListener('click', () => { toast.remove(); archive.focus(); });
    toast.append(dismiss);
    toasts.append(toast);
    setTimeout(() => toast.remove(), 8000);
  }
  archive.addEventListener('click', () => {
    const archived = archive.getAttribute('aria-pressed') !== 'true';
    archive.setAttribute('aria-pressed', String(archived));
    name.textContent = archived ? 'Priya Rao (archived)' : 'Priya Rao';
    notify(archived ? 'Success: Priya Rao was archived.' : 'Success: Priya Rao was restored.');
  });
</script>
```

### Review checklist

- The same information is available without the toast (inline state or history), and the history is reachable by keyboard.
- Run `scripts/live-region-probe.mjs`: the region existed before the text, is exposed, and the dwell is known. Support varies by screen reader and browser (JAWS and Narrator treat all live regions as polite; none announce a hidden one), so name what was not tested with a real screen reader.
- No button other than Dismiss inside the live region; Undo is outside it.
- A toast title is a heading element. The history has a heading and no `aria-label` or `aria-labelledby` on its wrapper.
- No focused button changes its text to show a new state.
- The type is stated in text; a hidden icon is only decoration.
- Nothing with an action, or that the user must read, disappears on a timer without an alternative.
- Focus after dismiss or undo lands somewhere logical.

### Pitfalls

- An Undo button inside the live region on a 5-second timer. Screen readers announce it as plain text with no button role, the user has to find it before it goes, and a keyboard user may never reach it.
- `aria-hidden` on the only thing that says "error" or "warning".
- Pause on hover or focus as the only fix for the timer.
- Swapping the focused button's text ("Archive" to "Undo archive") to show what happened.
- Giving the history's `section` an accessible name as well as a heading.
- Bold text or a `<div>` as the toast's title.
- Inserting the region together with its text, or hiding its container with `display: none`.
- A toast for a validation error. Put the error next to the field and in a summary instead.
