# Contrast

Thresholds and tokenization. Text ≥ 4.5:1; large text (≥ 24 px regular or ≥ 18.66 px bold) ≥ 3:1. Icons, state indicators, and focus indicators needed to understand or operate the UI ≥ 3:1. Check every interactive state (default, hover, active, focus, visited). Disabled (inactive) controls are exempt. Never rely on color alone.

A control's boundary needs 3:1 only when it is the sole visual cue that the control exists (e.g., an empty text input, a checkbox square). If the control has visible text or a sufficiently contrasting icon, its border is not required and not subject to 3:1. Focus indicators still must contrast. Best practice: delineate every control's boundary anyway to help users with cognitive disabilities recognize controls.

## Web implementation

### Tokens

- Follow existing styles and named tokens if available.
- Otherwise, define named tokens via CSS custom properties: `--color-bg`, `--color-text`, `--color-muted-text`, `--color-link`, `--color-border`, `--color-focus`, `--color-danger`, `--color-success`.
- Only assign UI colors via these tokens.
- Avoid alpha (`opacity`, `rgba`, `hsla`) for text and required UI boundaries if possible.

### Computing contrast

Don't judge contrast by eye. For every text/background pair, and for focus indicators, required icons, and required control boundaries against their neighbor:

1. Per sRGB channel, `c = value / 255`, then `c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`.
2. `L = 0.2126·R + 0.7152·G + 0.0722·B`.
3. Ratio = `(L_lighter + 0.05) / (L_darker + 0.05)`.

Or use a pair below (ratios computed with this formula). Muted text stays ≥ 4.5:1 on surfaces up to `#f2f4f7`.

| Use | Light | Dark |
|---|---|---|
| Body text | `#1a1a1a` on `#ffffff` (17.4) | `#f2f2f2` on `#121212` (16.7) |
| Muted text | `#595959` on `#ffffff` (7.0) | `#b3b3b3` on `#121212` (8.9) |
| Link | `#0b57b0` on `#ffffff` (7.0) | `#8ab4f8` on `#121212` (8.9) |
| Error text | `#b3261e` on `#ffffff` (6.5) | `#f2b8b5` on `#121212` (11.0) |
| Required boundary / focus ring / icon (≥ 3:1) | `#767676` on `#ffffff` (4.5) | `#8a8a8a` on `#121212` (5.4) |
| Text on filled button | `#ffffff` on `#0b57b0` (7.0) | `#121212` on `#8ab4f8` (8.9) |

## Quick checks

- [ ] Every text/background pair, focus indicator, and required icon or boundary was computed or taken from the table above, not judged by eye.
- [ ] Body text meets 4.5:1 against its background; large text (≥ 24 px regular or ≥ 18.66 px bold) meets 3:1.
- [ ] Focus indicators, meaningful icons, and state indicators meet 3:1 against adjacent colors. Control boundaries meet 3:1 when they are the only visual cue that the control exists.
- [ ] Hover, active, focus, and visited states all still meet their required contrast (disabled controls are exempt).
- [ ] Error / success / required / selected state is conveyed by more than color (text, icon + accessible name, shape, or position).
- [ ] UI colors come from named tokens / CSS custom properties, not ad-hoc hex values.
- [ ] No alpha (`rgba`, `opacity`) on text or required boundaries where it causes contrast to drift below threshold.
