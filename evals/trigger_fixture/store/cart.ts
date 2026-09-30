export type Item = { id: string; qty: number };
export type State = { items: Item[] };

export function cartReducer(state: State, action: { type: string; item?: Item; id?: string }): State {
  switch (action.type) {
    case "add":
      return { ...state, items: [...state.items, action.item!] };
    case "remove":
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    default:
      return state;
  }
}
