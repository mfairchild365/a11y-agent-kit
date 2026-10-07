# Accessibility audit: Class roster (`audit_fixture/index.html`)

## Summary

- **Scope:** `index.html` and its dropdown. Out of scope: nothing else.
- **Verdict:** No Blockers. Keyboard users can't reach the student bubbles, and a contrast failure and an unnamed button make the overflow dropdown hard to use.
- **Findings:** Blocker 0, Critical 3, Moderate 3, Minor 2. 1 best practice. 1 more needs verification.
- **Checks:** axe, keyboard, hover, 320px reflow and contrast run; no screen reader.

| # | Offending element | WCAG SC | Severity |
|---|---|---|---|
| 1 | Tooltip | 1.4.13 | Moderate |

Fix first: do the first thing.

## Findings

### Element: Tooltip on the initials bubbles (AL, SO, PR)

Three initials-only bubbles that show the full name in a tooltip on hover. 3 instances.

#### 2. Moderate · 1.4.13 and 2.1.1 · 3 instances · High confidence · Tooltip can't be dismissed and vanishes when hovered

- **Summary:** The tooltip closes if the pointer moves onto it, can't be dismissed with Escape, and the bubbles also can't be reached by keyboard (2.1.1).
- **Why this severity:** Mouse and screen-magnifier users lose the name while trying to read it. The names are available in the dropdown, so the task survives.
- **Screenshot:** ![Finding 2: the AL bubble hovered with its "Ana Lee" tooltip showing, the three bubbles outlined](screenshots/finding-02-tooltip-hover.png)
  Text evidence: pressing Escape with the tooltip showing does not close it; moving onto the tip hides it.
- **Suggested fix:** Keep the tooltip open while the pointer is on the bubble or the tip (remove the 0.5rem gap), and close it on Escape.
- **Evidence:**
  - **WCAG SC:** 1.4.13 Content on Hover or Focus
  - **Status:** pre-existing
  - **Repro steps:**
    1. Hover the "AL" bubble: a tooltip appears.
    2. Press Escape: it stays.
    3. Move the pointer down to the tooltip: it disappears.
  - **Observed:** No Escape handling; a gap between the bubble and the tip hides it.
  - **Expected:** Dismissible, hoverable and persistent (1.4.13).
  - **Relevant elements:** `.bubble:hover .tip` for AL, SO and PR
  - **Confidence:** High. Reproduced in Edge with a mouse.
  - **Source:** browser check

### Element: "+5" button

The "+5" overflow button. 1 instance.

#### 3. Critical · 1.4.3 · 1 instances · High confidence · Hover and open state fails text contrast

