# Toast / snackbar

A short message that appears over the page and usually goes away on its own. "Snackbar", "notification" and "growl" are the same pattern. Users miss toasts, so treat one as a courtesy, never the only place a message lives.

## Principles

Work down this list and stop at the first option that fits.

- **Is the message needed?** Skipping it is valid when the page already shows the result (the row moved, the count changed). Errors still need their own messages (3.3.1, 3.3.3).
- **Prefer an inline message or a static message region.** A visible, dismissible message near the change, or at the top of the view, can't time out and every user can find it.
- **A toast is supplementary.** Missing it must have no effect: the same information is also somewhere persistent (the changed item, a history, an inline message).
- **Anything that can vanish on a timer can be recovered.** Offer a history the user can reach (WCAG 2.2.1 accepts "an alternative that does not rely on a timer"). Pausing the timer on hover or focus helps, but users may not get there in time, so it is not the fix.
- **No actions in a toast.** Put Undo and other actions next to the affected item or in the history. A message with an action, several lines or several choices is a non-modal dialog or a message region, not a toast. Dismiss is the only control a toast holds.
- **The message type is in text.** "Success: …", "Error: …". A status icon that is the only carrier of the type gets a text alternative (1.1.1); an icon beside text that states the type is decorative. Icon and text meet contrast (`references/contrast.md`).

## Web implementation

### General defaults

- Announce it as a status message: follow `references/status-messages.md` (a `role="status"` region that exists at page load and is never hidden). `role="alert"` is for errors that need interrupting, not confirmations. For a kept history use `role="log"` so new entries are added at the end.
- Don't move focus to the toast. Don't rely on `popover` alone: it is not a live region and has no role.
- Dismiss is a real `button` with a name ("Dismiss notification"). Escape may also close it. After dismissing or undoing, put focus back at a logical place (the control that started the action), never on `<body>`.
- A message the user needs to read stays until dismissed, or has an adjustable or extendable timer. Short confirmations may time out only when the result is also visible elsewhere.
- Don't cover the focused control (2.4.11), keep it readable at 320px, and don't let it land on an open tooltip (it can dismiss the tooltip by accident).

### Minimal pattern

Archive a row: a text-only toast, Undo inline on the row, and a history list.

```html
<ul id="roster">
  <li id="row-priya"><span>Priya Rao</span> <button type="button" class="act">Archive</button></li>
</ul>
<div id="toasts" role="status"></div>
<section aria-labelledby="hist-h">
  <h2 id="hist-h">Recent activity</h2>
  <ul id="history"></ul>
</section>

<script>
  const row = document.getElementById('row-priya'), name = row.firstElementChild;
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
    dismiss.addEventListener('click', () => toast.remove());
    toast.append(dismiss);
    toasts.append(toast);
    setTimeout(() => toast.remove(), 8000);
  }
  row.addEventListener('click', (e) => {
    const btn = e.target.closest('.act');
    if (!btn) return;
    const archived = btn.textContent === 'Archive';
    btn.textContent = archived ? 'Undo archive' : 'Archive';
    name.textContent = archived ? 'Priya Rao (archived)' : 'Priya Rao';
    notify(archived ? 'Success: Priya Rao was archived.' : 'Success: Priya Rao was restored.');
    btn.focus();
  });
</script>
```

### Review checklist

- The same information is available without the toast (inline state or history), and the history is reachable by keyboard.
- Run `scripts/live-region-probe.mjs`: the region existed before the text, is exposed, and the dwell is known. Support varies by screen reader and browser (JAWS and Narrator treat all live regions as polite; none announce a hidden one), so name what was not tested with a real screen reader.
- No button other than Dismiss inside the live region; Undo is outside it.
- The type is stated in text; a hidden icon is only decoration.
- Nothing with an action, or that the user must read, disappears on a timer without an alternative.
- Focus after dismiss or undo lands somewhere logical.

### Pitfalls

- An Undo button inside the live region on a 5-second timer. Screen readers announce it as plain text with no button role, the user has to find it before it goes, and a keyboard user may never reach it.
- `aria-hidden` on the only thing that says "error" or "warning".
- Pause on hover or focus as the only fix for the timer.
- Inserting the region together with its text, or hiding its container with `display: none`.
- A toast for a validation error. Put the error next to the field and in a summary instead.

Background: Adrian Roselli, "Defining 'Toast' Messages" (adrianroselli.com/2020/01/defining-toast-messages.html); Scott O'Hara, "A toast to an accessible toast" (scottohara.me/blog/2019/07/08/a-toast-to-a11y-toasts.html).
