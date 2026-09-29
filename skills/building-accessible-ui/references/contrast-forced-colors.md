# Contrast and forced colors

Thresholds, tokenization, and adapting to OS-enforced color schemes. Text ≥ 4.5:1; large text (≥ 24 px regular or ≥ 18.66 px bold) ≥ 3:1. Focus indicators and parts of non-text content required for understanding ≥ 3:1. Check every interactive state (default, hover, active, focus, visited). Never rely on color alone. Never override OS high-contrast / forced-colors settings.

## Web implementation

### Tokens

- Follow existing styles and named tokens if available.
- Otherwise, define named tokens via CSS custom properties: `--color-bg`, `--color-text`, `--color-muted-text`, `--color-link`, `--color-border`, `--color-focus`, `--color-danger`, `--color-success`.
- Only assign UI colors via these tokens.
- Avoid alpha (`opacity`, `rgba`, `hsla`) for text and primary UI boundaries if possible.

### Computing contrast

Don't judge contrast by eye. For every text/background pair, and for focus rings and control borders against their neighbor:

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
| Border / focus ring / icon (≥ 3:1) | `#767676` on `#ffffff` (4.5) | `#8a8a8a` on `#121212` (5.4) |
| Text on filled button | `#ffffff` on `#0b57b0` (7.0) | `#121212` on `#8ab4f8` (8.9) |

### Forced Colors mode

Use `@media (forced-colors: active)` only when the default adaptation is insufficient. Inside, use CSS system color keywords — not fixed hex/RGB:

- `ButtonText`, `ButtonBorder`, `ButtonFace`, `CanvasText`, `Canvas`, `LinkText`, `HighlightText`, `Highlight`.

Box shadows and decorative gradients are suppressed in forced colors. If using box-shadow for a focus ring, pair it with a transparent outline so something still renders:

```css
.btn:focus {
  box-shadow: 0 0 4px 3px rgba(90, 50, 200, .7);
  outline: 2px solid transparent;
}
```

Replace visual-only borders/shadows with system colors where needed:

```css
@media (forced-colors: active) {
  .button { border: 2px solid ButtonBorder; }
}
```

Do not use `forced-color-adjust: none` unless absolutely necessary. If you must, provide an accessible alternative that still works in forced colors.

### SVG icons

Icons should adapt to text color:

```css
svg { fill: currentColor; stroke: currentColor; }
```

Avoid embedding fixed fills inside the SVG source.

## Quick checks

- [ ] Every text/background pair, focus ring, and control border was computed or taken from the table above, not judged by eye.
- [ ] Body text meets 4.5:1 against its background; large text (≥ 24 px regular or ≥ 18.66 px bold) meets 3:1.
- [ ] Focus indicators and meaningful parts of non-text controls (icons, toggles, borders) meet 3:1 against adjacent colors.
- [ ] Hover, active, focus, visited, and disabled states all still meet their required contrast.
- [ ] Error / success / required / selected state is conveyed by more than color (text, icon + accessible name, shape, or position).
- [ ] UI colors come from named tokens / CSS custom properties, not ad-hoc hex values.
- [ ] No alpha (`rgba`, `opacity`) on text or critical borders where it causes contrast to drift below threshold.
- [ ] In Forced Colors mode, borders and focus rings still render (transparent `outline` paired with `box-shadow`; `system-color` keywords where needed).
- [ ] `forced-color-adjust: none` is not used unless there is a documented reason and an accessible alternative.
- [ ] SVG icons use `currentColor` and inherit text color; no hard-coded fills inside the SVG source.