- **Summary:** Blue #146eb3 text on the grey #d9dada hover fill is 3.83:1 for 12px text, below the 4.5:1 needed.
- **Why this severity:** Contrast failures are Critical in any state (calibration A). Low-vision users can't reliably read the label while it is hovered or open.
- **Screenshot:** ![Finding 3: the outlined "+5" button in its open and hover state, grey fill with blue text](screenshots/finding-03-more-contrast.png)
  Text evidence: axe `color-contrast` (serious): 3.83 (foreground #146eb3, background #d9dada, 12px).
- **Suggested fix:** Use a darker hover and open fill (for example white text on #146eb3) or a darker text color.
- **Evidence:**
  - **WCAG SC:** 1.4.3 Contrast (Minimum)
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` and click "+5" to open the dropdown.
    2. Run axe-core, or measure the button's colors.
  - **Observed:** axe reports 3.83:1 on `#more[aria-expanded=true]`.
  - **Expected:** At least 4.5:1 for normal text (1.4.3).
  - **Relevant elements:** `#more` in `:hover` and `[aria-expanded="true"]` states
  - **Confidence:** High. Computed from the rendered colors and confirmed by axe.
  - **Source:** axe `color-contrast` (serious), contrast calculation

### Element: Header decorative icon

#### 11. Minor · 1.1.1 · 1 instances · Medium confidence · Decorative icon is announced

- **Summary:** x

### Element: Close button

The icon-only close button in the dropdown. 1 instance.

#### 4. Critical · 4.1.2 · 1 instances · High confidence · Icon-only close button has no accessible name

- **Summary:** The close button contains only an `aria-hidden` icon, so a screen reader announces "button" with no purpose.
- **Why this severity:** An unnamed control that receives focus is Critical (calibration A): opening the dropdown moves focus onto it, and a screen reader user must guess what it does.
- **Screenshot:** ![Finding 4: the outlined X button at the top right of the dropdown](screenshots/finding-04-close-no-name.png)
  Text evidence: axe `button-name` (critical) on `#close`.
- **Suggested fix:** Add `aria-label="Close"`.
- **Evidence:**
  - **WCAG SC:** 4.1.2 Name, Role, Value
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html`, click "+5".
    2. Read the accessibility name of the button that takes focus, or run axe.
  - **Observed:** No accessible name; axe `button-name`.
  - **Expected:** Every button has an accessible name (4.1.2).
  - **Relevant elements:** `#close`
  - **Confidence:** High. Flagged by axe and confirmed in the accessibility tree.
  - **Source:** axe `button-name` (critical)

### Element: Student dropdown

The panel opened by "+5". 1 instance.

#### 5. Moderate · 1.4.10 · 1 instances · High confidence · Dropdown overflows at 320px

- **Summary:** The dropdown is a fixed 26rem wide and long names don't wrap, so the page scrolls sideways at 320px.
- **Why this severity:** Reflow failures are Moderate (calibration A). Users who zoom to 400% scroll in two directions but can still read everything.
- **Screenshot:** Text evidence: `document.documentElement.scrollWidth` is 466 at a 320px viewport.
- **Suggested fix:** Replace the fixed width with `max-width: 100%` and let names wrap (`white-space: normal; overflow-wrap: anywhere`).
- **Evidence:**
  - **WCAG SC:** 1.4.10 Reflow
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html` and click "+5".
    2. Resize the viewport to 320 CSS px wide.
  - **Observed:** Horizontal scrolling; names are clipped.
  - **Expected:** No two-dimensional scrolling at 320 CSS px (1.4.10).
  - **Relevant elements:** `#dd.dropdown`, `.dropdown li` (white-space: nowrap)
  - **Confidence:** High. Measured in the browser at 320px.
  - **Source:** browser check

### Element: Clickable "JD" bubble

The one clickable initials bubble. 1 instance.

#### 6. Moderate · 2.5.3 · 1 instances · Medium confidence · Accessible name doesn't contain the visible label

- **Summary:** The bubble shows "JD" but is named "John Doe", so a voice-control user saying "click JD" doesn't activate it.
- **Why this severity:** Label in Name mismatches are Moderate (calibration A). Voice-control users can still say the full name or use a numbered overlay.
- **Screenshot:** ![Finding 6: the outlined "JD" button in the roster; its accessible name is "John Doe"](screenshots/finding-06-label-in-name.png)
  Text evidence: accessibility tree: `button "John Doe": JD`.
- **Suggested fix:** Set `aria-label="JD, John Doe"`.
- **Evidence:**
  - **WCAG SC:** 2.5.3 Label in Name
  - **Status:** pre-existing
  - **Repro steps:**
    1. Open `index.html`.
    2. Read the accessibility tree for the "JD" button.
  - **Observed:** Name "John Doe", visible text "JD".
  - **Expected:** The accessible name starts with the visible label (2.5.3).
  - **Relevant elements:** `#jd`
  - **Confidence:** Medium. Clear from the accessibility tree; not tested with a voice-control product.
  - **Source:** browser check

## Minor issues

| # | Element | WCAG SC | Title | Suggested fix | Confidence |
|---|---|---|---|---|---|
| 7 | `ul` lists (roster and dropdown) | 1.3.1 | list-style: none drops list semantics in Safari | Add `role="list"` to both `<ul>` elements. | Medium |
| 12 | Initials bubbles | Best practice | Rated Minor: no prefers-reduced-motion block | Wrap the transition | High |

## Best practices

| # | Element | What | Suggested fix | Confidence |
|---|---|---|---|---|
| 8 | Initials bubbles | No prefers-reduced-motion block for the hover scale | Wrap the `transform` transition in `@media (prefers-reduced-motion: no-preference)`. | High |

Found that in Edge, the bubbles scale on hover; this is worth a closer look in a future pass and I noted it while checking the transform values across several viewport sizes in the browser, using both a mouse and emulated reduced motion, which I did not otherwise report anywhere in this document.

## Needs verification

| # | Element | WCAG SC | Suspected severity | Why suspected | Check that would confirm it |
|---|---|---|---|---|---|
| 9 | Status message | 4.1.3 | Minor | `#status` is cleared and refilled in the same tick. | Test with NVDA and VoiceOver whether the message is announced once. |

## Passed / not an issue

- The header icon is `aria-hidden` and decorative: correct.
- The "Add student" button is a native `<button>` whose name matches its label: correct.

## Needs manual testing

- Screen reader announcement of the status message (#9).
- Voice control on the "JD" bubble (#6).

## Extra notes

- Something.

## Out of scope

- Anything outside `index.html`.

The UI is fully accessible apart from the above.
