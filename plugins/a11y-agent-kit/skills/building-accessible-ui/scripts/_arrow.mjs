// Pure logic for arrow-walk.mjs: which keys a composite widget is expected to answer, and how to judge what
// happened when they were pressed. No browser, no page: the script reports what it saw and every decision is
// made here so it can be tested on its own.
//
// What it checks, and no more: that the arrow keys that move through the widget's items do move focus (or the
// aria-activedescendant), by one item, and stay inside the widget. It does not check Home and End, type-ahead,
// wrapping, whether selection follows focus, or what the items announce. Those stay manual.
//
// Findings, as ids "<check>@<widget selector>":
//   composite-not-focusable  2.1.1   the widget has items but none can take focus, and it has no
//                                    aria-activedescendant: the keyboard can't get in
//   arrow-nav-no-move        2.1.1   the key that should move to the next (or previous) item moved nothing
//   arrow-nav-leaves-widget  2.4.3   the key moved focus out of the widget
//   arrow-nav-wrong-order    2.4.3   focus moved inside the widget, but not to the next (or previous) item

export const ROLES = {
  tablist: { axis: "horizontal", orientable: true },
  toolbar: { axis: "horizontal", orientable: true },
  menubar: { axis: "horizontal", orientable: true },
  menu: { axis: "vertical", orientable: true },
  listbox: { axis: "vertical", orientable: true },
  tree: { axis: "vertical", orientable: true },
  radiogroup: { axis: "both", orientable: false },
  grid: { axis: "both", orientable: false, anyMove: true },
  treegrid: { axis: "both", orientable: false, anyMove: true },
};

// The keys that move to the next and previous item. For a widget that answers both axes, either key of a pair
// counts: a radio group answers Right and Down alike.
export function keysFor(role, orientation) {
  const def = ROLES[role];
  if (!def) return null;
  const axis = def.orientable && (orientation === "horizontal" || orientation === "vertical") ? orientation : def.axis;
  if (axis === "horizontal") return { axis, next: ["ArrowRight"], prev: ["ArrowLeft"] };
  if (axis === "vertical") return { axis, next: ["ArrowDown"], prev: ["ArrowUp"] };
  return { axis: "both", next: ["ArrowRight", "ArrowDown"], prev: ["ArrowLeft", "ArrowUp"] };
}

// w: what the page reported for one widget.
//   role, selector, items (how many), mode: "roving" | "activedescendant" | "none"
//   trials: [{ dir: "next" | "prev", from, to, moved, left }] one per key pair tried, where from and to are item
//           indexes (to is null when nothing in the widget has focus), moved is whether focus or the
//           activedescendant changed, and left is whether focus ended outside the widget
// Returns { verdict, findings } where verdict is one of: ok, not-focusable, no-move, leaves, wrong-order,
// too-few-items, unknown-role.
export function judgeWidget(w) {
  const def = ROLES[w.role];
  const finding = (check, criterion, extra = {}) => ({ id: `${check}@${w.selector}`, check, criterion, class: "candidate", element: w.selector, role: w.role, ...extra });
  if (!def) return { verdict: "unknown-role", findings: [] };
  if (w.items < 2) return { verdict: "too-few-items", findings: [] };
  if (w.mode === "none") return { verdict: "not-focusable", findings: [finding("composite-not-focusable", "2.1.1", { note: "Its items can't take focus and it has no aria-activedescendant. Confirm with the keyboard." })] };

  for (const t of w.trials) {
    if (t.left) return { verdict: "leaves", findings: [finding("arrow-nav-leaves-widget", "2.4.3", { key: t.key, dir: t.dir, note: "The arrow key moved focus out of the widget. Confirm with the keyboard." })] };
    if (!t.moved) return { verdict: "no-move", findings: [finding("arrow-nav-no-move", "2.1.1", { key: t.key, dir: t.dir, note: `Pressing ${t.key} moved nothing. Confirm with the keyboard.` })] };
    // from is null when nothing was active to start with (an activedescendant listbox): any first landing is fine.
    const expected = t.from === null ? null : t.dir === "next" ? t.from + 1 : t.from - 1;
    if (!def.anyMove && expected !== null && t.to !== null && t.to !== expected) {
      return { verdict: "wrong-order", findings: [finding("arrow-nav-wrong-order", "2.4.3", { key: t.key, dir: t.dir, from: t.from, to: t.to, expected, note: "Focus moved, but not to the neighbouring item. Confirm with the keyboard." })] };
    }
  }
  return { verdict: "ok", findings: [] };
}
